#![feature(backtrace)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(try_trait_v2)]
#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]

pub mod backend;
mod completion;
mod display;
mod id;
mod id_factory;
mod infinite_vec;
mod magic_any;
mod manager;
mod native_function;
mod no_move_vec;
mod nothing;
pub mod persisted_graph;
mod raw_vc;
pub mod registry;
mod task_input;
pub mod trace;
pub mod util;
mod value;
mod value_type;
mod vc;

pub use anyhow::{Error, Result};
pub use completion::{Completion, CompletionVc};
pub use display::{ValueToString, ValueToStringVc};
pub use id::{
    with_task_id_mapping, without_task_id_mapping, FunctionId, IdMapping, TaskId, TraitTypeId,
    ValueTypeId,
};
pub use lazy_static::lazy_static;
pub use manager::{
    dynamic_call, get_invalidator, trait_call, turbo_tasks, Invalidator, TaskIdProvider,
    TurboTasks, TurboTasksApi, TurboTasksBackendApi, TurboTasksCallApi,
};
pub use native_function::{NativeFunction, NativeFunctionVc};
pub use nothing::{Nothing, NothingVc};
pub use raw_vc::{RawVc, RawVcReadResult, ReadRawVcFuture};
pub use task_input::{SharedReference, SharedValue, TaskInput};
pub use turbo_tasks_macros::{constructor, function, value, value_impl, value_trait};
pub use value::Value;
pub use value_type::{TraitMethod, TraitType, Typed, TypedForInput, ValueType};
pub use vc::Vc;

pub mod macro_helpers {
    pub use super::manager::{find_slot_by_key, find_slot_by_type};
}

pub fn register() {
    vc::VALUE_TYPE.register("turbo_tasks::Vc");
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
