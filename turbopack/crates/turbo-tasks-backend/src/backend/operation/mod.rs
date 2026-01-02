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
    CellId, FxIndexMap, KeyValuePair, SharedReference, TaskExecutionReason, TaskId, TraitTypeId,
    TurboTasksBackendApi, TypedSharedReference, ValueTypeId,
};

use crate::{
    backend::{
        OperationGuard, TaskDataCategory, TransientTask, TurboTasksBackend, TurboTasksBackendInner,
        TurboTasksBackendJob,
        storage::{
            SpecificTaskDataCategory, StorageWriteGuard, get, get_mut, get_mut_or_insert_with,
            iter_many, remove, update, update_count, update_count_and_get,
        },
    },
    backing_storage::BackingStorage,
    data::{
        ActivenessState, AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut, CellRef,
        CollectibleRef, CollectiblesRef, Dirtyness, InProgressCellState, InProgressState,
        OutputValue,
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

    fn restore_task_data(
        &mut self,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Vec<CachedDataItem> {
        if matches!(self.transaction, TransactionState::None) {
            let check_backing_storage = self.backend.should_restore()
                && self.backend.local_is_partial.load(Ordering::Acquire);
            if !check_backing_storage {
                // If we don't need to restore, we can just return an empty vector
                return Vec::new();
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
        let result = unsafe {
            self.backend
                .backing_storage
                .lookup_data(tx, task_id, category)
        };
        match result {
            Ok(data) => data,
            Err(e) => {
                let task_name = self.backend.get_task_description(task_id);
                panic!(
                    "Failed to restore task data (corrupted database or bug): {:?}",
                    e.context(format!("{category:?} for {task_name} ({task_id}))"))
                )
            }
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
        if !task.state().is_restored(category) {
            if task_id.is_transient() {
                task.state_mut().set_restored(TaskDataCategory::All);
            } else {
                for category in category {
                    if !task.state().is_restored(category) {
                        // Avoid holding the lock too long since this can also affect other tasks
                        drop(task);

                        let items = self.restore_task_data(task_id, category);
                        task = self.backend.storage.access_mut(task_id);
                        if !task.state().is_restored(category) {
                            for item in items {
                                task.add(item);
                            }
                            task.state_mut().set_restored(category);
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
        let is_restored1 = task1.state().is_restored(category);
        let is_restored2 = task2.state().is_restored(category);
        if !is_restored1 || !is_restored2 {
            for category in category {
                // Avoid holding the lock too long since this can also affect other tasks
                drop(task1);
                drop(task2);

                let items1 = (!is_restored1).then(|| self.restore_task_data(task_id1, category));
                let items2 = (!is_restored2).then(|| self.restore_task_data(task_id2, category));

                let (t1, t2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
                task1 = t1;
                task2 = t2;
                if !task1.state().is_restored(category) {
                    for item in items1.unwrap() {
                        task1.add(item);
                    }
                    task1.state_mut().set_restored(category);
                }
                if !task2.state().is_restored(category) {
                    for item in items2.unwrap() {
                        task2.add(item);
                    }
                    task2.state_mut().set_restored(category);
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

pub trait TaskGuard: Debug {
    fn id(&self) -> TaskId;

    // ============ Generic CachedDataItem APIs - FOR SERIALIZATION/INTERNAL USE ONLY ============
    // These methods provide low-level access to CachedDataItem. They should ONLY be used for:
    // 1. Serialization/deserialization (restore_task_data paths)
    // 2. As implementation details within typed APIs
    // All other code should use the typed APIs below instead.

    /// Adds a new item to the task if the key is not already present.
    /// Returns `true` if the item was added.
    /// Returns `false` if an item with the same key was already present.
    ///
    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    #[must_use]
    fn add_internal(&mut self, item: CachedDataItem) -> bool;

    /// Adds a new item to the task. The key must not be already present.
    /// Might panic if the key is already present.
    ///
    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn add_new_internal(&mut self, item: CachedDataItem);

    /// Extends the task with items from the iterator.
    /// Overwrites existing keys.
    /// Returns `true` if all items were new and added.
    /// Returns `false` if any item had a key that was already present.
    ///
    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn extend_internal(
        &mut self,
        ty: CachedDataItemType,
        items: impl Iterator<Item = CachedDataItem>,
    ) -> bool;

    /// Extends the task with items from the iterator.
    /// Might panic if any item has a key that is already present.
    ///
    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn extend_new_internal(
        &mut self,
        ty: CachedDataItemType,
        items: impl Iterator<Item = CachedDataItem>,
    );

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn insert_internal(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn update_internal(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    );

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn remove_internal(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn get_internal(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn get_mut_internal(
        &mut self,
        key: &CachedDataItemKey,
    ) -> Option<CachedDataItemValueRefMut<'_>>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn get_mut_or_insert_with_internal(
        &mut self,
        key: CachedDataItemKey,
        insert: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn has_key_internal(&self, key: &CachedDataItemKey) -> bool;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn count_internal(&self, ty: CachedDataItemType) -> usize;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn iter_internal(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)>;

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn shrink_to_fit_internal(&mut self, ty: CachedDataItemType);

    /// **FOR INTERNAL USE ONLY** - Use typed APIs instead.
    fn extract_if_internal<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l;

    // ============ Typed Child APIs ============

    /// Check if a task is a child of this task
    fn has_child(&self, task: TaskId) -> bool {
        self.has_key_internal(&CachedDataItemKey::Child { task })
    }

    /// Remove a child from this task
    /// Returns true if the child was present and removed
    fn remove_child(&mut self, task: TaskId) -> bool {
        self.remove_internal(&CachedDataItemKey::Child { task })
            .is_some()
    }

    /// Add children in bulk. All children must be new (not already present).
    ///
    /// # Panics
    ///
    /// Panics if any child is already present.
    fn add_children(&mut self, children: impl Iterator<Item = TaskId>) {
        self.extend_new_internal(
            CachedDataItemType::Child,
            children.map(|task| CachedDataItem::Child { task, value: () }),
        )
    }

    // ============ Typed OutputDependency APIs ============

    /// Check if this task has an output dependency on another task
    fn has_output_dependency(&self, target: TaskId) -> bool {
        self.has_key_internal(&CachedDataItemKey::OutputDependency { target })
    }

    /// Remove an output dependency from this task
    /// Returns true if the dependency was present and removed
    fn remove_output_dependency(&mut self, target: TaskId) -> bool {
        self.remove_internal(&CachedDataItemKey::OutputDependency { target })
            .is_some()
    }

    /// Add an output dependency to this task
    /// Returns true if the dependency was newly added, false if it already existed
    fn add_output_dependency(&mut self, target: TaskId) -> bool {
        self.add_internal(CachedDataItem::OutputDependency { target, value: () })
    }

    // ============ Typed CellDependency APIs ============

    /// Check if this task has a cell dependency on another task's cell
    fn has_cell_dependency(&self, target: CellRef) -> bool {
        self.has_key_internal(&CachedDataItemKey::CellDependency { target })
    }

    /// Remove a cell dependency from this task
    /// Returns true if the dependency was present and removed
    fn remove_cell_dependency(&mut self, target: CellRef) -> bool {
        self.remove_internal(&CachedDataItemKey::CellDependency { target })
            .is_some()
    }

    /// Add a cell dependency to this task
    /// Returns true if the dependency was newly added, false if it already existed
    #[must_use]
    fn add_cell_dependency(&mut self, target: CellRef) -> bool {
        self.add_internal(CachedDataItem::CellDependency { target, value: () })
    }

    // ============ Typed OutputDependent APIs ============

    /// Remove an output dependent from this task
    /// Returns true if the dependent was present and removed
    fn remove_output_dependent(&mut self, task: TaskId) -> bool {
        self.remove_internal(&CachedDataItemKey::OutputDependent { task })
            .is_some()
    }

    /// Add an output dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    #[must_use]
    fn add_output_dependent(&mut self, task: TaskId) -> bool {
        self.add_internal(CachedDataItem::OutputDependent { task, value: () })
    }

    // ============ Typed CellDependent APIs ============

    /// Remove a cell dependent from this task
    /// Returns true if the dependent was present and removed
    fn remove_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool {
        self.remove_internal(&CachedDataItemKey::CellDependent { cell, task })
            .is_some()
    }

    /// Add a cell dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    #[must_use]
    fn add_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool {
        self.add_internal(CachedDataItem::CellDependent {
            cell,
            task,
            value: (),
        })
    }

    // ============ Typed CollectiblesDependent APIs ============

    /// Remove a collectibles dependent from this task
    /// Returns true if the dependent was present and removed
    fn remove_collectibles_dependent(
        &mut self,
        collectible_type: TraitTypeId,
        task: TaskId,
    ) -> bool {
        self.remove_internal(&CachedDataItemKey::CollectiblesDependent {
            collectible_type,
            task,
        })
        .is_some()
    }

    /// Add a collectibles dependent to this task
    /// Returns true if the dependent was newly added, false if it already existed
    #[must_use]
    fn add_collectibles_dependent(&mut self, collectible_type: TraitTypeId, task: TaskId) -> bool {
        self.add_internal(CachedDataItem::CollectiblesDependent {
            collectible_type,
            task,
            value: (),
        })
    }

    // ============ Typed CollectiblesDependency APIs ============

    /// Remove a collectibles dependency from this task
    /// Returns true if the dependency was present and removed
    fn remove_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.remove_internal(&CachedDataItemKey::CollectiblesDependency { target })
            .is_some()
    }

    /// Add a collectibles dependency to this task
    /// Returns true if the dependency was newly added, false if it already existed
    #[must_use]
    fn add_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.add_internal(CachedDataItem::CollectiblesDependency { target, value: () })
    }

    // ============ Typed Marker APIs ============

    /// Mark this task as stateful
    /// Returns true if the marker was newly added, false if it already existed
    fn mark_stateful(&mut self) -> bool {
        self.add_internal(CachedDataItem::Stateful { value: () })
    }

    /// Mark this task as having an invalidator
    /// Returns true if the marker was newly added, false if it already existed
    #[must_use]
    fn mark_has_invalidator(&mut self) -> bool {
        self.add_internal(CachedDataItem::HasInvalidator { value: () })
    }

    /// Mark this task as immutable
    /// Returns true if the marker was newly added, false if it already existed
    #[must_use]
    fn mark_immutable(&mut self) -> bool {
        self.add_internal(CachedDataItem::Immutable { value: () })
    }

    // State field accessors

    /// Get reference to the output value (if present)
    fn get_output_ref(&self) -> Option<&OutputValue> {
        get!(self, Output)
    }

    /// Check if this task has an output
    fn has_output(&self) -> bool {
        self.has_key_internal(&CachedDataItemKey::Output {})
    }

    /// Set the output value, returning the old value if present
    fn set_output(&mut self, value: OutputValue) -> Option<OutputValue> {
        self.insert_internal(CachedDataItem::Output { value })
            .and_then(|old| match old {
                CachedDataItemValue::Output { value } => Some(value),
                _ => None,
            })
    }

    /// Get the current dirty state
    fn get_dirty(&self) -> Option<&Dirtyness> {
        get!(self, Dirty)
    }

    /// Set the dirty state, returning the old state if present
    fn set_dirty(&mut self, value: Dirtyness) -> Option<Dirtyness> {
        self.insert_internal(CachedDataItem::Dirty { value })
            .and_then(|old| match old {
                CachedDataItemValue::Dirty { value } => Some(value),
                _ => None,
            })
    }

    /// Clear the dirty state, returning the old state if present
    fn clear_dirty(&mut self) -> Option<Dirtyness> {
        self.remove_internal(&CachedDataItemKey::Dirty {})
            .and_then(|old| match old {
                CachedDataItemValue::Dirty { value } => Some(value),
                _ => None,
            })
    }

    /// Check if this task is marked as clean in the current session
    fn is_current_session_clean(&self) -> bool {
        get!(self, CurrentSessionClean).is_some()
    }

    /// Mark this task as clean in the current session
    /// Returns true if it was newly marked, false if already marked
    fn mark_current_session_clean(&mut self) -> bool {
        self.add_internal(CachedDataItem::CurrentSessionClean { value: () })
    }

    /// Clear the current session clean marker
    /// Returns true if it was cleared, false if it wasn't marked
    fn clear_current_session_clean(&mut self) -> bool {
        self.remove_internal(&CachedDataItemKey::CurrentSessionClean {})
            .is_some()
    }

    // Counter field accessors

    /// Get the aggregation number
    fn get_aggregation_number_ref(&self) -> Option<&AggregationNumber> {
        get!(self, AggregationNumber)
    }

    /// Set the aggregation number, returning the old value if present
    fn set_aggregation_number(&mut self, value: AggregationNumber) -> Option<AggregationNumber> {
        self.insert_internal(CachedDataItem::AggregationNumber { value })
            .and_then(|old| match old {
                CachedDataItemValue::AggregationNumber { value } => Some(value),
                _ => None,
            })
    }

    /// Update an Upper counter for a task by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_upper_count(&mut self, task: TaskId, delta: u32) -> bool {
        update_count!(self, Upper { task }, delta)
    }

    /// Remove an Upper entry for a task, returning the count if present
    fn remove_upper(&mut self, task: TaskId) -> Option<u32> {
        remove!(self, Upper { task })
    }

    /// Update an Upper entry for a task with a closure
    fn update_upper<F>(&mut self, task: TaskId, f: F)
    where
        F: FnOnce(Option<u32>) -> Option<u32>,
    {
        update!(self, Upper { task }, f)
    }

    /// Add a new Upper entry (used when adding new uppers)
    ///
    /// # Panics
    ///
    /// Panics if the entry already exists.
    fn add_upper(&mut self, task: TaskId, count: u32) {
        self.add_new_internal(CachedDataItem::Upper { task, value: count })
    }

    /// Update a Follower counter for a task by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_follower_count(&mut self, task: TaskId, delta: u32) -> bool {
        update_count!(self, Follower { task }, delta)
    }

    /// Remove a Follower entry for a task, returning the count if present
    fn remove_follower(&mut self, task: TaskId) -> Option<u32> {
        remove!(self, Follower { task })
    }

    /// Update a Follower entry for a task with a closure
    fn update_follower<F>(&mut self, task: TaskId, f: F)
    where
        F: FnOnce(Option<u32>) -> Option<u32>,
    {
        update!(self, Follower { task }, f)
    }

    /// Add a new Follower entry (used when adding new followers)
    ///
    /// # Panics
    ///
    /// Panics if the entry already exists.
    fn add_follower(&mut self, task: TaskId, count: u32) {
        self.add_new_internal(CachedDataItem::Follower { task, value: count })
    }

    /// Update a Collectible counter for a collectible by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_collectible_count(&mut self, collectible: CollectibleRef, delta: i32) -> bool {
        update_count!(self, Collectible { collectible }, delta)
    }

    /// Update an OutdatedCollectible counter for a collectible by the given delta.
    ///
    /// Returns `true` if the update caused the count to cross zero (i.e., the sign changed,
    /// or the count became zero/non-zero), `false` otherwise. This is useful for tracking
    /// state transitions where crossing zero indicates a significant change.
    #[must_use]
    fn update_outdated_collectible_count(
        &mut self,
        collectible: CollectibleRef,
        delta: i32,
    ) -> bool {
        update_count!(self, OutdatedCollectible { collectible }, delta)
    }

    /// Check if this task has activeness tracking
    #[must_use]
    fn has_activeness(&self) -> bool {
        self.get_activeness().is_some()
    }

    /// Get the activeness state
    fn get_activeness(&self) -> Option<&ActivenessState> {
        get!(self, Activeness)
    }

    /// Get mutable reference to the activeness state
    fn get_activeness_mut(&mut self) -> Option<&mut ActivenessState> {
        get_mut!(self, Activeness)
    }

    /// Get mutable reference to the activeness state, inserting a new one if not present
    fn get_activeness_mut_or_insert_with<F>(&mut self, f: F) -> &mut ActivenessState
    where
        F: FnOnce() -> ActivenessState,
    {
        get_mut_or_insert_with!(self, Activeness, f)
    }

    /// Set the activeness state, returning the old state if present
    fn set_activeness(&mut self, value: ActivenessState) -> Option<ActivenessState> {
        self.insert_internal(CachedDataItem::Activeness { value })
            .and_then(|old| match old {
                CachedDataItemValue::Activeness { value } => Some(value),
                _ => None,
            })
    }

    /// Clear the activeness state, returning the old state if present
    fn clear_activeness(&mut self) -> Option<ActivenessState> {
        remove!(self, Activeness)
    }

    /// Get the in-progress state
    fn get_in_progress(&self) -> Option<&InProgressState> {
        get!(self, InProgress)
    }

    /// Get mutable reference to the in-progress state
    fn get_in_progress_mut(&mut self) -> Option<&mut InProgressState> {
        get_mut!(self, InProgress)
    }

    /// Remove the in-progress state, returning the old state if present
    fn remove_in_progress(&mut self) -> Option<InProgressState> {
        remove!(self, InProgress)
    }

    /// Get the in-progress cell state for a specific cell
    fn get_in_progress_cell(&self, cell: CellId) -> Option<&InProgressCellState> {
        get!(self, InProgressCell { cell })
    }

    /// Remove the in-progress cell state for a specific cell, returning the old state if present
    fn remove_in_progress_cell(&mut self, cell: CellId) -> Option<InProgressCellState> {
        remove!(self, InProgressCell { cell })
    }

    /// Get current session clean marker
    fn get_current_session_clean(&self) -> Option<()> {
        get!(self, CurrentSessionClean).map(|_| ())
    }

    /// Get transient cell data for a specific cell
    fn get_transient_cell_data(&self, cell: CellId) -> Option<&SharedReference> {
        get!(self, TransientCellData { cell })
    }

    /// Get aggregated dirty container count
    fn get_aggregated_dirty_container_count(&self) -> Option<&i32> {
        get!(self, AggregatedDirtyContainerCount)
    }

    /// Update aggregated dirty container count by the given delta and return the new count.
    ///
    /// Unlike `update_*_count` methods which return a bool indicating zero-crossing,
    /// this method returns the actual new count value after the update.
    fn update_and_get_aggregated_dirty_container_count(&mut self, delta: i32) -> i32 {
        update_count_and_get!(self, AggregatedDirtyContainerCount, delta)
    }
    /// Get aggregated current session clean container count
    fn get_aggregated_current_session_clean_container_count(&self) -> Option<&i32> {
        get!(self, AggregatedCurrentSessionCleanContainerCount)
    }

    /// Update aggregated current session clean container count by the given delta and return the
    /// new count.
    ///
    /// Unlike `update_*_count` methods which return a bool indicating zero-crossing,
    /// this method returns the actual new count value after the update.
    fn update_and_get_aggregated_current_session_clean_container_count(
        &mut self,
        delta: i32,
    ) -> i32 {
        update_count_and_get!(self, AggregatedCurrentSessionCleanContainerCount, delta)
    }

    /// Get aggregated dirty container count for a specific task
    fn get_aggregated_dirty_container(&self, task: TaskId) -> Option<&i32> {
        get!(self, AggregatedDirtyContainer { task })
    }

    /// Update aggregated dirty container count for a specific task by the given delta and return
    /// the new count.
    ///
    /// Unlike `update_*_count` methods which return a bool indicating zero-crossing,
    /// this method returns the actual new count value after the update.
    fn update_and_get_aggregated_dirty_container(&mut self, task: TaskId, delta: i32) -> i32 {
        update_count_and_get!(self, AggregatedDirtyContainer { task }, delta)
    }

    /// Get aggregated current session clean container count for a specific task
    fn get_aggregated_current_session_clean_container(&self, task: TaskId) -> Option<&i32> {
        get!(self, AggregatedCurrentSessionCleanContainer { task })
    }

    /// Update aggregated current session clean container count for a specific task by the given
    /// delta and return the new count.
    ///
    /// Unlike `update_*_count` methods which return a bool indicating zero-crossing,
    /// this method returns the actual new count value after the update.
    fn update_and_get_aggregated_current_session_clean_container(
        &mut self,
        task: TaskId,
        delta: i32,
    ) -> i32 {
        update_count_and_get!(self, AggregatedCurrentSessionCleanContainer { task }, delta)
    }

    /// Get aggregated collectible count for a specific collectible
    fn get_aggregated_collectible(&self, collectible: CollectibleRef) -> Option<&i32> {
        get!(self, AggregatedCollectible { collectible })
    }

    /// Update aggregated collectible count for a specific collectible with a closure
    fn update_aggregated_collectible<F>(&mut self, collectible: CollectibleRef, f: F)
    where
        F: FnOnce(Option<i32>) -> Option<i32>,
    {
        update!(self, AggregatedCollectible { collectible }, f)
    }

    /// Get outdated collectible count for a specific collectible
    fn get_outdated_collectible(&self, collectible: CollectibleRef) -> Option<&i32> {
        get!(self, OutdatedCollectible { collectible })
    }

    /// Get cell type max index for a specific cell type
    fn get_cell_type_max_index(&self, cell_type: ValueTypeId) -> Option<&u32> {
        get!(self, CellTypeMaxIndex { cell_type })
    }

    /// Count the number of followers
    fn count_followers(&self) -> usize {
        self.count_internal(CachedDataItemType::Follower)
    }

    /// Count the number of uppers
    fn count_uppers(&self) -> usize {
        self.count_internal(CachedDataItemType::Upper)
    }

    /// Count the number of children
    fn count_children(&self) -> usize {
        self.count_internal(CachedDataItemType::Child)
    }

    /// Count the number of collectibles
    fn count_collectibles(&self) -> usize {
        self.count_internal(CachedDataItemType::Collectible)
    }

    /// Count the number of outdated collectibles
    fn count_outdated_collectibles(&self) -> usize {
        self.count_internal(CachedDataItemType::OutdatedCollectible)
    }

    /// Count the number of collectibles dependencies
    fn count_collectibles_dependencies(&self) -> usize {
        self.count_internal(CachedDataItemType::CollectiblesDependency)
    }

    fn invalidate_serialization(&mut self);
    fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, bool>>;
    fn is_immutable(&self) -> bool;
    fn is_dirty(&self) -> bool {
        get!(self, Dirty).is_some_and(|dirtyness| match dirtyness {
            Dirtyness::Dirty => true,
            Dirtyness::SessionDependent => get!(self, CurrentSessionClean).is_none(),
        })
    }
    fn dirtyness_and_session(&self) -> Option<(Dirtyness, bool)> {
        match get!(self, Dirty)? {
            Dirtyness::Dirty => Some((Dirtyness::Dirty, false)),
            Dirtyness::SessionDependent => Some((
                Dirtyness::SessionDependent,
                get!(self, CurrentSessionClean).is_some(),
            )),
        }
    }
    /// Returns (is_dirty, is_clean_in_current_session)
    fn dirty(&self) -> (bool, bool) {
        match get!(self, Dirty) {
            None => (false, false),
            Some(Dirtyness::Dirty) => (true, false),
            Some(Dirtyness::SessionDependent) => (true, get!(self, CurrentSessionClean).is_some()),
        }
    }
    fn dirty_containers(&self) -> impl Iterator<Item = TaskId> {
        self.dirty_containers_with_count()
            .map(|(task_id, _)| task_id)
    }
    fn dirty_containers_with_count(&self) -> impl Iterator<Item = (TaskId, i32)> {
        iter_many!(self, AggregatedDirtyContainer { task } count => (task, *count)).filter(
            move |&(task_id, count)| {
                if count > 0 {
                    let clean_count = get!(
                        self,
                        AggregatedCurrentSessionCleanContainer { task: task_id }
                    )
                    .copied()
                    .unwrap_or_default();
                    count > clean_count
                } else {
                    false
                }
            },
        )
    }

    fn has_dirty_containers(&self) -> bool {
        let dirty_count = get!(self, AggregatedDirtyContainerCount)
            .copied()
            .unwrap_or_default();
        if dirty_count <= 0 {
            return false;
        }
        let clean_count = get!(self, AggregatedCurrentSessionCleanContainerCount)
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
            remove!(self, CellData { cell })
        } else {
            remove!(self, TransientCellData { cell }).map(|sr| sr.into_typed(cell.type_id))
        }
    }
    fn get_cell_data(
        &self,
        is_serializable_cell_content: bool,
        cell: CellId,
    ) -> Option<TypedSharedReference> {
        if is_serializable_cell_content {
            get!(self, CellData { cell }).cloned()
        } else {
            get!(self, TransientCellData { cell }).map(|sr| sr.clone().into_typed(cell.type_id))
        }
    }
    fn has_cell_data(&self, is_serializable_cell_content: bool, cell: CellId) -> bool {
        if is_serializable_cell_content {
            self.has_key_internal(&CachedDataItemKey::CellData { cell })
        } else {
            self.has_key_internal(&CachedDataItemKey::TransientCellData { cell })
        }
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
        self.add_internal(CachedDataItem::new_scheduled(reason, description))
    }

    // ============ Outdated Dependency APIs ============

    /// Remove an outdated output dependency
    fn remove_outdated_output_dependency(&mut self, target: TaskId) -> bool {
        self.remove_internal(&CachedDataItemKey::OutdatedOutputDependency { target })
            .is_some()
    }

    /// Remove an outdated cell dependency
    fn remove_outdated_cell_dependency(&mut self, target: CellRef) -> bool {
        self.remove_internal(&CachedDataItemKey::OutdatedCellDependency { target })
            .is_some()
    }

    /// Check if task has an outdated output dependency
    #[must_use]
    fn has_outdated_output_dependency(&self, target: TaskId) -> bool {
        self.has_key_internal(&CachedDataItemKey::OutdatedOutputDependency { target })
    }

    /// Check if task has an outdated cell dependency
    #[must_use]
    fn has_outdated_cell_dependency(&self, target: CellRef) -> bool {
        self.has_key_internal(&CachedDataItemKey::OutdatedCellDependency { target })
    }

    /// Remove an outdated collectibles dependency
    fn remove_outdated_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        self.remove_internal(&CachedDataItemKey::OutdatedCollectiblesDependency { target })
            .is_some()
    }

    /// Add multiple outdated cell dependencies at once
    fn add_outdated_cell_dependencies(
        &mut self,
        dependencies: impl Iterator<Item = CellRef>,
    ) -> bool {
        self.extend_internal(
            CachedDataItemType::OutdatedCellDependency,
            dependencies.map(|target| CachedDataItem::OutdatedCellDependency { target, value: () }),
        )
    }

    /// Add multiple outdated output dependencies at once
    fn add_outdated_output_dependencies(
        &mut self,
        dependencies: impl Iterator<Item = TaskId>,
    ) -> bool {
        self.extend_internal(
            CachedDataItemType::OutdatedOutputDependency,
            dependencies
                .map(|target| CachedDataItem::OutdatedOutputDependency { target, value: () }),
        )
    }

    // ============ Collectible APIs ============

    /// Insert an outdated collectible with count. Returns true if it was newly inserted.
    #[must_use]
    fn insert_outdated_collectible(&mut self, collectible: CollectibleRef, value: i32) -> bool {
        self.insert_internal(CachedDataItem::OutdatedCollectible { collectible, value })
            .is_none()
    }

    /// Check if task has a collectible
    #[must_use]
    fn has_collectible(&self, collectible: CollectibleRef) -> bool {
        self.has_key_internal(&CachedDataItemKey::Collectible { collectible })
    }

    /// Remove an outdated collectible
    fn remove_outdated_collectible(&mut self, collectible: CollectibleRef) -> bool {
        self.remove_internal(&CachedDataItemKey::OutdatedCollectible { collectible })
            .is_some()
    }

    // ============ Dependency Bulk Operations ============

    /// Add multiple cell dependencies at once
    fn add_cell_dependencies(&mut self, dependencies: impl Iterator<Item = CellRef>) -> bool {
        self.extend_internal(
            CachedDataItemType::CellDependency,
            dependencies.map(|target| CachedDataItem::CellDependency { target, value: () }),
        )
    }

    /// Add multiple output dependencies at once
    fn add_output_dependencies(&mut self, dependencies: impl Iterator<Item = TaskId>) -> bool {
        self.extend_internal(
            CachedDataItemType::OutputDependency,
            dependencies.map(|target| CachedDataItem::OutputDependency { target, value: () }),
        )
    }

    // ============ Other APIs ============

    /// Remove cell type max index
    fn remove_cell_type_max_index(&mut self, cell_type: ValueTypeId) -> bool {
        self.remove_internal(&CachedDataItemKey::CellTypeMaxIndex { cell_type })
            .is_some()
    }

    /// Check if task has invalidator
    #[must_use]
    fn has_invalidator(&self) -> bool {
        self.has_key_internal(&CachedDataItemKey::HasInvalidator {})
    }

    // ============ Iterator APIs ============
    // These replace the iter_many! and get_many! macros with typed iterators

    /// Iterate over all child tasks
    fn iter_children(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::Child)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::Child { task } => Some(task),
                _ => None,
            })
    }

    /// Iterate over all follower tasks (with count > 0)
    fn iter_followers(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::Follower)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::Follower { task },
                    CachedDataItemValueRef::Follower { value: count },
                ) if *count > 0 => Some(task),
                _ => None,
            })
    }

    /// Iterate over all upper tasks (with count > 0)
    fn iter_uppers(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::Upper)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::Upper { task },
                    CachedDataItemValueRef::Upper { value: count },
                ) if *count > 0 => Some(task),
                _ => None,
            })
    }

    /// Iterate over all output dependencies
    fn iter_output_dependencies(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::OutputDependency)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::OutputDependency { target } => Some(target),
                _ => None,
            })
    }

    /// Iterate over all cell dependencies
    fn iter_cell_dependencies(&self) -> impl Iterator<Item = CellRef> + '_ {
        self.iter_internal(CachedDataItemType::CellDependency)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::CellDependency { target } => Some(target),
                _ => None,
            })
    }

    /// Iterate over all outdated output dependencies
    fn iter_outdated_output_dependencies(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::OutdatedOutputDependency)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::OutdatedOutputDependency { target } => Some(target),
                _ => None,
            })
    }

    /// Iterate over all outdated cell dependencies
    fn iter_outdated_cell_dependencies(&self) -> impl Iterator<Item = CellRef> + '_ {
        self.iter_internal(CachedDataItemType::OutdatedCellDependency)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::OutdatedCellDependency { target } => Some(target),
                _ => None,
            })
    }

    /// Iterate over all collectibles dependencies
    fn iter_collectibles_dependencies(&self) -> impl Iterator<Item = CollectiblesRef> + '_ {
        self.iter_internal(CachedDataItemType::CollectiblesDependency)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::CollectiblesDependency { target } => Some(target),
                _ => None,
            })
    }

    /// Iterate over all output dependents
    fn iter_output_dependents(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.iter_internal(CachedDataItemType::OutputDependent)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::OutputDependent { task } => Some(task),
                _ => None,
            })
    }

    /// Iterate over all cell dependents, returning (cell, task) pairs
    fn iter_cell_dependents(&self) -> impl Iterator<Item = (CellId, TaskId)> + '_ {
        self.iter_internal(CachedDataItemType::CellDependent)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::CellDependent { cell, task } => Some((cell, task)),
                _ => None,
            })
    }

    /// Iterate over all collectibles dependents, returning (collectible_type, task) pairs
    fn iter_collectibles_dependents(&self) -> impl Iterator<Item = (TraitTypeId, TaskId)> + '_ {
        self.iter_internal(CachedDataItemType::CollectiblesDependent)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::CollectiblesDependent {
                    collectible_type,
                    task,
                } => Some((collectible_type, task)),
                _ => None,
            })
    }

    /// Iterate over all collectibles with their counts
    fn iter_collectibles(&self) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.iter_internal(CachedDataItemType::Collectible)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::Collectible { collectible },
                    CachedDataItemValueRef::Collectible { value },
                ) => Some((collectible, *value)),
                _ => None,
            })
    }

    /// Iterate over all outdated collectibles
    fn iter_outdated_collectibles(&self) -> impl Iterator<Item = CollectibleRef> + '_ {
        self.iter_internal(CachedDataItemType::OutdatedCollectible)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::OutdatedCollectible { collectible } => Some(collectible),
                _ => None,
            })
    }

    /// Iterate over all outdated collectibles with their values, returning (collectible, value)
    /// pairs
    fn iter_outdated_collectibles_with_values(
        &self,
    ) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.iter_internal(CachedDataItemType::OutdatedCollectible)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::OutdatedCollectible { collectible },
                    CachedDataItemValueRef::OutdatedCollectible { value },
                ) => Some((collectible, *value)),
                _ => None,
            })
    }

    /// Iterate over all aggregated collectibles (with count > 0), returning (collectible, count)
    /// pairs
    fn iter_aggregated_collectibles(&self) -> impl Iterator<Item = (CollectibleRef, i32)> + '_ {
        self.iter_internal(CachedDataItemType::AggregatedCollectible)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::AggregatedCollectible { collectible },
                    CachedDataItemValueRef::AggregatedCollectible { value },
                ) if *value > 0 => Some((collectible, *value)),
                _ => None,
            })
    }

    /// Iterate over all aggregated dirty containers with their counts
    fn iter_aggregated_dirty_containers(&self) -> impl Iterator<Item = (TaskId, i32)> + '_ {
        self.iter_internal(CachedDataItemType::AggregatedDirtyContainer)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::AggregatedDirtyContainer { task },
                    CachedDataItemValueRef::AggregatedDirtyContainer { value },
                ) => Some((task, *value)),
                _ => None,
            })
    }

    /// Iterate over all cell data entries
    fn iter_cell_data(&self) -> impl Iterator<Item = CellId> + '_ {
        self.iter_internal(CachedDataItemType::CellData)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::CellData { cell } => Some(cell),
                _ => None,
            })
    }

    /// Iterate over all transient cell data entries
    fn iter_transient_cell_data(&self) -> impl Iterator<Item = CellId> + '_ {
        self.iter_internal(CachedDataItemType::TransientCellData)
            .filter_map(|(key, _)| match key {
                CachedDataItemKey::TransientCellData { cell } => Some(cell),
                _ => None,
            })
    }

    /// Iterate over all cell type max indices, returning (cell_type, max_index) pairs
    fn iter_cell_type_max_indices(&self) -> impl Iterator<Item = (ValueTypeId, u32)> + '_ {
        self.iter_internal(CachedDataItemType::CellTypeMaxIndex)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::CellTypeMaxIndex { cell_type },
                    CachedDataItemValueRef::CellTypeMaxIndex { value: max_index },
                ) => Some((cell_type, *max_index)),
                _ => None,
            })
    }

    // ============ Collection Getter APIs ============
    // These replace the get_many! macro with typed collection getters

    /// Get all child tasks as a Vec
    fn get_children(&self) -> Vec<TaskId> {
        self.iter_children().collect()
    }

    /// Get all follower tasks (with count > 0) as a Vec
    fn get_followers(&self) -> Vec<TaskId> {
        self.iter_followers().collect()
    }

    /// Get all upper tasks (with count > 0) as a Vec
    fn get_uppers(&self) -> Vec<TaskId> {
        self.iter_uppers().collect()
    }

    /// Get all output dependencies as a Vec
    fn get_output_dependencies(&self) -> Vec<TaskId> {
        self.iter_output_dependencies().collect()
    }

    /// Get all cell dependencies as a Vec
    fn get_cell_dependencies(&self) -> Vec<CellRef> {
        self.iter_cell_dependencies().collect()
    }

    /// Get all outdated output dependencies as a Vec
    fn get_outdated_output_dependencies(&self) -> Vec<TaskId> {
        self.iter_outdated_output_dependencies().collect()
    }

    /// Get all outdated cell dependencies as a Vec
    fn get_outdated_cell_dependencies(&self) -> Vec<CellRef> {
        self.iter_outdated_cell_dependencies().collect()
    }

    /// Get all output dependents as a Vec
    fn get_output_dependents(&self) -> Vec<TaskId> {
        self.iter_output_dependents().collect()
    }

    /// Get all collectibles with their counts as a Vec
    fn get_collectibles(&self) -> Vec<(CollectibleRef, i32)> {
        self.iter_collectibles().collect()
    }

    /// Get all aggregated collectibles (with count > 0) as a Vec
    fn get_aggregated_collectibles(&self) -> Vec<(CollectibleRef, i32)> {
        self.iter_aggregated_collectibles().collect()
    }

    /// Get all aggregated dirty containers with their counts as a Vec
    fn get_aggregated_dirty_containers(&self) -> Vec<(TaskId, i32)> {
        self.iter_aggregated_dirty_containers().collect()
    }

    /// Get all cell type max indices as a Vec
    fn get_cell_type_max_indices(&self) -> Vec<(ValueTypeId, u32)> {
        self.iter_cell_type_max_indices().collect()
    }

    // ============ Extract-If APIs ============
    // These replace extract_if_internal with typed filter/extract operations

    /// Extract cell data matching the predicate. Returns removed items.
    fn extract_cell_data_if<'l, F>(&'l mut self, f: F) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l;

    /// Extract transient cell data matching the predicate. Returns removed items.
    fn extract_transient_cell_data_if<'l, F>(
        &'l mut self,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l;

    /// Extract in-progress cells matching the predicate. Returns removed items.
    fn extract_in_progress_cells_if<'l, F>(
        &'l mut self,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l;

    // ============ Memory Management APIs ============

    /// Shrink all relevant storage data structures to fit their current contents.
    /// This includes cell data, dependencies, and indices.
    fn shrink_to_fit(&mut self);
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

