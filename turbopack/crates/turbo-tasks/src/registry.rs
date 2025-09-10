use std::num::NonZeroU16;

use anyhow::Error;
use once_cell::sync::Lazy;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::{
    TraitType, ValueType,
    id::{FunctionId, TraitTypeId, ValueTypeId},
    macro_helpers::CollectableFunction,
    native_function::NativeFunction,
    value_type::{CollectableTrait, CollectableValueType},
};

/// A trait for types that can be registered in a registry.
///
/// This allows the generic registry to work with different types
/// while maintaining their specific requirements.
trait RegistryItem: 'static + Eq + std::hash::Hash {
    /// The ID type used for this registry item
    type Id: Copy + From<NonZeroU16> + std::ops::Deref<Target = u16> + std::fmt::Display;
    const TYPE_NAME: &'static str;

    /// Get the global name used for sorting and uniqueness validation
    fn global_name(&self) -> &'static str;
}

impl RegistryItem for NativeFunction {
    type Id = FunctionId;
    const TYPE_NAME: &'static str = "Function";

    fn global_name(&self) -> &'static str {
        self.global_name
    }
}

impl RegistryItem for ValueType {
    type Id = ValueTypeId;
    const TYPE_NAME: &'static str = "Value";

    fn global_name(&self) -> &'static str {
        self.global_name
    }
}

impl RegistryItem for TraitType {
    type Id = TraitTypeId;
    const TYPE_NAME: &'static str = "Trait";
    fn global_name(&self) -> &'static str {
        self.global_name
    }
}

/// A generic registry that maps between IDs and static references to items.
///
/// This eliminates the code duplication between Functions, Values, and Traits registries.
struct Registry<T: RegistryItem> {
    id_to_item: Box<[&'static T]>,
    item_to_id: FxHashMap<&'static T, T::Id>,
}

impl<T: RegistryItem> Registry<T> {
    /// Create a new registry from a collection of items.
    ///
    /// Items are sorted by global_name to ensure stable ID assignment.
    fn new_from_items(mut items: Vec<&'static T>) -> Self {
        // Sort by global name to get stable order
        items.sort_unstable_by_key(|item| item.global_name());

        let mut item_to_id = FxHashMap::with_capacity_and_hasher(items.len(), Default::default());
        let mut names = FxHashSet::with_capacity_and_hasher(items.len(), Default::default());

        let mut id = NonZeroU16::MIN;
        for &item in items.iter() {
            item_to_id.insert(item, id.into());
            let global_name = item.global_name();
            assert!(
                names.insert(global_name),
                "multiple {ty} items registered with name: {global_name}!",
                ty = T::TYPE_NAME
            );
            id = id.checked_add(1).expect("overflowing item ids");
        }

        Self {
            id_to_item: items.into_boxed_slice(),
            item_to_id,
        }
    }

    /// Get an item by its ID
    fn get_item(&self, id: T::Id) -> &'static T {
        self.id_to_item[*id as usize - 1]
    }

    /// Get the ID for an item
    fn get_id(&self, item: &'static T) -> T::Id {
        match self.item_to_id.get(&item) {
            Some(id) => *id,
            None => panic!(
                "{ty} isn't registered: {item}",
                ty = T::TYPE_NAME,
                item = item.global_name()
            ),
        }
    }

    /// Validate that an ID is within the valid range
    fn validate_id(&self, id: T::Id) -> Option<Error> {
        let len = self.id_to_item.len();
        if *id as usize <= len {
            None
        } else {
            Some(anyhow::anyhow!(
                "Invalid {ty} id, {id} expected a value <= {len}",
                ty = T::TYPE_NAME
            ))
        }
    }
}

static FUNCTIONS: Lazy<Registry<NativeFunction>> = Lazy::new(|| {
    let functions = inventory::iter::<CollectableFunction>
        .into_iter()
        .map(|c| &**c.0)
        .collect::<Vec<_>>();
    Registry::new_from_items(functions)
});

pub fn get_native_function(id: FunctionId) -> &'static NativeFunction {
    FUNCTIONS.get_item(id)
}

pub fn get_function_id(func: &'static NativeFunction) -> FunctionId {
    FUNCTIONS.get_id(func)
}

pub fn validate_function_id(id: FunctionId) -> Option<Error> {
    FUNCTIONS.validate_id(id)
}

static VALUES: Lazy<Registry<ValueType>> = Lazy::new(|| {
    // Inventory does not guarantee an order. So we sort by the global name to get a stable order
    // This ensures that assigned ids are also stable which is important since they are serialized.
    let all_values = inventory::iter::<CollectableValueType>
        .into_iter()
        .map(|t| &**t.0)
        .collect::<Vec<_>>();
    Registry::new_from_items(all_values)
});

pub fn get_value_type_id(value: &'static ValueType) -> ValueTypeId {
    VALUES.get_id(value)
}

pub fn get_value_type(id: ValueTypeId) -> &'static ValueType {
    VALUES.get_item(id)
}

pub fn validate_value_type_id(id: ValueTypeId) -> Option<Error> {
    VALUES.validate_id(id)
}

static TRAITS: Lazy<Registry<TraitType>> = Lazy::new(|| {
    // Inventory does not guarantee an order. So we sort by the global name to get a stable order
    // This ensures that assigned ids are also stable.
    let all_traits = inventory::iter::<CollectableTrait>
        .into_iter()
        .map(|t| &**t.0)
        .collect::<Vec<_>>();
    Registry::new_from_items(all_traits)
});

pub fn get_trait_type_id(trait_type: &'static TraitType) -> TraitTypeId {
    TRAITS.get_id(trait_type)
}

pub fn get_trait(id: TraitTypeId) -> &'static TraitType {
    TRAITS.get_item(id)
}

pub fn validate_trait_type_id(id: TraitTypeId) -> Option<Error> {
    TRAITS.validate_id(id)
}
