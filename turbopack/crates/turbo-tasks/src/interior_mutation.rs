use std::hash::Hash;

use bincode::{Decode, Encode};
use turbo_tasks_macros::NonLocalValue;

use crate as turbo_tasks;
use crate::{TaskId, manager::with_turbo_tasks};

/// Lets a turbo-tasks value type mutate its interior (i.e. change state without going through the
/// normal output-cell mechanism) while keeping the backend's persisted copy of it in sync.
///
/// Obtained with [`get_interior_mutator`][crate::get_interior_mutator] while constructing the
/// value, and must always be used from within a turbo-tasks execution context (i.e. inside a
/// `#[turbo_tasks::function]` body or a `State` mutation triggered from one), so the `TURBO_TASKS`
/// task-local is always available and we do not need to capture handles at construction time.
#[derive(Clone, Hash, Eq, PartialEq, Encode, Decode, NonLocalValue)]
pub struct InteriorMutator {
    task: TaskId,
}

impl InteriorMutator {
    /// Runs `mutate`, which must contain every in-memory change to the interior state, and marks
    /// the owning task's persisted form out of date. Returns what `mutate` returned.
    ///
    /// Marking and mutating are one step because doing them separately loses changes: marking
    /// afterwards lets eviction drop the changed copy before the mark lands, and marking beforehand
    /// lets a snapshot persist the old value and clear the mark before the change. The backend
    /// marks first and keeps snapshots out until `mutate` returns.
    ///
    /// `mutate` must be short and must not call back into turbo-tasks: no reading cells, calling
    /// functions, running invalidators, or creating or dropping a `GcRoot` (return a replaced value
    /// and drop it afterwards instead). It runs inside a backend operation, so turbo-tasks work
    /// started from it would begin another one, which can wait on a snapshot that is itself waiting
    /// on `mutate`. Debug builds panic when this happens.
    pub fn mutate<R>(&self, mutate: impl FnOnce() -> R) -> R {
        let mut mutate = Some(mutate);
        let mut result = None;
        with_turbo_tasks(|tt| {
            tt.mutate_interior(self.task, &mut || {
                result = Some((mutate.take().expect("mutate is only called once"))());
            })
        });
        result.expect("the backend must call mutate")
    }

    pub(crate) fn new(task_id: TaskId) -> Self {
        Self { task: task_id }
    }
}
