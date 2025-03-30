use std::{
    hash::Hash,
    sync::{Arc, Weak},
};

use serde::{de::Visitor, Deserialize, Serialize};
use tokio::runtime::Handle;

use crate::{manager::with_turbo_tasks, trace::TraceRawVcs, TaskId, TurboTasksApi};

#[derive(Clone)]
pub struct SerializationInvalidator {
    task: TaskId,
    turbo_tasks: Weak<dyn TurboTasksApi>,
    handle: Handle,
}

impl Hash for SerializationInvalidator {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.task.hash(state);
    }
}

impl PartialEq for SerializationInvalidator {
    fn eq(&self, other: &Self) -> bool {
        self.task == other.task
    }
}

impl Eq for SerializationInvalidator {}

impl SerializationInvalidator {
    pub fn invalidate(&self) {
        let SerializationInvalidator {
            task,
            turbo_tasks,
            handle,
        } = self;
        let _guard = handle.enter();
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks.invalidate_serialization(*task);
        }
    }

    pub(crate) fn new(task_id: TaskId) -> Self {
        Self {
            task: task_id,
            turbo_tasks: with_turbo_tasks(Arc::downgrade),
            handle: Handle::current(),
        }
    }
}

impl TraceRawVcs for SerializationInvalidator {
    fn trace_raw_vcs(&self, _context: &mut crate::trace::TraceRawVcsContext) {
        // nothing here
    }
}

impl Serialize for SerializationInvalidator {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_newtype_struct("SerializationInvalidator", &self.task)
    }
}

impl<'de> Deserialize<'de> for SerializationInvalidator {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct V;

        impl<'de> Visitor<'de> for V {
            type Value = SerializationInvalidator;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "an SerializationInvalidator")
            }

            fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                Ok(SerializationInvalidator {
                    task: TaskId::deserialize(deserializer)?,
                    turbo_tasks: with_turbo_tasks(Arc::downgrade),
                    handle: tokio::runtime::Handle::current(),
                })
            }
        }
        deserializer.deserialize_newtype_struct("SerializationInvalidator", V)
    }
}
