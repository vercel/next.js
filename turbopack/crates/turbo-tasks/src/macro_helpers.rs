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
/// `const`-constructed as a plain `static`. Populated during the `#[ctor::ctor]` phase by
/// functions emitted by `value_impl`, then treated as read-only for the lifetime of the process.
/// The vtable pointer for each `impl Trait for Concrete` is materialized at compile time (no
/// runtime `transmute` or indirect fn-pointer call), and lookup is a single hashmap get — no
/// `LazyLock` check and no list walk.
pub struct VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    // `SyncUnsafeCell` gives us a `const fn new()` for the empty map. Writes happen only during
    // single-threaded ctor phase; reads happen only after `main` starts.
    inner: SyncUnsafeCell<Option<FxHashMap<&'static ValueType, DynMetadata<T>>>>,
}

// SAFETY: the only writers are `#[ctor::ctor]` functions, which run serially on the main thread
// before `main` starts. After that, the map is read-only. `VtablePtr` itself is `Send`/`Sync`.
unsafe impl<T> Sync for VTableRegistry<T> where T: Pointee<Metadata = DynMetadata<T>> + ?Sized {}

impl<T> VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    pub const fn new() -> Self {
        Self {
            inner: SyncUnsafeCell::new(None),
        }
    }

    /// Register an `impl Trait for Concrete` — called only from a `#[ctor::ctor]` function at
    /// program load. Safe under the single-threaded-ctor-phase invariant noted on the impl.
    //
    // `clippy::mutable_key_type` fires because `ValueType` contains a `SyncUnsafeCell<u16>` via
    // `RegistryType`. That cell only holds the runtime-assigned type id; `ValueType`'s
    // `Hash` / `Eq` impls (see `turbo_registry!`) use pointer identity, so the interior
    // mutability doesn't affect the hash.
    #[allow(clippy::mutable_key_type)]
    pub fn register(&'static self, value_type: &'static ValueType, fat_ptr: *const T) {
        // SAFETY: ctors run single-threaded at load; no concurrent readers exist yet.
        let inner = unsafe { &mut *self.inner.get() };
        let map = inner.get_or_insert_with(FxHashMap::default);
        let prev = map.insert(value_type, std::ptr::metadata(fat_ptr));
        debug_assert!(
            prev.is_none(),
            "multiple trait impls registered for {value_type}"
        );
    }

    #[allow(clippy::mutable_key_type)] // hashed by pointer, see `register`
    pub(crate) fn cast(&self, id: ValueTypeId, raw: *const ()) -> *const T {
        let value_type = crate::registry::get_value_type(id);
        // SAFETY: the ctor write phase completed before `main` started.
        let inner = unsafe { &*self.inner.get() };
        let Some(map) = inner else {
            panic!("no trait impl registered for value type {value_type}")
        };
        let Some(vtable) = map.get(&value_type) else {
            panic!("no trait impl registered for value type {value_type}")
        };

        std::ptr::from_raw_parts(raw, *vtable)
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
