mod aggregation_update;
mod cleanup_old_edges;
mod connect_child;
mod connect_children;
mod invalidate;
mod prepare_new_children;
mod update_cell;
mod update_collectible;

use std::{
    fmt::{Debug, Formatter},
    mem::transmute,
    sync::{Arc, atomic::Ordering},
};

use bincode::{Decode, Encode};
use turbo_tasks::{
    CellId, FxIndexMap, SharedReference, TaskExecutionReason, TaskId, TraitTypeId,
    TurboTasksBackendApi, TypedSharedReference, ValueTypeId,
};

use crate::{
    backend::{
        OperationGuard, TaskDataCategory, TransientTask, TurboTasksBackend, TurboTasksBackendInner,
        TurboTasksBackendJob,
        storage::{SpecificTaskDataCategory, StorageWriteGuard},
        storage_schema::{CounterMapExt, TaskStorageAccessors},
    },
    backing_storage::BackingStorage,
    data::{
        ActivenessState, CellRef, CollectibleRef, CollectiblesRef, Dirtyness, InProgressCellState,
        InProgressState,
    },
};

pub trait Operation:
    Encode + Decode<()> + Default + TryFrom<AnyOperation, Error = ()> + Into<AnyOperation>
{
    fn execute(self, ctx: &mut impl ExecuteContext);
}

#[derive(Copy, Clone)]
enum TransactionState<'a, 'tx, B: BackingStorage> {
    None,
    Borrowed(Option<&'a B::ReadTransaction<'tx>>),
    Owned(Option<B::ReadTransaction<'tx>>),
}

pub trait ExecuteContext<'e>: Sized {
    type TaskGuardImpl: TaskGuard + 'e;
    fn child_context<'l, 'r>(&'r self) -> impl ChildExecuteContext<'l> + use<'e, 'l, Self>
    where
        'e: 'l;
    fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> Self::TaskGuardImpl;
    fn is_once_task(&self, task_id: TaskId) -> bool;
    fn task_pair(
        &mut self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (Self::TaskGuardImpl, Self::TaskGuardImpl);
    fn schedule(&mut self, task_id: TaskId);
    fn schedule_task(&self, task: Self::TaskGuardImpl);
    fn operation_suspend_point<T>(&mut self, op: &T)
    where
        T: Clone + Into<AnyOperation>;
    fn suspending_requested(&self) -> bool;
    fn get_task_desc_fn(&self, task_id: TaskId) -> impl Fn() -> String + Send + Sync + 'static;
    fn get_task_description(&self, task_id: TaskId) -> String;
    fn should_track_dependencies(&self) -> bool;
    fn should_track_activeness(&self) -> bool;
}

pub trait ChildExecuteContext<'e>: Send + Sized {
    fn create(self) -> impl ExecuteContext<'e>;
}

pub struct ExecuteContextImpl<'e, 'tx, B: BackingStorage>
where
    Self: 'e,
    'tx: 'e,
{
    backend: &'e TurboTasksBackendInner<B>,
    turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    _operation_guard: Option<OperationGuard<'e, B>>,
    transaction: TransactionState<'e, 'tx, B>,
    #[cfg(debug_assertions)]
    active_task_locks: Arc<std::sync::atomic::AtomicU8>,
}

impl<'e, 'tx, B: BackingStorage> ExecuteContextImpl<'e, 'tx, B>
where
    'tx: 'e,
{
    pub(super) fn new(
        backend: &'e TurboTasksBackendInner<B>,
        turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            _operation_guard: Some(backend.start_operation()),
            transaction: TransactionState::None,
            #[cfg(debug_assertions)]
            active_task_locks: Arc::new(std::sync::atomic::AtomicU8::new(0)),
        }
    }

    pub(super) unsafe fn new_with_tx(
        backend: &'e TurboTasksBackendInner<B>,
        transaction: Option<&'e B::ReadTransaction<'tx>>,
        turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            _operation_guard: Some(backend.start_operation()),
            transaction: TransactionState::Borrowed(transaction),
            #[cfg(debug_assertions)]
            active_task_locks: Arc::new(std::sync::atomic::AtomicU8::new(0)),
        }
    }

    /// Restore task data directly into TypedStorage using typed serialization.
    /// This bypasses the intermediate Vec<CachedDataItem> representation.
    fn restore_task_data_typed(
        &mut self,
        task_id: TaskId,
        category: TaskDataCategory,
        storage: &mut crate::backend::storage_schema::TypedStorage,
    ) {
        if matches!(self.transaction, TransactionState::None) {
            let check_backing_storage = self.backend.should_restore()
                && self.backend.local_is_partial.load(Ordering::Acquire);
            if !check_backing_storage {
                // If we don't need to restore, nothing to do
                return;
            }
            let tx = self.backend.backing_storage.start_read_transaction();
            let tx = tx.map(|tx| {
                // Safety: self is actually valid for 'a, so it's safe to transmute 'l to 'a
                unsafe { transmute::<B::ReadTransaction<'_>, B::ReadTransaction<'tx>>(tx) }
            });
            self.transaction = TransactionState::Owned(tx);
        }
        let tx = match &self.transaction {
            TransactionState::None => unreachable!(),
            TransactionState::Borrowed(tx) => *tx,
            TransactionState::Owned(tx) => tx.as_ref(),
        };

        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        let result = match category {
            TaskDataCategory::Meta => unsafe {
                self.backend
                    .backing_storage
                    .lookup_typed_meta(tx, task_id, storage)
            },
            TaskDataCategory::Data => unsafe {
                self.backend
                    .backing_storage
                    .lookup_typed_data(tx, task_id, storage)
            },
            TaskDataCategory::All => {
                // Restore both meta and data
                let meta_result = unsafe {
                    self.backend
                        .backing_storage
                        .lookup_typed_meta(tx, task_id, storage)
                };
                if let Err(e) = meta_result {
                    let task_name = self.backend.get_task_description(task_id);
                    panic!(
                        "Failed to restore task meta (corrupted database or bug): {:?}",
                        e.context(format!("Meta for {task_name} ({task_id})"))
                    );
                }
                unsafe {
                    self.backend
                        .backing_storage
                        .lookup_typed_data(tx, task_id, storage)
                }
            }
        };

        if let Err(e) = result {
            let task_name = self.backend.get_task_description(task_id);
            panic!(
                "Failed to restore task data (corrupted database or bug): {:?}",
                e.context(format!("{category:?} for {task_name} ({task_id})"))
            );
        }
    }
}

