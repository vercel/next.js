//! Runtime helpers for [turbo-tasks-macro].

use std::{
    cell::SyncUnsafeCell,
    ptr::{DynMetadata, Pointee},
};

pub use async_trait::async_trait;
pub use bincode;
pub use ctor;
pub use inventory;
use rustc_hash::FxHashMap;
pub use shrink_to_fit;
pub use tracing;

#[cfg(debug_assertions)]
use crate::debug::ValueDebugFormatString;
use crate::{NonLocalValue, RawVc, TaskInput, TaskPersistence, TraitType, ValueType, ValueTypeId};
pub use crate::{
    dyn_task_inputs::DynTaskInputs,
    global_name_for_method, global_name_for_scope, global_name_for_trait_method,
    global_name_for_trait_method_impl, global_name_for_type, inventory_submit,
    manager::{find_cell_by_id, find_cell_by_type, spawn_detached_for_testing},
    native_function::{
        ArgMeta, NativeFunction, VTABLE_DEFAULT, downcast_args_owned, downcast_args_ref,
        downcast_stack_args_owned,
    },
    registry::RegistryDef,
    task::function::{into_task_fn, into_task_fn_with_this},
    turbo_register,
    value_type::{TraitVtablePrototype, build_trait_vtable, index_of_method_name},
};

#[cfg(debug_assertions)]
#[inline(never)]
pub async fn value_debug_format_field(value: ValueDebugFormatString<'_>) -> String {
    match value.try_to_string().await {
        Ok(result) => result,
        Err(err) => format!("{err:?}"),
    }
}

pub fn get_persistence_from_inputs(inputs: &impl TaskInput) -> TaskPersistence {
    if inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn get_persistence_from_inputs_and_this(
    this: RawVc,
    inputs: &impl TaskInput,
) -> TaskPersistence {
    if this.is_transient() || inputs.is_transient() {
        TaskPersistence::Transient
    } else {
        TaskPersistence::Persistent
    }
}

pub fn assert_argument_is_non_local_value<Argument: NonLocalValue>() {}

#[macro_export]
macro_rules! stringify_path {
    ($path:path) => {
        stringify!($path)
    };
}

/// Rexport std::ptr::metadata so not every crate needs to enable the feature when they use our
/// macros.
#[inline(always)]
pub const fn metadata<T: ?Sized>(ptr: *const T) -> <T as Pointee>::Metadata {
    // Ideally we would just `pub use std::ptr::metadata;` but this doesn't seem to work.
    std::ptr::metadata(ptr)
}

/// Const wrapper around `std::any::type_name` so downstream crates don't need to enable the
/// unstable `const_type_name` feature.
#[doc(hidden)]
pub const fn const_type_name<T: ?Sized>() -> &'static str {
    std::any::type_name::<T>()
}

/// Compute the total byte length of all string slices.
#[doc(hidden)]
pub const fn const_concat_len(slices: &[&str]) -> usize {
    let mut total = 0;
    let mut i = 0;
    while i < slices.len() {
        total += slices[i].len();
        i += 1;
    }
    total
}

/// Copy all string slices into a fixed-size byte array at compile time.
#[doc(hidden)]
pub const fn const_concat_into<const N: usize>(slices: &[&str]) -> [u8; N] {
    let mut buf = [0u8; N];
    let mut pos = 0;
    let mut i = 0;
    while i < slices.len() {
        let bytes = slices[i].as_bytes();
        let (_, rest) = buf.split_at_mut(pos);
        let (dst, _) = rest.split_at_mut(bytes.len());
        dst.copy_from_slice(bytes);
        pos += bytes.len();
        i += 1;
    }
    assert!(pos == N, "const_concat: length mismatch");
    buf
}

/// Concatenate a const slice of `&str` into a single `&'static str` at compile time.
///
/// This is a macro only because const generics require the length to be a const expression
/// computed from the input. The call sites look like normal function calls:
///
/// ```ignore
/// const_concat!(&[type_name, "::", method_name])
/// ```
#[doc(hidden)]
#[macro_export]
macro_rules! const_concat {
    ($slices:expr) => {{
        const SLICES: &[&str] = $slices;
        const LEN: usize = $crate::macro_helpers::const_concat_len(SLICES);
        const BYTES: [u8; LEN] = $crate::macro_helpers::const_concat_into(SLICES);
        // SAFETY: all inputs are valid UTF-8 strings, concatenation preserves UTF-8
        const STR: &str = unsafe { ::std::str::from_utf8_unchecked(&BYTES) };
        STR
    }};
}

