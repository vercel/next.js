#![doc = include_str!("../README.md")]
#![feature(trivial_bounds)]
#![feature(min_specialization)]
#![deny(unsafe_op_in_unsafe_fn)]
#![feature(error_generic_member_access)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![feature(ptr_metadata)]
#![feature(sync_unsafe_cell)]
#![feature(async_fn_traits)]
#![feature(impl_trait_in_assoc_type)]
#![feature(const_type_name)]

pub mod backend;
mod capture_future;
mod collectibles;
mod completion;
pub mod debug;
#[doc = include_str!("../FORMATTING.md")]
pub mod display;
pub mod duration_span;
mod dyn_task_inputs;
mod effect;
mod error;
pub mod event;
pub mod graph;
mod id;
mod id_factory;
mod invalidation;
mod join_iter_ext;
pub mod keyed;
#[doc(hidden)]
pub mod macro_helpers;
mod manager;
pub mod mapped_read_ref;
mod marker_trait;
pub mod message_queue;
mod native_function;
mod once_map;
mod output;
pub mod panic_hooks;
pub mod parallel;
pub mod primitives;
mod priority_runner;
mod raw_vc;
mod read_options;
mod read_ref;
pub mod registry;
pub mod scope;
mod serialization_invalidation;
pub mod small_duration;
mod spawn;
mod state;
pub mod task;
mod task_execution_reason;
pub mod task_statistics;
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
use rustc_hash::FxHasher;
pub use shrink_to_fit::ShrinkToFit;
pub use turbo_tasks_macros::{DeterministicHash, turbobail, turbofmt};

pub use crate::{
    capture_future::TurboTasksPanic,
    collectibles::CollectiblesSource,
    completion::{Completion, Completions},
    display::{ValueToString, ValueToStringRef},
    dyn_task_inputs::{
        DynTaskInputs, OwnedStackDynTaskInputs, StackDynTaskInputs, StackDynTaskInputsSlot,
    },
    effect::{Effect, EffectError, EffectStateStorage, Effects, emit_effect, take_effects},
    error::PrettyPrintError,
    id::{ExecutionId, LocalTaskId, TRANSIENT_TASK_BIT, TaskId, TraitTypeId, ValueTypeId},
    invalidation::{
        InvalidationReason, InvalidationReasonKind, InvalidationReasonSet, Invalidator,
        get_invalidator,
    },
    join_iter_ext::{JoinIterExt, TryFlatJoinIterExt, TryJoinIterExt},
    manager::{
        CurrentCellRef, ReadCellTracking, ReadConsistency, ReadTracking, TaskPersistence,
        TaskPriority, TurboTasks, TurboTasksApi, TurboTasksBackendApi, TurboTasksCallApi, Unused,
        UpdateInfo, dynamic_call, emit, get_serialization_invalidator, mark_finished,
        mark_session_dependent, mark_stateful, mark_top_level_task, prevent_gc, run, run_once,
        run_once_with_reason, trait_call, turbo_tasks, turbo_tasks_scope, turbo_tasks_weak,
        unmark_top_level_task_may_leak_eventually_consistent_state, with_turbo_tasks,
    },
    mapped_read_ref::MappedReadRef,
    output::OutputContent,
    raw_vc::{CellId, RawVc, ReadRawVcFuture, ResolveRawVcFuture},
    read_options::{ReadCellOptions, ReadOutputOptions},
    read_ref::ReadRef,
    serialization_invalidation::SerializationInvalidator,
    spawn::{JoinHandle, block_for_future, block_in_place, spawn, spawn_blocking, spawn_thread},
    state::{State, TransientState},
    task::{
        SharedReference, TypedSharedReference,
        task_input::{EitherTaskInput, TaskInput},
    },
    task_execution_reason::TaskExecutionReason,
    trait_ref::TraitRef,
    value::{TransientInstance, TransientValue},
    value_type::{TraitMethod, TraitType, ValueType},
    vc::{
        Dynamic, NonLocalValue, OperationValue, OperationVc, OptionVcExt, ReadVcFuture,
        ResolveOperationVcFuture, ResolveVcFuture, ResolvedVc, ToResolvedVcFuture, Upcast,
        UpcastStrict, ValueDefault, Vc, VcCast, VcCellCompareMode, VcCellHashedCompareMode,
        VcCellKeyedCompareMode, VcCellNewMode, VcDefaultRead, VcRead, VcTransparentRead,
        VcValueTrait, VcValueTraitCast, VcValueType, VcValueTypeCast,
    },
};

