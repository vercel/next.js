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

use serde::{Deserialize, Serialize};
use turbo_tasks::{KeyValuePair, SessionId, TaskId, TurboTasksBackendApi};

use crate::{
    backend::{
        OperationGuard, TaskDataCategory, TransientTask, TurboTasksBackend, TurboTasksBackendInner,
        storage::{SpecificTaskDataCategory, StorageWriteGuard},
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
        let result = unsafe {
            self.backend
                .backing_storage
                .lookup_data(self.transaction(), task_id, category)
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
    fn session_id(&self) -> SessionId {
        self.backend.session_id()
    }

    fn task(&mut self, task_id: TaskId, category: TaskDataCategory) -> impl TaskGuard + 'e {
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
    #[must_use]
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
    fn is_immutable(&self) -> bool;
    fn mark_as_immutable(&mut self);
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

    fn add_new(&mut self, item: CachedDataItem) {
        self.check_access(item.category());
        let added = self.add(item);
        assert!(added, "Item already exists");
    }

    fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let category = item.category();
        self.check_access(category);
        if !self.task_id.is_transient() && item.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.insert(item)
    }

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

    fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut<'_>> {
        let category = key.category();
        self.check_access(category);
        if !self.task_id.is_transient() && key.is_persistent() {
            self.task.track_modification(category.into_specific());
        }
        self.task.get_mut(key)
    }

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
        self.check_access(ty.category());
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

    fn is_immutable(&self) -> bool {
        self.task.state().is_immutable()
    }
    fn mark_as_immutable(&mut self) {
        self.task.state_mut().set_is_immutable(true);
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
        AggregatedDataUpdate, AggregationUpdateJob, get_aggregation_number, get_uppers,
        is_aggregating_node, is_root_node,
    },
    cleanup_old_edges::OutdatedEdge,
    connect_children::connect_children,
    prepare_new_children::prepare_new_children,
    update_cell::UpdateCellOperation,
    update_collectible::UpdateCollectibleOperation,
};
