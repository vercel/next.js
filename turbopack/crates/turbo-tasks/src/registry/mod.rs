use std::{cell::SyncUnsafeCell, num::NonZeroU16, sync::LazyLock};

use anyhow::Error;
use scattered_collect::slice::ScatteredSlice;

use crate::{
    TraitType, ValueType,
    id::{FunctionId, TraitTypeId, ValueTypeId},
    native_function::NativeFunction,
};

mod registry_type;

pub use registry_type::RegistryType;

/// Generates pointer-based `Eq`, `PartialEq`, `Hash`, `Ord`, `PartialOrd` impls.
macro_rules! impl_ptr_identity {
    ($ty:ty) => {
        impl ::core::cmp::Eq for $ty {}
        impl ::core::cmp::PartialEq for $ty {
            fn eq(&self, other: &$ty) -> bool {
                ::core::ptr::eq(self, other)
            }
        }
        impl ::core::hash::Hash for $ty {
            fn hash<H: ::core::hash::Hasher>(&self, state: &mut H) {
                ::core::ptr::hash(self, state)
            }
        }
        impl ::core::cmp::Ord for $ty {
            fn cmp(&self, other: &Self) -> ::core::cmp::Ordering {
                (self as *const Self).cmp(&(other as *const Self))
            }
        }
        impl ::core::cmp::PartialOrd for $ty {
            fn partial_cmp(&self, other: &Self) -> Option<::core::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }
    };
}

pub(crate) use impl_ptr_identity;

// Link-time gather slices, one per registry.
#[doc(hidden)]
#[scattered_collect::gather]
pub static FUNCTIONS_SLICE: ScatteredSlice<&'static NativeFunction>;

#[doc(hidden)]
#[scattered_collect::gather]
pub static VALUES_SLICE: ScatteredSlice<&'static ValueType>;

#[doc(hidden)]
#[scattered_collect::gather]
pub static TRAITS_SLICE: ScatteredSlice<&'static TraitType>;

/// Register a [`NativeFunction`] definition into the link-time [`FUNCTIONS_SLICE`].
#[macro_export]
#[doc(hidden)]
macro_rules! register_function {
    ($name:ident = $value:expr) => {
        static $name: $crate::macro_helpers::NativeFunction = $value;
        $crate::macro_helpers::scattered_collect::declarative::scatter! {
            #[scatter($crate::registry::FUNCTIONS_SLICE)]
            const _: &'static $crate::macro_helpers::NativeFunction = &$name;
        }
    };
}

/// Register a [`ValueType`] definition into the link-time [`VALUES_SLICE`], and provide its
/// `RegistryDef` so the impl macros can recover the `&'static ValueType` for a Vc type.
#[macro_export]
#[doc(hidden)]
macro_rules! register_value {
    ($reg:ty => $name:ident = $value:expr) => {
        static $name: $crate::ValueType = $value;
        $crate::macro_helpers::scattered_collect::declarative::scatter! {
            #[scatter($crate::registry::VALUES_SLICE)]
            const _: &'static $crate::ValueType = &$name;
        }

        impl $crate::macro_helpers::RegistryDef<$crate::ValueType> for $reg {
            const DEF: &'static $crate::ValueType = &$name;
        }
    };
}

/// Register a [`TraitType`] definition into the link-time [`TRAITS_SLICE`], and provide its
/// `RegistryDef` so the impl macros can recover the `&'static TraitType` for a `Box<dyn Trait>`.
#[macro_export]
#[doc(hidden)]
macro_rules! register_trait {
    ($reg:ty => $name:ident = $value:expr) => {
        static $name: $crate::TraitType = $value;
        $crate::macro_helpers::scattered_collect::declarative::scatter! {
            #[scatter($crate::registry::TRAITS_SLICE)]
            const _: &'static $crate::TraitType = &$name;
        }

        impl $crate::macro_helpers::RegistryDef<$crate::TraitType> for $reg {
            const DEF: &'static $crate::TraitType = &$name;
        }
    };
}

#[doc(hidden)]
pub trait RegistryDef<T: 'static> {
    const DEF: &'static T;
}

/// A trait for types that can be registered in a registry.
///
/// This allows the generic registry to work with different types
/// while maintaining their specific requirements.
trait Registerable: 'static + Eq + std::hash::Hash {
    /// The ID type used for this registry item
    type Id: Copy + From<NonZeroU16> + std::ops::Deref<Target = u16> + std::fmt::Display;
    const TYPE_NAME: &'static str;

    /// The largest id that may be assigned to this registry item.
    const MAX_ID: u16 = u16::MAX;

    /// Get the global registry type used for sorting and uniqueness validation
    fn ty(&self) -> &RegistryType;
}

impl Registerable for NativeFunction {
    type Id = FunctionId;
    const TYPE_NAME: &'static str = "Function";

    fn ty(&self) -> &RegistryType {
        &self.ty
    }
}

impl Registerable for ValueType {
    type Id = ValueTypeId;
    const TYPE_NAME: &'static str = "Value";
    const MAX_ID: u16 = ValueTypeId::MAX.to_primitive();
    fn ty(&self) -> &RegistryType {
        &self.ty
    }
}

impl Registerable for TraitType {
    type Id = TraitTypeId;
    const TYPE_NAME: &'static str = "Trait";
    fn ty(&self) -> &RegistryType {
        &self.ty
    }
}

