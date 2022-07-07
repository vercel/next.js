#![feature(backtrace)]
#![feature(trivial_bounds)]
#![feature(into_future)]
#![feature(min_specialization)]
#![feature(try_trait_v2)]
#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(generic_associated_types)]

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
mod once_map;
pub mod persisted_graph;
pub mod primitives;
mod raw_vc;
pub mod registry;
mod task_input;
pub mod trace;
pub mod util;
mod value;
mod value_type;

pub use anyhow::{Error, Result};
pub use completion::{Completion, CompletionVc};
pub use display::{ValueToString, ValueToStringVc};
pub use id::{
    with_task_id_mapping, without_task_id_mapping, FunctionId, IdMapping, TaskId, TraitTypeId,
    ValueTypeId,
};
pub use lazy_static::lazy_static;
pub use manager::{
    dynamic_call, get_invalidator, spawn, spawn_blocking, spawn_thread, trait_call, turbo_tasks,
    Invalidator, TaskIdProvider, TurboTasks, TurboTasksApi, TurboTasksBackendApi,
    TurboTasksCallApi,
};
pub use native_function::{NativeFunction, NativeFunctionVc};
pub use nothing::{Nothing, NothingVc};
pub use raw_vc::{
    RawVc, RawVcReadAndMapResult, RawVcReadResult, ReadAndMapRawVcFuture, ReadRawVcFuture,
    ResolveTraitError,
};
pub use task_input::{FromTaskInput, SharedReference, SharedValue, TaskInput};
pub use turbo_tasks_macros::{function, value, value_impl, value_trait};
pub use value::Value;
pub use value_type::{TraitMethod, TraitType, Typed, TypedForInput, ValueType};

pub mod macro_helpers {
    pub use super::manager::{find_cell_by_key, find_cell_by_type};
}

pub mod test_helpers {
    pub use super::manager::with_turbo_tasks_for_testing;
}

pub fn register() {
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
