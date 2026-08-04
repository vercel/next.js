#![doc = include_str!("../README.md")]
// In a no-tokio (`sync`) build, the entire async-runtime surface is gated out, so
// some imports and the supporting scheduler/job machinery become unused. That code
// is genuinely used in the default (async) build; suppress the noise only here.
#![cfg_attr(
    not(feature = "tokio_runtime"),
    allow(dead_code, unused_imports, unused_features)
)]
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

// Lets this crate refer to itself as `turbo_tasks` so the `#[turbo_tasks::test]`
// attribute (and the `::turbo_tasks::…` paths its expansion generates) resolve when
// used inside this crate's own tests.
extern crate self as turbo_tasks;

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
mod local_task_tracker;
#[doc(hidden)]
pub mod macro_helpers;
mod manager;
pub mod mapped_read_ref;
mod marker_trait;
#[cfg(feature = "tokio_runtime")]
pub mod message_queue;
mod native_function;
mod once_map;
mod output;
pub mod panic_hooks;
pub mod parallel;
pub mod primitives;
#[cfg(feature = "tokio_runtime")]
mod priority_runner;
mod read_options;
mod read_ref;
pub mod registry;
#[cfg(feature = "tokio_runtime")]
pub mod scope;
#[cfg(not(feature = "tokio_runtime"))]
#[path = "scope_serial.rs"]
pub mod scope;
mod serialization_invalidation;
pub mod small_duration;
#[cfg(feature = "tokio_runtime")]
mod spawn;
mod state;
#[cfg(feature = "sync")]
pub mod sync_runtime;
#[cfg(feature = "sync")]
pub mod sync_stats;
pub mod task;
#[cfg(feature = "task_dirty_cause")]
mod task_dirty_cause;
mod task_execution_reason;
pub mod task_statistics;
mod tiny_vec;
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

