pub mod indexed;
mod operation;
mod persisted_storage_log;
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
    thread::available_parallelism,
};

use anyhow::{bail, Result};
use auto_hash_map::{AutoMap, AutoSet};
use dashmap::DashMap;
use parking_lot::{Condvar, Mutex};
use rustc_hash::FxHasher;
use smallvec::smallvec;
use tokio::time::{Duration, Instant};
use turbo_tasks::{
    backend::{
        Backend, BackendJobId, CachedTaskType, CellContent, TaskExecutionSpec, TransientTaskRoot,
        TransientTaskType, TypedCellContent,
    },
    event::{Event, EventListener},
    registry,
    util::IdFactoryWithReuse,
    CellId, FunctionId, RawVc, ReadConsistency, SessionId, TaskId, TraitTypeId,
    TurboTasksBackendApi, ValueTypeId, TRANSIENT_TASK_BIT,
};

pub use self::{operation::AnyOperation, storage::TaskDataCategory};
use crate::{
    backend::{
        operation::{
            get_aggregation_number, is_root_node, AggregatedDataUpdate, AggregationUpdateJob,
            AggregationUpdateQueue, CleanupOldEdgesOperation, ConnectChildOperation,
            ExecuteContext, ExecuteContextImpl, Operation, OutdatedEdge, TaskDirtyCause, TaskGuard,
        },
        persisted_storage_log::PersistedStorageLog,
        storage::{get, get_many, get_mut, iter_many, remove, Storage},
    },
    backing_storage::BackingStorage,
    data::{
        ActiveType, AggregationNumber, CachedDataItem, CachedDataItemIndex, CachedDataItemKey,
        CachedDataItemValue, CachedDataUpdate, CellRef, CollectibleRef, CollectiblesRef,
        DirtyState, InProgressCellState, InProgressState, OutputValue, RootState,
    },
    utils::{bi_map::BiMap, chunked_vec::ChunkedVec, ptr_eq_arc::PtrEqArc, sharded::Sharded},
};

const BACKEND_JOB_INITIAL_SNAPSHOT: BackendJobId = unsafe { BackendJobId::new_unchecked(1) };
const BACKEND_JOB_FOLLOW_UP_SNAPSHOT: BackendJobId = unsafe { BackendJobId::new_unchecked(2) };

const SNAPSHOT_REQUESTED_BIT: usize = 1 << (usize::BITS - 1);

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

    /// Enables the backing storage.
    pub storage_mode: Option<StorageMode>,
}

