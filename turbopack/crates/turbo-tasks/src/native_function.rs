use std::{fmt::Debug, hash::Hash, pin::Pin};

use anyhow::Result;
use futures::Future;
use serde::{Deserialize, Serialize};
use tracing::Span;

use crate::{
    self as turbo_tasks,
    magic_any::{MagicAny, MagicAnyDeserializeSeed, MagicAnySerializeSeed},
    registry::register_function,
    task::{
        function::{IntoTaskFnWithThis, NativeTaskFuture},
        IntoTaskFn, TaskFn,
    },
    RawVc, TaskInput, TaskPersistence,
};

type ResolveFuture<'a> = Pin<Box<dyn Future<Output = Result<Box<dyn MagicAny>>> + Send + 'a>>;
type ResolveFunctor = for<'a> fn(&'a dyn MagicAny) -> ResolveFuture<'a>;

type IsResolvedFunctor = fn(&dyn MagicAny) -> bool;

type FilterOwnedArgsFunctor = for<'a> fn(Box<dyn MagicAny>) -> Box<dyn MagicAny>;
type FilterAndResolveFunctor = ResolveFunctor;

pub struct ArgMeta {
    serializer: MagicAnySerializeSeed,
    deserializer: MagicAnyDeserializeSeed,
    is_resolved: IsResolvedFunctor,
    resolve: ResolveFunctor,
    /// Used for trait methods, filters out unused arguments.
    filter_owned: FilterOwnedArgsFunctor,
    /// Accepts a reference (instead of ownership) of arguments, and does the filtering and
    /// resolution in a single operation.
    //
    // When filtering a `&dyn MagicAny` while running a resolution task, we can't return a filtered
    // `&dyn MagicAny`, we'd be forced to return a `Box<dyn MagicAny>`. However, the next thing we
    // do is resolution, which also accepts a `&dyn MagicAny` and returns a `Box<dyn MagicAny>`.
    // This functor combines the two operations to avoid extra cloning.
    filter_and_resolve: FilterAndResolveFunctor,
}

impl ArgMeta {
    pub fn new<T>() -> Self
    where
        T: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        fn noop_filter_args(args: Box<dyn MagicAny>) -> Box<dyn MagicAny> {
            args
        }
        Self::with_filter_trait_call::<T>(noop_filter_args, resolve_functor_impl::<T>)
    }

    pub fn with_filter_trait_call<T>(
        filter_owned: FilterOwnedArgsFunctor,
        filter_and_resolve: FilterAndResolveFunctor,
    ) -> Self
    where
        T: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        Self {
            serializer: MagicAnySerializeSeed::new::<T>(),
            deserializer: MagicAnyDeserializeSeed::new::<T>(),
            is_resolved: |value| downcast_args_ref::<T>(value).is_resolved(),
            resolve: resolve_functor_impl::<T>,
            filter_owned,
            filter_and_resolve,
        }
    }

    pub fn deserialization_seed(&self) -> MagicAnyDeserializeSeed {
        self.deserializer
    }

    pub fn as_serialize<'a>(&self, value: &'a dyn MagicAny) -> &'a dyn erased_serde::Serialize {
        self.serializer.as_serialize(value)
    }

    pub fn is_resolved(&self, value: &dyn MagicAny) -> bool {
        (self.is_resolved)(value)
    }

    pub async fn resolve(&self, value: &dyn MagicAny) -> Result<Box<dyn MagicAny>> {
        (self.resolve)(value).await
    }

    pub fn filter_owned(&self, args: Box<dyn MagicAny>) -> Box<dyn MagicAny> {
        (self.filter_owned)(args)
    }

    pub async fn filter_and_resolve(&self, args: &dyn MagicAny) -> Result<Box<dyn MagicAny>> {
        (self.filter_and_resolve)(args).await
    }
}

fn resolve_functor_impl<T: MagicAny + TaskInput>(value: &dyn MagicAny) -> ResolveFuture<'_> {
    Box::pin(async {
        let value = downcast_args_ref::<T>(value);
        let resolved = value.resolve_input().await?;
        Ok(Box::new(resolved) as Box<dyn MagicAny>)
    })
}

#[cfg(debug_assertions)]
#[inline(never)]
pub fn debug_downcast_args_error_msg(expected: &str, actual: &dyn MagicAny) -> String {
    format!(
        "Invalid argument type, expected {expected} got {}",
        (*actual).magic_type_name()
    )
}

pub fn downcast_args_owned<T: MagicAny>(args: Box<dyn MagicAny>) -> Box<T> {
    #[allow(unused_variables)]
    args.downcast::<T>()
        .map_err(|args| {
            #[cfg(debug_assertions)]
            return debug_downcast_args_error_msg(std::any::type_name::<T>(), &*args);
            #[cfg(not(debug_assertions))]
            return anyhow::anyhow!("Invalid argument type");
        })
        .unwrap()
}

