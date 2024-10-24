use std::borrow::Cow;

use anyhow::Result;

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra,
    TaskMeta,
    TaskData,
    ForwardTaskCache,
    ReverseTaskCache,
}

pub trait WriteBatch<'a> {
    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l;
    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()>;
    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()>;
    fn commit(self) -> Result<()>;
}

pub trait KeyValueDatabase {
    type ReadTransaction<'l>
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i>;

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>>;

    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>>;

    type WriteBatch<'l>: WriteBatch<'l>
    where
        Self: 'l;
    fn write_batch(&self) -> Result<Self::WriteBatch<'_>>;
}
