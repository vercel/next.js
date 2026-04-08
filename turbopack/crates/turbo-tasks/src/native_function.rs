use std::{any::Any, fmt::Debug, pin::Pin};

use anyhow::Result;
use bincode::{Decode, Encode};
use futures::Future;
use tracing::Span;
use turbo_bincode::{AnyDecodeFn, AnyEncodeFn, new_hash_encoder};
use turbo_tasks_hash::DeterministicHasher;

use crate::{
    RawVc, TaskExecutionReason, TaskInput, TaskPersistence, TaskPriority,
    macro_helpers::into_task_fn,
    magic_any::{MagicAny, any_as_encode},
    registry::{RegistryType, turbo_registry},
    task::{TaskFn, TaskFnInputs, function::NativeTaskFuture},
};

type ResolveFuture<'a> = Pin<Box<dyn Future<Output = Result<Box<dyn MagicAny>>> + Send + 'a>>;
type ResolveFunctor = for<'a> fn(&'a dyn MagicAny) -> ResolveFuture<'a>;

type IsResolvedFunctor = fn(&dyn MagicAny) -> bool;

#[doc(hidden)]
pub type FilterOwnedArgsFunctor = for<'a> fn(Box<dyn MagicAny>) -> Box<dyn MagicAny>;
#[doc(hidden)]
pub type FilterAndResolveFunctor = ResolveFunctor;

/// Function pointer that encodes a task argument directly to a hasher.
///
/// This allows computing hashes of task arguments without intermediate buffer allocation.
pub type AnyHashEncodeFn = fn(&dyn Any, &mut dyn DeterministicHasher);

pub struct ArgMeta {
    // TODO: This should be an `Option` with `None` for transient tasks. We can skip some codegen.
    pub bincode: (AnyEncodeFn, AnyDecodeFn<Box<dyn MagicAny>>),
    /// Encodes the argument directly to a hasher, avoiding buffer allocation.
    /// Uses the same encoding logic as bincode but writes to a [`DeterministicHasher`].
    pub hash_encode: AnyHashEncodeFn,
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
    /// Equivalent to `new`, but with type inference from a function.
    #[doc(hidden)]
    pub const fn new_from<T>(_t: &T) -> Self
    where
        T: TaskFnInputs,
    {
        Self::new::<T::INPUTS>()
    }

    /// Equivalent to `with_filter_trait_call`, but with type inference from a function.
    #[doc(hidden)]
    pub const fn with_filter_trait_call_from<T>(
        _t: &T,
        filter_owned: FilterOwnedArgsFunctor,
        filter_and_resolve: FilterAndResolveFunctor,
    ) -> Self
    where
        T: TaskFnInputs,
    {
        Self::with_filter_trait_call::<T::INPUTS>(filter_owned, filter_and_resolve)
    }

    pub const fn new<T>() -> Self
    where
        T: TaskInput + Encode + Decode<()> + 'static,
    {
        fn noop_filter_args(args: Box<dyn MagicAny>) -> Box<dyn MagicAny> {
            args
        }
        Self::with_filter_trait_call::<T>(noop_filter_args, resolve_functor_impl::<T>)
    }

