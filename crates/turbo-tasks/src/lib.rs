#![feature(backtrace)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(try_trait_v2)]
#![feature(hash_drain_filter)]

mod completion;
mod display;
mod error;
pub mod macro_helpers;
mod manager;
mod native_function;
mod nothing;
mod output;
mod promise;
pub(crate) mod slot;
mod slot_ref;
pub(crate) mod slot_value_type;
pub mod stats;
mod task;
mod task_input;
pub mod trace;
pub mod util;
mod value;
pub mod viz;

pub use anyhow::{Error, Result};
pub use completion::{Completion, CompletionRef};
pub use display::{ValueToString, ValueToStringRef};
pub use lazy_static::lazy_static;
pub use manager::{dynamic_call, trait_call, TurboTasks};
pub use native_function::{NativeFunction, NativeFunctionRef};
pub use nothing::{Nothing, NothingRef};
pub use promise::Promise;
pub use slot_ref::{SlotRef, SlotRefReadResult};
pub use slot_value_type::{SlotValueType, TraitMethod, TraitType};
pub use task::{Invalidator, Task, TaskArgumentOptions};
pub use task_input::TaskInput;
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
pub use value::Value;
