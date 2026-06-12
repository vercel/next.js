mod cell_data;
mod counter_map;
mod operation;
mod snapshot_coordinator;
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
        atomic::{AtomicBool, Ordering},
    },
    time::SystemTime,
};

use anyhow::{Context, Result, bail};
use auto_hash_map::{AutoMap, AutoSet};
use indexmap::IndexSet;
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use smallvec::{SmallVec, smallvec};
use tokio::time::{Duration, Instant};
use tracing::{Span, trace_span};
use turbo_bincode::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};
use turbo_tasks::{
    CellId, DynTaskInputsStorage, RawVc, ReadCellOptions, ReadCellTracking, ReadConsistency,
    ReadOutputOptions, ReadTracking, SharedReference, TRANSIENT_TASK_BIT, TaskExecutionReason,
    TaskId, TaskPersistence, TaskPriority, TraitTypeId, TurboTasks, TurboTasksCallApi,
    TurboTasksPanic, ValueTypeId,
    backend::{
        Backend, CachedTaskType, CachedTaskTypeArc, CellContent, CellHash, TaskExecutionSpec,
        TransientTaskType, TurboTaskContextError, TurboTaskLocalContextError, TurboTasksError,
        TurboTasksExecutionError, TurboTasksExecutionErrorMessage, TypedCellContent,
        VerificationMode,
    },
    event::{Event, EventDescription, EventListener},
    macro_helpers::NativeFunction,
    message_queue::{TimingEvent, TraceEvent},
    registry::get_value_type,
    scope::scope_and_block,
    task_statistics::TaskStatisticsApi,
    trace::TraceRawVcs,
    util::{IdFactoryWithReuse, good_chunk_size, into_chunks},
};
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::{FunctionId, TaskDirtyCause};

pub use self::{
    operation::AnyOperation,
    storage::{EvictionCounts, SpecificTaskDataCategory, TaskDataCategory},
};
use crate::{
    backend::{
        operation::{
            AggregationUpdateJob, AggregationUpdateQueue, ChildExecuteContext,
            CleanupOldEdgesOperation, ConnectChildOperation, ExecuteContext, ExecuteContextImpl,
            LeafDistanceUpdateQueue, Operation, OutdatedEdge, TaskGuard, TaskType, TaskTypeRef,
            connect_children, get_aggregation_number, get_uppers, make_task_dirty_internal,
            prepare_new_children,
        },
        snapshot_coordinator::{OperationGuard, SnapshotCoordinator},
        storage::Storage,
        storage_schema::{TaskStorage, TaskStorageAccessors},
    },
    backing_storage::{SnapshotItem, SnapshotMeta, compute_task_type_hash},
    data::{
        ActivenessState, CellDependency, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
        InProgressCellState, InProgressState, InProgressStateInner, OutputValue, TransientTask,
    },
    error::TaskError,
    kv_backing_storage::TurboBackingStorage,
    utils::{
        dash_map_raw_entry::{RawEntry, get_shard, raw_entry_in_shard, raw_get_in_shard},
        shard_amount::compute_shard_amount,
    },
};

/// Threshold for parallelizing making dependent tasks dirty.
/// If the number of dependent tasks exceeds this threshold,
/// the operation will be parallelized.
const DEPENDENT_TASKS_DIRTY_PARALLELIZATION_THRESHOLD: usize = 10000;

/// Configurable idle timeout for snapshot persistence.
/// Defaults to 2 seconds if not set or if the value is invalid.
static IDLE_TIMEOUT: LazyLock<Duration> = LazyLock::new(|| {
    std::env::var("TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_millis)
        .unwrap_or(Duration::from_secs(2))
});

/// Priority used to re-schedule a task that became stale during execution.
///
/// Stale tasks must run again, but at a priority that reflects why they're being re-run rather
/// than the (likely higher) priority of the original schedule. We use invalidation priority
/// based on the task's leaf distance, parented under either the task's current dirty priority
/// or `leaf()` if it is no longer dirty.
fn compute_stale_priority(task: &impl TaskGuard) -> TaskPriority {
    TaskPriority::invalidation(
        task.get_leaf_distance()
            .copied()
            .unwrap_or_default()
            .distance,
    )
    .in_parent(task.is_dirty().unwrap_or(TaskPriority::leaf()))
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

    /// When enabled, evict all evictable tasks from in-memory storage after every snapshot.
    /// This reclaims memory by clearing persisted data that can be re-loaded from disk on demand.
    /// This is an EXPERIMENTAL FEATURE under development
    pub evict_after_snapshot: bool,
}

impl Default for BackendOptions {
    fn default() -> Self {
        Self {
            dependency_tracking: true,
            active_tracking: true,
            storage_mode: Some(StorageMode::ReadWrite),
            num_workers: None,
            small_preallocation: false,
            evict_after_snapshot: false,
        }
    }
}

pub enum TurboTasksBackendJob {
    Snapshot,
}

/// Why a snapshot/persist is being performed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SnapshotReason {
    Test,
    Stop,
    InitialSnapshotTimeout,
    RegularSnapshotInterval,
    IdleTimeout,
}

impl SnapshotReason {
    fn as_str(self) -> &'static str {
        match self {
            SnapshotReason::Test => "test",
            SnapshotReason::Stop => "stop",
            SnapshotReason::InitialSnapshotTimeout => "initial snapshot timeout",
            SnapshotReason::RegularSnapshotInterval => "regular snapshot interval",
            SnapshotReason::IdleTimeout => "idle timeout",
        }
    }

    /// True only for `Stop`: at shutdown the whole map is dropped right after, so each task
    /// entry can be drained from the map and freed as it is serialized instead of after the
    /// whole batch is written. This reduces peak memory during `next build` shutdown.
    fn drain_entries(self) -> bool {
        matches!(self, SnapshotReason::Stop)
    }
}

pub struct TurboTasksBackend {
    options: BackendOptions,

    start_time: Instant,

    persisted_task_id_factory: IdFactoryWithReuse<TaskId>,
    transient_task_id_factory: IdFactoryWithReuse<TaskId>,

    storage: Storage,

    /// Coordinates the operation/snapshot interleaving protocol. See
    /// [`SnapshotCoordinator`] for details.
    snapshot_coord: SnapshotCoordinator,
    /// Serializes calls to `snapshot_and_persist`. The coordinator's
    /// `begin_snapshot` asserts that snapshots don't overlap; this mutex
    /// enforces that contract for our two callers (background loop and
    /// `stop_and_wait`).
    snapshot_in_progress: Mutex<()>,

    stopping: AtomicBool,
    stopping_event: Event,
    idle_start_event: Event,
    idle_end_event: Event,
    #[cfg(feature = "verify_aggregation_graph")]
    is_idle: AtomicBool,

    task_statistics: TaskStatisticsApi,

    backing_storage: TurboBackingStorage,

    #[cfg(feature = "verify_aggregation_graph")]
    root_tasks: Mutex<FxHashSet<TaskId>>,
}

impl TurboTasksBackend {
    /// Invalidates the persistent storage so that it will be deleted the next time a turbopack
    /// instance is created with the filesystem cache enabled.
    ///
    /// `reason_code` should be one of the codes in
    /// [`crate::db_invalidation::invalidation_reasons`].
    pub fn invalidate_storage(&self, reason_code: &str) -> Result<()> {
        self.backing_storage.invalidate(reason_code)
    }

