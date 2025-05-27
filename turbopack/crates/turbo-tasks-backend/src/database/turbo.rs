use std::{
    path::PathBuf,
    sync::Arc,
    thread::{JoinHandle, spawn},
};

use anyhow::Result;
use parking_lot::Mutex;
use turbo_persistence::{ArcSlice, KeyBase, StoreKey, TurboPersistence, ValueBuffer};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, WriteBatch, WriteBuffer},
};

const COMPACT_MAX_COVERAGE: f32 = 20.0;
const COMPACT_MAX_MERGE_SEQUENCE: usize = 64;
const COMPACT_MAX_MERGE_SIZE: usize = 512 * 1024 * 1024; // 512 MiB

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
            let handle = spawn(move || {
                db.compact(
                    COMPACT_MAX_COVERAGE,
                    COMPACT_MAX_MERGE_SEQUENCE,
                    COMPACT_MAX_MERGE_SIZE,
                )
            });
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
            initial_write: self.db.is_empty(),
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
    batch: turbo_persistence::WriteBatch<WriteBuffer<'static>, 7>,
    db: &'a Arc<TurboPersistence>,
    compact_join_handle: &'a Mutex<Option<JoinHandle<Result<()>>>>,
    initial_write: bool,
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

        if !self.initial_write {
            // Start a new compaction in the background
            let db = self.db.clone();
            let handle = spawn(move || {
                db.compact(
                    COMPACT_MAX_COVERAGE,
                    COMPACT_MAX_MERGE_SEQUENCE,
                    COMPACT_MAX_MERGE_SIZE,
                )
            });
            self.compact_join_handle.lock().replace(handle);
        }

        Ok(())
    }
}

impl<'a> ConcurrentWriteBatch<'a> for TurboWriteBatch<'a> {
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()> {
        self.batch
            .put(key_space as u32, key.into_static(), value.into())
    }

    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.batch.delete(key_space as u32, key.into_static())
    }

    unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
        unsafe { self.batch.flush(key_space as u32) }
    }
}

impl KeyBase for WriteBuffer<'_> {
    fn len(&self) -> usize {
        (**self).len()
    }

    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        for item in &**self {
            state.write_u8(*item);
        }
    }
}

impl StoreKey for WriteBuffer<'_> {
    fn write_to(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(self);
    }
}

impl PartialEq for WriteBuffer<'_> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl Eq for WriteBuffer<'_> {}

impl Ord for WriteBuffer<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (**self).cmp(&**other)
    }
}

impl PartialOrd for WriteBuffer<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<'l> From<WriteBuffer<'l>> for ValueBuffer<'l> {
    fn from(val: WriteBuffer<'l>) -> Self {
        match val {
            WriteBuffer::Borrowed(b) => ValueBuffer::Borrowed(b),
            WriteBuffer::Vec(v) => ValueBuffer::Vec(v),
            WriteBuffer::SmallVec(sv) => ValueBuffer::SmallVec(sv),
        }
    }
}
