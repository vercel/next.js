mod counter_map;
mod operation;
mod storage;
pub mod storage_schema;

use std::{
    borrow::Cow,
    fmt::{self, Write},
    future::Future,
    hash::BuildHasherDefault,
    mem::take,
    pin::Pin,
    sync::{
        Arc, LazyLock,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
};

use anyhow::{Context, Result, bail};
use auto_hash_map::{AutoMap, AutoSet};
use indexmap::IndexSet;
use parking_lot::{Condvar, Mutex};
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use smallvec::{SmallVec, smallvec};
use tokio::time::{Duration, Instant};
use tracing::{Span, trace_span};
use turbo_bincode::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};
use turbo_tasks::{
    CellId, FxDashMap, RawVc, ReadCellOptions, ReadCellTracking, ReadConsistency,
    ReadOutputOptions, ReadTracking, SharedReference, TRANSIENT_TASK_BIT, TaskExecutionReason,
    TaskId, TaskPriority, TraitTypeId, TurboTasksBackendApi, ValueTypeId,
    backend::{
        Backend, CachedTaskType, CellContent, TaskExecutionSpec, TransientTaskType,
        TurboTasksExecutionError, TypedCellContent, VerificationMode,
    },
    event::{Event, EventDescription, EventListener},
    message_queue::TimingEvent,
    registry::get_value_type,
    scope::scope_and_block,
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    turbo_tasks,
    util::{IdFactoryWithReuse, good_chunk_size, into_chunks},
};

pub use self::{
    operation::AnyOperation,
    storage::{SpecificTaskDataCategory, TaskDataCategory},
};
#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::TaskDirtyCause;
use crate::{
    backend::{
        operation::{
            AggregationUpdateJob, AggregationUpdateQueue, ChildExecuteContext,
            CleanupOldEdgesOperation, ComputeDirtyAndCleanUpdate, ConnectChildOperation,
            ExecuteContext, ExecuteContextImpl, LeafDistanceUpdateQueue, Operation, OutdatedEdge,
            TaskGuard, TaskType, connect_children, get_aggregation_number, get_uppers,
            is_root_node, make_task_dirty_internal, prepare_new_children,
        },
        storage::Storage,
        storage_schema::{TaskStorage, TaskStorageAccessors},
    },
    backing_storage::BackingStorage,
    data::{
        ActivenessState, CellRef, CollectibleRef, CollectiblesRef, Dirtyness, InProgressCellState,
        InProgressState, InProgressStateInner, OutputValue, TransientTask,
    },
    utils::{
        arc_or_owned::ArcOrOwned,
        chunked_vec::ChunkedVec,
        dash_map_drop_contents::drop_contents,
        dash_map_raw_entry::{RawEntry, raw_entry},
        ptr_eq_arc::PtrEqArc,
        shard_amount::compute_shard_amount,
        sharded::Sharded,
        swap_retain,
    },
};

/// Threshold for parallelizing making dependent tasks dirty.
/// If the number of dependent tasks exceeds this threshold,
/// the operation will be parallelized.
const DEPENDENT_TASKS_DIRTY_PARALLIZATION_THRESHOLD: usize = 10000;

const SNAPSHOT_REQUESTED_BIT: usize = 1 << (usize::BITS - 1);

