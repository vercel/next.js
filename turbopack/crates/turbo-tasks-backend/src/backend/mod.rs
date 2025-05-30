mod dynamic_storage;
mod operation;
mod storage;

use std::{
    borrow::Cow,
    fmt::{self, Write},
    future::Future,
    hash::BuildHasherDefault,
    mem::take,
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
    thread::available_parallelism,
};

use anyhow::{Result, bail};
use auto_hash_map::{AutoMap, AutoSet};
use indexmap::IndexSet;
use parking_lot::{Condvar, Mutex};
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use smallvec::{SmallVec, smallvec};
use tokio::time::{Duration, Instant};
use turbo_tasks::{
    CellId, FunctionId, FxDashMap, KeyValuePair, RawVc, ReadCellOptions, ReadConsistency,
    SessionId, TRANSIENT_TASK_BIT, TaskId, TraitTypeId, TurboTasksBackendApi, ValueTypeId,
    backend::{
        Backend, BackendJobId, CachedTaskType, CellContent, TaskExecutionSpec, TransientTaskRoot,
        TransientTaskType, TurboTasksExecutionError, TypedCellContent,
    },
    event::{Event, EventListener},
    registry::{self, get_value_type_global_name},
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    util::IdFactoryWithReuse,
};

pub use self::{operation::AnyOperation, storage::TaskDataCategory};
#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::TaskDirtyCause;
use crate::{
    backend::{
        operation::{
            AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue,
            CleanupOldEdgesOperation, ConnectChildOperation, ExecuteContext, ExecuteContextImpl,
            Operation, OutdatedEdge, TaskGuard, connect_children, get_aggregation_number,
            is_root_node, prepare_new_children,
        },
        storage::{
            InnerStorageSnapshot, Storage, get, get_many, get_mut, get_mut_or_insert_with,
            iter_many, remove,
        },
    },
    backing_storage::BackingStorage,
    data::{
        ActivenessState, AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CachedDataItemValueRef, CellRef, CollectibleRef, CollectiblesRef, DirtyState,
        InProgressCellState, InProgressState, InProgressStateInner, OutputValue, RootType,
    },
    utils::{
        bi_map::BiMap, chunked_vec::ChunkedVec, ptr_eq_arc::PtrEqArc, sharded::Sharded, swap_retain,
    },
};

const BACKEND_JOB_INITIAL_SNAPSHOT: BackendJobId = unsafe { BackendJobId::new_unchecked(1) };
const BACKEND_JOB_FOLLOW_UP_SNAPSHOT: BackendJobId = unsafe { BackendJobId::new_unchecked(2) };

const SNAPSHOT_REQUESTED_BIT: usize = 1 << (usize::BITS - 1);

struct SnapshotRequest {
    snapshot_requested: bool,
    suspended_operations: FxHashSet<PtrEqArc<AnyOperation>>,
}

impl SnapshotRequest {
    fn new() -> Self {
        Self {
            snapshot_requested: false,
            suspended_operations: FxHashSet::default(),
        }
    }
}

type TransientTaskOnce =
    Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

pub enum TransientTask {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    ///
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    ///
    /// Active until done. Automatically scheduled.
    Once(TransientTaskOnce),
}

pub enum StorageMode {
    /// Queries the storage for cache entries that don't exist locally.
    ReadOnly,
    /// Queries the storage for cache entries that don't exist locally.
    /// Keeps a log of all changes and regularly push them to the backing storage.
    ReadWrite,
}

pub struct BackendOptions {
    /// Enables dependency tracking.
    ///
    /// When disabled: No state changes are allowed. Tasks will never reexecute and stay cached
    /// forever.
    pub dependency_tracking: bool,

    /// Enables children tracking.
    ///
    /// When disabled: Strongly consistent reads are only eventually consistent. All tasks are
    /// considered as active. Collectibles are disabled.
    pub children_tracking: bool,

    /// Enables active tracking.
    ///
    /// Automatically disabled when `dependency_tracking` is disabled.
    ///
    /// When disabled: All tasks are considered as active.
    pub active_tracking: bool,

    /// Enables the backing storage.
    pub storage_mode: Option<StorageMode>,
}

impl Default for BackendOptions {
    fn default() -> Self {
        Self {
            dependency_tracking: true,
            children_tracking: true,
            active_tracking: true,
            storage_mode: Some(StorageMode::ReadWrite),
        }
    }
}

pub struct TurboTasksBackend<B: BackingStorage>(Arc<TurboTasksBackendInner<B>>);

type TaskCacheLog = Sharded<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>;

struct TurboTasksBackendInner<B: BackingStorage> {
    options: BackendOptions,

    start_time: Instant,
    session_id: SessionId,

    persisted_task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,

    persisted_task_cache_log: Option<TaskCacheLog>,
    task_cache: BiMap<Arc<CachedTaskType>, TaskId>,
    transient_tasks: FxDashMap<TaskId, Arc<TransientTask>>,

    storage: Storage,

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
    /// The timestamp of the last started snapshot since [`Self::start_time`].
    last_snapshot: AtomicU64,

    stopping: AtomicBool,
    stopping_event: Event,
    idle_start_event: Event,
    idle_end_event: Event,
    #[cfg(feature = "verify_aggregation_graph")]
    is_idle: AtomicBool,

    task_statistics: TaskStatisticsApi,

    backing_storage: B,

    #[cfg(feature = "verify_aggregation_graph")]
    root_tasks: Mutex<FxHashSet<TaskId>>,
}

impl<B: BackingStorage> TurboTasksBackend<B> {
    pub fn new(options: BackendOptions, backing_storage: B) -> Self {
        Self(Arc::new(TurboTasksBackendInner::new(
            options,
            backing_storage,
        )))
    }
}

impl<B: BackingStorage> TurboTasksBackendInner<B> {
    pub fn new(mut options: BackendOptions, backing_storage: B) -> Self {
        let shard_amount =
            (available_parallelism().map_or(4, |v| v.get()) * 64).next_power_of_two();
        let need_log = matches!(options.storage_mode, Some(StorageMode::ReadWrite));
        if !options.dependency_tracking {
            options.active_tracking = false;
        }
        Self {
            options,
            start_time: Instant::now(),
            session_id: backing_storage
                .next_session_id()
                .expect("Failed get session id"),
            persisted_task_id_factory: IdFactoryWithReuse::new(
                backing_storage
                    .next_free_task_id()
                    .expect("Failed to get task id"),
                TaskId::try_from(TRANSIENT_TASK_BIT - 1).unwrap(),
            ),
            transient_task_id_factory: IdFactoryWithReuse::new(
                TaskId::try_from(TRANSIENT_TASK_BIT).unwrap(),
                TaskId::MAX,
            ),
            persisted_task_cache_log: need_log.then(|| Sharded::new(shard_amount)),
            task_cache: BiMap::new(),
            transient_tasks: FxDashMap::default(),
            storage: Storage::new(),
            in_progress_operations: AtomicUsize::new(0),
            snapshot_request: Mutex::new(SnapshotRequest::new()),
            operations_suspended: Condvar::new(),
            snapshot_completed: Condvar::new(),
            last_snapshot: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            stopping_event: Event::new(|| "TurboTasksBackend::stopping_event".to_string()),
            idle_start_event: Event::new(|| "TurboTasksBackend::idle_start_event".to_string()),
            idle_end_event: Event::new(|| "TurboTasksBackend::idle_end_event".to_string()),
            #[cfg(feature = "verify_aggregation_graph")]
            is_idle: AtomicBool::new(false),
            task_statistics: TaskStatisticsApi::default(),
            backing_storage,
            #[cfg(feature = "verify_aggregation_graph")]
            root_tasks: Default::default(),
        }
    }

    fn execute_context<'a>(
        &'a self,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> impl ExecuteContext<'a> {
        ExecuteContextImpl::new(self, turbo_tasks)
    }

    fn session_id(&self) -> SessionId {
        self.session_id
    }

