mod aggregation_update;
mod cleanup_old_edges;
mod connect_child;
mod connect_children;
mod invalidate;
mod prepare_new_children;
mod update_cell;
mod update_collectible;
mod update_output;

use std::{
    fmt::{Debug, Formatter},
    mem::{take, transmute},
};

use either::Either;
use serde::{Deserialize, Serialize};
use turbo_tasks::{KeyValuePair, SessionId, TaskId, TurboTasksBackendApi};

use crate::{
    backend::{
        storage::StorageWriteGuard, OperationGuard, TaskDataCategory, TransientTask,
        TurboTasksBackend, TurboTasksBackendInner,
    },
    backing_storage::BackingStorage,
    data::{
        CachedDataItem, CachedDataItemKey, CachedDataItemType, CachedDataItemValue,
        CachedDataItemValueRef, CachedDataItemValueRefMut,
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

impl<'a, 'tx1, B: BackingStorage> TransactionState<'a, 'tx1, B> {
    fn borrow<'l, 'tx2>(&'l self) -> TransactionState<'l, 'tx2, B>
    where
        'a: 'l,
        'tx1: 'a + 'tx2,
        'tx2: 'l,
    {
        match self {
            TransactionState::None => TransactionState::None,
            TransactionState::Borrowed(tx) => {
                TransactionState::Borrowed(tx.map(B::lower_read_transaction))
            }
            TransactionState::Owned(tx) => {
                TransactionState::Borrowed(tx.as_ref().map(B::lower_read_transaction))
            }
        }
    }
}

pub trait ExecuteContext<'e>: Sized {
    fn session_id(&self) -> SessionId;
    fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> impl TaskGuard + 'e;
    fn is_once_task(&self, task_id: TaskId) -> bool;
    fn task_pair(
        &mut self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (impl TaskGuard + 'e, impl TaskGuard + 'e);
    fn schedule(&self, task_id: TaskId);
    fn operation_suspend_point<T>(&mut self, op: &T)
    where
        T: Clone + Into<AnyOperation>;
    fn suspending_requested(&self) -> bool;
    type Backend;
    fn run_operation(
        &mut self,
        parent_op_ref: &mut impl Operation,
        run: impl FnOnce(&mut ExecuteContextImpl<'_, '_, Self::Backend>),
    );
    fn get_task_desc_fn(&self, task_id: TaskId) -> impl Fn() -> String + Send + Sync + 'static;
    fn get_task_description(&self, task_id: TaskId) -> String;
    fn should_track_children(&self) -> bool;
    fn should_track_dependencies(&self) -> bool;
    fn should_track_activeness(&self) -> bool;
}

pub struct ParentRef<'a> {
    op: &'a AnyOperation,
    parent: &'a Option<ParentRef<'a>>,
}

pub struct ExecuteContextImpl<'e, 'tx, B: BackingStorage>
where
    Self: 'e,
    'tx: 'e,
{
    parent: Option<ParentRef<'e>>,
    backend: &'e TurboTasksBackendInner<B>,
    turbo_tasks: &'e dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
    _operation_guard: Option<OperationGuard<'e, B>>,
    transaction: TransactionState<'e, 'tx, B>,
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
            parent: None,
            transaction: TransactionState::None,
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
            parent: None,
            transaction: TransactionState::Borrowed(transaction),
        }
    }

    fn transaction<'l>(&'l mut self) -> Option<&'l B::ReadTransaction<'l>>
    where
        'e: 'l,
    {
        if matches!(self.transaction, TransactionState::None) {
            let tx = self.backend.backing_storage.start_read_transaction();
            let tx = tx.map(|tx| {
                // Safety: self is actually valid for 'a, so it's safe to transmute 'l to 'a
                unsafe { transmute::<B::ReadTransaction<'_>, B::ReadTransaction<'tx>>(tx) }
            });
            self.transaction = TransactionState::Owned(tx);
        }
        match &self.transaction {
            TransactionState::None => unreachable!(),
            TransactionState::Borrowed(tx) => tx.map(B::lower_read_transaction),
            TransactionState::Owned(tx) => tx.as_ref().map(B::lower_read_transaction),
        }
    }

    fn restore_task_data(
        &mut self,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Vec<CachedDataItem> {
        // Safety: `transaction` is a valid transaction from `self.backend.backing_storage`.
        unsafe {
            self.backend
                .backing_storage
                .lookup_data(self.transaction(), task_id, category)
        }
    }
}

