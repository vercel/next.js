use std::sync::Arc;

use bincode::{Decode, Encode};
use smallvec::SmallVec;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    TaskId, TurboTasksPanic,
    backend::{TurboTasksExecutionError, TurboTasksExecutionErrorMessage},
};

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct TaskErrorItem {
    pub message: TurboTasksExecutionErrorMessage,
    pub source: Option<TaskError>,
}

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub struct LocalTaskContext {
    pub name: RcStr,
    pub source: Option<TaskError>,
}

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub enum TaskError {
    Panic(Arc<TurboTasksPanic>),
    Error(Box<TaskErrorItem>),
    LocalTaskContext(Box<LocalTaskContext>),
    TaskChain(SmallVec<[TaskId; 4]>),
}

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

fn eq_option(this: &Option<TaskError>, other: &Option<TurboTasksExecutionError>) -> bool {
    match (this, other) {
        (Some(this), Some(other)) => this == other,
        (None, None) => true,
        _ => false,
    }
}

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
                    match current_source {
                        Some(other) => match other {
                            TurboTasksExecutionError::TaskContext(task_context) => {
                                if task_context.task_id != task_id {
                                    return false;
                                }
                                current_source = task_context.source.as_ref();
                            }
                            _ => return false,
                        },
                        None => return false,
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
