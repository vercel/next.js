use std::{
    any::Any,
    borrow::Cow,
    fmt,
    fmt::{Debug, Display, Write},
    future::Future,
    mem::take,
    pin::Pin,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, bail, Result};
use auto_hash_map::AutoMap;
use serde::{Deserialize, Serialize};
use tracing::Span;

pub use crate::id::{BackendJobId, ExecutionId};
use crate::{
    event::EventListener,
    manager::TurboTasksBackendApi,
    raw_vc::CellId,
    registry,
    trait_helpers::{get_trait_method, has_trait, traits},
    ConcreteTaskInput, FunctionId, RawVc, ReadRef, SharedReference, TaskId, TaskIdProvider,
    TaskIdSet, TraitRef, TraitTypeId, ValueTypeId, VcValueTrait, VcValueType,
};

pub enum TaskType {
    /// Tasks that only exist for a certain operation and
    /// won't persist between sessions
    Transient(TransientTaskType),

    /// Tasks that can persist between sessions and potentially
    /// shared globally
    Persistent(PersistentTaskType),
}

type TransientTaskRoot =
    Box<dyn Fn() -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> + Send + Sync>;

pub enum TransientTaskType {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

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
    Native {
        fn_type: FunctionId,
        this: Option<RawVc>,
        args: Vec<ConcreteTaskInput>,
    },

    /// A resolve task, which resolves arguments and calls the function with
    /// resolve arguments. The inner function call will do a cache lookup.
    ResolveNative {
        fn_type: FunctionId,
        this: Option<RawVc>,
        args: Vec<ConcreteTaskInput>,
    },

    /// A trait method resolve task. It resolves the first (`self`) argument and
    /// looks up the trait method on that value. Then it calls that method.
    /// The method call will do a cache lookup and might resolve arguments
    /// before.
    ResolveTrait {
        trait_type: TraitTypeId,
        method_name: Cow<'static, str>,
        this: RawVc,
        args: Vec<ConcreteTaskInput>,
    },
}

impl Display for PersistentTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.get_name())
    }
}

impl PersistentTaskType {
    pub fn shrink_to_fit(&mut self) {
        match self {
            Self::Native {
                fn_type: _,
                this: _,
                args: inputs,
            } => inputs.shrink_to_fit(),
            Self::ResolveNative {
                fn_type: _,
                this: _,
                args: inputs,
            } => inputs.shrink_to_fit(),
            Self::ResolveTrait {
                trait_type: _,
                method_name: _,
                this: _,
                args: inputs,
            } => inputs.shrink_to_fit(),
        }
    }

    pub fn len(&self) -> usize {
        match self {
            PersistentTaskType::Native {
                fn_type: _,
                this: _,
                args: v,
            }
            | PersistentTaskType::ResolveNative {
                fn_type: _,
                this: _,
                args: v,
            }
            | PersistentTaskType::ResolveTrait {
                trait_type: _,
                method_name: _,
                this: _,
                args: v,
            } => v.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        match self {
            PersistentTaskType::Native {
                fn_type: _,
                this: _,
                args: v,
            }
            | PersistentTaskType::ResolveNative {
                fn_type: _,
                this: _,
                args: v,
            }
            | PersistentTaskType::ResolveTrait {
                trait_type: _,
                method_name: _,
                this: _,
                args: v,
            } => v.is_empty(),
        }
    }

    pub fn partial(&self, len: usize) -> Self {
        match self {
            PersistentTaskType::Native {
                fn_type: f,
                this,
                args: v,
            } => PersistentTaskType::Native {
                fn_type: *f,
                this: *this,
                args: v[..len].to_vec(),
            },
            PersistentTaskType::ResolveNative {
                fn_type: f,
                this,
                args: v,
            } => PersistentTaskType::ResolveNative {
                fn_type: *f,
                this: *this,
                args: v[..len].to_vec(),
            },
            PersistentTaskType::ResolveTrait {
                trait_type: f,
                method_name: n,
                this,
                args: v,
            } => PersistentTaskType::ResolveTrait {
                trait_type: *f,
                method_name: n.clone(),
                this: *this,
                args: v[..len].to_vec(),
            },
        }
    }

    /// Returns the name of the function in the code. Trait methods are
    /// formatted as `TraitName::method_name`.
    ///
    /// Equivalent to [`ToString::to_string`], but potentially more efficient as
    /// it can return a `&'static str` in many cases.
    pub fn get_name(&self) -> Cow<'static, str> {
        match self {
            PersistentTaskType::Native {
                fn_type: native_fn,
                this: _,
                args: _,
            }
            | PersistentTaskType::ResolveNative {
                fn_type: native_fn,
                this: _,
                args: _,
            } => Cow::Borrowed(&registry::get_function(*native_fn).name),
            PersistentTaskType::ResolveTrait {
                trait_type: trait_id,
                method_name: fn_name,
                this: _,
                args: _,
            } => format!("{}::{}", registry::get_trait(*trait_id).name, fn_name).into(),
        }
    }
}