pub fn downcast_args_ref<T: MagicAny>(args: &dyn MagicAny) -> &T {
    args.downcast_ref::<T>()
        .ok_or_else(|| {
            #[cfg(debug_assertions)]
            return anyhow::anyhow!(debug_downcast_args_error_msg(
                std::any::type_name::<T>(),
                args
            ));
            #[cfg(not(debug_assertions))]
            return anyhow::anyhow!("Invalid argument type");
        })
        .unwrap()
}

#[derive(Debug)]
pub struct FunctionMeta {
    /// Does not run the function as a task, and instead runs it inside the parent task using
    /// task-local state. The function call itself will not be cached, but cells will be created on
    /// the parent task.
    pub local: bool,
}

/// A native (rust) turbo-tasks function. It's used internally by
/// `#[turbo_tasks::function]`.
#[turbo_tasks::value(cell = "new", serialization = "none", eq = "manual")]
pub struct NativeFunction {
    /// A readable name of the function that is used to reporting purposes.
    pub name: String,

    #[turbo_tasks(trace_ignore)]
    pub function_meta: FunctionMeta,

    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub arg_meta: ArgMeta,

    /// The functor that creates a functor from inputs. The inner functor
    /// handles the task execution.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub implementation: Box<dyn TaskFn + Send + Sync + 'static>,
}

impl Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction")
            .field("name", &self.name)
            .field("function_meta", &self.function_meta)
            .finish_non_exhaustive()
    }
}

impl NativeFunction {
    pub fn new_function<Mode, Inputs>(
        name: String,
        function_meta: FunctionMeta,
        implementation: impl IntoTaskFn<Mode, Inputs>,
    ) -> Self
    where
        Inputs: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        Self {
            name,
            function_meta,
            arg_meta: ArgMeta::new::<Inputs>(),
            implementation: Box::new(implementation.into_task_fn()),
        }
    }

    pub fn new_method<Mode, This, Inputs, I>(
        name: String,
        function_meta: FunctionMeta,
        arg_filter: Option<(FilterOwnedArgsFunctor, FilterAndResolveFunctor)>,
        implementation: I,
    ) -> Self
    where
        This: Sync + Send + 'static,
        Inputs: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
        I: IntoTaskFnWithThis<Mode, This, Inputs>,
    {
        Self {
            name,
            function_meta,
            arg_meta: if let Some((filter_owned, filter_and_resolve)) = arg_filter {
                ArgMeta::with_filter_trait_call::<Inputs>(filter_owned, filter_and_resolve)
            } else {
                ArgMeta::new::<Inputs>()
            },
            implementation: Box::new(implementation.into_task_fn_with_this()),
        }
    }

    /// Executed the function
    pub fn execute(&'static self, this: Option<RawVc>, arg: &dyn MagicAny) -> NativeTaskFuture {
        match (self.implementation).functor(this, arg) {
            Ok(functor) => functor,
            Err(err) => Box::pin(async { Err(err) }),
        }
    }

    pub fn span(&'static self, persistence: TaskPersistence) -> Span {
        match persistence {
            TaskPersistence::Persistent => {
                tracing::trace_span!("turbo_tasks::function", name = self.name.as_str())
            }
            TaskPersistence::Transient => {
                tracing::trace_span!(
                    "turbo_tasks::function",
                    name = self.name.as_str(),
                    transient = true,
                )
            }
            TaskPersistence::Local => {
                tracing::trace_span!(
                    "turbo_tasks::function",
                    name = self.name.as_str(),
                    local = true,
                )
            }
        }
    }

    pub fn resolve_span(&'static self, persistence: TaskPersistence) -> Span {
        match persistence {
            TaskPersistence::Persistent => {
                tracing::trace_span!("turbo_tasks::resolve_call", name = self.name.as_str())
            }
            TaskPersistence::Transient => {
                tracing::trace_span!(
                    "turbo_tasks::resolve_call",
                    name = self.name.as_str(),
                    transient = true,
                )
            }
            TaskPersistence::Local => {
                tracing::trace_span!(
                    "turbo_tasks::resolve_call",
                    name = self.name.as_str(),
                    local = true,
                )
            }
        }
    }

    pub fn register(&'static self, global_name: &'static str) {
        register_function(global_name, self);
    }
}

impl PartialEq for &'static NativeFunction {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(*self, *other)
    }
}

impl Eq for &'static NativeFunction {}

impl Hash for &'static NativeFunction {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(*self as *const NativeFunction), state);
    }
}

impl PartialOrd for &'static NativeFunction {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for &'static NativeFunction {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(
            &(*self as *const NativeFunction),
            &(*other as *const NativeFunction),
        )
    }
}