/// Const fn that strips `count` trailing `::component` segments from a string.
/// Used by `global_name_for_scope!` to extract the module path from a `type_name`.
#[doc(hidden)]
pub const fn strip_trailing_segments(s: &str, count: usize) -> &str {
    let mut remaining = s;
    let mut i = 0;
    while i < count {
        let bytes = remaining.as_bytes();
        if bytes.len() < 2 {
            return s;
        }
        let mut pos = bytes.len();
        loop {
            if pos < 2 {
                return s;
            }
            pos -= 1;
            if bytes[pos] == b':' && bytes[pos - 1] == b':' {
                (remaining, _) = remaining.split_at(pos - 1);
                break;
            }
        }
        i += 1;
    }
    remaining
}

/// A registry of all the impl vtables for a given VcValue trait.
///
/// `const`-constructed as a plain `static`. Populated in two phases:
///
/// 1. **ctor phase** (before `main`): `value_impl`-emitted `#[ctor::ctor]` functions push
///    `(value_type, DynMetadata)` pairs into `pending`. `ValueType` ids are not yet assigned here —
///    we just accumulate.
/// 2. **`finalize` phase** (inside the `VALUES` `LazyLock` initializer, after ids are assigned):
///    `pending` is drained into `inner`, keyed by `ValueTypeId`. Idempotent.
///
/// After finalize, the cast path is a single hashmap `.get()` keyed by `u16` — no `LazyLock`
/// check, no `get_value_type(id)` indirection. The vtable pointer for each
/// `impl Trait for Concrete` is materialized at compile time, so there's no runtime `transmute`
/// or indirect fn-pointer call either.
pub struct VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    /// Accumulator written from ctors. `Some` until `finalize` runs, then `take`n and left
    /// `None` so any post-finalize call to `register` panics rather than silently dropping
    /// the registration. The `None` state also makes subsequent `finalize` calls cheap no-ops.
    #[allow(clippy::type_complexity)]
    pending: SyncUnsafeCell<Option<Vec<(&'static ValueType, DynMetadata<T>)>>>,
    /// Built once by `finalize`, read-only thereafter. `None` until finalize runs.
    inner: SyncUnsafeCell<Option<FxHashMap<ValueTypeId, DynMetadata<T>>>>,
}

// SAFETY: writes to `pending` happen only from `#[ctor::ctor]` functions, which run serially on
// the main thread before `main`. Writes to `inner` happen only from `finalize`, which runs once
// inside the `VALUES` `LazyLock` initializer (synchronized by the `LazyLock`). Reads of `inner`
// from `cast` are published by that same `LazyLock` — see the `cast` safety comment.
unsafe impl<T> Sync for VTableRegistry<T> where T: Pointee<Metadata = DynMetadata<T>> + ?Sized {}

impl<T> VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    pub const fn new() -> Self {
        Self {
            pending: SyncUnsafeCell::new(Some(Vec::new())),
            inner: SyncUnsafeCell::new(None),
        }
    }

    /// Queue an `impl Trait for Concrete` registration. Called from a `#[ctor::ctor]` function
    /// at program load, before `ValueType` ids are assigned. The actual map is built later by
    /// [`Self::finalize`].
    ///
    /// Panics if called after `finalize`. Since all `value_impl` ctors run before `main` and
    /// `finalize` runs lazily after `main`, this should be unreachable in normal use; the
    /// panic guards against future changes that might violate that ordering.
    pub fn register(&'static self, value_type: &'static ValueType, fat_ptr: *const T) {
        // SAFETY: ctors run single-threaded at load; no concurrent readers or writers.
        let pending = unsafe { &mut *self.pending.get() };
        let Some(pending) = pending.as_mut() else {
            panic!("VTableRegistry::register called after finalize for {value_type}");
        };
        pending.push((value_type, std::ptr::metadata(fat_ptr)));
    }

    /// Take `pending` into `inner`, resolving each `&'static ValueType` to its assigned
    /// `ValueTypeId`. Must be called after `VALUES` ids are assigned (i.e. from inside the
    /// `VALUES` `LazyLock` initializer). Idempotent: a second call is a no-op, which lets
    /// `register_all_trait_methods` invoke `finalize_vtable_registry` once per impl without
    /// having to dedup.
    pub fn finalize(&'static self) {
        // SAFETY: invoked from inside the `VALUES` `LazyLock` initializer (single-threaded
        // section synchronized by the `LazyLock`). All ctors completed before `main`.
        let pending = unsafe { &mut *self.pending.get() };
        // `take` makes any later `register` call (which would otherwise be silently dropped)
        // hit the `None` branch and panic; subsequent `finalize` calls also short-circuit here.
        let Some(pending) = pending.take() else {
            return;
        };
        let inner = unsafe { &mut *self.inner.get() };
        debug_assert!(inner.is_none(), "inner already populated");
        let mut map = FxHashMap::with_capacity_and_hasher(pending.len(), Default::default());
        for (value_type, metadata) in pending {
            // SAFETY: we're called from inside the `VALUES` `LazyLock` initializer, after
            // `init_registry` has assigned ids. Calling `get_value_type_id` here would re-enter
            // `LazyLock::force` and deadlock; read the id cell directly instead.
            let id = unsafe { crate::registry::get_value_type_id_unchecked(value_type) };
            let prev = map.insert(id, metadata);
            debug_assert!(
                prev.is_none(),
                "multiple trait impls registered for {value_type}"
            );
        }
        *inner = Some(map);
    }

    pub(crate) fn cast(&self, id: ValueTypeId, raw: *const ()) -> *const T {
        // SAFETY: any caller in possession of a `ValueTypeId` must have already forced the
        // `VALUES` `LazyLock` (that's the only way to obtain one). `finalize` ran inside that
        // initializer, so its write to `inner` happens-before this read via the `LazyLock`'s
        // acquire fence.
        let inner = unsafe { &*self.inner.get() };
        let Some(metadata) = inner.as_ref().and_then(|map| map.get(&id)) else {
            panic!(
                "no trait impl registered for value type {}",
                crate::registry::get_value_type(id)
            )
        };
        std::ptr::from_raw_parts(raw, *metadata)
    }
}