impl<B: BackingStorage> TaskGuardImpl<'_, B> {
    /// Verify that the task guard restored the correct category
    /// before accessing the data.
    #[inline]
    #[track_caller]
    fn check_access(&self, category: TaskDataCategory) {
        {
            match category {
                TaskDataCategory::All => {
                    // This category is used for non-persisted data
                }
                TaskDataCategory::Data => {
                    #[cfg(debug_assertions)]
                    debug_assert!(
                        self.category == TaskDataCategory::Data
                            || self.category == TaskDataCategory::All,
                        "To read data of {:?} the task need to be accessed with this category \
                         (It's accessed with {:?})",
                        category,
                        self.category
                    );
                }
                TaskDataCategory::Meta => {
                    #[cfg(debug_assertions)]
                    debug_assert!(
                        self.category == TaskDataCategory::Meta
                            || self.category == TaskDataCategory::All,
                        "To read data of {:?} the task need to be accessed with this category \
                         (It's accessed with {:?})",
                        category,
                        self.category
                    );
                }
            }
        }
    }
}

impl<B: BackingStorage> Debug for TaskGuardImpl<'_, B> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut d = f.debug_struct("TaskGuard");
        d.field("task_id", &self.task_id);
        if let Some(task_type) = self.backend.task_cache.lookup_reverse(&self.task_id) {
            d.field("task_type", &task_type);
        };
        for (key, value) in self.task.iter_all() {
            d.field(&format!("{key:?}"), &value);
        }
        d.finish()
    }
}