impl<'e, 'tx, B: BackingStorage> ExecuteContext<'e> for ExecuteContextImpl<'e, 'tx, B>
where
    'tx: 'e,
{
    type TaskGuardImpl = TaskGuardImpl<'e, B>;

    fn child_context<'l, 'r>(&'r self) -> impl ChildExecuteContext<'l> + use<'e, 'tx, 'l, B>
    where
        'e: 'l,
    {
        ChildExecuteContextImpl {
            backend: self.backend,
            turbo_tasks: self.turbo_tasks,
        }
    }

    fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> Self::TaskGuardImpl {
        #[cfg(debug_assertions)]
        if self.active_task_locks.fetch_add(1, Ordering::AcqRel) != 0 {
            panic!(
                "Concurrent task lock acquisition detected. This is not allowed and indicates a \
                 bug. It can lead to deadlocks."
            );
        }

        let mut task = self.backend.storage.access_mut(task_id);
        if !task.flags().is_restored(category) {
            if task_id.is_transient() {
                task.flags_mut().set_restored(TaskDataCategory::All);
            } else {
                for category in category {
                    if !task.flags().is_restored(category) {
                        // Avoid holding the lock too long since this can also affect other tasks
                        drop(task);

                        // Create a temporary TypedStorage to decode into
                        let mut restored_storage =
                            crate::backend::storage_schema::TypedStorage::new();
                        self.restore_task_data_typed(task_id, category, &mut restored_storage);

                        task = self.backend.storage.access_mut(task_id);
                        if !task.flags().is_restored(category) {
                            // Restore the persisted data into the task's storage
                            task.typed_mut().restore_from(restored_storage, category);
                            task.flags_mut().set_restored(category);
                        }
                    }
                }
            }
        }
        TaskGuardImpl {
            task,
            task_id,
            backend: self.backend,
            #[cfg(debug_assertions)]
            category,
            #[cfg(debug_assertions)]
            active_task_locks: self.active_task_locks.clone(),
        }
    }

    fn is_once_task(&self, task_id: TaskId) -> bool {
        if !task_id.is_transient() {
            return false;
        }
        if let Some(ty) = self.backend.transient_tasks.get(&task_id) {
            matches!(**ty, TransientTask::Once(_))
        } else {
            false
        }
    }

    fn task_pair(
        &mut self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (Self::TaskGuardImpl, Self::TaskGuardImpl) {
        #[cfg(debug_assertions)]
        if self.active_task_locks.fetch_add(2, Ordering::AcqRel) != 0 {
            panic!(
                "Concurrent task lock acquisition detected. This is not allowed and indicates a \
                 bug. It can lead to deadlocks."
            );
        }

        let (mut task1, mut task2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
        let is_restored1 = task1.flags().is_restored(category);
        let is_restored2 = task2.flags().is_restored(category);
        if !is_restored1 || !is_restored2 {
            for category in category {
                // Avoid holding the lock too long since this can also affect other tasks
                drop(task1);
                drop(task2);

                // Restore using typed storage path
                let restored1 = if !is_restored1 {
                    let mut storage = crate::backend::storage_schema::TypedStorage::new();
                    self.restore_task_data_typed(task_id1, category, &mut storage);
                    Some(storage)
                } else {
                    None
                };
                let restored2 = if !is_restored2 {
                    let mut storage = crate::backend::storage_schema::TypedStorage::new();
                    self.restore_task_data_typed(task_id2, category, &mut storage);
                    Some(storage)
                } else {
                    None
                };

                let (t1, t2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
                task1 = t1;
                task2 = t2;
                if !task1.flags().is_restored(category) {
                    task1.typed_mut().restore_from(restored1.unwrap(), category);
                    task1.flags_mut().set_restored(category);
                }
                if !task2.flags().is_restored(category) {
                    task2.typed_mut().restore_from(restored2.unwrap(), category);
                    task2.flags_mut().set_restored(category);
                }
            }
        }
        (
            TaskGuardImpl {
                task: task1,
                task_id: task_id1,
                backend: self.backend,
                #[cfg(debug_assertions)]
                category,
                #[cfg(debug_assertions)]
                active_task_locks: self.active_task_locks.clone(),
            },
            TaskGuardImpl {
                task: task2,
                task_id: task_id2,
                backend: self.backend,
                #[cfg(debug_assertions)]
                category,
                #[cfg(debug_assertions)]
                active_task_locks: self.active_task_locks.clone(),
            },
        )
    }

    fn schedule(&mut self, task_id: TaskId) {
        let task = self.task(task_id, TaskDataCategory::All);
        self.schedule_task(task);
    }

    fn schedule_task(&self, mut task: Self::TaskGuardImpl) {
        if let Some(tasks_to_prefetch) = task.prefetch() {
            self.turbo_tasks
                .schedule_backend_background_job(TurboTasksBackendJob::Prefetch {
                    data: Arc::new(tasks_to_prefetch),
                    range: None,
                });
        }
        self.turbo_tasks.schedule(task.id());
    }

    fn operation_suspend_point<T: Clone + Into<AnyOperation>>(&mut self, op: &T) {
        self.backend.operation_suspend_point(|| op.clone().into());
    }

    fn suspending_requested(&self) -> bool {
        self.backend.suspending_requested()
    }

    fn get_task_desc_fn(&self, task_id: TaskId) -> impl Fn() -> String + Send + Sync + 'static {
        self.backend.get_task_desc_fn(task_id)
    }

    fn get_task_description(&self, task_id: TaskId) -> String {
        self.backend.get_task_description(task_id)
    }

    fn should_track_dependencies(&self) -> bool {
        self.backend.should_track_dependencies()
    }

    fn should_track_activeness(&self) -> bool {
        self.backend.should_track_activeness()
    }
}

struct ChildExecuteContextImpl<'e, B: BackingStorage> {
    backend: &'e TurboTasksBackendInner<B>,
    turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
}

impl<'e, B: BackingStorage> ChildExecuteContext<'e> for ChildExecuteContextImpl<'e, B> {
    fn create(self) -> impl ExecuteContext<'e> {
        ExecuteContextImpl {
            backend: self.backend,
            turbo_tasks: self.turbo_tasks,
            _operation_guard: None,
            transaction: TransactionState::None,
            #[cfg(debug_assertions)]
            active_task_locks: Arc::new(std::sync::atomic::AtomicU8::new(0)),
        }
    }
}

pub trait TaskGuard: Debug + TaskStorageAccessors {
    fn id(&self) -> TaskId;

    // ============ Typed Child APIs ============
    // Single-item and bulk operations use generated methods from TaskStorageAccessors:
    // - has_children_item(&task) -> bool
    // - add_children_item(task) -> bool
    // - add_children_items(iter) - bulk add
    // - remove_children_item(&task) -> bool