impl Default for BackendOptions {
    fn default() -> Self {
        Self {
            dependency_tracking: true,
            children_tracking: true,
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
    transient_tasks: DashMap<TaskId, Arc<TransientTask>, BuildHasherDefault<FxHasher>>,

    persisted_storage_data_log: Option<PersistedStorageLog>,
    persisted_storage_meta_log: Option<PersistedStorageLog>,
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
    /// The timestamp of the last started snapshot since [`Self::start_time`].
    last_snapshot: AtomicU64,

    stopping: AtomicBool,
    stopping_event: Event,
    idle_start_event: Event,
    idle_end_event: Event,

    backing_storage: B,
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
    pub fn new(options: BackendOptions, backing_storage: B) -> Self {
        let shard_amount =
            (available_parallelism().map_or(4, |v| v.get()) * 64).next_power_of_two();
        let need_log = matches!(options.storage_mode, Some(StorageMode::ReadWrite));
        Self {
            options,
            start_time: Instant::now(),
            session_id: backing_storage.next_session_id(),
            persisted_task_id_factory: IdFactoryWithReuse::new(
                *backing_storage.next_free_task_id() as u64,
                (TRANSIENT_TASK_BIT - 1) as u64,
            ),
            transient_task_id_factory: IdFactoryWithReuse::new(
                TRANSIENT_TASK_BIT as u64,
                u32::MAX as u64,
            ),
            persisted_task_cache_log: need_log.then(|| Sharded::new(shard_amount)),
            task_cache: BiMap::new(),
            transient_tasks: DashMap::default(),
            persisted_storage_data_log: need_log.then(|| PersistedStorageLog::new(shard_amount)),
            persisted_storage_meta_log: need_log.then(|| PersistedStorageLog::new(shard_amount)),
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
            backing_storage,
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
        let ctx = unsafe { ExecuteContextImpl::new_with_tx(self, tx, turbo_tasks) };
        ctx
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

    fn persisted_storage_log(&self, category: TaskDataCategory) -> Option<&PersistedStorageLog> {
        match category {
            TaskDataCategory::Data => &self.persisted_storage_data_log,
            TaskDataCategory::Meta => &self.persisted_storage_meta_log,
            TaskDataCategory::All => unreachable!(),
        }
        .as_ref()
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

    fn should_track_children(&self) -> bool {
        self.options.children_tracking
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
        let mut ctx = self.execute_context(turbo_tasks);
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

        if self.should_track_children() && matches!(consistency, ReadConsistency::Strong) {
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

            let is_dirty =
                get!(task, Dirty).map_or(false, |dirty_state| dirty_state.get(self.session_id));

            // Check the dirty count of the root node
            let dirty_tasks = get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default()
                .get(self.session_id);
            if dirty_tasks > 0 || is_dirty {
                let root = get!(task, AggregateRoot);
                let mut task_ids_to_schedule: Vec<_> = Vec::new();
                // When there are dirty task, subscribe to the all_clean_event
                let root = if let Some(root) = root {
                    root
                } else {
                    // If we don't have a root state, add one. This also makes sure all tasks stay
                    // active and this task won't stale. CachedActiveUntilClean
                    // is automatically removed when this task is clean.
                    task.add_new(CachedDataItem::AggregateRoot {
                        value: RootState::new(ActiveType::CachedActiveUntilClean, task_id),
                    });
                    // A newly added AggregateRoot need to make sure to schedule the tasks
                    task_ids_to_schedule = get_many!(
                        task,
                        AggregatedDirtyContainer {
                            task
                        } count if count.get(self.session_id) > 0 => {
                            *task
                        }
                    );
                    if is_dirty {
                        task_ids_to_schedule.push(task_id);
                    }
                    get!(task, AggregateRoot).unwrap()
                };
                let listener = root.all_clean_event.listen_with_note(move || {
                    format!(
                        "try_read_task_output (strongly consistent) from {:?}",
                        reader
                    )
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

        if let Some(output) = get!(task, Output) {
            let result = match output {
                OutputValue::Cell(cell) => Some(Ok(Ok(RawVc::TaskCell(cell.task, cell.cell)))),
                OutputValue::Output(task) => Some(Ok(Ok(RawVc::TaskOutput(*task)))),
                OutputValue::Error | OutputValue::Panic => {
                    get!(task, Error).map(|error| Err(error.clone().into()))
                }
            };
            if let Some(result) = result {
                if self.should_track_dependencies() {
                    if let Some(reader) = reader {
                        let _ = task.add(CachedDataItem::OutputDependent {
                            task: reader,
                            value: (),
                        });
                        drop(task);

                        let mut reader_task = ctx.task(reader, TaskDataCategory::Data);
                        if reader_task
                            .remove(&CachedDataItemKey::OutdatedOutputDependency {
                                target: task_id,
                            })
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
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Result<Result<TypedCellContent, EventListener>> {
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
        if let Some(content) = get!(task, CellData { cell }) {
            let content = content.clone();
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
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
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
            bail!(
                "Cell {cell:?} no longer exists in task {} (no cell of this type exists)",
                ctx.get_task_description(task_id)
            );
        };
        if cell.index >= *max_id {
            add_cell_dependency(self, task, reader, cell, task_id, &mut ctx);
            bail!(
                "Cell {cell:?} no longer exists in task {} (index out of bounds)",
                ctx.get_task_description(task_id)
            );
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
        if self.should_restore() && !task_id.is_transient() {
            if let Some(task_type) = unsafe {
                self.backing_storage
                    .reverse_lookup_task_cache(None, task_id)
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
        fn take_from_log(log: &Option<PersistedStorageLog>) -> Vec<ChunkedVec<CachedDataUpdate>> {
            log.as_ref().map(|l| l.take()).unwrap_or_default()
        }
        let persisted_storage_meta_log = take_from_log(&self.persisted_storage_meta_log);
        let persisted_storage_data_log = take_from_log(&self.persisted_storage_data_log);
        let persisted_task_cache_log = self
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

        // TODO track which items are persisting
        // TODO This is very inefficient, maybe the BackingStorage could compute that since it need
        // to iterate items anyway.
        // let mut counts: FxHashMap<TaskId, u32> =
        // FxHashMap::with_capacity_and_hasher(); for log in persisted_storage_meta_log
        //     .iter()
        //     .chain(persisted_storage_data_log.iter())
        // {
        //     for CachedDataUpdate { task, .. } in log.iter() {
        //         *counts.entry(*task).or_default() += 1;
        //     }
        // }

        let mut new_items = false;

        fn shards_empty<T>(shards: &[ChunkedVec<T>]) -> bool {
            shards.iter().all(|shard| shard.is_empty())
        }

        if !shards_empty(&persisted_task_cache_log)
            || !shards_empty(&persisted_storage_meta_log)
            || !shards_empty(&persisted_storage_data_log)
        {
            new_items = true;
            if let Err(err) = self.backing_storage.save_snapshot(
                self.session_id,
                suspended_operations,
                persisted_task_cache_log,
                persisted_storage_meta_log,
                persisted_storage_data_log,
            ) {
                println!("Persisting failed: {:?}", err);
                return None;
            }
        }

        // TODO add when we need to track persisted items
        // for (task_id, count) in counts {
        //     self.storage
        //         .access_mut(task_id)
        //         .persistance_state_mut()
        //         .finish_persisting_items(count);
        // }

        Some((snapshot_time, new_items))
    }

    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>) {
        if self.should_restore() {
            // Continue all uncompleted operations
            // They can't be interrupted by a snapshot since the snapshotting job has not been
            // scheduled yet.
            let uncompleted_operations = self.backing_storage.uncompleted_operations();
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

    fn stop(&self) {
        if let Err(err) = self.backing_storage.shutdown() {
            println!("Shutting down failed: {}", err);
        }
    }

    fn idle_start(&self) {
        self.idle_start_event.notify(usize::MAX);
    }

    fn idle_end(&self) {
        self.idle_end_event.notify(usize::MAX);
    }

    fn get_or_create_persistent_task(
        &self,
        task_type: CachedTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> TaskId {
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            self.connect_child(parent_task, task_id, turbo_tasks);
            return task_id;
        }

        let tx = self
            .should_restore()
            .then(|| self.backing_storage.start_read_transaction())
            .flatten();
        let task_id = {
            // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
            if let Some(task_id) = unsafe {
                self.backing_storage
                    .forward_lookup_task_cache(tx.as_ref(), &task_type)
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
            let parent_task_type = self.lookup_task_type(parent_task);
            panic!(
                "Calling transient function {} from persistent function function {} is not allowed",
                task_type.get_name(),
                parent_task_type.map_or_else(|| "unknown".into(), |t| t.get_name())
            );
        }
        if let Some(task_id) = self.task_cache.lookup_forward(&task_type) {
            // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
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
            // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
            self.connect_child(parent_task, existing_task_id, turbo_tasks);
            return existing_task_id;
        }

        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        self.connect_child(parent_task, task_id, turbo_tasks);

        task_id
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

    fn get_task_description(&self, task_id: TaskId) -> std::string::String {
        self.lookup_task_type(task_id).map_or_else(
            || format!("{task_id:?} transient"),
            |task_type| task_type.to_string(),
        )
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
                    session_dependent: false,
                },
            });

            if self.should_track_children() {
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

                // Make all current collectibles outdated (remove left-over outdated collectibles)
                enum Collectible {
                    Current(CollectibleRef, i32),
                    Outdated(CollectibleRef),
                }
                let collectibles = task
                    .iter(CachedDataItemIndex::Collectibles)
                    .filter_map(|(key, value)| match (key, value) {
                        (
                            &CachedDataItemKey::Collectible { collectible },
                            &CachedDataItemValue::Collectible { value },
                        ) => Some(Collectible::Current(collectible, value)),
                        (&CachedDataItemKey::OutdatedCollectible { collectible }, _) => {
                            Some(Collectible::Outdated(collectible))
                        }
                        _ => None,
                    })
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
                let dependencies = task
                    .iter(CachedDataItemIndex::Dependencies)
                    .filter_map(|(key, _)| match *key {
                        CachedDataItemKey::CellDependency { target } => {
                            Some(Dep::CurrentCell(target))
                        }
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
            TaskType::Cached(task_type) => match &*task_type {
                CachedTaskType::Native { fn_type, this, arg } => (
                    registry::get_function(*fn_type).span(task_id),
                    registry::get_function(*fn_type).execute(*this, &**arg),
                ),
                CachedTaskType::ResolveNative { fn_type, .. } => {
                    let span = registry::get_function(*fn_type).resolve_span(task_id);
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
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = get!(task, InProgress) else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let &InProgressState::InProgress { stale, .. } = in_progress else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        if stale {
            let Some(InProgressState::InProgress { done_event, .. }) = remove!(task, InProgress)
            else {
                unreachable!();
            };
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            return true;
        }

        // TODO handle stateful
        let _ = stateful;

        // handle cell counters: update max index and remove cells that are no longer used
        let mut old_counters: HashMap<_, _> =
            get_many!(task, CellTypeMaxIndex { cell_type } max_index => (*cell_type, *max_index));
        for (&cell_type, &max_index) in cell_counters.iter() {
            if let Some(old_max_index) = old_counters.remove(&cell_type) {
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
        for (cell_type, _) in old_counters {
            task.remove(&CachedDataItemKey::CellTypeMaxIndex { cell_type });
        }

        let mut removed_data = Vec::new();
        let mut old_edges = Vec::new();

        // Remove no longer existing cells and notify in progress cells
        // find all outdated data items (removed cells, outdated edges)
        if task.is_indexed() {
            removed_data.extend(task.extract_if(
                CachedDataItemIndex::InProgressCell,
                |key, value| {
                    match (key, value) {
                        (
                            &CachedDataItemKey::InProgressCell { cell },
                            CachedDataItemValue::InProgressCell { value },
                        ) if cell_counters
                            .get(&cell.type_id)
                            .is_none_or(|start_index| cell.index >= *start_index) =>
                        {
                            value.event.notify(usize::MAX);
                            true
                        }
                        _ => false,
                    }
                },
            ));
            removed_data.extend(task.extract_if(CachedDataItemIndex::CellData, |key, _| {
                matches!(key, &CachedDataItemKey::CellData { cell } if cell_counters
                        .get(&cell.type_id).is_none_or(|start_index| cell.index >= *start_index))
            }));
            if self.should_track_children() {
                old_edges.extend(task.iter(CachedDataItemIndex::Children).filter_map(
                    |(key, _)| match *key {
                        CachedDataItemKey::OutdatedChild { task } => {
                            Some(OutdatedEdge::Child(task))
                        }
                        _ => None,
                    },
                ));
                old_edges.extend(task.iter(CachedDataItemIndex::Collectibles).filter_map(
                    |(key, value)| match (key, value) {
                        (
                            CachedDataItemKey::OutdatedCollectible { collectible },
                            CachedDataItemValue::OutdatedCollectible { value },
                        ) => Some(OutdatedEdge::Collectible(*collectible, *value)),
                        _ => None,
                    },
                ));
            }
            if self.should_track_dependencies() {
                old_edges.extend(task.iter(CachedDataItemIndex::Dependencies).filter_map(
                    |(key, _): (&CachedDataItemKey, &CachedDataItemValue)| match *key {
                        CachedDataItemKey::OutdatedCellDependency { target } => {
                            Some(OutdatedEdge::CellDependency(target))
                        }
                        CachedDataItemKey::OutdatedOutputDependency { target } => {
                            Some(OutdatedEdge::OutputDependency(target))
                        }
                        _ => None,
                    },
                ));
                old_edges.extend(task.iter(CachedDataItemIndex::CellDependent).filter_map(
                    |(key, _)| {
                        match *key {
                            CachedDataItemKey::CellDependent { cell, task }
                                if cell_counters
                                    .get(&cell.type_id)
                                    .is_none_or(|start_index| cell.index >= *start_index) =>
                            {
                                Some(OutdatedEdge::RemovedCellDependent(task, cell.type_id))
                            }
                            _ => None,
                        }
                    },
                ));
            }
        } else {
            removed_data.extend(task.extract_if_all(|key, value| {
                match (key, value) {
                    (
                        &CachedDataItemKey::InProgressCell { cell },
                        CachedDataItemValue::InProgressCell { value },
                    ) if cell_counters
                        .get(&cell.type_id)
                        .is_none_or(|start_index| cell.index >= *start_index) =>
                    {
                        value.event.notify(usize::MAX);
                        return true;
                    }
                    (&CachedDataItemKey::CellData { cell }, _)
                        if cell_counters
                            .get(&cell.type_id)
                            .is_none_or(|start_index| cell.index >= *start_index) =>
                    {
                        return true;
                    }
                    (&CachedDataItemKey::OutdatedChild { task }, _) => {
                        old_edges.push(OutdatedEdge::Child(task));
                    }
                    (
                        &CachedDataItemKey::OutdatedCollectible { collectible },
                        &CachedDataItemValue::OutdatedCollectible { value },
                    ) => old_edges.push(OutdatedEdge::Collectible(collectible, value)),
                    (&CachedDataItemKey::OutdatedCellDependency { target }, _) => {
                        old_edges.push(OutdatedEdge::CellDependency(target));
                    }
                    (&CachedDataItemKey::OutdatedOutputDependency { target }, _) => {
                        old_edges.push(OutdatedEdge::OutputDependency(target));
                    }
                    (&CachedDataItemKey::OutdatedCollectiblesDependency { target }, _) => {
                        old_edges.push(OutdatedEdge::CollectiblesDependency(target));
                    }
                    (&CachedDataItemKey::CellDependent { cell, task }, _)
                        if cell_counters
                            .get(&cell.type_id)
                            .is_none_or(|start_index| cell.index >= *start_index) =>
                    {
                        old_edges.push(OutdatedEdge::RemovedCellDependent(task, cell.type_id));
                    }
                    _ => {}
                }
                false
            }));
        };
        drop(task);

        // Remove outdated edges first, before removing in_progress+dirty flag.
        // We need to make sure all outdated edges are removed before the task can potentially be
        // scheduled and executed again
        CleanupOldEdgesOperation::run(task_id, old_edges, &mut ctx);

        // When restoring from persistent caching the following might not be executed (since we can
        // suspend in `CleanupOldEdgesOperation`), but that's ok as the task is still dirty and
        // would be executed again.

        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let Some(in_progress) = remove!(task, InProgress) else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };
        let InProgressState::InProgress {
            done_event,
            once_task: _,
            stale,
            session_dependent,
        } = in_progress
        else {
            panic!("Task execution completed, but task is not in progress: {task:#?}");
        };

        // If the task is stale, reschedule it
        if stale {
            task.add_new(CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            });
            return true;
        }

        // Update the dirty state
        let new_dirty_state = if session_dependent {
            Some(DirtyState {
                clean_in_session: Some(self.session_id),
            })
        } else {
            None
        };

        let old_dirty = if let Some(new_dirty_state) = new_dirty_state {
            task.insert(CachedDataItem::Dirty {
                value: new_dirty_state,
            })
        } else {
            task.remove(&CachedDataItemKey::Dirty {})
        };

        let old_dirty_state = old_dirty.map(|old_dirty| match old_dirty {
            CachedDataItemValue::Dirty { value } => value,
            _ => unreachable!(),
        });

        let data_update = if self.should_track_children()
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
                    if let Some(root_state) = get!(task, AggregateRoot) {
                        root_state.all_clean_event.notify(usize::MAX);
                        if matches!(root_state.ty, ActiveType::CachedActiveUntilClean) {
                            task.remove(&CachedDataItemKey::AggregateRoot {});
                        }
                    }
                }
                AggregationUpdateJob::data_update(
                    &mut task,
                    AggregatedDataUpdate::new().dirty_container_update(task_id, aggregated_update),
                )
            } else {
                None
            }
        } else {
            None
        };

        drop(task);

        done_event.notify(usize::MAX);

        if let Some(data_update) = data_update {
            AggregationUpdateQueue::run(data_update, &mut ctx);
        }

        drop(removed_data);

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
            task.insert(CachedDataItem::CollectiblesDependent {
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
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task, TaskDataCategory::Data);
        if let Some(InProgressState::InProgress {
            session_dependent, ..
        }) = get_mut!(task, InProgress)
        {
            *session_dependent = true;
        }
    }

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
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
            task.add(CachedDataItem::AggregationNumber {
                value: AggregationNumber {
                    base: u32::MAX,
                    distance: 0,
                    effective: u32::MAX,
                },
            });
            task.add(CachedDataItem::AggregateRoot {
                value: RootState::new(root_type, task_id),
            });
            task.add(CachedDataItem::new_scheduled(move || match root_type {
                ActiveType::RootTask => "Root Task".to_string(),
                ActiveType::OnceTask => "Once Task".to_string(),
                _ => unreachable!(),
            }));
        }
        task_id
    }

    fn dispose_root_task(
        &self,
        task_id: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) {
        let mut ctx = self.execute_context(turbo_tasks);
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let is_dirty = get!(task, Dirty).map_or(false, |dirty| dirty.get(self.session_id));
        let has_dirty_containers = get!(task, AggregatedDirtyContainerCount)
            .map_or(false, |dirty_containers| {
                dirty_containers.get(self.session_id) > 0
            });
        if is_dirty || has_dirty_containers {
            if let Some(root_state) = get_mut!(task, AggregateRoot) {
                // We will finish the task, but it would be removed after the task is done
                root_state.ty = ActiveType::CachedActiveUntilClean;
            };
        } else if let Some(root_state) = remove!(task, AggregateRoot) {
            // Technically nobody should be listening to this event, but just in case
            // we notify it anyway
            root_state.all_clean_event.notify(usize::MAX);
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

    fn stop(&self, _turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.stop();
    }

    fn idle_start(&self, _turbo_tasks: &dyn TurboTasksBackendApi<Self>) {
        self.0.idle_start();
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
}

// from https://github.com/tokio-rs/tokio/blob/29cd6ec1ec6f90a7ee1ad641c03e0e00badbcb0e/tokio/src/time/instant.rs#L57-L63
fn far_future() -> Instant {
    // Roughly 30 years from now.
    // API does not provide a way to obtain max `Instant`
    // or convert specific date in the future to instant.
    // 1000 years overflows on macOS, 100 years overflows on FreeBSD.
    Instant::now() + Duration::from_secs(86400 * 365 * 30)
}
