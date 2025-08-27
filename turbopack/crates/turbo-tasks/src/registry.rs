use std::{fmt::Debug, hash::Hash, num::NonZeroU64, ops::Deref};

use dashmap::mapref::entry::Entry;
use once_cell::sync::Lazy;
use rustc_hash::FxHashMap;

use crate::{
    FxDashMap, TraitType, ValueType,
    id::{TraitTypeId, ValueTypeId},
    id_factory::IdFactory,
    macro_helpers::CollectableFunction,
    native_function::NativeFunction,
    no_move_vec::NoMoveVec,
    value_type::CollectableTrait,
};

static VALUE_TYPE_ID_FACTORY: IdFactory<ValueTypeId> = IdFactory::new_const(
    ValueTypeId::MIN.to_non_zero_u64(),
    ValueTypeId::MAX.to_non_zero_u64(),
);
static VALUE_TYPES_BY_NAME: Lazy<FxDashMap<&'static str, ValueTypeId>> =
    Lazy::new(FxDashMap::default);
static VALUE_TYPES_BY_VALUE: Lazy<FxDashMap<&'static ValueType, ValueTypeId>> =
    Lazy::new(FxDashMap::default);
static VALUE_TYPES: Lazy<NoMoveVec<(&'static ValueType, &'static str)>> = Lazy::new(NoMoveVec::new);

/// Registers the value and returns its id if this is the initial
fn register_thing<
    K: Copy + Deref<Target = u32> + TryFrom<NonZeroU64>,
    V: Copy + Hash + Eq,
    const INITIAL_CAPACITY_BITS: u32,
>(
    global_name: &'static str,
    value: V,
    id_factory: &IdFactory<K>,
    store: &NoMoveVec<(V, &'static str), INITIAL_CAPACITY_BITS>,
    map_by_name: &FxDashMap<&'static str, K>,
    map_by_value: &FxDashMap<V, K>,
) -> Option<K> {
    if let Entry::Vacant(e) = map_by_value.entry(value) {
        let new_id = id_factory.get();
        // SAFETY: this is a fresh id
        unsafe {
            store.insert(*new_id as usize, (value, global_name));
        }
        map_by_name.insert(global_name, new_id);
        e.insert(new_id);
        Some(new_id)
    } else {
        None
    }
}

fn get_thing_id<K, V>(value: V, map_by_value: &FxDashMap<V, K>) -> K
where
    V: Hash + Eq + Debug,
    K: Clone,
{
    if let Some(id) = map_by_value.get(&value) {
        id.clone()
    } else {
        panic!("Use of unregistered {value:?}");
    }
}

pub fn get_function_by_global_name(global_name: &str) -> &'static NativeFunction {
    static NAME_TO_FUNCTION: Lazy<FxHashMap<&'static str, &'static NativeFunction>> =
        Lazy::new(|| {
            let mut map = FxHashMap::default();
            for collected in inventory::iter::<CollectableFunction> {
                let native_function = &**collected.0;
                let global_name = native_function.global_name;
                let prev = map.insert(global_name, native_function);
                debug_assert!(
                    prev.is_none(),
                    "registration mappings for {global_name} are inconsistent!"
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

pub fn register_value_type(
    global_name: &'static str,
    ty: &'static ValueType,
) -> Option<ValueTypeId> {
    register_thing(
        global_name,
        ty,
        &VALUE_TYPE_ID_FACTORY,
        &VALUE_TYPES,
        &VALUE_TYPES_BY_NAME,
        &VALUE_TYPES_BY_VALUE,
    )
}

pub fn get_value_type_id(func: &'static ValueType) -> ValueTypeId {
    get_thing_id(func, &VALUE_TYPES_BY_VALUE)
}

pub fn get_value_type_id_by_global_name(global_name: &str) -> Option<ValueTypeId> {
    VALUE_TYPES_BY_NAME.get(global_name).map(|x| *x)
}

pub fn get_value_type(id: ValueTypeId) -> &'static ValueType {
    VALUE_TYPES.get(*id as usize).unwrap().0
}

pub fn get_value_type_global_name(id: ValueTypeId) -> &'static str {
    VALUE_TYPES.get(*id as usize).unwrap().1
}

struct Traits {
    id_to_trait: FxHashMap<TraitTypeId, &'static TraitType>,
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
    all_traits.sort_by_key(|t| t.global_name);

    let mut id_to_trait = FxHashMap::default();
    id_to_trait.reserve(all_traits.len());

    let mut trait_to_id = FxHashMap::default();
    trait_to_id.reserve(all_traits.len());
    let mut global_name_to_trait = FxHashMap::default();
    global_name_to_trait.reserve(all_traits.len());

    let trait_id_factory: IdFactory<TraitTypeId> = IdFactory::new_const(
        TraitTypeId::MIN.to_non_zero_u64(),
        TraitTypeId::MAX.to_non_zero_u64(),
    );
    for trait_type in all_traits {
        let id = trait_id_factory.get();
        trait_to_id.insert(trait_type, id);
        let prev = id_to_trait.insert(id, trait_type);
        debug_assert!(
            prev.is_none(),
            "two traits registered with the same id {}",
            id
        );
        let prev = global_name_to_trait.insert(trait_type.global_name, (id, trait_type));
        debug_assert!(
            prev.is_none(),
            "two traits registered with the same name: {}",
            trait_type.global_name
        );
    }
    id_to_trait.shrink_to_fit();
    trait_to_id.shrink_to_fit();
    global_name_to_trait.shrink_to_fit();
    Traits {
        trait_to_id,
        id_to_trait,
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
    TRAITS.id_to_trait.get(&id).unwrap()
}

pub fn get_trait_type_global_name(id: TraitTypeId) -> &'static str {
    get_trait(id).global_name
}