impl<'e, 'tx, B: BackingStorage> ExecuteContext<'e> for ExecuteContextImpl<'e, 'tx, B>
where
    'tx: 'e,
{
    fn session_id(&self) -> SessionId {
        self.backend.session_id()
    }

    fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> impl TaskGuard + 'e {
        let mut task = self.backend.storage.access_mut(task_id);
        if !task.persistance_state().is_restored(category) {
            if task_id.is_transient() {
                task.persistance_state_mut()
                    .set_restored(TaskDataCategory::All);
            } else {
                for category in category {
                    if !task.persistance_state().is_restored(category) {
                        // Avoid holding the lock too long since this can also affect other tasks
                        drop(task);

                        let items = self.restore_task_data(task_id, category);
                        task = self.backend.storage.access_mut(task_id);
                        if !task.persistance_state().is_restored(category) {
                            for item in items {
                                task.add(item);
                            }
                            task.persistance_state_mut().set_restored(category);
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
    ) -> (impl TaskGuard + 'e, impl TaskGuard + 'e) {
        let (mut task1, mut task2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
        let is_restored1 = task1.persistance_state().is_restored(category);
        let is_restored2 = task2.persistance_state().is_restored(category);
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
                if !task1.persistance_state().is_restored(category) {
                    for item in items1.unwrap() {
                        task1.add(item);
                    }
                    task1.persistance_state_mut().set_restored(category);
                }
                if !task2.persistance_state().is_restored(category) {
                    for item in items2.unwrap() {
                        task2.add(item);
                    }
                    task2.persistance_state_mut().set_restored(category);
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
            },
            TaskGuardImpl {
                task: task2,
                task_id: task_id2,
                backend: self.backend,
                #[cfg(debug_assertions)]
                category,
            },
        )
    }

    fn schedule(&self, task_id: TaskId) {
        self.turbo_tasks.schedule(task_id);
    }

    fn operation_suspend_point<T: Clone + Into<AnyOperation>>(&mut self, op: &T) {
        if self.parent.is_some() {
            self.backend.operation_suspend_point(|| {
                let mut nested = Vec::new();
                nested.push(op.clone().into());
                let mut cur = self.parent.as_ref();
                while let Some(ParentRef { op, parent }) = cur {
                    nested.push((*op).clone());
                    cur = parent.as_ref();
                }
                AnyOperation::Nested(nested)
            });
        } else {
            self.backend.operation_suspend_point(|| op.clone().into());
        }
    }

    fn suspending_requested(&self) -> bool {
        self.backend.suspending_requested()
    }

    type Backend = B;

    fn run_operation(
        &mut self,
        parent_op_ref: &mut impl Operation,
        run: impl FnOnce(&mut ExecuteContextImpl<'_, '_, B>),
    ) {
        let parent_op = take(parent_op_ref);
        let parent_op: AnyOperation = parent_op.into();
        let this = &*self;
        fn run_with_inner_ctx<'a, B: BackingStorage>(
            backend: &'a TurboTasksBackendInner<B>,
            turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend<B>>,
            parent: ParentRef<'a>,
            transaction: TransactionState<'a, '_, B>,
            run: impl FnOnce(&mut ExecuteContextImpl<'_, '_, B>),
        ) {
            let mut inner_ctx: ExecuteContextImpl<'_, '_, B> = ExecuteContextImpl {
                backend,
                turbo_tasks,
                _operation_guard: None,
                parent: Some(parent),
                transaction,
            };
            run(&mut inner_ctx);
        }
        run_with_inner_ctx(
            self.backend,
            self.turbo_tasks,
            ParentRef {
                op: &parent_op,
                parent: &this.parent,
            },
            self.transaction.borrow(),
            run,
        );
        *parent_op_ref = parent_op.try_into().unwrap();
    }

    fn get_task_desc_fn(&self, task_id: TaskId) -> impl Fn() -> String + Send + Sync + 'static {
        self.backend.get_task_desc_fn(task_id)
    }

    fn get_task_description(&self, task_id: TaskId) -> String {
        self.backend.get_task_description(task_id)
    }

    fn should_track_children(&self) -> bool {
        self.backend.should_track_children()
    }

    fn should_track_dependencies(&self) -> bool {
        self.backend.should_track_dependencies()
    }

    fn should_track_activeness(&self) -> bool {
        self.backend.should_track_activeness()
    }
}

pub trait TaskGuard: Debug {
    fn id(&self) -> TaskId;
    fn add(&mut self, item: CachedDataItem) -> bool;
    fn add_new(&mut self, item: CachedDataItem);
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
}

struct TaskGuardImpl<'a, B: BackingStorage> {
    task_id: TaskId,
    task: StorageWriteGuard<'a>,
    backend: &'a TurboTasksBackendInner<B>,
    #[cfg(debug_assertions)]
    category: TaskDataCategory,
}

impl<B: BackingStorage> TaskGuardImpl<'_, B> {
    /// Verify that the task guard restored the correct category
    /// before accessing the data.
    #[inline]
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
                            || self.category == TaskDataCategory::All
                    );
                }
                TaskDataCategory::Meta => {
                    #[cfg(debug_assertions)]
                    debug_assert!(
                        self.category == TaskDataCategory::Meta
                            || self.category == TaskDataCategory::All
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
            d.field(&format!("{:?}", key), &value);
        }
        d.finish()
    }
}

