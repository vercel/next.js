use std::{
    any::Any,
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
    sync::atomic::{AtomicU32, Ordering},
};

use crate::{
    id::{FunctionId, TraitTypeId},
    registry::{register_trait_type, register_value_type},
};

// TODO this type need some refactoring when multiple languages are added to
// turbo-task In this case a trait_method might be of a different function type.
// It probably need to be a FunctionVc.
// That's also needed in a distributed world, where the function might be only
// available on a remote instance.

/// A definition of a type of data.
///
/// Contains a list of traits and trait methods that are available on that type.
pub struct ValueType {
    /// A readable name of the type
    pub name: String,
    /// A locally unique id of the type for comparing
    pub(crate) id: u32,
    /// List of traits available
    pub(crate) traits: HashSet<TraitTypeId>,
    /// List of trait methods available
    pub(crate) trait_methods: HashMap<(TraitTypeId, String), FunctionId>,
}

impl Hash for ValueType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Eq for ValueType {}

impl PartialEq for ValueType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl PartialOrd for ValueType {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.id.partial_cmp(&other.id)
    }
}

impl Ord for ValueType {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.id.cmp(&other.id)
    }
}

impl Debug for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("ValueType");
        d.field("name", &self.name);
        d.field("id", &self.id);
        for ((_trait_type, name), _value) in self.trait_methods.iter() {
            d.field(name, &"(trait fn)");
        }
        d.finish()
    }
}

static NEXT_SLOT_VALUE_TYPE_ID: AtomicU32 = AtomicU32::new(1);

impl ValueType {
    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_SLOT_VALUE_TYPE_ID.fetch_add(1, Ordering::Relaxed),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
        }
    }

    /// This is internally used by `#[turbo_tasks::value(Trait)]`
    pub fn register_trait_method(
        &mut self,
        trait_type: TraitTypeId,
        name: String,
        native_fn: FunctionId,
    ) {
        self.trait_methods.insert((trait_type, name), native_fn);
    }

    /// This is internally used by `#[turbo_tasks::value(Trait)]`
    pub fn register_trait(&mut self, trait_type: TraitTypeId) {
        self.traits.insert(trait_type);
    }

    pub fn register(&'static self, global_name: &str) {
        register_value_type(global_name, self)
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

impl Display for TraitType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "trait {}", self.name)
    }
}

impl Eq for TraitType {}

impl PartialEq for TraitType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl PartialOrd for TraitType {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.id.partial_cmp(&other.id)
    }
}

impl Ord for TraitType {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.id.cmp(&other.id)
    }
}

impl TraitType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_TRAIT_TYPE_ID.fetch_add(1, Ordering::Relaxed),
        }
    }

    pub fn register(&'static self, global_name: &str) {
        register_trait_type(global_name, self);
    }
}

pub trait TraitMethod: Any {}
