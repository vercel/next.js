use std::borrow::Cow;

use anyhow::Result;

use crate::database::key_value_database::{KeySpace, KeyValueDatabase, WriteBatch};

pub struct NoopKvDb;

impl NoopKvDb {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self
    }
}

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

    fn get<'l, 'db: 'l>(
        &'l self,
        _transaction: &'l Self::ReadTransaction<'db>,
        _key_space: KeySpace,
        _key: &[u8],
    ) -> Result<Option<Cow<'l, [u8]>>> {
        Ok(None)
    }

    type WriteBatch<'l>
        = NoopWriteBatch
    where
        Self: 'l;

    fn write_batch(&self) -> Result<Self::WriteBatch<'_>> {
        Ok(NoopWriteBatch)
    }
}

pub struct NoopWriteBatch;

impl<'a> WriteBatch<'a> for NoopWriteBatch {
    fn put(&mut self, _key_space: KeySpace, _key: Cow<[u8]>, _value: Cow<[u8]>) -> Result<()> {
        Ok(())
    }

    fn get<'l>(&'l self, _key_space: KeySpace, _key: &[u8]) -> Result<Option<Cow<'l, [u8]>>>
    where
        'a: 'l,
    {
        Ok(None)
    }

    fn delete(&mut self, _key_space: KeySpace, _key: Cow<[u8]>) -> Result<()> {
        Ok(())
    }

    fn commit(self) -> Result<()> {
        Ok(())
    }
}
