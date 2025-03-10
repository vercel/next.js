use std::{
    any::{type_name, Any},
    borrow::Cow,
    fmt::{
        Debug, Display, Formatter, {self},
    },
    hash::Hash,
    sync::Arc,
};

use auto_hash_map::{AutoMap, AutoSet};
use serde::{Deserialize, Serialize};
use tracing::Span;

use crate::{
    id::{FunctionId, TraitTypeId},
    magic_any::{AnyDeserializeSeed, MagicAny, MagicAnyDeserializeSeed, MagicAnySerializeSeed},
    registry::{register_trait_type, register_value_type},
    task::shared_reference::TypedSharedReference,
    vc::VcCellMode,
    RawVc, VcValueType,
};

type MagicSerializationFn = fn(&dyn MagicAny) -> &dyn erased_serde::Serialize;
type AnySerializationFn = fn(&(dyn Any + Sync + Send)) -> &dyn erased_serde::Serialize;
type RawCellFactoryFn = fn(TypedSharedReference) -> RawVc;

// TODO this type need some refactoring when multiple languages are added to
// turbo-task In this case a trait_method might be of a different function type.
// It probably need to be a Vc<Function>.
// That's also needed in a distributed world, where the function might be only
// available on a remote instance.

/// A definition of a type of data.
///
/// Contains a list of traits and trait methods that are available on that type.
pub struct ValueType {
    /// A readable name of the type
    pub name: String,
    /// List of traits available
    pub traits: AutoSet<TraitTypeId>,
    /// List of trait methods available
    pub trait_methods: AutoMap<(TraitTypeId, Cow<'static, str>), FunctionId>,

    /// Functors for serialization
    magic_serialization: Option<(MagicSerializationFn, MagicAnyDeserializeSeed)>,
    any_serialization: Option<(AnySerializationFn, AnyDeserializeSeed)>,

    /// An implementation of
    /// [`VcCellMode::raw_cell`][crate::vc::cell_mode::VcCellMode::raw_cell].
    ///
    /// Allows dynamically constructing a cell using the type id. Used inside of
    /// [`RawVc`] where we have a type id, but not the concrete type `T` of
    /// `Vc<T>`.
    ///
    /// Because we allow resolving `Vc<dyn Trait>`, it's otherwise not possible
    /// for `RawVc` to know what the appropriate `VcCellMode` is.
    pub(crate) raw_cell: RawCellFactoryFn,
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

impl Display for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(&self.name)
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
    pub fn new<T: VcValueType>() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: AutoSet::new(),
            trait_methods: AutoMap::new(),
            magic_serialization: None,
            any_serialization: None,
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
        }
    }

    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new_with_magic_serialization<
        T: VcValueType + Debug + Eq + Hash + Serialize + for<'de> Deserialize<'de>,
    >() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: AutoSet::new(),
            trait_methods: AutoMap::new(),
            magic_serialization: Some((
                <dyn MagicAny>::as_serialize::<T>,
                MagicAnyDeserializeSeed::new::<T>(),
            )),
            any_serialization: Some((any_as_serialize::<T>, AnyDeserializeSeed::new::<T>())),
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
        }
    }

    /// This is internally used by `#[turbo_tasks::value]`
    pub fn new_with_any_serialization<
        T: VcValueType + Any + Serialize + for<'de> Deserialize<'de>,
    >() -> Self {
        Self {
            name: std::any::type_name::<T>().to_string(),
            traits: AutoSet::new(),
            trait_methods: AutoMap::new(),
            magic_serialization: None,
            any_serialization: Some((any_as_serialize::<T>, AnyDeserializeSeed::new::<T>())),
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
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
        arc: &'a triomphe::Arc<dyn Any + Sync + Send>,
    ) -> Option<&'a dyn erased_serde::Serialize> {
        if let Some(s) = self.any_serialization {
            Some((s.0)(&**arc))
        } else {
            None
        }
    }

    pub fn is_serializable(&self) -> bool {
        self.any_serialization.is_some()
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
        name: Cow<'static, str>,
        native_fn: FunctionId,
    ) {
        self.trait_methods.insert((trait_type, name), native_fn);
    }

    pub fn get_trait_method(
        &self,
        trait_method_key: &(TraitTypeId, Cow<'static, str>),
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

    pub fn register(&'static self, global_name: &'static str) {
        register_value_type(global_name, self)
    }
}

pub struct TraitMethod {
    pub default_method: Option<FunctionId>,
    pub arg_serializer: MagicAnySerializeSeed,
    pub arg_deserializer: MagicAnyDeserializeSeed,
}

impl Debug for TraitMethod {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("TraitMethod")
            .field("default_method", &self.default_method)
            .finish()
    }
}

#[derive(Debug)]
pub struct TraitType {
    pub name: String,
    pub(crate) methods: AutoMap<Cow<'static, str>, TraitMethod>,
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

impl TraitType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            methods: AutoMap::new(),
        }
    }

    pub fn register_trait_method<T>(&mut self, name: Cow<'static, str>)
    where
        T: Serialize + for<'de> Deserialize<'de> + Debug + Eq + Hash + Send + Sync + 'static,
    {
        self.methods.insert(
            name,
            TraitMethod {
                default_method: None,
                arg_serializer: MagicAnySerializeSeed::new::<T>(),
                arg_deserializer: MagicAnyDeserializeSeed::new::<T>(),
            },
        );
    }

    pub fn register_default_trait_method<T>(
        &mut self,
        name: Cow<'static, str>,
        native_fn: FunctionId,
    ) where
        T: Serialize + for<'de> Deserialize<'de> + Debug + Eq + Hash + Send + Sync + 'static,
    {
        self.methods.insert(
            name,
            TraitMethod {
                default_method: Some(native_fn),
                arg_serializer: MagicAnySerializeSeed::new::<T>(),
                arg_deserializer: MagicAnyDeserializeSeed::new::<T>(),
            },
        );
    }

    pub fn register(&'static self, global_name: &'static str) {
        register_trait_type(global_name, self);
    }

    pub fn resolve_span(&'static self, name: &str) -> Span {
        tracing::trace_span!(
            "turbo_tasks::resolve_trait_call",
            name = format_args!("{}::{name}", &self.name),
        )
    }
}