    pub const fn with_filter_trait_call<T>(
        filter_owned: FilterOwnedArgsFunctor,
        filter_and_resolve: FilterAndResolveFunctor,
    ) -> Self
    where
        T: TaskInput + Encode + Decode<()> + 'static,
    {
        Self {
            bincode: (
                |this, enc| {
                    T::encode(any_as_encode::<T>(this), enc)?;
                    Ok(())
                },
                |dec| {
                    let val = T::decode(dec)?;
                    Ok(Box::new(val))
                },
            ),
            hash_encode: |this, hasher| {
                let mut encoder = new_hash_encoder(hasher);
                T::encode(any_as_encode::<T>(this), &mut encoder)
                    .expect("encoding to hasher should not fail");
            },
            is_resolved: |value| downcast_args_ref::<T>(value).is_resolved(),
            resolve: resolve_functor_impl::<T>,
            filter_owned,
            filter_and_resolve,
        }
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
pub fn debug_downcast_args_error_msg(expected: &str, actual: &str) -> String {
    format!("Invalid argument type, expected {expected} got {actual}")
}

pub fn downcast_args_owned<T: MagicAny>(args: Box<dyn MagicAny>) -> Box<T> {
    #[cfg(debug_assertions)]
    let args_type_name = args.magic_type_name();

    (args as Box<dyn Any>)
        .downcast::<T>()
        .map_err(|_args| {
            #[cfg(debug_assertions)]
            return anyhow::anyhow!(debug_downcast_args_error_msg(
                std::any::type_name::<T>(),
                args_type_name,
            ));
            #[cfg(not(debug_assertions))]
            return anyhow::anyhow!("Invalid argument type");
        })
        .unwrap()
}

pub fn downcast_args_ref<T: MagicAny>(args: &dyn MagicAny) -> &T {
    (args as &dyn Any)
        .downcast_ref::<T>()
        .ok_or_else(|| {
            #[cfg(debug_assertions)]
            return anyhow::anyhow!(debug_downcast_args_error_msg(
                std::any::type_name::<T>(),
                args.magic_type_name(),
            ));
            #[cfg(not(debug_assertions))]
            return anyhow::anyhow!("Invalid argument type");
        })
        .unwrap()
}

/// A native (rust) turbo-tasks function. It's used internally by
/// `#[turbo_tasks::function]`.
pub struct NativeFunction {
    pub(crate) arg_meta: ArgMeta,

    /// The functor that creates a functor from inputs. The inner functor
    /// handles the task execution.
    pub(crate) implementation: &'static dyn TaskFn,

    pub(crate) ty: RegistryType,

    /// Whether this function's tasks should be treated as root nodes in the aggregation graph.
    /// Root tasks start with aggregation number `u32::MAX` on initial creation.
    pub is_root: bool,
}

impl Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction")
            .field("name", &self.ty.name)
            .field("global_name", &self.ty.global_name)
            .finish_non_exhaustive()
    }
}

fn default_fn() {
    panic!("Pure virtual function called")
}

/// Sentinel used as placeholder in trait vtables before overrides are applied.
/// A single static (not per-monomorphization) avoids bloating the FUNCTIONS registry.
pub static VTABLE_DEFAULT: NativeFunction = NativeFunction::DEFAULT;

impl NativeFunction {
    #[allow(clippy::declare_interior_mutable_const)] // Interior mutability from RegistryType::id is only written during init
    pub const DEFAULT: NativeFunction = NativeFunction {
        arg_meta: ArgMeta::new::<()>(),
        implementation: &into_task_fn(default_fn) as &dyn TaskFn,
        ty: RegistryType::new::<()>("", ""),
        is_root: false,
    };

    pub const fn new<T: TaskFn>(
        name: &'static str,
        global_name: &'static str,
        arg_meta: ArgMeta,
        implementation: &'static T,
        is_root: bool,
    ) -> Self {
        Self {
            ty: RegistryType::new::<T>(name, global_name),
            arg_meta,
            implementation,
            is_root,
        }
    }

    /// Executed the function
    pub fn execute(&'static self, this: Option<RawVc>, arg: &dyn MagicAny) -> NativeTaskFuture {
        match (self.implementation).functor(this, arg) {
            Ok(functor) => functor,
            Err(err) => Box::pin(async { Err(err) }),
        }
    }

    pub fn span(
        &'static self,
        persistence: TaskPersistence,
        reason: TaskExecutionReason,
        priority: TaskPriority,
    ) -> Span {
        let flags = match persistence {
            TaskPersistence::Persistent => "",
            TaskPersistence::Transient => "transient",
        };
        tracing::trace_span!(
            "turbo_tasks::function",
            name = self.ty.name,
            priority = %priority,
            flags = flags,
            reason = reason.as_str()
        )
    }

    pub fn resolve_span(&'static self, priority: TaskPriority) -> Span {
        tracing::trace_span!("turbo_tasks::resolve_call", name = self.ty.name, priority = %priority)
    }
}

turbo_registry!("Function", NativeFunction);