    // ============ Typed OutputDependency APIs ============
    // Single-item operations use generated methods from TaskStorageAccessors:
    // - has_output_dependencies_item(&target) -> bool
    // - add_output_dependencies_item(target) -> bool
    // - remove_output_dependencies_item(&target) -> bool

    // ============ Typed CellDependency APIs ============
    // Single-item operations use generated methods from TaskStorageAccessors:
    // - has_cell_dependencies_item(&target) -> bool
    // - add_cell_dependencies_item(target) -> bool
    // - remove_cell_dependencies_item(&target) -> bool

    // ============ Typed OutputDependent APIs ============

    /// Remove an output dependent from this task
    /// Returns true if the dependent was present and removed
    /// Uses typed storage directly - output_dependent is a migrated auto_set
    fn remove_output_dependent(&mut self, task: TaskId) -> bool;

    /// Add an output dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    /// Uses typed storage directly - output_dependent is a migrated auto_set
    #[must_use]
    fn add_output_dependent(&mut self, task: TaskId) -> bool;

    // ============ Typed CellDependent APIs ============
    // cell_dependents is a migrated auto_map: AutoMap<CellId, FxHashSet<TaskId>>

    /// Remove a cell dependent from this task
    /// Returns true if the dependent was present and removed
    /// Uses typed storage directly - cell_dependents is a migrated auto_map
    fn remove_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool;

    /// Add a cell dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    /// Uses typed storage directly - cell_dependents is a migrated auto_map
    #[must_use]
    fn add_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool;

    // ============ Typed CollectiblesDependent APIs ============
    // collectibles_dependents is a migrated auto_map: AutoMap<TraitTypeId, FxHashSet<TaskId>>

    /// Remove a collectibles dependent from this task
    /// Returns true if the dependent was present and removed
    /// Uses typed storage directly - collectibles_dependents is a migrated auto_map
    fn remove_collectibles_dependent(
        &mut self,
        collectible_type: TraitTypeId,
        task: TaskId,
    ) -> bool;

    /// Add a collectibles dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    /// Uses typed storage directly - collectibles_dependents is a migrated auto_map
    #[must_use]
    fn add_collectibles_dependent(&mut self, collectible_type: TraitTypeId, task: TaskId) -> bool;

    // ============ Typed CollectiblesDependency APIs ============
    // Uses typed storage directly - collectibles_dependencies is a migrated auto_set