    pub fn new(mut options: BackendOptions, backing_storage: TurboBackingStorage) -> Self {
        let shard_amount = compute_shard_amount(options.num_workers, options.small_preallocation);
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
            storage: Storage::new(shard_amount, small_preallocation),
            snapshot_coord: SnapshotCoordinator::new(),
            snapshot_in_progress: Mutex::new(()),
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
        turbo_tasks: &'a TurboTasks<TurboTasksBackend>,
    ) -> impl ExecuteContext<'a> {
        ExecuteContextImpl::new(self, turbo_tasks)
    }

    fn operation_suspend_point(&self, suspend: impl FnOnce() -> AnyOperation) {
        if self.should_persist() {
            self.snapshot_coord.suspend_point(suspend);
        }
    }

    pub(crate) fn start_operation(&self) -> OperationGuard<'_, AnyOperation> {
        if !self.should_persist() {
            return OperationGuard::noop();
        }
        self.snapshot_coord.begin_operation()
    }

    fn should_persist(&self) -> bool {
        matches!(
            self.options.storage_mode,
            Some(StorageMode::ReadWrite) | Some(StorageMode::ReadWriteOnShutdown)
        )
    }

    fn should_evict(&self) -> bool {
        self.options.evict_after_snapshot && self.should_persist()
    }

    /// Perform a snapshot and then evict all evictable tasks from memory.
    ///
    /// This is exposed for integration tests that need to verify the
    /// snapshot → evict → restore cycle works correctly.
    ///
    /// Returns `(snapshot_had_new_data, eviction_counts)`.
    #[doc(hidden)]
    pub fn snapshot_and_evict_for_testing(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> (bool, EvictionCounts) {
        assert!(
            self.should_persist(),
            "snapshot_and_evict requires persistence"
        );
        let snapshot_result = self.snapshot_and_persist(None, SnapshotReason::Test, turbo_tasks);
        let had_new_data = match snapshot_result {
            Ok((_, new_data)) => new_data,
            Err(_) => {
                // Snapshot/persist failed — skip eviction since the data may not
                // be on disk yet. Evicting now could lose in-memory state that
                // can't be restored.
                return (false, EvictionCounts::default());
            }
        };
        let counts = self.storage.evict_after_snapshot(None);
        (had_new_data, counts)
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

    fn track_cache_hit_by_fn(&self, native_fn: &'static NativeFunction) {
        self.task_statistics
            .map(|stats| stats.increment_cache_hit(native_fn));
    }

    fn track_cache_miss_by_fn(&self, native_fn: &'static NativeFunction) {
        self.task_statistics
            .map(|stats| stats.increment_cache_miss(native_fn));
    }

    /// Reconstructs a full [`TurboTasksExecutionError`] from the compact [`TaskError`] storage
    /// representation. For [`TaskError::TaskChain`], this looks up the source error from the last
    /// task's output and rebuilds the nested `TaskContext` wrappers with `TurboTasksCallApi`
    /// references for lazy name resolution.
    fn task_error_to_turbo_tasks_execution_error(
        &self,
        error: &TaskError,
        ctx: &mut impl ExecuteContext<'_>,
    ) -> TurboTasksExecutionError {
        match error {
            TaskError::Panic(panic) => TurboTasksExecutionError::Panic(panic.clone()),
            TaskError::Error(item) => TurboTasksExecutionError::Error(Arc::new(TurboTasksError {
                message: item.message.clone(),
                source: item
                    .source
                    .as_ref()
                    .map(|e| self.task_error_to_turbo_tasks_execution_error(e, ctx)),
            })),
            TaskError::LocalTaskContext(local_task_context) => {
                TurboTasksExecutionError::LocalTaskContext(Arc::new(TurboTaskLocalContextError {
                    name: local_task_context.name.clone(),
                    source: local_task_context
                        .source
                        .as_ref()
                        .map(|e| self.task_error_to_turbo_tasks_execution_error(e, ctx)),
                }))
            }
            TaskError::TaskChain(chain) => {
                let task_id = chain.last().unwrap();
                let error = {
                    let task = ctx.task(*task_id, TaskDataCategory::Meta);
                    if let Some(OutputValue::Error(error)) = task.get_output() {
                        Some(error.clone())
                    } else {
                        None
                    }
                };
                let error = error.map_or_else(
                    || {
                        // Eventual consistency will cause errors to no longer be available
                        TurboTasksExecutionError::Panic(Arc::new(TurboTasksPanic {
                            message: TurboTasksExecutionErrorMessage::PIISafe(Cow::Borrowed(
                                "Error no longer available",
                            )),
                            location: None,
                        }))
                    },
                    |e| self.task_error_to_turbo_tasks_execution_error(&e, ctx),
                );
                let mut current_error = error;
                for &task_id in chain.iter().rev() {
                    current_error =
                        TurboTasksExecutionError::TaskContext(Arc::new(TurboTaskContextError {
                            task_id,
                            source: Some(current_error),
                            turbo_tasks: ctx.turbo_tasks(),
                        }));
                }
                current_error
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
    #[cfg(feature = "task_dirty_cause")]
    pub function_id: Option<FunctionId>,
    pub new_output: Option<OutputValue>,
    pub output_dependent_tasks: SmallVec<[TaskId; 4]>,
    pub is_recomputation: bool,
    pub is_session_dependent: bool,
}

// Operations
impl TurboTasksBackend {
    fn try_read_task_output(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
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
            if task
                .get_persistent_task_type()
                .is_some_and(|t| !t.native_fn.is_root)
            {
                drop(task);
                drop(reader_task);
                panic!(
                    "Strongly consistent read of non-root task {} (reader: {}). The `root` \
                     attribute is missing on the task.",
                    self.debug_get_task_description(task_id),
                    reader.map_or_else(
                        || "unknown".to_string(),
                        |r| self.debug_get_task_description(r)
                    )
                );
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
                    // Reach the backend through the pinned `turbo_tasks` handle rather than
                    // cloning `self`: pinning keeps the backend alive for the closure's lifetime.
                    let tt = turbo_tasks.pin();
                    move || {
                        let mut ctx = tt.backend().execute_context(&tt);
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
                OutputValue::Error(error) => Err(error.clone()),
            };
            if let Some(mut reader_task) = reader_task.take()
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
            } else {
                drop(task);
            }

            return result.map_err(|error| {
                self.task_error_to_turbo_tasks_execution_error(&error, &mut ctx)
                    .with_task_context(task_id, turbo_tasks.pin())
                    .into()
            });
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
        ctx.schedule_task(task, TaskPriority::Recomputation);

        Ok(Err(listener))
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        cell: CellId,
        options: ReadCellOptions,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
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
                let _ = task
                    .add_cell_dependents(CellDependency::new(CellRef { task: reader, cell }, key));
                drop(task);

                // Note: We use `task_pair` earlier to lock the task and its reader at the same
                // time. If we didn't and just locked the reader here, an invalidation could occur
                // between grabbing the locks. If that happened, and if the task is "outdated" or
                // doesn't have the dependency edge yet, the invalidation would be lost.

                let target = CellRef {
                    task: task_id,
                    cell,
                };
                let dep = CellDependency::new(target, key);
                if !reader_task.remove_outdated_cell_dependencies(&dep) {
                    let _ = reader_task.add_cell_dependencies(dep);
                }
                drop(reader_task);
            }
        }

        let ReadCellOptions {
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
            task.remove_cell_data(&cell)
        } else {
            task.get_cell_data(&cell).cloned()
        };
        if let Some(content) = content {
            if tracking.should_track(false) {
                add_cell_dependency(task_id, task, reader, reader_task, cell, tracking.key());
            }
            return Ok(Ok(TypedCellContent(
                cell.type_id,
                CellContent(Some(content)),
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
        // task to get the cell content.

        // Bail early if the task was cancelled — no point in registering a listener
        // on a task that won't execute again.
        if is_cancelled {
            bail!("{} was canceled", task.get_task_description());
        }

        // Listen to the cell and potentially schedule the task
        let (listener, new_listener) = self.listen_to_cell(&mut task, task_id, &reader_task, cell);
        drop(reader_task);
        if !new_listener {
            return Ok(Err(listener));
        }

        let _span = tracing::trace_span!(
            "recomputation",
            cell_type = get_value_type(cell.type_id).ty.global_name,
            cell_index = cell.index
        )
        .entered();

        let _ = task.add_scheduled(
            TaskExecutionReason::CellNotAvailable,
            EventDescription::new(|| task.get_task_desc_fn()),
        );
        ctx.schedule_task(task, TaskPriority::Recomputation);

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
        reason: SnapshotReason,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> Result<(Instant, bool), anyhow::Error> {
        let snapshot_span =
            tracing::trace_span!(parent: parent_span.clone(), "snapshot", reason = reason.as_str())
                .entered();
        // Serialize snapshots. The internal protocol (snapshot_mode, snapshot
        // request bit, suspended_operations) assumes only one snapshot runs at
        // a time. Held for the entire snapshot lifecycle.
        let _snapshot_in_progress = self.snapshot_in_progress.lock();
        let start = Instant::now();
        // SystemTime for wall-clock timestamps in trace events (milliseconds
        // since epoch). Instant is monotonic but has no defined epoch, so it
        // can't be used for cross-process trace correlation.
        let wall_start = SystemTime::now();
        debug_assert!(self.should_persist());

        let mut snapshot_phase = {
            let _span = tracing::info_span!("blocking").entered();
            self.snapshot_coord.begin_snapshot()
        };
        // Enter snapshot mode, which atomically reads and resets the modified count.
        // Checking after start_snapshot ensures no concurrent increments can race.
        let (snapshot_guard, has_modifications) = self.storage.start_snapshot();

        let suspended_operations = snapshot_phase.take_suspended_operations();

        let snapshot_time = Instant::now();
        drop(snapshot_phase);

        if !has_modifications {
            // No tasks modified since the last snapshot — drop the guard (which
            // calls end_snapshot) and skip the expensive O(N) scan.
            drop(snapshot_guard);
            return Ok((start, false));
        }

        #[cfg(feature = "print_cache_item_size")]
        #[derive(Default)]
        struct TaskCacheStats {
            data: usize,
            #[cfg(feature = "print_cache_item_size_with_compressed")]
            data_compressed: usize,
            data_count: usize,
            meta: usize,
            #[cfg(feature = "print_cache_item_size_with_compressed")]
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
        /// Formats a byte size, optionally including the compressed size when the
        /// `print_cache_item_size_with_compressed` feature is enabled.
        #[cfg(feature = "print_cache_item_size")]
        struct FormatSizes {
            size: usize,
            #[cfg(feature = "print_cache_item_size_with_compressed")]
            compressed_size: usize,
        }
        #[cfg(feature = "print_cache_item_size")]
        impl std::fmt::Display for FormatSizes {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                use turbo_tasks::util::FormatBytes;
                #[cfg(feature = "print_cache_item_size_with_compressed")]
                {
                    write!(
                        f,
                        "{} ({} compressed)",
                        FormatBytes(self.size),
                        FormatBytes(self.compressed_size)
                    )
                }
                #[cfg(not(feature = "print_cache_item_size_with_compressed"))]
                {
                    write!(f, "{}", FormatBytes(self.size))
                }
            }
        }
        #[cfg(feature = "print_cache_item_size")]
        impl TaskCacheStats {
            #[cfg(feature = "print_cache_item_size_with_compressed")]
            fn compressed_size(data: &[u8]) -> Result<usize> {
                Ok(lzzzz::lz4::Compressor::new()?.next_to_vec(
                    data,
                    &mut Vec::new(),
                    lzzzz::lz4::ACC_LEVEL_DEFAULT,
                )?)
            }

            fn add_data(&mut self, data: &[u8]) {
                self.data += data.len();
                #[cfg(feature = "print_cache_item_size_with_compressed")]
                {
                    self.data_compressed += Self::compressed_size(data).unwrap_or(0);
                }
                self.data_count += 1;
            }

            fn add_meta(&mut self, data: &[u8]) {
                self.meta += data.len();
                #[cfg(feature = "print_cache_item_size_with_compressed")]
                {
                    self.meta_compressed += Self::compressed_size(data).unwrap_or(0);
                }
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

            /// Returns the task name used as the stats grouping key.
            fn task_name(storage: &TaskStorage) -> String {
                storage
                    .get_persistent_task_type()
                    .map(|t| t.to_string())
                    .unwrap_or_else(|| "<unknown>".to_string())
            }

            /// Returns the primary sort key: compressed total when
            /// `print_cache_item_size_with_compressed` is enabled, raw total otherwise.
            fn sort_key(&self) -> usize {
                #[cfg(feature = "print_cache_item_size_with_compressed")]
                {
                    self.data_compressed + self.meta_compressed
                }
                #[cfg(not(feature = "print_cache_item_size_with_compressed"))]
                {
                    self.data + self.meta
                }
            }

            fn format_total(&self) -> FormatSizes {
                FormatSizes {
                    size: self.data + self.meta,
                    #[cfg(feature = "print_cache_item_size_with_compressed")]
                    compressed_size: self.data_compressed + self.meta_compressed,
                }
            }

            fn format_data(&self) -> FormatSizes {
                FormatSizes {
                    size: self.data,
                    #[cfg(feature = "print_cache_item_size_with_compressed")]
                    compressed_size: self.data_compressed,
                }
            }

            fn format_avg_data(&self) -> FormatSizes {
                FormatSizes {
                    size: self.data.checked_div(self.data_count).unwrap_or(0),
                    #[cfg(feature = "print_cache_item_size_with_compressed")]
                    compressed_size: self
                        .data_compressed
                        .checked_div(self.data_count)
                        .unwrap_or(0),
                }
            }

            fn format_meta(&self) -> FormatSizes {
                FormatSizes {
                    size: self.meta,
                    #[cfg(feature = "print_cache_item_size_with_compressed")]
                    compressed_size: self.meta_compressed,
                }
            }

            fn format_avg_meta(&self) -> FormatSizes {
                FormatSizes {
                    size: self.meta.checked_div(self.meta_count).unwrap_or(0),
                    #[cfg(feature = "print_cache_item_size_with_compressed")]
                    compressed_size: self
                        .meta_compressed
                        .checked_div(self.meta_count)
                        .unwrap_or(0),
                }
            }
        }
        #[cfg(feature = "print_cache_item_size")]
        let task_cache_stats: Mutex<FxHashMap<_, TaskCacheStats>> =
            Mutex::new(FxHashMap::default());

        // Encode each task's modified categories. We only encode categories with `modified` set,
        // meaning the category was actually dirtied. Categories restored from disk but never
        // modified don't need re-persisting since the on-disk version is still valid.
        // For tasks accessed during snapshot mode, a frozen copy was made and its `modified`
        // flags were copied from the live task at snapshot creation time, reflecting which
        // categories were dirtied before the snapshot was taken.
        let process = |task_id: TaskId, inner: &TaskStorage, buffer: &mut TurboBincodeBuffer| {
            let encode_category = |task_id: TaskId,
                                   data: &TaskStorage,
                                   category: SpecificTaskDataCategory,
                                   buffer: &mut TurboBincodeBuffer|
             -> Option<TurboBincodeBuffer> {
                match encode_task_data(task_id, data, category, buffer) {
                    Ok(encoded) => {
                        #[cfg(feature = "print_cache_item_size")]
                        {
                            let mut stats = task_cache_stats.lock();
                            let entry = stats.entry(TaskCacheStats::task_name(inner)).or_default();
                            match category {
                                SpecificTaskDataCategory::Meta => entry.add_meta(&encoded),
                                SpecificTaskDataCategory::Data => entry.add_data(&encoded),
                            }
                        }
                        Some(encoded)
                    }
                    Err(err) => {
                        panic!(
                            "Serializing task {} failed ({:?}): {:?}",
                            self.debug_get_task_description(task_id),
                            category,
                            err
                        );
                    }
                }
            };
            if task_id.is_transient() {
                unreachable!("transient task_ids should never be enqueued to be persisted");
            }

            let encode_meta = inner.flags.meta_modified();
            let encode_data = inner.flags.data_modified();

            #[cfg(feature = "print_cache_item_size")]
            if encode_data || encode_meta {
                task_cache_stats
                    .lock()
                    .entry(TaskCacheStats::task_name(inner))
                    .or_default()
                    .add_counts(inner);
            }

            let meta = if encode_meta {
                encode_category(task_id, inner, SpecificTaskDataCategory::Meta, buffer)
            } else {
                None
            };

            let data = if encode_data {
                encode_category(task_id, inner, SpecificTaskDataCategory::Data, buffer)
            } else {
                None
            };
            let task_type_hash = if inner.flags.new_task() {
                let task_type = inner.get_persistent_task_type().expect(
                    "It is not possible for a new_task to not have a persistent_task_type.  Task \
                     creation for persistent tasks uses a single ExecutionContextImpl for \
                     creating the task (which sets new_task) and connect_child (which sets \
                     persistent_task_type) and take_snapshot waits for all operations to complete \
                     or suspend before we start snapshotting.  So task creation will always set \
                     the task_type.",
                );
                Some(compute_task_type_hash(task_type))
            } else {
                None
            };

            SnapshotItem {
                task_id,
                meta,
                data,
                task_type_hash,
            }
        };

        let task_snapshots =
            self.storage
                .take_snapshot(snapshot_guard, &process, reason.drain_entries());

        drop(snapshot_span);
        let snapshot_duration = start.elapsed();
        let task_count = task_snapshots.len();

        if task_snapshots.is_empty() {
            // This should be impossible — if we got here, modified_count was nonzero, and every
            // modification that increments the count also failed during encoding.
            std::hint::cold_path();
            return Ok((snapshot_time, false));
        }

        let persist_start = Instant::now();
        let span = tracing::info_span!(
            parent: parent_span,
            "persist",
            reason = reason.as_str(),
            data_items= tracing::field::Empty,
            meta_items= tracing::field::Empty,
            task_cache_items= tracing::field::Empty,
            next_task_id= tracing::field::Empty,)
        .entered();
        {
            // Tasks were already consumed by take_snapshot, so a future snapshot
            // would not re-persist them — returning an error signals to the caller
            // that further persist attempts would corrupt the task graph in storage.
            let SnapshotMeta {
                task_cache_items,
                data_items,
                meta_items,
                max_next_task_id,
            } = self
                .backing_storage
                .save_snapshot(suspended_operations, task_snapshots)?;
            span.record("data_items", data_items);
            span.record("meta_items", meta_items);
            span.record("task_cache_items", task_cache_items);
            span.record("next_task_id", max_next_task_id);

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
                        (stats_b.sort_key(), key_b).cmp(&(stats_a.sort_key(), key_a))
                    });

                    println!(
                        "Task cache stats: {}",
                        FormatSizes {
                            size: task_cache_stats
                                .iter()
                                .map(|(_, s)| s.data + s.meta)
                                .sum::<usize>(),
                            #[cfg(feature = "print_cache_item_size_with_compressed")]
                            compressed_size: task_cache_stats
                                .iter()
                                .map(|(_, s)| s.data_compressed + s.meta_compressed)
                                .sum::<usize>()
                        },
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
                                format!(" {}", stats.format_total()),
                                format!(" {}", stats.format_data()),
                                format!(" {} x", stats.data_count),
                                format!("{}", stats.format_avg_data()),
                                format!(" {}", stats.format_meta()),
                                format!(" {} x", stats.meta_count),
                                format!("{}", stats.format_avg_meta()),
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
        let persist_duration = persist_start.elapsed();
        // avoid spamming the event queue with information about fast operations
        if elapsed > Duration::from_secs(10) {
            turbo_tasks.send_compilation_event(Arc::new(TimingEvent::new(
                "Finished writing to filesystem cache".to_string(),
                elapsed,
            )));
        }

        let wall_start_ms = wall_start
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            // as_millis_f64 is not stable yet
            .as_secs_f64()
            * 1000.0;
        let wall_end_ms = wall_start_ms + elapsed.as_secs_f64() * 1000.0;
        turbo_tasks.send_compilation_event(Arc::new(TraceEvent::new(
            "turbopack-persistence",
            wall_start_ms,
            wall_end_ms,
            vec![
                ("reason", serde_json::Value::from(reason.as_str())),
                (
                    "snapshot_duration_ms",
                    serde_json::Value::from(snapshot_duration.as_secs_f64() * 1000.0),
                ),
                (
                    "persist_duration_ms",
                    serde_json::Value::from(persist_duration.as_secs_f64() * 1000.0),
                ),
                ("task_count", serde_json::Value::from(task_count)),
            ],
        )));

        Ok((snapshot_time, true))
    }

    fn startup(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
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
            turbo_tasks.schedule_backend_background_job(TurboTasksBackendJob::Snapshot);
        }
    }

    fn stopping(&self) {
        self.stopping.store(true, Ordering::Release);
        self.stopping_event.notify(usize::MAX);
    }

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        #[cfg(feature = "verify_aggregation_graph")]
        {
            self.is_idle.store(false, Ordering::Release);
            self.verify_aggregation_graph(turbo_tasks, false);
        }
        // eagerly drop the task cache before persisting
        self.storage.drop_task_cache();
        if self.should_persist() {
            // The task_cache is a pure perf cache backed by the DB and isn't read during the
            // stop snapshot (no task creation runs concurrently with stop). Drop it before
            // persisting to lower peak memory during the serialization/write.
            if let Err(err) =
                self.snapshot_and_persist(Span::current().into(), SnapshotReason::Stop, turbo_tasks)
            {
                eprintln!("Persisting failed during shutdown: {err:?}");
            }
        }
        self.storage.drop_contents();
        if let Err(err) = self.backing_storage.shutdown() {
            println!("Shutting down failed: {err}");
        }
    }

    #[allow(unused_variables)]
    fn idle_start(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        self.idle_start_event.notify(usize::MAX);

        #[cfg(feature = "verify_aggregation_graph")]
        {
            use tokio::select;

            self.is_idle.store(true, Ordering::Release);
            // The spawned task reaches the backend through the pinned `turbo_tasks` handle
            // rather than cloning `self`: pinning keeps the `TurboTasks` (and therefore the
            // backend it owns) alive for the task's lifetime.
            let turbo_tasks = turbo_tasks.pin();
            tokio::task::spawn(async move {
                let backend = &turbo_tasks.backend();
                select! {
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {
                        // do nothing
                    }
                    _ = backend.idle_end_event.listen() => {
                        return;
                    }
                }
                if !backend.is_idle.load(Ordering::Relaxed) {
                    return;
                }
                backend.verify_aggregation_graph(&turbo_tasks, true);
            });
        }
    }

    fn idle_end(&self) {
        #[cfg(feature = "verify_aggregation_graph")]
        self.is_idle.store(false, Ordering::Release);
        self.idle_end_event.notify(usize::MAX);
    }

    fn get_or_create_task(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        parent_task: Option<TaskId>,
        persistence: TaskPersistence,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> TaskId {
        let transient = matches!(persistence, TaskPersistence::Transient);

        if transient
            && let Some(parent_task) = parent_task
            && !parent_task.is_transient()
        {
            let task_type = CachedTaskType {
                native_fn,
                this,
                arg: arg.take_box(),
            };
            self.panic_persistent_calling_transient(
                self.debug_get_task_description(parent_task),
                Some(&task_type),
                /* cell_id */ None,
            );
        }

        let is_root = native_fn.is_root;

        // Compute hash and shard index once from borrowed components (no heap allocation).
        let arg_ref = arg.as_ref();
        let hash = CachedTaskType::hash_from_components(
            self.storage.task_cache.hasher(),
            native_fn,
            this,
            arg_ref,
        );
        // Locate the shard once so that the read-only lookup and any
        // write-lock retry below share the same reference (saves a modulo +
        // memory lookup on the miss path).
        let shard = get_shard(&self.storage.task_cache, hash);

        let mut ctx = self.execute_context(turbo_tasks);
        // Step 1: Fast read-only cache lookup (read lock, no allocation).
        // Use a read lock rather than a write lock to avoid contention. connect_child
        // may re-enter task_cache with a write lock, so we must not hold a write lock here.
        if let Some(task_id) =
            raw_get_in_shard(shard, hash, |k| k.eq_components(native_fn, this, arg_ref))
        {
            self.track_cache_hit_by_fn(native_fn);
            operation::ConnectChildOperation::run(parent_task, task_id, ctx);
            return task_id;
        }

        // Step 2: Check backing storage using borrowed components (no box needed yet).

        // Task exists in backing storage.
        // We only need to insert it into the in-memory cache.
        let task_id = if !transient
            && let Some((task_id, stored_type)) = ctx.task_by_type(native_fn, this, arg_ref)
        {
            self.track_cache_hit_by_fn(native_fn);
            // Step 3a: Insert into in-memory cache using the pre-located shard.
            // Use the existing Arc from storage to avoid a duplicate allocation.
            match raw_entry_in_shard(shard, self.storage.task_cache.hasher(), hash, |k| {
                k.eq_components(native_fn, this, arg_ref)
            }) {
                RawEntry::Occupied(_) => {}
                RawEntry::Vacant(e) => {
                    e.insert(stored_type, task_id);
                }
            };
            task_id
        } else {
            match raw_entry_in_shard(shard, self.storage.task_cache.hasher(), hash, |k| {
                k.eq_components(native_fn, this, arg_ref)
            }) {
                RawEntry::Occupied(e) => {
                    // Another thread beat us to creating this task — use their task_id.
                    // They will handle logging the new task as modified.
                    let task_id = *e.get();
                    drop(e);
                    self.track_cache_hit_by_fn(native_fn);
                    task_id
                }
                RawEntry::Vacant(e) => {
                    // Only now do we force the allocation.
                    // NOTE: if our caller had to perform resolution, then this will have already
                    // been boxed and take_box just takes it.
                    let task_type = CachedTaskTypeArc::new(CachedTaskType {
                        native_fn,
                        this,
                        arg: arg.take_box(),
                    });
                    let task_id = if transient {
                        self.transient_task_id_factory.get()
                    } else {
                        self.persisted_task_id_factory.get()
                    };
                    // Initialize storage BEFORE making task_id visible in the cache.
                    // This ensures any thread that reads task_id from the cache sees
                    // the storage entry already initialized (restored flags set).
                    self.storage
                        .initialize_new_task(task_id, Some(task_type.clone()));
                    // insert() consumes e, releasing the shard write lock.
                    e.insert(task_type, task_id);
                    self.track_cache_miss_by_fn(native_fn);
                    // Update the aggregation number before connecting the child
                    // We don't need this on any of the task recovery paths above because the
                    // aggregation number will already be set.
                    if is_root {
                        AggregationUpdateQueue::run(
                            AggregationUpdateJob::UpdateAggregationNumber {
                                task_id,
                                base_aggregation_number: u32::MAX,
                                distance: None,
                            },
                            &mut ctx,
                        );
                    } else if native_fn.is_session_dependent && self.should_track_dependencies() {
                        const SESSION_DEPENDENT_AGGREGATION_NUMBER: u32 = u32::MAX >> 2;
                        AggregationUpdateQueue::run(
                            AggregationUpdateJob::UpdateAggregationNumber {
                                task_id,
                                base_aggregation_number: SESSION_DEPENDENT_AGGREGATION_NUMBER,
                                distance: None,
                            },
                            &mut ctx,
                        );
                    };

                    task_id
                }
            }
        };

        operation::ConnectChildOperation::run(parent_task, task_id, ctx);

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
            backend: &TurboTasksBackend,
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
            backend: &TurboTasksBackend,
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

    fn invalidate_task(&self, task_id: TaskId, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            smallvec![task_id],
            #[cfg(feature = "task_dirty_cause")]
            TaskDirtyCause::Invalidator,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            #[cfg(feature = "task_dirty_cause")]
            TaskDirtyCause::Unknown,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        if !self.should_track_dependencies() {
            panic!("Dependency tracking is disabled so invalidation is not allowed");
        }
        operation::InvalidateOperation::run(
            tasks.iter().copied().collect(),
            #[cfg(feature = "task_dirty_cause")]
            TaskDirtyCause::Unknown,
            self.execute_context(turbo_tasks),
        );
    }

    fn invalidate_serialization(
        &self,
        task_id: TaskId,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
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

    fn get_task_name(
        &self,
        task_id: TaskId,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> String {
        let mut ctx = self.execute_context(turbo_tasks);
        let task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(value) = task.get_persistent_task_type() {
            value.to_string()
        } else if let Some(value) = task.get_transient_task_type() {
            value.to_string()
        } else {
            "unknown".to_string()
        }
    }

    fn debug_get_cached_task_type(&self, task_id: TaskId) -> Option<CachedTaskTypeArc> {
        let task = self.storage.access_mut(task_id);
        task.get_persistent_task_type().cloned()
    }

    fn task_execution_canceled(
        &self,
        task_id: TaskId,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);
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
        // Notify any readers waiting on in-progress cells so their listeners
        // resolve and foreground jobs can finish (prevents stop_and_wait hang).
        let in_progress_cells = task.take_in_progress_cells();
        if let Some(ref cells) = in_progress_cells {
            for state in cells.values() {
                state.event.notify(usize::MAX);
            }
        }

        // Mark the cancelled task as session-dependent dirty so it will be re-executed
        // in the next session. Without this, any reader that encounters the cancelled task
        // records an error in its output. That error is persisted and would poison
        // subsequent builds. By marking the task session-dependent dirty, the next build
        // re-executes it, which invalidates dependents and corrects the stale errors.
        let data_update = if self.should_track_dependencies() && !task_id.is_transient() {
            task.update_dirty_state(Some(Dirtyness::SessionDependent))
        } else {
            None
        };

        let old = task.set_in_progress(InProgressState::Canceled);
        debug_assert!(old.is_none(), "InProgress already exists");
        drop(task);

        if let Some(data_update) = data_update {
            AggregationUpdateQueue::run(data_update, &mut ctx);
        }

        drop(in_progress_cells);
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        priority: TaskPriority,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> Option<TaskExecutionSpec<'_>> {
        let execution_reason;
        let task_type;
        #[cfg(feature = "task_dirty_cause")]
        let cause;
        {
            let mut ctx = self.execute_context(turbo_tasks);
            let mut task = ctx.task(task_id, TaskDataCategory::All);
            task_type = task.get_task_type().to_owned();
            let once_task = matches!(task_type, TaskType::Transient(ref tt) if matches!(&**tt, TransientTask::Once(_)));
            if let Some(tasks) = task.prefetch() {
                drop(task);
                ctx.prepare_tasks(tasks, "prefetch");
                task = ctx.task(task_id, TaskDataCategory::All);
            }
            let in_progress = task.take_in_progress()?;
            let InProgressState::Scheduled { done_event, reason } = in_progress else {
                let old = task.set_in_progress(in_progress);
                debug_assert!(old.is_none(), "InProgress already exists");
                return None;
            };
            execution_reason = reason;
            #[cfg(feature = "task_dirty_cause")]
            {
                cause = match task.get_dirty() {
                    Some(Dirtyness::Dirty { cause, .. }) => Some(cause.clone()),
                    _ => None,
                };
            }
            let old = task.set_in_progress(InProgressState::InProgress(Box::new(
                InProgressStateInner {
                    stale: false,
                    once_task,
                    done_event,
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
                    native_fn.span(
                        task_id.persistence(),
                        execution_reason,
                        priority,
                        #[cfg(feature = "task_dirty_cause")]
                        cause.as_ref(),
                    ),
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

    /// Returns `Some(priority)` if the task became stale during execution and needs to be
    /// re-scheduled at the given priority. The caller (turbo-tasks manager) hands it to the
    /// priority runner so re-execution doesn't inherit the original schedule priority.
    fn task_execution_completed(
        &self,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        #[cfg(feature = "verify_determinism")] stateful: bool,
        has_invalidator: bool,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> Option<TaskPriority> {
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
            aggregation_number = tracing::field::Empty,
            stale = tracing::field::Empty,
        )
        .entered();

        let is_error = result.is_err();

        let mut ctx = self.execute_context(turbo_tasks);

        let TaskExecutionCompletePrepareResult {
            new_children,
            is_now_immutable,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            new_output,
            #[cfg(feature = "task_dirty_cause")]
            function_id,
            output_dependent_tasks,
            is_recomputation,
            is_session_dependent,
        } = match self.task_execution_completed_prepare(
            &mut ctx,
            #[cfg(feature = "trace_task_details")]
            &span,
            task_id,
            result,
            cell_counters,
            #[cfg(feature = "verify_determinism")]
            stateful,
            has_invalidator,
        ) {
            Ok(r) => r,
            Err(stale_priority) => {
                // Task was stale and has been rescheduled
                #[cfg(feature = "trace_task_details")]
                span.record("stale", "prepare");
                return Some(stale_priority);
            }
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
                #[cfg(feature = "task_dirty_cause")]
                function_id,
                output_dependent_tasks,
            );
        }

        let has_new_children = !new_children.is_empty();
        span.record("new_children", new_children.len());

        if has_new_children {
            self.task_execution_completed_unfinished_children_dirty(&mut ctx, &new_children)
        }

        if has_new_children
            && let Some(stale_priority) =
                self.task_execution_completed_connect(&mut ctx, task_id, new_children)
        {
            // Task was stale and has been rescheduled
            #[cfg(feature = "trace_task_details")]
            span.record("stale", "connect");
            return Some(stale_priority);
        }

        let (stale_priority, in_progress_cells) = self.task_execution_completed_finish(
            &mut ctx,
            task_id,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            new_output,
            is_now_immutable,
            is_session_dependent,
        );
        if let Some(stale_priority) = stale_priority {
            // Task was stale and has been rescheduled
            #[cfg(feature = "trace_task_details")]
            span.record("stale", "finish");
            return Some(stale_priority);
        }

        let removed_data = self.task_execution_completed_cleanup(
            &mut ctx,
            task_id,
            cell_counters,
            is_error,
            is_recomputation,
        );

        // Drop data outside of critical sections
        drop(removed_data);
        drop(in_progress_cells);

        None
    }

    fn task_execution_completed_prepare(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        #[cfg(feature = "trace_task_details")] span: &Span,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        #[cfg(feature = "verify_determinism")] stateful: bool,
        has_invalidator: bool,
    ) -> Result<TaskExecutionCompletePrepareResult, TaskPriority> {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let is_recomputation = task.is_dirty().is_none();
        // Without dependency tracking, the SessionDependent dirty state is never read (no session
        // restore), so skip the work
        let is_session_dependent = self.should_track_dependencies()
            && matches!(task.get_task_type(), TaskTypeRef::Cached(tt) if tt.native_fn.is_session_dependent);
        let Some(in_progress) = task.get_in_progress_mut() else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        if matches!(in_progress, InProgressState::Canceled) {
            return Ok(TaskExecutionCompletePrepareResult {
                new_children: Default::default(),
                is_now_immutable: false,
                #[cfg(feature = "verify_determinism")]
                no_output_set: false,
                #[cfg(feature = "task_dirty_cause")]
                function_id: None,
                new_output: None,
                output_dependent_tasks: Default::default(),
                is_recomputation,
                is_session_dependent,
            });
        }
        let &mut InProgressState::InProgress(box InProgressStateInner {
            stale,
            ref mut new_children,
            once_task: is_once_task,
            ..
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        #[cfg(not(feature = "no_fast_stale"))]
        if stale && !is_once_task {
            let stale_priority = compute_stale_priority(&task);
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
            return Err(stale_priority);
        }

        // take the children from the task to process them
        let mut new_children = take(new_children);

        // get the function id for the dirty cause
        #[cfg(feature = "task_dirty_cause")]
        let function_id = match task.get_task_type() {
            TaskTypeRef::Cached(task_type) => {
                Some(turbo_tasks::registry::get_function_id(task_type.native_fn))
            }
            TaskTypeRef::Transient(_) => None,
        };

        // handle stateful (only tracked when verify_determinism is enabled)
        #[cfg(feature = "verify_determinism")]
        if stateful {
            task.set_stateful(true);
        }

        // handle has_invalidator
        if has_invalidator {
            task.set_invalidator(true);
        }

        // handle cell counters: update max index and remove cells that are no longer used
        // On error, skip this update: the task may have failed before creating all cells it
        // normally creates, so cell_counters is incomplete. Clearing cell_type_max_index entries
        // based on partial counters would cause "cell no longer exists" errors for tasks that
        // still hold dependencies on those cells. The old cell data is preserved on error
        // (see task_execution_completed_cleanup), so keeping cell_type_max_index consistent with
        // that data is correct.
        // NOTE: This must stay in sync with task_execution_completed_cleanup, which similarly
        // skips cell data removal on error.
        if result.is_ok() || is_recomputation {
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
        }

        let mut queue = AggregationUpdateQueue::new();

        let mut old_edges = Vec::new();

        let has_children = !new_children.is_empty();
        let is_immutable = task.immutable();
        let task_dependencies_for_immutable =
            // Task was previously marked as immutable
            if !is_immutable
            // Task is not session dependent (session dependent tasks can change between sessions)
            && !is_session_dependent
            // Task has no invalidator
            && !task.invalidator()
            // Task has no dependencies on collectibles
            && task.is_collectibles_dependencies_empty()
        {
            Some(
                // Collect all dependencies on tasks to check if all dependencies are immutable
                task.iter_output_dependencies()
                    .chain(task.iter_cell_dependencies().map(|dep| dep.cell_ref().task))
                    .collect::<FxHashSet<_>>(),
            )
        } else {
            None
        };

        if has_children {
            // Prepare all new children
            let _aggregation_number =
                prepare_new_children(task_id, &mut task, &new_children, &mut queue);

            #[cfg(feature = "trace_task_details")]
            span.record("aggregation_number", _aggregation_number);

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
                    .map(OutdatedEdge::CellDependency),
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
                    && **old_error == err
                {
                    None
                } else {
                    Some(OutputValue::Error(Arc::new((&err).into())))
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
            #[cfg(any(
                feature = "trace_task_completion",
                feature = "trace_aggregation_update_stats"
            ))]
            let _span =
                tracing::trace_span!("remove old edges and prepare new children", stats = Empty)
                    .entered();
            // Remove outdated edges first, before removing in_progress+dirty flag.
            // We need to make sure all outdated edges are removed before the task can potentially
            // be scheduled and executed again
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                let stats = CleanupOldEdgesOperation::run(task_id, old_edges, queue, ctx);
                _span.record("stats", tracing::field::debug(stats));
            }
            #[cfg(not(feature = "trace_aggregation_update_stats"))]
            CleanupOldEdgesOperation::run(task_id, old_edges, queue, ctx);
        }

        Ok(TaskExecutionCompletePrepareResult {
            new_children,
            is_now_immutable,
            #[cfg(feature = "verify_determinism")]
            no_output_set,
            #[cfg(feature = "task_dirty_cause")]
            function_id,
            new_output,
            output_dependent_tasks,
            is_recomputation,
            is_session_dependent,
        })
    }

    fn task_execution_completed_invalidate_output_dependent(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        #[cfg(feature = "task_dirty_cause")] function_id: Option<FunctionId>,
        output_dependent_tasks: SmallVec<[TaskId; 4]>,
    ) {
        debug_assert!(!output_dependent_tasks.is_empty());

        #[cfg(feature = "task_dirty_cause")]
        let cause = match function_id {
            Some(function) => TaskDirtyCause::OutputChange { function },
            None => TaskDirtyCause::RootOutputChange,
        };

        if output_dependent_tasks.len() > 1 {
            ctx.prepare_tasks(
                output_dependent_tasks
                    .iter()
                    .map(|&id| (id, TaskDataCategory::All)),
                "invalidate output dependents",
            );
        }

        fn process_output_dependents(
            ctx: &mut impl ExecuteContext<'_>,
            task_id: TaskId,
            #[cfg(feature = "task_dirty_cause")] cause: &TaskDirtyCause,
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
                #[cfg(feature = "task_dirty_cause")]
                cause.clone(),
                queue,
                ctx,
            );
            #[cfg(feature = "trace_task_output_dependencies")]
            span.record("result", "marked dirty");
        }

        if output_dependent_tasks.len() > DEPENDENT_TASKS_DIRTY_PARALLELIZATION_THRESHOLD {
            let chunk_size = good_chunk_size(output_dependent_tasks.len());
            let chunks = into_chunks(output_dependent_tasks.to_vec(), chunk_size);
            let _ = scope_and_block(chunks.len(), |scope| {
                for chunk in chunks {
                    let child_ctx = ctx.child_context();
                    #[cfg(feature = "task_dirty_cause")]
                    let cause = &cause;
                    scope.spawn(move || {
                        let mut ctx = child_ctx.create();
                        let mut queue = AggregationUpdateQueue::new();
                        for dependent_task_id in chunk {
                            process_output_dependents(
                                &mut ctx,
                                task_id,
                                #[cfg(feature = "task_dirty_cause")]
                                cause,
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
                process_output_dependents(
                    ctx,
                    task_id,
                    #[cfg(feature = "task_dirty_cause")]
                    &cause,
                    dependent_task_id,
                    &mut queue,
                );
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
        ctx.for_each_task_all(
            new_children.iter().copied(),
            "unfinished children dirty",
            |child_task, ctx| {
                if !child_task.has_output() {
                    let child_id = child_task.id();
                    make_task_dirty_internal(
                        child_task,
                        child_id,
                        false,
                        #[cfg(feature = "task_dirty_cause")]
                        TaskDirtyCause::InitialDirty,
                        &mut queue,
                        ctx,
                    );
                }
            },
        );

        queue.execute(ctx);
    }

    fn task_execution_completed_connect(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        new_children: FxHashSet<TaskId>,
    ) -> Option<TaskPriority> {
        debug_assert!(!new_children.is_empty());

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = task.get_in_progress() else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        if matches!(in_progress, InProgressState::Canceled) {
            // Task was canceled in the meantime, so we don't connect the children
            return None;
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
            let stale_priority = compute_stale_priority(&task);
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
            return Some(stale_priority);
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

        None
    }

    #[allow(clippy::type_complexity)]
    fn task_execution_completed_finish(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        #[cfg(feature = "verify_determinism")] no_output_set: bool,
        new_output: Option<OutputValue>,
        is_now_immutable: bool,
        is_session_dependent: bool,
    ) -> (
        Option<TaskPriority>,
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
            return (None, None);
        }
        let InProgressState::InProgress(box InProgressStateInner {
            done_event,
            once_task: is_once_task,
            stale,
            marked_as_completed: _,
            new_children,
        }) = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        debug_assert!(new_children.is_empty());

        // If the task is stale, reschedule it
        if stale && !is_once_task {
            let stale_priority = compute_stale_priority(&task);
            let old = task.set_in_progress(InProgressState::Scheduled {
                done_event,
                reason: TaskExecutionReason::Stale,
            });
            debug_assert!(old.is_none(), "InProgress already exists");
            return (Some(stale_priority), None);
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

        // Compute and apply the new dirty state, propagating to aggregating ancestors
        let new_dirtyness = if is_session_dependent {
            Some(Dirtyness::SessionDependent)
        } else {
            None
        };
        #[cfg(feature = "verify_determinism")]
        let dirty_changed = task.get_dirty().cloned() != new_dirtyness;
        let data_update = task.update_dirty_state(new_dirtyness);

        // Under verify_determinism we re-run a task whose dirty state or output unexpectedly
        // changed during execution to confirm determinism. The leaf priority keeps these
        // verification reruns at the highest priority.
        #[cfg(feature = "verify_determinism")]
        let stale_priority: Option<TaskPriority> =
            ((dirty_changed || no_output_set) && !task_id.is_transient() && !is_once_task)
                .then(TaskPriority::leaf);
        #[cfg(not(feature = "verify_determinism"))]
        let stale_priority: Option<TaskPriority> = None;
        if stale_priority.is_some() {
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
        (stale_priority, in_progress_cells)
    }

    fn task_execution_completed_cleanup(
        &self,
        ctx: &mut impl ExecuteContext<'_>,
        task_id: TaskId,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        is_error: bool,
        is_recomputation: bool,
    ) -> Vec<SharedReference> {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let mut removed_cell_data = Vec::new();
        // An error is potentially caused by a eventual consistency, so we avoid updating cells
        // after an error as it is likely transient and we want to keep the dependent tasks
        // clean to avoid re-executions.
        // NOTE: This must stay in sync with task_execution_completed_prepare, which similarly
        // skips cell_type_max_index updates on error.
        if !is_error || is_recomputation {
            // Remove no longer existing cells and
            // find all outdated data items (removed cells, outdated edges)
            // Note: We do not mark the tasks as dirty here, as these tasks are unused or stale
            // anyway and we want to avoid needless re-executions. When the cells become
            // used again, they are invalidated from the update cell operation.
            let to_remove: Vec<_> = task
                .iter_cell_data()
                .filter_map(|(cell, _)| {
                    cell_counters
                        .get(&cell.type_id)
                        .is_none_or(|start_index| cell.index >= *start_index)
                        .then_some(*cell)
                })
                .collect();
            removed_cell_data.reserve_exact(to_remove.len());
            for cell in to_remove {
                if let Some(data) = task.remove_cell_data(&cell) {
                    removed_cell_data.push(data);
                }
            }
            // Remove cell_data_hash entries for cells that no longer exist
            let to_remove_hash: Vec<_> = task
                .iter_cell_data_hash()
                .filter_map(|(cell, _)| {
                    cell_counters
                        .get(&cell.type_id)
                        .is_none_or(|start_index| cell.index >= *start_index)
                        .then_some(*cell)
                })
                .collect();
            for cell in to_remove_hash {
                task.remove_cell_data_hash(&cell);
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

    /// Prints the standard message emitted when the background persisting process stops due to an
    /// unrecoverable write error. The caller is responsible for returning from the background job.
    fn log_unrecoverable_persist_error() {
        eprintln!(
            "Persisting is disabled for this session due to an unrecoverable error. Stopping the \
             background persisting process."
        );
    }

    fn run_backend_job<'a>(
        &'a self,
        job: TurboTasksBackendJob,
        turbo_tasks: &'a TurboTasks<TurboTasksBackend>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin(async move {
            match job {
                TurboTasksBackendJob::Snapshot => {
                    debug_assert!(self.should_persist());

                    let mut last_snapshot = self.start_time;
                    let mut idle_start_listener = self.idle_start_event.listen();
                    let mut idle_end_listener = self.idle_end_event.listen();
                    // Whether to immediately set an idle timeout if possible.
                    // Set to false if we don't persist anything in a cycle.
                    let mut fresh_idle = true;
                    let mut evicted = false;
                    let mut is_first = true;
                    'outer: loop {
                        const FIRST_SNAPSHOT_WAIT: Duration = Duration::from_secs(300);
                        const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(120);
                        let idle_timeout = *IDLE_TIMEOUT;
                        let (time, mut reason) = if is_first {
                            (FIRST_SNAPSHOT_WAIT, SnapshotReason::InitialSnapshotTimeout)
                        } else {
                            (SNAPSHOT_INTERVAL, SnapshotReason::RegularSnapshotInterval)
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
                                        idle_time = Instant::now() + idle_timeout;
                                        idle_start_listener = self.idle_start_event.listen()
                                    },
                                    _ = &mut idle_end_listener => {
                                        idle_time = far_future();
                                        idle_end_listener = self.idle_end_event.listen()
                                    },
                                    _ = tokio::time::sleep_until(until) => {
                                        break;
                                    },
                                    _ = tokio::time::sleep_until(idle_time) => {
                                        if turbo_tasks.is_idle() {
                                            reason = SnapshotReason::IdleTimeout;
                                            break;
                                        }
                                    },
                                }
                            }
                        }

                        // Create a root span shared by both the snapshot/persist
                        // work and the subsequent compaction so they appear
                        // grouped together in trace viewers.
                        let background_span =
                            tracing::info_span!(parent: None, "background snapshot");
                        match self.snapshot_and_persist(background_span.id(), reason, turbo_tasks) {
                            Err(err) => {
                                // save_snapshot consumed persisted_task_cache_log entries;
                                // further snapshots would corrupt the task graph.
                                eprintln!("Persisting failed: {err:?}");
                                Self::log_unrecoverable_persist_error();
                                return;
                            }
                            Ok((snapshot_start, new_data)) => {
                                // if we see 'new_data' then the next idle transition is 'fresh'
                                fresh_idle = new_data;
                                is_first = false;
                                last_snapshot = snapshot_start;

                                // Polls the idle-end event without blocking. Returns
                                // `true` and refreshes the listener if idle has ended,
                                // `false` if we are still idle.
                                macro_rules! check_idle_ended {
                                    () => {{
                                        tokio::select! {
                                            biased;
                                            _ = &mut idle_end_listener => {
                                                idle_end_listener = self.idle_end_event.listen();
                                                true
                                            },
                                            _ = std::future::ready(()) => false,
                                        }
                                    }};
                                }
                                // Evict persisted tasks from memory to reclaim space.
                                // Like compaction, this runs after snapshot_and_persist
                                // as a separate concern.
                                //
                                // TODO: improve eviction policy — current approach is a full sweep
                                // after every snapshot. Better strategies to consider:
                                //   - Memory pressure signals: only evict when RSS exceeds a
                                //     threshold rather than unconditionally.
                                //   - Recency data: track last-access time per task and evict
                                //     least-recently-used entries first rather than all at once.
                                //   - Eviction intensity: partial sweeps (evict a fraction of
                                //     eligible tasks per cycle) to reduce latency spikes.
                                // Evict when there is new data to persist (the common
                                // case) or on the very first snapshot after startup
                                // (data was already on disk from a prior run, so
                                // new_data may be false but in-memory state can still
                                // be evicted).
                                let mut ran_eviction = false;
                                if self.should_evict() && (new_data || !evicted) {
                                    if check_idle_ended!() {
                                        // need to start all the way over so we catch the next
                                        // signal
                                        continue 'outer;
                                    }
                                    evicted = true;
                                    ran_eviction = true;
                                    self.storage.evict_after_snapshot(background_span.id());
                                }

                                // Compact while idle (up to limit), regardless of
                                // whether the snapshot had new data.
                                // `background_span` is not entered here because
                                // `EnteredSpan` is `!Send` and would prevent the
                                // future from being sent across threads when it
                                // suspends at the `select!` await below.
                                let mut ran_compaction = false;
                                const MAX_IDLE_COMPACTION_PASSES: usize = 10;
                                for _ in 0..MAX_IDLE_COMPACTION_PASSES {
                                    if check_idle_ended!() {
                                        continue 'outer;
                                    }
                                    // Enter the span only around the synchronous
                                    // compact() call so we never hold an
                                    // `EnteredSpan` across an await point.
                                    let _compact_span = tracing::info_span!(
                                        parent: background_span.id(),
                                        "compact database"
                                    )
                                    .entered();
                                    match self.backing_storage.compact() {
                                        Ok(true) => {
                                            ran_compaction = true;
                                        }
                                        Ok(false) => break,
                                        Err(err) => {
                                            eprintln!("Compaction failed: {err:?}");
                                            if self.backing_storage.has_unrecoverable_write_error()
                                            {
                                                Self::log_unrecoverable_persist_error();
                                                return;
                                            }
                                            break;
                                        }
                                    }
                                }
                                if check_idle_ended!() {
                                    continue 'outer;
                                }
                                // After running snapshotting/eviction/compaction we have churned a
                                // _lot_ of memory if we are still
                                // idle tell `mimalloc` that now would be a good time to release
                                // memory back to the OS
                                if new_data || ran_compaction || ran_eviction {
                                    turbo_tasks_malloc::TurboMalloc::collect(true);
                                }
                            }
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
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> Result<TypedCellContent> {
        let mut ctx = self.execute_context(turbo_tasks);
        let task = ctx.task(task_id, TaskDataCategory::Data);
        if let Some(content) = task.get_cell_data(&cell).cloned() {
            Ok(CellContent(Some(content)).into_typed(cell.type_id))
        } else {
            Ok(CellContent(None).into_typed(cell.type_id))
        }
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader_id: Option<TaskId>,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut collectibles = AutoMap::default();
        {
            let mut task = ctx.task(task_id, TaskDataCategory::All);
            if task
                .get_persistent_task_type()
                .is_some_and(|t| !t.native_fn.is_root)
            {
                drop(task);
                panic!(
                    "Reading collectibles of non-root task {} (reader: {}). The `root` attribute \
                     is missing on the task.",
                    self.debug_get_task_description(task_id),
                    reader_id.map_or_else(
                        || "unknown".to_string(),
                        |r| self.debug_get_task_description(r)
                    )
                );
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
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
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
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
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
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        content_hash: Option<CellHash>,
        verification_mode: VerificationMode,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        operation::UpdateCellOperation::run(
            task_id,
            cell,
            content,
            updated_key_hashes,
            content_hash,
            verification_mode,
            self.execute_context(turbo_tasks),
        );
    }

    fn mark_own_task_as_finished(&self, task: TaskId, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
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

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: Option<TaskId>,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        self.assert_not_persistent_calling_transient(parent_task, task, None);
        ConnectChildOperation::run(parent_task, task, self.execute_context(turbo_tasks));
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

    fn dispose_root_task(&self, task_id: TaskId, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
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
    fn verify_aggregation_graph(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>, idle: bool) {
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
                        task.get_task_description(),
                        uppers
                    );
                }

                for (collectible, _) in task.iter_aggregated_collectibles() {
                    collectibles
                        .entry(*collectible)
                        .or_insert_with(|| (false, Vec::new()))
                        .1
                        .push(task_id);
                }

                for (&collectible, &value) in task.iter_collectibles() {
                    if value > 0 {
                        if let Some((flag, _)) = collectibles.get_mut(&collectible) {
                            *flag = true
                        } else {
                            panic!(
                                "Task {} has a collectible {:?} that is not in any upper task",
                                task_id, collectible
                            );
                        }
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
                        let upper = ctx.task(upper_id, TaskDataCategory::All);
                        let in_upper = upper
                            .get_aggregated_dirty_containers(&task_id)
                            .is_some_and(|&dirty| dirty > 0);
                        if !in_upper {
                            let containers: Vec<_> = upper
                                .iter_aggregated_dirty_containers()
                                .map(|(&k, &v)| (k, v))
                                .collect();
                            let upper_task_desc = upper.get_task_description();
                            drop(upper);
                            panic!(
                                "Task {} ({}) is dirty, but is not listed in the upper task {} \
                                 ({})\nThese dirty containers are present:\n{:#?}",
                                task_id,
                                ctx.task(task_id, TaskDataCategory::Data)
                                    .get_task_description(),
                                upper_id,
                                upper_task_desc,
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
                            .map(|t| format!(
                                "{t} {}",
                                ctx.task(*t, TaskDataCategory::Data).get_task_description()
                            ))
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
                        let task = ctx.task(task_id, TaskDataCategory::All);
                        let desc = task.get_task_description();
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
    ) -> ! {
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

impl Backend for TurboTasksBackend {
    fn startup(&self, turbo_tasks: &TurboTasks<Self>) {
        self.startup(turbo_tasks);
    }

    fn stopping(&self, _turbo_tasks: &TurboTasks<Self>) {
        self.stopping();
    }

    fn stop(&self, turbo_tasks: &TurboTasks<Self>) {
        self.stop(turbo_tasks);
    }

    fn idle_start(&self, turbo_tasks: &TurboTasks<Self>) {
        self.idle_start(turbo_tasks);
    }

    fn idle_end(&self, _turbo_tasks: &TurboTasks<Self>) {
        self.idle_end();
    }

    fn get_or_create_task(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &mut dyn DynTaskInputsStorage,
        parent_task: Option<TaskId>,
        persistence: TaskPersistence,
        turbo_tasks: &TurboTasks<Self>,
    ) -> TaskId {
        self.get_or_create_task(native_fn, this, arg, parent_task, persistence, turbo_tasks)
    }

    fn invalidate_task(&self, task_id: TaskId, turbo_tasks: &TurboTasks<Self>) {
        self.invalidate_task(task_id, turbo_tasks);
    }

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &TurboTasks<Self>) {
        self.invalidate_tasks(tasks, turbo_tasks);
    }

    fn invalidate_tasks_set(
        &self,
        tasks: &AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>,
        turbo_tasks: &TurboTasks<Self>,
    ) {
        self.invalidate_tasks_set(tasks, turbo_tasks);
    }

    fn invalidate_serialization(&self, task_id: TaskId, turbo_tasks: &TurboTasks<Self>) {
        self.invalidate_serialization(task_id, turbo_tasks);
    }

    fn task_execution_canceled(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>) {
        self.task_execution_canceled(task, turbo_tasks)
    }

    fn try_start_task_execution(
        &self,
        task_id: TaskId,
        priority: TaskPriority,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Option<TaskExecutionSpec<'_>> {
        self.try_start_task_execution(task_id, priority, turbo_tasks)
    }

    fn task_execution_completed(
        &self,
        task_id: TaskId,
        result: Result<RawVc, TurboTasksExecutionError>,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        #[cfg(feature = "verify_determinism")] stateful: bool,
        has_invalidator: bool,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Option<TaskPriority> {
        self.task_execution_completed(
            task_id,
            result,
            cell_counters,
            #[cfg(feature = "verify_determinism")]
            stateful,
            has_invalidator,
            turbo_tasks,
        )
    }

    type BackendJob = TurboTasksBackendJob;

    fn run_backend_job<'a>(
        &'a self,
        job: Self::BackendJob,
        turbo_tasks: &'a TurboTasks<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        self.run_backend_job(job, turbo_tasks)
    }

    fn try_read_task_output(
        &self,
        task_id: TaskId,
        reader: Option<TaskId>,
        options: ReadOutputOptions,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<Result<RawVc, EventListener>> {
        self.try_read_task_output(task_id, reader, options, turbo_tasks)
    }

    fn try_read_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        reader: Option<TaskId>,
        options: ReadCellOptions,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
        self.try_read_task_cell(task_id, reader, cell, options, turbo_tasks)
    }

    fn try_read_own_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        turbo_tasks: &TurboTasks<Self>,
    ) -> Result<TypedCellContent> {
        self.try_read_own_task_cell(task_id, cell, turbo_tasks)
    }

    fn read_task_collectibles(
        &self,
        task_id: TaskId,
        collectible_type: TraitTypeId,
        reader: Option<TaskId>,
        turbo_tasks: &TurboTasks<Self>,
    ) -> AutoMap<RawVc, i32, BuildHasherDefault<FxHasher>, 1> {
        self.read_task_collectibles(task_id, collectible_type, reader, turbo_tasks)
    }

    fn emit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        task_id: TaskId,
        turbo_tasks: &TurboTasks<Self>,
    ) {
        self.emit_collectible(collectible_type, collectible, task_id, turbo_tasks)
    }

    fn unemit_collectible(
        &self,
        collectible_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task_id: TaskId,
        turbo_tasks: &TurboTasks<Self>,
    ) {
        self.unemit_collectible(collectible_type, collectible, count, task_id, turbo_tasks)
    }

    fn update_task_cell(
        &self,
        task_id: TaskId,
        cell: CellId,
        content: CellContent,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        content_hash: Option<CellHash>,
        verification_mode: VerificationMode,
        turbo_tasks: &TurboTasks<Self>,
    ) {
        self.update_task_cell(
            task_id,
            cell,
            content,
            updated_key_hashes,
            content_hash,
            verification_mode,
            turbo_tasks,
        );
    }

    fn mark_own_task_as_finished(&self, task_id: TaskId, turbo_tasks: &TurboTasks<Self>) {
        self.mark_own_task_as_finished(task_id, turbo_tasks);
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: Option<TaskId>,
        turbo_tasks: &TurboTasks<Self>,
    ) {
        self.connect_task(task, parent_task, turbo_tasks);
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        _turbo_tasks: &TurboTasks<Self>,
    ) -> TaskId {
        self.create_transient_task(task_type)
    }

    fn dispose_root_task(&self, task_id: TaskId, turbo_tasks: &TurboTasks<Self>) {
        self.dispose_root_task(task_id, turbo_tasks);
    }

    fn task_statistics(&self) -> &TaskStatisticsApi {
        &self.task_statistics
    }

    fn is_tracking_dependencies(&self) -> bool {
        self.options.dependency_tracking
    }

    fn get_task_name(&self, task: TaskId, turbo_tasks: &TurboTasks<Self>) -> String {
        self.get_task_name(task, turbo_tasks)
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
                write!(
                    f,
                    " (read cell of type {})",
                    get_value_type(ty).ty.global_name
                )
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
///
/// TODO: The `Result` return type is an artifact of the bincode `Encode` trait requiring
/// fallible encoding. In practice, encoding to a `SmallVec` is infallible (no I/O), and the only
/// real failure mode — a `TypedSharedReference` whose value type has no bincode impl — is a
/// programmer error caught by the panic in the caller. Consider making the bincode encoding trait
/// infallible (i.e. returning `()` instead of `Result<(), EncodeError>`) to eliminate the
/// spurious `Result` threading throughout the encode path.
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