// No-tokio counterparts of the run entry points. Same `async fn` signatures (so the
// test harness and test bodies keep `run_once(tt, fut).await`), but they drive the
// body to completion inline — no executor, no tokio channel.
#[cfg(feature = "sync")]
pub use crate::manager::{run, run_once, run_once_with_reason};
// Async-runtime-only entry points and the tokio spawn helpers. Absent from a
// tokio-free (`sync`) build, which drives execution inline via `run_sync`.
// `run`/`run_once`/`run_once_with_reason` have sync twins (below); when `sync` is also
// enabled (sync-with-tokio) the sync versions win, so only re-export the tokio ones when
// `sync` is off. The tokio spawn helpers have no sync twin and stay gated on tokio alone.
#[cfg(all(feature = "tokio_runtime", not(feature = "sync")))]
pub use crate::manager::{run, run_once, run_once_with_reason};
#[cfg(feature = "tokio_runtime")]
pub use crate::spawn::{
    JoinHandle, block_for_future, block_in_place, spawn, spawn_blocking, spawn_thread,
};
#[cfg(feature = "task_dirty_cause")]
pub use crate::task_dirty_cause::TaskDirtyCause;
pub use crate::{
    capture_future::TurboTasksPanic,
    collectibles::CollectiblesSource,
    completion::{Completion, Completions},
    display::{ValueToString, ValueToStringRef},
    dyn_task_inputs::{
        DynTaskInputs, DynTaskInputsStorage, HeapDynTaskInputsStorage, StackDynTaskInputsStorage,
    },
    effect::{
        ApplyError, CapturedEffect, Effect, EffectError, EffectExt, EffectStateStorage, Effects,
        EffectsError, read_strongly_consistent_and_apply_effects,
        resolve_strongly_consistent_and_take_and_apply_effects, take_effects,
    },
    error::PrettyPrintError,
    id::{
        ExecutionId, FunctionId, LocalTaskId, TRANSIENT_TASK_BIT, TaskId, TraitTypeId, ValueTypeId,
    },
    invalidation::{
        InvalidationReason, InvalidationReasonKind, InvalidationReasonSet, Invalidator,
        get_invalidator,
    },
    join_iter_ext::{JoinIterExt, TryFlatJoinIterExt, TryJoinIterExt},
    manager::{
        CurrentCellRef, InputResolution, ReadCellTracking, ReadConsistency, ReadTracking,
        TaskPersistence, TaskPriority, TurboTasks, TurboTasksApi, TurboTasksCallApi, Unused,
        UpdateInfo, dynamic_call, emit, get_serialization_invalidator, mark_finished,
        mark_stateful, mark_top_level_task, prevent_gc, trait_call, turbo_tasks, turbo_tasks_scope,
        turbo_tasks_weak, unmark_top_level_task_may_leak_eventually_consistent_state,
        with_turbo_tasks,
    },
    mapped_read_ref::MappedReadRef,
    output::OutputContent,
    read_options::{ReadCellOptions, ReadOutputOptions},
    read_ref::ReadRef,
    serialization_invalidation::SerializationInvalidator,
    state::{State, parking_lot_mutex_bincode},
    task::{
        SharedReference, TypedSharedReference,
        task_input::{EitherTaskInput, TaskInput},
    },
    task_execution_reason::TaskExecutionReason,
    tiny_vec::TinyVec,
    trait_ref::TraitRef,
    value::{TransientInstance, TransientValue},
    value_type::{Evictability, TraitMethod, TraitType, ValueType, ValueTypePersistence},
    vc::{
        CellId, Dynamic, NonLocalValue, OperationValue, OperationVc, OptionVcExt, OrdResolvedVc,
        RawVc, RawVcUnpacked, ReadRawVcFuture, ReadVcFuture, ResolveOperationVcFuture,
        ResolveRawVcFuture, ResolveVcFuture, ResolvedVc, ToResolvedVcFuture, Upcast, UpcastStrict,
        ValueDefault, Vc, VcCast, VcCellCompareMode, VcCellHashedCompareMode,
        VcCellKeyedCompareMode, VcCellNewMode, VcDefaultRead, VcRead, VcTransparentRead,
        VcValueTrait, VcValueTraitCast, VcValueType, VcValueTypeCast,
    },
};

/// No-tokio counterpart of [`spawn::block_in_place`]. Runs the closure on the current
/// thread (there is no async runtime to offload to), but under the sync engine it first
/// tells the worker pool this thread is about to park on an EXTERNAL resource (e.g. the
/// node-eval edge runtime's `block_on`), so the pool keeps a live replacement worker and
/// does not silently drain — otherwise concurrent external blocks deadlock pool tasks the
/// blocked work depends on. See [`tt_parallel::block_in_place`].
#[cfg(not(feature = "tokio_runtime"))]
pub fn block_in_place<R>(f: impl FnOnce() -> R) -> R {
    block_in_place_labeled("block_in_place", f)
}

/// Like [`block_in_place`], but tags the external wait with a static `label` so the sync
/// pool's stall dump can name *what* each externally-blocked worker is parked on (e.g.
/// `"node-eval:recv"`). Diagnostic aid for the sync-engine deadlock investigation.
#[cfg(not(feature = "tokio_runtime"))]
pub fn block_in_place_labeled<R>(label: &'static str, f: impl FnOnce() -> R) -> R {
    let _ = label;
    // Runs `f` inline on the current thread (never sent across threads), so no `Send`
    // bound is needed here — unlike the tokio `spawn::block_in_place`.
    #[cfg(feature = "sync")]
    {
        tt_parallel::block_in_place_labeled(label, f)
    }
    #[cfg(not(feature = "sync"))]
    {
        f()
    }
}

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

