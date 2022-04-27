#![feature(backtrace)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(try_trait_v2)]
#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]

mod backend;
mod completion;
mod display;
mod error;
mod id;
mod id_factory;
mod magic_any;
mod manager;
mod memory_backend;
mod native_function;
mod no_move_vec;
mod nothing;
mod output;
mod raw_vc;
pub mod registry;
pub(crate) mod slot;
pub mod stats;
mod task;
mod task_input;
pub mod trace;
pub mod util;
mod value;
pub(crate) mod value_type;
mod vc;
pub mod viz;

pub use anyhow::{Error, Result};
pub use completion::{Completion, CompletionVc};
pub use display::{ValueToString, ValueToStringVc};
pub use id::{FunctionId, TaskId, TraitTypeId, ValueTypeId};
pub use lazy_static::lazy_static;
pub use manager::{
    dynamic_call, get_invalidator, trait_call, turbo_tasks, Invalidator, TurboTasks,
};
pub use memory_backend::MemoryBackend;
pub use native_function::{NativeFunction, NativeFunctionVc};
pub use nothing::{Nothing, NothingVc};
pub use raw_vc::{RawVc, RawVcReadResult, ReadRawVcFuture};
pub use task::{Task, TaskArgumentOptions};
pub use task_input::TaskInput;
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
pub use value::Value;
pub use value_type::{TraitMethod, TraitType, ValueType};
pub use vc::Vc;

pub mod macro_helpers {
    pub use super::manager::{find_slot_by_key, find_slot_by_type};
}

pub fn register() {
    vc::VALUE_TYPE.register("turbo_tasks::Vc");
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