    /// Remove a collectibles dependency from this task
    /// Returns true if the dependency was present and removed
    fn remove_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.collectibles_dependencies_mut().remove(&target)
    }

    /// Add a collectibles dependency to this task
    /// Returns true if the dependency was newly added, false if it already existed
    #[must_use]
    fn add_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.collectibles_dependencies_mut().insert(target)
    }

    // ============ Typed Marker APIs ============
    // Flags are migrated: use TaskStorageAccessors trait methods directly
    // Generated methods: stateful(), set_stateful(), invalidator(), set_invalidator(),
    // immutable(), set_immutable()

    // ============ Output APIs ============
    // Output accessor methods are provided by the TaskStorageAccessors trait (generated by macro)
    // Methods: get_output_ref(), has_output(), set_output(), take_output()

    // NOTE: Dirty state accessors are provided by the TaskStorageAccessors trait:
    // - get_dirty_ref() -> Option<&Dirtyness>
    // - has_dirty() -> bool
    // - set_dirty(value) -> Option<Dirtyness> (returns old value)
    // - take_dirty() -> Option<Dirtyness> (clears and returns old value)
    //
    // NOTE: Current session clean accessors are provided by TaskStorageAccessors:
    // - current_session_clean() -> bool
    // - set_current_session_clean(bool)

    // Counter field accessors

    // NOTE: aggregation_number accessors (get_aggregation_number_ref, has_aggregation_number,
    // set_aggregation_number, take_aggregation_number) are now generated by the
    // TaskStorageAccessors trait via the TaskStorage macro.

    /// Update an Upper counter for a task by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_upper_count(&mut self, task: TaskId, delta: u32) -> bool {
        self.upper_mut().update_count(task, delta)
    }

    /// Remove an Upper entry for a task, returning the count if present
    fn remove_upper(&mut self, task: TaskId) -> Option<u32> {
        self.upper_mut().remove(&task)
    }

    /// Update an Upper entry for a task with a closure
    fn update_upper<F>(&mut self, task: TaskId, f: F)
    where
        F: FnOnce(Option<u32>) -> Option<u32>,
    {
        self.upper_mut().update_with(task, f)
    }

    /// Add a new Upper entry (used when adding new uppers)
    ///
    /// # Panics
    ///
    /// Panics if the entry already exists.
    fn add_upper(&mut self, task: TaskId, count: u32) {
        self.upper_mut().add_entry(task, count)
    }

    /// Update a Follower counter for a task by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_follower_count(&mut self, task: TaskId, delta: u32) -> bool {
        self.followers_mut().update_count(task, delta)
    }

    /// Remove a Follower entry for a task, returning the count if present
    fn remove_follower(&mut self, task: TaskId) -> Option<u32> {
        self.followers_mut().remove(&task)
    }

    /// Update a Follower entry for a task with a closure
    fn update_follower<F>(&mut self, task: TaskId, f: F)
    where
        F: FnOnce(Option<u32>) -> Option<u32>,
    {
        self.followers_mut().update_with(task, f)
    }

    /// Add a new Follower entry (used when adding new followers)
    ///
    /// # Panics
    ///
    /// Panics if the entry already exists.
    fn add_follower(&mut self, task: TaskId, count: u32) {
        self.followers_mut().add_entry(task, count)
    }

    /// Update a Collectible counter for a collectible by the given delta.
    ///
    /// Returns `true` if the count crossed the positive boundary (became positive or
    /// became non-positive), `false` otherwise. This is useful for tracking collectibles
    /// where positive counts indicate presence and non-positive counts indicate absence.
    #[must_use]
    fn update_collectible_count(&mut self, collectible: CollectibleRef, delta: i32) -> bool {
        self.collectibles_mut()
            .update_positive_crossing(collectible, delta)
    }

    /// Update an OutdatedCollectible counter for a collectible by the given delta.
    ///
    /// Returns `true` if the count crossed the positive boundary (became positive or
    /// became non-positive), `false` otherwise. This is useful for tracking collectibles
    /// where positive counts indicate presence and non-positive counts indicate absence.
    #[must_use]
    fn update_outdated_collectible_count(
        &mut self,
        collectible: CollectibleRef,
        delta: i32,
    ) -> bool {
        self.outdated_collectibles_mut()
            .update_positive_crossing(collectible, delta)
    }

    // ============ Typed Execution State APIs ============
    // Uses typed storage directly via TaskStorageAccessors trait - execution group is migrated
    // Generated methods from TaskStorageAccessors:
    // - has_activeness() -> bool
    // - get_activeness_ref() -> Option<&ActivenessState>
    // - set_activeness(v: ActivenessState) -> Option<ActivenessState>
    // - take_activeness() -> Option<ActivenessState>
    // - has_in_progress() -> bool
    // - get_in_progress_ref() -> Option<&InProgressState>
    // - set_in_progress(v: InProgressState) -> Option<InProgressState>
    // - take_in_progress() -> Option<InProgressState>
    // - in_progress_cells() -> Option<&AutoMap<CellId, InProgressCellState>>
    // - in_progress_cells_mut() -> &mut AutoMap<CellId, InProgressCellState>

    /// Get mutable reference to the activeness state
    fn get_activeness_mut(&mut self) -> Option<&mut ActivenessState>;

    /// Get mutable reference to the activeness state, inserting a new one if not present
    fn get_activeness_mut_or_insert_with<F>(&mut self, f: F) -> &mut ActivenessState
    where
        F: FnOnce() -> ActivenessState;

    /// Get mutable reference to the in-progress state
    fn get_in_progress_mut(&mut self) -> Option<&mut InProgressState>;

    /// Add an in-progress state if not already present. Returns true if newly added.
    fn add_in_progress(&mut self, value: InProgressState) -> bool;

    /// Get the in-progress cell state for a specific cell
    fn get_in_progress_cell(&self, cell: CellId) -> Option<&InProgressCellState> {
        self.in_progress_cells().and_then(|map| map.get(&cell))
    }

    /// Remove the in-progress cell state for a specific cell, returning the old state if present
    fn remove_in_progress_cell(&mut self, cell: CellId) -> Option<InProgressCellState> {
        self.in_progress_cells_mut().remove(&cell)
    }

    /// Get transient cell data for a specific cell
    fn get_transient_cell_data(&self, cell: CellId) -> Option<&SharedReference> {
        self.transient_cell_data().and_then(|map| map.get(&cell))
    }

    /// Update aggregated dirty container count for a specific task by the given delta and return
    /// the new count.
    fn update_and_get_aggregated_dirty_container(&mut self, task: TaskId, delta: i32) -> i32 {
        self.aggregated_dirty_containers_mut()
            .update_and_get(task, delta)
    }

    /// Update aggregated current session clean container count for a specific task by the given
    /// delta and return the new count.
    fn update_and_get_aggregated_current_session_clean_container(
        &mut self,
        task: TaskId,
        delta: i32,
    ) -> i32 {
        self.aggregated_current_session_clean_containers_mut()
            .update_and_get(task, delta)
    }

    /// Get the dirty container count for a specific task from the aggregated dirty containers map.
    fn get_aggregated_dirty_container(&self, task: TaskId) -> Option<&i32> {
        self.aggregated_dirty_containers()
            .and_then(|map| map.get(&task))
    }

    /// Get the clean container count for a specific task from the aggregated current session clean
    /// containers map.
    fn get_aggregated_current_session_clean_container(&self, task: TaskId) -> Option<&i32> {
        self.aggregated_current_session_clean_containers()
            .and_then(|map| map.get(&task))
    }

    /// Update the aggregated dirty container count (the scalar total count field) by the given
    /// delta and return the new value.
    fn update_and_get_aggregated_dirty_container_count(&mut self, delta: i32) -> i32 {
        let current = self
            .get_aggregated_dirty_container_count_ref()
            .copied()
            .unwrap_or(0);
        let new_value = current + delta;
        if new_value == 0 {
            self.take_aggregated_dirty_container_count();
        } else {
            self.set_aggregated_dirty_container_count(new_value);
        }
        new_value
    }

    /// Update the aggregated current session clean container count (the scalar total count field)
    /// by the given delta and return the new value.
    fn update_and_get_aggregated_current_session_clean_container_count(
        &mut self,
        delta: i32,
    ) -> i32 {
        let current = self
            .get_aggregated_current_session_clean_container_count_ref()
            .copied()
            .unwrap_or(0);
        let new_value = current + delta;
        if new_value == 0 {
            self.take_aggregated_current_session_clean_container_count();
        } else {
            self.set_aggregated_current_session_clean_container_count(new_value);
        }
        new_value
    }

    /// Get aggregated collectible count for a specific collectible
    fn get_aggregated_collectible(&self, collectible: CollectibleRef) -> Option<&i32> {
        self.aggregated_collectibles()
            .and_then(|map| map.get(&collectible))
    }

    /// Update aggregated collectible count for a specific collectible with a closure
    fn update_aggregated_collectible<F>(&mut self, collectible: CollectibleRef, f: F)
    where
        F: FnOnce(Option<i32>) -> Option<i32>,
    {
        self.aggregated_collectibles_mut()
            .update_with(collectible, f)
    }

    /// Get outdated collectible count for a specific collectible
    fn get_outdated_collectible(&self, collectible: CollectibleRef) -> Option<&i32> {
        self.outdated_collectibles()
            .and_then(|map| map.get(&collectible))
    }

    /// Get cell type max index for a specific cell type
    fn get_cell_type_max_index(&self, cell_type: ValueTypeId) -> Option<&u32> {
        self.cell_type_max_index()
            .and_then(|map| map.get(&cell_type))
    }

    /// Count the number of followers
    fn count_followers(&self) -> usize {
        self.followers().map_or(0, |m| m.len())
    }

    /// Count the number of uppers
    fn count_uppers(&self) -> usize {
        self.upper().len()
    }

    /// Count the number of children
    fn count_children(&self) -> usize {
        self.children().map_or(0, |m| m.len())
    }

    /// Count the number of collectibles
    fn count_collectibles(&self) -> usize {
        self.collectibles().map_or(0, |m| m.len())
    }

    /// Count the number of outdated collectibles
    fn count_outdated_collectibles(&self) -> usize {
        self.outdated_collectibles().map_or(0, |m| m.len())
    }

    /// Count the number of collectibles dependencies
    /// Uses typed storage directly - collectibles_dependencies is a migrated auto_set
    fn count_collectibles_dependencies(&self) -> usize {
        self.collectibles_dependencies()
            .map_or(0, |deps| deps.len())
    }

    fn invalidate_serialization(&mut self);
    fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, bool>>;
    fn is_immutable(&self) -> bool;
    fn is_dirty(&self) -> bool {
        self.get_dirty_ref()
            .is_some_and(|dirtyness| match dirtyness {
                Dirtyness::Dirty => true,
                Dirtyness::SessionDependent => !self.current_session_clean(),
            })
    }
    fn dirtyness_and_session(&self) -> Option<(Dirtyness, bool)> {
        match self.get_dirty_ref()? {
            Dirtyness::Dirty => Some((Dirtyness::Dirty, false)),
            Dirtyness::SessionDependent => {
                Some((Dirtyness::SessionDependent, self.current_session_clean()))
            }
        }
    }
    /// Returns (is_dirty, is_clean_in_current_session)
    fn dirty_state(&self) -> (bool, bool) {
        match self.get_dirty_ref() {
            None => (false, false),
            Some(Dirtyness::Dirty) => (true, false),
            Some(Dirtyness::SessionDependent) => (true, self.current_session_clean()),
        }
    }
    fn dirty_containers(&self) -> impl Iterator<Item = TaskId> {
        self.dirty_containers_with_count()
            .map(|(task_id, _)| task_id)
    }
    fn dirty_containers_with_count(&self) -> impl Iterator<Item = (TaskId, i32)> + '_ {
        let dirty_map = self.aggregated_dirty_containers();
        let clean_map = self.aggregated_current_session_clean_containers();
        dirty_map.into_iter().flat_map(move |map| {
            map.iter().filter_map(move |(&task_id, &count)| {
                if count > 0 {
                    let clean_count = clean_map
                        .and_then(|m| m.get(&task_id))
                        .copied()
                        .unwrap_or_default();
                    if count > clean_count {
                        return Some((task_id, count));
                    }
                }
                None
            })
        })
    }

    fn has_dirty_containers(&self) -> bool {
        let dirty_count = self
            .get_aggregated_dirty_container_count_ref()
            .copied()
            .unwrap_or_default();
        if dirty_count <= 0 {
            return false;
        }
        let clean_count = self
            .get_aggregated_current_session_clean_container_count_ref()
            .copied()
            .unwrap_or_default();
        dirty_count > clean_count
    }
    fn remove_cell_data(
        &mut self,
        is_serializable_cell_content: bool,
        cell: CellId,
    ) -> Option<TypedSharedReference> {
        if is_serializable_cell_content {
            self.cell_data_mut().remove(&cell)
        } else {
            self.transient_cell_data_mut()
                .remove(&cell)
                .map(|sr| sr.into_typed(cell.type_id))
        }
    }
    fn get_cell_data(
        &self,
        is_serializable_cell_content: bool,
        cell: CellId,
    ) -> Option<TypedSharedReference> {
        if is_serializable_cell_content {
            self.cell_data().and_then(|map| map.get(&cell)).cloned()
        } else {
            self.transient_cell_data()
                .and_then(|map| map.get(&cell))
                .map(|sr| sr.clone().into_typed(cell.type_id))
        }
    }
    fn has_cell_data(&self, is_serializable_cell_content: bool, cell: CellId) -> bool {
        if is_serializable_cell_content {
            self.cell_data().is_some_and(|map| map.contains_key(&cell))
        } else {
            self.transient_cell_data()
                .is_some_and(|map| map.contains_key(&cell))
        }
    }
    /// Set cell data, returning the old value if any.
    fn set_cell_data(
        &mut self,
        is_serializable_cell_content: bool,
        cell: CellId,
        value: TypedSharedReference,
    ) -> Option<TypedSharedReference> {
        if is_serializable_cell_content {
            self.cell_data_mut().insert(cell, value)
        } else {
            self.transient_cell_data_mut()
                .insert(cell, value.into_untyped())
                .map(|sr| sr.into_typed(cell.type_id))
        }
    }

    /// Add new cell data (asserts that the cell is new and didn't exist before).
    fn add_cell_data(
        &mut self,
        is_serializable_cell_content: bool,
        cell: CellId,
        value: TypedSharedReference,
    ) {
        let old = self.set_cell_data(is_serializable_cell_content, cell, value);
        assert!(old.is_none(), "Cell data already exists for {cell:?}");
    }

    /// Add a scheduled task item. Returns true if the task was successfully added (wasn't already
    /// present).
    #[must_use]
    fn add_scheduled<InnerFn>(
        &mut self,
        reason: TaskExecutionReason,
        description: impl FnOnce() -> InnerFn,
    ) -> bool
    where
        InnerFn: Fn() -> String + Sync + Send + 'static,
    {
        self.add_in_progress(InProgressState::new_scheduled(reason, description))
    }

    // ============ Outdated Dependency APIs ============
    // Uses typed storage directly - outdated_*_dependencies are migrated auto_sets

    /// Remove an outdated output dependency
    fn remove_outdated_output_dependency(&mut self, target: TaskId) -> bool {
        self.outdated_output_dependencies_mut().remove(&target)
    }

    /// Remove an outdated cell dependency
    fn remove_outdated_cell_dependency(&mut self, target: CellRef) -> bool {
        self.outdated_cell_dependencies_mut().remove(&target)
    }

    /// Check if task has an outdated output dependency
    #[must_use]
    fn has_outdated_output_dependency(&self, target: TaskId) -> bool {
        self.outdated_output_dependencies()
            .is_some_and(|deps| deps.contains(&target))
    }

    /// Check if task has an outdated cell dependency
    #[must_use]
    fn has_outdated_cell_dependency(&self, target: CellRef) -> bool {
        self.outdated_cell_dependencies()
            .is_some_and(|deps| deps.contains(&target))
    }

    /// Remove an outdated collectibles dependency
    fn remove_outdated_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.outdated_collectibles_dependencies_mut()
            .remove(&target)
    }

    // Bulk operations for outdated dependencies use generated methods from TaskStorageAccessors:
    // - add_outdated_cell_dependencies_items(iter)
    // - add_outdated_output_dependencies_items(iter)

    // ============ Collectible APIs ============

    /// Insert an outdated collectible with count. Returns true if it was newly inserted.
    #[must_use]
    fn insert_outdated_collectible(&mut self, collectible: CollectibleRef, value: i32) -> bool {
        use std::collections::hash_map::Entry;
        match self.outdated_collectibles_mut().entry(collectible) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(value);
                true
            }
        }
    }

    /// Check if task has a collectible
    #[must_use]
    fn has_collectible(&self, collectible: CollectibleRef) -> bool {
        self.collectibles()
            .is_some_and(|m| m.contains_key(&collectible))
    }

    /// Remove an outdated collectible
    fn remove_outdated_collectible(&mut self, collectible: CollectibleRef) -> bool {
        self.outdated_collectibles_mut()
            .remove(&collectible)
            .is_some()
    }

    // ============ Dependency Bulk Operations ============
    // Uses typed storage directly - dependencies are migrated auto_sets

    /// Add multiple cell dependencies at once
    fn add_cell_dependencies(&mut self, dependencies: impl Iterator<Item = CellRef>) -> bool {
        let set = self.cell_dependencies_mut();
        let mut all_new = true;
        for dep in dependencies {
            all_new &= set.insert(dep);
        }
        all_new
    }

    /// Add multiple output dependencies at once
    fn add_output_dependencies(&mut self, dependencies: impl Iterator<Item = TaskId>) -> bool {
        let set = self.output_dependencies_mut();
        let mut all_new = true;
        for dep in dependencies {
            all_new &= set.insert(dep);
        }
        all_new
    }

    // ============ Other APIs ============

    /// Remove cell type max index
    fn remove_cell_type_max_index(&mut self, cell_type: ValueTypeId) -> bool {
        self.cell_type_max_index_mut().remove(&cell_type).is_some()
    }

    // NOTE: has_invalidator() is provided by the TaskStorageAccessors trait (generated by macro)

    // ============ Iterator APIs ============
    // These replace the iter_many! and get_many! macros with typed iterators

    /// Iterate over all child tasks
    fn iter_children(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.children().into_iter().flat_map(|m| m.iter().copied())
    }

    /// Iterate over all follower tasks (with count > 0)
    fn iter_followers(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.followers().into_iter().flat_map(|m| {
            m.iter()
                .filter_map(|(&k, &v)| if v > 0 { Some(k) } else { None })
        })
    }

    /// Iterate over all upper tasks (with count > 0)
    /// Uses typed storage accessor from TaskStorageAccessors trait
    // TODO: Investigate when upper entries have count == 0. The semantics of storing
    // entries with zero count is unclear - consider removing such entries or documenting
    // why they're kept.
    fn iter_uppers(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.upper()
            .iter()
            .filter_map(|(&task, &count)| if count > 0 { Some(task) } else { None })
    }

    /// Iterate over all output dependencies
    /// Uses typed storage directly - output_dependencies is a migrated auto_set
    fn iter_output_dependencies(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.output_dependencies()
            .into_iter()
            .flat_map(|deps| deps.iter().copied())
    }

    /// Iterate over all cell dependencies
    /// Uses typed storage directly - cell_dependencies is a migrated auto_set
    fn iter_cell_dependencies(&self) -> impl Iterator<Item = CellRef> + '_ {
        self.cell_dependencies()
            .into_iter()
            .flat_map(|deps| deps.iter().copied())
    }

    /// Iterate over all outdated output dependencies
    /// Uses typed storage directly - outdated_output_dependencies is a migrated auto_set
    fn iter_outdated_output_dependencies(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.outdated_output_dependencies()
            .into_iter()
            .flat_map(|deps| deps.iter().copied())
    }

    /// Iterate over all outdated cell dependencies
    /// Uses typed storage directly - outdated_cell_dependencies is a migrated auto_set
    fn iter_outdated_cell_dependencies(&self) -> impl Iterator<Item = CellRef> + '_ {
        self.outdated_cell_dependencies()
            .into_iter()
            .flat_map(|deps| deps.iter().copied())
    }

    /// Iterate over all collectibles dependencies
    /// Uses typed storage directly - collectibles_dependencies is a migrated auto_set
    fn iter_collectibles_dependencies(&self) -> impl Iterator<Item = CollectiblesRef> + '_ {
        self.collectibles_dependencies()
            .into_iter()
            .flat_map(|deps| deps.iter().copied())
    }

    /// Iterate over all output dependents
    /// Uses typed storage accessor from TaskStorageAccessors trait
    fn iter_output_dependents(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.output_dependent().iter().copied()
    }

    /// Iterate over all cell dependents, returning (cell, task) pairs
    /// Uses typed storage directly - cell_dependents is a migrated auto_map
    fn iter_cell_dependents(&self) -> impl Iterator<Item = (CellId, TaskId)> + '_ {
        self.cell_dependents().into_iter().flat_map(|map| {
            map.iter()
                .flat_map(|(&cell, set)| set.iter().map(move |&task| (cell, task)))
        })
    }

    /// Iterate over all collectibles dependents, returning (collectible_type, task) pairs
    /// Uses typed storage directly - collectibles_dependents is a migrated auto_map
    fn iter_collectibles_dependents(&self) -> impl Iterator<Item = (TraitTypeId, TaskId)> + '_ {
        self.collectibles_dependents().into_iter().flat_map(|map| {
            map.iter().flat_map(|(&collectible_type, set)| {
                set.iter().map(move |&task| (collectible_type, task))
            })
        })
    }

    /// Iterate over all collectibles with their counts
    fn iter_collectibles(&self) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.collectibles()
            .into_iter()
            .flat_map(|m| m.iter().map(|(&k, &v)| (k, v)))
    }

    /// Iterate over all outdated collectibles
    fn iter_outdated_collectibles(&self) -> impl Iterator<Item = CollectibleRef> + '_ {
        self.outdated_collectibles()
            .into_iter()
            .flat_map(|m| m.keys().copied())
    }

    /// Iterate over all outdated collectibles with their values, returning (collectible, value)
    /// pairs
    fn iter_outdated_collectibles_with_values(
        &self,
    ) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.outdated_collectibles()
            .into_iter()
            .flat_map(|m| m.iter().map(|(&k, &v)| (k, v)))
    }

    /// Iterate over all aggregated collectibles (with count > 0), returning (collectible, count)
    /// pairs
    fn iter_aggregated_collectibles(&self) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.aggregated_collectibles().into_iter().flat_map(|m| {
            m.iter()
                .filter_map(|(&k, &v)| if v > 0 { Some((k, v)) } else { None })
        })
    }

    /// Iterate over all aggregated dirty containers with their counts
    fn iter_aggregated_dirty_containers(&self) -> impl Iterator<Item = (TaskId, i32)> + '_ {
        self.aggregated_dirty_containers()
            .into_iter()
            .flat_map(|map| map.iter().map(|(&k, &v)| (k, v)))
    }

    /// Iterate over all cell data entries
    fn iter_cell_data(&self) -> impl Iterator<Item = CellId> + '_ {
        self.cell_data().into_iter().flat_map(|m| m.keys().copied())
    }

    /// Iterate over all transient cell data entries
    fn iter_transient_cell_data(&self) -> impl Iterator<Item = CellId> + '_ {
        self.transient_cell_data()
            .into_iter()
            .flat_map(|m| m.keys().copied())
    }

    /// Iterate over all cell type max indices, returning (cell_type, max_index) pairs
    fn iter_cell_type_max_indices(&self) -> impl Iterator<Item = (ValueTypeId, u32)> + '_ {
        self.cell_type_max_index()
            .into_iter()
            .flat_map(|m| m.iter().map(|(&k, &v)| (k, v)))
    }

    // NOTE: Vec-returning collection getters (get_children, get_followers, etc.) were removed.
    // Callers should use iter_* methods and call .collect() if they need a Vec.

    // ============ Extract-If APIs ============
    // These remove items matching the predicate from the typed storage

    /// Remove cell data matching the predicate.
    fn remove_cell_data_if<F>(&mut self, f: F)
    where
        F: FnMut(&CellId) -> bool;

    /// Remove transient cell data matching the predicate.
    fn remove_transient_cell_data_if<F>(&mut self, f: F)
    where
        F: FnMut(&CellId) -> bool;

    /// Remove in-progress cells matching the predicate, notifying waiters.
    fn remove_in_progress_cells_if<F>(&mut self, f: F)
    where
        F: FnMut(&CellId, &InProgressCellState) -> bool;

    // ============ Memory Management APIs ============
    // shrink_to_fit is provided by the TaskStorageAccessors trait
}

