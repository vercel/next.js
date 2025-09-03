use std::num::NonZeroU32;

use once_cell::sync::Lazy;
use rustc_hash::FxHashMap;

use crate::{
    TraitType, ValueType,
    id::{TraitTypeId, ValueTypeId},
    macro_helpers::CollectableFunction,
    native_function::NativeFunction,
    value_type::{CollectableTrait, CollectableValueType},
};

pub fn get_function_by_global_name(global_name: &str) -> &'static NativeFunction {
    static NAME_TO_FUNCTION: Lazy<FxHashMap<&'static str, &'static NativeFunction>> =
        Lazy::new(|| {
            let mut map = FxHashMap::default();
            for collected in inventory::iter::<CollectableFunction> {
                let native_function = &**collected.0;
                let global_name = native_function.global_name;
                let prev = map.insert(global_name, native_function);
                assert!(
                    prev.is_none(),
                    "multiple functions registered with the name {global_name}!"
                );
            }
            map.shrink_to_fit();
            map
        });

    match NAME_TO_FUNCTION.get(global_name) {
        Some(f) => f,
        None => panic!("unable to find function: {global_name}"),
    }
}

struct Values {
    id_to_value: Box<[&'static ValueType]>,
    value_to_id: FxHashMap<&'static ValueType, ValueTypeId>,
    global_name_to_value: FxHashMap<&'static str, (ValueTypeId, &'static ValueType)>,
}

static VALUES: Lazy<Values> = Lazy::new(|| {
    // Inventory does not guarantee an order. So we sort by the global name to get a stable order
    // This ensures that assigned ids are also stable.
    // We don't currently take advantage of this but we could in the future.  The remaining issue is
    // ensuring the set of values is the same across runs.
    let mut all_values = inventory::iter::<CollectableValueType>
        .into_iter()
        .map(|t| &**t.0)
        .collect::<Vec<_>>();
    all_values.sort_unstable_by_key(|t| t.global_name);

    let mut value_to_id = FxHashMap::with_capacity_and_hasher(all_values.len(), Default::default());
    let mut global_name_to_value =
        FxHashMap::with_capacity_and_hasher(all_values.len(), Default::default());

    let mut id = NonZeroU32::MIN;
    for &value_type in all_values.iter() {
        value_to_id.insert(value_type, id.into());
        let prev = global_name_to_value.insert(value_type.global_name, (id.into(), value_type));
        assert!(
            prev.is_none(),
            "two value types registered with the same name: {}",
            value_type.global_name
        );
        id = id.checked_add(1).expect("overflowing value type ids");
    }

    value_to_id.shrink_to_fit();
    global_name_to_value.shrink_to_fit();
    Values {
        value_to_id,
        id_to_value: all_values.into_boxed_slice(),
        global_name_to_value,
    }
});

pub fn get_value_type_id(value: &'static ValueType) -> ValueTypeId {
    match VALUES.value_to_id.get(value) {
        Some(id) => *id,
        None => panic!("Use of unregistered trait {value:?}"),
    }
}

pub fn get_value_type_id_by_global_name(global_name: &str) -> Option<ValueTypeId> {
    VALUES
        .global_name_to_value
        .get(global_name)
        .map(|(id, _)| *id)
}

pub fn get_value_type(id: ValueTypeId) -> &'static ValueType {
    VALUES.id_to_value[*id as usize - 1]
}

pub fn get_value_type_global_name(id: ValueTypeId) -> &'static str {
    get_value_type(id).global_name
}

struct Traits {
    id_to_trait: Box<[&'static TraitType]>,
    trait_to_id: FxHashMap<&'static TraitType, TraitTypeId>,
    global_name_to_trait: FxHashMap<&'static str, (TraitTypeId, &'static TraitType)>,
}

static TRAITS: Lazy<Traits> = Lazy::new(|| {
    // Inventory does not guarantee an order. So we sort by the global name to get a stable order
    // This ensures that assigned ids are also stable.
    let mut all_traits = inventory::iter::<CollectableTrait>
        .into_iter()
        .map(|t| &**t.0)
        .collect::<Vec<_>>();
    all_traits.sort_unstable_by_key(|t| t.global_name);

    let mut trait_to_id = FxHashMap::with_capacity_and_hasher(all_traits.len(), Default::default());
    let mut global_name_to_trait =
        FxHashMap::with_capacity_and_hasher(all_traits.len(), Default::default());

    let mut id = NonZeroU32::MIN;
    for &trait_type in all_traits.iter() {
        trait_to_id.insert(trait_type, id.into());

        let prev = global_name_to_trait.insert(trait_type.global_name, (id.into(), trait_type));
        assert!(
            prev.is_none(),
            "two traits registered with the same name: {}",
            trait_type.global_name
        );
        id = id.checked_add(1).expect("overflowing trait type ids");
    }
    trait_to_id.shrink_to_fit();
    global_name_to_trait.shrink_to_fit();
    Traits {
        trait_to_id,
        id_to_trait: all_traits.into_boxed_slice(),
        global_name_to_trait,
    }
});

pub fn get_trait_type_id(trait_type: &'static TraitType) -> TraitTypeId {
    match TRAITS.trait_to_id.get(trait_type) {
        Some(id) => *id,
        None => panic!("Use of unregistered trait {trait_type:?}"),
    }
}

pub fn get_trait_type_id_by_global_name(global_name: &str) -> Option<TraitTypeId> {
    TRAITS
        .global_name_to_trait
        .get(global_name)
        .map(|(id, _)| *id)
}

pub fn get_trait(id: TraitTypeId) -> &'static TraitType {
    TRAITS.id_to_trait[*id as usize - 1]
}

pub fn get_trait_type_global_name(id: TraitTypeId) -> &'static str {
    get_trait(id).global_name
}
