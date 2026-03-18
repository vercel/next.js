//! Compact error representation for storage in the turbo-tasks backend.
//!
//! [`TurboTasksExecutionError`] contains the whole chain of errors. That is expensive to store and
//! we would duplicate error messages for many tasks. [`TaskError`] is a backend-internal
//! representation that replaces nested [`TurboTasksExecutionError::TaskContext`] chains with a flat
//! list of [`TaskId`]s (`TaskChain`), and omits the actual error message behind them. The actual
//! error content is recovered at read time by looking up the task's output, and task names are
//! resolved lazily via `TurboTasksCallApi::get_task_name`.

use std::sync::Arc;

use bincode::{Decode, Encode};
use smallvec::SmallVec;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    TaskId, TurboTasksPanic,
    backend::{TurboTasksExecutionError, TurboTasksExecutionErrorMessage},
};

/// An error with a message and an optional cause.
#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct TaskErrorItem {
    pub message: TurboTasksExecutionErrorMessage,
    pub source: Option<TaskError>,
}

/// Context for a local task that failed.
#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct LocalTaskContext {
    pub name: RcStr,
    pub source: Option<TaskError>,
}

/// Compact, serializable representation of a task execution error.
///
/// `TaskContext` chains are collapsed into a flat [`TaskChain`](TaskError::TaskChain) of
/// [`TaskId`]s. The source error is not stored in the chain; it is recovered by looking up the
/// output of the last task in the chain.
#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub enum TaskError {
    Panic(Arc<TurboTasksPanic>),
    Error(Box<TaskErrorItem>),
    LocalTaskContext(Box<LocalTaskContext>),
    /// A chain of task IDs representing nested `TaskContext` wrappers. The last element is the
    /// innermost task whose output holds the actual error. Earlier elements are outer tasks that
    /// propagated the error. The source error is not stored here. The task id acts as a pointer to
    /// the originating task's output.
    TaskChain(SmallVec<[TaskId; 4]>),
}

/// Converts a [`TurboTasksExecutionError`] into the compact [`TaskError`] representation.
/// Nested `TaskContext` chains are flattened into a single [`TaskError::TaskChain`].
impl From<&TurboTasksExecutionError> for TaskError {
    fn from(value: &TurboTasksExecutionError) -> Self {
        match value {
            TurboTasksExecutionError::Panic(panic) => TaskError::Panic(panic.clone()),
            TurboTasksExecutionError::Error(error) => TaskError::Error(Box::new(TaskErrorItem {
                message: error.message.clone(),
                source: error.source.as_ref().map(|e| e.into()),
            })),
            TurboTasksExecutionError::LocalTaskContext(local_task_context) => {
                TaskError::LocalTaskContext(Box::new(LocalTaskContext {
                    name: local_task_context.name.clone(),
                    source: local_task_context.source.as_ref().map(|e| e.into()),
                }))
            }
            TurboTasksExecutionError::TaskContext(task_context) => {
                let mut chain = SmallVec::new();
                chain.push(task_context.task_id);
                let mut current_error = task_context.source.as_ref();
                while let Some(error) = current_error {
                    match error {
                        TurboTasksExecutionError::TaskContext(task_context) => {
                            chain.push(task_context.task_id);
                            current_error = task_context.source.as_ref();
                        }
                        _ => {
                            return TaskError::TaskChain(chain);
                        }
                    }
                }
                TaskError::TaskChain(chain)
            }
        }
    }
}

/// Compares optional errors across the two representations.
fn eq_option(this: &Option<TaskError>, other: &Option<TurboTasksExecutionError>) -> bool {
    match (this, other) {
        (Some(this), Some(other)) => this == other,
        (None, None) => true,
        _ => false,
    }
}

/// Cross-type equality used to detect whether a task's stored error has changed (to avoid
/// unnecessary dirty-flagging). For `TaskChain`, only the task ID chain is compared — the source
/// error content is not checked because the chain acts as a pointer to the originating task.
impl PartialEq<TurboTasksExecutionError> for TaskError {
    fn eq(&self, other: &TurboTasksExecutionError) -> bool {
        match (self, other) {
            (TaskError::Panic(this), TurboTasksExecutionError::Panic(other)) => this == other,
            (TaskError::Error(this), TurboTasksExecutionError::Error(other)) => {
                this.message == other.message && eq_option(&this.source, &other.source)
            }
            (
                TaskError::LocalTaskContext(this),
                TurboTasksExecutionError::LocalTaskContext(other),
            ) => this.name == other.name && eq_option(&this.source, &other.source),
            (TaskError::TaskChain(chain), TurboTasksExecutionError::TaskContext(other)) => {
                if chain.is_empty() {
                    return false;
                }
                if chain[0] != other.task_id {
                    return false;
                }
                let mut current_source = other.source.as_ref();
                for &task_id in &chain[1..] {
                    if let Some(TurboTasksExecutionError::TaskContext(task_context)) =
                        current_source
                    {
                        if task_context.task_id != task_id {
                            return false;
                        }
                        current_source = task_context.source.as_ref();
                    } else {
                        return false;
                    }
                }
                // TaskError will stop at the last task in the chain (this is a pointer), so we do
                // not compare further.
                true
            }
            _ => false,
        }
    }
}