impl<T> Default for VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    fn default() -> Self {
        Self::new()
    }
}

pub struct CollectableTraitMethods {
    pub value_type: &'static ValueType,
    pub trait_type: &'static TraitType,
    pub methods: &'static [&'static NativeFunction],
    /// Calls `<Box<dyn Trait>>::IMPL_VTABLES.finalize()` for the trait this entry corresponds
    /// to. Invoked from `register_all_trait_methods` after `VALUES` ids are assigned. The same
    /// trait's registry will be finalized once per impl, but `VTableRegistry::finalize` is
    /// idempotent.
    pub finalize_vtable_registry: fn(),
}
inventory::collect! {CollectableTraitMethods}

/// Submit an item to the inventory.
///
/// This macro is a wrapper around `inventory::submit` that adds a `#[not(cfg(rust_analyzer))]`
/// attribute to the item. This is to avoid warnings about unused items when using Rust Analyzer.
#[doc(hidden)]
#[macro_export]
macro_rules! inventory_submit {
    ($($item:tt)*) => {
        #[cfg(not(rust_analyzer))]
        $crate::macro_helpers::inventory_submit_inner! { $($item)* }
    }
}

/// Exported so the above macro can reference it.
#[doc(hidden)]
pub use inventory::submit as inventory_submit_inner;

/// Use `type_name` to get globally unique identifier that's stable across multiple executions of
/// the same Turbopack version, potentially allowing cache sharing across platforms/architectures.
///
/// The stdlib docs explicitly recommend against using type_name to get a unique identifier, but the
/// way we're using it here seems unlikely to break. We've got runtime logic to panic if it breaks.
#[doc(hidden)]
#[macro_export]
macro_rules! global_name_for_type {
    ($item:ty) => {
        $crate::macro_helpers::const_type_name::<$item>()
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! global_name_for_method {
    ($ty:ty, $method:ident) => {
        $crate::const_concat!(&[
            $crate::macro_helpers::const_type_name::<$ty>(),
            "::",
            ::std::stringify!($method),
        ])
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! global_name_for_trait_method {
    ($trait:path, $method:ident) => {
        $crate::const_concat!(&[
            "<",
            $crate::macro_helpers::const_type_name::<dyn $trait>(),
            ">::",
            ::std::stringify!($method),
        ])
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! global_name_for_trait_method_impl {
    ($ty:ty, $trait:path, $method:ident) => {
        $crate::const_concat!(&[
            "<",
            $crate::macro_helpers::const_type_name::<$ty>(),
            " as ",
            $crate::macro_helpers::const_type_name::<dyn $trait>(),
            ">::",
            ::std::stringify!($method),
        ])
    };
}

/// Get a globally unique name for an identifier in a current or parent scope.
#[doc(hidden)]
#[macro_export]
macro_rules! global_name_for_scope {
    ($depth:literal, $($item:tt)+) => {{
        struct PlaceholderMarkerType;
        $crate::const_concat!(&[
            $crate::macro_helpers::strip_trailing_segments(
                $crate::macro_helpers::const_type_name::<PlaceholderMarkerType>(),
                $depth + 1,  // add one for the placeholder
            ),
            "::",
            ::std::stringify!($($item)+),
        ])
    }}
}
