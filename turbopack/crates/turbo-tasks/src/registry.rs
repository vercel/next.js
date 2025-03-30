use std::{fmt::Debug, hash::Hash, num::NonZeroU64, ops::Deref};

use dashmap::mapref::entry::Entry;
use once_cell::sync::Lazy;

use crate::{
    id::{FunctionId, TraitTypeId, ValueTypeId},
    id_factory::IdFactory,
    native_function::NativeFunction,
    no_move_vec::NoMoveVec,
    FxDashMap, TraitType, ValueType,
};

static FUNCTION_ID_FACTORY: IdFactory<FunctionId> = IdFactory::new(1, u32::MAX as u64);
static FUNCTIONS_BY_NAME: Lazy<FxDashMap<&'static str, FunctionId>> = Lazy::new(FxDashMap::default);
static FUNCTIONS_BY_VALUE: Lazy<FxDashMap<&'static NativeFunction, FunctionId>> =
    Lazy::new(FxDashMap::default);
static FUNCTIONS: Lazy<NoMoveVec<(&'static NativeFunction, &'static str)>> =
    Lazy::new(NoMoveVec::new);

static VALUE_TYPE_ID_FACTORY: IdFactory<ValueTypeId> = IdFactory::new(1, u32::MAX as u64);
static VALUE_TYPES_BY_NAME: Lazy<FxDashMap<&'static str, ValueTypeId>> =
    Lazy::new(FxDashMap::default);
static VALUE_TYPES_BY_VALUE: Lazy<FxDashMap<&'static ValueType, ValueTypeId>> =
    Lazy::new(FxDashMap::default);
static VALUE_TYPES: Lazy<NoMoveVec<(&'static ValueType, &'static str)>> = Lazy::new(NoMoveVec::new);

static TRAIT_TYPE_ID_FACTORY: IdFactory<TraitTypeId> = IdFactory::new(1, u32::MAX as u64);
static TRAIT_TYPES_BY_NAME: Lazy<FxDashMap<&'static str, TraitTypeId>> =
    Lazy::new(FxDashMap::default);
static TRAIT_TYPES_BY_VALUE: Lazy<FxDashMap<&'static TraitType, TraitTypeId>> =
    Lazy::new(FxDashMap::default);
static TRAIT_TYPES: Lazy<NoMoveVec<(&'static TraitType, &'static str)>> = Lazy::new(NoMoveVec::new);

fn register_thing<
    K: TryFrom<NonZeroU64> + Deref<Target = u32> + Sync + Send + Copy,
    V: Clone + Hash + Eq + Sync + Send + Copy,
    const INITIAL_CAPACITY_BITS: u32,
>(
    global_name: &'static str,
    value: V,
    id_factory: &IdFactory<K>,
    store: &NoMoveVec<(V, &'static str), INITIAL_CAPACITY_BITS>,
    map_by_name: &FxDashMap<&'static str, K>,
    map_by_value: &FxDashMap<V, K>,
) {
    if let Entry::Vacant(e) = map_by_value.entry(value) {
        let new_id = id_factory.get();
        // SAFETY: this is a fresh id
        unsafe {
            store.insert(*new_id as usize, (value, global_name));
        }
        map_by_name.insert(global_name, new_id);
        e.insert(new_id);
    }
}

fn get_thing_id<
    K: From<u32> + Deref<Target = u32> + Sync + Send + Copy + Debug,
    V: Clone + Hash + Eq + Debug + Sync + Send + Debug,
>(
    value: V,
    map_by_value: &FxDashMap<V, K>,
) -> K {
    if let Some(id) = map_by_value.get(&value) {
        *id
    } else {
        panic!("Use of unregistered {:?}", value);
    }
}

pub fn register_function(global_name: &'static str, func: &'static NativeFunction) {
    register_thing(
        global_name,
        func,
        &FUNCTION_ID_FACTORY,
        &FUNCTIONS,
        &FUNCTIONS_BY_NAME,
        &FUNCTIONS_BY_VALUE,
    )
}

pub fn get_function_id(func: &'static NativeFunction) -> FunctionId {
    get_thing_id(func, &FUNCTIONS_BY_VALUE)
}

pub fn get_function_id_by_global_name(global_name: &str) -> Option<FunctionId> {
    FUNCTIONS_BY_NAME.get(global_name).map(|x| *x)
}

pub fn get_function(id: FunctionId) -> &'static NativeFunction {
    FUNCTIONS.get(*id as usize).unwrap().0
}

pub fn get_function_global_name(id: FunctionId) -> &'static str {
    FUNCTIONS.get(*id as usize).unwrap().1
}

pub fn register_value_type(global_name: &'static str, ty: &'static ValueType) {
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

pub fn register_trait_type(global_name: &'static str, ty: &'static TraitType) {
    register_thing(
        global_name,
        ty,
        &TRAIT_TYPE_ID_FACTORY,
        &TRAIT_TYPES,
        &TRAIT_TYPES_BY_NAME,
        &TRAIT_TYPES_BY_VALUE,
    )
}

pub fn get_trait_type_id(func: &'static TraitType) -> TraitTypeId {
    get_thing_id(func, &TRAIT_TYPES_BY_VALUE)
}

pub fn get_trait_type_id_by_global_name(global_name: &str) -> Option<TraitTypeId> {
    TRAIT_TYPES_BY_NAME.get(global_name).map(|x| *x)
}

pub fn get_trait(id: TraitTypeId) -> &'static TraitType {
    TRAIT_TYPES.get(*id as usize).unwrap().0
}

pub fn get_trait_type_global_name(id: TraitTypeId) -> &'static str {
    TRAIT_TYPES.get(*id as usize).unwrap().1
}