pub struct TaskGuardImpl<'a, B: BackingStorage> {
    task_id: TaskId,
    task: StorageWriteGuard<'a>,
    backend: &'a TurboTasksBackendInner<B>,
    #[cfg(debug_assertions)]
    category: TaskDataCategory,
    #[cfg(debug_assertions)]
    active_task_locks: Arc<std::sync::atomic::AtomicU8>,
}

#[cfg(debug_assertions)]
impl<B: BackingStorage> Drop for TaskGuardImpl<'_, B> {
    fn drop(&mut self) {
        self.active_task_locks.fetch_sub(1, Ordering::AcqRel);
    }
}

impl<B: BackingStorage> Debug for TaskGuardImpl<'_, B> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut d = f.debug_struct("TaskGuard");
        d.field("task_id", &self.task_id);
        if let Some(task_type) = self.backend.task_cache.lookup_reverse(&self.task_id) {
            d.field("task_type", &task_type);
        };
        d.field("storage", self.task.typed());
        d.finish()
    }
}

impl<B: BackingStorage> TaskGuard for TaskGuardImpl<'_, B> {
    fn id(&self) -> TaskId {
        self.task_id
    }

    fn remove_cell_data_if<F>(&mut self, mut f: F)
    where
        F: FnMut(&CellId) -> bool,
    {
        // Uses cell_data() and cell_data_mut() accessors
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
        }
        // Collect items to remove first, then remove them
        let to_remove: Vec<_> = self
            .cell_data()
            .into_iter()
            .flat_map(|m| m.keys())
            .filter(|cell| f(cell))
            .copied()
            .collect();

        let map = self.cell_data_mut();
        for cell in to_remove {
            map.remove(&cell);
        }
    }

    fn remove_transient_cell_data_if<F>(&mut self, mut f: F)
    where
        F: FnMut(&CellId) -> bool,
    {
        // Uses transient_cell_data() and transient_cell_data_mut() accessors
        // transient cell data doesn't track modification (it's transient)
        // Collect items to remove first, then remove them
        let to_remove: Vec<_> = self
            .transient_cell_data()
            .into_iter()
            .flat_map(|m| m.keys())
            .filter(|cell| f(cell))
            .copied()
            .collect();

        let map = self.transient_cell_data_mut();
        for cell in to_remove {
            map.remove(&cell);
        }
    }

    fn remove_in_progress_cells_if<F>(&mut self, mut f: F)
    where
        F: FnMut(&CellId, &InProgressCellState) -> bool,
    {
        // Uses in_progress_cells() and in_progress_cells_mut() accessors
        // in_progress_cells is transient, doesn't track modification
        // Collect items to remove first, then remove them
        let to_remove: Vec<_> = self
            .in_progress_cells()
            .into_iter()
            .flat_map(|m| m.iter())
            .filter(|(cell, state)| f(cell, state))
            .map(|(cell, _)| *cell)
            .collect();

        let map = self.in_progress_cells_mut();
        for cell in to_remove {
            map.remove(&cell);
        }
    }

    fn invalidate_serialization(&mut self) {
        // TODO this causes race conditions, since we never know when a value is changed. We can't
        // "snapshot" the value correctly.
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
            self.task.track_modification(SpecificTaskDataCategory::Meta);
        }
    }

    fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, bool>> {
        if !self.task.flags().prefetched() {
            self.task.flags_mut().set_prefetched(true);
            // Uses typed storage iterators - dependencies are migrated auto_sets
            let map = self
                .iter_output_dependencies()
                .map(|target| (target, false))
                .chain(
                    self.iter_cell_dependencies()
                        .map(|target| (target.task, true)),
                )
                .chain(
                    self.iter_collectibles_dependencies()
                        .map(|target| (target.task, true)),
                )
                .collect::<FxIndexMap<_, _>>();
            if map.len() > 16 {
                return Some(map);
            }
        }
        None
    }

    fn is_immutable(&self) -> bool {
        // Uses typed storage accessor from TaskStorageAccessors trait
        self.immutable()
    }

    fn add_output_dependent(&mut self, task: TaskId) -> bool {
        // Check if already exists before tracking modification
        // Uses output_dependent() accessor
        if self.output_dependent().contains(&task) {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
        }
        self.output_dependent_mut().insert(task)
    }

    fn remove_output_dependent(&mut self, task: TaskId) -> bool {
        // Check if exists before tracking modification
        // Uses output_dependent() accessor
        if !self.output_dependent().contains(&task) {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
        }
        self.output_dependent_mut().remove(&task)
    }

    fn add_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool {
        // Check if already exists before tracking modification
        // Uses cell_dependents() accessor
        if self
            .cell_dependents()
            .is_some_and(|m| m.get(&cell).is_some_and(|s| s.contains(&task)))
        {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
        }
        self.cell_dependents_mut()
            .entry(cell)
            .or_default()
            .insert(task)
    }

    fn remove_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool {
        // Check if exists before tracking modification
        // Uses cell_dependents() accessor
        let exists = self
            .cell_dependents()
            .is_some_and(|m| m.get(&cell).is_some_and(|s| s.contains(&task)));
        if !exists {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
        }
        let map = self.cell_dependents_mut();
        if let Some(set) = map.get_mut(&cell) {
            let removed = set.remove(&task);
            // Clean up empty sets
            if set.is_empty() {
                map.remove(&cell);
            }
            removed
        } else {
            false
        }
    }

    fn add_collectibles_dependent(&mut self, collectible_type: TraitTypeId, task: TaskId) -> bool {
        // Check if already exists before tracking modification
        // Uses collectibles_dependents() accessor
        if self
            .collectibles_dependents()
            .is_some_and(|m| m.get(&collectible_type).is_some_and(|s| s.contains(&task)))
        {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Meta);
        }
        self.collectibles_dependents_mut()
            .entry(collectible_type)
            .or_default()
            .insert(task)
    }

    fn remove_collectibles_dependent(
        &mut self,
        collectible_type: TraitTypeId,
        task: TaskId,
    ) -> bool {
        // Check if exists before tracking modification
        // Uses collectibles_dependents() accessor
        let exists = self
            .collectibles_dependents()
            .is_some_and(|m| m.get(&collectible_type).is_some_and(|s| s.contains(&task)));
        if !exists {
            return false;
        }
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Meta);
        }
        let map = self.collectibles_dependents_mut();
        if let Some(set) = map.get_mut(&collectible_type) {
            let removed = set.remove(&task);
            // Clean up empty sets
            if set.is_empty() {
                map.remove(&collectible_type);
            }
            removed
        } else {
            false
        }
    }

    // ============ Execution fields (lazy) ============
    // Note: activeness and in_progress are transient fields, so no `check_category` call
    // is needed - transient fields are never persisted and can be accessed regardless
    // of how the task was accessed.
    //
    // These fields use lazy storage where the Vec<LazyField> presence provides optionality.
    // The LazyField variants hold the value directly (T), not Option<T>.

    fn get_activeness_mut(&mut self) -> Option<&mut ActivenessState> {
        // Access the typed storage directly - activeness is a lazy field
        let typed = self.typed_mut(SpecificTaskDataCategory::Meta);
        // For lazy direct fields, the Vec<LazyField> provides optionality
        // LazyField::Activeness contains ActivenessState directly
        typed.find_lazy_mut(|f| match f {
            crate::backend::storage_schema::LazyField::Activeness(v) => Some(v),
            _ => None,
        })
    }

    fn get_activeness_mut_or_insert_with<F>(&mut self, f: F) -> &mut ActivenessState
    where
        F: FnOnce() -> ActivenessState,
    {
        // Access the typed storage directly - activeness is a lazy field
        let typed = self.typed_mut(SpecificTaskDataCategory::Meta);
        // Check if we already have the field
        let has_value = typed.get_activeness().is_some();
        if !has_value {
            typed.set_activeness(f());
        }
        // Now get it mutably
        typed
            .find_lazy_mut(|field| match field {
                crate::backend::storage_schema::LazyField::Activeness(v) => Some(v),
                _ => None,
            })
            .expect("activeness should exist after set")
    }

    fn get_in_progress_mut(&mut self) -> Option<&mut InProgressState> {
        // Access the typed storage directly - in_progress is a lazy field
        let typed = self.typed_mut(SpecificTaskDataCategory::Meta);
        // LazyField::InProgress contains InProgressState directly
        typed.find_lazy_mut(|f| match f {
            crate::backend::storage_schema::LazyField::InProgress(v) => Some(v),
            _ => None,
        })
    }

    fn add_in_progress(&mut self, value: InProgressState) -> bool {
        // Check if already present - in_progress is a lazy field
        let typed = self.typed_mut(SpecificTaskDataCategory::Meta);
        // Check if the in_progress lazy field exists (has_in_progress checks Vec presence)
        if typed.get_in_progress().is_some() {
            false
        } else {
            typed.set_in_progress(value);
            true
        }
    }
}

