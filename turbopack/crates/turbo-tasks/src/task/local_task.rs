use std::{borrow::Cow, fmt, fmt::Write, sync::Arc};

use anyhow::{anyhow, Result};

use crate::{
    backend::{Backend, TaskExecutionSpec, TypedCellContent},
    event::Event,
    registry,
    trait_helpers::{get_trait_method, has_trait, traits},
    FunctionId, MagicAny, OutputContent, RawVc, TaskPersistence, TraitTypeId, TurboTasksBackendApi,
    ValueTypeId,
};

/// A potentially in-flight local task stored in `CurrentGlobalTaskState::local_tasks`.
pub enum LocalTask {
    Scheduled { done_event: Event },
    Done { output: OutputContent },
}

pub fn get_local_task_execution_spec<'a>(
    turbo_tasks: &'_ dyn TurboTasksBackendApi<impl Backend + 'static>,
    ty: &'a LocalTaskType,
    // if this is a `LocalTaskType::Resolve*`, we'll spawn another task with this persistence
    persistence: TaskPersistence,
) -> TaskExecutionSpec<'a> {
    match ty {
        LocalTaskType::Native {
            fn_type: native_fn_id,
            this,
            arg,
        } => {
            debug_assert_eq!(persistence, TaskPersistence::Local);
            let func = registry::get_function(*native_fn_id);
            let span = func.span(TaskPersistence::Local);
            let entered = span.enter();
            let future = func.execute(*this, &**arg);
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        LocalTaskType::ResolveNative {
            fn_type: native_fn_id,
            this,
            arg,
        } => {
            let func = registry::get_function(*native_fn_id);
            let span = func.resolve_span(TaskPersistence::Local);
            let entered = span.enter();
            let future = Box::pin(LocalTaskType::run_resolve_native(
                *native_fn_id,
                *this,
                &**arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
        LocalTaskType::ResolveTrait {
            trait_type: trait_type_id,
            method_name: name,
            this,
            arg,
        } => {
            let trait_type = registry::get_trait(*trait_type_id);
            let span = trait_type.resolve_span(name);
            let entered = span.enter();
            let future = Box::pin(LocalTaskType::run_resolve_trait(
                *trait_type_id,
                name.clone(),
                *this,
                &**arg,
                persistence,
                turbo_tasks.pin(),
            ));
            drop(entered);
            TaskExecutionSpec { future, span }
        }
    }
}

pub enum LocalTaskType {
    /// A normal task execution a native (rust) function
    Native {
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
    },

    /// A resolve task, which resolves arguments and calls the function with resolve arguments. The
    /// inner function call will be a `PersistentTaskType` or `LocalTaskType::Native`.
    ResolveNative {
        fn_type: FunctionId,
        this: Option<RawVc>,
        arg: Box<dyn MagicAny>,
    },

    /// A trait method resolve task. It resolves the first (`self`) argument and looks up the trait
    /// method on that value. Then it calls that method. The method call will do a cache lookup and
    /// might resolve arguments before.
    ResolveTrait {
        trait_type: TraitTypeId,
        method_name: Cow<'static, str>,
        this: RawVc,
        arg: Box<dyn MagicAny>,
    },
}

impl fmt::Display for LocalTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.get_name())
    }
}

impl LocalTaskType {
    /// Returns the name of the function in the code. Trait methods are
    /// formatted as `TraitName::method_name`.
    ///
    /// Equivalent to [`ToString::to_string`], but potentially more efficient as
    /// it can return a `&'static str` in many cases.
    pub fn get_name(&self) -> Cow<'static, str> {
        match self {
            Self::Native {
                fn_type: native_fn,
                this: _,
                arg: _,
            } => Cow::Borrowed(&registry::get_function(*native_fn).name),
            Self::ResolveNative {
                fn_type: native_fn,
                this: _,
                arg: _,
            } => format!("*{}", registry::get_function(*native_fn).name).into(),
            Self::ResolveTrait {
                trait_type: trait_id,
                method_name: fn_name,
                this: _,
                arg: _,
            } => format!("*{}::{}", registry::get_trait(*trait_id).name, fn_name).into(),
        }
    }

    pub fn try_get_function_id(&self) -> Option<FunctionId> {
        match self {
            Self::Native { fn_type, .. } | Self::ResolveNative { fn_type, .. } => Some(*fn_type),
            Self::ResolveTrait { .. } => None,
        }
    }

    pub async fn run_resolve_native<B: Backend + 'static>(
        fn_id: FunctionId,
        mut this: Option<RawVc>,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        if let Some(this) = this.as_mut() {
            *this = this.resolve().await?;
        }
        let arg = registry::get_function(fn_id).arg_meta.resolve(arg).await?;
        Ok(turbo_tasks.native_call(fn_id, this, arg, persistence))
    }

    pub async fn run_resolve_trait<B: Backend + 'static>(
        trait_type: TraitTypeId,
        name: Cow<'static, str>,
        this: RawVc,
        arg: &dyn MagicAny,
        persistence: TaskPersistence,
        turbo_tasks: Arc<dyn TurboTasksBackendApi<B>>,
    ) -> Result<RawVc> {
        let this = this.resolve().await?;
        let TypedCellContent(this_ty, _) = this.into_read().await?;

        let native_fn_id = Self::resolve_trait_method_from_value(trait_type, this_ty, name)?;
        let native_fn = registry::get_function(native_fn_id);
        let arg = native_fn.arg_meta.filter_and_resolve(arg).await?;
        Ok(turbo_tasks.dynamic_call(native_fn_id, Some(this), arg, persistence))
    }

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
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{self as turbo_tasks, TaskId, Vc};

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
            LocalTaskType::Native {
                fn_type: *MOCK_FUNC_TASK_FUNCTION_ID,
                this: None,
                arg: Box::new(()),
            }
            .get_name(),
            "mock_func_task",
        );
        assert_eq!(
            LocalTaskType::ResolveTrait {
                trait_type: *MOCKTRAIT_TRAIT_TYPE_ID,
                method_name: "mock_method_task".into(),
                this: RawVc::TaskOutput(unsafe { TaskId::new_unchecked(1) }),
                arg: Box::new(()),
            }
            .get_name(),
            "*MockTrait::mock_method_task",
        );
    }
}
