use anyhow::Result;
use std::{collections::HashMap, future::Future, pin::Pin};

use crate::{
    id::BackgroundJobId, magic_any::MagicAny, manager::TurboTasksApi, FunctionId, RawVc, Task,
    TaskId, TaskInput, TraitTypeId, ValueTypeId,
};

/// Different Task types
pub enum TaskType {
    /// Tasks that only exist for a certain operation and
    /// won't persist between sessions
    Transient(TransientTaskType),

    /// Tasks that can persist between sessions and potentially
    /// shared globally
    Persistent(PersistentTaskType),
}

pub enum TransientTaskType {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    /// Always active. Automatically scheduled.
    Root(Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    /// Active until done. Automatically scheduled.
    Once(Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>),
}

pub enum PersistentTaskType {
    /// A normal task execution a native (rust) function
    Native(FunctionId, Vec<TaskInput>),

    /// A resolve task, which resolves arguments and calls the function with
    /// resolve arguments. The inner function call will do a cache lookup.
    ResolveNative(FunctionId, Vec<TaskInput>),

    /// A trait method resolve task. It resolves the first (`self`) argument and
    /// looks up the trait method on that value. Then it calls that method.
    /// The method call will do a cache lookup and might resolve arguments
    /// before.
    ResolveTrait(TraitTypeId, String, Vec<TaskInput>),
}

#[derive(Default)]
pub struct SlotMappings {
    // TODO use [SerializableMagicAny]
    pub by_key: HashMap<(ValueTypeId, Box<dyn MagicAny>), usize>,
    pub by_type: HashMap<ValueTypeId, (usize, Vec<usize>)>,
}

pub struct TaskExecutionSpec {
    pub slot_mappings: Option<SlotMappings>,
    pub future: Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>,
}

pub trait Backend: Sync + Send {
    unsafe fn insert_task(&self, id: TaskId, task_type: TaskType);
    unsafe fn remove_task(&self, id: TaskId);
    fn connect_task_child(&self, parent: TaskId, child: TaskId, turbo_tasks: &dyn TurboTasksApi);
    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksApi);
    fn notify_slot_change(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksApi);
    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> Option<TaskExecutionSpec>;
    #[must_use]
    fn task_execution_completed(
        &self,
        task: TaskId,
        slot_mappings: Option<SlotMappings>,
        result: Result<RawVc>,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> bool;
    fn run_background_job<'a>(
        &'a self,
        id: BackgroundJobId,
        turbo_tasks: &'a dyn TurboTasksApi,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;
    // TODO Task should be private to the backend, this method need to be removed
    fn with_task<T>(&self, id: TaskId, func: impl FnOnce(&Task) -> T) -> T;
}
