#![feature(trivial_bounds)]

pub mod macro_helpers;
mod native_function;
pub(crate) mod node;
mod task;
pub mod trace;
mod turbo_tasks;
pub mod viz;

pub use native_function::{NativeFunction, NativeFunctionRef};
pub use node::{NodeRef, NodeType, TraitMethod, TraitType, WeakNodeRef};
pub use task::{Invalidator, Task};
pub use turbo_tasks::{dynamic_call, TurboTasks};
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
