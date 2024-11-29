use std::{fmt::Debug, hash::Hash, pin::Pin};

use anyhow::{Context, Result};
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
    RawVc, TaskId, TaskInput,
};

type ResolveFunctor =
    for<'a> fn(
        &'a dyn MagicAny,
    ) -> Pin<Box<dyn Future<Output = Result<Box<dyn MagicAny>>> + Send + 'a>>;

type IsResolvedFunctor = fn(&dyn MagicAny) -> bool;

pub struct ArgMeta {
    serializer: MagicAnySerializeSeed,
    deserializer: MagicAnyDeserializeSeed,
    is_resolved: IsResolvedFunctor,
    resolve: ResolveFunctor,
}

impl ArgMeta {
    pub fn new<T>() -> Self
    where
        T: TaskInput + Serialize + for<'de> Deserialize<'de> + 'static,
    {
        fn downcast<T>(value: &dyn MagicAny) -> &T
        where
            T: MagicAny,
        {
            value
                .downcast_ref::<T>()
                .with_context(|| {
                    #[cfg(debug_assertions)]
                    return format!(
                        "Invalid argument type, expected {} got {}",
                        std::any::type_name::<T>(),
                        value.magic_type_name()
                    );
                    #[cfg(not(debug_assertions))]
                    return "Invalid argument type";
                })
                .unwrap()
        }
        Self {
            serializer: MagicAnySerializeSeed::new::<T>(),
            deserializer: MagicAnyDeserializeSeed::new::<T>(),
            is_resolved: |value| downcast::<T>(value).is_resolved(),
            resolve: |value| {
                Box::pin(async {
                    let value = downcast::<T>(value);
                    let resolved = value.resolve().await?;
                    Ok(Box::new(resolved) as Box<dyn MagicAny>)
                })
            },
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
}

#[derive(Debug)]
pub struct FunctionMeta {
    /// Changes the behavior of `Vc::cell` to create local cells that are not
    /// cached across task executions. Cells can be converted to their non-local
    /// versions by calling `Vc::resolve`.
    pub local_cells: bool,
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
            arg_meta: ArgMeta::new::<Inputs>(),
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

    pub fn span(&'static self, task_id: TaskId) -> Span {
        if task_id.is_transient() {
            tracing::trace_span!(
                "turbo_tasks::function",
                name = self.name.as_str(),
                transient = true
            )
        } else {
            tracing::trace_span!("turbo_tasks::function", name = self.name.as_str())
        }
    }

    pub fn resolve_span(&'static self, task_id: TaskId) -> Span {
        if task_id.is_transient() {
            tracing::trace_span!(
                "turbo_tasks::resolve_call",
                name = self.name.as_str(),
                transient = true
            )
        } else {
            tracing::trace_span!("turbo_tasks::resolve_call", name = self.name.as_str())
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