pub struct TaskExecutionSpec {
    pub future: Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>,
    pub span: Span,
}

// TODO technically CellContent is already indexed by the ValueTypeId, so we
// don't need to store it here
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CellContent(pub Option<SharedReference>);

impl Display for CellContent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.0 {
            None => write!(f, "empty"),
            Some(content) => Display::fmt(content, f),
        }
    }
}

impl CellContent {
    pub fn cast<T: Any + VcValueType>(self) -> Result<ReadRef<T>> {
        let data = self.0.ok_or_else(|| anyhow!("Cell is empty"))?;
        let data = data
            .downcast()
            .map_err(|_err| anyhow!("Unexpected type in cell"))?;
        Ok(ReadRef::new_arc(data))
    }

    /// # Safety
    ///
    /// The caller must ensure that the CellContent contains a vc that
    /// implements T.
    pub fn cast_trait<T>(self) -> Result<TraitRef<T>>
    where
        T: VcValueTrait + ?Sized,
    {
        let shared_reference = self.0.ok_or_else(|| anyhow!("Cell is empty"))?;
        if shared_reference.0.is_none() {
            bail!("Cell content is untyped");
        }
        Ok(
            // Safety: We just checked that the content is typed.
            TraitRef::new(shared_reference),
        )
    }

    pub fn try_cast<T: Any + VcValueType>(self) -> Option<ReadRef<T>> {
        Some(ReadRef::new_arc(self.0?.downcast().ok()?))
    }
}

pub trait Backend: Sync + Send {
    #[allow(unused_variables)]
    fn initialize(&mut self, task_id_provider: &dyn TaskIdProvider) {}

