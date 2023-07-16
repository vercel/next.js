use std::{
    fmt::Debug,
    hash::Hash,
    sync::atomic::{AtomicUsize, Ordering},
};

use crate::{
    registry::register_function,
    task::{function::NativeTaskFn, IntoTaskFn, TaskFn},
    util::SharedError,
    ConcreteTaskInput, {self as turbo_tasks},
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
    // TODO move to Task
    /// A counter that tracks total executions of that function
    #[turbo_tasks(debug_ignore, trace_ignore)]
    pub executed_count: AtomicUsize,
}

impl Debug for NativeFunction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeFunction")
            .field("name", &self.name)
            .finish_non_exhaustive()
    }
}

impl NativeFunction {
    pub fn new<I, Mode, Inputs>(name: String, implementation: I) -> Self
    where
        I: IntoTaskFn<Mode, Inputs>,
    {
        Self {
            name,
            implementation: Box::new(implementation.into_task_fn()),
            executed_count: AtomicUsize::new(0),
        }
    }

    /// Creates a functor for execution from a fixed set of inputs.
    pub fn bind(&'static self, inputs: &[ConcreteTaskInput]) -> NativeTaskFn {
        match (self.implementation).functor(&self.name, inputs) {
            Ok(functor) => Box::new(move || {
                let r = (functor)();
                if cfg!(feature = "log_function_stats") {
                    let count = self.executed_count.fetch_add(1, Ordering::Relaxed);
                    if count > 0 && count % 100000 == 0 {
                        println!("{} was executed {}k times", self.name, count / 1000);
                    }
                }
                r
            }),
            Err(err) => {
                let err = SharedError::new(err);
                Box::new(move || {
                    let err = err.clone();
                    Box::pin(async { Err(err.into()) })
                })
            }
        }
    }

    pub fn register(&'static self, global_name: &str) {
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
        PartialOrd::partial_cmp(
            &(*self as *const NativeFunction),
            &(*other as *const NativeFunction),
        )
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
