use std::{cell::SyncUnsafeCell, num::NonZeroU16};

use anyhow::Error;
use once_cell::sync::Lazy;

use crate::{
    TraitType, ValueType,
    id::{FunctionId, TraitTypeId, ValueTypeId},
    native_function::NativeFunction,
};

mod registry_type;

pub use registry_type::RegistryType;

/// Declare a type as a compile-time-collected registry item.
///
/// Generates pointer-based `Eq`, `PartialEq`, `Hash`, `Ord`, `PartialOrd` impls
/// and an `inventory::collect!` call for `&'static $ty`.
macro_rules! turbo_registry {
    ($name:literal, $ty:ty) => {
        inventory::collect!(&'static $ty);

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

pub(crate) use turbo_registry;

#[macro_export]
#[doc(hidden)]
macro_rules! turbo_register {
    ($name:ident : $ty:ty = $value:expr) => {
        static $name: $ty = $value;
        $crate::macro_helpers::inventory_submit! { &$name }
    };
    ($reg:ty => $name:ident : $ty:ty = $value:expr) => {
        static $name: $ty = $value;
        $crate::macro_helpers::inventory_submit! { &$name }

        impl $crate::macro_helpers::RegistryDef<$ty> for $reg {
            const DEF: &'static $ty = &$name;
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
        // SAFETY: Single-threaded during Lazy init; no concurrent readers yet.
        unsafe { std::ptr::write(SyncUnsafeCell::raw_get(&item.ty().id), u16::from(id)) };
        id = id.checked_add(1).expect("overflowing item ids");
    }

    items.into_boxed_slice()
}

/// Get an item by its ID from a registry slice
#[inline]
fn get_item<T: Registerable>(registry: &Lazy<Box<[&'static T]>>, id: T::Id) -> &'static T {
    registry[*id as usize - 1]
}

/// Get the ID for a registered item. Forces registry init if needed, which
/// assigns IDs to all items as a side effect.
#[inline]
fn get_id<T: Registerable>(registry: &Lazy<Box<[&'static T]>>, item: &'static T) -> T::Id {
    Lazy::force(registry);
    // SAFETY: The ID write happens-before this read thanks to the fence inside of Lazy
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

/// Validate that an ID is within the valid range
fn validate_id<T: Registerable>(registry: &Lazy<Box<[&'static T]>>, id: T::Id) -> Option<Error> {
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

static FUNCTIONS: Lazy<Box<[&'static NativeFunction]>> = Lazy::new(|| {
    init_registry(
        inventory::iter::<&'static NativeFunction>
            .into_iter()
            .copied()
            .collect(),
    )
});

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

pub(crate) static VALUES: Lazy<Box<[&'static ValueType]>> = Lazy::new(|| {
    let items = init_registry(
        inventory::iter::<&'static ValueType>
            .into_iter()
            .copied()
            .collect(),
    );
    crate::value_type::register_all_trait_methods(&items);
    items
});

#[inline]
pub fn get_value_type_id(value: &'static ValueType) -> ValueTypeId {
    get_id(&VALUES, value)
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

static TRAITS: Lazy<Box<[&'static TraitType]>> = Lazy::new(|| {
    init_registry(
        inventory::iter::<&'static TraitType>
            .into_iter()
            .copied()
            .collect(),
    )
});

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
