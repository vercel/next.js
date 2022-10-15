use std::{
    any::{type_name, Any},
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
    sync::Arc,
};

use serde::{Deserialize, Serialize};

use crate::{
    id::{FunctionId, TraitTypeId},
    magic_any::{AnyDeserializeSeed, MagicAny, MagicAnyDeserializeSeed},
    registry::{register_trait_type, register_value_type},
    CollectiblesSource, RawVc, ValueTypeId,
};

pub trait Typed {
    fn get_value_type_id() -> ValueTypeId;
}

pub trait ValueVc:
    From<RawVc>
    + Into<RawVc>
    + CollectiblesSource
    + Hash
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Copy
    + Clone
{
    fn get_value_type_id() -> ValueTypeId;
    fn get_trait_type_ids() -> Box<dyn Iterator<Item = TraitTypeId>>;
}

pub trait ValueTraitVc:
    From<RawVc>
    + Into<RawVc>
    + CollectiblesSource
    + Hash
    + PartialEq
    + Eq
    + PartialOrd
    + Ord
    + Copy
    + Clone
{
    fn get_trait_type_id() -> TraitTypeId;
}

/// Marker trait that a turbo_tasks::value is prepared for
/// serialization as Value<...> input.
/// Either use `#[turbo_tasks::value(serialization: auto_for_input)]`
/// or avoid Value<...> in favor of a real Vc
pub trait TypedForInput: Typed {}

type MagicSerializationFn = fn(&dyn MagicAny) -> &dyn erased_serde::Serialize;
type AnySerializationFn = fn(&(dyn Any + Sync + Send)) -> &dyn erased_serde::Serialize;

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
    /// List of traits available
    pub traits: HashSet<TraitTypeId>,
    /// List of trait methods available
    pub trait_methods: HashMap<(TraitTypeId, String), FunctionId>,

    /// Functors for serialization
    magic_serialization: Option<(MagicSerializationFn, MagicAnyDeserializeSeed)>,
    any_serialization: Option<(AnySerializationFn, AnyDeserializeSeed)>,
}

impl Hash for ValueType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (self as *const ValueType).hash(state);
    }
}

impl Eq for ValueType {}

impl PartialEq for ValueType {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}

impl PartialOrd for ValueType {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        (self as *const ValueType).partial_cmp(&(other as *const ValueType))
    }
}
impl Ord for ValueType {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (self as *const ValueType).cmp(&(other as *const ValueType))
    }
}

impl Debug for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("ValueType");
        d.field("name", &self.name);
        for ((_trait_type, name), _value) in self.trait_methods.iter() {
            d.field(name, &"(trait fn)");
        }
        d.finish()
    }
}

pub fn any_as_serialize<T: Any + Serialize + Send + Sync + 'static>(
    this: &(dyn Any + Send + Sync),
) -> &dyn erased_serde::Serialize {
    if let Some(r) = this.downcast_ref::<T>() {
        return r;
    }
    panic!(
        "any_as_serialize::<{}> called with invalid type",
        type_name::<T>()
    );
}

impl ValueType {
    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new<T>() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
            magic_serialization: None,
            any_serialization: None,
        }
    }

    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new_with_magic_serialization<
        T: Debug + Eq + Ord + Hash + Serialize + for<'de> Deserialize<'de> + Send + Sync + 'static,
    >() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
            magic_serialization: Some((
                <dyn MagicAny>::as_serialize::<T>,
                MagicAnyDeserializeSeed::new::<T>(),
            )),
            any_serialization: Some((any_as_serialize::<T>, AnyDeserializeSeed::new::<T>())),
        }
    }

    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new_with_any_serialization<
        T: Any + Serialize + for<'de> Deserialize<'de> + Send + Sync + 'static,
    >() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
            magic_serialization: None,
            any_serialization: Some((any_as_serialize::<T>, AnyDeserializeSeed::new::<T>())),
        }
    }

    pub fn magic_as_serializable<'a>(
        &self,
        arc: &'a Arc<dyn MagicAny>,
    ) -> Option<&'a dyn erased_serde::Serialize> {
        if let Some(s) = self.magic_serialization {
            let r: &dyn MagicAny = arc;
            Some((s.0)(r))
        } else {
            None
        }
    }

    pub fn any_as_serializable<'a>(
        &self,
        arc: &'a Arc<dyn Any + Sync + Send>,
    ) -> Option<&'a dyn erased_serde::Serialize> {
        if let Some(s) = self.any_serialization {
            Some((s.0)(&**arc))
        } else {
            None
        }
    }

    pub fn get_magic_deserialize_seed(&self) -> Option<MagicAnyDeserializeSeed> {
        self.magic_serialization.map(|s| s.1)
    }

    pub fn get_any_deserialize_seed(&self) -> Option<AnyDeserializeSeed> {
        self.any_serialization.map(|s| s.1)
    }

    /// This is internally used by `#[turbo_tasks::value_impl]`
    pub fn register_trait_method(
        &mut self,
        trait_type: TraitTypeId,
        name: String,
        native_fn: FunctionId,
    ) {
        self.trait_methods.insert((trait_type, name), native_fn);
    }

    pub fn get_trait_method(
        &self,
        trait_method_key: &(TraitTypeId, String),
    ) -> Option<&FunctionId> {
        self.trait_methods.get(trait_method_key)
    }

    /// This is internally used by `#[turbo_tasks::value_impl]`
    pub fn register_trait(&mut self, trait_type: TraitTypeId) {
        self.traits.insert(trait_type);
    }

    pub fn has_trait(&self, trait_type: &TraitTypeId) -> bool {
        self.traits.contains(trait_type)
    }

    pub fn traits_iter(&self) -> impl Iterator<Item = TraitTypeId> + '_ {
        self.traits.iter().copied()
    }

    pub fn register(&'static self, global_name: &str) {
        register_value_type(global_name, self)
    }
}

#[derive(Debug)]
pub struct TraitType {
    pub name: String,
    pub(crate) default_trait_methods: HashMap<String, FunctionId>,
}

impl Hash for TraitType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (self as *const TraitType).hash(state);
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
        std::ptr::eq(self, other)
    }
}

impl PartialOrd for TraitType {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        (self as *const TraitType).partial_cmp(&(other as *const TraitType))
    }
}

impl Ord for TraitType {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (self as *const TraitType).cmp(&(other as *const TraitType))
    }
}

impl TraitType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            default_trait_methods: HashMap::new(),
        }
    }

    pub fn register_default_trait_method(&mut self, name: String, native_fn: FunctionId) {
        self.default_trait_methods.insert(name, native_fn);
    }

    pub fn register(&'static self, global_name: &str) {
        register_trait_type(global_name, self);
    }
}

pub trait TraitMethod: Any {}
