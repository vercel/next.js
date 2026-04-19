use std::{
    any::TypeId,
    cell::SyncUnsafeCell,
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
};

use bincode::{Decode, Encode};
use tracing::Span;
use turbo_bincode::{AnyDecodeFn, AnyEncodeFn};

use crate::{
    RawVc, SharedReference, TaskPriority, VcValueType,
    dyn_task_inputs::any_as_encode,
    id::TraitTypeId,
    macro_helpers::{CollectableTraitMethods, NativeFunction},
    registry::{RegistryType, get_trait_type_id, trait_type_count, turbo_registry},
    task::shared_reference::TypedSharedReference,
    vc::VcCellMode,
};

type RawCellFactoryFn = fn(TypedSharedReference) -> RawVc;
type Vtable = &'static [&'static NativeFunction];

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
        f.debug_struct("ValueType")
            .field("name", &self.ty.name)
            .finish()
    }
}

impl Display for ValueType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str(self.ty.name)
    }
}

struct ValueTypeTraits {
    /// Flat array indexed by TraitTypeId (1-based, so index 0 = TraitTypeId 1).
    /// `None` means this value type does not implement that trait.
    /// The outer Option is None before init, Some after.
    traits: Option<Box<[Option<Vtable>]>>,
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
            ty: RegistryType::new::<T>(std::any::type_name::<T>(), global_name),
            bincode,
            raw_cell: <T::CellMode as VcCellMode<T>>::raw_cell,
            traits: SyncUnsafeCell::new(ValueTypeTraits { traits: None }),
        }
    }

    /// Returns the TypeId of the concrete type this ValueType represents.
    pub fn type_id(&self) -> TypeId {
        self.ty.type_id
    }

    #[inline]
    fn trait_info(&self) -> &ValueTypeTraits {
        // SAFETY: Written during single-threaded Lazy init, read-only after.
        unsafe { &*self.traits.get() }
    }

    #[inline]
    pub fn get_trait_method(
        &self,
        trait_method: &'static TraitMethod,
    ) -> Option<&'static NativeFunction> {
        let trait_type_id = trait_method.trait_type_id();
        let vtable = self.trait_info().traits.as_ref()?[*trait_type_id as usize - 1]?;
        Some(vtable[trait_method.index as usize])
    }

    fn register_trait(&self, trait_type: &'static TraitType, trait_methods: Vtable) {
        // SAFETY: Called only during single-threaded registry init
        let traits = unsafe { &mut *self.traits.get() };
        let trait_type_id = get_trait_type_id(trait_type);
        let array = traits
            .traits
            .get_or_insert_with(|| vec![None; trait_type_count()].into_boxed_slice());
        array[*trait_type_id as usize - 1] = Some(trait_methods);
    }

    #[inline]
    pub fn has_trait(&self, trait_type: &TraitTypeId) -> bool {
        self.trait_info()
            .traits
            .as_ref()
            .is_some_and(|t| t[**trait_type as usize - 1].is_some())
    }
}

turbo_registry!("Value", ValueType);

// Called during ValueType registry post_init to register all trait methods.
// Single-threaded during Lazy init.
pub(crate) fn register_all_trait_methods(_: &[&'static ValueType]) {
    for entry in inventory::iter::<CollectableTraitMethods> {
        entry
            .value_type
            .register_trait(entry.trait_type, entry.methods)
    }
}

pub struct TraitMethod {
    pub trait_type: &'static TraitType,
    pub index: u8,
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
    /// Returns the TraitTypeId by reading directly from the trait type's registry entry.
    /// Must only be called after registry init.
    #[inline]
    fn trait_type_id(&self) -> TraitTypeId {
        // SAFETY: Written during single-threaded Lazy init. Lazy provides acquire barrier.
        let raw = unsafe { std::ptr::read(self.trait_type.ty.id.get()) };
        debug_assert!(raw != 0, "TraitMethod::trait_type_id not initialized");
        unsafe { TraitTypeId::new_unchecked(raw) }
    }

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
    pub method_names: &'static [&'static str],
    pub default_methods: &'static [Option<&'static NativeFunction>],
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
    pub const fn new<T: 'static>(
        name: &'static str,
        global_name: &'static str,
        methods: phf::Map<&'static str, TraitMethod>,
        method_names: &'static [&'static str],
        default_methods: &'static [Option<&'static NativeFunction>],
    ) -> Self {
        Self {
            ty: RegistryType::new::<T>(name, global_name),
            methods,
            method_names,
            default_methods,
        }
    }

    pub fn get(&self, name: &str) -> &TraitMethod {
        self.methods.get(name).unwrap()
    }
}

turbo_registry!("Trait", TraitType);

pub trait TraitVtablePrototype {
    const LEN: usize;
    const NAMES: &'static [&'static str];
    const DEFAULTS: &'static [Option<&'static NativeFunction>];
}

pub(crate) const fn index_of_name(array: &'static [&'static str], name: &'static str) -> usize {
    let mut i = 0;
    'outer: while i < array.len() {
        if array[i].len() == name.len() {
            let mut j = 0;
            while j < name.len() {
                if array[i].as_bytes()[j] != name.as_bytes()[j] {
                    i += 1;
                    continue 'outer;
                }
                j += 1;
            }
            return i;
        }
        i += 1;
    }
    panic!("Method not found!")
}

pub const fn build_trait_vtable<B: TraitVtablePrototype, const LEN: usize>(
    overrides: &[(&'static str, &'static NativeFunction)],
) -> [&'static NativeFunction; LEN] {
    let mut methods = [&crate::native_function::VTABLE_DEFAULT; LEN];
    let mut i = 0;
    while i < LEN {
        if let Some(default) = B::DEFAULTS[i] {
            methods[i] = default;
        }
        i += 1;
    }
    // N*M scan where N = overrides, M = method names. Both are small (single digits).
    let mut i = 0;
    while i < overrides.len() {
        let (name, f) = overrides[i];
        methods[index_of_name(B::NAMES, name)] = f;
        i += 1;
    }
    methods
}