impl<B: BackingStorage> TaskGuard for TaskGuardImpl<'_, B> {
    fn id(&self) -> TaskId {
        self.task_id
    }

    #[must_use]
    fn add(&mut self, item: CachedDataItem) -> bool {
        self.check_access(item.category());
        if !self.backend.should_persist() || self.task_id.is_transient() || !item.is_persistent() {
            self.task.add(item)
        } else if self.task.add(item.clone()) {
            let (key, value) = item.into_key_and_value();
            self.task.persistance_state_mut().add_persisting_item();
            self.backend
                .persisted_storage_log(key.category())
                .unwrap()
                .push(self.task_id, key, None, Some(value));
            true
        } else {
            false
        }
    }

    fn add_new(&mut self, item: CachedDataItem) {
        self.check_access(item.category());
        let added = self.add(item);
        assert!(added, "Item already exists");
    }

    fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        self.check_access(item.category());
        let (key, value) = item.into_key_and_value();
        if !self.backend.should_persist() || self.task_id.is_transient() || !key.is_persistent() {
            self.task
                .insert(CachedDataItem::from_key_and_value(key, value))
        } else if value.is_persistent() {
            let old = self
                .task
                .insert(CachedDataItem::from_key_and_value(key, value.clone()));
            self.task.persistance_state_mut().add_persisting_item();
            self.backend
                .persisted_storage_log(key.category())
                .unwrap()
                .push(
                    self.task_id,
                    key,
                    old.as_ref()
                        .and_then(|old| old.is_persistent().then(|| old.clone())),
                    Some(value),
                );
            old
        } else {
            let item = CachedDataItem::from_key_and_value(key, value);
            if let Some(old) = self.task.insert(item) {
                if old.is_persistent() {
                    self.task.persistance_state_mut().add_persisting_item();
                    self.backend
                        .persisted_storage_log(key.category())
                        .unwrap()
                        .push(self.task_id, key, Some(old.clone()), None);
                }
                Some(old)
            } else {
                None
            }
        }
    }

    fn update(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        self.check_access(key.category());
        if !self.backend.should_persist() || self.task_id.is_transient() || !key.is_persistent() {
            self.task.update(key, update);
            return;
        }
        let Self {
            task,
            task_id,
            backend,
            #[cfg(debug_assertions)]
                category: _,
        } = self;
        let mut add_persisting_item = false;
        task.update(key, |old| {
            let old_value_when_persistent = old
                .as_ref()
                .and_then(|old| old.is_persistent().then(|| old.clone()));
            let new = update(old);
            let new_persistent = new.as_ref().map(|new| new.is_persistent()).unwrap_or(false);

            match (old_value_when_persistent, new_persistent) {
                (None, false) => {}
                (Some(old_value), false) => {
                    add_persisting_item = true;
                    backend.persisted_storage_log(key.category()).unwrap().push(
                        *task_id,
                        key,
                        Some(old_value),
                        None,
                    );
                }
                (old_value, true) => {
                    add_persisting_item = true;
                    backend.persisted_storage_log(key.category()).unwrap().push(
                        *task_id,
                        key,
                        old_value,
                        new.clone(),
                    );
                }
            }

            new
        });
        if add_persisting_item {
            task.persistance_state_mut().add_persisting_item();
        }
    }

    fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        self.check_access(key.category());
        let old_value = self.task.remove(key);
        if let Some(value) = old_value {
            if self.backend.should_persist()
                && !self.task_id.is_transient()
                && key.is_persistent()
                && value.is_persistent()
            {
                self.task.persistance_state_mut().add_persisting_item();
                self.backend
                    .persisted_storage_log(key.category())
                    .unwrap()
                    .push(
                        self.task_id,
                        *key,
                        value.is_persistent().then(|| value.clone()),
                        None,
                    );
            }
            Some(value)
        } else {
            None
        }
    }

    fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
        self.check_access(key.category());
        self.task.get(key)
    }

    fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut<'_>> {
        self.check_access(key.category());
        self.task.get_mut(key)
    }

    fn get_mut_or_insert_with(
        &mut self,
        key: CachedDataItemKey,
        insert: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_> {
        self.check_access(key.category());
        self.task.get_mut_or_insert_with(key, insert)
    }

    fn has_key(&self, key: &CachedDataItemKey) -> bool {
        self.check_access(key.category());
        self.task.contains_key(key)
    }

    fn count(&self, ty: CachedDataItemType) -> usize {
        self.check_access(ty.category());
        self.task.count(ty)
    }

    fn iter(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.task.iter(ty)
    }

    fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
        self.task.shrink_to_fit(ty)
    }

    fn extract_if<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        f: F,
    ) -> impl Iterator<Item = CachedDataItem>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        if !self.backend.should_persist() || self.task_id.is_transient() {
            return Either::Left(self.task.extract_if(ty, f));
        }
        Either::Right(self.task.extract_if(ty, f).inspect(|item| {
            if item.is_persistent() {
                let key = item.key();
                let value = item.value();
                self.backend
                    .persisted_storage_log(key.category())
                    .unwrap()
                    .push(self.task_id, key, Some(value), None);
            }
        }))
    }

    fn invalidate_serialization(&mut self) {
        if !self.backend.should_persist() {
            return;
        }
        let mut count = 0;
        let cell_data = self
            .iter(CachedDataItemType::CellData)
            .filter_map(|(key, value)| match (key, value) {
                (
                    CachedDataItemKey::CellData { cell },
                    CachedDataItemValueRef::CellData { value },
                ) => {
                    count += 1;
                    Some(CachedDataItem::CellData {
                        cell,
                        value: value.clone(),
                    })
                }
                _ => None,
            });
        {
            self.backend
                .persisted_storage_log(TaskDataCategory::Data)
                .unwrap()
                .push_batch_insert(self.task_id, cell_data);
            self.task
                .persistance_state_mut()
                .add_persisting_items(count);
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

#[derive(Serialize, Deserialize, Clone)]
pub enum AnyOperation {
    ConnectChild(connect_child::ConnectChildOperation),
    Invalidate(invalidate::InvalidateOperation),
    UpdateOutput(update_output::UpdateOutputOperation),
    CleanupOldEdges(cleanup_old_edges::CleanupOldEdgesOperation),
    AggregationUpdate(aggregation_update::AggregationUpdateQueue),
    Nested(Vec<AnyOperation>),
}

impl AnyOperation {
    pub fn execute(self, ctx: &mut impl ExecuteContext) {
        match self {
            AnyOperation::ConnectChild(op) => op.execute(ctx),
            AnyOperation::Invalidate(op) => op.execute(ctx),
            AnyOperation::UpdateOutput(op) => op.execute(ctx),
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
impl_operation!(UpdateOutput update_output::UpdateOutputOperation);
impl_operation!(CleanupOldEdges cleanup_old_edges::CleanupOldEdgesOperation);
impl_operation!(AggregationUpdate aggregation_update::AggregationUpdateQueue);

#[cfg(feature = "trace_task_dirty")]
pub use self::invalidate::TaskDirtyCause;
pub use self::{
    aggregation_update::{
        get_aggregation_number, get_uppers, is_aggregating_node, is_root_node,
        AggregatedDataUpdate, AggregationUpdateJob,
    },
    cleanup_old_edges::OutdatedEdge,
    connect_children::connect_children,
    prepare_new_children::prepare_new_children,
    update_cell::UpdateCellOperation,
    update_collectible::UpdateCollectibleOperation,
};
