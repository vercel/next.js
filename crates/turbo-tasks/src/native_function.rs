use std::{fmt::Debug, hash::Hash};

use tracing::Span;

use crate::{
    self as turbo_tasks,
    registry::register_function,
    task::{
        function::{IntoTaskFnWithThis, NativeTaskFn},
        IntoTaskFn, TaskFn,
    },
    util::SharedError,
    ConcreteTaskInput, RawVc,
};

/// A native (rust) turbo-tasks function. It's used internally by
/// `#[turbo_tasks::function]`.
#[turbo_tasks::value(cell = "new", serialization = "none", eq = "manual")]
pub struct NativeFunction {
    /// A readable name of the function that is used to reporting purposes.
    pub name: String,
    /// The functor that creates a functor from inputs. The inner functor
    /// handles the task execution.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub implementation: Box<dyn TaskFn + Send + Sync + 'static>,
}

impl Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction")
            .field("name", &self.name)
            .finish_non_exhaustive()
    }
}

impl NativeFunction {
    pub fn new_function<Mode, Inputs, I>(name: String, implementation: I) -> Self
    where
        I: IntoTaskFn<Mode, Inputs>,
    {
        Self {
            name,
            implementation: Box::new(implementation.into_task_fn()),
        }
    }

    pub fn new_method<Mode, Inputs, I>(name: String, implementation: I) -> Self
    where
        I: IntoTaskFnWithThis<Mode, Inputs>,
    {
        Self {
            name,
            implementation: Box::new(implementation.into_task_fn_with_this()),
        }
    }

    /// Creates a functor for execution from a fixed set of inputs.
    pub fn bind(&'static self, this: Option<RawVc>, arg: &ConcreteTaskInput) -> NativeTaskFn {
        match (self.implementation).functor(this, arg) {
            Ok(functor) => functor,
            Err(err) => {
                let err = SharedError::new(err);
                Box::new(move || {
                    let err = err.clone();
                    Box::pin(async { Err(err.into()) })
                })
            }
        }
    }

    pub fn span(&'static self) -> Span {
        tracing::trace_span!("turbo_tasks::function", name = self.name.as_str())
    }

    pub fn resolve_span(&'static self) -> Span {
        tracing::trace_span!("turbo_tasks::resolve_call", name = self.name.as_str())
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
