use std::{
    any::TypeId,
    cell::SyncUnsafeCell,
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
};

use auto_hash_map::{AutoMap, AutoSet};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use tracing::Span;
use turbo_bincode::{AnyDecodeFn, AnyEncodeFn};

use crate::{
    RawVc, SharedReference, TaskPriority, VcValueType,
    id::TraitTypeId,
    macro_helpers::{CollectableTraitMethods, NativeFunction},
    magic_any::any_as_encode,
    registry::{self, RegistryType, turbo_registry},
    task::shared_reference::TypedSharedReference,
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
    pub ty: RegistryType,
    /// Returns the TypeId of the concrete type this ValueType represents.
    type_id: TypeId,

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

    traits: SyncUnsafeCell<ValueTypeTraits>,
}

impl Debug for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("ValueType");
        d.field("name", &self.ty.name);
        let info = self.trait_info();
        for trait_id in info.traits.iter() {
            for (name, m) in registry::get_trait(*trait_id).methods.entries() {
                // The phf map entry lives in a static, so this pointer cast is safe.
                let m: &'static TraitMethod = unsafe { &*(m as *const TraitMethod) };
                if info.trait_methods.contains_key(&m) {
                    d.field(name, &"(trait fn)");
                }
            }
        }
        d.finish()
    }
}

impl Display for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(self.ty.name)
    }
}

struct ValueTypeTraits {
    /// Set of traits available
    traits: AutoSet<TraitTypeId>,
    /// List of trait methods available
    trait_methods: AutoMap<&'static TraitMethod, &'static NativeFunction>,
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
    pub const fn new<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(global_name, None)
    }

    /// This is internally used by [`#[turbo_tasks::value]`][crate::value].
    pub const fn new_with_bincode<T: VcValueType + Encode + Decode<()>>(
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
    pub const fn new_with_bincode_wrappers<
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
    const fn new_inner<T: VcValueType>(
        global_name: &'static str,
        bincode: Option<(AnyEncodeFn, AnyDecodeFn<SharedReference>)>,
    ) -> Self {
        Self {
            ty: RegistryType::new(std::any::type_name::<T>(), global_name),
            type_id: TypeId::of::<T>(),
            bincode,
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
            traits: SyncUnsafeCell::new(ValueTypeTraits {
                traits: AutoSet::new(),
                trait_methods: AutoMap::new(),
            }),
        }
    }

    /// Returns the TypeId of the concrete type this ValueType represents.
    pub fn type_id(&self) -> TypeId {
        self.type_id
    }

    /// Access trait info for reading.
    ///
    /// SAFETY: Must only be called after registry init is complete (i.e. after
    /// the Lazy inside Registry has been initialized). This is guaranteed because
    /// the only way to get a `&ValueType` is through the registry, which forces init.
    fn trait_info(&self) -> &ValueTypeTraits {
        // SAFETY: After Lazy init completes, no more writes happen to trait_info,
        // and Lazy provides the necessary acquire barrier.
        unsafe { &*self.traits.get() }
    }

    fn register_trait_method(
        &self,
        trait_method: &'static TraitMethod,
        native_fn: &'static NativeFunction,
    ) {
        // SAFETY: Called only during single-threaded registry init
        unsafe { &mut *self.traits.get() }
            .trait_methods
            .insert(trait_method, native_fn);
    }

    pub fn get_trait_method(
        &self,
        trait_method: &'static TraitMethod,
    ) -> Option<&'static NativeFunction> {
        _ = &**registry::VALUES;
        match self.trait_info().trait_methods.get(trait_method) {
            Some(f) => Some(*f),
            None => trait_method.default_method,
        }
    }

    fn register_trait(&self, trait_type: TraitTypeId) {
        // SAFETY: Called only during single-threaded registry init
        unsafe { &mut *self.traits.get() }.traits.insert(trait_type);
    }

    pub fn has_trait(&self, trait_type: &TraitTypeId) -> bool {
        _ = &**registry::VALUES;
        self.trait_info().traits.contains(trait_type)
    }
}

turbo_registry!("Value", ValueType);

// Called during ValueType registry post_init to register all trait methods on all value types.
// This runs inside the Lazy init (single-threaded), so the unsafe SyncUnsafeCell access is safe.
pub(crate) fn register_all_trait_methods(value_types: &[&'static ValueType]) {
    #[allow(clippy::type_complexity)]
    let mut trait_methods_by_value: FxHashMap<
        TypeId,
        Vec<(TraitTypeId, Vec<(&'static str, &'static NativeFunction)>)>,
    > = FxHashMap::default();
    for CollectableTraitMethods(thunk) in inventory::iter::<CollectableTraitMethods> {
        let (type_id, trait_type_id, fn_items) = thunk();
        trait_methods_by_value
            .entry(type_id)
            .or_default()
            .push((trait_type_id, fn_items));
    }

    for value_type in value_types {
        if let Some(traits) = trait_methods_by_value.remove(&value_type.type_id()) {
            for (trait_type_id, methods) in traits {
                let trait_type = crate::registry::get_trait(trait_type_id);
                value_type.register_trait(trait_type_id);
                for (name, method) in methods {
                    value_type.register_trait_method(trait_type.get(name), method);
                }
            }
        }
    }
}

pub struct TraitMethod {
    pub trait_name: &'static str,
    pub method_name: &'static str,
    pub default_method: Option<&'static NativeFunction>,
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
    pub(crate) fn resolve_span(&self, priority: TaskPriority) -> Span {
        tracing::trace_span!(
            "turbo_tasks::resolve_trait_call",
            name = format_args!("{}::{}", &self.trait_name, &self.method_name),
            priority = %priority,
        )
    }
}

pub struct TraitType {
    pub ty: RegistryType,
    pub methods: phf::Map<&'static str, TraitMethod>,
}

impl Debug for TraitType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("TraitType");
        d.field("name", &self.ty.name);
        for (name, method) in self.methods.entries() {
            d.field(name, method);
        }
        d.finish()
    }
}

impl Display for TraitType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "trait {}", self.ty.name)
    }
}

impl TraitType {
    pub fn get(&self, name: &str) -> &TraitMethod {
        self.methods.get(name).unwrap()
    }
}

turbo_registry!("Trait", TraitType);