/// Read a [`Vc`] (or any awaitable produced by a task). This is the dual-mode
/// pivot of the synchronous-turbo-tasks migration: in the default (async) build it
/// expands to `.await`; in the `sync` build it reads the cell synchronously.
///
/// Task bodies should use `read!(vc)` instead of `vc.await` so that the same source
/// compiles in either mode. The Phase-3 codemod rewrites `.await` sites to this.
///
/// ```ignore
/// let cfg = read!(config_vc)?;
/// ```
#[cfg(not(feature = "sync"))]
#[macro_export]
macro_rules! read {
    ($e:expr $(,)?) => {
        ($e).await
    };
}
#[cfg(feature = "sync")]
#[macro_export]
macro_rules! read {
    ($e:expr $(,)?) => {
        $crate::macro_helpers::SyncRead::sync_read($e)
    };
}

/// Read many task outputs concurrently. Async build: `try_join().await`. Sync build:
/// a parallel fan-out (work-stealing). The dual-mode replacement for the
/// `TryJoinIterExt::try_join().await` pattern.
///
/// ```ignore
/// let parts = parallel!(items.iter().map(|i| analyze(*i)))?;
/// ```
#[cfg(not(feature = "sync"))]
#[macro_export]
macro_rules! parallel {
    ($it:expr $(,)?) => {
        // Map each item through `IntoFuture` so the iterator may yield `Vc`s
        // (task-call results) or plain futures uniformly — both are read
        // concurrently. Mirrors the `.map(|x| async { x.await }).try_join()` idiom.
        $crate::TryJoinIterExt::try_join(
            ::std::iter::IntoIterator::into_iter($it).map(::std::future::IntoFuture::into_future),
        )
        .await
    };
}
#[cfg(feature = "sync")]
#[macro_export]
macro_rules! parallel {
    ($it:expr $(,)?) => {
        // Fan the reads out across rayon's work-stealing pool, collecting into a
        // single Result, matching the async `try_join().await` output type.
        $crate::sync_parallel_read(
            ::std::iter::IntoIterator::into_iter($it).collect::<::std::vec::Vec<_>>(),
        )
    };
}

// Compile-only checks that the dual-mode macros expand to well-formed code in each
// mode. Async mode exercises the real `.await` / `try_join` expansions; sync mode
// only checks that use-sites compile (the helpers are deferred — see macro_helpers).
#[cfg(not(feature = "sync"))]
#[allow(dead_code)]
async fn _dual_mode_async_compiles() -> anyhow::Result<i32> {
    let v: i32 = read!(async { anyhow::Ok(5) })?;
    let parts: Vec<i32> = parallel!((1..=2).map(|i| async move { anyhow::Ok::<i32>(i) }))?;
    Ok(v + parts.into_iter().sum::<i32>())
}
// Same body as the async check, but as a plain `fn` (sync mode strips `async`).
// Proves `read!`/`parallel!` expand to well-formed, identically-typed sync code.
#[cfg(feature = "sync")]
#[allow(dead_code)]
fn _dual_mode_sync_compiles() -> anyhow::Result<i32> {
    // `read!` on an already-synchronous `Result` (the identity `SyncRead` impl).
    // Async blocks are intentionally *rejected* by `SyncRead` in the sync build —
    // there is no runtime to drive them; `read!` reads `Vc`s synchronously.
    // (`parallel!` likewise only accepts `Vc` reads under `sync`, not async blocks —
    // it is exercised by the real `turbo-tasks-sync-tests` fan-out tests.)
    let v: i32 = read!(anyhow::Ok::<i32>(5))?;
    Ok(v)
}

/// Parallel-map helper for the `sync` build (see [`crate::manager::sync_parallel_map`]).
#[cfg(feature = "sync")]
pub use crate::manager::sync_parallel_map;
/// Parallel read helper backing the `sync` build's `parallel!` macro.
#[cfg(feature = "sync")]
pub use crate::manager::sync_parallel_read;

