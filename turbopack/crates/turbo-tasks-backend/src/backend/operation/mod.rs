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

use super::{storage::StorageWriteGuard, TurboTasksBackend};
use crate::{
    backend::{OperationGuard, TransientTask},
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
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
    backend: &'a TurboTasksBackend,
    turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    #[allow(dead_code)]
    operation_guard: Option<OperationGuard<'a>>,
    parent: Option<(&'a AnyOperation, &'a ExecuteContext<'a>)>,
}

impl<'a> ExecuteContext<'a> {
    pub fn new(
        backend: &'a TurboTasksBackend,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
            operation_guard: Some(backend.start_operation()),
            parent: None,
        }
    }

    pub fn task(&self, task_id: TaskId) -> TaskGuard<'a> {
        TaskGuard {
            task: self.backend.storage.access_mut(task_id),
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

    pub fn task_pair(&self, task_id1: TaskId, task_id2: TaskId) -> (TaskGuard<'a>, TaskGuard<'a>) {
        let (task1, task2) = self.backend.storage.access_pair_mut(task_id1, task_id2);
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
    backend: &'a TurboTasksBackend,
}

impl<'a> Debug for TaskGuard<'a> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut d = f.debug_struct("TaskGuard");
        d.field("task_id", &self.task_id);
        if let Some(task_type) = self.backend.task_cache.lookup_reverse(&self.task_id) {
            d.field("task_type", &task_type);
        };
        for (key, value) in self.task.iter() {
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
        if !item.is_persistent() {
            self.task.add(item)
        } else if self.task.add(item.clone()) {
            let (key, value) = item.into_key_and_value();
            self.backend
                .persisted_storage_log
                .lock()
                .push(CachedDataUpdate {
                    key,
                    task: self.task_id,
                    value: Some(value),
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
        if !key.is_persistent() {
            self.task
                .insert(CachedDataItem::from_key_and_value(key, value))
        } else if value.is_persistent() {
            let old = self.task.insert(CachedDataItem::from_key_and_value(
                key.clone(),
                value.clone(),
            ));
            self.backend
                .persisted_storage_log
                .lock()
                .push(CachedDataUpdate {
                    key,
                    task: self.task_id,
                    value: Some(value),
                });
            old
        } else {
            let item = CachedDataItem::from_key_and_value(key.clone(), value);
            if let Some(old) = self.task.insert(item) {
                if old.is_persistent() {
                    self.backend
                        .persisted_storage_log
                        .lock()
                        .push(CachedDataUpdate {
                            key,
                            task: self.task_id,
                            value: None,
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
        if !key.is_persistent() {
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
            let old_persistent = old.as_ref().map(|old| old.is_persistent()).unwrap_or(false);
            let new = update(old);
            let new_persistent = new.as_ref().map(|new| new.is_persistent()).unwrap_or(false);

            match (old_persistent, new_persistent) {
                (false, false) => {}
                (true, false) => {
                    add_persisting_item = true;
                    backend.persisted_storage_log.lock().push(CachedDataUpdate {
                        key: key.clone(),
                        task: *task_id,
                        value: None,
                    });
                }
                (_, true) => {
                    add_persisting_item = true;
                    backend.persisted_storage_log.lock().push(CachedDataUpdate {
                        key: key.clone(),
                        task: *task_id,
                        value: new.clone(),
                    });
                }
            }

            new
        });
        if add_persisting_item {
            // TODO task.persistance_state.add_persisting_item();
        }
    }

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        let old_value = self.task.remove(key);
        if let Some(value) = old_value {
            if key.is_persistent() && value.is_persistent() {
                let key = key.clone();
                self.backend
                    .persisted_storage_log
                    .lock()
                    .push(CachedDataUpdate {
                        key,
                        task: self.task_id,
                        value: None,
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

    pub fn iter(&self) -> impl Iterator<Item = (&CachedDataItemKey, &CachedDataItemValue)> {
        self.task.iter()
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

impl_operation!(ConnectChild connect_child::ConnectChildOperation);
impl_operation!(Invalidate invalidate::InvalidateOperation);
impl_operation!(CleanupOldEdges cleanup_old_edges::CleanupOldEdgesOperation);
impl_operation!(AggregationUpdate aggregation_update::AggregationUpdateQueue);

pub use aggregation_update::{is_root_node, AggregatedDataUpdate, AggregationUpdateJob};
pub use cleanup_old_edges::OutdatedEdge;
pub use update_cell::UpdateCellOperation;
pub use update_output::UpdateOutputOperation;
