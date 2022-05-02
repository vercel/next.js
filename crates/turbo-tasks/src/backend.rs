use anyhow::{anyhow, Result};
use event_listener::EventListener;
use serde::{Deserialize, Serialize};
use std::{any::Any, collections::HashMap, fmt::Display, future::Future, pin::Pin};

use crate::{
    id_factory::IdFactory, magic_any::MagicAny, manager::TurboTasksBackendApi,
    task_input::SharedReference, FunctionId, RawVc, RawVcReadResult, TaskId, TaskInput,
    TraitTypeId, ValueTypeId,
};

pub use crate::id::BackgroundJobId;

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

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SlotContent(pub Option<SharedReference>);

impl Display for SlotContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.0 {
            None => write!(f, "empty"),
            Some(content) => content.fmt(f),
        }
    }
}

impl SlotContent {
    pub fn cast<T: Any + Send + Sync>(self) -> Result<RawVcReadResult<T>> {
        match self.0 {
            None => Err(anyhow!("Slot it empty")),
            Some(data) => match data.downcast() {
                Some(data) => Ok(RawVcReadResult::new(data)),
                None => Err(anyhow!("Unexpected type in slot")),
            },
        }
    }

    pub fn try_cast<T: Any + Send + Sync>(self) -> Option<RawVcReadResult<T>> {
        match self.0 {
            None => None,
            Some(data) => data.downcast().map(|data| RawVcReadResult::new(data)),
        }
    }
}

pub trait Backend: Sync + Send {
    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi);
    fn notify_slot_change(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksBackendApi);
    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec>;
    #[must_use]
    fn task_execution_completed(
        &self,
        task: TaskId,
        slot_mappings: Option<SlotMappings>,
        result: Result<RawVc>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool;
    fn run_background_job<'a>(
        &'a self,
        id: BackgroundJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
    ) -> Result<Result<RawVc>, EventListener>;
    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
    ) -> Result<Result<RawVc>, EventListener>;

    fn read_task_slot(&self, task: TaskId, index: usize, reader: TaskId) -> SlotContent;

    unsafe fn read_task_slot_untracked(&self, task: TaskId, index: usize) -> SlotContent;

    fn get_fresh_slot(&self, task: TaskId) -> usize;

    fn update_task_slot(
        &self,
        task: TaskId,
        index: usize,
        content: SlotContent,
        turbo_tasks: &dyn TurboTasksBackendApi,
    );

    fn get_or_create_persistent_task(
        &self,
        task_type: PersistentTaskType,
        id_factory: &IdFactory<TaskId>,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId;
    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        id_factory: &IdFactory<TaskId>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId;
}
