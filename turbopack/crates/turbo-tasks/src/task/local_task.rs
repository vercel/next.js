use std::{fmt, sync::Arc};

use anyhow::{Result, anyhow};

use crate::{
    MagicAny, OutputContent, RawVc, TaskExecutionReason, TaskPersistence, TraitMethod,
    TurboTasksBackendApi, ValueTypeId,
    backend::{Backend, TaskExecutionSpec, TypedCellContent},
    event::Event,
    macro_helpers::NativeFunction,
    registry,
};

/// A potentially in-flight local task stored in `CurrentGlobalTaskState::local_tasks`.
pub enum LocalTask {
    Scheduled { done_event: Event },
    Done { output: OutputContent },
}

pub fn get_local_task_execution_spec<'a>(
    turbo_tasks: &'_ dyn TurboTasksBackendApi<impl Backend + 'static>,
    ty: &'a LocalTaskSpec,
    // if this is a `LocalTaskType::Resolve*`, we'll spawn another task with this persistence, if
    // this is a `LocalTaskType::Native`, this refers to the parent non-local task.
    persistence: TaskPersistence,
) -> TaskExecutionSpec<'a> {
    match ty.task_type {
        LocalTaskType::Native { native_fn } => {
            let span = native_fn.span(TaskPersistence::Local, TaskExecutionReason::Local);
            let entered = span.enter();
            let future = native_fn.execute(ty.this, &*ty.arg);
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        LocalTaskType::ResolveNative { native_fn } => {
            let span = native_fn.resolve_span(TaskPersistence::Local);
            let entered = span.enter();
            let future = Box::pin(LocalTaskType::run_resolve_native(
                native_fn,
                ty.this,
                &*ty.arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        LocalTaskType::ResolveTrait { trait_method } => {
            let span = trait_method.resolve_span();
            let entered = span.enter();
            let future = Box::pin(LocalTaskType::run_resolve_trait(
                trait_method,
                ty.this.unwrap(),
                &*ty.arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
    }
}

pub struct LocalTaskSpec {
    /// The self value, will always be present for `ResolveTrait` tasks and is optional otherwise
    pub(crate) this: Option<RawVc>,
    /// Function arguments
    pub(crate) arg: Box<dyn MagicAny>,
    pub(crate) task_type: LocalTaskType,
}

#[derive(Copy, Clone)]
pub enum LocalTaskType {
    /// A normal task execution a native (rust) function
    Native { native_fn: &'static NativeFunction },

    /// A resolve task, which resolves arguments and calls the function with resolve arguments. The
    /// inner function call will be a `PersistentTaskType` or `LocalTaskType::Native`.
    ResolveNative { native_fn: &'static NativeFunction },

    /// A trait method resolve task. It resolves the first (`self`) argument and looks up the trait
    /// method on that value. Then it calls that method. The method call will do a cache lookup and
    /// might resolve arguments before.
    ResolveTrait { trait_method: &'static TraitMethod },
}

impl fmt::Display for LocalTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LocalTaskType::Native { native_fn } => f.write_str(native_fn.name),
            LocalTaskType::ResolveNative { native_fn } => write!(f, "*{}", native_fn.name),
            LocalTaskType::ResolveTrait { trait_method } => write!(
                f,
                "*{}::{}",
                trait_method.trait_name, trait_method.method_name
            ),
        }
    }
}

impl LocalTaskType {
    /// Implementation of the LocalTaskType::ResolveNative task.
    /// Resolves all the task inputs and then calls the given function.
    async fn run_resolve_native<B: Backend + 'static>(
        native_fn: &'static NativeFunction,
        mut this: Option<RawVc>,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        if let Some(this) = this.as_mut() {
            *this = this.resolve().await?;
        }
        let arg = native_fn.arg_meta.resolve(arg).await?;
        Ok(turbo_tasks.native_call(native_fn, this, arg, persistence))
    }
    /// Implementation of the LocalTaskType::ResolveTrait task.
    async fn run_resolve_trait<B: Backend + 'static>(
        trait_method: &'static TraitMethod,
        this: RawVc,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        let this = this.resolve().await?;
        let TypedCellContent(this_ty, _) = this.into_read().await?;

        let native_fn = Self::resolve_trait_method_from_value(trait_method, this_ty)?;
        let arg = native_fn.arg_meta.filter_and_resolve(arg).await?;
        Ok(turbo_tasks.native_call(native_fn, Some(this), arg, persistence))
    }

    fn resolve_trait_method_from_value(
        trait_method: &'static TraitMethod,
        value_type: ValueTypeId,
    ) -> Result<&'static NativeFunction> {
        match registry::get_value_type(value_type).get_trait_method(trait_method) {
            Some(native_fn) => Ok(native_fn),
            None => Err(anyhow!(
                "{} doesn't implement the trait for {:?}, the compiler should have flagged this",
                registry::get_value_type(value_type),
                trait_method
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
        #[turbo_tasks::function]
        fn mock_method_task() -> Vc<()>;
    }

    #[test]
    fn test_fmt() {
        assert_eq!(
            LocalTaskType::Native {
                native_fn: &MOCK_FUNC_TASK_FUNCTION,
            }
            .to_string(),
            "mock_func_task",
        );
        assert_eq!(
            LocalTaskType::ResolveTrait {
                trait_method: MOCKTRAIT_TRAIT_TYPE.get("mock_method_task"),
            }
            .to_string(),
            "*MockTrait::mock_method_task",
        );
    }
}
