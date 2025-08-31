use std::num::NonZeroU32;

use once_cell::sync::Lazy;
use rustc_hash::{FxHashMap, FxHashSet};

use crate::{
    TraitType, ValueType,
    id::{FunctionId, TraitTypeId, ValueTypeId},
    macro_helpers::CollectableFunction,
    native_function::NativeFunction,
    value_type::{CollectableTrait, CollectableValueType},
};

struct Functions {
    id_to_value: Box<[&'static NativeFunction]>,
    value_to_id: FxHashMap<&'static NativeFunction, FunctionId>,
}
static FUNCTIONS: Lazy<Functions> = Lazy::new(|| {
    let mut functions = inventory::iter::<CollectableFunction>
        .into_iter()
        .map(|c| &**c.0)
        .collect::<Vec<_>>();
    functions.sort_unstable_by_key(|f| f.global_name);
    let mut value_to_id = FxHashMap::with_capacity_and_hasher(functions.len(), Default::default());
    let mut names = FxHashSet::with_capacity_and_hasher(functions.len(), Default::default());

    let mut id = NonZeroU32::MIN;
    for &native_function in functions.iter() {
        value_to_id.insert(native_function, id.into());
        let global_name = native_function.global_name;
        assert!(
            names.insert(global_name),
            "multiple functions registered with name: {global_name}!"
        );
        id = id.checked_add(1).expect("overflowing function ids");
    }

    Functions {
        id_to_value: functions.into_boxed_slice(),
        value_to_id,
    }
});

pub fn get_native_function(id: FunctionId) -> &'static NativeFunction {
    FUNCTIONS.id_to_value[*id as usize - 1]
}

pub fn get_function_id(func: &'static NativeFunction) -> FunctionId {
    *FUNCTIONS
        .value_to_id
        .get(&func)
        .expect("function isn't registered")
}

struct Values {
    id_to_value: Box<[&'static ValueType]>,
    value_to_id: FxHashMap<&'static ValueType, ValueTypeId>,
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
    // Our sort above is non-sensical if names are not unique
    let mut names = FxHashSet::with_capacity_and_hasher(all_values.len(), Default::default());

    let mut id = NonZeroU32::MIN;
    for &value_type in all_values.iter() {
        value_to_id.insert(value_type, id.into());
        let global_name = value_type.global_name;
        assert!(
            names.insert(global_name),
            "two values registered with the same name: {global_name}"
        );
        id = id.checked_add(1).expect("overflowing value type ids");
    }

    Values {
        value_to_id,
        id_to_value: all_values.into_boxed_slice(),
    }
});

pub fn get_value_type_id(value: &'static ValueType) -> ValueTypeId {
    match VALUES.value_to_id.get(value) {
        Some(id) => *id,
        None => panic!("Use of unregistered trait {value:?}"),
    }
}

pub fn get_value_type(id: ValueTypeId) -> &'static ValueType {
    VALUES.id_to_value[*id as usize - 1]
}

struct Traits {
    id_to_trait: Box<[&'static TraitType]>,
    trait_to_id: FxHashMap<&'static TraitType, TraitTypeId>,
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
    // Our sort above is non-sensical if names are not unique
    let mut names = FxHashSet::with_capacity_and_hasher(all_traits.len(), Default::default());
    let mut id = NonZeroU32::MIN;
    for &trait_type in all_traits.iter() {
        trait_to_id.insert(trait_type, id.into());

        let global_name = trait_type.global_name;
        assert!(
            names.insert(global_name),
            "two traits registered with the same name: {global_name}"
        );
        id = id.checked_add(1).expect("overflowing trait type ids");
    }
    Traits {
        trait_to_id,
        id_to_trait: all_traits.into_boxed_slice(),
    }
});

pub fn get_trait_type_id(trait_type: &'static TraitType) -> TraitTypeId {
    match TRAITS.trait_to_id.get(trait_type) {
        Some(id) => *id,
        None => panic!("Use of unregistered trait {trait_type:?}"),
    }
}

pub fn get_trait(id: TraitTypeId) -> &'static TraitType {
    TRAITS.id_to_trait[*id as usize - 1]
}
