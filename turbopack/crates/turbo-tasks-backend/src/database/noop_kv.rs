use anyhow::Result;
use smallvec::SmallVec;
use turbo_persistence::ArcBytes;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{ConcurrentWriteBatch, WriteBuffer},
};

pub struct NoopKvDb;

impl KeyValueDatabase for NoopKvDb {
    fn get(&self, _key_space: KeySpace, _key: &[u8]) -> Result<Option<ArcBytes>> {
        Ok(None)
    }
    fn get_multiple(&self, _key_space: KeySpace, _key: &[u8]) -> Result<SmallVec<[ArcBytes; 1]>> {
        Ok(SmallVec::new())
    }
    fn batch_get_with(
        &self,
        _key_space: KeySpace,
        keys: &[&[u8]],
        mut callback: impl FnMut(usize, Option<&[u8]>) -> Result<()>,
    ) -> Result<()> {
        for (index, _key) in keys.iter().enumerate() {
            callback(index, None)?;
        }
        Ok(())
    }

    type ConcurrentWriteBatch<'l>
        = NoopWriteBatch
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::ConcurrentWriteBatch<'_>> {
        Ok(NoopWriteBatch)
    }
}

pub struct NoopWriteBatch;

impl<'a> ConcurrentWriteBatch<'a> for NoopWriteBatch {
    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, _key_space: KeySpace, _key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        Ok(None)
    }

    fn commit(self) -> Result<()> {
        Ok(())
    }

    fn put(
        &self,
        _key_space: KeySpace,
        _key: WriteBuffer<'_>,
        _value: WriteBuffer<'_>,
    ) -> Result<()> {
        Ok(())
    }

    fn delete(&self, _key_space: KeySpace, _key: WriteBuffer<'_>) -> Result<()> {
        Ok(())
    }

    unsafe fn flush(&self, _key_space: KeySpace) -> Result<()> {
        Ok(())
    }
}
