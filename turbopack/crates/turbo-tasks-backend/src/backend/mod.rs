mod operation;
mod storage;

use std::{collections::VecDeque, sync::Arc};

use parking_lot::Mutex;
use turbo_tasks::{backend::CachedTaskType, TaskId};

use self::{operation::Operation, storage::Storage};
use crate::{
    data::{CachedDataItem, CachedDataUpdate},
    utils::{bi_map::BiMap, chunked_vec::ChunkedVec},
};

pub struct TurboTasksBackend {
    persisted_task_cache_log: Mutex<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
    task_cache: BiMap<Arc<CachedTaskType>, TaskId>,
    persisted_storage_log: Mutex<ChunkedVec<CachedDataUpdate>>,
    storage: Storage<TaskId, CachedDataItem>,
    operations: Mutex<VecDeque<Box<dyn Operation>>>,
}

impl TurboTasksBackend {
    pub fn new() -> Self {
        Self {
            persisted_task_cache_log: Mutex::new(ChunkedVec::new()),
            task_cache: BiMap::new(),
            persisted_storage_log: Mutex::new(ChunkedVec::new()),
            storage: Storage::new(),
            operations: Mutex::new(VecDeque::new()),
        }
    }

    fn run_operation(&self, operation: Box<dyn Operation>) {
        self.operations.lock().push_back(operation);
    }
}
