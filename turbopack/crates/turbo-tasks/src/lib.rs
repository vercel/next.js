//! A task scheduling and caching system that is focused on incremental
//! execution.
//!
//! It defines 4 primitives:
//! - **[Functions][macro@crate::function]:** Units of execution, invalidation, and reexecution.
//! - **[Values][macro@crate::value]:** Data created, stored, and returned by functions.
//! - **[Traits][macro@crate::value_trait]:** Traits that define a set of functions on values.
//! - **[Collectibles][crate::TurboTasks::emit_collectible]:** Values emitted in functions that
//!   bubble up the call graph and can be collected in parent functions.
//!
//! It also defines some derived elements from that:
//! - **[Tasks][book-tasks]:** An instance of a function together with its arguments.
//! - **[Cells][book-cells]:** The locations associated with tasks where values are stored. The
//!   contents of a cell can change after the reexecution of a function.
//! - **[`Vc`s ("Value Cells")][Vc]:** A reference to a cell or a return value of a function.
//!
//! A [`Vc`] can be read to get [a read-only reference][ReadRef] to the stored data, representing a
//! snapshot of that cell at that point in time.
//!
//! On execution of functions, `turbo-tasks` will track which [`Vc`]s are read. Once any of these
//! change, `turbo-tasks` will invalidate the task created from the function's execution and it will
//! eventually be scheduled and reexecuted.
//!
//! Collectibles go through a similar process.
//!
//! [book-cells]: https://turbopack-rust-docs.vercel.sh/turbo-engine/cells.html
//! [book-tasks]: https://turbopack-rust-docs.vercel.sh/turbo-engine/tasks.html

#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![feature(try_trait_v2)]
#![feature(hash_extract_if)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(result_flattening)]
#![feature(error_generic_member_access)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(new_zeroed_alloc)]
#![feature(type_alias_impl_trait)]
#![feature(never_type)]
#![feature(impl_trait_in_assoc_type)]

pub mod backend;
mod capture_future;
mod collectibles;
mod completion;
pub mod debug;
mod display;
pub mod duration_span;
mod effect;
pub mod event;
pub mod graph;
mod id;
mod id_factory;
mod invalidation;
mod join_iter_ext;
mod key_value_pair;
#[doc(hidden)]
pub mod macro_helpers;
mod magic_any;
mod manager;
mod marker_trait;
mod native_function;
mod no_move_vec;
mod once_map;
mod output;
pub mod persisted_graph;
pub mod primitives;
mod raw_vc;
mod read_ref;
pub mod registry;
mod scope;
mod serialization_invalidation;
mod shrink_to_fit;
pub mod small_duration;
mod state;
pub mod task;
pub mod trace;
mod trait_helpers;
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
pub use effect::{apply_effects, effect, get_effects, Effects};
pub use id::{
    ExecutionId, FunctionId, LocalTaskId, SessionId, TaskId, TraitTypeId, ValueTypeId,
    TRANSIENT_TASK_BIT,
};
pub use invalidation::{
    get_invalidator, DynamicEqHash, InvalidationReason, InvalidationReasonKind,
    InvalidationReasonSet, Invalidator,
};
pub use join_iter_ext::{JoinIterExt, TryFlatJoinIterExt, TryJoinIterExt};
pub use key_value_pair::KeyValuePair;
pub use magic_any::MagicAny;
pub use manager::{
    dynamic_call, dynamic_this_call, emit, mark_finished, mark_session_dependent, mark_stateful,
    prevent_gc, run_once, run_once_with_reason, spawn_blocking, spawn_thread, trait_call,
    turbo_tasks, turbo_tasks_scope, CurrentCellRef, ReadConsistency, TaskPersistence, TurboTasks,
    TurboTasksApi, TurboTasksBackendApi, TurboTasksBackendApiExt, TurboTasksCallApi, Unused,
    UpdateInfo,
};
pub use native_function::{FunctionMeta, NativeFunction};
pub use output::OutputContent;
pub use raw_vc::{CellId, RawVc, ReadRawVcFuture, ResolveTypeError};
pub use read_ref::ReadRef;
use rustc_hash::FxHasher;
pub use scope::scope;
pub use serialization_invalidation::SerializationInvalidator;
pub use shrink_to_fit::ShrinkToFit;
pub use state::{State, TransientState};
pub use task::{task_input::TaskInput, SharedReference, TypedSharedReference};
pub use trait_ref::{IntoTraitRef, TraitRef};
pub use turbo_tasks_macros::{function, value_impl, value_trait, KeyValuePair, TaskInput};
pub use value::{TransientInstance, TransientValue, Value};
pub use value_type::{TraitMethod, TraitType, ValueType};
pub use vc::{
    Dynamic, NonLocalValue, OperationValue, OperationVc, ResolvedVc, TypedForInput, Upcast,
    ValueDefault, Vc, VcCast, VcCellNewMode, VcCellSharedMode, VcDefaultRead, VcRead,
    VcTransparentRead, VcValueTrait, VcValueTraitCast, VcValueType, VcValueTypeCast,
};

