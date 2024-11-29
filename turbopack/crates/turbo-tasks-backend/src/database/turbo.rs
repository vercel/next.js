use std::{
    borrow::Cow,
    path::PathBuf,
    sync::Arc,
    thread::{spawn, JoinHandle},
};

use anyhow::Result;
use parking_lot::Mutex;
use turbo_persistence::{ArcSlice, TurboPersistence};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, WriteBatch},
};

const COMPACT_MAX_COVERAGE: f32 = 20.0;
const COMPACT_MAX_MERGE_SEQUENCE: usize = 8;

pub struct TurboKeyValueDatabase {
    db: Arc<TurboPersistence>,
    compact_join_handle: Mutex<Option<JoinHandle<Result<()>>>>,
}

impl TurboKeyValueDatabase {
    pub fn new(path: PathBuf) -> Result<Self> {
        let db = Arc::new(TurboPersistence::open(path.to_path_buf())?);
        let mut this = Self {
            db: db.clone(),
            compact_join_handle: Mutex::new(None),
        };
        // start compaction in background if the database is not empty
        if !db.is_empty() {
            let handle =
                spawn(move || db.compact(COMPACT_MAX_COVERAGE, COMPACT_MAX_MERGE_SEQUENCE));
            this.compact_join_handle.get_mut().replace(handle);
        }
        Ok(this)
    }
}

impl KeyValueDatabase for TurboKeyValueDatabase {
    type ReadTransaction<'l>
        = ()
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        tx
    }

    fn is_empty(&self) -> bool {
        self.db.is_empty()
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        Ok(())
    }

    type ValueBuffer<'l>
        = ArcSlice<u8>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        self.db.get(key_space as usize, &key)
    }

    type ConcurrentWriteBatch<'l>
        = TurboWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        // Wait for the compaction to finish
        if let Some(join_handle) = self.compact_join_handle.lock().take() {
            join_handle.join().unwrap()?;
        }
        // Start a new write batch
        Ok(WriteBatch::concurrent(TurboWriteBatch {
            batch: self.db.write_batch()?,
            db: &self.db,
            compact_join_handle: &self.compact_join_handle,
        }))
    }

    fn shutdown(&self) -> Result<()> {
        // Wait for the compaction to finish
        if let Some(join_handle) = self.compact_join_handle.lock().take() {
            join_handle.join().unwrap()?;
        }
        // Shutdown the database
        self.db.shutdown()
    }
}

pub struct TurboWriteBatch<'a> {
    batch: turbo_persistence::WriteBatch<Vec<u8>, 5>,
    db: &'a Arc<TurboPersistence>,
    compact_join_handle: &'a Mutex<Option<JoinHandle<Result<()>>>>,
}

impl<'a> BaseWriteBatch<'a> for TurboWriteBatch<'a> {
    type ValueBuffer<'l>
        = ArcSlice<u8>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.db.get(key_space as usize, &key)
    }

    fn commit(self) -> Result<()> {
        // Commit the write batch
        self.db.commit_write_batch(self.batch)?;

        // Start a new compaction in the background
        let db = self.db.clone();
        let handle = spawn(move || db.compact(COMPACT_MAX_COVERAGE, COMPACT_MAX_MERGE_SEQUENCE));
        self.compact_join_handle.lock().replace(handle);

        Ok(())
    }
}

impl<'a> ConcurrentWriteBatch<'a> for TurboWriteBatch<'a> {
    fn put(&self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        self.batch.put(key_space as usize, key.into_owned(), value)
    }

    fn delete(&self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        self.batch.delete(key_space as usize, key.into_owned())
    }
}
