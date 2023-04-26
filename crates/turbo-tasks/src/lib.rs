//! A task scheduling and caching system that is focused on incremental
//! execution.
//!
//! It defines 4 primitives:
//! - functions: Unit of execution, invalidation and reexecution.
//! - values: Data created, stored and returned by functions.
//! - traits: Traits that define a set of functions on values.
//! - collectibles: Values emitted in functions that bubble up the call graph
//!   and can be collected in parent functions.
//!
//! It also defines some derived elements from that:
//! - cells: The locations in functions where values are stored. The content of
//!   a cell can change after the reexecution of a function.
//! - Vcs: A reference to a cell in a function or a return value of a function.
//! - task: An instance of a function together with its arguments.
//!
//! A Vc can be read to get a read-only reference to the stored data.
//!
//! On execution of functions, turbo-tasks will track which Vcs are read. Once
//! any of these change, turbo-tasks will invalidate the task created from the
//! function's execution and it will eventually be scheduled and reexecuted.
//!
//! Collectibles go through a similar process.

#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![feature(try_trait_v2)]
#![feature(hash_drain_filter)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(result_flattening)]
#![feature(error_generic_member_access)]
#![feature(provide_any)]
#![feature(new_uninit)]
#![feature(never_type)]

pub mod backend;
mod collectibles;
mod completion;
pub mod debug;
mod display;
pub mod event;
pub mod graph;
mod id;
mod id_factory;
mod invalidation;
mod join_iter_ext;
mod magic_any;
mod manager;
mod native_function;
mod no_move_vec;
mod nothing;
mod once_map;
pub mod persisted_graph;
pub mod primitives;
mod raw_vc;
mod read_ref;
pub mod registry;
pub mod small_duration;
mod state;
mod task_input;
mod timed_future;
pub mod trace;
mod trait_ref;
pub mod util;
mod value;
mod value_type;

pub use anyhow::{Error, Result};
pub use collectibles::CollectiblesSource;
pub use completion::{Completion, CompletionVc, CompletionsVc};
pub use display::{ValueToString, ValueToStringVc};
pub use id::{
    with_task_id_mapping, without_task_id_mapping, FunctionId, IdMapping, TaskId, TraitTypeId,
    ValueTypeId,
};
pub use invalidation::{
    DynamicEqHash, InvalidationReason, InvalidationReasonKind, InvalidationReasonSet,
};
pub use join_iter_ext::{JoinIterExt, TryJoinIterExt};
pub use manager::{
    dynamic_call, emit, get_invalidator, mark_finished, mark_stateful, run_once,
    run_once_with_reason, spawn_blocking, spawn_thread, trait_call, turbo_tasks, Invalidator,
    StatsType, TaskIdProvider, TurboTasks, TurboTasksApi, TurboTasksBackendApi, TurboTasksCallApi,
    Unused, UpdateInfo,
};
pub use native_function::{NativeFunction, NativeFunctionVc};
pub use nothing::{Nothing, NothingVc};
pub use raw_vc::{
    CellId, CollectiblesFuture, RawVc, ReadRawVcFuture, ResolveTypeError, TraitCast,
    TransparentValueCast, ValueCast,
};
pub use read_ref::ReadRef;
pub use state::State;
pub use task_input::{FromTaskInput, SharedReference, SharedValue, TaskInput};
pub use trait_ref::{IntoTraitRef, TraitRef};
pub use turbo_tasks_macros::{function, value, value_impl, value_trait};
pub use value::{TransientInstance, TransientValue, Value};
pub use value_type::{
    FromSubTrait, IntoSuperTrait, TraitMethod, TraitType, Typed, TypedForInput, ValueTraitVc,
    ValueType, ValueVc,
};

#[doc(hidden)]
pub mod macro_helpers {
    pub use once_cell::sync::{Lazy, OnceCell};

    pub use super::manager::find_cell_by_type;
}

pub mod test_helpers {
    pub use super::manager::{current_task_for_testing, with_turbo_tasks_for_testing};
}

pub fn register() {
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
