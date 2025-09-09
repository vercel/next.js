use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

use anyhow::Result;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{
        BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBuffer,
    },
};

pub fn is_fresh(path: &Path) -> bool {
    fs::exists(path).is_ok_and(|exists| !exists)
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

    fn is_empty(&self) -> bool {
        self.fresh_db.load(Ordering::Acquire) || self.database.is_empty()
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

    type SerialWriteBatch<'l>
        = FreshDbOptimizationWriteBatch<'l, T::SerialWriteBatch<'l>>
    where
        Self: 'l;

    type ConcurrentWriteBatch<'l>
        = FreshDbOptimizationWriteBatch<'l, T::ConcurrentWriteBatch<'l>>
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(match self.database.write_batch()? {
            WriteBatch::Serial(write_batch) => WriteBatch::serial(FreshDbOptimizationWriteBatch {
                write_batch,
                fresh_db: &self.fresh_db,
            }),
            WriteBatch::Concurrent(write_batch, _) => {
                WriteBatch::concurrent(FreshDbOptimizationWriteBatch {
                    write_batch,
                    fresh_db: &self.fresh_db,
                })
            }
        })
    }
}

pub struct FreshDbOptimizationWriteBatch<'a, B> {
    write_batch: B,
    fresh_db: &'a AtomicBool,
}

impl<'a, B: BaseWriteBatch<'a>> BaseWriteBatch<'a> for FreshDbOptimizationWriteBatch<'a, B> {
    type ValueBuffer<'l>
        = B::ValueBuffer<'l>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        self.write_batch.get(key_space, key)
    }

    fn commit(self) -> Result<()> {
        self.fresh_db.store(false, Ordering::Release);
        self.write_batch.commit()
    }
}

impl<'a, B: SerialWriteBatch<'a>> SerialWriteBatch<'a> for FreshDbOptimizationWriteBatch<'a, B> {
    fn put(
        &mut self,
        key_space: KeySpace,
        key: WriteBuffer<'_>,
        value: WriteBuffer<'_>,
    ) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }

    fn delete(&mut self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }

    fn flush(&mut self, key_space: KeySpace) -> Result<()> {
        self.write_batch.flush(key_space)
    }
}

impl<'a, B: ConcurrentWriteBatch<'a>> ConcurrentWriteBatch<'a>
    for FreshDbOptimizationWriteBatch<'a, B>
{
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.put(key_space, key, value)
    }

    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()> {
        self.write_batch.delete(key_space, key)
    }

    unsafe fn flush(&self, key_space: KeySpace) -> Result<()> {
        unsafe { self.write_batch.flush(key_space) }
    }
}
