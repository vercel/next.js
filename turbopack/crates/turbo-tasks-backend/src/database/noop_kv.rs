use std::borrow::Cow;

use anyhow::Result;

use crate::database::{
    key_value_database::{KeySpace, KeyValueDatabase},
    write_batch::{BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch},
};

pub struct NoopKvDb;

impl KeyValueDatabase for NoopKvDb {
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
        = &'l [u8]
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        _key_space: KeySpace,
        _key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>> {
        Ok(None)
    }

    type SerialWriteBatch<'l>
        = NoopWriteBatch
    where
        Self: 'l;

    type ConcurrentWriteBatch<'l>
        = NoopWriteBatch
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>> {
        Ok(WriteBatch::concurrent(NoopWriteBatch))
    }
}

pub struct NoopWriteBatch;

impl<'a> BaseWriteBatch<'a> for NoopWriteBatch {
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
}

impl SerialWriteBatch<'_> for NoopWriteBatch {
    fn put(&mut self, _key_space: KeySpace, _key: Cow<[u8]>, _value: Cow<[u8]>) -> Result<()> {
        Ok(())
    }

    fn delete(&mut self, _key_space: KeySpace, _key: Cow<[u8]>) -> Result<()> {
        Ok(())
    }
}

impl ConcurrentWriteBatch<'_> for NoopWriteBatch {
    fn put(&self, _key_space: KeySpace, _key: Cow<[u8]>, _value: Cow<[u8]>) -> Result<()> {
        Ok(())
    }

    fn delete(&self, _key_space: KeySpace, _key: Cow<[u8]>) -> Result<()> {
        Ok(())
    }
}
