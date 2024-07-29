mod operation;
mod storage;

use std::{
    borrow::Cow,
    collections::HashSet,
    future::Future,
    hash::BuildHasherDefault,
    pin::Pin,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::Result;
use auto_hash_map::{AutoMap, AutoSet};
use parking_lot::{Condvar, Mutex};
use rustc_hash::FxHasher;
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CachedTaskType, CellContent, TaskExecutionSpec, TransientTaskType,
        TypedCellContent,
    },
    event::EventListener,
    util::IdFactoryWithReuse,
    CellId, FunctionId, RawVc, ReadConsistency, TaskId, TraitTypeId, TurboTasksBackendApi,
    ValueTypeId, TRANSIENT_TASK_BIT,
};

use self::{
    operation::{AnyOperation, ExecuteContext, Operation},
    storage::Storage,
};
use crate::{
    data::{CachedDataItem, CachedDataUpdate},
    utils::{bi_map::BiMap, chunked_vec::ChunkedVec, ptr_eq_arc::PtrEqArc},
};

const SNAPSHOT_REQUESTED_BIT: usize = 1 << 63;

struct SnapshotRequest {
    snapshot_requested: bool,
    suspended_operations: HashSet<PtrEqArc<AnyOperation>>,
}

impl SnapshotRequest {
    fn new() -> Self {
        Self {
            snapshot_requested: false,
            suspended_operations: HashSet::new(),
        }
    }
}

pub struct TurboTasksBackend {
    persisted_task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,

    persisted_task_cache_log: Mutex<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
    task_cache: BiMap<Arc<CachedTaskType>, TaskId>,

    persisted_storage_log: Mutex<ChunkedVec<CachedDataUpdate>>,
    storage: Storage<TaskId, CachedDataItem>,

    /// Number of executing operations + Highest bit is set when snapshot is
    /// requested. When that bit is set, operations should pause until the
    /// snapshot is completed. When the bit is set and in progress counter
    /// reaches zero, `operations_completed_when_snapshot_requested` is
    /// triggered.
    in_progress_operations: AtomicUsize,

    snapshot_request: Mutex<SnapshotRequest>,
    /// Condition Variable that is triggered when `in_progress_operations`
    /// reaches zero while snapshot is requested. All operations are either
    /// completed or suspended.
    operations_suspended: Condvar,
    /// Condition Variable that is triggered when a snapshot is completed and
    /// operations can continue.
    snapshot_completed: Condvar,
}

impl TurboTasksBackend {
    pub fn new() -> Self {
        Self {
            persisted_task_id_factory: IdFactoryWithReuse::new(1, (TRANSIENT_TASK_BIT - 1) as u64),
            transient_task_id_factory: IdFactoryWithReuse::new(
                TRANSIENT_TASK_BIT as u64,
                u32::MAX as u64,
            ),
            persisted_task_cache_log: Mutex::new(ChunkedVec::new()),
            task_cache: BiMap::new(),
            persisted_storage_log: Mutex::new(ChunkedVec::new()),
            storage: Storage::new(),
            in_progress_operations: AtomicUsize::new(0),
            snapshot_request: Mutex::new(SnapshotRequest::new()),
            operations_suspended: Condvar::new(),
            snapshot_completed: Condvar::new(),
        }
    }

    fn run_operation(
        &self,
        operation: impl Operation,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        operation.execute(ExecuteContext::new(self, turbo_tasks));
    }

    fn operation_suspend_point(&self, suspend: impl FnOnce() -> AnyOperation) {
        if (self.in_progress_operations.load(Ordering::Relaxed) & SNAPSHOT_REQUESTED_BIT) != 0 {
            let operation = Arc::new(suspend());
            let mut snapshot_request = self.snapshot_request.lock();
            if snapshot_request.snapshot_requested {
                snapshot_request
                    .suspended_operations
                    .insert(operation.clone().into());
                let value = self.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
                assert!((value & SNAPSHOT_REQUESTED_BIT) != 0);
                if value == SNAPSHOT_REQUESTED_BIT {
                    self.operations_suspended.notify_all();
                }
                self.snapshot_completed
                    .wait_while(&mut snapshot_request, |snapshot_request| {
                        snapshot_request.snapshot_requested
                    });
                self.in_progress_operations.fetch_add(1, Ordering::AcqRel);
                snapshot_request
                    .suspended_operations
                    .remove(&operation.into());
            }
        }
    }
}

