mod connect_child;

use serde::{Deserialize, Serialize};
use turbo_tasks::{KeyValuePair, TaskId, TurboTasksBackendApi};

use super::{storage::StorageWriteGuard, TurboTasksBackend};
use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate};

pub trait Operation: Serialize + for<'de> Deserialize<'de> {
    fn execute(self, ctx: ExecuteContext<'_>);
}

pub struct ExecuteContext<'a> {
    backend: &'a TurboTasksBackend,
    turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
}

impl<'a> ExecuteContext<'a> {
    pub fn new(
        backend: &'a TurboTasksBackend,
        turbo_tasks: &'a dyn TurboTasksBackendApi<TurboTasksBackend>,
    ) -> Self {
        Self {
            backend,
            turbo_tasks,
        }
    }

    pub fn task(&self, task_id: TaskId) -> TaskGuard<'a> {
        TaskGuard {
            task: self.backend.storage.access_mut(task_id),
            task_id,
            backend: self.backend,
        }
    }

    pub fn operation_suspend_point(&self, f: impl FnOnce() -> AnyOperation) {
        self.backend.operation_suspend_point(f)
    }
}

pub struct TaskGuard<'a> {
    task_id: TaskId,
    task: StorageWriteGuard<'a, TaskId, CachedDataItem>,
    backend: &'a TurboTasksBackend,
}

impl<'a> TaskGuard<'a> {
    fn new(
        task_id: TaskId,
        task: StorageWriteGuard<'a, TaskId, CachedDataItem>,
        backend: &'a TurboTasksBackend,
    ) -> Self {
        Self {
            task_id,
            task,
            backend,
        }
    }

    pub fn add(&mut self, item: CachedDataItem) -> bool {
        if !item.is_persistent() {
            self.task.add(item)
        } else {
            if self.task.add(item.clone()) {
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
    }

    pub fn upsert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let (key, value) = item.into_key_and_value();
        if !key.is_persistent() {
            self.task
                .upsert(CachedDataItem::from_key_and_value(key, value))
        } else if value.is_persistent() {
            let old = self.task.upsert(CachedDataItem::from_key_and_value(
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
            if let Some(old) = self.task.upsert(item) {
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

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        let old_value = self.task.remove(&key);
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
}

macro_rules! impl_operation {
    ($name:ident $type_path:path) => {
        impl From<$type_path> for AnyOperation {
            fn from(op: $type_path) -> Self {
                AnyOperation::$name(op)
            }
        }

        pub use $type_path;
    };
}

#[derive(Serialize, Deserialize)]
pub enum AnyOperation {
    ConnectChild(connect_child::ConnectChildOperation),
}

impl Operation for AnyOperation {
    fn execute(self, ctx: ExecuteContext<'_>) {
        match self {
            AnyOperation::ConnectChild(op) => op.execute(ctx),
        }
    }
}

impl_operation!(ConnectChild connect_child::ConnectChildOperation);

#[macro_export(local_inner_macros)]
macro_rules! suspend_point {
    ($self:expr, $ctx:expr, $op:expr) => {
        $self = $op;
        $ctx.operation_suspend_point(|| $self.clone().into());
    };
}
