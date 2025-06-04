use std::sync::Arc;

use anyhow::Result;
use smallvec::SmallVec;
use turbo_tasks::{SessionId, TaskId, backend::CachedTaskType};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    data::CachedDataItem,
    utils::chunked_vec::ChunkedVec,
};

pub trait BackingStorage: 'static + Send + Sync {
    type ReadTransaction<'l>;
    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i>;
    fn next_free_task_id(&self) -> Result<TaskId>;
    fn next_session_id(&self) -> Result<SessionId>;
    fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>>;
    #[allow(clippy::ptr_arg)]
    fn serialize(task: TaskId, data: &Vec<CachedDataItem>) -> Result<SmallVec<[u8; 16]>>;
    fn save_snapshot<I>(
        &self,
        session_id: SessionId,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        snapshots: Vec<I>,
    ) -> Result<()>
    where
        I: Iterator<
                Item = (
                    TaskId,
                    Option<SmallVec<[u8; 16]>>,
                    Option<SmallVec<[u8; 16]>>,
                ),
            > + Send
            + Sync;
    fn start_read_transaction(&self) -> Option<Self::ReadTransaction<'_>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn forward_lookup_task_cache(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        key: &CachedTaskType,
    ) -> Result<Option<TaskId>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        task_id: TaskId,
    ) -> Result<Option<Arc<CachedTaskType>>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn lookup_data(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Result<Vec<CachedDataItem>>;

    /// Called when the database should be invalidated upon re-initialization.
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`KeyValueDatabase::shutdown`].
    ///
    /// This can be implemented by calling [`crate::database::db_invalidation::invalidate_db`] with
    /// the database's non-versioned base path.
    fn invalidate(&self) -> Result<()>;

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}
