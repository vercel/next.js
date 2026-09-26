use std::hash::Hash;

use bincode::{Decode, Encode};
use turbo_tasks_macros::NonLocalValue;

use crate as turbo_tasks;
use crate::{TaskId, manager::with_turbo_tasks};

/// A handle to safely mutate a turbo-task value outside of the normal `cell` lifecycle.
///
/// Obtained with [`get_interior_mutator`][crate::get_interior_mutator] while running the task that
/// constructs the value. Mutation can be triggered from any task.
#[derive(Clone, Hash, Eq, PartialEq, Encode, Decode, NonLocalValue)]
pub struct InteriorMutator {
    task: TaskId,
}

impl InteriorMutator {
    /// Runs `mutate`, which must contain every in-memory change to the interior state, and marks
    /// the owning task's persisted form out of date. Returns what `mutate` returned.
    ///
    /// `mutate` must be short and must not call back into turbo-tasks. Debug builds panic when
    /// this happens.
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
