use std::{borrow::Cow, path::Path};

use anyhow::Result;
use turbo_persistence::{ArcSlice, TurboPersistence};

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, WriteBatch},
};

pub struct TurboKeyValueDatabase {
    db: TurboPersistence,
}

impl TurboKeyValueDatabase {
    pub fn new(path: &Path) -> Result<Self> {
        Ok(Self {
            db: TurboPersistence::open(path.to_path_buf())?,
        })
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
        self.db.get(&(key, key_space as u8))
    }

    type ConcurrentWriteBatch<'l>
        = TurboWriteBatch<'l>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(WriteBatch::concurrent(TurboWriteBatch {
            batch: self.db.write_batch()?,
            db: &self.db,
        }))
    }
}

pub struct TurboWriteBatch<'a> {
    batch: turbo_persistence::WriteBatch<(Vec<u8>, u8)>,
    db: &'a TurboPersistence,
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
        self.db.get(&(key, key_space as u8))
    }

    fn commit(self) -> Result<()> {
        self.db.commit_write_batch(self.batch)
    }
}

impl<'a> ConcurrentWriteBatch<'a> for TurboWriteBatch<'a> {
    fn put(&self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        self.batch.put((key.into_owned(), key_space as u8), value)
    }

    fn delete(&self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        self.batch.delete((key.into_owned(), key_space as u8))
    }
}
