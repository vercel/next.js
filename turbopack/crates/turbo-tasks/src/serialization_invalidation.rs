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

    /// The task whose serialized form should be re-emitted on the next
    /// snapshot. Exposed so callers that already hold a `TurboTasksApi`
    /// reference can fold the serialization-invalidation into a larger
    /// batch without paying for another `with_turbo_tasks` lookup.
    pub(crate) fn task(&self) -> TaskId {
        self.task
    }

    pub(crate) fn new(task_id: TaskId) -> Self {
        Self { task: task_id }
    }
}