/// Configurable idle timeout for snapshot persistence.
/// Defaults to 2 seconds if not set or if the value is invalid.
static IDLE_TIMEOUT: LazyLock<Duration> = LazyLock::new(|| {
    std::env::var("TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_millis)
        .unwrap_or(Duration::from_secs(2))
});

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

pub enum StorageMode {
    /// Queries the storage for cache entries that don't exist locally.
    ReadOnly,
    /// Queries the storage for cache entries that don't exist locally.
    /// Regularly pushes changes to the backing storage.
    ReadWrite,
    /// Queries the storage for cache entries that don't exist locally.
    /// On shutdown, pushes all changes to the backing storage.
    ReadWriteOnShutdown,
}

pub struct BackendOptions {
    /// Enables dependency tracking.
    ///
    /// When disabled: No state changes are allowed. Tasks will never reexecute and stay cached
    /// forever.
    pub dependency_tracking: bool,

    /// Enables active tracking.
    ///
    /// Automatically disabled when `dependency_tracking` is disabled.
    ///
    /// When disabled: All tasks are considered as active.
    pub active_tracking: bool,

    /// Enables the backing storage.
    pub storage_mode: Option<StorageMode>,

    /// Number of tokio worker threads. It will be used to compute the shard amount of parallel
    /// datastructures. If `None`, it will use the available parallelism.
    pub num_workers: Option<usize>,

    /// Avoid big preallocations for faster startup. Should only be used for testing purposes.
    pub small_preallocation: bool,
}

impl Default for BackendOptions {
    fn default() -> Self {
        Self {
            dependency_tracking: true,
            active_tracking: true,
            storage_mode: Some(StorageMode::ReadWrite),
            num_workers: None,
            small_preallocation: false,
        }
    }
}

pub enum TurboTasksBackendJob {
    InitialSnapshot,
    FollowUpSnapshot,
}

pub struct TurboTasksBackend<B: BackingStorage>(Arc<TurboTasksBackendInner<B>>);

type TaskCacheLog = Sharded<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>;

struct TurboTasksBackendInner<B: BackingStorage> {
    options: BackendOptions,

    start_time: Instant,

    persisted_task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,

    persisted_task_cache_log: Option<TaskCacheLog>,
    task_cache: FxDashMap<Arc<CachedTaskType>, TaskId>,

    storage: Storage,

    /// When true, the backing_storage has data that is not in the local storage.
    local_is_partial: AtomicBool,

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

    pub fn backing_storage(&self) -> &B {
        &self.0.backing_storage
    }
}

impl<B: BackingStorage> TurboTasksBackendInner<B> {
    pub fn new(mut options: BackendOptions, backing_storage: B) -> Self {
        let shard_amount = compute_shard_amount(options.num_workers, options.small_preallocation);
        let need_log = matches!(
            options.storage_mode,
            Some(StorageMode::ReadWrite) | Some(StorageMode::ReadWriteOnShutdown)
        );
        if !options.dependency_tracking {
            options.active_tracking = false;
        }
        let small_preallocation = options.small_preallocation;
        let next_task_id = backing_storage
            .next_free_task_id()
            .expect("Failed to get task id");
        Self {
            options,
            start_time: Instant::now(),
            persisted_task_id_factory: IdFactoryWithReuse::new(
                next_task_id,
                TaskId::try_from(TRANSIENT_TASK_BIT - 1).unwrap(),
            ),
            transient_task_id_factory: IdFactoryWithReuse::new(
                TaskId::try_from(TRANSIENT_TASK_BIT).unwrap(),
                TaskId::MAX,
            ),
            persisted_task_cache_log: need_log.then(|| Sharded::new(shard_amount)),
            task_cache: FxDashMap::default(),
            local_is_partial: AtomicBool::new(next_task_id != TaskId::MIN),
            storage: Storage::new(shard_amount, small_preallocation),
            in_progress_operations: AtomicUsize::new(0),
            snapshot_request: Mutex::new(SnapshotRequest::new()),
            operations_suspended: Condvar::new(),
            snapshot_completed: Condvar::new(),
            last_snapshot: AtomicU64::new(0),
            stopping: AtomicBool::new(false),
            stopping_event: Event::new(|| || "TurboTasksBackend::stopping_event".to_string()),
            idle_start_event: Event::new(|| || "TurboTasksBackend::idle_start_event".to_string()),
            idle_end_event: Event::new(|| || "TurboTasksBackend::idle_end_event".to_string()),
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
        matches!(
            self.options.storage_mode,
            Some(StorageMode::ReadWrite) | Some(StorageMode::ReadWriteOnShutdown)
        )
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

    fn track_cache_hit(&self, task_type: &CachedTaskType) {
        self.task_statistics
            .map(|stats| stats.increment_cache_hit(task_type.native_fn));
    }

    fn track_cache_miss(&self, task_type: &CachedTaskType) {
        self.task_statistics
            .map(|stats| stats.increment_cache_miss(task_type.native_fn));
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

/// Intermediate result of step 1 of task execution completion.
struct TaskExecutionCompletePrepareResult {
    pub new_children: FxHashSet<TaskId>,
    pub is_now_immutable: bool,
    #[cfg(feature = "verify_determinism")]
    pub no_output_set: bool,
    pub new_output: Option<OutputValue>,
    pub output_dependent_tasks: SmallVec<[TaskId; 4]>,
}

// Operations
impl<B: BackingStorage> TurboTasksBackendInner<B> {
    /// # Safety
    ///
    /// `tx` must be a transaction from this TurboTasksBackendInner instance.
    unsafe fn connect_child_with_tx<'l, 'tx: 'l>(
        &'l self,
        tx: Option<&'l B::ReadTransaction<'tx>>,
        parent_task: Option<TaskId>,
        child_task: TaskId,
        task_type: Option<ArcOrOwned<CachedTaskType>>,
        turbo_tasks: &'l dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        operation::ConnectChildOperation::run(parent_task, child_task, task_type, unsafe {
            self.execute_context_with_tx(tx, turbo_tasks)
        });
    }

    fn connect_child(
        &self,
        parent_task: Option<TaskId>,
        child_task: TaskId,
        task_type: Option<ArcOrOwned<CachedTaskType>>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        operation::ConnectChildOperation::run(
            parent_task,
            child_task,
            task_type,
            self.execute_context(turbo_tasks),
        );
    }

    fn try_read_task_output(
        self: &Arc<Self>,
        task_id: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.assert_not_persistent_calling_transient(reader, task_id, /* cell_id */ None);

        let mut ctx = self.execute_context(turbo_tasks);
        let need_reader_task = if self.should_track_dependencies()
            && !matches!(options.tracking, ReadTracking::Untracked)
            && reader.is_some_and(|reader_id| reader_id != task_id)
            && let Some(reader_id) = reader
            && reader_id != task_id
        {
            Some(reader_id)
        } else {
            None
        };
        let (mut task, mut reader_task) = if let Some(reader_id) = need_reader_task {
            // Having a task_pair here is not optimal, but otherwise this would lead to a race
            // condition. See below.
            // TODO(sokra): solve that in a more performant way.
            let (task, reader) = ctx.task_pair(task_id, reader_id, TaskDataCategory::All);
            (task, Some(reader))
        } else {
            (ctx.task(task_id, TaskDataCategory::All), None)
        };

        fn listen_to_done_event(
            reader_description: Option<EventDescription>,
            tracking: ReadTracking,
            done_event: &Event,
        ) -> EventListener {
            done_event.listen_with_note(move || {
                move || {
                    if let Some(reader_description) = reader_description.as_ref() {
                        format!(
                            "try_read_task_output from {} ({})",
                            reader_description, tracking
                        )
                    } else {
                        format!("try_read_task_output ({})", tracking)
                    }
                }
            })
        }

        fn check_in_progress(
            task: &impl TaskGuard,
            reader_description: Option<EventDescription>,
            tracking: ReadTracking,
        ) -> Option<std::result::Result<std::result::Result<RawVc, EventListener>, anyhow::Error>>
        {
            match task.get_in_progress() {
                Some(InProgressState::Scheduled { done_event, .. }) => Some(Ok(Err(
                    listen_to_done_event(reader_description, tracking, done_event),
                ))),
                Some(InProgressState::InProgress(box InProgressStateInner {
                    done_event, ..
                })) => Some(Ok(Err(listen_to_done_event(
                    reader_description,
                    tracking,
                    done_event,
                )))),
                Some(InProgressState::Canceled) => Some(Err(anyhow::anyhow!(
                    "{} was canceled",
                    task.get_task_description()
                ))),
                None => None,
            }
        }

        if matches!(options.consistency, ReadConsistency::Strong) {
            // Ensure it's an root node
            loop {
                let aggregation_number = get_aggregation_number(&task);
                if is_root_node(aggregation_number) {
                    break;
                }
                drop(task);
                drop(reader_task);
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
                (task, reader_task) = if let Some(reader_id) = need_reader_task {
                    // TODO(sokra): see comment above
                    let (task, reader) = ctx.task_pair(task_id, reader_id, TaskDataCategory::All);
                    (task, Some(reader))
                } else {
                    (ctx.task(task_id, TaskDataCategory::All), None)
                }
            }

            let is_dirty = task.is_dirty();

            // Check the dirty count of the root node
            let has_dirty_containers = task.has_dirty_containers();
            if has_dirty_containers || is_dirty.is_some() {
                let activeness = task.get_activeness_mut();
                let mut task_ids_to_schedule: Vec<_> = Vec::new();
                // When there are dirty task, subscribe to the all_clean_event
                let activeness = if let Some(activeness) = activeness {
                    // This makes sure all tasks stay active and this task won't stale.
                    // active_until_clean is automatically removed when this
                    // task is clean.
                    activeness.set_active_until_clean();
                    activeness
                } else {
                    // If we don't have a root state, add one. This also makes sure all tasks stay
                    // active and this task won't stale. active_until_clean
                    // is automatically removed when this task is clean.
                    if ctx.should_track_activeness() {
                        // A newly added Activeness need to make sure to schedule the tasks
                        task_ids_to_schedule = task.dirty_containers().collect();
                        task_ids_to_schedule.push(task_id);
                    }
                    let activeness =
                        task.get_activeness_mut_or_insert_with(|| ActivenessState::new(task_id));
                    activeness.set_active_until_clean();
                    activeness
                };
                let listener = activeness.all_clean_event.listen_with_note(move || {
                    let this = self.clone();
                    let tt = turbo_tasks.pin();
                    move || {
                        let tt: &dyn TurboTasksBackendApi<TurboTasksBackend<B>> = &*tt;
                        let mut ctx = this.execute_context(tt);
                        let mut visited = FxHashSet::default();
                        fn indent(s: &str) -> String {
                            s.split_inclusive('\n')
                                .flat_map(|line: &str| ["  ", line].into_iter())
                                .collect::<String>()
                        }
                        fn get_info(
                            ctx: &mut impl ExecuteContext<'_>,
                            task_id: TaskId,
                            parent_and_count: Option<(TaskId, i32)>,
                            visited: &mut FxHashSet<TaskId>,
                        ) -> String {
                            let task = ctx.task(task_id, TaskDataCategory::All);
                            let is_dirty = task.is_dirty();
                            let in_progress =
                                task.get_in_progress()
                                    .map_or("not in progress", |p| match p {
                                        InProgressState::InProgress(_) => "in progress",
                                        InProgressState::Scheduled { .. } => "scheduled",
                                        InProgressState::Canceled => "canceled",
                                    });
                            let activeness = task.get_activeness().map_or_else(
                                || "not active".to_string(),
                                |activeness| format!("{activeness:?}"),
                            );
                            let aggregation_number = get_aggregation_number(&task);
                            let missing_upper = if let Some((parent_task_id, _)) = parent_and_count
                            {
                                let uppers = get_uppers(&task);
                                !uppers.contains(&parent_task_id)
                            } else {
                                false
                            };

                            // Check the dirty count of the root node
                            let has_dirty_containers = task.has_dirty_containers();

                            let task_description = task.get_task_description();
                            let is_dirty_label = if let Some(parent_priority) = is_dirty {
                                format!(", dirty({parent_priority})")
                            } else {
                                String::new()
                            };
                            let has_dirty_containers_label = if has_dirty_containers {
                                ", dirty containers"
                            } else {
                                ""
                            };
                            let count = if let Some((_, count)) = parent_and_count {
                                format!(" {count}")
                            } else {
                                String::new()
                            };
                            let mut info = format!(
                                "{task_id} {task_description}{count} (aggr={aggregation_number}, \
                                 {in_progress}, \
                                 {activeness}{is_dirty_label}{has_dirty_containers_label})",
                            );
                            let children: Vec<_> = task.dirty_containers_with_count().collect();
                            drop(task);

                            if missing_upper {
                                info.push_str("\n  ERROR: missing upper connection");
                            }

                            if has_dirty_containers || !children.is_empty() {
                                writeln!(info, "\n  dirty tasks:").unwrap();

                                for (child_task_id, count) in children {
                                    let task_description = ctx
                                        .task(child_task_id, TaskDataCategory::Data)
                                        .get_task_description();
                                    if visited.insert(child_task_id) {
                                        let child_info = get_info(
                                            ctx,
                                            child_task_id,
                                            Some((task_id, count)),
                                            visited,
                                        );
                                        info.push_str(&indent(&child_info));
                                        if !info.ends_with('\n') {
                                            info.push('\n');
                                        }
                                    } else {
                                        writeln!(
                                            info,
                                            "  {child_task_id} {task_description} {count} \
                                             (already visited)"
                                        )
                                        .unwrap();
                                    }
                                }
                            }
                            info
                        }
                        let info = get_info(&mut ctx, task_id, None, &mut visited);
                        format!(
                            "try_read_task_output (strongly consistent) from {reader:?}\n{info}"
                        )
                    }
                });
                drop(reader_task);
                drop(task);
                if !task_ids_to_schedule.is_empty() {
                    let mut queue = AggregationUpdateQueue::new();
                    queue.extend_find_and_schedule_dirty(task_ids_to_schedule);
                    queue.execute(&mut ctx);
                }

                return Ok(Err(listener));
            }
        }

        let reader_description = reader_task
            .as_ref()
            .map(|r| EventDescription::new(|| r.get_task_desc_fn()));
        if let Some(value) = check_in_progress(&task, reader_description.clone(), options.tracking)
        {
            return value;
        }

        if let Some(output) = task.get_output() {
            let result = match output {
                OutputValue::Cell(cell) => Ok(Ok(RawVc::TaskCell(cell.task, cell.cell))),
                OutputValue::Output(task) => Ok(Ok(RawVc::TaskOutput(*task))),
                OutputValue::Error(error) => Err(error
                    .with_task_context(task.get_task_type(), Some(task_id))
                    .into()),
            };
            if let Some(mut reader_task) = reader_task
                && options.tracking.should_track(result.is_err())
                && (!task.immutable() || cfg!(feature = "verify_immutable"))
            {
                #[cfg(feature = "trace_task_output_dependencies")]
                let _span = tracing::trace_span!(
                    "add output dependency",
                    task = %task_id,
                    dependent_task = ?reader
                )
                .entered();
                let mut queue = LeafDistanceUpdateQueue::new();
                let reader = reader.unwrap();
                if task.add_output_dependent(reader) {
                    // Ensure that dependent leaf distance is strictly monotonic increasing
                    let leaf_distance = task.get_leaf_distance().copied().unwrap_or_default();
                    let reader_leaf_distance =
                        reader_task.get_leaf_distance().copied().unwrap_or_default();
                    if reader_leaf_distance.distance <= leaf_distance.distance {
                        queue.push(
                            reader,
                            leaf_distance.distance,
                            leaf_distance.max_distance_in_buffer,
                        );
                    }
                }

                drop(task);

                // Note: We use `task_pair` earlier to lock the task and its reader at the same
                // time. If we didn't and just locked the reader here, an invalidation could occur
                // between grabbing the locks. If that happened, and if the task is "outdated" or
                // doesn't have the dependency edge yet, the invalidation would be lost.

                if !reader_task.remove_outdated_output_dependencies(&task_id) {
                    let _ = reader_task.add_output_dependencies(task_id);
                }
                drop(reader_task);

                queue.execute(&mut ctx);
            }

            return result;
        }
        drop(reader_task);

        let note = EventDescription::new(|| {
            move || {
                if let Some(reader) = reader_description.as_ref() {
                    format!("try_read_task_output (recompute) from {reader}",)
                } else {
                    "try_read_task_output (recompute, untracked)".to_string()
                }
            }
        });

        // Output doesn't exist. We need to schedule the task to compute it.
        let (in_progress_state, listener) = InProgressState::new_scheduled_with_listener(
            TaskExecutionReason::OutputNotAvailable,
            EventDescription::new(|| task.get_task_desc_fn()),
            note,
        );

        // It's not possible that the task is InProgress at this point. If it is InProgress {
        // done: true } it must have Output and would early return.
        let old = task.set_in_progress(in_progress_state);
        debug_assert!(old.is_none(), "InProgress already exists");
        ctx.schedule_task(task, TaskPriority::Initial);

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
        self.assert_not_persistent_calling_transient(reader, task_id, Some(cell));

        fn add_cell_dependency(
            task_id: TaskId,
            mut task: impl TaskGuard,
            reader: Option<TaskId>,
            reader_task: Option<impl TaskGuard>,
            cell: CellId,
            key: Option<u64>,
        ) {
            if let Some(mut reader_task) = reader_task
                && (!task.immutable() || cfg!(feature = "verify_immutable"))
            {
                let reader = reader.unwrap();
                let _ = task.add_cell_dependents((cell, key, reader));
                drop(task);

                // Note: We use `task_pair` earlier to lock the task and its reader at the same
                // time. If we didn't and just locked the reader here, an invalidation could occur
                // between grabbing the locks. If that happened, and if the task is "outdated" or
                // doesn't have the dependency edge yet, the invalidation would be lost.

                let target = CellRef {
                    task: task_id,
                    cell,
                };
                if !reader_task.remove_outdated_cell_dependencies(&(target, key)) {
                    let _ = reader_task.add_cell_dependencies((target, key));
                }
                drop(reader_task);
            }
        }

        let ReadCellOptions {
            is_serializable_cell_content,
            tracking,
            final_read_hint,
        } = options;

        let mut ctx = self.execute_context(turbo_tasks);
        let (mut task, reader_task) = if self.should_track_dependencies()
            && !matches!(tracking, ReadCellTracking::Untracked)
            && let Some(reader_id) = reader
            && reader_id != task_id
        {
            // Having a task_pair here is not optimal, but otherwise this would lead to a race
            // condition. See below.
            // TODO(sokra): solve that in a more performant way.
            let (task, reader) = ctx.task_pair(task_id, reader_id, TaskDataCategory::All);
            (task, Some(reader))
        } else {
            (ctx.task(task_id, TaskDataCategory::All), None)
        };

        let content = if final_read_hint {
            task.remove_cell_data(is_serializable_cell_content, cell)
        } else {
            task.get_cell_data(is_serializable_cell_content, cell)
        };
        if let Some(content) = content {
            if tracking.should_track(false) {
                add_cell_dependency(task_id, task, reader, reader_task, cell, tracking.key());
            }
            return Ok(Ok(TypedCellContent(
                cell.type_id,
                CellContent(Some(content.reference)),
            )));
        }

        let in_progress = task.get_in_progress();
        if matches!(
            in_progress,
            Some(InProgressState::InProgress(..) | InProgressState::Scheduled { .. })
        ) {
            return Ok(Err(self
                .listen_to_cell(&mut task, task_id, &reader_task, cell)
                .0));
        }
        let is_cancelled = matches!(in_progress, Some(InProgressState::Canceled));

        // Check cell index range (cell might not exist at all)
        let max_id = task.get_cell_type_max_index(&cell.type_id).copied();
        let Some(max_id) = max_id else {
            let task_desc = task.get_task_description();
            if tracking.should_track(true) {
                add_cell_dependency(task_id, task, reader, reader_task, cell, tracking.key());
            }
            bail!(
                "Cell {cell:?} no longer exists in task {task_desc} (no cell of this type exists)",
            );
        };
        if cell.index >= max_id {
            let task_desc = task.get_task_description();
            if tracking.should_track(true) {
                add_cell_dependency(task_id, task, reader, reader_task, cell, tracking.key());
            }
            bail!("Cell {cell:?} no longer exists in task {task_desc} (index out of bounds)");
        }

        // Cell should exist, but data was dropped or is not serializable. We need to recompute the
        // task the get the cell content.

        // Listen to the cell and potentially schedule the task
        let (listener, new_listener) = self.listen_to_cell(&mut task, task_id, &reader_task, cell);
        drop(reader_task);
        if !new_listener {
            return Ok(Err(listener));
        }

        let _span = tracing::trace_span!(
            "recomputation",
            cell_type = get_value_type(cell.type_id).global_name,
            cell_index = cell.index
        )
        .entered();

        // Schedule the task, if not already scheduled
        if is_cancelled {
            bail!("{} was canceled", task.get_task_description());
        }

        let _ = task.add_scheduled(
            TaskExecutionReason::CellNotAvailable,
            EventDescription::new(|| task.get_task_desc_fn()),
        );
        ctx.schedule_task(task, TaskPriority::Initial);

        Ok(Err(listener))
    }

    fn listen_to_cell(
        &self,
        task: &mut impl TaskGuard,
        task_id: TaskId,
        reader_task: &Option<impl TaskGuard>,
        cell: CellId,
    ) -> (EventListener, bool) {
        let note = || {
            let reader_desc = reader_task.as_ref().map(|r| r.get_task_desc_fn());
            move || {
                if let Some(reader_desc) = reader_desc.as_ref() {
                    format!("try_read_task_cell (in progress) from {}", (reader_desc)())
                } else {
                    "try_read_task_cell (in progress, untracked)".to_string()
                }
            }
        };
        if let Some(in_progress) = task.get_in_progress_cells(&cell) {
            // Someone else is already computing the cell
            let listener = in_progress.event.listen_with_note(note);
            return (listener, false);
        }
        let in_progress = InProgressCellState::new(task_id, cell);
        let listener = in_progress.event.listen_with_note(note);
        let old = task.insert_in_progress_cells(cell, in_progress);
        debug_assert!(old.is_none(), "InProgressCell already exists");
        (listener, true)
    }

    fn snapshot_and_persist(
        &self,
        parent_span: Option<tracing::Id>,
        reason: &str,
    ) -> Option<(Instant, bool)> {
        let snapshot_span =
            tracing::trace_span!(parent: parent_span.clone(), "snapshot", reason = reason)
                .entered();
        let start = Instant::now();
        debug_assert!(self.should_persist());

        let suspended_operations;
        {
            let _span = tracing::info_span!("blocking").entered();
            let mut snapshot_request = self.snapshot_request.lock();
            snapshot_request.snapshot_requested = true;
            let active_operations = self
                .in_progress_operations
                .fetch_or(SNAPSHOT_REQUESTED_BIT, Ordering::Relaxed);
            if active_operations != 0 {
                self.operations_suspended
                    .wait_while(&mut snapshot_request, |_| {
                        self.in_progress_operations.load(Ordering::Relaxed)
                            != SNAPSHOT_REQUESTED_BIT
                    });
            }
            suspended_operations = snapshot_request
                .suspended_operations
                .iter()
                .map(|op| op.arc().clone())
                .collect::<Vec<_>>();
        }
        self.storage.start_snapshot();
        let mut persisted_task_cache_log = self
            .persisted_task_cache_log
            .as_ref()
            .map(|l| l.take(|i| i))
            .unwrap_or_default();
        let mut snapshot_request = self.snapshot_request.lock();
        snapshot_request.snapshot_requested = false;
        self.in_progress_operations
            .fetch_sub(SNAPSHOT_REQUESTED_BIT, Ordering::Relaxed);
        self.snapshot_completed.notify_all();
        let snapshot_time = Instant::now();
        drop(snapshot_request);

        #[cfg(feature = "print_cache_item_size")]
        #[derive(Default)]
        struct TaskCacheStats {
            data: usize,
            data_compressed: usize,
            data_count: usize,
            meta: usize,
            meta_compressed: usize,
            meta_count: usize,
            upper_count: usize,
            collectibles_count: usize,
            aggregated_collectibles_count: usize,
            children_count: usize,
            followers_count: usize,
            collectibles_dependents_count: usize,
            aggregated_dirty_containers_count: usize,
            output_size: usize,
        }
        #[cfg(feature = "print_cache_item_size")]
        impl TaskCacheStats {
            fn compressed_size(data: &[u8]) -> Result<usize> {
                Ok(lzzzz::lz4::Compressor::new()?.next_to_vec(
                    data,
                    &mut Vec::new(),
                    lzzzz::lz4::ACC_LEVEL_DEFAULT,
                )?)
            }

            fn add_data(&mut self, data: &[u8]) {
                self.data += data.len();
                self.data_compressed += Self::compressed_size(data).unwrap_or(0);
                self.data_count += 1;
            }

            fn add_meta(&mut self, data: &[u8]) {
                self.meta += data.len();
                self.meta_compressed += Self::compressed_size(data).unwrap_or(0);
                self.meta_count += 1;
            }

            fn add_counts(&mut self, storage: &TaskStorage) {
                let counts = storage.meta_counts();
                self.upper_count += counts.upper;
                self.collectibles_count += counts.collectibles;
                self.aggregated_collectibles_count += counts.aggregated_collectibles;
                self.children_count += counts.children;
                self.followers_count += counts.followers;
                self.collectibles_dependents_count += counts.collectibles_dependents;
                self.aggregated_dirty_containers_count += counts.aggregated_dirty_containers;
                if let Some(output) = storage.get_output() {
                    use turbo_bincode::turbo_bincode_encode;

                    self.output_size += turbo_bincode_encode(&output)
                        .map(|data| data.len())
                        .unwrap_or(0);
                }
            }
        }
        #[cfg(feature = "print_cache_item_size")]
        let task_cache_stats: Mutex<FxHashMap<_, TaskCacheStats>> =
            Mutex::new(FxHashMap::default());

        let preprocess = |task_id: TaskId, inner: &TaskStorage| {
            if task_id.is_transient() {
                return (None, None);
            }

            let meta_restored = inner.flags.meta_restored();
            let data_restored = inner.flags.data_restored();

            // Encode meta/data directly from TaskStorage
            let meta = meta_restored.then(|| inner.clone_meta_snapshot());
            let data = data_restored.then(|| inner.clone_data_snapshot());

            (meta, data)
        };
        let process = |task_id: TaskId,
                       (meta, data): (Option<TaskStorage>, Option<TaskStorage>),
                       buffer: &mut TurboBincodeBuffer| {
            #[cfg(feature = "print_cache_item_size")]
            if let Some(ref m) = meta {
                task_cache_stats
                    .lock()
                    .entry(self.debug_get_task_name(task_id))
                    .or_default()
                    .add_counts(m);
            }
            (
                task_id,
                meta.map(|d| encode_task_data(task_id, &d, SpecificTaskDataCategory::Meta, buffer)),
                data.map(|d| encode_task_data(task_id, &d, SpecificTaskDataCategory::Data, buffer)),
            )
        };
        let process_snapshot =
            |task_id: TaskId, inner: Box<TaskStorage>, buffer: &mut TurboBincodeBuffer| {
                if task_id.is_transient() {
                    return (task_id, None, None);
                }

                #[cfg(feature = "print_cache_item_size")]
                if inner.flags.meta_modified() {
                    task_cache_stats
                        .lock()
                        .entry(self.debug_get_task_name(task_id))
                        .or_default()
                        .add_counts(&inner);
                }

                // Encode meta/data directly from TaskStorage snapshot
                (
                    task_id,
                    inner.flags.meta_modified().then(|| {
                        encode_task_data(task_id, &inner, SpecificTaskDataCategory::Meta, buffer)
                    }),
                    inner.flags.data_modified().then(|| {
                        encode_task_data(task_id, &inner, SpecificTaskDataCategory::Data, buffer)
                    }),
                )
            };

        let snapshot = self
            .storage
            .take_snapshot(&preprocess, &process, &process_snapshot);

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
                                Some(Ok(meta)) => {
                                    #[cfg(feature = "print_cache_item_size")]
                                    task_cache_stats
                                        .lock()
                                        .entry(self.debug_get_task_name(task_id))
                                        .or_default()
                                        .add_meta(&meta);
                                    Some(meta)
                                }
                                None => None,
                                Some(Err(err)) => {
                                    println!(
                                        "Serializing task {} failed (meta): {:?}",
                                        self.debug_get_task_description(task_id),
                                        err
                                    );
                                    None
                                }
                            };
                            let data = match data {
                                Some(Ok(data)) => {
                                    #[cfg(feature = "print_cache_item_size")]
                                    task_cache_stats
                                        .lock()
                                        .entry(self.debug_get_task_name(task_id))
                                        .or_default()
                                        .add_data(&data);
                                    Some(data)
                                }
                                None => None,
                                Some(Err(err)) => {
                                    println!(
                                        "Serializing task {} failed (data): {:?}",
                                        self.debug_get_task_description(task_id),
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

        drop(snapshot_span);

        if persisted_task_cache_log.is_empty() && task_snapshots.is_empty() {
            return Some((snapshot_time, false));
        }

        let _span = tracing::info_span!(parent: parent_span, "persist", reason = reason).entered();
        {
            if let Err(err) = self.backing_storage.save_snapshot(
                suspended_operations,
                persisted_task_cache_log,
                task_snapshots,
            ) {
                println!("Persisting failed: {err:?}");
                return None;
            }
            #[cfg(feature = "print_cache_item_size")]
            {
                let mut task_cache_stats = task_cache_stats
                    .into_inner()
                    .into_iter()
                    .collect::<Vec<_>>();
                if !task_cache_stats.is_empty() {
                    use turbo_tasks::util::FormatBytes;

                    use crate::utils::markdown_table::print_markdown_table;

                    task_cache_stats.sort_unstable_by(|(key_a, stats_a), (key_b, stats_b)| {
                        (stats_b.data_compressed + stats_b.meta_compressed, key_b)
                            .cmp(&(stats_a.data_compressed + stats_a.meta_compressed, key_a))
                    });
                    println!(
                        "Task cache stats: {} ({})",
                        FormatBytes(
                            task_cache_stats
                                .iter()
                                .map(|(_, s)| s.data_compressed + s.meta_compressed)
                                .sum::<usize>()
                        ),
                        FormatBytes(
                            task_cache_stats
                                .iter()
                                .map(|(_, s)| s.data + s.meta)
                                .sum::<usize>()
                        )
                    );

                    print_markdown_table(
                        [
                            "Task",
                            " Total Size",
                            " Data Size",
                            " Data Count x Avg",
                            " Data Count x Avg",
                            " Meta Size",
                            " Meta Count x Avg",
                            " Meta Count x Avg",
                            " Uppers",
                            " Coll",
                            " Agg Coll",
                            " Children",
                            " Followers",
                            " Coll Deps",
                            " Agg Dirty",
                            " Output Size",
                        ],
                        task_cache_stats.iter(),
                        |(task_desc, stats)| {
                            [
                                task_desc.to_string(),
                                format!(
                                    " {} ({})",
                                    FormatBytes(stats.data_compressed + stats.meta_compressed),
                                    FormatBytes(stats.data + stats.meta)
                                ),
                                format!(
                                    " {} ({})",
                                    FormatBytes(stats.data_compressed),
                                    FormatBytes(stats.data)
                                ),
                                format!(" {} x", stats.data_count,),
                                format!(
                                    "{} ({})",
                                    FormatBytes(
                                        stats
                                            .data_compressed
                                            .checked_div(stats.data_count)
                                            .unwrap_or(0)
                                    ),
                                    FormatBytes(
                                        stats.data.checked_div(stats.data_count).unwrap_or(0)
                                    ),
                                ),
                                format!(
                                    " {} ({})",
                                    FormatBytes(stats.meta_compressed),
                                    FormatBytes(stats.meta)
                                ),
                                format!(" {} x", stats.meta_count,),
                                format!(
                                    "{} ({})",
                                    FormatBytes(
                                        stats
                                            .meta_compressed
                                            .checked_div(stats.meta_count)
                                            .unwrap_or(0)
                                    ),
                                    FormatBytes(
                                        stats.meta.checked_div(stats.meta_count).unwrap_or(0)
                                    ),
                                ),
                                format!(" {}", stats.upper_count),
                                format!(" {}", stats.collectibles_count),
                                format!(" {}", stats.aggregated_collectibles_count),
                                format!(" {}", stats.children_count),
                                format!(" {}", stats.followers_count),
                                format!(" {}", stats.collectibles_dependents_count),
                                format!(" {}", stats.aggregated_dirty_containers_count),
                                format!(" {}", FormatBytes(stats.output_size)),
                            ]
                        },
                    );
                }
            }
        }

        let elapsed = start.elapsed();
        // avoid spamming the event queue with information about fast operations
        if elapsed > Duration::from_secs(10) {
            turbo_tasks().send_compilation_event(Arc::new(TimingEvent::new(
                "Finished writing to filesystem cache".to_string(),
                elapsed,
            )));
        }

        Some((snapshot_time, true))
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

        // Only when it should write regularly to the storage, we schedule the initial snapshot
        // job.
        if matches!(self.options.storage_mode, Some(StorageMode::ReadWrite)) {
            // Schedule the snapshot job
            let _span = trace_span!("persisting background job").entered();
            let _span = tracing::info_span!("thread").entered();
            turbo_tasks.schedule_backend_background_job(TurboTasksBackendJob::InitialSnapshot);
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
        if self.should_persist() {
            self.snapshot_and_persist(Span::current().into(), "stop");
        }
        drop_contents(&self.task_cache);
        self.storage.drop_contents();
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
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> TaskId {
        // First check if the task exists in the cache which only uses a read lock
        if let Some(task_id) = self.task_cache.get(&task_type) {
            let task_id = *task_id;
            self.track_cache_hit(&task_type);
            self.connect_child(
                parent_task,
                task_id,
                Some(ArcOrOwned::Owned(task_type)),
                turbo_tasks,
            );
            return task_id;
        }

        let check_backing_storage =
            self.should_restore() && self.local_is_partial.load(Ordering::Acquire);
        let tx = check_backing_storage
            .then(|| self.backing_storage.start_read_transaction())
            .flatten();
        let (task_id, task_type) = {
            // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
            if let Some(task_id) = unsafe {
                check_backing_storage
                    .then(|| {
                        self.backing_storage
                            .forward_lookup_task_cache(tx.as_ref(), &task_type)
                            .expect("Failed to lookup task id")
                    })
                    .flatten()
            } {
                // Task exists in backing storage
                // So we only need to insert it into the in-memory cache
                self.track_cache_hit(&task_type);
                let task_type = match raw_entry(&self.task_cache, &task_type) {
                    RawEntry::Occupied(_) => ArcOrOwned::Owned(task_type),
                    RawEntry::Vacant(e) => {
                        let task_type = Arc::new(task_type);
                        e.insert(task_type.clone(), task_id);
                        ArcOrOwned::Arc(task_type)
                    }
                };
                (task_id, task_type)
            } else {
                // Task doesn't exist in memory cache or backing storage
                // So we might need to create a new task
                let (task_id, mut task_type) = match raw_entry(&self.task_cache, &task_type) {
                    RawEntry::Occupied(e) => {
                        let task_id = *e.get();
                        drop(e);
                        self.track_cache_hit(&task_type);
                        (task_id, ArcOrOwned::Owned(task_type))
                    }
                    RawEntry::Vacant(e) => {
                        let task_type = Arc::new(task_type);
                        let task_id = self.persisted_task_id_factory.get();
                        e.insert(task_type.clone(), task_id);
                        self.track_cache_miss(&task_type);
                        (task_id, ArcOrOwned::Arc(task_type))
                    }
                };
                if let Some(log) = &self.persisted_task_cache_log {
                    let task_type_arc: Arc<CachedTaskType> = Arc::from(task_type);
                    log.lock(task_id).push((task_type_arc.clone(), task_id));
                    task_type = ArcOrOwned::Arc(task_type_arc);
                }
                (task_id, task_type)
            }
        };

        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        unsafe {
            self.connect_child_with_tx(
                tx.as_ref(),
                parent_task,
                task_id,
                Some(task_type),
                turbo_tasks,
            )
        };

        task_id
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> TaskId {
        if let Some(parent_task) = parent_task
            && !parent_task.is_transient()
        {
            self.panic_persistent_calling_transient(
                self.debug_get_task_description(parent_task),
                Some(&task_type),
                /* cell_id */ None,
            );
        }
        // First check if the task exists in the cache which only uses a read lock
        if let Some(task_id) = self.task_cache.get(&task_type) {
            let task_id = *task_id;
            self.track_cache_hit(&task_type);
            self.connect_child(
                parent_task,
                task_id,
                Some(ArcOrOwned::Owned(task_type)),
                turbo_tasks,
            );
            return task_id;
        }
        // If not, acquire a write lock and double check / insert
        match raw_entry(&self.task_cache, &task_type) {
            RawEntry::Occupied(e) => {
                let task_id = *e.get();
                drop(e);
                self.track_cache_hit(&task_type);
                self.connect_child(
                    parent_task,
                    task_id,
                    Some(ArcOrOwned::Owned(task_type)),
                    turbo_tasks,
                );
                task_id
            }
            RawEntry::Vacant(e) => {
                let task_type = Arc::new(task_type);
                let task_id = self.transient_task_id_factory.get();
                e.insert(task_type.clone(), task_id);
                self.track_cache_miss(&task_type);
                self.connect_child(
                    parent_task,
                    task_id,
                    Some(ArcOrOwned::Arc(task_type)),
                    turbo_tasks,
                );

                task_id
            }
        }
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
            if let Some(task_type) = backend.debug_get_cached_task_type(task_id) {
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

    fn debug_get_task_description(&self, task_id: TaskId) -> String {
        let task = self.storage.access_mut(task_id);
        if let Some(value) = task.get_persistent_task_type() {
            format!("{task_id:?} {}", value)
        } else if let Some(value) = task.get_transient_task_type() {
            format!("{task_id:?} {}", value)
        } else {
            format!("{task_id:?} unknown")
        }
    }

    #[allow(dead_code)]
    fn debug_get_task_name(&self, task_id: TaskId) -> String {
        let task = self.storage.access_mut(task_id);
        if let Some(value) = task.get_persistent_task_type() {
            value.to_string()
        } else if let Some(value) = task.get_transient_task_type() {
            value.to_string()
        } else {
            "unknown".to_string()
        }
    }

    fn debug_get_cached_task_type(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>> {
        let task = self.storage.access_mut(task_id);
        task.get_persistent_task_type().cloned()
    }

    fn task_execution_canceled(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(in_progress) = task.take_in_progress() {
            match in_progress {
                InProgressState::Scheduled {
                    done_event,
                    reason: _,
                } => done_event.notify(usize::MAX),
                InProgressState::InProgress(box InProgressStateInner { done_event, .. }) => {
                    done_event.notify(usize::MAX)
                }
                InProgressState::Canceled => {}
            }
        }
        let old = task.set_in_progress(InProgressState::Canceled);
        debug_assert!(old.is_none(), "InProgress already exists");
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        priority: TaskPriority,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Option<TaskExecutionSpec<'_>> {
        let execution_reason;
        let task_type;
        {
            let mut ctx = self.execute_context(turbo_tasks);
            let mut task = ctx.task(task_id, TaskDataCategory::All);
            task_type = task.get_task_type().to_owned();
            let once_task = matches!(task_type, TaskType::Transient(ref tt) if matches!(&**tt, TransientTask::Once(_)));
            if let Some(tasks) = task.prefetch() {
                drop(task);
                ctx.prepare_tasks(tasks);
                task = ctx.task(task_id, TaskDataCategory::All);
            }
            let in_progress = task.take_in_progress()?;
            let InProgressState::Scheduled { done_event, reason } = in_progress else {
                let old = task.set_in_progress(in_progress);
                debug_assert!(old.is_none(), "InProgress already exists");
                return None;
            };
            execution_reason = reason;
            let old = task.set_in_progress(InProgressState::InProgress(Box::new(
                InProgressStateInner {
                    stale: false,
                    once_task,
                    done_event,
                    session_dependent: false,
                    marked_as_completed: false,
                    new_children: Default::default(),
                },
            )));
            debug_assert!(old.is_none(), "InProgress already exists");

            // Make all current collectibles outdated (remove left-over outdated collectibles)
            enum Collectible {
                Current(CollectibleRef, i32),
                Outdated(CollectibleRef),
            }
            let collectibles = task
                .iter_collectibles()
                .map(|(&collectible, &value)| Collectible::Current(collectible, value))
                .chain(
                    task.iter_outdated_collectibles()
                        .map(|(collectible, _count)| Collectible::Outdated(*collectible)),
                )
                .collect::<Vec<_>>();
            for collectible in collectibles {
                match collectible {
                    Collectible::Current(collectible, value) => {
                        let _ = task.insert_outdated_collectible(collectible, value);
                    }
                    Collectible::Outdated(collectible) => {
                        if task
                            .collectibles()
                            .is_none_or(|m| m.get(&collectible).is_none())
                        {
                            task.remove_outdated_collectibles(&collectible);
                        }
                    }
                }
            }

            if self.should_track_dependencies() {
                // Make all dependencies outdated
                let cell_dependencies = task.iter_cell_dependencies().collect();
                task.set_outdated_cell_dependencies(cell_dependencies);

                let outdated_output_dependencies = task.iter_output_dependencies().collect();
                task.set_outdated_output_dependencies(outdated_output_dependencies);
            }
        }

        let (span, future) = match task_type {
            TaskType::Cached(task_type) => {
                let CachedTaskType {
                    native_fn,
                    this,
                    arg,
                } = &*task_type;
                (
                    native_fn.span(task_id.persistence(), execution_reason, priority),
                    native_fn.execute(*this, &**arg),
                )
            }
            TaskType::Transient(task_type) => {
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

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        has_invalidator: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> bool {
        // Task completion is a 4 step process:
        // 1. Remove old edges (dependencies, collectibles, children, cells) and update the
        //    aggregation number of the task and the new children.
        // 2. Connect the new children to the task (and do the relevant aggregation updates).
        // 3. Remove dirty flag (and propagate that to uppers) and remove the in-progress state.
        // 4. Shrink the task memory to reduce footprint of the task.

        // Due to persistence it is possible that the process is cancelled after any step. This is
        // ok, since the dirty flag won't be removed until step 3 and step 4 is only affecting the
        // in-memory representation.

        // The task might be invalidated during this process, so we need to check the stale flag
        // at the start of every step.

        #[cfg(not(feature = "trace_task_details"))]
        let span = tracing::trace_span!(
            "task execution completed",
            new_children = tracing::field::Empty
        )
        .entered();
        #[cfg(feature = "trace_task_details")]
        let span = tracing::trace_span!(
            "task execution completed",
            task_id = display(task_id),
            result = match result.as_ref() {
                Ok(value) => display(either::Either::Left(value)),
                Err(err) => display(either::Either::Right(err)),
            },
            new_children = tracing::field::Empty,
            immutable = tracing::field::Empty,
            new_output = tracing::field::Empty,
            output_dependents = tracing::field::Empty,
            stale = tracing::field::Empty,
        )
        .entered();

        let is_error = result.is_err();

        let mut ctx = self.execute_context(turbo_tasks);

        let Some(TaskExecutionCompletePrepareResult {
            new_children,
            is_now_immutable,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            new_output,
            output_dependent_tasks,
        }) = self.task_execution_completed_prepare(
            &mut ctx,
            #[cfg(feature = "trace_task_details")]
            &span,
            task_id,
            result,
            cell_counters,
            has_invalidator,
        )
        else {
            // Task was stale and has been rescheduled
            #[cfg(feature = "trace_task_details")]
            span.record("stale", "prepare");
            return true;
        };

        #[cfg(feature = "trace_task_details")]
        span.record("new_output", new_output.is_some());
        #[cfg(feature = "trace_task_details")]
        span.record("output_dependents", output_dependent_tasks.len());

        // When restoring from filesystem cache the following might not be executed (since we can
        // suspend in `CleanupOldEdgesOperation`), but that's ok as the task is still dirty and
        // would be executed again.

        if !output_dependent_tasks.is_empty() {
            self.task_execution_completed_invalidate_output_dependent(
                &mut ctx,
                task_id,
                output_dependent_tasks,
            );
        }

        let has_new_children = !new_children.is_empty();
        span.record("new_children", new_children.len());

        if has_new_children {
            self.task_execution_completed_unfinished_children_dirty(&mut ctx, &new_children)
        }

        if has_new_children
            && self.task_execution_completed_connect(&mut ctx, task_id, new_children)
        {
            // Task was stale and has been rescheduled
            #[cfg(feature = "trace_task_details")]
            span.record("stale", "connect");
            return true;
        }

        let (stale, in_progress_cells) = self.task_execution_completed_finish(
            &mut ctx,
            task_id,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            new_output,
            is_now_immutable,
        );
        if stale {
            // Task was stale and has been rescheduled
            #[cfg(feature = "trace_task_details")]
            span.record("stale", "finish");
            return true;
        }

        let removed_data =
            self.task_execution_completed_cleanup(&mut ctx, task_id, cell_counters, is_error);

        // Drop data outside of critical sections
        drop(removed_data);
        drop(in_progress_cells);

        false
    }

    fn task_execution_completed_prepare(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        #[cfg(feature = "trace_task_details")] span: &Span,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        has_invalidator: bool,
    ) -> Option<TaskExecutionCompletePrepareResult> {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = task.get_in_progress_mut() else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        if matches!(in_progress, InProgressState::Canceled) {
            return Some(TaskExecutionCompletePrepareResult {
                new_children: Default::default(),
                is_now_immutable: false,
                #[cfg(feature = "verify_determinism")]
                no_output_set: false,
                new_output: None,
                output_dependent_tasks: Default::default(),
            });
        }
        let &mut InProgressState::InProgress(box InProgressStateInner {
            stale,
            ref mut new_children,
            session_dependent,
            once_task: is_once_task,
            ..
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        #[cfg(not(feature = "no_fast_stale"))]
        if stale && !is_once_task {
            let Some(InProgressState::InProgress(box InProgressStateInner {
                done_event,
                mut new_children,
                ..
            })) = task.take_in_progress()
            else {
                unreachable!();
            };
            let old = task.set_in_progress(InProgressState::Scheduled {
                done_event,
                reason: TaskExecutionReason::Stale,
            });
            debug_assert!(old.is_none(), "InProgress already exists");
            // Remove old children from new_children to leave only the children that had their
            // active count increased
            for task in task.iter_children() {
                new_children.remove(&task);
            }
            drop(task);

            // We need to undo the active count increase for the children since we throw away the
            // new_children list now.
            AggregationUpdateQueue::run(
                AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_children.into_iter().collect(),
                },
                ctx,
            );
            return None;
        }

        // take the children from the task to process them
        let mut new_children = take(new_children);

        // handle has_invalidator
        if has_invalidator {
            task.set_invalidator(true);
        }

        // handle cell counters: update max index and remove cells that are no longer used
        let old_counters: FxHashMap<_, _> = task
            .iter_cell_type_max_index()
            .map(|(&k, &v)| (k, v))
            .collect();
        let mut counters_to_remove = old_counters.clone();

        for (&cell_type, &max_index) in cell_counters.iter() {
            if let Some(old_max_index) = counters_to_remove.remove(&cell_type) {
                if old_max_index != max_index {
                    task.insert_cell_type_max_index(cell_type, max_index);
                }
            } else {
                task.insert_cell_type_max_index(cell_type, max_index);
            }
        }
        for (cell_type, _) in counters_to_remove {
            task.remove_cell_type_max_index(&cell_type);
        }

        let mut queue = AggregationUpdateQueue::new();

        let mut old_edges = Vec::new();

        let has_children = !new_children.is_empty();
        let is_immutable = task.immutable();
        let task_dependencies_for_immutable =
            // Task was previously marked as immutable
            if !is_immutable
            // Task is not session dependent (session dependent tasks can change between sessions)
            && !session_dependent
            // Task has no invalidator
            && !task.invalidator()
            // Task has no dependencies on collectibles
            && task.is_collectibles_dependencies_empty()
        {
            Some(
                // Collect all dependencies on tasks to check if all dependencies are immutable
                task.iter_output_dependencies()
                    .chain(task.iter_cell_dependencies().map(|(target, _key)| target.task))
                    .collect::<FxHashSet<_>>(),
            )
        } else {
            None
        };

        if has_children {
            // Prepare all new children
            prepare_new_children(task_id, &mut task, &new_children, &mut queue);

            // Filter actual new children
            old_edges.extend(
                task.iter_children()
                    .filter(|task| !new_children.remove(task))
                    .map(OutdatedEdge::Child),
            );
        } else {
            old_edges.extend(task.iter_children().map(OutdatedEdge::Child));
        }

        old_edges.extend(
            task.iter_outdated_collectibles()
                .map(|(&collectible, &count)| OutdatedEdge::Collectible(collectible, count)),
        );

        if self.should_track_dependencies() {
            // IMPORTANT: Use iter_outdated_* here, NOT iter_* (active dependencies).
            // At execution start, active deps are copied to outdated as a "before" snapshot.
            // During execution, new deps are added to active.
            // Here at completion, we clean up only the OUTDATED deps (the "before" snapshot).
            // Using iter_* (active) instead would incorrectly clean up deps that are still valid,
            // breaking dependency tracking.
            old_edges.extend(
                task.iter_outdated_cell_dependencies()
                    .map(|(target, key)| OutdatedEdge::CellDependency(target, key)),
            );
            old_edges.extend(
                task.iter_outdated_output_dependencies()
                    .map(OutdatedEdge::OutputDependency),
            );
        }

        // Check if output need to be updated
        let current_output = task.get_output();
        #[cfg(feature = "verify_determinism")]
        let no_output_set = current_output.is_none();
        let new_output = match result {
            Ok(RawVc::TaskOutput(output_task_id)) => {
                if let Some(OutputValue::Output(current_task_id)) = current_output
                    && *current_task_id == output_task_id
                {
                    None
                } else {
                    Some(OutputValue::Output(output_task_id))
                }
            }
            Ok(RawVc::TaskCell(output_task_id, cell)) => {
                if let Some(OutputValue::Cell(CellRef {
                    task: current_task_id,
                    cell: current_cell,
                })) = current_output
                    && *current_task_id == output_task_id
                    && *current_cell == cell
                {
                    None
                } else {
                    Some(OutputValue::Cell(CellRef {
                        task: output_task_id,
                        cell,
                    }))
                }
            }
            Ok(RawVc::LocalOutput(..)) => {
                panic!("Non-local tasks must not return a local Vc");
            }
            Err(err) => {
                if let Some(OutputValue::Error(old_error)) = current_output
                    && old_error == &err
                {
                    None
                } else {
                    Some(OutputValue::Error(err))
                }
            }
        };
        let mut output_dependent_tasks = SmallVec::<[_; 4]>::new();
        // When output has changed, grab the dependent tasks
        if new_output.is_some() && ctx.should_track_dependencies() {
            output_dependent_tasks = task.iter_output_dependent().collect();
        }

        drop(task);

        // Check if the task can be marked as immutable
        let mut is_now_immutable = false;
        if let Some(dependencies) = task_dependencies_for_immutable
            && dependencies
                .iter()
                .all(|&task_id| ctx.task(task_id, TaskDataCategory::Data).immutable())
        {
            is_now_immutable = true;
        }
        #[cfg(feature = "trace_task_details")]
        span.record("immutable", is_immutable || is_now_immutable);

        if !queue.is_empty() || !old_edges.is_empty() {
            #[cfg(feature = "trace_task_completion")]
            let _span = tracing::trace_span!("remove old edges and prepare new children").entered();
            // Remove outdated edges first, before removing in_progress+dirty flag.
            // We need to make sure all outdated edges are removed before the task can potentially
            // be scheduled and executed again
            CleanupOldEdgesOperation::run(task_id, old_edges, queue, ctx);
        }

        Some(TaskExecutionCompletePrepareResult {
            new_children,
            is_now_immutable,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            new_output,
            output_dependent_tasks,
        })
    }

    fn task_execution_completed_invalidate_output_dependent(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        output_dependent_tasks: SmallVec<[TaskId; 4]>,
    ) {
        debug_assert!(!output_dependent_tasks.is_empty());

        if output_dependent_tasks.len() > 1 {
            ctx.prepare_tasks(
                output_dependent_tasks
                    .iter()
                    .map(|&id| (id, TaskDataCategory::All)),
            );
        }

        fn process_output_dependents(
            ctx: &mut impl ExecuteContext<'_>,
            task_id: TaskId,
            dependent_task_id: TaskId,
            queue: &mut AggregationUpdateQueue,
        ) {
            #[cfg(feature = "trace_task_output_dependencies")]
            let span = tracing::trace_span!(
                "invalidate output dependency",
                task = %task_id,
                dependent_task = %dependent_task_id,
                result = tracing::field::Empty,
            )
            .entered();
            let mut make_stale = true;
            let dependent = ctx.task(dependent_task_id, TaskDataCategory::All);
            let transient_task_type = dependent.get_transient_task_type();
            if transient_task_type.is_some_and(|tt| matches!(&**tt, TransientTask::Once(_))) {
                // once tasks are never invalidated
                #[cfg(feature = "trace_task_output_dependencies")]
                span.record("result", "once task");
                return;
            }
            if dependent.outdated_output_dependencies_contains(&task_id) {
                #[cfg(feature = "trace_task_output_dependencies")]
                span.record("result", "outdated dependency");
                // output dependency is outdated, so it hasn't read the output yet
                // and doesn't need to be invalidated
                // But importantly we still need to make the task dirty as it should no longer
                // be considered as "recomputation".
                make_stale = false;
            } else if !dependent.output_dependencies_contains(&task_id) {
                // output dependency has been removed, so the task doesn't depend on the
                // output anymore and doesn't need to be invalidated
                #[cfg(feature = "trace_task_output_dependencies")]
                span.record("result", "no backward dependency");
                return;
            }
            make_task_dirty_internal(
                dependent,
                dependent_task_id,
                make_stale,
                #[cfg(feature = "trace_task_dirty")]
                TaskDirtyCause::OutputChange { task_id },
                queue,
                ctx,
            );
            #[cfg(feature = "trace_task_output_dependencies")]
            span.record("result", "marked dirty");
        }

        if output_dependent_tasks.len() > DEPENDENT_TASKS_DIRTY_PARALLIZATION_THRESHOLD {
            let chunk_size = good_chunk_size(output_dependent_tasks.len());
            let chunks = into_chunks(output_dependent_tasks.to_vec(), chunk_size);
            let _ = scope_and_block(chunks.len(), |scope| {
                for chunk in chunks {
                    let child_ctx = ctx.child_context();
                    scope.spawn(move || {
                        let mut ctx = child_ctx.create();
                        let mut queue = AggregationUpdateQueue::new();
                        for dependent_task_id in chunk {
                            process_output_dependents(
                                &mut ctx,
                                task_id,
                                dependent_task_id,
                                &mut queue,
                            )
                        }
                        queue.execute(&mut ctx);
                    });
                }
            });
        } else {
            let mut queue = AggregationUpdateQueue::new();
            for dependent_task_id in output_dependent_tasks {
                process_output_dependents(ctx, task_id, dependent_task_id, &mut queue);
            }
            queue.execute(ctx);
        }
    }

    fn task_execution_completed_unfinished_children_dirty(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        new_children: &FxHashSet<TaskId>,
    ) {
        debug_assert!(!new_children.is_empty());

        let mut queue = AggregationUpdateQueue::new();
        ctx.for_each_task_all(new_children.iter().copied(), |child_task, ctx| {
            if !child_task.has_output() {
                let child_id = child_task.id();
                make_task_dirty_internal(
                    child_task,
                    child_id,
                    false,
                    #[cfg(feature = "trace_task_dirty")]
                    TaskDirtyCause::InitialDirty,
                    &mut queue,
                    ctx,
                );
            }
        });

        queue.execute(ctx);
    }

    fn task_execution_completed_connect(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        new_children: FxHashSet<TaskId>,
    ) -> bool {
        debug_assert!(!new_children.is_empty());

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = task.get_in_progress() else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        if matches!(in_progress, InProgressState::Canceled) {
            // Task was canceled in the meantime, so we don't connect the children
            return false;
        }
        let InProgressState::InProgress(box InProgressStateInner {
            #[cfg(not(feature = "no_fast_stale"))]
            stale,
            once_task: is_once_task,
            ..
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        #[cfg(not(feature = "no_fast_stale"))]
        if *stale && !is_once_task {
            let Some(InProgressState::InProgress(box InProgressStateInner { done_event, .. })) =
                task.take_in_progress()
            else {
                unreachable!();
            };
            let old = task.set_in_progress(InProgressState::Scheduled {
                done_event,
                reason: TaskExecutionReason::Stale,
            });
            debug_assert!(old.is_none(), "InProgress already exists");
            drop(task);

            // All `new_children` are currently hold active with an active count and we need to undo
            // that. (We already filtered out the old children from that list)
            AggregationUpdateQueue::run(
                AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_children.into_iter().collect(),
                },
                ctx,
            );
            return true;
        }

        let has_active_count = ctx.should_track_activeness()
            && task
                .get_activeness()
                .is_some_and(|activeness| activeness.active_counter > 0);
        connect_children(
            ctx,
            task_id,
            task,
            new_children,
            has_active_count,
            ctx.should_track_activeness(),
        );

        false
    }

    fn task_execution_completed_finish(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        #[cfg(feature = "verify_determinism")] no_output_set: bool,
        new_output: Option<OutputValue>,
        is_now_immutable: bool,
    ) -> (
        bool,
        Option<
            auto_hash_map::AutoMap<CellId, InProgressCellState, BuildHasherDefault<FxHasher>, 1>,
        >,
    ) {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = task.take_in_progress() else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        if matches!(in_progress, InProgressState::Canceled) {
            // Task was canceled in the meantime, so we don't finish it
            return (false, None);
        }
        let InProgressState::InProgress(box InProgressStateInner {
            done_event,
            once_task: is_once_task,
            stale,
            session_dependent,
            marked_as_completed: _,
            new_children,
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        debug_assert!(new_children.is_empty());

        // If the task is stale, reschedule it
        if stale && !is_once_task {
            let old = task.set_in_progress(InProgressState::Scheduled {
                done_event,
                reason: TaskExecutionReason::Stale,
            });
            debug_assert!(old.is_none(), "InProgress already exists");
            return (true, None);
        }

        // Set the output if it has changed
        let mut old_content = None;
        if let Some(value) = new_output {
            old_content = task.set_output(value);
        }

        // If the task has no invalidator and has no mutable dependencies, it does not have a way
        // to be invalidated and we can mark it as immutable.
        if is_now_immutable {
            task.set_immutable(true);
        }

        // Notify in progress cells and remove all of them
        let in_progress_cells = task.take_in_progress_cells();
        if let Some(ref cells) = in_progress_cells {
            for state in cells.values() {
                state.event.notify(usize::MAX);
            }
        }

        // Grab the old dirty state
        let old_dirtyness = task.get_dirty().cloned();
        let (old_self_dirty, old_current_session_self_clean) = match old_dirtyness {
            None => (false, false),
            Some(Dirtyness::Dirty(_)) => (true, false),
            Some(Dirtyness::SessionDependent) => {
                let clean_in_current_session = task.current_session_clean();
                (true, clean_in_current_session)
            }
        };

        // Compute the new dirty state
        let (new_dirtyness, new_self_dirty, new_current_session_self_clean) = if session_dependent {
            (Some(Dirtyness::SessionDependent), true, true)
        } else {
            (None, false, false)
        };

        // Update the dirty state
        if old_dirtyness != new_dirtyness {
            if let Some(value) = new_dirtyness {
                task.set_dirty(value);
            } else if old_dirtyness.is_some() {
                task.take_dirty();
            }
        }
        if old_current_session_self_clean != new_current_session_self_clean {
            if new_current_session_self_clean {
                task.set_current_session_clean(true);
            } else if old_current_session_self_clean {
                task.set_current_session_clean(false);
            }
        }

        // Propagate dirtyness changes
        let data_update = if old_self_dirty != new_self_dirty
            || old_current_session_self_clean != new_current_session_self_clean
        {
            let dirty_container_count = task
                .get_aggregated_dirty_container_count()
                .cloned()
                .unwrap_or_default();
            let current_session_clean_container_count = task
                .get_aggregated_current_session_clean_container_count()
                .copied()
                .unwrap_or_default();
            let result = ComputeDirtyAndCleanUpdate {
                old_dirty_container_count: dirty_container_count,
                new_dirty_container_count: dirty_container_count,
                old_current_session_clean_container_count: current_session_clean_container_count,
                new_current_session_clean_container_count: current_session_clean_container_count,
                old_self_dirty,
                new_self_dirty,
                old_current_session_self_clean,
                new_current_session_self_clean,
            }
            .compute();
            if result.dirty_count_update - result.current_session_clean_update < 0 {
                // The task is clean now
                if let Some(activeness_state) = task.get_activeness_mut() {
                    activeness_state.all_clean_event.notify(usize::MAX);
                    activeness_state.unset_active_until_clean();
                    if activeness_state.is_empty() {
                        task.take_activeness();
                    }
                }
            }
            result
                .aggregated_update(task_id)
                .and_then(|aggregated_update| {
                    AggregationUpdateJob::data_update(&mut task, aggregated_update)
                })
        } else {
            None
        };

        #[cfg(feature = "verify_determinism")]
        let reschedule =
            (dirty_changed || no_output_set) && !task_id.is_transient() && !is_once_task;
        #[cfg(not(feature = "verify_determinism"))]
        let reschedule = false;
        if reschedule {
            let old = task.set_in_progress(InProgressState::Scheduled {
                done_event,
                reason: TaskExecutionReason::Stale,
            });
            debug_assert!(old.is_none(), "InProgress already exists");
            drop(task);
        } else {
            drop(task);

            // Notify dependent tasks that are waiting for this task to finish
            done_event.notify(usize::MAX);
        }

        drop(old_content);

        if let Some(data_update) = data_update {
            AggregationUpdateQueue::run(data_update, ctx);
        }

        // We return so the data can be dropped outside of critical sections
        (reschedule, in_progress_cells)
    }

    fn task_execution_completed_cleanup(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        is_error: bool,
    ) -> Vec<SharedReference> {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let mut removed_cell_data = Vec::new();
        // An error is potentially caused by a eventual consistency, so we avoid updating cells
        // after an error as it is likely transient and we want to keep the dependent tasks
        // clean to avoid re-executions.
        if !is_error {
            // Remove no longer existing cells and
            // find all outdated data items (removed cells, outdated edges)
            // Note: We do not mark the tasks as dirty here, as these tasks are unused or stale
            // anyway and we want to avoid needless re-executions. When the cells become
            // used again, they are invalidated from the update cell operation.
            // Remove cell data for cells that no longer exist
            let to_remove_persistent: Vec<_> = task
                .iter_persistent_cell_data()
                .filter_map(|(cell, _)| {
                    cell_counters
                        .get(&cell.type_id)
                        .is_none_or(|start_index| cell.index >= *start_index)
                        .then_some(*cell)
                })
                .collect();

            // Remove transient cell data for cells that no longer exist
            let to_remove_transient: Vec<_> = task
                .iter_transient_cell_data()
                .filter_map(|(cell, _)| {
                    cell_counters
                        .get(&cell.type_id)
                        .is_none_or(|start_index| cell.index >= *start_index)
                        .then_some(*cell)
                })
                .collect();
            removed_cell_data.reserve_exact(to_remove_persistent.len() + to_remove_transient.len());
            for cell in to_remove_persistent {
                if let Some(data) = task.remove_persistent_cell_data(&cell) {
                    removed_cell_data.push(data.into_untyped());
                }
            }
            for cell in to_remove_transient {
                if let Some(data) = task.remove_transient_cell_data(&cell) {
                    removed_cell_data.push(data);
                }
            }
        }

        // Clean up task storage after execution:
        // - Shrink collections marked with shrink_on_completion
        // - Drop dependency fields for immutable tasks (they'll never re-execute)
        task.cleanup_after_execution();

        drop(task);

        // Return so we can drop outside of critical sections
        removed_cell_data
    }

    fn run_backend_job<'a>(
        self: &'a Arc<Self>,
        job: TurboTasksBackendJob,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            match job {
                TurboTasksBackendJob::InitialSnapshot | TurboTasksBackendJob::FollowUpSnapshot => {
                    debug_assert!(self.should_persist());

                    let last_snapshot = self.last_snapshot.load(Ordering::Relaxed);
                    let mut last_snapshot = self.start_time + Duration::from_millis(last_snapshot);
                    let mut idle_start_listener = self.idle_start_event.listen();
                    let mut idle_end_listener = self.idle_end_event.listen();
                    let mut fresh_idle = true;
                    loop {
                        const FIRST_SNAPSHOT_WAIT: Duration = Duration::from_secs(300);
                        const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(120);
                        let idle_timeout = *IDLE_TIMEOUT;
                        let (time, mut reason) =
                            if matches!(job, TurboTasksBackendJob::InitialSnapshot) {
                                (FIRST_SNAPSHOT_WAIT, "initial snapshot timeout")
                            } else {
                                (SNAPSHOT_INTERVAL, "regular snapshot interval")
                            };

                        let until = last_snapshot + time;
                        if until > Instant::now() {
                            let mut stop_listener = self.stopping_event.listen();
                            if self.stopping.load(Ordering::Acquire) {
                                return;
                            }
                            let mut idle_time = if turbo_tasks.is_idle() && fresh_idle {
                                Instant::now() + idle_timeout
                            } else {
                                far_future()
                            };
                            loop {
                                tokio::select! {
                                    _ = &mut stop_listener => {
                                        return;
                                    },
                                    _ = &mut idle_start_listener => {
                                        fresh_idle = true;
                                        idle_time = Instant::now() + idle_timeout;
                                        idle_start_listener = self.idle_start_event.listen()
                                    },
                                    _ = &mut idle_end_listener => {
                                        idle_time = until + idle_timeout;
                                        idle_end_listener = self.idle_end_event.listen()
                                    },
                                    _ = tokio::time::sleep_until(until) => {
                                        break;
                                    },
                                    _ = tokio::time::sleep_until(idle_time) => {
                                        if turbo_tasks.is_idle() {
                                            reason = "idle timeout";
                                            break;
                                        }
                                    },
                                }
                            }
                        }

                        let this = self.clone();
                        let snapshot = this.snapshot_and_persist(None, reason);
                        if let Some((snapshot_start, new_data)) = snapshot {
                            last_snapshot = snapshot_start;
                            if !new_data {
                                fresh_idle = false;
                                continue;
                            }
                            let last_snapshot = last_snapshot.duration_since(self.start_time);
                            self.last_snapshot.store(
                                last_snapshot.as_millis().try_into().unwrap(),
                                Ordering::Relaxed,
                            );

                            turbo_tasks.schedule_backend_background_job(
                                TurboTasksBackendJob::FollowUpSnapshot,
                            );
                            return;
                        }
                    }
                }
            }
        })
    }

    fn try_read_own_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<TypedCellContent> {
        let mut ctx = self.execute_context(turbo_tasks);
        let task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(content) = task.get_cell_data(options.is_serializable_cell_content, cell) {
            debug_assert!(content.type_id == cell.type_id, "Cell type ID mismatch");
            Ok(CellContent(Some(content.reference)).into_typed(cell.type_id))
        } else {
            Ok(CellContent(None).into_typed(cell.type_id))
        }
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader_id: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
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
            for (collectible, count) in task.iter_aggregated_collectibles() {
                if *count > 0 && collectible.collectible_type == collectible_type {
                    *collectibles
                        .entry(RawVc::TaskCell(
                            collectible.cell.task,
                            collectible.cell.cell,
                        ))
                        .or_insert(0) += 1;
                }
            }
            for (&collectible, &count) in task.iter_collectibles() {
                if collectible.collectible_type == collectible_type {
                    *collectibles
                        .entry(RawVc::TaskCell(
                            collectible.cell.task,
                            collectible.cell.cell,
                        ))
                        .or_insert(0) += count;
                }
            }
            if let Some(reader_id) = reader_id {
                let _ = task.add_collectibles_dependents((collectible_type, reader_id));
            }
        }
        if let Some(reader_id) = reader_id {
            let mut reader = ctx.task(reader_id, TaskDataCategory::Data);
            let target = CollectiblesRef {
                task: task_id,
                collectible_type,
            };
            if !reader.remove_outdated_collectibles_dependencies(&target) {
                let _ = reader.add_collectibles_dependencies(target);
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
        is_serializable_cell_content: bool,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        verification_mode: VerificationMode,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        operation::UpdateCellOperation::run(
            task_id,
            cell,
            content,
            is_serializable_cell_content,
            updated_key_hashes,
            verification_mode,
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
        })) = task.get_in_progress_mut()
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
        })) = task.get_in_progress_mut()
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
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        self.assert_not_persistent_calling_transient(parent_task, task, None);
        ConnectChildOperation::run(parent_task, task, None, self.execute_context(turbo_tasks));
    }

    fn create_transient_task(&self, task_type: TransientTaskType) -> TaskId {
        let task_id = self.transient_task_id_factory.get();
        {
            let mut task = self.storage.access_mut(task_id);
            task.init_transient_task(task_id, task_type, self.should_track_activeness());
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
        let is_dirty = task.is_dirty();
        let has_dirty_containers = task.has_dirty_containers();
        if is_dirty.is_some() || has_dirty_containers {
            if let Some(activeness_state) = task.get_activeness_mut() {
                // We will finish the task, but it would be removed after the task is done
                activeness_state.unset_root_type();
                activeness_state.set_active_until_clean();
            };
        } else if let Some(activeness_state) = task.take_activeness() {
            // Technically nobody should be listening to this event, but just in case
            // we notify it anyway
            activeness_state.all_clean_event.notify(usize::MAX);
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

        for task_id in root_tasks.into_iter() {
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
                    panic!(
                        "Task {} {} doesn't report to any root but is reachable from one (uppers: \
                         {:?})",
                        task_id,
                        ctx.get_task_description(task_id),
                        uppers
                    );
                }

                let aggregated_collectibles: Vec<_> = task
                    .iter_aggregated_collectibles()
                    .map(|(collectible, _)| collectible)
                    .collect();
                for collectible in aggregated_collectibles {
                    collectibles
                        .entry(collectible)
                        .or_insert_with(|| (false, Vec::new()))
                        .1
                        .push(task_id);
                }

                let own_collectibles: Vec<_> = task
                    .iter_collectibles_entries()
                    .filter_map(|(&collectible, &value)| (value > 0).then_some(collectible))
                    .collect::<Vec<_>>();
                for collectible in own_collectibles {
                    if let Some((flag, _)) = collectibles.get_mut(&collectible) {
                        *flag = true
                    } else {
                        panic!(
                            "Task {} has a collectible {:?} that is not in any upper task",
                            task_id, collectible
                        );
                    }
                }

                let is_dirty = task.has_dirty();
                let has_dirty_container = task.has_dirty_containers();
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

                for child_id in task.iter_children() {
                    // println!("{task_id}: child -> {child_id}");
                    if visited.insert(child_id) {
                        queue.push_back(child_id);
                    }
                }
                drop(task);

                if should_be_in_upper {
                    for upper_id in uppers {
                        let task = ctx.task(upper_id, TaskDataCategory::All);
                        let in_upper = task
                            .get_aggregated_dirty_containers(&task_id)
                            .is_some_and(|&dirty| dirty > 0);
                        if !in_upper {
                            let containers: Vec<_> = task
                                .iter_aggregated_dirty_containers_entries()
                                .map(|(&k, &v)| (k, v))
                                .collect();
                            panic!(
                                "Task {} ({}) is dirty, but is not listed in the upper task {} \
                                 ({})\nThese dirty containers are present:\n{:#?}",
                                task_id,
                                ctx.get_task_description(task_id),
                                upper_id,
                                ctx.get_task_description(upper_id),
                                containers,
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
                    )
                    .unwrap();

                    let task_id = collectible.cell.task;
                    let mut queue = {
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        get_uppers(&task)
                    };
                    let mut visited = FxHashSet::default();
                    for &upper_id in queue.iter() {
                        visited.insert(upper_id);
                        writeln!(stdout, "{task_id:?} -> {upper_id:?}").unwrap();
                    }
                    while let Some(task_id) = queue.pop() {
                        let desc = ctx.get_task_description(task_id);
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        let aggregated_collectible = task
                            .get_aggregated_collectibles(&collectible)
                            .copied()
                            .unwrap_or_default();
                        let uppers = get_uppers(&task);
                        drop(task);
                        writeln!(
                            stdout,
                            "upper {task_id} {desc} collectible={aggregated_collectible}"
                        )
                        .unwrap();
                        if task_ids.contains(&task_id) {
                            writeln!(
                                stdout,
                                "Task has an upper connection to an aggregated task that doesn't \
                                 reference it. Upper connection is invalid!"
                            )
                            .unwrap();
                        }
                        for upper_id in uppers {
                            writeln!(stdout, "{task_id:?} -> {upper_id:?}").unwrap();
                            if !visited.contains(&upper_id) {
                                queue.push(upper_id);
                            }
                        }
                    }
                    panic!("See stdout for more details");
                }
            }
        }
    }

    fn assert_not_persistent_calling_transient(
        &self,
        parent_id: Option<TaskId>,
        child_id: TaskId,
        cell_id: Option<CellId>,
    ) {
        if let Some(parent_id) = parent_id
            && !parent_id.is_transient()
            && child_id.is_transient()
        {
            self.panic_persistent_calling_transient(
                self.debug_get_task_description(parent_id),
                self.debug_get_cached_task_type(child_id).as_deref(),
                cell_id,
            );
        }
    }

    fn panic_persistent_calling_transient(
        &self,
        parent: String,
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
            parent,
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
                .map(|t| self.debug_get_task_description(t))
            {
                Cow::Owned(format!(" (return type of {col_task_ty})"))
            } else {
                Cow::Borrowed("")
            };
            panic!("Collectible{task_info} must be a ResolvedVc")
        };
        if col_task_id.is_transient() && !task_id.is_transient() {
            let transient_reason =
                if let Some(col_task_ty) = self.debug_get_cached_task_type(col_task_id) {
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
        parent_task: Option<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId {
        self.0
            .get_or_create_persistent_task(task_type, parent_task, turbo_tasks)
    }

    fn get_or_create_transient_task(
        &self,
        task_type: CachedTaskType,
        parent_task: Option<TaskId>,
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

    fn task_execution_canceled(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.task_execution_canceled(task, turbo_tasks)
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        priority: TaskPriority,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Option<TaskExecutionSpec<'_>> {
        self.0
            .try_start_task_execution(task_id, priority, turbo_tasks)
    }

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        has_invalidator: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> bool {
        self.0.task_execution_completed(
            task_id,
            result,
            cell_counters,
            has_invalidator,
            turbo_tasks,
        )
    }

    type BackendJob = TurboTasksBackendJob;

    fn run_backend_job<'a>(
        &'a self,
        job: Self::BackendJob,
        turbo_tasks: &'a dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        self.0.run_backend_job(job, turbo_tasks)
    }

    fn try_read_task_output(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.0
            .try_read_task_output(task_id, reader, options, turbo_tasks)
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        reader: Option<TaskId>,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.0
            .try_read_task_cell(task_id, reader, cell, options, turbo_tasks)
    }

    fn try_read_own_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<TypedCellContent> {
        self.0
            .try_read_own_task_cell(task_id, cell, options, turbo_tasks)
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader: Option<TaskId>,
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
        is_serializable_cell_content: bool,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        verification_mode: VerificationMode,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        self.0.update_task_cell(
            task_id,
            cell,
            is_serializable_cell_content,
            content,
            updated_key_hashes,
            verification_mode,
            turbo_tasks,
        );
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
        parent_task: Option<TaskId>,
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

    fn is_tracking_dependencies(&self) -> bool {
        self.0.options.dependency_tracking
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
                write!(f, " (read cell of type {})", get_value_type(ty).global_name)
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

/// Encodes task data, using the provided buffer as a scratch space.  Returns a new exactly sized
/// buffer.
/// This allows reusing the buffer across multiple encode calls to optimize allocations and
/// resulting buffer sizes.
fn encode_task_data(
    task: TaskId,
    data: &TaskStorage,
    category: SpecificTaskDataCategory,
    scratch_buffer: &mut TurboBincodeBuffer,
) -> Result<TurboBincodeBuffer> {
    scratch_buffer.clear();
    let mut encoder = new_turbo_bincode_encoder(scratch_buffer);
    data.encode(category, &mut encoder)?;

    if cfg!(feature = "verify_serialization") {
        TaskStorage::new()
            .decode(
                category,
                &mut new_turbo_bincode_decoder(&scratch_buffer[..]),
            )
            .with_context(|| {
                format!(
                    "expected to be able to decode serialized data for '{category:?}' information \
                     for {task}"
                )
            })?;
    }
    Ok(SmallVec::from_slice(scratch_buffer))
}
