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
#![feature(hash_extract_if)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(result_flattening)]
#![feature(error_generic_member_access)]
#![feature(new_uninit)]
#![feature(arbitrary_self_types)]
#![feature(type_alias_impl_trait)]
#![feature(never_type)]

pub mod backend;
mod capture_future;
mod collectibles;
mod completion;
pub mod debug;
mod display;
pub mod duration_span;
pub mod event;
mod generics;
pub mod graph;
mod id;
mod id_factory;
mod invalidation;
mod join_iter_ext;
mod keyed_cell;
#[doc(hidden)]
pub mod macro_helpers;
mod magic_any;
mod manager;
mod native_function;
mod no_move_vec;
mod once_map;
pub mod persisted_graph;
pub mod primitives;
mod raw_vc;
mod raw_vc_set;
mod rcstr;
mod read_ref;
pub mod registry;
pub mod small_duration;
mod state;
pub mod task;
pub mod trace;
mod trait_ref;
mod triomphe_utils;
pub mod util;
mod value;
mod value_type;
mod vc;

use std::hash::BuildHasherDefault;

pub use anyhow::{Error, Result};
use auto_hash_map::AutoSet;
pub use collectibles::CollectiblesSource;
pub use completion::{Completion, Completions};
pub use display::ValueToString;
pub use id::{FunctionId, TaskId, TraitTypeId, ValueTypeId};
pub use invalidation::{
    DynamicEqHash, InvalidationReason, InvalidationReasonKind, InvalidationReasonSet,
};
pub use join_iter_ext::{JoinIterExt, TryFlatJoinIterExt, TryJoinIterExt};
pub use keyed_cell::{global_keyed_cell, keyed_cell};
pub use manager::{
    dynamic_call, emit, get_invalidator, mark_finished, mark_stateful, prevent_gc, run_once,
    run_once_with_reason, spawn_blocking, spawn_thread, trait_call, turbo_tasks, CurrentCellRef,
    Invalidator, TaskIdProvider, TurboTasks, TurboTasksApi, TurboTasksBackendApi,
    TurboTasksCallApi, Unused, UpdateInfo,
};
pub use native_function::NativeFunction;
pub use raw_vc::{CellId, RawVc, ReadRawVcFuture, ResolveTypeError};
pub use read_ref::ReadRef;
use rustc_hash::FxHasher;
pub use state::State;
pub use task::{
    concrete_task_input::{ConcreteTaskInput, SharedReference, SharedValue},
    task_input::TaskInput,
};
pub use trait_ref::{IntoTraitRef, TraitRef};
pub use turbo_tasks_macros::{function, value, value_impl, value_trait, TaskInput};
pub use value::{TransientInstance, TransientValue, Value};
pub use value_type::{TraitMethod, TraitType, ValueType};
pub use vc::{
    Dynamic, ResolvedValue, ResolvedVc, TypedForInput, Upcast, ValueDefault, Vc, VcCast,
    VcCellNewMode, VcCellSharedMode, VcDefaultRead, VcRead, VcTransparentRead, VcValueTrait,
    VcValueTraitCast, VcValueType, VcValueTypeCast,
};

pub use crate::rcstr::RcStr;

pub type TaskIdSet = AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>;

pub mod test_helpers {
    pub use super::manager::{current_task_for_testing, with_turbo_tasks_for_testing};
}

pub fn register() {
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
