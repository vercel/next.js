use anyhow::Result;

use crate::database::write_batch::{
    ConcurrentWriteBatch, SerialWriteBatch, UnimplementedWriteBatch, WriteBatch,
};

#[derive(Debug, Clone, Copy)]
pub enum KeySpace {
    Infra = 0,
    TaskMeta = 1,
    TaskData = 2,
    ForwardTaskCache = 3,
    ReverseTaskCache = 4,
}

pub trait KeyValueDatabase {
    type ReadTransaction<'l>
    where
        Self: 'l;

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

    /// Called when the database has been invalidated via
    /// [`crate::backing_storage::BackingStorage::invalidate`]
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`KeyValueDatabase::shutdown`].
    ///
    /// This is a best-effort optimization hint, and the database may choose to ignore this and
    /// continue file writes. This happens after the database is invalidated, so it is valid for
    /// this to leave the database in a half-updated and corrupted state.
    fn prevent_writes(&self) {
        // this is an optional performance hint to the database
    }

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}
