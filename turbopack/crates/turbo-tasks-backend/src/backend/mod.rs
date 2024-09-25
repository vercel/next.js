pub mod indexed;
mod operation;
mod storage;

use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    future::Future,
    hash::BuildHasherDefault,
    mem::take,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use anyhow::{bail, Result};
use auto_hash_map::{AutoMap, AutoSet};
use dashmap::DashMap;
pub use operation::AnyOperation;
use operation::{
    get_aggregation_number, is_root_node, AggregatedDataUpdate, AggregationUpdateJob,
    AggregationUpdateQueue, CleanupOldEdgesOperation, ConnectChildOperation, OutdatedEdge,
};
use parking_lot::{Condvar, Mutex};
use rustc_hash::FxHasher;
use smallvec::smallvec;
pub use storage::TaskDataCategory;
use tokio::time::timeout;
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CachedTaskType, CellContent, TaskExecutionSpec, TransientTaskRoot,
        TransientTaskType, TypedCellContent,
    },
    event::{Event, EventListener},
    registry,
    util::IdFactoryWithReuse,
    CellId, FunctionId, RawVc, ReadConsistency, TaskId, TraitTypeId, TurboTasksBackendApi,
    ValueTypeId, TRANSIENT_TASK_BIT,
};

use self::{operation::ExecuteContext, storage::Storage};
use crate::{
    backing_storage::BackingStorage,
    data::{
        ActiveType, AggregationNumber, CachedDataItem, CachedDataItemIndex, CachedDataItemKey,
        CachedDataItemValue, CachedDataUpdate, CellRef, InProgressCellState, InProgressState,
        OutputValue, RootState,
    },
    get, get_many, remove,
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

type TransientOnceTask =
    Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

pub enum TransientTask {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    /// Active until done. Automatically scheduled.
    Once(TransientOnceTask),
}

pub struct TurboTasksBackend(Arc<TurboTasksBackendInner>);

struct TurboTasksBackendInner {
    start_time: Instant,

    persisted_task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,

    persisted_task_cache_log: Mutex<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
    task_cache: BiMap<Arc<CachedTaskType>, TaskId>,
    transient_tasks: DashMap<TaskId, Arc<TransientTask>>,

    persisted_storage_data_log: Mutex<ChunkedVec<CachedDataUpdate>>,
    persisted_storage_meta_log: Mutex<ChunkedVec<CachedDataUpdate>>,
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
    /// The timestamp of the last started snapshot.
    last_snapshot: AtomicU64,

    stopping: AtomicBool,
    stopping_event: Event,

    backing_storage: Arc<dyn BackingStorage + Sync + Send>,
}

impl TurboTasksBackend {
    pub fn new(backing_storage: Arc<dyn BackingStorage + Sync + Send>) -> Self {
        Self(Arc::new(TurboTasksBackendInner::new(backing_storage)))
    }
}

impl TurboTasksBackendInner {
    pub fn new(backing_storage: Arc<dyn BackingStorage + Sync + Send>) -> Self {
        Self {
            start_time: Instant::now(),
            persisted_task_id_factory: IdFactoryWithReuse::new(
                *backing_storage.next_free_task_id() as u64,
                (TRANSIENT_TASK_BIT - 1) as u64,
            ),
            transient_task_id_factory: IdFactoryWithReuse::new(
                TRANSIENT_TASK_BIT as u64,
                u32::MAX as u64,
            ),
            persisted_task_cache_log: Mutex::new(ChunkedVec::new()),
            task_cache: BiMap::new(),
            transient_tasks: DashMap::new(),
            persisted_storage_data_log: Mutex::new(ChunkedVec::new()),
            persisted_storage_meta_log: Mutex::new(ChunkedVec::new()),
            storage: Storage::new(),
            in_progress_operations: AtomicUsize::new(0),
            snapshot_request: Mutex::new(SnapshotRequest::new()),
            operations_suspended: Condvar::new(),
            snapshot_completed: Condvar::new(),
            last_snapshot: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            stopping_event: Event::new(|| "TurboTasksBackend::stopping_event".to_string()),
            backing_storage,
        }
    }

    fn execute_context<'a>(
        &'a self,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> ExecuteContext<'a> {
        ExecuteContext::new(self, turbo_tasks)
    }

    fn suspending_requested(&self) -> bool {
        (self.in_progress_operations.load(Ordering::Relaxed) & SNAPSHOT_REQUESTED_BIT) != 0
    }

    fn operation_suspend_point(&self, suspend: impl FnOnce() -> AnyOperation) {
        if (self.in_progress_operations.load(Ordering::Relaxed) & SNAPSHOT_REQUESTED_BIT) != 0 {
            let operation = Arc::new(suspend());
            let mut snapshot_request = self.snapshot_request.lock();
            if snapshot_request.snapshot_requested {
                snapshot_request
                    .suspended_operations
                    .insert(operation.clone().into());
                let value = self.in_progress_operations.fetch_sub(1, Ordering::AcqRel) - 1;
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

    pub(crate) fn start_operation(&self) -> OperationGuard<'_> {
        let fetch_add = self.in_progress_operations.fetch_add(1, Ordering::AcqRel);
        if (fetch_add & SNAPSHOT_REQUESTED_BIT) != 0 {
            let mut snapshot_request = self.snapshot_request.lock();
            if snapshot_request.snapshot_requested {
                let value = self.in_progress_operations.fetch_sub(1, Ordering::AcqRel) - 1;
                if value == SNAPSHOT_REQUESTED_BIT {
                    self.operations_suspended.notify_all();
                }
                self.snapshot_completed
                    .wait_while(&mut snapshot_request, |snapshot_request| {
                        snapshot_request.snapshot_requested
                    });
                self.in_progress_operations.fetch_add(1, Ordering::AcqRel);
            }
        }
        OperationGuard { backend: self }
    }

    fn persisted_storage_log(
        &self,
        category: TaskDataCategory,
    ) -> &Mutex<ChunkedVec<CachedDataUpdate>> {
        match category {
            TaskDataCategory::Data => &self.persisted_storage_data_log,
            TaskDataCategory::Meta => &self.persisted_storage_meta_log,
            TaskDataCategory::All => unreachable!(),
        }
    }
}

pub(crate) struct OperationGuard<'a> {
    backend: &'a TurboTasksBackendInner,
}

impl<'a> Drop for OperationGuard<'a> {
    fn drop(&mut self) {
        let fetch_sub = self
            .backend
            .in_progress_operations
            .fetch_sub(1, Ordering::AcqRel);
        if fetch_sub - 1 == SNAPSHOT_REQUESTED_BIT {
            self.backend.operations_suspended.notify_all();
        }
    }
}

// Operations
impl TurboTasksBackendInner {
    fn connect_child(
        &self,
        parent_task: TaskId,
        child_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::ConnectChildOperation::run(
            parent_task,
            child_task,
            self.execute_context(turbo_tasks),
        );
    }

    fn try_read_task_output(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Result<Result<RawVc, EventListener>> {
        let ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);

        if let Some(in_progress) = get!(task, InProgress) {
            match in_progress {
                InProgressState::Scheduled { done_event, .. }
                | InProgressState::InProgress { done_event, .. } => {
                    let reader_desc = reader.map(|r| self.get_task_desc_fn(r));
                    let listener = done_event.listen_with_note(move || {
                        if let Some(reader_desc) = reader_desc.as_ref() {
                            format!("try_read_task_output from {}", reader_desc())
                        } else {
                            "try_read_task_output (untracked)".to_string()
                        }
                    });
                    return Ok(Err(listener));
                }
            }
        }

        if matches!(consistency, ReadConsistency::Strong) {
            // Ensure it's an root node
            loop {
                let aggregation_number = get_aggregation_number(&task);
                if is_root_node(aggregation_number) {
                    break;
                }
                drop(task);
                AggregationUpdateQueue::run(
                    AggregationUpdateJob::UpdateAggregationNumber {
                        task_id,
                        base_aggregation_number: u32::MAX,
                        distance: None,
                    },
                    &ctx,
                );
                task = ctx.task(task_id, TaskDataCategory::All);
            }

            // Check the dirty count of the root node
            let dirty_tasks = get!(task, AggregatedDirtyContainerCount)
                .copied()
                .unwrap_or_default();
            let root = get!(task, AggregateRoot);
            if dirty_tasks > 0 {
                // When there are dirty task, subscribe to the all_clean_event
                let root = if let Some(root) = root {
                    root
                } else {
                    // If we don't have a root state, add one. This also makes sure all tasks stay
                    // active and this task won't stale. CachedActiveUntilClean
                    // is automatically removed when this task is clean.
                    task.add_new(CachedDataItem::AggregateRoot {
                        value: RootState::new(ActiveType::CachedActiveUntilClean),
                    });
                    get!(task, AggregateRoot).unwrap()
                };
                let listener = root.all_clean_event.listen_with_note(move || {
                    format!(
                        "try_read_task_output (strongly consistent) from {:?}",
                        reader
                    )
                });
                return Ok(Err(listener));
            }
        }

        if let Some(output) = get!(task, Output) {
            let result = match output {
                OutputValue::Cell(cell) => Some(Ok(Ok(RawVc::TaskCell(cell.task, cell.cell)))),
                OutputValue::Output(task) => Some(Ok(Ok(RawVc::TaskOutput(*task)))),
                OutputValue::Error | OutputValue::Panic => {
                    get!(task, Error).map(|error| Err(error.clone().into()))
                }
            };
            if let Some(result) = result {
                if let Some(reader) = reader {
                    let _ = task.add(CachedDataItem::OutputDependent {
                        task: reader,
                        value: (),
                    });
                    drop(task);

                    let mut reader_task = ctx.task(reader, TaskDataCategory::Data);
                    if reader_task
                        .remove(&CachedDataItemKey::OutdatedOutputDependency { target: task_id })
                        .is_none()
                    {
                        let _ = reader_task.add(CachedDataItem::OutputDependency {
                            target: task_id,
                            value: (),
                        });
                    }
                }

                return result;
            }
        }

        let reader_desc = reader.map(|r| self.get_task_desc_fn(r));
        let note = move || {
            if let Some(reader_desc) = reader_desc.as_ref() {
                format!("try_read_task_output (recompute) from {}", reader_desc())
            } else {
                "try_read_task_output (recompute, untracked)".to_string()
            }
        };

        // Output doesn't exist. We need to schedule the task to compute it.
        let (item, listener) =
            CachedDataItem::new_scheduled_with_listener(self.get_task_desc_fn(task_id), note);
        task.add_new(item);
        turbo_tasks.schedule(task_id);

        Ok(Err(listener))
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        cell: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        let ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(content) = get!(task, CellData { cell }) {
            let content = content.clone();
            if let Some(reader) = reader {
                let _ = task.add(CachedDataItem::CellDependent {
                    cell,
                    task: reader,
                    value: (),
                });
                drop(task);

                let mut reader_task = ctx.task(reader, TaskDataCategory::Data);
                let target = CellRef {
                    task: task_id,
                    cell,
                };
                if reader_task
                    .remove(&CachedDataItemKey::OutdatedCellDependency { target })
                    .is_none()
                {
                    let _ = reader_task.add(CachedDataItem::CellDependency { target, value: () });
                }
            }
            return Ok(Ok(TypedCellContent(
                cell.type_id,
                CellContent(Some(content.1)),
            )));
        }

        // Check cell index range (cell might not exist at all)
        let Some(max_id) = get!(
            task,
            CellTypeMaxIndex {
                cell_type: cell.type_id
            }
        ) else {
            bail!(
                "Cell {cell:?} no longer exists in task {task_id:?} (no cell of this type exists)"
            );
        };
        if cell.index > *max_id {
            bail!("Cell {cell:?} no longer exists in task {task_id:?} (index out of bounds)");
        }

        // Cell should exist, but data was dropped or is not serializable. We need to recompute the
        // task the get the cell content.

        let reader_desc = reader.map(|r| self.get_task_desc_fn(r));
        let note = move || {
            if let Some(reader_desc) = reader_desc.as_ref() {
                format!("try_read_task_cell from {}", reader_desc())
            } else {
                "try_read_task_cell (untracked)".to_string()
            }
        };

        // Register event listener for cell computation
        if let Some(in_progress) = get!(task, InProgressCell { cell }) {
            // Someone else is already computing the cell
            let listener = in_progress.event.listen_with_note(note);
            return Ok(Err(listener));
        }

        // We create the event and potentially schedule the task
        let in_progress = InProgressCellState::new(task_id, cell);

        let listener = in_progress.event.listen_with_note(note);
        task.add_new(CachedDataItem::InProgressCell {
            cell,
            value: in_progress,
        });

        // Schedule the task, if not already scheduled
        if task.add(CachedDataItem::new_scheduled(
            self.get_task_desc_fn(task_id),
        )) {
            turbo_tasks.schedule(task_id);
        }

        Ok(Err(listener))
    }

    fn lookup_task_type(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>> {
        if let Some(task_type) = self.task_cache.lookup_reverse(&task_id) {
            return Some(task_type);
        }
        if let Some(task_type) = self.backing_storage.reverse_lookup_task_cache(task_id) {
            let _ = self.task_cache.try_insert(task_type.clone(), task_id);
            return Some(task_type);
        }
        None
    }

    // TODO feature flag that for hanging detection only
    fn get_task_desc_fn(&self, task_id: TaskId) -> impl Fn() -> String + Send + Sync + 'static {
        let task_type = self.lookup_task_type(task_id);
        move || {
            task_type.as_ref().map_or_else(
                || format!("{task_id:?} transient"),
                |task_type| format!("{task_id:?} {task_type}"),
            )
        }
    }

    fn snapshot(&self) -> Option<(Instant, bool)> {
        let mut snapshot_request = self.snapshot_request.lock();
        snapshot_request.snapshot_requested = true;
        let active_operations = self
            .in_progress_operations
            .fetch_or(SNAPSHOT_REQUESTED_BIT, std::sync::atomic::Ordering::Relaxed);
        if active_operations != 0 {
            self.operations_suspended
                .wait_while(&mut snapshot_request, |_| {
                    self.in_progress_operations
                        .load(std::sync::atomic::Ordering::Relaxed)
                        != SNAPSHOT_REQUESTED_BIT
                });
        }
        let suspended_operations = snapshot_request
            .suspended_operations
            .iter()
            .map(|op| op.arc().clone())
            .collect::<Vec<_>>();
        drop(snapshot_request);
        let persisted_storage_meta_log = take(&mut *self.persisted_storage_meta_log.lock());
        let persisted_storage_data_log = take(&mut *self.persisted_storage_data_log.lock());
        let persisted_task_cache_log = take(&mut *self.persisted_task_cache_log.lock());
        let mut snapshot_request = self.snapshot_request.lock();
        snapshot_request.snapshot_requested = false;
        self.in_progress_operations
            .fetch_sub(SNAPSHOT_REQUESTED_BIT, std::sync::atomic::Ordering::Relaxed);
        self.snapshot_completed.notify_all();
        let snapshot_time = Instant::now();
        drop(snapshot_request);

        let mut counts: HashMap<TaskId, u32> = HashMap::new();
        for CachedDataUpdate { task, .. } in persisted_storage_data_log
            .iter()
            .chain(persisted_storage_meta_log.iter())
        {
            *counts.entry(*task).or_default() += 1;
        }

        let mut new_items = false;

        if !persisted_task_cache_log.is_empty()
            || !persisted_storage_meta_log.is_empty()
            || !persisted_storage_data_log.is_empty()
        {
            new_items = true;
            if let Err(err) = self.backing_storage.save_snapshot(
                suspended_operations,
                persisted_task_cache_log,
                persisted_storage_meta_log,
                persisted_storage_data_log,
            ) {
                println!("Persising failed: {:#?}", err);
                return None;
            }
            println!("Snapshot saved");
        }

        for (task_id, count) in counts {
            self.storage
                .access_mut(task_id)
                .persistance_state_mut()
                .finish_persisting_items(count);
        }

        Some((snapshot_time, new_items))
    }

    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>) {
        // Continue all uncompleted operations
        // They can't be interrupted by a snapshot since the snapshotting job has not been scheduled
        // yet.
        let uncompleted_operations = self.backing_storage.uncompleted_operations();
        let ctx = self.execute_context(turbo_tasks);
        for op in uncompleted_operations {
            op.execute(&ctx);
        }

        // Schedule the snapshot job
        turbo_tasks.schedule_backend_background_job(BackendJobId::from(1));
    }

    fn stopping(&self) {
        self.stopping.store(true, Ordering::Release);
        self.stopping_event.notify(usize::MAX);
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> TaskId {
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        if let Some(task_id) = self.backing_storage.forward_lookup_task_cache(&task_type) {
            let _ = self.task_cache.try_insert(Arc::new(task_type), task_id);
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
            self.persisted_task_cache_log
                .lock()
                .push((task_type, existing_task_id));
            self.connect_child(parent_task, existing_task_id, turbo_tasks);
            return existing_task_id;
        }
        self.persisted_task_cache_log
            .lock()
            .push((task_type, task_id));

        self.connect_child(parent_task, task_id, turbo_tasks);

        task_id
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> TaskId {
        if !parent_task.is_transient() {
            let parent_task_type = self.lookup_task_type(parent_task);
            panic!(
                "Calling transient function {} from persistent function function {} is not allowed",
                task_type.get_name(),
                parent_task_type.map_or_else(|| "unknown".into(), |t| t.get_name())
            );
        }
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        let task_type = Arc::new(task_type);
        let task_id = self.transient_task_id_factory.get();
        if let Err(existing_task_id) = self.task_cache.try_insert(task_type, task_id) {
            // Safety: We just created the id and failed to insert it.
            unsafe {
                self.transient_task_id_factory.reuse(task_id);
            }
            self.connect_child(parent_task, existing_task_id, turbo_tasks);
            return existing_task_id;
        }

        self.connect_child(parent_task, task_id, turbo_tasks);

        task_id
    }

    fn invalidate_task(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::InvalidateOperation::run(smallvec![task_id], self.execute_context(turbo_tasks));
    }

    fn invalidate_tasks(
        &self,
        tasks: &[TaskId],
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_serialization(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        if task_id.is_transient() {
            return;
        }
        let ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        task.invalidate_serialization();
    }

    fn get_task_description(&self, task: TaskId) -> std::string::String {
        let task_type = self.lookup_task_type(task).expect("Task not found");
        task_type.to_string()
    }

    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId> {
        self.lookup_task_type(task_id)
            .and_then(|task_type| match &*task_type {
                CachedTaskType::Native { fn_type, .. } => Some(*fn_type),
                _ => None,
            })
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Option<TaskExecutionSpec<'_>> {
        enum TaskType {
            Cached(Arc<CachedTaskType>),
            Transient(Arc<TransientTask>),
        }
        let (task_type, once_task) = if let Some(task_type) = self.lookup_task_type(task_id) {
            (TaskType::Cached(task_type), false)
        } else if let Some(task_type) = self.transient_tasks.get(&task_id) {
            (
                TaskType::Transient(task_type.clone()),
                matches!(**task_type, TransientTask::Once(_)),
            )
        } else {
            return None;
        };
        {
            let ctx = self.execute_context(turbo_tasks);
            let mut task = ctx.task(task_id, TaskDataCategory::Data);
            let in_progress = remove!(task, InProgress)?;
            let InProgressState::Scheduled { done_event } = in_progress else {
                task.add_new(CachedDataItem::InProgress { value: in_progress });
                return None;
            };
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::InProgress {
                    stale: false,
                    once_task,
                    done_event,
                },
            });

            // Make all current children outdated (remove left-over outdated children)
            enum Child {
                Current(TaskId),
                Outdated(TaskId),
            }
            let children = task
                .iter(CachedDataItemIndex::Children)
                .filter_map(|(key, _)| match *key {
                    CachedDataItemKey::Child { task } => Some(Child::Current(task)),
                    CachedDataItemKey::OutdatedChild { task } => Some(Child::Outdated(task)),
                    _ => None,
                })
                .collect::<Vec<_>>();
            for child in children {
                match child {
                    Child::Current(child) => {
                        let _ = task.add(CachedDataItem::OutdatedChild {
                            task: child,
                            value: (),
                        });
                    }
                    Child::Outdated(child) => {
                        if !task.has_key(&CachedDataItemKey::Child { task: child }) {
                            task.remove(&CachedDataItemKey::OutdatedChild { task: child });
                        }
                    }
                }
            }

            // Make all dependencies outdated
            enum Dep {
                CurrentCell(CellRef),
                CurrentOutput(TaskId),
                OutdatedCell(CellRef),
                OutdatedOutput(TaskId),
            }
            let dependencies = task
                .iter(CachedDataItemIndex::Dependencies)
                .filter_map(|(key, _)| match *key {
                    CachedDataItemKey::CellDependency { target } => Some(Dep::CurrentCell(target)),
                    CachedDataItemKey::OutputDependency { target } => {
                        Some(Dep::CurrentOutput(target))
                    }
                    CachedDataItemKey::OutdatedCellDependency { target } => {
                        Some(Dep::OutdatedCell(target))
                    }
                    CachedDataItemKey::OutdatedOutputDependency { target } => {
                        Some(Dep::OutdatedOutput(target))
                    }
                    _ => None,
                })
                .collect::<Vec<_>>();
            for dep in dependencies {
                match dep {
                    Dep::CurrentCell(cell) => {
                        let _ = task.add(CachedDataItem::OutdatedCellDependency {
                            target: cell,
                            value: (),
                        });
                    }
                    Dep::CurrentOutput(output) => {
                        let _ = task.add(CachedDataItem::OutdatedOutputDependency {
                            target: output,
                            value: (),
                        });
                    }
                    Dep::OutdatedCell(cell) => {
                        if !task.has_key(&CachedDataItemKey::CellDependency { target: cell }) {
                            task.remove(&CachedDataItemKey::OutdatedCellDependency {
                                target: cell,
                            });
                        }
                    }
                    Dep::OutdatedOutput(output) => {
                        if !task.has_key(&CachedDataItemKey::OutputDependency { target: output }) {
                            task.remove(&CachedDataItemKey::OutdatedOutputDependency {
                                target: output,
                            });
                        }
                    }
                }
            }

            // TODO: Make all collectibles outdated
        }

        let (span, future) = match task_type {
            TaskType::Cached(task_type) => match &*task_type {
                CachedTaskType::Native { fn_type, this, arg } => (
                    registry::get_function(*fn_type).span(),
                    registry::get_function(*fn_type).execute(*this, &**arg),
                ),
                CachedTaskType::ResolveNative { fn_type, .. } => {
                    let span = registry::get_function(*fn_type).resolve_span();
                    let turbo_tasks = turbo_tasks.pin();
                    (
                        span,
                        Box::pin(async move {
                            let CachedTaskType::ResolveNative { fn_type, this, arg } = &*task_type
                            else {
                                unreachable!()
                            };
                            CachedTaskType::run_resolve_native(
                                *fn_type,
                                *this,
                                &**arg,
                                task_id.persistence(),
                                turbo_tasks,
                            )
                            .await
                        }) as Pin<Box<dyn Future<Output = _> + Send + '_>>,
                    )
                }
                CachedTaskType::ResolveTrait {
                    trait_type,
                    method_name,
                    ..
                } => {
                    let span = registry::get_trait(*trait_type).resolve_span(method_name);
                    let turbo_tasks = turbo_tasks.pin();
                    (
                        span,
                        Box::pin(async move {
                            let CachedTaskType::ResolveTrait {
                                trait_type,
                                method_name,
                                this,
                                arg,
                            } = &*task_type
                            else {
                                unreachable!()
                            };
                            CachedTaskType::run_resolve_trait(
                                *trait_type,
                                method_name.clone(),
                                *this,
                                &**arg,
                                task_id.persistence(),
                                turbo_tasks,
                            )
                            .await
                        }) as Pin<Box<dyn Future<Output = _> + Send + '_>>,
                    )
                }
            },
            TaskType::Transient(task_type) => {
                let task_type = task_type.clone();
                let span = tracing::trace_span!("turbo_tasks::root_task");
                let future = match &*task_type {
                    TransientTask::Root(f) => f(),
                    TransientTask::Once(future_mutex) => take(&mut *future_mutex.lock())?,
                };
                (span, future)
            }
        };
        Some(TaskExecutionSpec { future, span })
    }

    fn task_execution_result(
        &self,
        task_id: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::UpdateOutputOperation::run(task_id, result, self.execute_context(turbo_tasks));
    }

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        _duration: Duration,
        _memory_usage: usize,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> bool {
        let ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(CachedDataItemValue::InProgress { value: in_progress }) =
            task.remove(&CachedDataItemKey::InProgress {})
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let InProgressState::InProgress {
            done_event,
            once_task: _,
            stale,
        } = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // TODO handle stateful
        let _ = stateful;

        if stale {
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            drop(task);
            drop(ctx);
        } else {
            // handle cell counters: update max index and remove cells that are no longer used
            let mut removed_cells = HashMap::new();
            let mut old_counters: HashMap<_, _> =
                get_many!(task, CellTypeMaxIndex { cell_type } max_index => (cell_type, max_index));
            for (&cell_type, &max_index) in cell_counters.iter() {
                if let Some(old_max_index) = old_counters.remove(&cell_type) {
                    if old_max_index != max_index {
                        task.insert(CachedDataItem::CellTypeMaxIndex {
                            cell_type,
                            value: max_index,
                        });
                        if old_max_index > max_index {
                            removed_cells.insert(cell_type, max_index + 1..=old_max_index);
                        }
                    }
                } else {
                    task.add_new(CachedDataItem::CellTypeMaxIndex {
                        cell_type,
                        value: max_index,
                    });
                }
            }
            for (cell_type, old_max_index) in old_counters {
                task.remove(&CachedDataItemKey::CellTypeMaxIndex { cell_type });
                removed_cells.insert(cell_type, 0..=old_max_index);
            }
            let mut removed_data = Vec::new();
            for (&cell_type, range) in removed_cells.iter() {
                for index in range.clone() {
                    removed_data.extend(
                        task.remove(&CachedDataItemKey::CellData {
                            cell: CellId {
                                type_id: cell_type,
                                index,
                            },
                        })
                        .into_iter(),
                    );
                }
            }

            // find all outdated data items (removed cells, outdated edges)
            let old_edges = if task.is_indexed() {
                task.iter(CachedDataItemIndex::Children)
                    .filter_map(|(key, _)| match *key {
                        CachedDataItemKey::OutdatedChild { task } => {
                            Some(OutdatedEdge::Child(task))
                        }
                        _ => None,
                    })
                    .chain(
                        task.iter(CachedDataItemIndex::Dependencies)
                            .filter_map(|(key, _)| match *key {
                                CachedDataItemKey::OutdatedCellDependency { target } => {
                                    Some(OutdatedEdge::CellDependency(target))
                                }
                                CachedDataItemKey::OutdatedOutputDependency { target } => {
                                    Some(OutdatedEdge::OutputDependency(target))
                                }
                                _ => None,
                            }),
                    )
                    .chain(
                        task.iter(CachedDataItemIndex::CellDependent)
                            .filter_map(|(key, _)| match *key {
                                CachedDataItemKey::CellDependent { cell, task }
                                    if removed_cells
                                        .get(&cell.type_id)
                                        .map_or(false, |range| range.contains(&cell.index)) =>
                                {
                                    Some(OutdatedEdge::RemovedCellDependent(task))
                                }
                                _ => None,
                            }),
                    )
                    .collect::<Vec<_>>()
            } else {
                task.iter_all()
                    .filter_map(|(key, _)| match *key {
                        CachedDataItemKey::OutdatedChild { task } => {
                            Some(OutdatedEdge::Child(task))
                        }
                        CachedDataItemKey::OutdatedCellDependency { target } => {
                            Some(OutdatedEdge::CellDependency(target))
                        }
                        CachedDataItemKey::OutdatedOutputDependency { target } => {
                            Some(OutdatedEdge::OutputDependency(target))
                        }
                        CachedDataItemKey::CellDependent { cell, task }
                            if removed_cells
                                .get(&cell.type_id)
                                .map_or(false, |range| range.contains(&cell.index)) =>
                        {
                            Some(OutdatedEdge::RemovedCellDependent(task))
                        }
                        _ => None,
                    })
                    .collect::<Vec<_>>()
            };

            let was_dirty = task.remove(&CachedDataItemKey::Dirty {}).is_some();
            let data_update = if was_dirty {
                let dirty_containers = get!(task, AggregatedDirtyContainerCount)
                    .copied()
                    .unwrap_or_default();
                if dirty_containers == 0 {
                    if let Some(root_state) = get!(task, AggregateRoot) {
                        root_state.all_clean_event.notify(usize::MAX);
                        if matches!(root_state.ty, ActiveType::CachedActiveUntilClean) {
                            task.remove(&CachedDataItemKey::AggregateRoot {});
                        }
                    }
                    AggregationUpdateJob::data_update(
                        &mut task,
                        AggregatedDataUpdate::no_longer_dirty_container(task_id),
                    )
                } else {
                    None
                }
            } else {
                None
            };

            drop(task);

            done_event.notify(usize::MAX);

            CleanupOldEdgesOperation::run(task_id, old_edges, data_update, ctx);

            drop(removed_data)
        }

        stale
    }

    fn run_backend_job<'a>(
        self: &'a Arc<Self>,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            if *id == 1 || *id == 2 {
                let last_snapshot = self.last_snapshot.load(Ordering::Relaxed);
                let mut last_snapshot = self.start_time + Duration::from_millis(last_snapshot);
                loop {
                    const FIRST_SNAPSHOT_WAIT: Duration = Duration::from_secs(30);
                    const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(15);

                    let time = if *id == 1 {
                        FIRST_SNAPSHOT_WAIT
                    } else {
                        SNAPSHOT_INTERVAL
                    };

                    let elapsed = last_snapshot.elapsed();
                    if elapsed < time {
                        let listener = self.stopping_event.listen();
                        if !self.stopping.load(Ordering::Acquire) {
                            let _ = timeout(time - elapsed, listener).await;
                        }
                    }

                    let this = self.clone();
                    let snapshot = turbo_tasks::spawn_blocking(move || this.snapshot()).await;
                    if let Some((snapshot_start, new_data)) = snapshot {
                        last_snapshot = snapshot_start;
                        if new_data {
                            continue;
                        }
                        let last_snapshot = last_snapshot.duration_since(self.start_time);
                        self.last_snapshot
                            .store(last_snapshot.as_millis() as u64, Ordering::Relaxed);

                        turbo_tasks.schedule_backend_background_job(BackendJobId::from(2));
                        return;
                    }
                }
            }
        })
    }

    fn try_read_own_task_cell_untracked(
        &self,
        task_id: TaskId,
        cell: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Result<TypedCellContent> {
        let ctx = self.execute_context(turbo_tasks);
        let task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(content) = get!(task, CellData { cell }) {
            Ok(CellContent(Some(content.1.clone())).into_typed(cell.type_id))
        } else {
            Ok(CellContent(None).into_typed(cell.type_id))
        }
    }

    fn update_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        operation::UpdateCellOperation::run(
            task_id,
            cell,
            content,
            self.execute_context(turbo_tasks),
        );
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) {
        ConnectChildOperation::run(parent_task, task, self.execute_context(turbo_tasks));
    }

    fn create_transient_task(&self, task_type: TransientTaskType) -> TaskId {
        let task_id = self.transient_task_id_factory.get();
        let root_type = match task_type {
            TransientTaskType::Root(_) => ActiveType::RootTask,
            TransientTaskType::Once(_) => ActiveType::OnceTask,
        };
        self.transient_tasks.insert(
            task_id,
            Arc::new(match task_type {
                TransientTaskType::Root(f) => TransientTask::Root(f),
                TransientTaskType::Once(f) => TransientTask::Once(Mutex::new(Some(f))),
            }),
        );
        {
            let mut task = self.storage.access_mut(task_id);
            let _ = task.add(CachedDataItem::AggregationNumber {
                value: AggregationNumber {
                    base: u32::MAX,
                    distance: 0,
                    effective: u32::MAX,
                },
            });
            let _ = task.add(CachedDataItem::AggregateRoot {
                value: RootState::new(root_type),
            });
            let _ = task.add(CachedDataItem::new_scheduled(move || match root_type {
                ActiveType::RootTask => "Root Task".to_string(),
                ActiveType::OnceTask => "Once Task".to_string(),
                _ => unreachable!(),
            }));
        }
        task_id
    }
}