pub type FxIndexSet<T> = indexmap::IndexSet<T, BuildHasherDefault<FxHasher>>;
pub type FxIndexMap<K, V> = indexmap::IndexMap<K, V, BuildHasherDefault<FxHasher>>;
pub type FxDashMap<K, V> = dashmap::DashMap<K, V, BuildHasherDefault<FxHasher>>;

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

#[doc = include_str!("../singleton_pattern.md")]
pub mod _singleton_pattern {}

#[doc = include_str!("../function.md")]
#[rustfmt::skip]
pub use turbo_tasks_macros::function;

/// Implements [`VcValueType`] for the given `struct` or `enum`. These value types can be used
/// inside of a "value cell" as [`Vc<...>`][Vc].
///
/// A [`Vc`] represents the result of a computation. Each [`Vc`]'s value is placed into a cell
/// associated with the current [`TaskId`]. That [`Vc`] object can be `await`ed to get [a read-only
/// reference to the value contained in the cell][ReadRef].
///
/// This macro accepts multiple comma-separated arguments. For example:
///
/// ```
/// # #![feature(arbitrary_self_types)]
//  # #![feature(arbitrary_self_types_pointers)]
/// #[turbo_tasks::value(transparent, shared)]
/// struct Foo(Vec<u32>);
/// ```
///
/// ## `cell = "..."`
///
/// Controls when a cell is invalidated upon recomputation of a task. Internally, this is performed
/// by setting the [`VcValueType::CellMode`] associated type.
///
/// - **`"new"`:** Always overrides the value in the cell, invalidating all dependent tasks.
/// - **`"compare"` *(default)*:** Compares with the existing value in the cell, before overriding it.
///   Requires the value to implement [`Eq`].
/// - **`"keyed"`:** Like `"compare"`, but uses per-key invalidation for transparent map types.
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
/// By default, we `#[derive(PartialEq, Eq)]`. [`Eq`] is required by `cell = "compare"`. This
/// argument allows overriding that default implementation behavior.
///
/// - **`"manual"`:** Prevents deriving [`Eq`] and [`PartialEq`] so you can do it manually.
///
/// ## `serialization = "..."`
///
/// Affects serialization via [`bincode::Encode`] and [`bincode::Decode`]. Serialization is required
/// for the filesystem cache of tasks.
///
/// - **`"auto"` *(default)*:** Derives the bincode traits and enables serialization.
/// - **`"custom"`:** Prevents deriving the bincode traits, but still enables serialization
///   (you must manually implement [`bincode::Encode`] and [`bincode::Decode`]).
/// - **`"hash"`:** Like `"none"` (no bincode serialization), but instead stores a hash of the cell
///   value so that changes can be detected even when the transient cell data has been evicted
///   from memory or was never stored in the cache—avoiding unnecessary downstream invalidation.
///   Only valid with `cell = "compare"`.
///   Requires the value to implement both [`Eq`] and [`DeterministicHash`][turbo_tasks_hash::DeterministicHash].
/// - **`"none"`:** Disables serialization and prevents deriving the traits.
///
/// ## `hash = "..."`
///
/// By default, when using `serialization = "hash"`, we `#[derive(DeterministicHash)]`. This argument allows
/// overriding that default implementation behavior.
///
/// - **`"manual"`:** Prevents deriving [`DeterministicHash`][turbo_tasks_hash::DeterministicHash] so you can do it manually.
///   Only valid with `serialization = "hash"`.
///
/// ## `shared`
///
/// This flag makes the macro-generated `.cell()` method public so everyone can use it.
///
/// Non-transparent types are given a `.cell()` method. That method returns a `Vc` of the type.
///
/// This option does not apply to wrapper types that use `transparent`. Those use the public
/// [`Vc::cell`] function for construction.
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
/// ## `local`
///
/// Skip the implementation of [`NonLocalValue`] for this type.
///
/// If not specified, we apply the [`#[derive(NonLocalValue)]`][macro@NonLocalValue] macro, which
/// asserts that this struct has no fields containing [`Vc`] by implementing the [`NonLocalValue`]
/// marker trait. Compile-time assertions are generated on every field, checking that they are also
/// [`NonLocalValue`]s.
#[rustfmt::skip]
pub use turbo_tasks_macros::value;