pub type FxIndexSet<T> = indexmap::IndexSet<T, BuildHasherDefault<FxHasher>>;
pub type FxIndexMap<K, V> = indexmap::IndexMap<K, V, BuildHasherDefault<FxHasher>>;

// Copied from indexmap! and indexset!
#[macro_export]
macro_rules! fxindexmap {
    (@single $($x:tt)*) => (());
    (@count $($rest:expr),*) => (<[()]>::len(&[$($crate::fxindexmap!(@single $rest)),*]));

    ($($key:expr => $value:expr,)+) => { $crate::fxindexmap!($($key => $value),+) };
    ($($key:expr => $value:expr),*) => {
        {
            let _cap = $crate::fxindexmap!(@count $($key),*);
            let mut _map = $crate::FxIndexMap::with_capacity_and_hasher(_cap, Default::default());
            $(
                _map.insert($key, $value);
            )*
            _map
        }
    };
}
#[macro_export]
macro_rules! fxindexset {
    (@single $($x:tt)*) => (());
    (@count $($rest:expr),*) => (<[()]>::len(&[$($crate::fxindexset!(@single $rest)),*]));

    ($($value:expr,)+) => { $crate::fxindexset!($($value),+) };
    ($($value:expr),*) => {
        {
            let _cap = $crate::fxindexset!(@count $($value),*);
            let mut _set = $crate::FxIndexSet::with_capacity_and_hasher(_cap, Default::default());
            $(
                _set.insert($value);
            )*
            _set
        }
    };
}

