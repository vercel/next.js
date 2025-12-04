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

use serde::{Deserialize, Serialize};
use turbo_tasks::{
    CellId, FxIndexMap, KeyValuePair, TaskId, TurboTasksBackendApi, TypedSharedReference,
};

use crate::{
    backend::{
        OperationGuard, TaskDataCategory, TransientTask, TurboTasksBackend, TurboTasksBackendInner,
        TurboTasksBackendJob,
        storage::{SpecificTaskDataCategory, StorageWriteGuard, get, iter_many, remove},
    },
    backing_storage::BackingStorage,
    data::{
        CachedDataItem, CachedDataItemKey, CachedDataItemType, CachedDataItemValue,
        CachedDataItemValueRef, CachedDataItemValueRefMut, Dirtyness,
    },
};

pub trait Operation:
    Serialize
    + for<'de> Deserialize<'de>
    + Default
    + TryFrom<AnyOperation, Error = ()>
    + Into<AnyOperation>
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
    /// Adds a new item to the task if the key is not already present.
    /// Returns `true` if the item was added.
    /// Returns `false` if an item with the same key was already present.
    #[must_use]
    fn add(&mut self, item: CachedDataItem) -> bool;
    /// Adds a new item to the task. The key must not be already present.
    /// Might panic if the key is already present.
    fn add_new(&mut self, item: CachedDataItem);
    /// Extends the task with items from the iterator.
    /// Overwrites existing keys.
    /// Returns `true` if all items were new and added.
    /// Returns `false` if any item had a key that was already present.
    fn extend(
        &mut self,
        ty: CachedDataItemType,
        items: impl Iterator<Item = CachedDataItem>,
    ) -> bool;
    /// Extends the task with items from the iterator.
    /// Might panic if any item has a key that is already present.
    fn extend_new(&mut self, ty: CachedDataItemType, items: impl Iterator<Item = CachedDataItem>);
    fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue>;
    fn update(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    );
    fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue>;
    fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>>;
    fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut<'_>>;
    fn get_mut_or_insert_with(
        &mut self,
        key: CachedDataItemKey,
        insert: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_>;
    fn has_key(&self, key: &CachedDataItemKey) -> bool;
    fn count(&self, ty: CachedDataItemType) -> usize;
    fn iter(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)>;
    fn shrink_to_fit(&mut self, ty: CachedDataItemType);
    fn extract_if<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l;
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
            self.has_key(&CachedDataItemKey::CellData { cell })
        } else {
            self.has_key(&CachedDataItemKey::TransientCellData { cell })
        }
    }
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
    fn add(&mut self, item: CachedDataItem) -> bool {
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
    fn add_new(&mut self, item: CachedDataItem) {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        let added = self.task.add(item);
        assert!(added, "Item already exists");
    }

    #[track_caller]
    fn extend(
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
    fn extend_new(&mut self, ty: CachedDataItemType, items: impl Iterator<Item = CachedDataItem>) {
        let category = ty.category();
        self.check_access(category);
        if !self.task_id.is_transient() && ty.is_persistent() {
            self.task.track_modification(category.into_specific());
        }

        let added = self.task.extend(ty, items);
        assert!(added, "At least one item already exists");
    }

    #[track_caller]
    fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.insert(item)
    }

    #[track_caller]
    fn update(
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
    fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.remove(key)
    }

    fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
        self.check_access(key.category());
        self.task.get(key)
    }

    #[track_caller]
    fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut<'_>> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.get_mut(key)
    }

    #[track_caller]
    fn get_mut_or_insert_with(
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
    fn has_key(&self, key: &CachedDataItemKey) -> bool {
        self.check_access(key.category());
        self.task.contains_key(key)
    }

    #[track_caller]
    fn count(&self, ty: CachedDataItemType) -> usize {
        self.check_access(ty.category());
        self.task.count(ty)
    }

    fn iter(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.check_access(ty.category());
        self.task.iter(ty)
    }

    fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
        self.task.shrink_to_fit(ty)
    }

    #[track_caller]
    fn extract_if<'l, F>(
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

#[derive(Serialize, Deserialize, Clone)]
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