/// Define a dual-mode function from a single body: `async fn` in the default (async)
/// build, plain `fn` in the `sync` build. This is conversion pattern 3 (dual-mode
/// helper) without duplicating the body.
///
/// The body must be written mode-agnostically: every await point goes through
/// [`read!`]/[`parallel!`], and everything it calls must itself be dual-mode. Works for
/// free functions and for methods in inherent or trait `impl` blocks — but not for
/// methods of `#[async_trait]` traits (the attribute rewrites the whole `impl` block, so
/// those need two `cfg`-gated `impl` blocks; have each delegate to a `dual_fn!` helper).
///
/// Generic parameters are supported as a plain identifier list (`<T, E>`); put bounds in
/// the argument list (`impl Trait`) — `where` clauses and bounded parameter lists are
/// not parsed.
///
/// ```ignore
/// turbo_tasks::dual_fn! {
///     /// Reads the config and formats it.
///     pub fn describe(config: Vc<Config>) -> Result<String> {
///         let config = turbo_tasks::read!(config)?;
///         Ok(format!("{config:?}"))
///     }
/// }
/// ```
#[cfg(not(feature = "sync"))]
#[macro_export]
macro_rules! dual_fn {
    ($(#[$attr:meta])* $vis:vis fn $name:ident ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis async fn $name ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($gen:ident),* $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis async fn $name <$($gen),*> ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($lt:lifetime),* $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis async fn $name <$($lt),*> ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($lt:lifetime),+ , $($gen:ident),+ $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis async fn $name <$($lt),+ , $($gen),+> ($($args)*) -> $ret $body
    };
}
/// See the async-build definition above; the `sync` build emits a plain `fn`.
#[cfg(feature = "sync")]
#[macro_export]
macro_rules! dual_fn {
    ($(#[$attr:meta])* $vis:vis fn $name:ident ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis fn $name ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($gen:ident),* $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis fn $name <$($gen),*> ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($lt:lifetime),* $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis fn $name <$($lt),*> ($($args)*) -> $ret $body
    };
    ($(#[$attr:meta])* $vis:vis fn $name:ident <$($lt:lifetime),+ , $($gen:ident),+ $(,)?> ($($args:tt)*) -> $ret:ty $body:block) => {
        $(#[$attr])*
        $vis fn $name <$($lt),+ , $($gen),+> ($($args)*) -> $ret $body
    };
}

#[doc = include_str!("../singleton_pattern.md")]
pub mod _singleton_pattern {}

#[doc = include_str!("../function.md")]
#[rustfmt::skip]
pub use turbo_tasks_macros::function;
/// Dual-mode test attribute. `#[turbo_tasks::test]` expands to `#[tokio::test]` in the
/// async build and to a synchronous `#[test]` (driven by `sync_poll_test`) in the
/// `sync` (no-tokio) build, so one async test body runs under both.
pub use turbo_tasks_macros::test;

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

/// Attribute macro for declaring a [`TaskInput`] type. Emits:
///
/// - `unsafe impl NonLocalValue for X {}` (unless `contains_unresolved_vcs` is set).
/// - `impl TaskInput for X` with a field-walking `is_transient`. By default `is_resolved` and
///   `resolve_input` use the trait defaults (`true` and a [`CloneReady`] future — 8 bytes, no
///   async-fn envelope); when `contains_unresolved_vcs` is set, both are emitted as
///   field-walking implementations as well.
///
/// Default form (most types):
///
/// ```ignore
/// #[turbo_tasks::task_input]
/// #[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
/// pub struct MyTaskInput { ... }
/// ```
///
/// Opt out of `NonLocalValue` when the type contains `Vc<T>` fields:
///
/// ```ignore
/// #[turbo_tasks::task_input(contains_unresolved_vcs)]
/// #[derive(Clone, Debug, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
/// pub struct VcCarrier { vc: Vc<...> }
/// ```
pub use turbo_tasks_macros::task_input;

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

pub type TaskIdSet = AutoSet<TaskId, BuildHasherDefault<FxHasher>, 2>;