impl Backend for TurboTasksBackend {
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.startup(turbo_tasks);
    }

    fn stopping(&self, _turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.stopping();
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        self.0
            .get_or_create_persistent_task(task_type, parent_task, turbo_tasks)
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        self.0
            .get_or_create_transient_task(task_type, parent_task, turbo_tasks)
    }

    fn invalidate_task(&self, task_id: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.invalidate_task(task_id, turbo_tasks);
    }

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.invalidate_tasks(tasks, turbo_tasks);
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.invalidate_tasks_set(tasks, turbo_tasks);
    }

    fn invalidate_serialization(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.invalidate_serialization(task_id, turbo_tasks);
    }

    fn get_task_description(&self, task: TaskId) -> std::string::String {
        self.0.get_task_description(task)
    }

    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId> {
        self.0.try_get_function_id(task_id)
    }

    type TaskState = ();
    fn new_task_state(&self, _task: TaskId) -> Self::TaskState {}

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Option<TaskExecutionSpec<'_>> {
        self.0.try_start_task_execution(task_id, turbo_tasks)
    }

    fn task_execution_result(
        &self,
        task_id: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.task_execution_result(task_id, result, turbo_tasks);
    }

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        _duration: Duration,
        _memory_usage: usize,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> bool {
        self.0.task_execution_completed(
            task_id,
            _duration,
            _memory_usage,
            cell_counters,
            stateful,
            turbo_tasks,
        )
    }

    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        self.0.run_backend_job(id, turbo_tasks)
    }

    fn try_read_task_output(
        &self,
        task_id: TaskId,
        reader: TaskId,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.0
            .try_read_task_output(task_id, Some(reader), consistency, turbo_tasks)
    }

    fn try_read_task_output_untracked(
        &self,
        task_id: TaskId,
        consistency: ReadConsistency,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.0
            .try_read_task_output(task_id, None, consistency, turbo_tasks)
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.0
            .try_read_task_cell(task_id, Some(reader), cell, turbo_tasks)
    }

    fn try_read_task_cell_untracked(
        &self,
        task_id: TaskId,
        cell: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.0.try_read_task_cell(task_id, None, cell, turbo_tasks)
    }

    fn try_read_own_task_cell_untracked(
        &self,
        task_id: TaskId,
        cell: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        self.0
            .try_read_own_task_cell_untracked(task_id, cell, turbo_tasks)
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
        task_id: TaskId,
        cell: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.update_task_cell(task_id, cell, content, turbo_tasks);
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.connect_task(task, parent_task, turbo_tasks);
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        self.0.create_transient_task(task_type)
    }
    fn dispose_root_task(&self, _: TaskId, _: &dyn TurboTasksBackendApi<Self>) {
        todo!()
    }
}
