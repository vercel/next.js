use crate::{
    self as turbo_tasks, error::SharedError, registry::register_function, task::NativeTaskFn,
    task_input::TaskInput, TaskArgumentOptions,
};
use anyhow::Result;
use std::{
    fmt::Debug,
    hash::Hash,
    sync::atomic::{AtomicUsize, Ordering},
};

/// A native (rust) turbo-tasks function. It's used internally by
/// `#[turbo_tasks::function]`.
#[turbo_tasks::value(slot: new)]
pub struct NativeFunction {
    /// A readable name of the function that is used to reporting purposes.
    pub name: String,
    /// Configuration about how arguments are passed. e. g. if they are passed
    /// unresolved or resolved.
    #[trace_ignore]
    pub task_argument_options: Vec<TaskArgumentOptions>,
    /// The functor that creates a functor from inputs. The inner functor
    /// handles the task execution.
    #[trace_ignore]
    pub bind_fn: Box<dyn (Fn(&Vec<TaskInput>) -> Result<NativeTaskFn>) + Send + Sync + 'static>,
    // TODO move to Task
    /// A counter that tracks total executions of that function
    #[trace_ignore]
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
    pub fn new(
        name: String,
        task_argument_options: Vec<TaskArgumentOptions>,
        bind_fn: impl (Fn(&Vec<TaskInput>) -> Result<NativeTaskFn>) + Send + Sync + 'static,
    ) -> Self {
        let mut task_argument_options = task_argument_options;
        task_argument_options.shrink_to_fit();
        Self {
            name,
            task_argument_options,
            bind_fn: Box::new(bind_fn),
            executed_count: AtomicUsize::new(0),
        }
    }

    /// Creates a functor for execution from a fixed set of inputs.
    pub fn bind(&'static self, inputs: &Vec<TaskInput>) -> NativeTaskFn {
        match (self.bind_fn)(inputs) {
            Ok(native_fn) => Box::new(move || {
                let r = native_fn();
                let count = self.executed_count.fetch_add(1, Ordering::Relaxed);
                if count > 0 && count % 100000 == 0 {
                    println!("{} was executed {}k times", self.name, count / 1000);
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
        (*self as *const NativeFunction) == (*other as *const NativeFunction)
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