/// Implements [`VcValueType`] for the given `struct` or `enum`. These value types can be used
/// inside of a "value cell" as [`Vc<...>`][Vc].
///
/// A [`Vc`] represents a (potentially lazy) memoized computation. Each [`Vc`]'s value is placed
/// into a cell associated with the current [`TaskId`]. That [`Vc`] object can be `await`ed to get
/// [a read-only reference to the value contained in the cell][ReadRef].
///
/// This macro accepts multiple comma-separated arguments. For example:
///
/// ```
/// # #![feature(arbitrary_self_types)]
//  # #![feature(arbitrary_self_types_pointers)]
/// #[turbo_tasks::value(transparent, into = "shared")]
/// struct Foo(Vec<u32>);
/// ```
///
/// ## `cell = "..."`
///
/// Controls when a cell is invalidated upon recomputation of a task. Internally, this is performed
/// by setting the [`VcValueType::CellMode`] associated type.
///
/// - **`"new"`:** Always overrides the value in the cell, invalidating all dependent tasks.
/// - **`"shared"` *(default)*:** Compares with the existing value in the cell, before overriding it.
///   Requires the value to implement [`Eq`].
///
/// Avoiding unnecessary invalidation is important to reduce downstream recomputation of tasks that
/// depend on this cell's value.
///
/// Use `"new"` only if a correct implementation of [`Eq`] is not possible, would be expensive (e.g.
/// would require comparing a large collection), or if you're implementing a low-level primitive
/// that intentionally forces recomputation.
///
/// ## `eq = "..."`
///
/// By default, we `#[derive(PartialEq, Eq)]`. [`Eq`] is required by `cell = "shared"`. This
/// argument allows overriding that default implementation behavior.
///
/// - **`"manual"`:** Prevents deriving [`Eq`] and [`PartialEq`] so you can do it manually.
///
/// ## `into = "..."`
///
/// This macro always implements a `.cell()` method on your type with the signature:
///
/// ```ignore
/// /// Wraps the value in a cell.
/// fn cell(self) -> Vc<Self>;
/// ```
///
/// This argument controls the visibility of the `.cell()` method, as well as whether a
/// [`From<T> for Vc<T>`][From] implementation is generated.
///
/// - **`"new"` or `"shared"`:** Exposes both `.cell()` and [`From`]/[`Into`] implementations. Both
///   of these values (`"new"` or `"shared"`) do the same thing (for legacy reasons).
/// - **`"none"` *(default)*:** Makes `.cell()` private and prevents implementing [`From`]/[`Into`].
///
/// You should use the default value of `"none"` when providing your own public constructor methods.
///
/// The naming of this field and it's values are due to legacy reasons.
///
/// ## `serialization = "..."`
///
/// Affects serialization via [`serde::Serialize`] and [`serde::Deserialize`]. Serialization is
/// required for persistent caching of tasks to disk.
///
/// - **`"auto"` *(default)*:** Derives the serialization traits and enables serialization.
/// - **`"auto_for_input"`:** Same as `"auto"`, but also adds the marker trait [`TypedForInput`].
/// - **`"custom"`:** Prevents deriving the serialization traits, but still enables serialization
///   (you must manually implement [`serde::Serialize`] and [`serde::Deserialize`]).
/// - **`"custom_for_input"`:** Same as `"custom"`, but also adds the marker trait
///   [`TypedForInput`].
/// - **`"none"`:** Disables serialization and prevents deriving the traits.
///
/// ## `shared`
///
/// Sets both `cell = "shared"` *(already the default)* and `into = "shared"`, exposing the
/// `.cell()` method and adding a [`From`]/[`Into`] implementation.
///
/// ## `transparent`
///
/// This attribute is only valid on single-element unit structs. When this value is set:
///
/// 1. The struct will use [`#[repr(transparent)]`][repr-transparent].
/// 1. Read operations (`vc.await?`) return a [`ReadRef`] containing the inner type, rather than the
///    outer struct. Internally, this is accomplished using [`VcTransparentRead`] for the
///    [`VcValueType::Read`] associated type.
/// 1. Construction of the type must be performed using [`Vc::cell(inner)`][Vc::cell], rather than
///    using the `.cell()` method on the outer type (`outer.cell()`).
/// 1. The [`ValueDebug`][crate::debug::ValueDebug] implementation will defer to the inner type.
///
/// This is commonly used to create [`VcValueType`] wrappers for foreign or generic types, such as
/// [`Vec`] or [`Option`].
///
/// [repr-transparent]: https://doc.rust-lang.org/nomicon/other-reprs.html#reprtransparent
///
/// ## `non_local`
///
/// Applies the [`#[derive(NonLocalValue)]`][macro@NonLocalValue] macro.
///
/// Indicates that this struct has no fields containing [`Vc`] by implementing the [`NonLocalValue`]
/// marker trait. In order to safely implement [`NonLocalValue`], this inserts compile-time
/// assertions that every field in this struct has a type that is also a [`NonLocalValue`].
#[rustfmt::skip]
pub use turbo_tasks_macros::value;

pub type TaskIdSet = AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>;

pub mod test_helpers {
    pub use super::manager::{current_task_for_testing, with_turbo_tasks_for_testing};
}

pub fn register() {
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