// Operations
impl TurboTasksBackend {
    pub fn connect_child(
        &self,
        parent_task: TaskId,
        child_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.run_operation(
            operation::ConnectChildOperation::new(parent_task, child_task),
            turbo_tasks,
        );
    }
}

impl Backend for TurboTasksBackend {
    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        let task_type = Arc::new(task_type);
        let task_id = self.persisted_task_id_factory.get();
        if let Err(existing_task_id) = self.task_cache.try_insert(task_type.clone(), task_id) {
            // Safety: We just created the id and failed to insert it.
            unsafe {
                self.persisted_task_id_factory.reuse(task_id);
            }
            self.connect_child(parent_task, existing_task_id, turbo_tasks);
            return existing_task_id;
        }
        self.persisted_task_cache_log
            .lock()
            .push((task_type, task_id));

        self.connect_child(parent_task, task_id, turbo_tasks);

        task_id
    }

    fn invalidate_task(&self, _: TaskId, _: &dyn TurboTasksBackendApi<Self>) {
        todo!()
    }
    fn invalidate_tasks(&self, _: &[TaskId], _: &dyn TurboTasksBackendApi<Self>) {
        todo!()
    }
    fn invalidate_tasks_set(
        &self,
        _: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        _: &dyn TurboTasksBackendApi<Self>,
    ) {
        todo!()
    }
    fn get_task_description(&self, _: TaskId) -> std::string::String {
        todo!()
    }
    fn try_get_function_id(&self, _: TaskId) -> Option<FunctionId> {
        todo!()
    }
    type TaskState = ();
    fn new_task_state(&self, _task: TaskId) -> Self::TaskState {
        ()
    }
    fn try_start_task_execution(
        &self,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> std::option::Option<TaskExecutionSpec<'_>> {
        todo!()
    }
    fn task_execution_result(
        &self,
        _: TaskId,
        _: Result<Result<RawVc, turbo_tasks::Error>, std::option::Option<Cow<'static, str>>>,
        _: &dyn TurboTasksBackendApi<Self>,
    ) {
        todo!()
    }
    fn task_execution_completed(
        &self,
        _: TaskId,
        _: Duration,
        _: usize,
        _: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        _: bool,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> bool {
        todo!()
    }
    fn run_backend_job(
        &self,
        _: BackendJobId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<(dyn Future<Output = ()> + Send + 'static)>> {
        todo!()
    }
    fn try_read_task_output(
        &self,
        _: TaskId,
        _: TaskId,
        _: ReadConsistency,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>, turbo_tasks::Error> {
        todo!()
    }
    fn try_read_task_output_untracked(
        &self,
        _: TaskId,
        _: ReadConsistency,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>, turbo_tasks::Error> {
        todo!()
    }
    fn try_read_task_cell(
        &self,
        _: TaskId,
        _: CellId,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>, turbo_tasks::Error> {
        todo!()
    }
    fn try_read_task_cell_untracked(
        &self,
        _: TaskId,
        _: CellId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>, turbo_tasks::Error> {
        todo!()
    }
    fn read_task_collectibles(
        &self,
        _: TaskId,
        _: TraitTypeId,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
        todo!()
    }
    fn emit_collectible(
        &self,
        _: TraitTypeId,
        _: RawVc,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) {
        todo!()
    }
    fn unemit_collectible(
        &self,
        _: TraitTypeId,
        _: RawVc,
        _: u32,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) {
        todo!()
    }
    fn update_task_cell(
        &self,
        _: TaskId,
        _: CellId,
        _: CellContent,
        _: &dyn TurboTasksBackendApi<Self>,
    ) {
        todo!()
    }
    fn get_or_create_transient_task(
        &self,
        _: CachedTaskType,
        _: TaskId,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        todo!()
    }
    fn connect_task(&self, _: TaskId, _: TaskId, _: &dyn TurboTasksBackendApi<Self>) {
        todo!()
    }
    fn create_transient_task(
        &self,
        _: TransientTaskType,
        _: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        todo!()
    }
    fn dispose_root_task(&self, _: TaskId, _: &dyn TurboTasksBackendApi<Self>) {
        todo!()
    }
}