impl<B: BackingStorage> TaskGuard for TaskGuardImpl<'_, B> {
    fn id(&self) -> TaskId {
        self.task_id
    }

    #[track_caller]
    fn add_internal(&mut self, item: CachedDataItem) -> bool {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            if self.task.contains_key(&item.key()) {
                return false;
            }
            self.task.track_modification(category.into_specific());
        }
        self.task.add(item)
    }

    #[track_caller]
    fn add_new_internal(&mut self, item: CachedDataItem) {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        let added = self.task.add(item);
        assert!(added, "Item already exists");
    }

    #[track_caller]
    fn extend_internal(
        &mut self,
        ty: CachedDataItemType,
        items: impl Iterator<Item = CachedDataItem>,
    ) -> bool {
        let category = ty.category();
        self.check_access(category);
        if !self.task_id.is_transient() && ty.is_persistent() {
            let mut items = items.peekable();
            // Check if the iterator is empty
            if items.peek().is_none() {
                return true;
            }
            // TODO this is not optimal as we always track a modification even if nothing is changed
            self.task.track_modification(category.into_specific());
            self.task.extend(ty, items)
        } else {
            self.task.extend(ty, items)
        }
    }

    #[track_caller]
    fn extend_new_internal(
        &mut self,
        ty: CachedDataItemType,
        items: impl Iterator<Item = CachedDataItem>,
    ) {
        let category = ty.category();
        self.check_access(category);
        if !self.task_id.is_transient() && ty.is_persistent() {
            self.task.track_modification(category.into_specific());
        }

        let added = self.task.extend(ty, items);
        assert!(added, "At least one item already exists");
    }

    #[track_caller]
    fn insert_internal(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.insert(item)
    }

    #[track_caller]
    fn update_internal(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.update(key, update);
    }

    #[track_caller]
    fn remove_internal(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.remove(key)
    }

    fn get_internal(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
        self.check_access(key.category());
        self.task.get(key)
    }

    #[track_caller]
    fn get_mut_internal(
        &mut self,
        key: &CachedDataItemKey,
    ) -> Option<CachedDataItemValueRefMut<'_>> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.get_mut(key)
    }

    #[track_caller]
    fn get_mut_or_insert_with_internal(
        &mut self,
        key: CachedDataItemKey,
        insert: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.get_mut_or_insert_with(key, insert)
    }

    #[track_caller]
    fn has_key_internal(&self, key: &CachedDataItemKey) -> bool {
        self.check_access(key.category());
        self.task.contains_key(key)
    }

    #[track_caller]
    fn count_internal(&self, ty: CachedDataItemType) -> usize {
        self.check_access(ty.category());
        self.task.count(ty)
    }

    fn iter_internal(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.check_access(ty.category());
        self.task.iter(ty)
    }

    fn shrink_to_fit_internal(&mut self, ty: CachedDataItemType) {
        self.task.shrink_to_fit(ty)
    }

    #[track_caller]
    fn extract_if_internal<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        self.check_access(ty.category());
        if !self.task_id.is_transient() && ty.is_persistent() {
            self.task.track_modification(ty.category().into_specific());
        }
        self.task.extract_if(ty, f)
    }

    fn extract_cell_data_if<'l, F>(&'l mut self, f: F) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        self.extract_if_internal(CachedDataItemType::CellData, f)
    }

    fn extract_transient_cell_data_if<'l, F>(
        &'l mut self,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        self.extract_if_internal(CachedDataItemType::TransientCellData, f)
    }

    fn extract_in_progress_cells_if<'l, F>(
        &'l mut self,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        self.extract_if_internal(CachedDataItemType::InProgressCell, f)
    }

    fn shrink_to_fit(&mut self) {
        self.shrink_to_fit_internal(CachedDataItemType::CellData);
        self.shrink_to_fit_internal(CachedDataItemType::TransientCellData);
        self.shrink_to_fit_internal(CachedDataItemType::CellTypeMaxIndex);
        self.shrink_to_fit_internal(CachedDataItemType::CellDependency);
        self.shrink_to_fit_internal(CachedDataItemType::OutputDependency);
        self.shrink_to_fit_internal(CachedDataItemType::CollectiblesDependency);
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
        if !self.task.state().prefetched() {
            self.task.state_mut().set_prefetched(true);
            let map = iter_many!(self, OutputDependency { target } => (target, false))
                .chain(iter_many!(self, CellDependency { target } => (target.task, true)))
                .chain(iter_many!(self, CollectiblesDependency { target } => (target.task, true)))
                .collect::<FxIndexMap<_, _>>();
            if map.len() > 16 {
                return Some(map);
            }
        }
        None
    }

    fn is_immutable(&self) -> bool {
        self.task.contains_key(&CachedDataItemKey::Immutable {})
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