    #[allow(unused_variables)]
    fn startup(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn stop(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    #[allow(unused_variables)]
    fn idle_start(&self, turbo_tasks: &dyn TurboTasksBackendApi<Self>) {}

    fn invalidate_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn invalidate_tasks(&self, tasks: &[TaskId], turbo_tasks: &dyn TurboTasksBackendApi<Self>);
    fn invalidate_tasks_set(&self, tasks: &TaskIdSet, turbo_tasks: &dyn TurboTasksBackendApi<Self>);

    fn get_task_description(&self, task: TaskId) -> String;

    type ExecutionScopeFuture<T: Future<Output = Result<()>> + Send + 'static>: Future<Output = Result<()>>
        + Send
        + 'static;

    fn execution_scope<T: Future<Output = Result<()>> + Send + 'static>(
        &self,
        task: TaskId,
        future: T,
    ) -> Self::ExecutionScopeFuture<T>;

    fn try_start_task_execution(
        &self,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Option<TaskExecutionSpec>;

    fn task_execution_result(
        &self,
        task: TaskId,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn task_execution_completed(
        &self,
        task: TaskId,
        duration: Duration,
        memory_usage: usize,
        stateful: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> bool;

    fn run_backend_job<'a>(
        &'a self,
        id: BackendJobId,
        turbo_tasks: &'a dyn TurboTasksBackendApi<Self>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

    fn try_read_task_output(
        &self,
        task: TaskId,
        reader: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_output_untracked(
        &self,
        task: TaskId,
        strongly_consistent: bool,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<RawVc, EventListener>>;

    fn try_read_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<CellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_task_cell_untracked(
        &self,
        task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<Result<CellContent, EventListener>>;

    /// INVALIDATION: Be careful with this, it will not track dependencies, so
    /// using it could break cache invalidation.
    fn try_read_own_task_cell_untracked(
        &self,
        current_task: TaskId,
        index: CellId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> Result<CellContent> {
        match self.try_read_task_cell_untracked(current_task, index, turbo_tasks)? {
            Ok(content) => Ok(content),
            Err(_) => Ok(CellContent(None)),
        }
    }

    fn read_task_collectibles(
        &self,
        task: TaskId,
        trait_id: TraitTypeId,
        reader: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> AutoMap<RawVc, i32>;

    fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn update_task_cell(
        &self,
        task: TaskId,
        index: CellId,
        content: CellContent,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn get_or_create_persistent_task(
        &self,
        task_type: PersistentTaskType,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn connect_task(
        &self,
        task: TaskId,
        parent_task: TaskId,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    );

    fn mark_own_task_as_finished(
        &self,
        _task: TaskId,
        _turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) {
        // Do nothing by default
    }

    fn create_transient_task(
        &self,
        task_type: TransientTaskType,
        turbo_tasks: &dyn TurboTasksBackendApi<Self>,
    ) -> TaskId;

    fn dispose_root_task(&self, task: TaskId, turbo_tasks: &dyn TurboTasksBackendApi<Self>);
}

impl PersistentTaskType {
    pub async fn run_resolve_native<B: Backend + 'static>(
        fn_id: FunctionId,
        mut this: Option<RawVc>,
        mut inputs: Vec<ConcreteTaskInput>,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        if let Some(this) = this.as_mut() {
            *this = this.resolve().await?;
        }
        for input in inputs.iter_mut() {
            *input = take(input).resolve().await?;
        }
        Ok(if let Some(this) = this {
            turbo_tasks.this_call(fn_id, this, inputs)
        } else {
            turbo_tasks.native_call(fn_id, inputs)
        })
    }

    pub async fn resolve_trait_method(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
    ) -> Result<FunctionId> {
        let CellContent(Some(SharedReference(Some(value_type), _))) = this.into_read().await?
        else {
            bail!("Cell is empty or untyped");
        };
        Self::resolve_trait_method_from_value(trait_type, value_type, name)
    }

    pub async fn run_resolve_trait<B: Backend + 'static>(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
        mut inputs: Vec<ConcreteTaskInput>,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        let this = this.resolve().await?;
        let CellContent(Some(SharedReference(this_ty, _))) = this.into_read().await? else {
            bail!("Cell is empty");
        };
        let Some(this_ty) = this_ty else {
            bail!("Cell is untyped");
        };

        let native_fn = Self::resolve_trait_method_from_value(trait_type, this_ty, name)?;
        for input in inputs.iter_mut() {
            *input = take(input).resolve().await?;
        }
        Ok(turbo_tasks.dynamic_this_call(native_fn, this, inputs))
    }

    /// Shared helper used by [`Self::resolve_trait_method`] and
    /// [`Self::run_resolve_trait`].
    fn resolve_trait_method_from_value(
        trait_type: TraitTypeId,
        value_type: ValueTypeId,
        name: Cow<'static, str>,
    ) -> Result<FunctionId> {
        match get_trait_method(trait_type, value_type, name) {
            Ok(native_fn) => Ok(native_fn),
            Err(name) => {
                if !has_trait(value_type, trait_type) {
                    let traits = traits(value_type).iter().fold(String::new(), |mut out, t| {
                        let _ = write!(out, " {}", t);
                        out
                    });
                    Err(anyhow!(
                        "{} doesn't implement {} (only{})",
                        registry::get_value_type(value_type),
                        registry::get_trait(trait_type),
                        traits,
                    ))
                } else {
                    Err(anyhow!(
                        "{} implements trait {}, but method {} is missing",
                        registry::get_value_type(value_type),
                        registry::get_trait(trait_type),
                        name
                    ))
                }
            }
        }
    }

    pub fn run<B: Backend + 'static>(
        self,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> {
        match self {
            PersistentTaskType::Native {
                fn_type: fn_id,
                this,
                args: inputs,
            } => {
                let native_fn = registry::get_function(fn_id);
                let bound = native_fn.bind(this, &inputs);
                (bound)()
            }
            PersistentTaskType::ResolveNative {
                fn_type: fn_id,
                this,
                args: inputs,
            } => Box::pin(Self::run_resolve_native(fn_id, this, inputs, turbo_tasks)),
            PersistentTaskType::ResolveTrait {
                trait_type,
                method_name: name,
                this,
                args: inputs,
            } => Box::pin(Self::run_resolve_trait(
                trait_type,
                name,
                this,
                inputs,
                turbo_tasks,
            )),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{self as turbo_tasks, Vc};

    #[turbo_tasks::function]
    fn mock_func_task() -> Vc<()> {
        Vc::cell(())
    }

    #[turbo_tasks::value_trait]
    trait MockTrait {
        fn mock_method_task() -> Vc<()>;
    }

    #[test]
    fn test_get_name() {
        crate::register();
        assert_eq!(
            PersistentTaskType::Native {
                fn_type: *MOCK_FUNC_TASK_FUNCTION_ID,
                this: None,
                args: Vec::new()
            }
            .get_name(),
            "mock_func_task",
        );
        assert_eq!(
            PersistentTaskType::ResolveTrait {
                trait_type: *MOCKTRAIT_TRAIT_TYPE_ID,
                method_name: "mock_method_task".into(),
                this: RawVc::TaskOutput(unsafe { TaskId::new_unchecked(1) }),
                args: Vec::new()
            }
            .get_name(),
            "MockTrait::mock_method_task",
        );
    }
}
