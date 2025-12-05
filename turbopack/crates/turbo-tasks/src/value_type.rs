use std::{
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
};

use auto_hash_map::{AutoMap, AutoSet};
use bincode::{Decode, Encode};
use tracing::Span;
use turbo_bincode::{AnyDecodeFn, AnyEncodeFn};

use crate::{
    RawVc, SharedReference, VcValueType, id::TraitTypeId, macro_helpers::NativeFunction,
    magic_any::any_as_encode, registry, task::shared_reference::TypedSharedReference,
    vc::VcCellMode,
};

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
    pub name: &'static str,
    /// The fully qualitifed global name of the type.
    pub global_name: &'static str,
    /// Set of traits available
    traits: AutoSet<TraitTypeId>,
    /// List of trait methods available
    trait_methods: AutoMap<&'static TraitMethod, &'static NativeFunction>,

    /// Functions to convert to write the type to a buffer or read it from a buffer.
    pub bincode: Option<(AnyEncodeFn, AnyDecodeFn<SharedReference>)>,

    /// An implementation of
    /// [`VcCellMode::raw_cell`][crate::vc::VcCellMode::raw_cell].
    ///
    /// Allows dynamically constructing a cell using the type id. Used inside of
    /// [`TraitRef`][crate::TraitRef] where we have a type id, but not the concrete type `T` of
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
        for trait_id in self.traits.iter() {
            for (name, m) in &registry::get_trait(*trait_id).methods {
                if self.trait_methods.contains_key(&m) {
                    d.field(name, &"(trait fn)");
                }
            }
        }
        d.finish()
    }
}

impl Display for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(self.name)
    }
}

pub trait ManualEncodeWrapper: Encode {
    type Value;

    // this uses RPIT to avoid some lifetime problems
    fn new<'a>(value: &'a Self::Value) -> impl Encode + 'a;
}

pub trait ManualDecodeWrapper: Decode<()> {
    type Value;

    fn inner(self) -> Self::Value;
}

impl ValueType {
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value].
    pub fn new<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(global_name, None)
    }

    /// This is internally used by [`#[turbo_tasks::value]`][crate::value].
    pub fn new_with_bincode<T: VcValueType + Encode + Decode<()>>(
        global_name: &'static str,
    ) -> Self {
        Self::new_inner::<T>(
            global_name,
            Some((
                |this, enc| {
                    T::encode(any_as_encode::<T>(this), enc)?;
                    Ok(())
                },
                |dec| {
                    let val = T::decode(dec)?;
                    Ok(SharedReference::new(triomphe::Arc::new(val)))
                },
            )),
        )
    }

    /// This is used internally by [`turbo_tasks_macros::primitive`] to encode/decode foreign types
    /// that cannot implement the [`bincode`] traits due to the [orphan rules].
    ///
    /// This is done by constructing wrapper types that implement the bincode traits on behalf of
    /// the wrapped type.
    ///
    /// [orphan rules]: https://doc.rust-lang.org/reference/items/implementations.html#orphan-rules
    pub fn new_with_bincode_wrappers<
        T: VcValueType,
        E: ManualEncodeWrapper<Value = T>,
        D: ManualDecodeWrapper<Value = T>,
    >(
        global_name: &'static str,
    ) -> Self {
        Self::new_inner::<T>(
            global_name,
            Some((
                |this, enc| {
                    E::new(any_as_encode::<T>(this)).encode(enc)?;
                    Ok(())
                },
                |dec| {
                    let val = D::inner(D::decode(dec)?);
                    Ok(SharedReference::new(triomphe::Arc::new(val)))
                },
            )),
        )
    }

    // Helper for other constructor functions
    fn new_inner<T: VcValueType>(
        global_name: &'static str,
        bincode: Option<(AnyEncodeFn, AnyDecodeFn<SharedReference>)>,
    ) -> Self {
        Self {
            name: std::any::type_name::<T>(),
            global_name,
            traits: AutoSet::new(),
            trait_methods: AutoMap::new(),
            bincode,
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
        }
    }

    pub(crate) fn register_trait_method(
        &mut self,
        trait_method: &'static TraitMethod,
        native_fn: &'static NativeFunction,
    ) {
        self.trait_methods.insert(trait_method, native_fn);
    }

    pub fn get_trait_method(
        &self,
        trait_method: &'static TraitMethod,
    ) -> Option<&'static NativeFunction> {
        match self.trait_methods.get(trait_method) {
            Some(f) => Some(*f),
            None => trait_method.default_method,
        }
    }

    pub(crate) fn register_trait(&mut self, trait_type: TraitTypeId) {
        self.traits.insert(trait_type);
    }

    pub fn has_trait(&self, trait_type: &TraitTypeId) -> bool {
        self.traits.contains(trait_type)
    }

    pub fn traits_iter(&self) -> impl Iterator<Item = TraitTypeId> + '_ {
        self.traits.iter().cloned()
    }
}

// A collectable struct for value types
pub struct CollectableValueType(pub &'static once_cell::sync::Lazy<ValueType>);

inventory::collect! {CollectableValueType}

pub struct TraitMethod {
    pub(crate) trait_name: &'static str,
    pub(crate) method_name: &'static str,
    pub(crate) default_method: Option<&'static NativeFunction>,
}
impl Hash for TraitMethod {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (self as *const TraitMethod).hash(state);
    }
}

impl Eq for TraitMethod {}

impl PartialEq for TraitMethod {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}
impl Debug for TraitMethod {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.debug_struct("TraitMethod")
            .field("trait_name", &self.trait_name)
            .field("name", &self.method_name)
            .field("default_method", &self.default_method)
            .finish()
    }
}
impl TraitMethod {
    pub(crate) fn resolve_span(&self) -> Span {
        tracing::trace_span!(
            "turbo_tasks::resolve_trait_call",
            name = format_args!("{}::{}", &self.trait_name, &self.method_name),
        )
    }
}

#[derive(Debug)]
pub struct TraitType {
    pub name: &'static str,
    pub global_name: &'static str,
    pub(crate) methods: AutoMap<&'static str, TraitMethod>,
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
    pub fn new(
        name: &'static str,
        global_name: &'static str,
        trait_methods: Vec<(&'static str, Option<&'static NativeFunction>)>,
    ) -> Self {
        let mut methods = AutoMap::new();
        for (method_name, default_method) in trait_methods {
            let prev = methods.insert(
                method_name,
                TraitMethod {
                    trait_name: name,
                    method_name,
                    default_method,
                },
            );
            debug_assert!(
                prev.is_none(),
                "duplicate methods {method_name} registered on {global_name}"
            );
        }
        Self {
            name,
            global_name,
            methods,
        }
    }

    pub fn get(&self, name: &str) -> &TraitMethod {
        self.methods.get(name).unwrap()
    }
}

pub struct CollectableTrait(pub &'static once_cell::sync::Lazy<TraitType>);

inventory::collect! {CollectableTrait}
