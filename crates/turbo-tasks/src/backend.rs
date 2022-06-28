use anyhow::{anyhow, Result};
use event_listener::EventListener;
use serde::{Deserialize, Serialize};
use std::{
    any::Any,
    collections::HashMap,
    fmt::{Debug, Display},
    future::Future,
    pin::Pin,
    sync::Arc,
};

use crate::{
    manager::TurboTasksBackendApi,
    registry,
    task_input::{SharedReference, SharedValue},
    FunctionId, RawVc, RawVcReadResult, TaskId, TaskIdProvider, TaskInput, TraitTypeId,
    ValueTypeId,
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

impl Debug for TransientTaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Root(_) => f.debug_tuple("Root").finish(),
            Self::Once(_) => f.debug_tuple("Once").finish(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
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

impl PersistentTaskType {
    pub fn len(&self) -> usize {
        match self {
            PersistentTaskType::Native(_, v)
            | PersistentTaskType::ResolveNative(_, v)
            | PersistentTaskType::ResolveTrait(_, _, v) => v.len(),
        }
    }

    pub fn partial(&self, len: usize) -> Self {
        match self {
            PersistentTaskType::Native(f, v) => PersistentTaskType::Native(*f, v[..len].to_vec()),
            PersistentTaskType::ResolveNative(f, v) => {
                PersistentTaskType::ResolveNative(*f, v[..len].to_vec())
            }
            PersistentTaskType::ResolveTrait(f, n, v) => {
                PersistentTaskType::ResolveTrait(*f, n.clone(), v[..len].to_vec())
            }
        }
    }
}

#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct SlotMappings {
    // TODO use [SerializableMagicAny]
    pub by_key: HashMap<(ValueTypeId, SharedValue), usize>,
    pub by_type: HashMap<ValueTypeId, (usize, Vec<usize>)>,
}

impl SlotMappings {
    pub fn reset(&mut self) {
        for list in self.by_type.values_mut() {
            list.0 = 0;
        }
    }
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
            Some(content) => Display::fmt(content, f),
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
    #[allow(unused_variables)]
    fn initialize(&mut self, task_id_provider: &dyn TaskIdProvider) {}
    #[allow(unused_variables)]
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi) {}
    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi) {}
    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi);
    fn invalidate_tasks(&self, tasks: Vec<TaskId>, turbo_tasks: &dyn TurboTasksBackendApi);
    fn get_task_description(&self, task: TaskId) -> String;
    type ExecutionScopeFuture<T: Future<Output = ()> + Send + 'static>: Future<Output = ()>
        + Send
        + 'static;
    fn execution_scope<T: Future<Output = ()> + Send + 'static>(
        &self,
        task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T>;
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>>;
    unsafe fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<RawVc, EventListener>>;

    fn track_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    );

    fn try_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<SlotContent, EventListener>>;

    unsafe fn try_read_task_slot_untracked(
        &self,
        task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<SlotContent, EventListener>>;

    unsafe fn try_read_own_task_slot(
        &self,
        current_task: TaskId,
        index: usize,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<SlotContent> {
        unsafe {
            match self.try_read_task_slot_untracked(current_task, index, turbo_tasks)? {
                Ok(content) => Ok(content),
                Err(_) => Ok(SlotContent(None)),
            }
        }
    }

    fn track_read_task_slot(
        &self,
        task: TaskId,
        index: usize,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    );

    fn get_fresh_slot(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi) -> usize;

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
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId;
    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> TaskId;
}

impl PersistentTaskType {
    pub async fn run_resolve_native(
        fn_id: FunctionId,
        inputs: Vec<TaskInput>,
        turbo_tasks: Arc<dyn TurboTasksBackendApi>,
    ) -> Result<RawVc> {
        let mut resolved_inputs = Vec::new();
        for input in inputs.into_iter() {
            resolved_inputs.push(input.resolve().await?)
        }
        Ok(turbo_tasks.native_call(fn_id, resolved_inputs))
    }

    pub async fn run_resolve_trait(
        trait_type: TraitTypeId,
        name: String,
        inputs: Vec<TaskInput>,
        turbo_tasks: Arc<dyn TurboTasksBackendApi>,
    ) -> Result<RawVc> {
        let mut resolved_inputs = Vec::new();
        let mut iter = inputs.into_iter();
        if let Some(this) = iter.next() {
            let this = this.resolve().await?;
            let this_value = this.clone().resolve_to_value().await?;
            match this_value.get_trait_method(trait_type, name.clone()) {
                Some(native_fn) => {
                    resolved_inputs.push(this);
                    for input in iter {
                        resolved_inputs.push(input)
                    }
                    Ok(turbo_tasks.dynamic_call(native_fn, resolved_inputs))
                }
                None => {
                    if !this_value.has_trait(trait_type) {
                        let traits = this_value
                            .traits()
                            .iter()
                            .map(|t| format!(" {}", t))
                            .collect::<String>();
                        Err(anyhow!(
                            "{} doesn't implement {} (only{})",
                            this_value,
                            registry::get_trait(trait_type),
                            traits,
                        ))
                    } else {
                        Err(anyhow!(
                            "{} implements trait {}, but method {} is missing",
                            this_value,
                            registry::get_trait(trait_type),
                            name
                        ))
                    }
                }
            }
        } else {
            panic!("No arguments for trait call");
        }
    }

    pub fn run(
        self,
        turbo_tasks: Arc<dyn TurboTasksBackendApi>,
    ) -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> {
        match self {
            PersistentTaskType::Native(fn_id, inputs) => {
                let native_fn = registry::get_function(fn_id);
                let bound = native_fn.bind(&inputs);
                (bound)()
            }
            PersistentTaskType::ResolveNative(fn_id, inputs) => {
                Box::pin(Self::run_resolve_native(fn_id, inputs, turbo_tasks))
            }
            PersistentTaskType::ResolveTrait(trait_type, name, inputs) => Box::pin(
                Self::run_resolve_trait(trait_type, name, inputs, turbo_tasks),
            ),
        }
    }
}
