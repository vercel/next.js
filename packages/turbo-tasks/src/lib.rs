#![feature(backtrace)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(try_trait_v2)]

mod error;
pub mod macro_helpers;
mod manager;
mod native_function;
mod nothing;
pub(crate) mod slot;
pub(crate) mod slot_value_type;
mod task;
mod task_input;
pub mod trace;
pub mod viz;

pub use anyhow::{Error, Result};
pub use manager::{dynamic_call, trait_call, TurboTasks};
pub use native_function::{NativeFunction, NativeFunctionRef};
pub use nothing::{Nothing, NothingRef};
pub use slot::{SlotRef, SlotRefReadResult, WeakSlotRef};
pub use slot_value_type::{SlotValueType, TraitMethod, TraitType};
pub use task::{Invalidator, Task, TaskArgumentOptions};
pub use task_input::TaskInput;
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