/// Assign IDs to items and call post_init. Shared logic for all registry types.
fn init_registry<T: Registerable>(mut items: Vec<&'static T>) -> Box<[&'static T]> {
    // Sort by global name for stable, deterministic ID assignment
    items.sort_unstable_by_key(|item| item.ty().global_name);

    let mut id = NonZeroU16::MIN;
    let mut prev_name: Option<&str> = None;
    for item in items.iter() {
        let global_name = item.ty().global_name;
        if let Some(prev) = prev_name {
            assert!(
                prev != global_name,
                "multiple {ty} items registered with name: {global_name}!",
                ty = T::TYPE_NAME
            );
        }
        prev_name = Some(global_name);
        assert!(
            u16::from(id) <= T::MAX_ID,
            "too many {ty} items registered: id {id} exceeds the cap of {max}",
            ty = T::TYPE_NAME,
            max = T::MAX_ID,
        );
        // SAFETY: Single-threaded during Lazy init; no concurrent readers yet.
        unsafe { std::ptr::write(SyncUnsafeCell::raw_get(&item.ty().id), u16::from(id)) };
        id = id.checked_add(1).expect("overflowing item ids");
    }

    items.into_boxed_slice()
}

/// Get an item by its ID from a registry slice
#[inline]
fn get_item<T: Registerable>(registry: &LazyLock<Box<[&'static T]>>, id: T::Id) -> &'static T {
    registry[*id as usize - 1]
}

/// Read an item's assigned id directly, without touching `LazyLock`.
///
/// # Safety
///
/// Caller must guarantee that `init_registry` has already written the id for this `item`.
#[inline]
unsafe fn get_id_unchecked<T: Registerable>(item: &'static T) -> T::Id {
    // SAFETY: caller guarantees the id has been written. The write and this read are both
    // inside the registry's single-threaded lazy init.
    let n = unsafe { std::ptr::read(item.ty().id.get()) };
    let Some(id) = NonZeroU16::new(n) else {
        panic!(
            "{ty} isn't registered: {item}",
            ty = T::TYPE_NAME,
            item = item.ty().global_name
        );
    };
    T::Id::from(id)
}

/// Get the ID for a registered item. Forces registry init if needed, which
/// assigns IDs to all items as a side effect.
#[inline]
fn get_id<T: Registerable>(registry: &LazyLock<Box<[&'static T]>>, item: &'static T) -> T::Id {
    LazyLock::force(registry);
    // SAFETY: The ID write happens-before this read thanks to the fence inside of LazyLock
    unsafe { get_id_unchecked(item) }
}

/// Validate that an ID is within the valid range
fn validate_id<T: Registerable>(
    registry: &LazyLock<Box<[&'static T]>>,
    id: T::Id,
) -> Option<Error> {
    let len = registry.len();
    if *id as usize <= len {
        None
    } else {
        Some(anyhow::anyhow!(
            "Invalid {ty} id, {id} expected a value <= {len}",
            ty = T::TYPE_NAME
        ))
    }
}

static FUNCTIONS: LazyLock<Box<[&'static NativeFunction]>> =
    LazyLock::new(|| init_registry(FUNCTIONS_SLICE.iter().copied().collect()));

#[inline]
pub fn get_native_function(id: FunctionId) -> &'static NativeFunction {
    get_item(&FUNCTIONS, id)
}

#[inline]
pub fn get_function_id(func: &'static NativeFunction) -> FunctionId {
    get_id(&FUNCTIONS, func)
}

pub fn validate_function_id(id: FunctionId) -> Option<Error> {
    validate_id(&FUNCTIONS, id)
}

static VALUES: LazyLock<Box<[&'static ValueType]>> = LazyLock::new(|| {
    let items = init_registry(VALUES_SLICE.iter().copied().collect());
    crate::value_type::register_all_trait_methods();
    items
});

#[inline]
pub fn get_value_type_id(value: &'static ValueType) -> ValueTypeId {
    get_id(&VALUES, value)
}

/// Read a `ValueType`'s assigned id directly, without touching `LazyLock`. See
/// [`get_id_unchecked`] for the safety contract.
///
/// # Safety
///
/// The only legitimate caller is [`crate::value_type::register_all_trait_methods`],
/// which runs inside the `VALUES` `LazyLock` initializer, after `init_registry` has assigned ids.
/// Calling `get_value_type_id` from there would re-enter `LazyLock::force` and deadlock.
#[inline]
pub(crate) unsafe fn get_value_type_id_unchecked(value: &'static ValueType) -> ValueTypeId {
    unsafe { get_id_unchecked(value) }
}

#[inline]
pub fn get_value_type(id: ValueTypeId) -> &'static ValueType {
    get_item(&VALUES, id)
}

pub fn validate_value_type_id(id: ValueTypeId) -> Option<Error> {
    validate_id(&VALUES, id)
}

/// Number of registered trait types. Forces TRAITS init.
#[inline]
pub(crate) fn trait_type_count() -> usize {
    TRAITS.len()
}

static TRAITS: LazyLock<Box<[&'static TraitType]>> =
    LazyLock::new(|| init_registry(TRAITS_SLICE.iter().copied().collect()));

#[inline]
pub fn get_trait_type_id(trait_type: &'static TraitType) -> TraitTypeId {
    get_id(&TRAITS, trait_type)
}

#[inline]
pub fn get_trait(id: TraitTypeId) -> &'static TraitType {
    get_item(&TRAITS, id)
}

pub fn validate_trait_type_id(id: TraitTypeId) -> Option<Error> {
    validate_id(&TRAITS, id)
}
