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
pub(crate) mod slot;
mod slot_ref;
pub(crate) mod slot_value_type;
pub mod stats;
mod task;
mod task_input;
pub mod trace;
pub mod util;
mod value;
mod vc;
pub mod viz;

pub use anyhow::{Error, Result};
pub use completion::{Completion, CompletionVc};
pub use display::{ValueToString, ValueToStringVc};
pub use lazy_static::lazy_static;
pub use manager::{dynamic_call, trait_call, TurboTasks};
pub use native_function::{NativeFunction, NativeFunctionVc};
pub use nothing::{Nothing, NothingVc};
pub use slot_ref::{SlotVc, SlotVcReadResult};
pub use slot_value_type::{SlotValueType, TraitMethod, TraitType};
pub use task::{Invalidator, Task, TaskArgumentOptions};
pub use task_input::TaskInput;
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
pub use value::Value;
pub use vc::Vc;
