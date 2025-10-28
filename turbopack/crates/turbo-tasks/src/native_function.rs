use std::{fmt::Debug, hash::Hash, pin::Pin};

use anyhow::Result;
use futures::Future;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tracing::Span;

use crate::{
    RawVc, TaskExecutionReason, TaskInput, TaskPersistence,
    magic_any::{MagicAny, MagicAnyDeserializeSeed, MagicAnySerializeSeed},
    task::{
        IntoTaskFn, TaskFn,
        function::{IntoTaskFnWithThis, NativeTaskFuture},
    },
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

    /// This will return `(None, _)` even if the target is a method, if the method does not use
    /// `self`.
    pub async fn filter_and_resolve(&self, args: &dyn MagicAny) -> Result<Box<dyn MagicAny>> {
        (self.filter_and_resolve)(args).await
    }
}

fn resolve_functor_impl<T: MagicAny + TaskInput>(value: &dyn MagicAny) -> ResolveFuture<'_> {
    Box::pin(async move {
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
pub struct NativeFunction {
    /// A readable name of the function that is used to reporting purposes.
    pub(crate) name: &'static str,

    pub(crate) function_meta: FunctionMeta,

    pub(crate) arg_meta: ArgMeta,

    /// The functor that creates a functor from inputs. The inner functor
    /// handles the task execution.
    pub(crate) implementation: Box<dyn TaskFn + Send + Sync + 'static>,

    // The globally unique name for this function, used when persisting
    pub(crate) global_name: &'static str,
}

impl Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction")
            .field("name", &self.name)
            .field("global_name", &self.global_name)
            .field("function_meta", &self.function_meta)
            .finish_non_exhaustive()
    }
}

impl NativeFunction {
    pub fn new_function<Mode, Inputs>(
        name: &'static str,
        global_name: &'static str,
        function_meta: FunctionMeta,
        implementation: impl IntoTaskFn<Mode, Inputs>,
    ) -> Self
    where
        Inputs: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        Self {
            name,
            global_name,
            function_meta,
            arg_meta: ArgMeta::new::<Inputs>(),
            implementation: Box::new(implementation.into_task_fn()),
        }
    }

    pub fn new_method_without_this<Mode, Inputs, I>(
        name: &'static str,
        global_name: &'static str,
        function_meta: FunctionMeta,
        arg_filter: Option<(FilterOwnedArgsFunctor, FilterAndResolveFunctor)>,
        implementation: I,
    ) -> Self
    where
        Inputs: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
        I: IntoTaskFn<Mode, Inputs>,
    {
        Self {
            name,
            global_name,
            function_meta,
            arg_meta: if let Some((filter_owned, filter_and_resolve)) = arg_filter {
                ArgMeta::with_filter_trait_call::<Inputs>(filter_owned, filter_and_resolve)
            } else {
                ArgMeta::new::<Inputs>()
            },
            implementation: Box::new(implementation.into_task_fn()),
        }
    }

    pub fn new_method<Mode, This, Inputs, I>(
        name: &'static str,
        global_name: &'static str,
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
            global_name,
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

    pub fn span(&'static self, persistence: TaskPersistence, reason: TaskExecutionReason) -> Span {
        let flags = match persistence {
            TaskPersistence::Persistent => "",
            TaskPersistence::Transient => "transient",
            TaskPersistence::Local => "local",
        };
        tracing::trace_span!(
            "turbo_tasks::function",
            name = self.name,
            flags = flags,
            reason = reason.as_str()
        )
    }

    pub fn resolve_span(&'static self, persistence: TaskPersistence) -> Span {
        let flags = match persistence {
            TaskPersistence::Persistent => "",
            TaskPersistence::Transient => "transient",
            TaskPersistence::Local => "local",
        };
        tracing::trace_span!("turbo_tasks::resolve_call", name = self.name, flags = flags)
    }
}
impl PartialEq for NativeFunction {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}

impl Eq for NativeFunction {}
impl Hash for NativeFunction {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (self as *const NativeFunction).hash(state);
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

pub struct CollectableFunction(pub &'static Lazy<NativeFunction>);

inventory::collect! {CollectableFunction}
