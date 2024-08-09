use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{backend::CachedTaskType, TaskId};

use crate::{
    backend::AnyOperation,
    data::{CachedDataItem, CachedDataUpdate},
    utils::chunked_vec::ChunkedVec,
};

pub trait BackingStorage {
    fn next_free_task_id(&self) -> TaskId;
    fn uncompleted_operations(&self) -> Vec<AnyOperation>;
    fn save_snapshot(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: ChunkedVec<(Arc<CachedTaskType>, TaskId)>,
        data_updates: ChunkedVec<CachedDataUpdate>,
    ) -> Result<()>;
    fn forward_lookup_task_cache(&self, key: &CachedTaskType) -> Option<TaskId>;
    fn reverse_lookup_task_cache(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>>;
    fn lookup_data(&self, task_id: TaskId) -> Vec<CachedDataItem>;
}