    /// # Safety
    ///
    /// `tx` must be a transaction from this TurboTasksBackendInner instance.
    unsafe fn execute_context_with_tx<'e, 'tx>(
        &'e self,
        tx: Option<&'e B::ReadTransaction<'tx>>,
        turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> impl ExecuteContext<'e> + use<'e, 'tx, B>
    where
        'tx: 'e,
    {
        // Safety: `tx` is from `self`.
        unsafe { ExecuteContextImpl::new_with_tx(self, tx, turbo_tasks) }
    }

    fn suspending_requested(&self) -> bool {
        self.should_persist()
            && (self.in_progress_operations.load(Ordering::Relaxed) & SNAPSHOT_REQUESTED_BIT) != 0
    }

    fn operation_suspend_point(&self, suspend: impl FnOnce() -> AnyOperation) {
        #[cold]
        fn operation_suspend_point_cold<B: BackingStorage>(
            this: &TurboTasksBackendInner<B>,
            suspend: impl FnOnce() -> AnyOperation,
        ) {
            let operation = Arc::new(suspend());
            let mut snapshot_request = this.snapshot_request.lock();
            if snapshot_request.snapshot_requested {
                snapshot_request
                    .suspended_operations
                    .insert(operation.clone().into());
                let value = this.in_progress_operations.fetch_sub(1, Ordering::AcqRel) - 1;
                assert!((value & SNAPSHOT_REQUESTED_BIT) != 0);
                if value == SNAPSHOT_REQUESTED_BIT {
                    this.operations_suspended.notify_all();
                }
                this.snapshot_completed
                    .wait_while(&mut snapshot_request, |snapshot_request| {
                        snapshot_request.snapshot_requested
                    });
                this.in_progress_operations.fetch_add(1, Ordering::AcqRel);
                snapshot_request
                    .suspended_operations
                    .remove(&operation.into());
            }
        }

        if self.suspending_requested() {
            operation_suspend_point_cold(self, suspend);
        }
    }

    pub(crate) fn start_operation(&self) -> OperationGuard<'_, B> {
        if !self.should_persist() {
            return OperationGuard { backend: None };
        }
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
        OperationGuard {
            backend: Some(self),
        }
    }

    fn should_persist(&self) -> bool {
        matches!(self.options.storage_mode, Some(StorageMode::ReadWrite))
    }

    fn should_restore(&self) -> bool {
        self.options.storage_mode.is_some()
    }

    fn should_track_dependencies(&self) -> bool {
        self.options.dependency_tracking
    }

    fn should_track_activeness(&self) -> bool {
        self.options.active_tracking
    }

    fn should_track_children(&self) -> bool {
        self.options.children_tracking
    }

    fn track_cache_hit(&self, task_type: &CachedTaskType) {
        self.task_statistics
            .map(|stats| stats.increment_cache_hit(task_type.fn_type));
    }

    fn track_cache_miss(&self, task_type: &CachedTaskType) {
        self.task_statistics
            .map(|stats| stats.increment_cache_miss(task_type.fn_type));
    }
}

pub(crate) struct OperationGuard<'a, B: BackingStorage> {
    backend: Option<&'a TurboTasksBackendInner<B>>,
}

impl<B: BackingStorage> Drop for OperationGuard<'_, B> {
    fn drop(&mut self) {
        if let Some(backend) = self.backend {
            let fetch_sub = backend
                .in_progress_operations
                .fetch_sub(1, Ordering::AcqRel);
            if fetch_sub - 1 == SNAPSHOT_REQUESTED_BIT {
                backend.operations_suspended.notify_all();
            }
        }
    }
}

