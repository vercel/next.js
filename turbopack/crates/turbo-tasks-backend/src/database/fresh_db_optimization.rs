use std::{
    borrow::Cow,
    fs,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

use anyhow::Result;

use crate::database::key_value_database::{KeySpace, KeyValueDatabase, WriteBatch};

pub fn is_fresh(path: &Path) -> bool {
    fs::exists(path).map_or(false, |exists| !exists)
}

pub struct FreshDbOptimization<T: KeyValueDatabase> {
    database: T,
    fresh_db: AtomicBool,
}

impl<T: KeyValueDatabase> FreshDbOptimization<T> {
    pub fn new(database: T, fresh_db: bool) -> Self {
        Self {
            database,
            fresh_db: AtomicBool::new(fresh_db),
        }
    }
}

impl<T: KeyValueDatabase> KeyValueDatabase for FreshDbOptimization<T> {
    type ReadTransaction<'l>
        = T::ReadTransaction<'l>
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        T::lower_read_transaction(tx)
    }

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>> {
        self.database.begin_read_transaction()
    }

    type ValueBuffer<'l>
        = T::ValueBuffer<'l>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: super::key_value_database::KeySpace,
        key: &[u8],
    ) -> anyhow::Result<Option<Self::ValueBuffer<'l>>> {
        if self.fresh_db.load(Ordering::Acquire) {
            // Performance optimization when the database was empty
            // It's assumed that no cache entries are removed from the memory cache, but we
            // might change that in future.
            return Ok(None);
        }
        self.database.get(transaction, key_space, key)
    }

    type WriteBatch<'l>
        = FreshDbOptimizationWriteBatch<'l, T>
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(FreshDbOptimizationWriteBatch {
            write_batch: self.database.write_batch()?,
            fresh_db: &self.fresh_db,
        })
    }
}

pub struct FreshDbOptimizationWriteBatch<'a, T: KeyValueDatabase>
where
    T: 'a,
{
    write_batch: T::WriteBatch<'a>,
    fresh_db: &'a AtomicBool,
}

impl<'a, T: KeyValueDatabase> WriteBatch<'a> for FreshDbOptimizationWriteBatch<'a, T>
where
    T: 'a,
{
    type ValueBuffer<'l>
        = <T::WriteBatch<'a> as WriteBatch<'a>>::ValueBuffer<'l>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.write_batch.get(key_space, key)
    }

    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }

    fn commit(self) -> Result<()> {
        self.fresh_db.store(false, Ordering::Release);
        self.write_batch.commit()
    }
}
