#![feature(trivial_bounds)]
#![feature(into_future)]

pub mod macro_helpers;
mod manager;
mod native_function;
pub(crate) mod slot;
pub(crate) mod slot_value_type;
mod task;
mod tasks_list;
pub mod trace;
pub mod viz;

pub use manager::{dynamic_call, trait_call, TurboTasks};
pub use native_function::{NativeFunction, NativeFunctionRef};
pub use slot::{SlotRef, SlotRefReadResult, WeakSlotRef};
pub use slot_value_type::{SlotValueType, TraitMethod, TraitType};
pub use task::{Invalidator, Task, TaskArgumentOptions};
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