impl<B: BackingStorage> TaskStorageAccessors for TaskGuardImpl<'_, B> {
    fn typed(&self) -> &crate::backend::storage_schema::TypedStorage {
        self.task.typed()
    }

    fn typed_mut(
        &mut self,
        category: SpecificTaskDataCategory,
    ) -> &mut crate::backend::storage_schema::TypedStorage {
        // Track modification for the category
        if !self.task_id.is_transient() {
            self.task.track_modification(category);
        }
        self.task.typed_mut()
    }

    #[inline]
    #[track_caller]
    fn check_access(&self, _category: TaskDataCategory) {
        #[cfg(debug_assertions)]
        {
            match _category {
                TaskDataCategory::All => {
                    // This category is used for non-persisted/transient data - no check needed
                }
                TaskDataCategory::Data | TaskDataCategory::Meta => {
                    debug_assert!(
                        self.category == _category || self.category == TaskDataCategory::All,
                        "To access {:?} data of task {:?}, the task needs to be accessed with \
                         that category (it was accessed with {:?})",
                        _category,
                        self.task_id,
                        self.category
                    );
                }
            }
        }
    }
}

macro_rules! impl_operation {
    ($name:ident $type_path:path) => {
        impl From<$type_path> for AnyOperation {
            fn from(op: $type_path) -> Self {
                AnyOperation::$name(op)
            }
        }

        impl TryFrom<AnyOperation> for $type_path {
            type Error = ();

            fn try_from(op: AnyOperation) -> Result<Self, Self::Error> {
                match op {
                    AnyOperation::$name(op) => Ok(op),
                    _ => Err(()),
                }
            }
        }

        pub use $type_path;
    };
}

