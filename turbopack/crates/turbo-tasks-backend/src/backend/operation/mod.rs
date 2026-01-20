mod aggregation_update;
mod cleanup_old_edges;
mod connect_child;
mod connect_children;
mod invalidate;
mod leaf_distance_update;
mod prepare_new_children;
mod update_cell;
mod update_collectible;

use std::{
    fmt::{Debug, Formatter},
    mem::transmute,
    sync::atomic::Ordering,
};

use bincode::{Decode, Encode};
use turbo_tasks::{
    CellId, FxIndexMap, TaskId, TaskPriority, TurboTasksBackendApi, TypedSharedReference,
};

use crate::{
    backend::{
        OperationGuard, TaskDataCategory, TransientTask, TurboTasksBackend, TurboTasksBackendInner,
        storage::{SpecificTaskDataCategory, StorageWriteGuard, get, iter_many, remove},
        storage_schema::{TaskStorage, TaskStorageAccessors},
    },
    backing_storage::{BackingStorage, BackingStorageSealed},
    data::{CachedDataItemKey, Dirtyness},
};

pub trait Operation:
    Encode + Decode<()> + Default + TryFrom<AnyOperation, Error = ()> + Into<AnyOperation>
{
    fn execute(self, ctx: &mut impl ExecuteContext<'_>);
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
    /// Prepares (as in fetches from persistent storage) a list of tasks.
    /// The iterator should not have duplicates, as this would cause over-fetching.
    fn prepare_tasks(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)> + Clone,
    );
    fn for_each_task(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        func: impl FnMut(Self::TaskGuardImpl, &mut Self),
    );
    fn for_each_task_meta(
        &mut self,
        task_ids: impl IntoIterator<Item = TaskId>,
        func: impl FnMut(Self::TaskGuardImpl, &mut Self),
    ) {
        self.for_each_task(
            task_ids.into_iter().map(|id| (id, TaskDataCategory::Meta)),
            func,
        )
    }
    fn is_once_task(&self, task_id: TaskId) -> bool;
    fn task_pair(
        &mut self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (Self::TaskGuardImpl, Self::TaskGuardImpl);
    fn schedule(&mut self, task_id: TaskId, parent_priority: TaskPriority);
    fn schedule_task(&self, task: Self::TaskGuardImpl, parent_priority: TaskPriority);
    fn get_current_task_priority(&self) -> TaskPriority;
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
    active_task_locks: std::sync::Arc<std::sync::atomic::AtomicU8>,
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
            active_task_locks: std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0)),
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
            active_task_locks: std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0)),
        }
    }

    fn ensure_transaction(&mut self) -> bool {
        if matches!(self.transaction, TransactionState::None) {
            let check_backing_storage = self.backend.should_restore()
                && self.backend.local_is_partial.load(Ordering::Acquire);
            if !check_backing_storage {
                return false;
            }
            let tx = self.backend.backing_storage.start_read_transaction();
            let tx = tx.map(|tx| {
                // Safety: self is actually valid for 'a, so it's safe to transmute 'l to 'a
                unsafe { transmute::<B::ReadTransaction<'_>, B::ReadTransaction<'tx>>(tx) }
            });
            self.transaction = TransactionState::Owned(tx);
        }
        true
    }

    fn restore_task_data(
        &mut self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
    ) -> TaskStorage {
        if !self.ensure_transaction() {
            // If we don't need to restore, we can just return an empty storage
            return TaskStorage::default();
        }
        let tx = self.get_tx();
        let mut storage = TaskStorage::default();
        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        let result = unsafe {
            self.backend
                .backing_storage
                .lookup_data(tx, task_id, category, &mut storage)
        };

        match result {
            Ok(()) => storage,
            Err(e) => {
                let task_name = self.backend.get_task_description(task_id);
                panic!(
                    "Failed to restore task data (corrupted database or bug): {:?}",
                    e.context(format!("{category:?} for {task_name} ({task_id}))"))
                )
            }
        }
    }

    fn restore_task_data_batch(
        &mut self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
    ) -> Option<Vec<TaskStorage>> {
        debug_assert!(
            task_ids.len() > 1,
            "Use restore_task_data_typed for single task"
        );
        if !self.ensure_transaction() {
            // If we don't need to restore, we return None
            return None;
        }
        let tx = self.get_tx();
        // Safety: `tx` is a valid transaction from `self.backend.backing_storage`.
        let result = unsafe {
            self.backend
                .backing_storage
                .batch_lookup_data(tx, task_ids, category)
        };
        match result {
            Ok(result) => Some(result),
            Err(e) => {
                panic!(
                    "Failed to restore task data (corrupted database or bug): {:?}",
                    e.context(format!(
                        "{category:?} for batch of {} tasks",
                        task_ids.len()
                    ))
                )
            }
        }
    }

    fn get_tx(&self) -> Option<&<B as BackingStorageSealed>::ReadTransaction<'tx>> {
        match &self.transaction {
            TransactionState::None => unreachable!(),
            TransactionState::Borrowed(tx) => *tx,
            TransactionState::Owned(tx) => tx.as_ref(),
        }
    }

    fn prepare_tasks_with_callback(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        call_prepared_task_callback_for_transient_tasks: bool,
        mut prepared_task_callback: impl FnMut(
            &mut Self,
            TaskId,
            TaskDataCategory,
            StorageWriteGuard<'e>,
        ),
    ) {
        let mut data_count = 0;
        let mut meta_count = 0;
        let mut all_count = 0;
        let mut tasks = task_ids
            .into_iter()
            .filter(|&(id, category)| {
                if id.is_transient() {
                    if call_prepared_task_callback_for_transient_tasks {
                        let mut task = self.backend.storage.access_mut(id);
                        // TODO add is_restoring and avoid concurrent restores and duplicates tasks
                        // ids in `task_ids`
                        if !task.flags.is_restored(category) {
                            task.flags.set_restored(TaskDataCategory::All);
                        }
                        prepared_task_callback(self, id, category, task);
                    }
                    false
                } else {
                    true
                }
            })
            .inspect(|(_, category)| match category {
                TaskDataCategory::Data => data_count += 1,
                TaskDataCategory::Meta => meta_count += 1,
                TaskDataCategory::All => all_count += 1,
            })
            .map(|(id, category)| (id, category, None, None))
            .collect::<Vec<_>>();
        data_count += all_count;
        meta_count += all_count;

        let mut tasks_to_restore_for_data = Vec::with_capacity(data_count);
        let mut tasks_to_restore_for_data_indicies = Vec::with_capacity(data_count);
        let mut tasks_to_restore_for_meta = Vec::with_capacity(meta_count);
        let mut tasks_to_restore_for_meta_indicies = Vec::with_capacity(meta_count);
        for (i, &(task_id, category, _, _)) in tasks.iter().enumerate() {
            #[cfg(debug_assertions)]
            if self.active_task_locks.fetch_add(1, Ordering::AcqRel) != 0 {
                panic!(
                    "Concurrent task lock acquisition detected. This is not allowed and indicates \
                     a bug. It can lead to deadlocks."
                );
            }

            let task = self.backend.storage.access_mut(task_id);
            let mut ready = true;
            if matches!(category, TaskDataCategory::Data | TaskDataCategory::All)
                && !task.flags.is_restored(TaskDataCategory::Data)
            {
                tasks_to_restore_for_data.push(task_id);
                tasks_to_restore_for_data_indicies.push(i);
                ready = false;
            }
            if matches!(category, TaskDataCategory::Meta | TaskDataCategory::All)
                && !task.flags.is_restored(TaskDataCategory::Meta)
            {
                tasks_to_restore_for_meta.push(task_id);
                tasks_to_restore_for_meta_indicies.push(i);
                ready = false;
            }
            if ready {
                prepared_task_callback(self, task_id, category, task);
            }
            #[cfg(debug_assertions)]
            self.active_task_locks.fetch_sub(1, Ordering::AcqRel);
        }
        if tasks_to_restore_for_meta.is_empty() && tasks_to_restore_for_data.is_empty() {
            return;
        }

        match tasks_to_restore_for_data.len() {
            0 => {}
            1 => {
                let task_id = tasks_to_restore_for_data[0];
                let data = self.restore_task_data(task_id, SpecificTaskDataCategory::Data);
                let idx = tasks_to_restore_for_data_indicies[0];
                tasks[idx].2 = Some(data);
            }
            _ => {
                if let Some(data) = self.restore_task_data_batch(
                    &tasks_to_restore_for_data,
                    SpecificTaskDataCategory::Data,
                ) {
                    data.into_iter()
                        .zip(tasks_to_restore_for_data_indicies)
                        .for_each(|(item, idx)| {
                            tasks[idx].2 = Some(item);
                        });
                } else {
                    for idx in tasks_to_restore_for_data_indicies {
                        tasks[idx].2 = Some(TaskStorage::default());
                    }
                }
            }
        }
        match tasks_to_restore_for_meta.len() {
            0 => {}
            1 => {
                let task_id = tasks_to_restore_for_meta[0];
                let data = self.restore_task_data(task_id, SpecificTaskDataCategory::Meta);
                let idx = tasks_to_restore_for_meta_indicies[0];
                tasks[idx].3 = Some(data);
            }
            _ => {
                if let Some(data) = self.restore_task_data_batch(
                    &tasks_to_restore_for_meta,
                    SpecificTaskDataCategory::Meta,
                ) {
                    data.into_iter()
                        .zip(tasks_to_restore_for_meta_indicies)
                        .for_each(|(item, idx)| {
                            tasks[idx].3 = Some(item);
                        });
                } else {
                    for idx in tasks_to_restore_for_meta_indicies {
                        tasks[idx].3 = Some(TaskStorage::default());
                    }
                }
            }
        }

        for (task_id, category, storage_for_data, storage_for_meta) in tasks {
            if storage_for_data.is_none() && storage_for_meta.is_none() {
                continue;
            }
            #[cfg(debug_assertions)]
            if self.active_task_locks.fetch_add(1, Ordering::AcqRel) != 0 {
                panic!(
                    "Concurrent task lock acquisition detected. This is not allowed and indicates \
                     a bug. It can lead to deadlocks."
                );
            }

            let mut task = self.backend.storage.access_mut(task_id);
            if let Some(storage) = storage_for_data
                && !task.flags.is_restored(TaskDataCategory::Data)
            {
                task.restore_from(storage, TaskDataCategory::Data);
                task.flags.set_restored(TaskDataCategory::Data);
            }
            if let Some(storage) = storage_for_meta
                && !task.flags.is_restored(TaskDataCategory::Meta)
            {
                task.restore_from(storage, TaskDataCategory::Meta);
                task.flags.set_restored(TaskDataCategory::Meta);
            }
            prepared_task_callback(self, task_id, category, task);
            #[cfg(debug_assertions)]
            self.active_task_locks.fetch_sub(1, Ordering::AcqRel);
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
        if !task.flags.is_restored(category) {
            if task_id.is_transient() {
                task.flags.set_restored(TaskDataCategory::All);
            } else {
                // Collect which categories need restoring while we have the lock
                let needs_data =
                    category.includes_data() && !task.flags.is_restored(TaskDataCategory::Data);
                let needs_meta =
                    category.includes_meta() && !task.flags.is_restored(TaskDataCategory::Meta);

                if needs_data || needs_meta {
                    // Avoid holding the lock too long since this can also affect other tasks
                    // Drop lock once, do all I/O, then re-acquire once
                    drop(task);

                    let storage_data = needs_data
                        .then(|| self.restore_task_data(task_id, SpecificTaskDataCategory::Data));
                    let storage_meta = needs_meta
                        .then(|| self.restore_task_data(task_id, SpecificTaskDataCategory::Meta));

                    task = self.backend.storage.access_mut(task_id);

                    // Handle race conditions and merge
                    if let Some(storage) = storage_data
                        && !task.flags.is_restored(TaskDataCategory::Data)
                    {
                        task.restore_from(storage, TaskDataCategory::Data);
                        task.flags.set_restored(TaskDataCategory::Data);
                    }
                    if let Some(storage) = storage_meta
                        && !task.flags.is_restored(TaskDataCategory::Meta)
                    {
                        task.restore_from(storage, TaskDataCategory::Meta);
                        task.flags.set_restored(TaskDataCategory::Meta);
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

    fn prepare_tasks(&mut self, task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>) {
        self.prepare_tasks_with_callback(task_ids, false, |_, _, _, _| {});
    }

    fn for_each_task(
        &mut self,
        task_ids: impl IntoIterator<Item = (TaskId, TaskDataCategory)>,
        mut func: impl FnMut(Self::TaskGuardImpl, &mut Self),
    ) {
        let backend = self.backend;
        #[cfg(debug_assertions)]
        let active_task_locks = self.active_task_locks.clone();
        self.prepare_tasks_with_callback(task_ids, true, |this, task_id, _category, task| {
            // The prepare_tasks_with_callback already increased the active_task_locks count and
            // checked for concurrent access but it will also decrement it again, so we
            // need to increase it again here as Drop will decrement it
            #[cfg(debug_assertions)]
            active_task_locks.fetch_add(1, Ordering::AcqRel);

            let guard: TaskGuardImpl<'_, B> = TaskGuardImpl {
                task,
                task_id,
                backend,
                #[cfg(debug_assertions)]
                category: _category,
                #[cfg(debug_assertions)]
                active_task_locks: active_task_locks.clone(),
            };
            func(guard, this);
        });
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

        // Collect what needs restoring for each task
        let needs_data1 =
            category.includes_data() && !task1.flags.is_restored(TaskDataCategory::Data);
        let needs_meta1 =
            category.includes_meta() && !task1.flags.is_restored(TaskDataCategory::Meta);
        let needs_data2 =
            category.includes_data() && !task2.flags.is_restored(TaskDataCategory::Data);
        let needs_meta2 =
            category.includes_meta() && !task2.flags.is_restored(TaskDataCategory::Meta);

        if needs_data1 || needs_meta1 || needs_data2 || needs_meta2 {
            // Avoid holding the lock too long since this can also affect other tasks
            // Drop locks once, do all I/O, then re-acquire once
            drop(task1);
            drop(task2);

            let storage_data1 = needs_data1
                .then(|| self.restore_task_data(task_id1, SpecificTaskDataCategory::Data));
            let storage_meta1 = needs_meta1
                .then(|| self.restore_task_data(task_id1, SpecificTaskDataCategory::Meta));
            let storage_data2 = needs_data2
                .then(|| self.restore_task_data(task_id2, SpecificTaskDataCategory::Data));
            let storage_meta2 = needs_meta2
                .then(|| self.restore_task_data(task_id2, SpecificTaskDataCategory::Meta));

            let (t1, t2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
            task1 = t1;
            task2 = t2;

            // Merge results, handling race conditions
            if let Some(storage) = storage_data1
                && !task1.flags.is_restored(TaskDataCategory::Data)
            {
                task1.restore_from(storage, TaskDataCategory::Data);
                task1.flags.set_restored(TaskDataCategory::Data);
            }
            if let Some(storage) = storage_meta1
                && !task1.flags.is_restored(TaskDataCategory::Meta)
            {
                task1.restore_from(storage, TaskDataCategory::Meta);
                task1.flags.set_restored(TaskDataCategory::Meta);
            }
            if let Some(storage) = storage_data2
                && !task2.flags.is_restored(TaskDataCategory::Data)
            {
                task2.restore_from(storage, TaskDataCategory::Data);
                task2.flags.set_restored(TaskDataCategory::Data);
            }
            if let Some(storage) = storage_meta2
                && !task2.flags.is_restored(TaskDataCategory::Meta)
            {
                task2.restore_from(storage, TaskDataCategory::Meta);
                task2.flags.set_restored(TaskDataCategory::Meta);
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

    fn schedule(&mut self, task_id: TaskId, parent_priority: TaskPriority) {
        let task = self.task(task_id, TaskDataCategory::All);
        self.schedule_task(task, parent_priority);
    }

    fn schedule_task(&self, task: Self::TaskGuardImpl, parent_priority: TaskPriority) {
        let priority = if get!(task, Output).is_some() {
            TaskPriority::invalidation(
                get!(task, LeafDistance)
                    .copied()
                    .unwrap_or_default()
                    .distance,
            )
        } else {
            TaskPriority::initial()
        };
        self.turbo_tasks
            .schedule(task.id(), priority.in_parent(parent_priority));
    }

    fn get_current_task_priority(&self) -> TaskPriority {
        self.turbo_tasks.get_current_task_priority()
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
            active_task_locks: std::sync::Arc::new(std::sync::atomic::AtomicU8::new(0)),
        }
    }
}

pub trait TaskGuard: Debug + TaskStorageAccessors {
    fn id(&self) -> TaskId;

    fn invalidate_serialization(&mut self);
    /// Determine which tasks to prefetch for a task.
    /// Only returns Some once per task.
    /// It returns a set of tasks and which info is needed.
    fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, TaskDataCategory>>;
    fn is_immutable(&self) -> bool {
        self.has_key(&CachedDataItemKey::Immutable {})
    }
    fn is_dirty(&self) -> Option<TaskPriority> {
        get!(self, Dirty).and_then(|dirtyness| match dirtyness {
            Dirtyness::Dirty(priority) => Some(*priority),
            Dirtyness::SessionDependent => {
                if get!(self, CurrentSessionClean).is_none() {
                    Some(TaskPriority::leaf())
                } else {
                    None
                }
            }
        })
    }
    fn dirtyness_and_session(&self) -> Option<(Dirtyness, bool)> {
        match get!(self, Dirty)? {
            Dirtyness::Dirty(priority) => Some((Dirtyness::Dirty(*priority), false)),
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
            Some(Dirtyness::Dirty(_)) => (true, false),
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
    active_task_locks: std::sync::Arc<std::sync::atomic::AtomicU8>,
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
        d.field("storage", &*self.task);
        d.finish()
    }
}

impl<B: BackingStorage> TaskGuard for TaskGuardImpl<'_, B> {
    fn id(&self) -> TaskId {
        self.task_id
    }

    fn invalidate_serialization(&mut self) {
        // TODO this causes race conditions, since we never know when a value is changed. We can't
        // "snapshot" the value correctly.
        if !self.task_id.is_transient() {
            self.task.track_modification(SpecificTaskDataCategory::Data);
            self.task.track_modification(SpecificTaskDataCategory::Meta);
        }
    }

    fn prefetch(&mut self) -> Option<FxIndexMap<TaskId, TaskDataCategory>> {
        if self.task.flags.prefetched() {
            return None;
        }
        self.task.flags.set_prefetched(true);
        let map = iter_many!(self, OutputDependency { target } => (target, TaskDataCategory::Meta))
            .chain(iter_many!(self, CellDependency { target, key: _ } => (target.task, TaskDataCategory::All)))
            .chain(iter_many!(self, CollectiblesDependency { target } => (target.task, TaskDataCategory::All)))
            .chain(iter_many!(self, Child { task } => (task, TaskDataCategory::All)))
            .collect::<FxIndexMap<_, _>>();
        (map.len() > 1).then_some(map)
    }
}

impl<'a, B: BackingStorage> TaskStorageAccessors for TaskGuardImpl<'a, B> {
    fn typed(&self) -> &TaskStorage {
        &self.task
    }

    fn typed_mut(&mut self) -> &mut TaskStorage {
        &mut self.task
    }

    fn track_modification(&mut self, category: crate::backend::storage::SpecificTaskDataCategory) {
        if !self.task_id.is_transient() {
            self.task.track_modification(category);
        }
    }

    fn check_access(&self, category: crate::backend::TaskDataCategory) {
        self.check_access(category);
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
    LeafDistanceUpdate(leaf_distance_update::LeafDistanceUpdateQueue),
    Nested(Vec<AnyOperation>),
}

impl AnyOperation {
    pub fn execute(self, ctx: &mut impl ExecuteContext<'_>) {
        match self {
            AnyOperation::ConnectChild(op) => op.execute(ctx),
            AnyOperation::Invalidate(op) => op.execute(ctx),
            AnyOperation::UpdateCell(op) => op.execute(ctx),
            AnyOperation::CleanupOldEdges(op) => op.execute(ctx),
            AnyOperation::AggregationUpdate(op) => op.execute(ctx),
            AnyOperation::LeafDistanceUpdate(op) => op.execute(ctx),
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
impl_operation!(LeafDistanceUpdate leaf_distance_update::LeafDistanceUpdateQueue);

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
