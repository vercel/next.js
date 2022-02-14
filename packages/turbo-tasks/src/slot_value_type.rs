use std::{
    any::{Any, TypeId},
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Formatter},
    hash::Hash,
    sync::atomic::{AtomicU32, Ordering},
};

use crate::NativeFunction;

pub struct SlotValueType {
    pub name: String,
    pub(crate) id: u32,
    traits: HashSet<&'static TraitType>,
    pub(crate) trait_methods: HashMap<(&'static TraitType, String), &'static NativeFunction>,
}

impl Hash for SlotValueType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Eq for SlotValueType {}

impl PartialEq for SlotValueType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Debug for SlotValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("SlotValueType");
        d.field("name", &self.name);
        d.field("id", &self.id);
        for ((trait_type, name), _value) in self.trait_methods.iter() {
            d.field(name, &"(trait fn)");
        }
        d.finish()
    }
}

static NEXT_SLOT_VALUE_TYPE_ID: AtomicU32 = AtomicU32::new(1);

impl SlotValueType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_SLOT_VALUE_TYPE_ID.fetch_add(1, Ordering::Relaxed),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
        }
    }

    pub fn register_trait_method(
        &mut self,
        trait_type: &'static TraitType,
        name: String,
        native_fn: &'static NativeFunction,
    ) {
        self.trait_methods.insert((trait_type, name), native_fn);
    }

    pub fn register_trait(&mut self, trait_type: &'static TraitType) {
        self.traits.insert(trait_type);
    }
}

static NEXT_TRAIT_TYPE_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Debug)]
pub struct TraitType {
    pub name: String,
    id: u32,
}

impl Hash for TraitType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Eq for TraitType {}

impl PartialEq for TraitType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl TraitType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_TRAIT_TYPE_ID.fetch_add(1, Ordering::Relaxed),
        }
    }
}

pub trait TraitMethod: Any {}