/// Allows this trait to be used as part of a trait object inside of a value cell, in the form of
/// `Vc<Box<dyn MyTrait>>`. The annotated trait is made into a subtrait of [`VcValueTrait`].
///
/// ```ignore
/// #[turbo_tasks::value_trait]
/// pub trait MyTrait {
///
///     #[turbo_tasks::function]
///     fn method(self: Vc<Self>, a: i32) -> Vc<Something>;
///
///     // External signature: fn method(self: Vc<Self>, a: i32) -> Vc<Something>
///     #[turbo_tasks::function]
///     async fn method2(&self, a: i32) -> Result<Vc<Something>> {
///         // Default implementation
///     }
///
///     // A normal trait item, not a turbo-task
///     fn normal(&self) -> SomethingElse;
/// }
///
/// #[turbo_tasks::value_trait]
/// pub trait OtherTrait: MyTrait + ValueToString {
///     // ...
/// }
///
/// #[turbo_tasks::value_impl]
/// impl MyTrait for MyValue {
///     // only the external signature must match (see the docs for #[turbo_tasks::function])
///     #[turbo_tasks::function]
///     fn method(&self, a: i32) -> Vc<Something> {
///         todo!()
///     }
///
///     fn normal(&self) -> SomethingElse {
///         todo!()
///     }
/// }
/// ```
///
/// The `#[turbo_tasks::value_trait]` annotation derives [`VcValueTrait`] and registers the trait
/// and its methods.
///
/// All methods annotated with [`#[turbo_tasks::function]`][function] are cached, and
/// the external signature rewriting rules defined on that macro are applied.
///
/// Default implementation are supported.
///
/// ## Arguments
///
/// Example: `#[turbo_tasks::value_trait(no_debug, operation)]`
///
/// ### `no_debug`
///
/// Disables the automatic implementation of [`ValueDebug`][debug::ValueDebug].
///
/// Example: `#[turbo_tasks::value_trait(no_debug)]`
///
/// ### `Operation`
///
/// Adds [`OperationValue`] as a supertrait of this trait.
///
/// Example: `#[turbo_tasks::value_trait(operation)]`
#[rustfmt::skip]
pub use turbo_tasks_macros::value_trait;

/// A macro used on any `impl` block for a [`VcValueType`]. This can either be an inherent
/// implementation or a trait implementation (see [`turbo_tasks::value_trait`][value_trait] and
/// [`VcValueTrait`]).
///
/// Methods should be annotated with the [`#[turbo_tasks::function]`][function] macro.
///
/// ```ignore
/// #[turbo_tasks::value_impl]
/// impl MyTrait for MyValue {
///     #[turbo_tasks::function]
///     fn method(&self, a: i32) -> Vc<Something> {
///         todo!()
///     }
/// }
/// ```
#[rustfmt::skip]
pub use turbo_tasks_macros::value_impl;

/// Derives the TaskStorage struct and generates optimized storage structures.
///
/// This macro analyzes `field` annotations and generates:
/// 1. A unified TaskStorage struct
/// 2. LazyField enum for lazy_vec fields
/// 3. Typed accessor methods on TaskStorage
/// 4. TaskStorageAccessors trait with accessor methods
/// 5. TaskFlags bitfield for boolean flags
///
/// # Field Attributes
///
/// All fields require two attributes:
///
/// ## `storage = "..."` (required)
///
/// Specifies how the field is stored:
/// - `direct` - Direct field access (e.g., `Option<OutputValue>`)
/// - `auto_set` - Uses AutoSet for small collections
/// - `auto_map` - Uses AutoMap for key-value pairs
/// - `counter_map` - Uses CounterMap for reference counting
/// - `flag` - Boolean flag stored in a compact TaskFlags bitfield (field type must be `bool`)
///
/// ## `category = "..."` (required)
///
/// Specifies the data category for persistence and access:
/// - `data` - Frequently changed, bulk I/O
/// - `meta` - Rarely changed, small I/O
/// - `transient` - Field is not serialized (in-memory only)
///
/// ## Optional Modifiers
///
/// - `inline` - Field is stored inline on TaskStorage (default is lazy). Only use for hot-path
///   fields that are frequently accessed.
/// - `default` - Use `Default::default()` semantics instead of `Option` for inline direct fields.
/// - `filter_transient` - Filter out transient values during serialization.
/// - Serialization methods
#[rustfmt::skip]
pub use turbo_tasks_macros::task_storage;

/// Refer to [the trait documentation][trait@TaskInput] for usage.
#[rustfmt::skip]
pub use turbo_tasks_macros::TaskInput;

pub type TaskIdSet = AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>;

pub mod test_helpers {
    pub use super::manager::{current_task_for_testing, with_turbo_tasks_for_testing};
}
