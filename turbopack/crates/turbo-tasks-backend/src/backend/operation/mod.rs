mod aggregation_update;
mod cleanup_old_edges;
mod connect_child;
mod invalidate;
mod update_cell;
mod update_output;

use std::{
    fmt::{Debug, Formatter},
    mem::take,
};

use serde::{Deserialize, Serialize};
use turbo_tasks::{KeyValuePair, TaskId, TurboTasksBackendApi};

use super::{
    storage::StorageWriteGuard, TaskDataCategory, TurboTasksBackend, TurboTasksBackendInner,
};
use crate::{
    backend::{OperationGuard, TransientTask},
    data::{
        CachedDataItem, CachedDataItemIndex, CachedDataItemKey, CachedDataItemValue,
        CachedDataUpdate,
    },
};

pub trait Operation:
    Serialize
    + for<'de> Deserialize<'de>
    + Default
    + TryFrom<AnyOperation, Error = ()>
    + Into<AnyOperation>
{
    fn execute(self, ctx: &ExecuteContext<'_>);
}

pub struct ExecuteContext<'a> {
    backend: &'a TurboTasksBackendInner,
    turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    #[allow(dead_code)]
    operation_guard: Option<OperationGuard<'a>>,
    parent: Option<(&'a AnyOperation, &'a ExecuteContext<'a>)>,
}

impl<'a> ExecuteContext<'a> {
    pub(super) fn new(
        backend: &'a TurboTasksBackendInner,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            operation_guard: Some(backend.start_operation()),
            parent: None,
        }
    }

    pub fn task(&self, task_id: TaskId, category: TaskDataCategory) -> TaskGuard<'a> {
        let mut task = self.backend.storage.access_mut(task_id);
        if !task.persistance_state().is_restored(category) {
            if task_id.is_transient() {
                task.persistance_state_mut()
                    .set_restored(TaskDataCategory::All);
            } else {
                for category in category {
                    // Avoid holding the lock too long since this can also affect other tasks
                    drop(task);

                    let items = self.backend.backing_storage.lookup_data(task_id, category);
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
        TaskGuard {
            task,
            task_id,
            backend: self.backend,
        }
    }

    pub fn is_once_task(&self, task_id: TaskId) -> bool {
        if !task_id.is_transient() {
            return false;
        }
        if let Some(ty) = self.backend.transient_tasks.get(&task_id) {
            matches!(**ty, TransientTask::Once(_))
        } else {
            false
        }
    }

    pub fn task_pair(
        &self,
        task_id1: TaskId,
        task_id2: TaskId,
        category: TaskDataCategory,
    ) -> (TaskGuard<'a>, TaskGuard<'a>) {
        let (mut task1, mut task2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
        let is_restored1 = task1.persistance_state().is_restored(category);
        let is_restored2 = task2.persistance_state().is_restored(category);
        if !is_restored1 || !is_restored2 {
            for category in category {
                // Avoid holding the lock too long since this can also affect other tasks
                drop(task1);
                drop(task2);

                let items1 = (!is_restored1)
                    .then(|| self.backend.backing_storage.lookup_data(task_id1, category));
                let items2 = (!is_restored2)
                    .then(|| self.backend.backing_storage.lookup_data(task_id2, category));

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
            TaskGuard {
                task: task1,
                task_id: task_id1,
                backend: self.backend,
            },
            TaskGuard {
                task: task2,
                task_id: task_id2,
                backend: self.backend,
            },
        )
    }

    pub fn schedule(&self, task_id: TaskId) {
        self.turbo_tasks.schedule(task_id);
    }

    pub fn operation_suspend_point<T: Clone + Into<AnyOperation>>(&self, op: &T) {
        if self.parent.is_some() {
            self.backend.operation_suspend_point(|| {
                let mut nested = Vec::new();
                nested.push(op.clone().into());
                let mut cur = self;
                while let Some((op, parent_ctx)) = cur.parent {
                    nested.push(op.clone());
                    cur = parent_ctx;
                }
                AnyOperation::Nested(nested)
            });
        } else {
            self.backend.operation_suspend_point(|| op.clone().into());
        }
    }

    pub fn suspending_requested(&self) -> bool {
        self.backend.suspending_requested()
    }

    pub fn run_operation(
        &self,
        parent_op_ref: &mut impl Operation,
        run: impl FnOnce(ExecuteContext<'_>),
    ) {
        let parent_op = take(parent_op_ref);
        let parent_op: AnyOperation = parent_op.into();
        let inner_ctx = ExecuteContext {
            backend: self.backend,
            turbo_tasks: self.turbo_tasks,
            operation_guard: None,
            parent: Some((&parent_op, self)),
        };
        run(inner_ctx);
        *parent_op_ref = parent_op.try_into().unwrap();
    }
}

pub struct TaskGuard<'a> {
    task_id: TaskId,
    task: StorageWriteGuard<'a, TaskId, CachedDataItem>,
    backend: &'a TurboTasksBackendInner,
}

impl<'a> Debug for TaskGuard<'a> {
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

impl<'a> TaskGuard<'a> {
    pub fn id(&self) -> TaskId {
        self.task_id
    }

    #[must_use]
    pub fn add(&mut self, item: CachedDataItem) -> bool {
        if self.task_id.is_transient() || !item.is_persistent() {
            self.task.add(item)
        } else if self.task.add(item.clone()) {
            let (key, value) = item.into_key_and_value();
            self.task.persistance_state_mut().add_persisting_item();
            self.backend
                .persisted_storage_log(key.category())
                .lock()
                .push(CachedDataUpdate {
                    key,
                    task: self.task_id,
                    value: Some(value),
                    old_value: None,
                });
            true
        } else {
            false
        }
    }

    pub fn add_new(&mut self, item: CachedDataItem) {
        let added = self.add(item);
        assert!(added, "Item already exists");
    }

    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let (key, value) = item.into_key_and_value();
        if self.task_id.is_transient() || !key.is_persistent() {
            self.task
                .insert(CachedDataItem::from_key_and_value(key, value))
        } else if value.is_persistent() {
            let old = self.task.insert(CachedDataItem::from_key_and_value(
                key.clone(),
                value.clone(),
            ));
            self.task.persistance_state_mut().add_persisting_item();
            self.backend
                .persisted_storage_log(key.category())
                .lock()
                .push(CachedDataUpdate {
                    key,
                    task: self.task_id,
                    value: Some(value),
                    old_value: old
                        .as_ref()
                        .and_then(|old| old.is_persistent().then(|| old.clone())),
                });
            old
        } else {
            let item = CachedDataItem::from_key_and_value(key.clone(), value);
            if let Some(old) = self.task.insert(item) {
                if old.is_persistent() {
                    self.task.persistance_state_mut().add_persisting_item();
                    self.backend
                        .persisted_storage_log(key.category())
                        .lock()
                        .push(CachedDataUpdate {
                            key,
                            task: self.task_id,
                            value: None,
                            old_value: Some(old.clone()),
                        });
                }
                Some(old)
            } else {
                None
            }
        }
    }

    pub fn update(
        &mut self,
        key: &CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        if self.task_id.is_transient() || !key.is_persistent() {
            self.task.update(key, update);
            return;
        }
        let Self {
            task,
            task_id,
            backend,
        } = self;
        let mut add_persisting_item = false;
        task.update(key, |old| {
            let old_value_when_persistent = old
                .as_ref()
                .map(|old| old.is_persistent().then(|| old.clone()))
                .flatten();
            let new = update(old);
            let new_persistent = new.as_ref().map(|new| new.is_persistent()).unwrap_or(false);

            match (old_value_when_persistent, new_persistent) {
                (None, false) => {}
                (Some(old_value), false) => {
                    add_persisting_item = true;
                    backend
                        .persisted_storage_log(key.category())
                        .lock()
                        .push(CachedDataUpdate {
                            key: key.clone(),
                            task: *task_id,
                            value: None,
                            old_value: Some(old_value),
                        });
                }
                (old_value, true) => {
                    add_persisting_item = true;
                    backend
                        .persisted_storage_log(key.category())
                        .lock()
                        .push(CachedDataUpdate {
                            key: key.clone(),
                            task: *task_id,
                            value: new.clone(),
                            old_value,
                        });
                }
            }

            new
        });
        if add_persisting_item {
            task.persistance_state_mut().add_persisting_item();
        }
    }

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        let old_value = self.task.remove(key);
        if let Some(value) = old_value {
            if !self.task_id.is_transient() && key.is_persistent() && value.is_persistent() {
                let key = key.clone();
                self.task.persistance_state_mut().add_persisting_item();
                self.backend
                    .persisted_storage_log(key.category())
                    .lock()
                    .push(CachedDataUpdate {
                        key,
                        task: self.task_id,
                        value: None,
                        old_value: value.is_persistent().then(|| value.clone()),
                    });
            }
            Some(value)
        } else {
            None
        }
    }

    pub fn get(&self, key: &CachedDataItemKey) -> Option<&CachedDataItemValue> {
        self.task.get(key)
    }

    pub fn has_key(&self, key: &CachedDataItemKey) -> bool {
        self.task.has_key(key)
    }

    pub fn is_indexed(&self) -> bool {
        self.task.is_indexed()
    }

    pub fn iter(
        &self,
        index: CachedDataItemIndex,
    ) -> impl Iterator<Item = (&CachedDataItemKey, &CachedDataItemValue)> {
        self.task.iter(Some(index))
    }

    pub fn iter_all(&self) -> impl Iterator<Item = (&CachedDataItemKey, &CachedDataItemValue)> {
        self.task.iter_all()
    }

    pub fn invalidate_serialization(&mut self) {
        let mut count = 0;
        let cell_data = self
            .iter(CachedDataItemIndex::CellData)
            .filter_map(|(key, value)| match (key, value) {
                (CachedDataItemKey::CellData { cell }, CachedDataItemValue::CellData { value }) => {
                    count += 1;
                    Some(CachedDataUpdate {
                        task: self.task_id,
                        key: CachedDataItemKey::CellData { cell: *cell },
                        value: Some(CachedDataItemValue::CellData {
                            value: value.clone(),
                        }),
                        old_value: None,
                    })
                }
                _ => None,
            });
        {
            let mut guard = self
                .backend
                .persisted_storage_log(TaskDataCategory::Data)
                .lock();
            guard.extend(cell_data);
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
    CleanupOldEdges(cleanup_old_edges::CleanupOldEdgesOperation),
    AggregationUpdate(aggregation_update::AggregationUpdateQueue),
    Nested(Vec<AnyOperation>),
}

impl AnyOperation {
    pub fn execute(self, ctx: &ExecuteContext<'_>) {
        match self {
            AnyOperation::ConnectChild(op) => op.execute(ctx),
            AnyOperation::Invalidate(op) => op.execute(ctx),
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
impl_operation!(CleanupOldEdges cleanup_old_edges::CleanupOldEdgesOperation);
impl_operation!(AggregationUpdate aggregation_update::AggregationUpdateQueue);

pub use aggregation_update::{
    get_aggregation_number, is_root_node, AggregatedDataUpdate, AggregationUpdateJob,
};
pub use cleanup_old_edges::OutdatedEdge;
pub use update_cell::UpdateCellOperation;
pub use update_output::UpdateOutputOperation;