#[derive(Encode, Decode, Clone)]
pub enum AnyOperation {
    ConnectChild(connect_child::ConnectChildOperation),
    Invalidate(invalidate::InvalidateOperation),
    UpdateCell(update_cell::UpdateCellOperation),
    CleanupOldEdges(cleanup_old_edges::CleanupOldEdgesOperation),
    AggregationUpdate(aggregation_update::AggregationUpdateQueue),
    Nested(Vec<AnyOperation>),
}

impl AnyOperation {
    pub fn execute(self, ctx: &mut impl ExecuteContext) {
        match self {
            AnyOperation::ConnectChild(op) => op.execute(ctx),
            AnyOperation::Invalidate(op) => op.execute(ctx),
            AnyOperation::UpdateCell(op) => op.execute(ctx),
            AnyOperation::CleanupOldEdges(op) => op.execute(ctx),
            AnyOperation::AggregationUpdate(op) => op.execute(ctx),
            AnyOperation::Nested(ops) => {
                for op in ops {
                    op.execute(ctx);
                }
            }
        }
    }
}

impl_operation!(ConnectChild connect_child::ConnectChildOperation);
impl_operation!(Invalidate invalidate::InvalidateOperation);
impl_operation!(UpdateCell update_cell::UpdateCellOperation);
impl_operation!(CleanupOldEdges cleanup_old_edges::CleanupOldEdgesOperation);
impl_operation!(AggregationUpdate aggregation_update::AggregationUpdateQueue);

#[cfg(feature = "trace_task_dirty")]
pub use self::invalidate::TaskDirtyCause;
pub use self::{
    aggregation_update::{
        AggregatedDataUpdate, AggregationUpdateJob, ComputeDirtyAndCleanUpdate,
        get_aggregation_number, get_uppers, is_aggregating_node, is_root_node,
    },
    cleanup_old_edges::OutdatedEdge,
    connect_children::connect_children,
    invalidate::make_task_dirty_internal,
    prepare_new_children::prepare_new_children,
    update_collectible::UpdateCollectibleOperation,
};
