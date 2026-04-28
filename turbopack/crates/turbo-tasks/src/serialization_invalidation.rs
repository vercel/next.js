use std::hash::Hash;

use bincode::{Decode, Encode};
use turbo_tasks_macros::NonLocalValue;

use crate as turbo_tasks;
use crate::{TaskId, manager::with_turbo_tasks, trace::TraceRawVcs};

/// Allows a turbo-tasks value type to notify the backend that its serialized
/// state has changed out-of-band (i.e. without going through the normal
/// output-cell mechanism).
///
/// `invalidate` must always be called from within a turbo-tasks execution
/// context (i.e. inside a `#[turbo_tasks::function]` body or a `State`
/// mutation triggered from one), so `TURBO_TASKS` task-local is always
/// available and we do not need to capture handles at construction time.
#[derive(Clone, Hash, Eq, PartialEq, Encode, Decode, TraceRawVcs, NonLocalValue)]
pub struct SerializationInvalidator {
    task: TaskId,
}

impl SerializationInvalidator {
    pub fn invalidate(&self) {
        with_turbo_tasks(|tt| tt.invalidate_serialization(self.task));
    }

    pub(crate) fn new(task_id: TaskId) -> Self {
        Self { task: task_id }
    }
}
