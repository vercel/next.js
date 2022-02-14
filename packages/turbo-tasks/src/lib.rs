#![feature(trivial_bounds)]
#![feature(into_future)]

pub mod macro_helpers;
mod native_function;
// mod native_function_expand;
pub(crate) mod slot;
pub(crate) mod slot_value_type;
mod task;
pub mod trace;
mod turbo_tasks;
pub mod viz;

pub use native_function::{NativeFunction, NativeFunctionRef};
pub use slot::{SlotRef, WeakSlotRef};
pub use slot_value_type::{SlotValueType, TraitMethod, TraitType};
pub use task::{Invalidator, Task, TaskArgumentOptions};
pub use turbo_tasks::{dynamic_call, trait_call, TurboTasks};
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
