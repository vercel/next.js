use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{backend::CachedTaskType, TaskId};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    data::{CachedDataItem, CachedDataUpdate},
    utils::chunked_vec::ChunkedVec,
};

#[derive(Clone, Copy)]
pub struct ReadTransaction(pub *const ());

pub trait BackingStorage {
    fn next_free_task_id(&self) -> TaskId;
    fn uncompleted_operations(&self) -> Vec<AnyOperation>;
    fn save_snapshot(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        meta_updates: Vec<ChunkedVec<CachedDataUpdate>>,
        data_updates: Vec<ChunkedVec<CachedDataUpdate>>,
    ) -> Result<()>;
    fn start_read_transaction(&self) -> Option<ReadTransaction>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn end_read_transaction(&self, tx: ReadTransaction);
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn forward_lookup_task_cache(
        &self,
        tx: Option<ReadTransaction>,
        key: &CachedTaskType,
    ) -> Option<TaskId>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<ReadTransaction>,
        task_id: TaskId,
    ) -> Option<Arc<CachedTaskType>>;
    /// # Safety
    ///
    /// `tx` must be a transaction from this BackingStorage instance.
    unsafe fn lookup_data(
        &self,
        tx: Option<ReadTransaction>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Vec<CachedDataItem>;
}
