use anyhow::Result;

use crate::database::write_batch::{
    ConcurrentWriteBatch, SerialWriteBatch, UnimplementedWriteBatch, WriteBatch,
};

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra,
    TaskMeta,
    TaskData,
    ForwardTaskCache,
    ReverseTaskCache,
}

pub trait KeyValueDatabase {
    type ReadTransaction<'l>
    where
        Self: 'l;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i>;

    fn begin_read_transaction(&self) -> Result<Self::ReadTransaction<'_>>;

    fn is_empty(&self) -> bool {
        false
    }

    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l;

    fn get<'l, 'db: 'l>(
        &'l self,
        transaction: &'l Self::ReadTransaction<'db>,
        key_space: KeySpace,
        key: &[u8],
    ) -> Result<Option<Self::ValueBuffer<'l>>>;

    type SerialWriteBatch<'l>: SerialWriteBatch<'l>
        = UnimplementedWriteBatch
    where
        Self: 'l;
    type ConcurrentWriteBatch<'l>: ConcurrentWriteBatch<'l>
        = UnimplementedWriteBatch
    where
        Self: 'l;

    fn write_batch(
        &self,
    ) -> Result<WriteBatch<'_, Self::SerialWriteBatch<'_>, Self::ConcurrentWriteBatch<'_>>>;

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}
