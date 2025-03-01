use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{backend::CachedTaskType, SessionId, TaskId};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    data::{CachedDataItem, CachedDataUpdate},
    utils::chunked_vec::ChunkedVec,
};

pub trait BackingStorage: 'static + Send + Sync {
    type ReadTransaction<'l>;
    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i>;
    fn next_free_task_id(&self) -> TaskId;
    fn next_session_id(&self) -> SessionId;
    fn uncompleted_operations(&self) -> Vec<AnyOperation>;
    fn save_snapshot(
        &self,
        session_id: SessionId,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        meta_updates: Vec<ChunkedVec<CachedDataUpdate>>,
        data_updates: Vec<ChunkedVec<CachedDataUpdate>>,
    ) -> Result<()>;
    fn start_read_transaction(&self) -> Option<Self::ReadTransaction<'_>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn forward_lookup_task_cache(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        key: &CachedTaskType,
    ) -> Option<TaskId>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        task_id: TaskId,
    ) -> Option<Arc<CachedTaskType>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn lookup_data(
        &self,
        tx: Option<&Self::ReadTransaction<'_>>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Vec<CachedDataItem>;

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}
