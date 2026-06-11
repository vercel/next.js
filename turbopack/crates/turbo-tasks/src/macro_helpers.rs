//! Runtime helpers for [turbo-tasks-macro].

use std::{
    cell::SyncUnsafeCell,
    ptr::{DynMetadata, Pointee},
};

pub use async_trait::async_trait;
pub use bincode;
use rustc_hash::FxHashMap;
pub use scattered_collect;
use scattered_collect::slice::ScatteredSlice;
pub use shrink_to_fit;
pub use tracing;

#[cfg(debug_assertions)]
use crate::debug::ValueDebugFormatString;
use crate::{
    InputResolution, NonLocalValue, RawVc, TaskInput, TaskPersistence, TraitType, ValueType,
    ValueTypeId,
};
pub use crate::{
    dyn_task_inputs::DynTaskInputs,
    global_name_for_method, global_name_for_scope, global_name_for_trait_method,
    global_name_for_trait_method_impl, global_name_for_type,
    manager::{find_cell_by_id, find_cell_by_type, spawn_detached_for_testing},
    native_function::{
        ArgMeta, NativeFunction, VTABLE_DEFAULT, downcast_args_owned, downcast_args_ref,
        downcast_stack_args_owned,
    },
    register_function, register_trait, register_value,
    registry::RegistryDef,
    task::function::{into_task_fn, into_task_fn_with_this},
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

/// Computes `TaskInput::is_resolved` for the call's inputs at the macro-generated callsite, on
/// the fully concrete tuple type, returning it as an [`InputResolution`].  Computing it here keeps
/// `is_resolved()` inlinable/const-foldable and avoids the macro gencode needing to import the
/// type.
#[inline(always)]
pub fn input_resolution(inputs: &impl TaskInput) -> InputResolution {
    InputResolution::from_is_resolved(inputs.is_resolved())
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
pub struct VTableRegistry<T>
where
    T: Pointee<Metadata = DynMetadata<T>> + ?Sized,
{
    /// Built once during `register_all_trait_methods`, read-only thereafter. `None` until that
    /// runs.
    inner: SyncUnsafeCell<Option<FxHashMap<ValueTypeId, DynMetadata<T>>>>,
}

// SAFETY: writes to `inner` happen only from `insert`, which is called only from
// `register_all_trait_methods` (inside the `VALUES` `LazyLock` initializer, single-threaded and
// synchronized by the `LazyLock`). Reads of `inner` from `cast` are published by that same
// `LazyLock` — see the `cast` safety comment.
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

    /// Insert one `impl Trait for Concrete`'s vtable metadata, keyed by `ValueTypeId`. Called from
    /// a [`TraitImplRecord::install_vtable`] thunk during `register_all_trait_methods`, after
    /// `init_registry` has assigned ids.
    ///
    /// The `DynMetadata` is produced by the caller via [`metadata`] (the null-fat-ptr trick) so
    /// downstream crates that invoke `value_impl` don't need `#![feature(ptr_metadata)]` — they
    /// pass the value through without ever naming the `DynMetadata` type.
    pub fn insert(&'static self, id: ValueTypeId, metadata: DynMetadata<T>) {
        // SAFETY: called only from `register_all_trait_methods` inside the `VALUES` `LazyLock`
        // initializer — single-threaded, no concurrent readers or writers.
        let inner = unsafe { &mut *self.inner.get() };
        let map = inner.get_or_insert_with(FxHashMap::default);
        let prev = map.insert(id, metadata);
        debug_assert!(
            prev.is_none(),
            "multiple trait impls registered for value type id {id}"
        );
    }

    pub(crate) fn cast(&self, id: ValueTypeId, raw: *const ()) -> *const T {
        // SAFETY: any caller in possession of a `ValueTypeId` must have already forced the
        // `VALUES` `LazyLock` (that's the only way to obtain one). `register_all_trait_methods`
        // ran inside that initializer, so its writes to `inner` happen-before this read via the
        // `LazyLock`'s acquire fence.
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

/// One `impl Trait for ConcreteType` registration, gathered at link time into
/// [`TRAIT_IMPLS_SLICE`].
pub struct TraitImplRecord {
    pub value_type: &'static ValueType,
    pub trait_type: &'static TraitType,
    pub methods: &'static [&'static NativeFunction],
    /// Installs this impl's Rust vtable `DynMetadata` into its trait's [`VTableRegistry`] (via
    /// [`VTableRegistry::insert`]).
    pub install_vtable: fn(ValueTypeId),
}

// Link-time collection of every `impl Trait for Concrete`. Like the definition slices in
// `registry`, this is populated by the linker — complete at process start, no constructors, no
// ordering. It is iterated exactly once, in `register_all_trait_methods`.
//
// `pub` so the `value_impl`-emitted scatter (which expands in downstream crates) can name it as
// `$crate::macro_helpers::TRAIT_IMPLS_SLICE`; the data is `#[doc(hidden)]`.
#[doc(hidden)]
#[scattered_collect::gather]
pub static TRAIT_IMPLS_SLICE: ScatteredSlice<TraitImplRecord>;

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