// Operations
impl<B: BackingStorage> TurboTasksBackendInner<B> {
    /// # Safety
    ///
    /// `tx` must be a transaction from this TurboTasksBackendInner instance.
    unsafe fn connect_child_with_tx<'l, 'tx: 'l>(
        &'l self,
        tx: Option<&'l B::ReadTransaction<'tx>>,
        parent_task: TaskId,
        child_task: TaskId,
        turbo_tasks: &'l dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        operation::ConnectChildOperation::run(parent_task, child_task, unsafe {
            self.execute_context_with_tx(tx, turbo_tasks)
        });
    }

    fn connect_child(
        &self,
        parent_task: TaskId,
        child_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
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
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<Result<RawVc, EventListener>> {
        if let Some(reader) = reader {
            self.assert_not_persistent_calling_transient(reader, task_id, /* cell_id */ None);
        }

        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);

        fn listen_to_done_event<B: BackingStorage>(
            this: &TurboTasksBackendInner<B>,
            reader: Option<TaskId>,
            done_event: &Event,
        ) -> EventListener {
            let reader_desc = reader.map(|r| this.get_task_desc_fn(r));
            done_event.listen_with_note(move || {
                if let Some(reader_desc) = reader_desc.as_ref() {
                    format!("try_read_task_output from {}", reader_desc())
                } else {
                    "try_read_task_output (untracked)".to_string()
                }
            })
        }

        fn check_in_progress<B: BackingStorage>(
            this: &TurboTasksBackendInner<B>,
            task: &impl TaskGuard,
            reader: Option<TaskId>,
            ctx: &impl ExecuteContext<'_>,
        ) -> Option<std::result::Result<std::result::Result<RawVc, EventListener>, anyhow::Error>>
        {
            match get!(task, InProgress) {
                Some(InProgressState::Scheduled { done_event, .. }) => {
                    Some(Ok(Err(listen_to_done_event(this, reader, done_event))))
                }
                Some(InProgressState::InProgress(box InProgressStateInner {
                    done,
                    done_event,
                    ..
                })) => {
                    if !*done {
                        Some(Ok(Err(listen_to_done_event(this, reader, done_event))))
                    } else {
                        None
                    }
                }
                Some(InProgressState::Canceled) => Some(Err(anyhow::anyhow!(
                    "{} was canceled",
                    ctx.get_task_description(task.id())
                ))),
                None => None,
            }
        }

        if self.should_track_children() && matches!(consistency, ReadConsistency::Strong) {
            // Ensure it's an root node
            loop {
                let aggregation_number = get_aggregation_number(&task);
                if is_root_node(aggregation_number) {
                    break;
                }
                drop(task);
                {
                    let _span = tracing::trace_span!(
                        "make root node for strongly consistent read",
                        %task_id
                    )
                    .entered();
                    AggregationUpdateQueue::run(
                        AggregationUpdateJob::UpdateAggregationNumber {
                            task_id,
                            base_aggregation_number: u32::MAX,
                            distance: None,
                        },
                        &mut ctx,
                    );
                }
                task = ctx.task(task_id, TaskDataCategory::All);
            }

            let is_dirty =
                get!(task, Dirty).map_or(false, |dirty_state| dirty_state.get(self.session_id));

            // Check the dirty count of the root node
            let dirty_tasks = get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default()
                .get(self.session_id);
            if dirty_tasks > 0 || is_dirty {
                let root = get_mut!(task, Activeness);
                let mut task_ids_to_schedule: Vec<_> = Vec::new();
                // When there are dirty task, subscribe to the all_clean_event
                let root = if let Some(root) = root {
                    // This makes sure all tasks stay active and this task won't stale.
                    // active_until_clean is automatically removed when this
                    // task is clean.
                    root.set_active_until_clean();
                    root
                } else {
                    // If we don't have a root state, add one. This also makes sure all tasks stay
                    // active and this task won't stale. active_until_clean
                    // is automatically removed when this task is clean.
                    get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id))
                        .set_active_until_clean();
                    if ctx.should_track_activeness() {
                        // A newly added Activeness need to make sure to schedule the tasks
                        task_ids_to_schedule = get_many!(
                            task,
                            AggregatedDirtyContainer {
                                task
                            } count if count.get(self.session_id) > 0 => {
                                task
                            }
                        );
                        task_ids_to_schedule.push(task_id);
                    }
                    get!(task, Activeness).unwrap()
                };
                let listener = root.all_clean_event.listen_with_note(move || {
                    format!("try_read_task_output (strongly consistent) from {reader:?}")
                });
                drop(task);
                if !task_ids_to_schedule.is_empty() {
                    let mut queue = AggregationUpdateQueue::new();
                    queue.extend_find_and_schedule_dirty(task_ids_to_schedule);
                    queue.execute(&mut ctx);
                }

                return Ok(Err(listener));
            }
        }

        if let Some(value) = check_in_progress(self, &task, reader, &ctx) {
            return value;
        }

        if let Some(output) = get!(task, Output) {
            let result = match output {
                OutputValue::Cell(cell) => Ok(Ok(RawVc::TaskCell(cell.task, cell.cell))),
                OutputValue::Output(task) => Ok(Ok(RawVc::TaskOutput(*task))),
                OutputValue::Error(error) => {
                    let err: anyhow::Error = error.clone().into();
                    Err(err.context(format!(
                        "Execution of {} failed",
                        ctx.get_task_description(task_id)
                    )))
                }
            };
            if self.should_track_dependencies() {
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
            }

            return result;
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
        // It's not possible that the task is InProgress at this point. If it is InProgress {
        // done: true } it must have Output and would early return.
        task.add_new(item);
        turbo_tasks.schedule(task_id);

        Ok(Err(listener))
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        if let Some(reader) = reader {
            self.assert_not_persistent_calling_transient(reader, task_id, Some(cell));
        }

        fn add_cell_dependency<B: BackingStorage>(
            backend: &TurboTasksBackendInner<B>,
            mut task: impl TaskGuard,
            reader: Option<TaskId>,
            cell: CellId,
            task_id: TaskId,
            ctx: &mut impl ExecuteContext<'_>,
        ) {
            if !backend.should_track_dependencies() {
                return;
            }
            if let Some(reader) = reader {
                if reader == task_id {
                    // We never want to have a dependency on ourselves, otherwise we end up in a
                    // loop of re-executing the same task.
                    return;
                }
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
        }

        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        let content = if options.final_read_hint {
            remove!(task, CellData { cell })
        } else if let Some(content) = get!(task, CellData { cell }) {
            let content = content.clone();
            Some(content)
        } else {
            None
        };
        if let Some(content) = content {
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
            return Ok(Ok(TypedCellContent(
                cell.type_id,
                CellContent(Some(content.1)),
            )));
        }

        let in_progress = get!(task, InProgress);
        if matches!(
            in_progress,
            Some(InProgressState::InProgress(..) | InProgressState::Scheduled { .. })
        ) {
            return Ok(Err(self.listen_to_cell(&mut task, task_id, reader, cell).0));
        }
        let is_cancelled = matches!(in_progress, Some(InProgressState::Canceled));
        let is_scheduled = matches!(in_progress, Some(InProgressState::Scheduled { .. }));

        // Check cell index range (cell might not exist at all)
        let max_id = get!(
            task,
            CellTypeMaxIndex {
                cell_type: cell.type_id
            }
        )
        .copied();
        let Some(max_id) = max_id else {
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
            bail!(
                "Cell {cell:?} no longer exists in task {} (no cell of this type exists)",
                ctx.get_task_description(task_id)
            );
        };
        if cell.index >= max_id {
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
            bail!(
                "Cell {cell:?} no longer exists in task {} (index out of bounds)",
                ctx.get_task_description(task_id)
            );
        }

        // Cell should exist, but data was dropped or is not serializable. We need to recompute the
        // task the get the cell content.

        // Listen to the cell and potentially schedule the task
        let (listener, new_listener) = self.listen_to_cell(&mut task, task_id, reader, cell);
        if !new_listener {
            return Ok(Err(listener));
        }

        let _span = tracing::trace_span!(
            "recomputation",
            cell_type = registry::get_value_type_global_name(cell.type_id),
            cell_index = cell.index
        )
        .entered();

        // Schedule the task, if not already scheduled
        if is_cancelled {
            bail!("{} was canceled", ctx.get_task_description(task_id));
        } else if !is_scheduled
            && task.add(CachedDataItem::new_scheduled(
                self.get_task_desc_fn(task_id),
            ))
        {
            turbo_tasks.schedule(task_id);
        }

        Ok(Err(listener))
    }

    fn listen_to_cell(
        &self,
        task: &mut impl TaskGuard,
        task_id: TaskId,
        reader: Option<TaskId>,
        cell: CellId,
    ) -> (EventListener, bool) {
        let reader_desc = reader.map(|r| self.get_task_desc_fn(r));
        let note = move || {
            if let Some(reader_desc) = reader_desc.as_ref() {
                format!("try_read_task_cell (in progress) from {}", reader_desc())
            } else {
                "try_read_task_cell (in progress, untracked)".to_string()
            }
        };
        if let Some(in_progress) = get!(task, InProgressCell { cell }) {
            // Someone else is already computing the cell
            let listener = in_progress.event.listen_with_note(note);
            return (listener, false);
        }
        let in_progress = InProgressCellState::new(task_id, cell);
        let listener = in_progress.event.listen_with_note(note);
        task.add_new(CachedDataItem::InProgressCell {
            cell,
            value: in_progress,
        });
        (listener, true)
    }

    fn lookup_task_type(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>> {
        if let Some(task_type) = self.task_cache.lookup_reverse(&task_id) {
            return Some(task_type);
        }
        if self.should_restore() && !task_id.is_transient() {
            if let Some(task_type) = unsafe {
                self.backing_storage
                    .reverse_lookup_task_cache(None, task_id)
                    .expect("Failed to lookup task type")
            } {
                let _ = self.task_cache.try_insert(task_type.clone(), task_id);
                return Some(task_type);
            }
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
        debug_assert!(self.should_persist());
        let mut snapshot_request = self.snapshot_request.lock();
        snapshot_request.snapshot_requested = true;
        let active_operations = self
            .in_progress_operations
            .fetch_or(SNAPSHOT_REQUESTED_BIT, Ordering::Relaxed);
        if active_operations != 0 {
            self.operations_suspended
                .wait_while(&mut snapshot_request, |_| {
                    self.in_progress_operations.load(Ordering::Relaxed) != SNAPSHOT_REQUESTED_BIT
                });
        }
        let suspended_operations = snapshot_request
            .suspended_operations
            .iter()
            .map(|op| op.arc().clone())
            .collect::<Vec<_>>();
        drop(snapshot_request);
        let mut persisted_task_cache_log = self
            .persisted_task_cache_log
            .as_ref()
            .map(|l| l.take(|i| i))
            .unwrap_or_default();
        self.storage.start_snapshot();
        let mut snapshot_request = self.snapshot_request.lock();
        snapshot_request.snapshot_requested = false;
        self.in_progress_operations
            .fetch_sub(SNAPSHOT_REQUESTED_BIT, Ordering::Relaxed);
        self.snapshot_completed.notify_all();
        let snapshot_time = Instant::now();
        drop(snapshot_request);

        let preprocess = |task_id: TaskId, inner: &storage::InnerStorage| {
            if task_id.is_transient() {
                return (None, None);
            }
            let len = inner.len();
            let mut meta = Vec::with_capacity(len);
            let mut data = Vec::with_capacity(len);
            for (key, value) in inner.iter_all() {
                if key.is_persistent() && value.is_persistent() {
                    match key.category() {
                        TaskDataCategory::Meta => {
                            meta.push(CachedDataItem::from_key_and_value_ref(key, value))
                        }
                        TaskDataCategory::Data => {
                            data.push(CachedDataItem::from_key_and_value_ref(key, value))
                        }
                        _ => {}
                    }
                }
            }

            (
                inner.state().meta_restored().then_some(meta),
                inner.state().data_restored().then_some(data),
            )
        };
        let process = |task_id: TaskId, (meta, data): (Option<Vec<_>>, Option<Vec<_>>)| {
            (
                task_id,
                meta.map(|d| B::serialize(task_id, &d)),
                data.map(|d| B::serialize(task_id, &d)),
            )
        };
        let process_snapshot = |task_id: TaskId, inner: Box<InnerStorageSnapshot>| {
            if task_id.is_transient() {
                return (task_id, None, None);
            }
            let len = inner.len();
            let mut meta = inner.meta_modified.then(|| Vec::with_capacity(len));
            let mut data = inner.data_modified.then(|| Vec::with_capacity(len));
            for (key, value) in inner.iter_all() {
                if key.is_persistent() && value.is_persistent() {
                    match key.category() {
                        TaskDataCategory::Meta => {
                            if let Some(meta) = &mut meta {
                                meta.push(CachedDataItem::from_key_and_value_ref(key, value));
                            }
                        }
                        TaskDataCategory::Data => {
                            if let Some(data) = &mut data {
                                data.push(CachedDataItem::from_key_and_value_ref(key, value));
                            }
                        }
                        _ => {}
                    }
                }
            }
            (
                task_id,
                meta.map(|meta| B::serialize(task_id, &meta)),
                data.map(|data| B::serialize(task_id, &data)),
            )
        };

        let snapshot = {
            let _span = tracing::trace_span!("take snapshot");
            self.storage
                .take_snapshot(&preprocess, &process, &process_snapshot)
        };

        let task_snapshots = snapshot
            .into_iter()
            .filter_map(|iter| {
                let mut iter = iter
                    .filter_map(
                        |(task_id, meta, data): (
                            _,
                            Option<Result<SmallVec<_>>>,
                            Option<Result<SmallVec<_>>>,
                        )| {
                            let meta = match meta {
                                Some(Ok(meta)) => Some(meta),
                                None => None,
                                Some(Err(err)) => {
                                    println!(
                                        "Serializing task {} failed (meta): {:?}",
                                        self.get_task_description(task_id),
                                        err
                                    );
                                    None
                                }
                            };
                            let data = match data {
                                Some(Ok(data)) => Some(data),
                                None => None,
                                Some(Err(err)) => {
                                    println!(
                                        "Serializing task {} failed (data): {:?}",
                                        self.get_task_description(task_id),
                                        err
                                    );
                                    None
                                }
                            };
                            (meta.is_some() || data.is_some()).then_some((task_id, meta, data))
                        },
                    )
                    .peekable();
                iter.peek().is_some().then_some(iter)
            })
            .collect::<Vec<_>>();

        swap_retain(&mut persisted_task_cache_log, |shard| !shard.is_empty());

        let mut new_items = false;

        if !persisted_task_cache_log.is_empty() || !task_snapshots.is_empty() {
            new_items = true;
            if let Err(err) = self.backing_storage.save_snapshot(
                self.session_id,
                suspended_operations,
                persisted_task_cache_log,
                task_snapshots,
            ) {
                println!("Persisting failed: {err:?}");
                return None;
            }
        }

        Some((snapshot_time, new_items))
    }

    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>) {
        if self.should_restore() {
            // Continue all uncompleted operations
            // They can't be interrupted by a snapshot since the snapshotting job has not been
            // scheduled yet.
            let uncompleted_operations = self
                .backing_storage
                .uncompleted_operations()
                .expect("Failed to get uncompleted operations");
            if !uncompleted_operations.is_empty() {
                let mut ctx = self.execute_context(turbo_tasks);
                for op in uncompleted_operations {
                    op.execute(&mut ctx);
                }
            }
        }

        if self.should_persist() {
            // Schedule the snapshot job
            turbo_tasks.schedule_backend_background_job(BACKEND_JOB_INITIAL_SNAPSHOT);
        }
    }

    fn stopping(&self) {
        self.stopping.store(true, Ordering::Release);
        self.stopping_event.notify(usize::MAX);
    }

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>) {
        #[cfg(feature = "verify_aggregation_graph")]
        {
            self.is_idle.store(false, Ordering::Release);
            self.verify_aggregation_graph(turbo_tasks, false);
        }
        if let Err(err) = self.backing_storage.shutdown() {
            println!("Shutting down failed: {err}");
        }
    }

    #[allow(unused_variables)]
    fn idle_start(self: &Arc<Self>, turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>) {
        self.idle_start_event.notify(usize::MAX);

        #[cfg(feature = "verify_aggregation_graph")]
        {
            use tokio::select;

            self.is_idle.store(true, Ordering::Release);
            let this = self.clone();
            let turbo_tasks = turbo_tasks.pin();
            tokio::task::spawn(async move {
                select! {
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {
                        // do nothing
                    }
                    _ = this.idle_end_event.listen() => {
                        return;
                    }
                }
                if !this.is_idle.load(Ordering::Relaxed) {
                    return;
                }
                this.verify_aggregation_graph(&*turbo_tasks, true);
            });
        }
    }

    fn idle_end(&self) {
        #[cfg(feature = "verify_aggregation_graph")]
        self.is_idle.store(false, Ordering::Release);
        self.idle_end_event.notify(usize::MAX);
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> TaskId {
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.track_cache_hit(&task_type);
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        self.track_cache_miss(&task_type);
        let tx = self
            .should_restore()
            .then(|| self.backing_storage.start_read_transaction())
            .flatten();
        let task_id = {
            // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
            if let Some(task_id) = unsafe {
                self.backing_storage
                    .forward_lookup_task_cache(tx.as_ref(), &task_type)
                    .expect("Failed to lookup task id")
            } {
                let _ = self.task_cache.try_insert(Arc::new(task_type), task_id);
                task_id
            } else {
                let task_type = Arc::new(task_type);
                let task_id = self.persisted_task_id_factory.get();
                let task_id = if let Err(existing_task_id) =
                    self.task_cache.try_insert(task_type.clone(), task_id)
                {
                    // Safety: We just created the id and failed to insert it.
                    unsafe {
                        self.persisted_task_id_factory.reuse(task_id);
                    }
                    existing_task_id
                } else {
                    task_id
                };
                if let Some(log) = &self.persisted_task_cache_log {
                    log.lock(task_id).push((task_type, task_id));
                }
                task_id
            }
        };

        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        unsafe { self.connect_child_with_tx(tx.as_ref(), parent_task, task_id, turbo_tasks) };

        task_id
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> TaskId {
        if !parent_task.is_transient() {
            self.panic_persistent_calling_transient(
                self.lookup_task_type(parent_task).as_deref(),
                Some(&task_type),
                /* cell_id */ None,
            );
        }
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.track_cache_hit(&task_type);
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        self.track_cache_miss(&task_type);
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

    /// Generate an object that implements [`fmt::Display`] explaining why the given
    /// [`CachedTaskType`] is transient.
    fn debug_trace_transient_task(
        &self,
        task_type: &CachedTaskType,
        cell_id: Option<CellId>,
    ) -> DebugTraceTransientTask {
        // it shouldn't be possible to have cycles in tasks, but we could have an exponential blowup
        // from tracing the same task many times, so use a visited_set
        fn inner_id(
            backend: &TurboTasksBackendInner<impl BackingStorage>,
            task_id: TaskId,
            cell_type_id: Option<ValueTypeId>,
            visited_set: &mut FxHashSet<TaskId>,
        ) -> DebugTraceTransientTask {
            if let Some(task_type) = backend.lookup_task_type(task_id) {
                if visited_set.contains(&task_id) {
                    let task_name = task_type.get_name();
                    DebugTraceTransientTask::Collapsed {
                        task_name,
                        cell_type_id,
                    }
                } else {
                    inner_cached(backend, &task_type, cell_type_id, visited_set)
                }
            } else {
                DebugTraceTransientTask::Uncached { cell_type_id }
            }
        }
        fn inner_cached(
            backend: &TurboTasksBackendInner<impl BackingStorage>,
            task_type: &CachedTaskType,
            cell_type_id: Option<ValueTypeId>,
            visited_set: &mut FxHashSet<TaskId>,
        ) -> DebugTraceTransientTask {
            let task_name = task_type.get_name();

            let cause_self = task_type.this.and_then(|cause_self_raw_vc| {
                let Some(task_id) = cause_self_raw_vc.try_get_task_id() else {
                    // `task_id` should never be `None` at this point, as that would imply a
                    // non-local task is returning a local `Vc`...
                    // Just ignore if it happens, as we're likely already panicking.
                    return None;
                };
                if task_id.is_transient() {
                    Some(Box::new(inner_id(
                        backend,
                        task_id,
                        cause_self_raw_vc.try_get_type_id(),
                        visited_set,
                    )))
                } else {
                    None
                }
            });
            let cause_args = task_type
                .arg
                .get_raw_vcs()
                .into_iter()
                .filter_map(|raw_vc| {
                    let Some(task_id) = raw_vc.try_get_task_id() else {
                        // `task_id` should never be `None` (see comment above)
                        return None;
                    };
                    if !task_id.is_transient() {
                        return None;
                    }
                    Some((task_id, raw_vc.try_get_type_id()))
                })
                .collect::<IndexSet<_>>() // dedupe
                .into_iter()
                .map(|(task_id, cell_type_id)| {
                    inner_id(backend, task_id, cell_type_id, visited_set)
                })
                .collect();

            DebugTraceTransientTask::Cached {
                task_name,
                cell_type_id,
                cause_self,
                cause_args,
            }
        }
        inner_cached(
            self,
            task_type,
            cell_id.map(|c| c.type_id),
            &mut FxHashSet::default(),
        )
    }

    fn invalidate_task(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            smallvec![task_id],
            #[cfg(feature = "trace_task_dirty")]
            TaskDirtyCause::Invalidator,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_tasks(
        &self,
        tasks: &[TaskId],
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            #[cfg(feature = "trace_task_dirty")]
            TaskDirtyCause::Unknown,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            #[cfg(feature = "trace_task_dirty")]
            TaskDirtyCause::Unknown,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_serialization(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        if task_id.is_transient() {
            return;
        }
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        task.invalidate_serialization();
    }

    fn get_task_description(&self, task_id: TaskId) -> String {
        self.lookup_task_type(task_id).map_or_else(
            || format!("{task_id:?} transient"),
            |task_type| task_type.to_string(),
        )
    }

    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId> {
        self.lookup_task_type(task_id)
            .map(|task_type| task_type.fn_type)
    }

    fn task_execution_canceled(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(in_progress) = remove!(task, InProgress) {
            match in_progress {
                InProgressState::Scheduled { done_event } => done_event.notify(usize::MAX),
                InProgressState::InProgress(box InProgressStateInner { done_event, .. }) => {
                    done_event.notify(usize::MAX)
                }
                InProgressState::Canceled => {}
            }
        }
        task.add_new(CachedDataItem::InProgress {
            value: InProgressState::Canceled,
        });
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
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
            let mut ctx = self.execute_context(turbo_tasks);
            let mut task = ctx.task(task_id, TaskDataCategory::All);
            let in_progress = remove!(task, InProgress)?;
            let InProgressState::Scheduled { done_event } = in_progress else {
                task.add_new(CachedDataItem::InProgress { value: in_progress });
                return None;
            };
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::InProgress(Box::new(InProgressStateInner {
                    stale: false,
                    once_task,
                    done_event,
                    session_dependent: false,
                    marked_as_completed: false,
                    done: false,
                    new_children: Default::default(),
                })),
            });

            if self.should_track_children() {
                // Make all current collectibles outdated (remove left-over outdated collectibles)
                enum Collectible {
                    Current(CollectibleRef, i32),
                    Outdated(CollectibleRef),
                }
                let collectibles = iter_many!(task, Collectible { collectible } value => Collectible::Current(collectible, *value))
                    .chain(iter_many!(task, OutdatedCollectible { collectible } => Collectible::Outdated(collectible)))
                    .collect::<Vec<_>>();
                for collectible in collectibles {
                    match collectible {
                        Collectible::Current(collectible, value) => {
                            let _ = task
                                .insert(CachedDataItem::OutdatedCollectible { collectible, value });
                        }
                        Collectible::Outdated(collectible) => {
                            if !task.has_key(&CachedDataItemKey::Collectible { collectible }) {
                                task.remove(&CachedDataItemKey::OutdatedCollectible {
                                    collectible,
                                });
                            }
                        }
                    }
                }
            }

            if self.should_track_dependencies() {
                // Make all dependencies outdated
                enum Dep {
                    CurrentCell(CellRef),
                    CurrentOutput(TaskId),
                    OutdatedCell(CellRef),
                    OutdatedOutput(TaskId),
                }
                let dependencies = iter_many!(task, CellDependency { target } => Dep::CurrentCell(target))
                    .chain(iter_many!(task, OutputDependency { target } => Dep::CurrentOutput(target)))
                    .chain(iter_many!(task, OutdatedCellDependency { target } => Dep::OutdatedCell(target)))
                    .chain(iter_many!(task, OutdatedOutputDependency { target } => Dep::OutdatedOutput(target)))
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
                            if !task
                                .has_key(&CachedDataItemKey::OutputDependency { target: output })
                            {
                                task.remove(&CachedDataItemKey::OutdatedOutputDependency {
                                    target: output,
                                });
                            }
                        }
                    }
                }
            }
        }

        let (span, future) = match task_type {
            TaskType::Cached(task_type) => {
                let CachedTaskType { fn_type, this, arg } = &*task_type;
                (
                    registry::get_function(*fn_type).span(task_id.persistence()),
                    registry::get_function(*fn_type).execute(*this, &**arg),
                )
            }
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
        result: Result<RawVc, TurboTasksExecutionError>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
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
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> bool {
        // Task completion is a 4 step process:
        // 1. Remove old edges (dependencies, collectibles, children, cells) and update the
        //    aggregation number of the task and the new children.
        // 2. Connect the new children to the task (and do the relevant aggregation updates).
        // 3. Remove dirty flag (and propagate that to uppers) and remove the in-progress state.
        // 4. Shrink the task memory to reduce footprint of the task.

        // Due to persistance it is possible that the process is cancelled after any step. This is
        // ok, since the dirty flag won't be removed until step 3 and step 4 is only affecting the
        // in-memory representation.

        // The task might be invalidated during this process, so we need to change the stale flag
        // at the start of every step.

        let _span = tracing::trace_span!("task execution completed").entered();
        let mut ctx = self.execute_context(turbo_tasks);

        //// STEP 1 ////

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = get_mut!(task, InProgress) else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let &mut InProgressState::InProgress(box InProgressStateInner {
            stale,
            ref mut done,
            ref done_event,
            ref mut new_children,
            ..
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        if stale {
            let Some(InProgressState::InProgress(box InProgressStateInner {
                done_event,
                mut new_children,
                ..
            })) = remove!(task, InProgress)
            else {
                unreachable!();
            };
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            // Remove old children from new_children to leave only the children that had their
            // active count increased
            for task in iter_many!(task, Child { task } => task) {
                new_children.remove(&task);
            }
            drop(task);

            // We need to undo the active count increase for the children since we throw away the
            // new_children list now.
            AggregationUpdateQueue::run(
                AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_children.into_iter().collect(),
                },
                &mut ctx,
            );
            return true;
        }

        // mark the task as completed, so dependent tasks can continue working
        *done = true;
        done_event.notify(usize::MAX);

        // take the children from the task to process them
        let mut new_children = take(new_children);

        // handle stateful
        if stateful {
            let _ = task.add(CachedDataItem::Stateful { value: () });
        }

        // handle cell counters: update max index and remove cells that are no longer used
        let old_counters: FxHashMap<_, _> =
            get_many!(task, CellTypeMaxIndex { cell_type } max_index => (cell_type, *max_index));
        let mut counters_to_remove = old_counters.clone();
        for (&cell_type, &max_index) in cell_counters.iter() {
            if let Some(old_max_index) = counters_to_remove.remove(&cell_type) {
                if old_max_index != max_index {
                    task.insert(CachedDataItem::CellTypeMaxIndex {
                        cell_type,
                        value: max_index,
                    });
                }
            } else {
                task.add_new(CachedDataItem::CellTypeMaxIndex {
                    cell_type,
                    value: max_index,
                });
            }
        }
        for (cell_type, _) in counters_to_remove {
            task.remove(&CachedDataItemKey::CellTypeMaxIndex { cell_type });
        }

        let mut queue = AggregationUpdateQueue::new();

        let mut removed_data = Vec::new();
        let mut old_edges = Vec::new();

        let has_children = !new_children.is_empty();

        // Prepare all new children
        if has_children {
            prepare_new_children(task_id, &mut task, &new_children, &mut queue);
        }

        // Filter actual new children
        if has_children {
            old_edges.extend(
                iter_many!(task, Child { task } => task)
                    .filter(|task| !new_children.remove(task))
                    .map(OutdatedEdge::Child),
            );
        } else {
            old_edges.extend(iter_many!(task, Child { task } => task).map(OutdatedEdge::Child));
        }

        // Remove no longer existing cells and
        // find all outdated data items (removed cells, outdated edges)
        // Note: For persistent tasks we only want to call extract_if when there are actual cells to
        // remove to avoid tracking that as modification.
        if task_id.is_transient() || iter_many!(task, CellData { cell }
            if cell_counters.get(&cell.type_id).is_none_or(|start_index| cell.index >= *start_index) => cell
        ).count() > 0 {
            removed_data.extend(task.extract_if(CachedDataItemType::CellData, |key, _| {
                matches!(key, CachedDataItemKey::CellData { cell } if cell_counters
                            .get(&cell.type_id).is_none_or(|start_index| cell.index >= *start_index))
            }));
        }
        if self.should_track_children() {
            old_edges.extend(
                task.iter(CachedDataItemType::OutdatedCollectible)
                    .filter_map(|(key, value)| match (key, value) {
                        (
                            CachedDataItemKey::OutdatedCollectible { collectible },
                            CachedDataItemValueRef::OutdatedCollectible { value },
                        ) => Some(OutdatedEdge::Collectible(collectible, *value)),
                        _ => None,
                    }),
            );
        }
        if self.should_track_dependencies() {
            old_edges.extend(iter_many!(task, OutdatedCellDependency { target } => OutdatedEdge::CellDependency(target)));
            old_edges.extend(iter_many!(task, OutdatedOutputDependency { target } => OutdatedEdge::OutputDependency(target)));
            old_edges.extend(
                iter_many!(task, CellDependent { cell, task } => (cell, task)).filter_map(
                    |(cell, task)| {
                        if cell_counters
                            .get(&cell.type_id)
                            .is_none_or(|start_index| cell.index >= *start_index)
                        {
                            if let Some(old_counter) = old_counters.get(&cell.type_id) {
                                if cell.index < *old_counter {
                                    return Some(OutdatedEdge::RemovedCellDependent {
                                        task_id: task,
                                        #[cfg(feature = "trace_task_dirty")]
                                        value_type_id: cell.type_id,
                                    });
                                }
                            }
                        }
                        None
                    },
                ),
            );
        }

        drop(task);

        if !queue.is_empty() || !old_edges.is_empty() {
            #[cfg(feature = "trace_task_completion")]
            let _span = tracing::trace_span!("remove old edges and prepare new children").entered();
            // Remove outdated edges first, before removing in_progress+dirty flag.
            // We need to make sure all outdated edges are removed before the task can potentially
            // be scheduled and executed again
            CleanupOldEdgesOperation::run(task_id, old_edges, queue, &mut ctx);
        }

        // When restoring from persistent caching the following might not be executed (since we can
        // suspend in `CleanupOldEdgesOperation`), but that's ok as the task is still dirty and
        // would be executed again.

        //// STEP 2 ////

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = get!(task, InProgress) else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let InProgressState::InProgress(box InProgressStateInner { stale, .. }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        if *stale {
            let Some(InProgressState::InProgress(box InProgressStateInner { done_event, .. })) =
                remove!(task, InProgress)
            else {
                unreachable!();
            };
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            drop(task);

            // All `new_children` are currently hold active with an active count and we need to undo
            // that. (We already filtered out the old children from that list)
            AggregationUpdateQueue::run(
                AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_children.into_iter().collect(),
                },
                &mut ctx,
            );
            return true;
        }

        let mut queue = AggregationUpdateQueue::new();

        if has_children {
            let has_active_count = ctx.should_track_activeness()
                && get!(task, Activeness).map_or(false, |activeness| activeness.active_counter > 0);
            connect_children(
                task_id,
                &mut task,
                new_children,
                &mut queue,
                has_active_count,
                ctx.should_track_activeness(),
            );
        }

        drop(task);

        if has_children {
            #[cfg(feature = "trace_task_completion")]
            let _span = tracing::trace_span!("connect new children").entered();
            queue.execute(&mut ctx);
        }

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = remove!(task, InProgress) else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let InProgressState::InProgress(box InProgressStateInner {
            done_event,
            once_task: _,
            stale,
            session_dependent,
            done: _,
            marked_as_completed: _,
            new_children,
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        debug_assert!(new_children.is_empty());

        // If the task is stale, reschedule it
        if stale {
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            return true;
        }

        // Notify in progress cells
        removed_data.extend(task.extract_if(
            CachedDataItemType::InProgressCell,
            |key, value| match (key, value) {
                (
                    CachedDataItemKey::InProgressCell { .. },
                    CachedDataItemValueRef::InProgressCell { value },
                ) => {
                    value.event.notify(usize::MAX);
                    true
                }
                _ => false,
            },
        ));

        // Update the dirty state
        let old_dirty_state = get!(task, Dirty).copied();

        let new_dirty_state = if session_dependent {
            Some(DirtyState {
                clean_in_session: Some(self.session_id),
            })
        } else {
            None
        };

        let data_update = if old_dirty_state != new_dirty_state {
            if let Some(new_dirty_state) = new_dirty_state {
                task.insert(CachedDataItem::Dirty {
                    value: new_dirty_state,
                });
            } else {
                task.remove(&CachedDataItemKey::Dirty {});
            }

            if self.should_track_children()
                && (old_dirty_state.is_some() || new_dirty_state.is_some())
            {
                let mut dirty_containers = get!(task, AggregatedDirtyContainerCount)
                    .cloned()
                    .unwrap_or_default();
                if let Some(old_dirty_state) = old_dirty_state {
                    dirty_containers.update_with_dirty_state(&old_dirty_state);
                }
                let aggregated_update = match (old_dirty_state, new_dirty_state) {
                    (None, None) => unreachable!(),
                    (Some(old), None) => dirty_containers.undo_update_with_dirty_state(&old),
                    (None, Some(new)) => dirty_containers.update_with_dirty_state(&new),
                    (Some(old), Some(new)) => dirty_containers.replace_dirty_state(&old, &new),
                };
                if !aggregated_update.is_zero() {
                    if aggregated_update.get(self.session_id) < 0 {
                        if let Some(root_state) = get_mut!(task, Activeness) {
                            root_state.all_clean_event.notify(usize::MAX);
                            root_state.unset_active_until_clean();
                            if root_state.is_empty() {
                                task.remove(&CachedDataItemKey::Activeness {});
                            }
                        }
                    }
                    AggregationUpdateJob::data_update(
                        &mut task,
                        AggregatedDataUpdate::new()
                            .dirty_container_update(task_id, aggregated_update),
                    )
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        drop(task);

        if let Some(data_update) = data_update {
            AggregationUpdateQueue::run(data_update, &mut ctx);
        }

        drop(removed_data);

        //// STEP 4 ////

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        task.shrink_to_fit(CachedDataItemType::CellData);
        task.shrink_to_fit(CachedDataItemType::CellTypeMaxIndex);
        task.shrink_to_fit(CachedDataItemType::CellDependency);
        task.shrink_to_fit(CachedDataItemType::OutputDependency);
        task.shrink_to_fit(CachedDataItemType::CollectiblesDependency);
        drop(task);

        false
    }

    fn run_backend_job<'a>(
        self: &'a Arc<Self>,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            if id == BACKEND_JOB_INITIAL_SNAPSHOT || id == BACKEND_JOB_FOLLOW_UP_SNAPSHOT {
                debug_assert!(self.should_persist());

                let last_snapshot = self.last_snapshot.load(Ordering::Relaxed);
                let mut last_snapshot = self.start_time + Duration::from_millis(last_snapshot);
                loop {
                    const FIRST_SNAPSHOT_WAIT: Duration = Duration::from_secs(60);
                    const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(30);
                    const IDLE_TIMEOUT: Duration = Duration::from_secs(2);

                    let time = if id == BACKEND_JOB_INITIAL_SNAPSHOT {
                        FIRST_SNAPSHOT_WAIT
                    } else {
                        SNAPSHOT_INTERVAL
                    };

                    let until = last_snapshot + time;
                    if until > Instant::now() {
                        let mut stop_listener = self.stopping_event.listen();
                        if !self.stopping.load(Ordering::Acquire) {
                            let mut idle_start_listener = self.idle_start_event.listen();
                            let mut idle_end_listener = self.idle_end_event.listen();
                            let mut idle_time = if turbo_tasks.is_idle() {
                                Instant::now() + IDLE_TIMEOUT
                            } else {
                                far_future()
                            };
                            loop {
                                tokio::select! {
                                    _ = &mut stop_listener => {
                                        break;
                                    },
                                    _ = &mut idle_start_listener => {
                                        idle_time = Instant::now() + IDLE_TIMEOUT;
                                        idle_start_listener = self.idle_start_event.listen()
                                    },
                                    _ = &mut idle_end_listener => {
                                        idle_time = until + IDLE_TIMEOUT;
                                        idle_end_listener = self.idle_end_event.listen()
                                    },
                                    _ = tokio::time::sleep_until(until) => {
                                        break;
                                    },
                                    _ = tokio::time::sleep_until(idle_time) => {
                                        if turbo_tasks.is_idle() {
                                            break;
                                        }
                                    },
                                }
                            }
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
                        self.last_snapshot.store(
                            last_snapshot.as_millis().try_into().unwrap(),
                            Ordering::Relaxed,
                        );

                        turbo_tasks.schedule_backend_background_job(BACKEND_JOB_FOLLOW_UP_SNAPSHOT);
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
        _options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<TypedCellContent> {
        let mut ctx = self.execute_context(turbo_tasks);
        let task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(content) = get!(task, CellData { cell }) {
            Ok(CellContent(Some(content.1.clone())).into_typed(cell.type_id))
        } else {
            Ok(CellContent(None).into_typed(cell.type_id))
        }
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
        if !self.should_track_children() {
            return AutoMap::default();
        }

        let mut ctx = self.execute_context(turbo_tasks);
        let mut collectibles = AutoMap::default();
        {
            let mut task = ctx.task(task_id, TaskDataCategory::All);
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
                    &mut ctx,
                );
                task = ctx.task(task_id, TaskDataCategory::All);
            }
            for collectible in iter_many!(
                task,
                AggregatedCollectible {
                    collectible
                } count if collectible.collectible_type == collectible_type && *count > 0 => {
                    collectible.cell
                }
            ) {
                *collectibles
                    .entry(RawVc::TaskCell(collectible.task, collectible.cell))
                    .or_insert(0) += 1;
            }
            for (collectible, count) in iter_many!(
                task,
                Collectible {
                    collectible
                } count if collectible.collectible_type == collectible_type => {
                    (collectible.cell, *count)
                }
            ) {
                *collectibles
                    .entry(RawVc::TaskCell(collectible.task, collectible.cell))
                    .or_insert(0) += count;
            }
            let _ = task.add(CachedDataItem::CollectiblesDependent {
                collectible_type,
                task: reader_id,
                value: (),
            });
        }
        {
            let mut reader = ctx.task(reader_id, TaskDataCategory::Data);
            let target = CollectiblesRef {
                task: task_id,
                collectible_type,
            };
            if reader.add(CachedDataItem::CollectiblesDependency { target, value: () }) {
                reader.remove(&CachedDataItemKey::OutdatedCollectiblesDependency { target });
            }
        }
        collectibles
    }

    fn emit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        self.assert_valid_collectible(task_id, collectible);
        if !self.should_track_children() {
            return;
        }

        let RawVc::TaskCell(collectible_task, cell) = collectible else {
            panic!("Collectibles need to be resolved");
        };
        let cell = CellRef {
            task: collectible_task,
            cell,
        };
        operation::UpdateCollectibleOperation::run(
            task_id,
            CollectibleRef {
                collectible_type,
                cell,
            },
            1,
            self.execute_context(turbo_tasks),
        );
    }

    fn unemit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        self.assert_valid_collectible(task_id, collectible);
        if !self.should_track_children() {
            return;
        }

        let RawVc::TaskCell(collectible_task, cell) = collectible else {
            panic!("Collectibles need to be resolved");
        };
        let cell = CellRef {
            task: collectible_task,
            cell,
        };
        operation::UpdateCollectibleOperation::run(
            task_id,
            CollectibleRef {
                collectible_type,
                cell,
            },
            -(i32::try_from(count).unwrap()),
            self.execute_context(turbo_tasks),
        );
    }

    fn update_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        operation::UpdateCellOperation::run(
            task_id,
            cell,
            content,
            self.execute_context(turbo_tasks),
        );
    }

    fn mark_own_task_as_session_dependent(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        if !self.should_track_dependencies() {
            // Without dependency tracking we don't need session dependent tasks
            return;
        }
        const SESSION_DEPENDENT_AGGREGATION_NUMBER: u32 = u32::MAX >> 2;
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let aggregation_number = get_aggregation_number(&task);
        if aggregation_number < SESSION_DEPENDENT_AGGREGATION_NUMBER {
            drop(task);
            // We want to use a high aggregation number to avoid large aggregation chains for
            // session dependent tasks (which change on every run)
            AggregationUpdateQueue::run(
                AggregationUpdateJob::UpdateAggregationNumber {
                    task_id,
                    base_aggregation_number: SESSION_DEPENDENT_AGGREGATION_NUMBER,
                    distance: None,
                },
                &mut ctx,
            );
            task = ctx.task(task_id, TaskDataCategory::Meta);
        }
        if let Some(InProgressState::InProgress(box InProgressStateInner {
            session_dependent,
            ..
        })) = get_mut!(task, InProgress)
        {
            *session_dependent = true;
        }
    }

    fn mark_own_task_as_finished(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task, TaskDataCategory::Data);
        if let Some(InProgressState::InProgress(box InProgressStateInner {
            marked_as_completed,
            ..
        })) = get_mut!(task, InProgress)
        {
            *marked_as_completed = true;
            // TODO this should remove the dirty state (also check session_dependent)
            // but this would break some assumptions for strongly consistent reads.
            // Client tasks are not connected yet, so we wouldn't wait for them.
            // Maybe that's ok in cases where mark_finished() is used? Seems like it?
        }
    }

    fn set_own_task_aggregation_number(
        &self,
        task: TaskId,
        aggregation_number: u32,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        AggregationUpdateQueue::run(
            AggregationUpdateJob::UpdateAggregationNumber {
                task_id: task,
                base_aggregation_number: aggregation_number,
                distance: None,
            },
            &mut ctx,
        );
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        self.assert_not_persistent_calling_transient(parent_task, task, None);
        ConnectChildOperation::run(parent_task, task, self.execute_context(turbo_tasks));
    }

    fn create_transient_task(&self, task_type: TransientTaskType) -> TaskId {
        let task_id = self.transient_task_id_factory.get();
        let root_type = match task_type {
            TransientTaskType::Root(_) => RootType::RootTask,
            TransientTaskType::Once(_) => RootType::OnceTask,
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
            task.add(CachedDataItem::AggregationNumber {
                value: AggregationNumber {
                    base: u32::MAX,
                    distance: 0,
                    effective: u32::MAX,
                },
            });
            if self.should_track_activeness() {
                task.add(CachedDataItem::Activeness {
                    value: ActivenessState::new_root(root_type, task_id),
                });
            }
            task.add(CachedDataItem::new_scheduled(move || match root_type {
                RootType::RootTask => "Root Task".to_string(),
                RootType::OnceTask => "Once Task".to_string(),
            }));
        }
        #[cfg(feature = "verify_aggregation_graph")]
        self.root_tasks.lock().insert(task_id);
        task_id
    }

    fn dispose_root_task(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        #[cfg(feature = "verify_aggregation_graph")]
        self.root_tasks.lock().remove(&task_id);

        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let is_dirty = get!(task, Dirty).map_or(false, |dirty| dirty.get(self.session_id));
        let has_dirty_containers = get!(task, AggregatedDirtyContainerCount)
            .map_or(false, |dirty_containers| {
                dirty_containers.get(self.session_id) > 0
            });
        if is_dirty || has_dirty_containers {
            if let Some(root_state) = get_mut!(task, Activeness) {
                // We will finish the task, but it would be removed after the task is done
                root_state.unset_root_type();
                root_state.set_active_until_clean();
            };
        } else if let Some(root_state) = remove!(task, Activeness) {
            // Technically nobody should be listening to this event, but just in case
            // we notify it anyway
            root_state.all_clean_event.notify(usize::MAX);
        }
    }

    #[cfg(feature = "verify_aggregation_graph")]
    fn verify_aggregation_graph(
        &self,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
        idle: bool,
    ) {
        if env::var("TURBO_ENGINE_VERIFY_GRAPH").ok().as_deref() == Some("0") {
            return;
        }
        use std::{collections::VecDeque, env, io::stdout};

        use crate::backend::operation::{get_uppers, is_aggregating_node};

        let mut ctx = self.execute_context(turbo_tasks);
        let root_tasks = self.root_tasks.lock().clone();
        let len = root_tasks.len();

        for (i, task_id) in root_tasks.into_iter().enumerate() {
            println!("Verifying graph from root {task_id} {i}/{len}...");
            let mut queue = VecDeque::new();
            let mut visited = FxHashSet::default();
            let mut aggregated_nodes = FxHashSet::default();
            let mut collectibles = FxHashMap::default();
            let root_task_id = task_id;
            visited.insert(task_id);
            aggregated_nodes.insert(task_id);
            queue.push_back(task_id);
            let mut counter = 0;
            while let Some(task_id) = queue.pop_front() {
                counter += 1;
                if counter % 100000 == 0 {
                    println!(
                        "queue={}, visited={}, aggregated_nodes={}",
                        queue.len(),
                        visited.len(),
                        aggregated_nodes.len()
                    );
                }
                let task = ctx.task(task_id, TaskDataCategory::All);
                if idle && !self.is_idle.load(Ordering::Relaxed) {
                    return;
                }

                let uppers = get_uppers(&task);
                if task_id != root_task_id
                    && !uppers.iter().any(|upper| aggregated_nodes.contains(upper))
                {
                    println!(
                        "Task {} {} doesn't report to any root but is reachable from one (uppers: \
                         {:?})",
                        task_id,
                        ctx.get_task_description(task_id),
                        uppers
                    );
                }

                let aggregated_collectibles: Vec<_> = get_many!(task, AggregatedCollectible { collectible } value if *value > 0 => {collectible});
                for collectible in aggregated_collectibles {
                    collectibles
                        .entry(collectible)
                        .or_insert_with(|| (false, Vec::new()))
                        .1
                        .push(task_id);
                }

                let own_collectibles: Vec<_> = get_many!(task, Collectible { collectible } value if *value > 0 => {collectible});
                for collectible in own_collectibles {
                    if let Some((flag, _)) = collectibles.get_mut(&collectible) {
                        *flag = true
                    } else {
                        println!(
                            "Task {} has a collectible {:?} that is not in any upper task",
                            task_id, collectible
                        );
                    }
                }

                let is_dirty = get!(task, Dirty).is_some_and(|dirty| dirty.get(self.session_id));
                let has_dirty_container = get!(task, AggregatedDirtyContainerCount)
                    .is_some_and(|count| count.get(self.session_id) > 0);
                let should_be_in_upper = is_dirty || has_dirty_container;

                let aggregation_number = get_aggregation_number(&task);
                if is_aggregating_node(aggregation_number) {
                    aggregated_nodes.insert(task_id);
                }
                // println!(
                //     "{task_id}: {} agg_num = {aggregation_number}, uppers = {:#?}",
                //     ctx.get_task_description(task_id),
                //     uppers
                // );

                for child_id in iter_many!(task, Child { task } => task) {
                    // println!("{task_id}: child -> {child_id}");
                    if visited.insert(child_id) {
                        queue.push_back(child_id);
                    }
                }
                drop(task);

                if should_be_in_upper {
                    for upper_id in uppers {
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        let in_upper = get!(task, AggregatedDirtyContainer { task: task_id })
                            .is_some_and(|dirty| dirty.get(self.session_id) > 0);
                        if !in_upper {
                            println!(
                                "Task {} is dirty, but is not listed in the upper task {}",
                                task_id, upper_id
                            );
                        }
                    }
                }
            }

            for (collectible, (flag, task_ids)) in collectibles {
                if !flag {
                    use std::io::Write;
                    let mut stdout = stdout().lock();
                    writeln!(
                        stdout,
                        "{:?} that is not emitted in any child task but in these aggregated \
                         tasks: {:#?}",
                        collectible,
                        task_ids
                            .iter()
                            .map(|t| format!("{t} {}", ctx.get_task_description(*t)))
                            .collect::<Vec<_>>()
                    );

                    let task_id = collectible.cell.task;
                    let mut queue = {
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        get_uppers(&task)
                    };
                    let mut visited = FxHashSet::default();
                    for &upper_id in queue.iter() {
                        visited.insert(upper_id);
                        writeln!(stdout, "{task_id:?} -> {upper_id:?}");
                    }
                    while let Some(task_id) = queue.pop() {
                        let desc = ctx.get_task_description(task_id);
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        let aggregated_collectible =
                            get!(task, AggregatedCollectible { collectible })
                                .copied()
                                .unwrap_or_default();
                        let uppers = get_uppers(&task);
                        drop(task);
                        writeln!(
                            stdout,
                            "upper {task_id} {desc} collectible={aggregated_collectible}"
                        );
                        if task_ids.contains(&task_id) {
                            writeln!(
                                stdout,
                                "Task has an upper connection to an aggregated task that doesn't \
                                 reference it. Upper connection is invalid!"
                            );
                        }
                        for upper_id in uppers {
                            writeln!(stdout, "{task_id:?} -> {upper_id:?}");
                            if !visited.contains(&upper_id) {
                                queue.push(upper_id);
                            }
                        }
                    }
                }
            }
            println!("visited {task_id} {} tasks", visited.len());
        }
    }

    fn assert_not_persistent_calling_transient(
        &self,
        parent_id: TaskId,
        child_id: TaskId,
        cell_id: Option<CellId>,
    ) {
        if !parent_id.is_transient() && child_id.is_transient() {
            self.panic_persistent_calling_transient(
                self.lookup_task_type(parent_id).as_deref(),
                self.lookup_task_type(child_id).as_deref(),
                cell_id,
            );
        }
    }

    fn panic_persistent_calling_transient(
        &self,
        parent: Option<&CachedTaskType>,
        child: Option<&CachedTaskType>,
        cell_id: Option<CellId>,
    ) {
        let transient_reason = if let Some(child) = child {
            Cow::Owned(format!(
                " The callee is transient because it depends on:\n{}",
                self.debug_trace_transient_task(child, cell_id),
            ))
        } else {
            Cow::Borrowed("")
        };
        panic!(
            "Persistent task {} is not allowed to call, read, or connect to transient tasks {}.{}",
            parent.map_or("unknown", |t| t.get_name()),
            child.map_or("unknown", |t| t.get_name()),
            transient_reason,
        );
    }

    fn assert_valid_collectible(&self, task_id: TaskId, collectible: RawVc) {
        // these checks occur in a potentially hot codepath, but they're cheap
        let RawVc::TaskCell(col_task_id, col_cell_id) = collectible else {
            // This should never happen: The collectible APIs use ResolvedVc
            let task_info = if let Some(col_task_ty) = collectible
                .try_get_task_id()
                .and_then(|t| self.lookup_task_type(t))
            {
                Cow::Owned(format!(" (return type of {col_task_ty})"))
            } else {
                Cow::Borrowed("")
            };
            panic!("Collectible{task_info} must be a ResolvedVc")
        };
        if col_task_id.is_transient() && !task_id.is_transient() {
            let transient_reason = if let Some(col_task_ty) = self.lookup_task_type(col_task_id) {
                Cow::Owned(format!(
                    ". The collectible is transient because it depends on:\n{}",
                    self.debug_trace_transient_task(&col_task_ty, Some(col_cell_id)),
                ))
            } else {
                Cow::Borrowed("")
            };
            // this should never happen: How would a persistent function get a transient Vc?
            panic!(
                "Collectible is transient, transient collectibles cannot be emitted from \
                 persistent tasks{transient_reason}",
            )
        }
    }
}

impl<B: BackingStorage> Backend for TurboTasksBackend<B> {
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.startup(turbo_tasks);
    }

    fn stopping(&self, _turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.stopping();
    }

    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.stop(turbo_tasks);
    }

    fn idle_start(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.idle_start(turbo_tasks);
    }

    fn idle_end(&self, _turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.idle_end();
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

    fn get_task_description(&self, task: TaskId) -> String {
        self.0.get_task_description(task)
    }

    fn try_get_function_id(&self, task_id: TaskId) -> Option<FunctionId> {
        self.0.try_get_function_id(task_id)
    }

    type TaskState = ();
    fn new_task_state(&self, _task: TaskId) -> Self::TaskState {}

    fn task_execution_canceled(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.task_execution_canceled(task, turbo_tasks)
    }

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
        result: Result<RawVc, TurboTasksExecutionError>,
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
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.0
            .try_read_task_cell(task_id, Some(reader), cell, options, turbo_tasks)
    }

    fn try_read_task_cell_untracked(
        &self,
        task_id: TaskId,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.0
            .try_read_task_cell(task_id, None, cell, options, turbo_tasks)
    }

    fn try_read_own_task_cell_untracked(
        &self,
        task_id: TaskId,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        self.0
            .try_read_own_task_cell_untracked(task_id, cell, options, turbo_tasks)
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
        self.0
            .read_task_collectibles(task_id, collectible_type, reader, turbo_tasks)
    }

    fn emit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0
            .emit_collectible(collectible_type, collectible, task_id, turbo_tasks)
    }

    fn unemit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0
            .unemit_collectible(collectible_type, collectible, count, task_id, turbo_tasks)
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

    fn mark_own_task_as_finished(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.mark_own_task_as_finished(task_id, turbo_tasks);
    }

    fn set_own_task_aggregation_number(
        &self,
        task: TaskId,
        aggregation_number: u32,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0
            .set_own_task_aggregation_number(task, aggregation_number, turbo_tasks);
    }

    fn mark_own_task_as_session_dependent(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.mark_own_task_as_session_dependent(task, turbo_tasks);
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

    fn dispose_root_task(&self, task_id: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.dispose_root_task(task_id, turbo_tasks);
    }

    fn task_statistics(&self) -> &TaskStatisticsApi {
        &self.0.task_statistics
    }
}

enum DebugTraceTransientTask {
    Cached {
        task_name: &'static str,
        cell_type_id: Option<ValueTypeId>,
        cause_self: Option<Box<DebugTraceTransientTask>>,
        cause_args: Vec<DebugTraceTransientTask>,
    },
    /// This representation is used when this task is a duplicate of one previously shown
    Collapsed {
        task_name: &'static str,
        cell_type_id: Option<ValueTypeId>,
    },
    Uncached {
        cell_type_id: Option<ValueTypeId>,
    },
}

impl DebugTraceTransientTask {
    fn fmt_indented(&self, f: &mut fmt::Formatter<'_>, level: usize) -> fmt::Result {
        let indent = "    ".repeat(level);
        f.write_str(&indent)?;

        fn fmt_cell_type_id(
            f: &mut fmt::Formatter<'_>,
            cell_type_id: Option<ValueTypeId>,
        ) -> fmt::Result {
            if let Some(ty) = cell_type_id {
                write!(f, " (read cell of type {})", get_value_type_global_name(ty))
            } else {
                Ok(())
            }
        }

        // write the name and type
        match self {
            Self::Cached {
                task_name,
                cell_type_id,
                ..
            }
            | Self::Collapsed {
                task_name,
                cell_type_id,
                ..
            } => {
                f.write_str(task_name)?;
                fmt_cell_type_id(f, *cell_type_id)?;
                if matches!(self, Self::Collapsed { .. }) {
                    f.write_str(" (collapsed)")?;
                }
            }
            Self::Uncached { cell_type_id } => {
                f.write_str("unknown transient task")?;
                fmt_cell_type_id(f, *cell_type_id)?;
            }
        }
        f.write_char('\n')?;

        // write any extra "cause" information we might have
        if let Self::Cached {
            cause_self,
            cause_args,
            ..
        } = self
        {
            if let Some(c) = cause_self {
                writeln!(f, "{indent}  self:")?;
                c.fmt_indented(f, level + 1)?;
            }
            if !cause_args.is_empty() {
                writeln!(f, "{indent}  args:")?;
                for c in cause_args {
                    c.fmt_indented(f, level + 1)?;
                }
            }
        }
        Ok(())
    }
}

impl fmt::Display for DebugTraceTransientTask {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.fmt_indented(f, 0)
    }
}

// from https://github.com/tokio-rs/tokio/blob/29cd6ec1ec6f90a7ee1ad641c03e0e00badbcb0e/tokio/src/time/instant.rs#L57-L63
fn far_future() -> Instant {
    // Roughly 30 years from now.
    // API does not provide a way to obtain max `Instant`
    // or convert specific date in the future to instant.
    // 1000 years overflows on macOS, 100 years overflows on FreeBSD.
    Instant::now() + Duration::from_secs(86400 * 365 * 30)
}
