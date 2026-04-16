//! Runtime helpers for [turbo-tasks-macro].

pub use async_trait::async_trait;
pub use bincode;
pub use inventory;
pub use once_cell::sync::{Lazy, OnceCell};
pub use phf;
use rustc_hash::FxHashMap;
pub use shrink_to_fit;
pub use tracing;

#[cfg(debug_assertions)]
use crate::debug::ValueDebugFormatString;
use crate::{
    FxDashMap, NonLocalValue, RawVc, TaskInput, TaskPersistence, TraitType, TraitTypeId, ValueType,
    ValueTypeId,
};
pub use crate::{
    global_name_for_method, global_name_for_scope, global_name_for_trait_method,
    global_name_for_trait_method_impl, global_name_for_type, inventory_submit,
    magic_any::MagicAny,
    manager::{find_cell_by_id, find_cell_by_type, spawn_detached_for_testing},
    native_function::{
        ArgMeta, NativeFunction, VTABLE_DEFAULT, downcast_args_owned, downcast_args_ref,
    },
    registry::RegistryDef,
    task::function::{into_task_fn, into_task_fn_with_this},
    turbo_register,
    value_type::{TraitVtablePrototype, build_trait_vtable},
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
pub const fn metadata<T: ?Sized>(ptr: *const T) -> <T as std::ptr::Pointee>::Metadata {
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

/// A registry of all the impl vtables for a given VcValue trait
/// This is constructed in the macro gencode and populated by the registry.
#[derive(Default)]
pub struct VTableRegistry<T: ?Sized> {
    map: FxHashMap<ValueTypeId, <T as std::ptr::Pointee>::Metadata>,
}

impl<T: ?Sized> VTableRegistry<T> {
    pub fn new(id: TraitTypeId) -> Self {
        let mut map = FxHashMap::default();
        match TRAIT_CAST_FNS.remove(&id) {
            Some((_, impls)) => {
                for (value_type_id, RawPtr(raw_fn)) in impls {
                    // SAFETY: These are generated by the macro gencode in value_impl with this
                    // signature.
                    let cast_fn: fn(*const ()) -> *const T = unsafe { std::mem::transmute(raw_fn) };
                    // Cast a null pointer to a fat pointer using the cast_fn, this allows us to
                    // capture a vtable Alternatively we could just store the
                    // cast functions but it will be faster to call 'from_raw_parts' instead of an
                    // indirect function call.
                    let ptr = cast_fn(std::ptr::null::<()>());
                    let metadata = std::ptr::metadata(ptr);
                    let prev = map.insert(value_type_id, metadata);
                    debug_assert!(
                        prev.is_none(),
                        "multiple cast functions registered for {value_type_id}"
                    )
                }
            }
            None => {
                // A trait doesn't have to have any implementations.
            }
        }

        Self { map }
    }

    pub(crate) fn cast(&self, id: ValueTypeId, raw: *const ()) -> *const T {
        let metadata = self.map.get(&id).unwrap();
        std::ptr::from_raw_parts(raw, *metadata)
    }
}

struct RawPtr(*const ());
// SAFETY: We only store function pointers in here which are safe to send/sync
unsafe impl Sync for RawPtr {}
unsafe impl Send for RawPtr {}

// Accumulate all trait impls by trait id
static TRAIT_CAST_FNS: Lazy<FxDashMap<TraitTypeId, Vec<(ValueTypeId, RawPtr)>>> = Lazy::new(|| {
    let map: FxDashMap<TraitTypeId, Vec<(ValueTypeId, RawPtr)>> = FxDashMap::default();
    for CollectableTraitCastFunctions(trait_id_fn, value_id_fn, cast_fn) in
        inventory::iter::<CollectableTraitCastFunctions>
    {
        map.entry(trait_id_fn())
            .or_default()
            .value_mut()
            .push((value_id_fn(), RawPtr(*cast_fn)));
    }
    map
});

// Holds a raw pointer to a function that can perform a fat pointer cast
pub struct CollectableTraitCastFunctions(
    pub fn() -> TraitTypeId,
    pub fn() -> ValueTypeId,
    pub *const (),
);
// SAFETY: We only store function pointers in here.
unsafe impl Sync for CollectableTraitCastFunctions {}
inventory::collect! {CollectableTraitCastFunctions}

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
