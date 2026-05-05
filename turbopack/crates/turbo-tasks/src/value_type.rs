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

/// Cell-persistence behavior of a [`ValueType`].
///
/// Carries the serializer/deserializer pair for `Persistable` values — today
/// that's bincode, but the enum name is neutral so the choice of mechanism can
/// evolve without a cascade of rename work.
pub enum ValueTypePersistence {
    /// Cells are serialized to the persistent cache and restored on next
    /// access after eviction. Maps to `serialization = "auto" | "custom"`.
    Persistable(AnyEncodeFn, AnyDecodeFn<SharedReference>),
    /// The value type opts out of being persisted: re-running the producing
    /// task to reproduce the cell is preferred over serializing the in-memory
    /// form. Cells are evictable; the next reader after eviction triggers a
    /// recompute from the task's inputs. Maps to
    /// `serialization = "skip"` (plus an optional `evict` attribute).
    SkipPersist {
        /// Whether re-deriving this cell is non-trivial (e.g. WASM compile,
        /// spawning a Node process pool). Eviction policy may prefer
        /// evicting cheap cells first. True iff declared with
        /// `serialization = "skip", evict = "last"`.
        expensive: bool,
    },
    /// The value type is not persisted, but the macro emitted a
    /// `DeterministicHash` derive and the write path stashes a `content_hash`
    /// into `cell_data_hash` so post-eviction reads can detect unchanged
    /// content and skip invalidation. Maps to `serialization = "hash"`.
    HashOnly,
    /// Not persistable, not reconstructible — holds interior-mutable state
    /// that accumulates across the session (`State<>` cells, `Arc<Mutex<_>>`
    /// dedup histories). Re-running the producing task would lose the
    /// accumulated state, so cells of this type must stay in memory across
    /// eviction. Maps to `serialization = "skip", evict = "never"`.
    SessionStateful,
}

/// A definition of a type of data.
///
/// Contains a list of traits and trait methods that are available on that type.
pub struct ValueType {
    pub ty: RegistryType,

    /// How cells of this type participate in the persistent cache.
    pub persistence: ValueTypePersistence,

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
    /// Construct a `ValueType` that opts out of being persisted. Cells are
    /// evictable; the next reader after eviction triggers a recompute from
    /// the task's inputs.
    ///
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value] for
    /// `serialization = "skip"`.
    pub const fn skip_persist<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(
            global_name,
            ValueTypePersistence::SkipPersist { expensive: false },
        )
    }

    /// Construct a `ValueType` that opts out of being persisted and is marked
    /// as expensive to re-derive (e.g. WASM compile, Node process spawn). The
    /// eviction policy may prefer evicting cheaper cells first.
    ///
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value] for
    /// `serialization = "skip", evict = "last"`.
    pub const fn skip_persist_expensive<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(
            global_name,
            ValueTypePersistence::SkipPersist { expensive: true },
        )
    }

    /// Construct a `ValueType` that opts out of being persisted but stashes a
    /// `content_hash` on each write so post-eviction reads can detect
    /// unchanged content and skip invalidation.
    ///
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value] for
    /// `serialization = "hash"`.
    pub const fn hash_only<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(global_name, ValueTypePersistence::HashOnly)
    }

    /// Construct a `ValueType` whose cells cannot be reconstructed by
    /// re-executing the task — they hold session-scoped state (file system
    /// handles, worker pools, plugin DSOs, `State<>` interior mutability).
    /// The storage layer must keep them in memory across eviction.
    ///
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value] for
    /// `serialization = "skip", evict = "never"`.
    pub const fn session_stateful<T: VcValueType>(global_name: &'static str) -> Self {
        Self::new_inner::<T>(global_name, ValueTypePersistence::SessionStateful)
    }

    /// Construct a `ValueType` whose cells round-trip through the persistent
    /// cache. Cells are evictable and restored from disk on next access.
    ///
    /// This is internally used by [`#[turbo_tasks::value]`][crate::value] for
    /// `serialization = "auto"` and `serialization = "custom"`.
    pub const fn persistable<T: VcValueType + Encode + Decode<()>>(
        global_name: &'static str,
    ) -> Self {
        Self::new_inner::<T>(
            global_name,
            ValueTypePersistence::Persistable(
                |this, enc| {
                    T::encode(any_as_encode::<T>(this), enc)?;
                    Ok(())
                },
                |dec| {
                    let val = T::decode(dec)?;
                    Ok(SharedReference::new(triomphe::Arc::new(val)))
                },
            ),
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
            ValueTypePersistence::Persistable(
                |this, enc| {
                    E::new(any_as_encode::<T>(this)).encode(enc)?;
                    Ok(())
                },
                |dec| {
                    let val = D::inner(D::decode(dec)?);
                    Ok(SharedReference::new(triomphe::Arc::new(val)))
                },
            ),
        )
    }

    // Helper for other constructor functions
    const fn new_inner<T: VcValueType>(
        global_name: &'static str,
        persistence: ValueTypePersistence,
    ) -> Self {
        Self {
            ty: RegistryType::new::<T>(std::any::type_name::<T>(), global_name),
            persistence,
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
            .register_trait(entry.trait_type, entry.methods);
        // Reigster all the rust vtables to support into_trait_ref calling stryles
        (entry.finalize_vtable_registry)();
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
    pub methods: &'static [TraitMethod],
    pub default_methods: &'static [Option<&'static NativeFunction>],
}

impl Debug for TraitType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("TraitType");
        d.field("name", &self.ty.name);
        for method in self.methods.iter() {
            d.field(method.method_name, method);
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
        methods: &'static [TraitMethod],
        default_methods: &'static [Option<&'static NativeFunction>],
    ) -> Self {
        Self {
            ty: RegistryType::new::<T>(name, global_name),
            methods,
            default_methods,
        }
    }

    #[cfg(test)]
    pub fn get(&self, name: &str) -> &TraitMethod {
        self.methods
            .iter()
            .find(|method| method.method_name == name)
            .expect("Method not found!")
    }
}

turbo_registry!("Trait", TraitType);

pub trait TraitVtablePrototype {
    const LEN: usize;
    const DEFAULTS: &'static [Option<&'static NativeFunction>];
}

/// Linear-scan lookup of a [`TraitMethod`] by `method_name` in a `&'static [TraitMethod]`. Const
/// so the `value_trait` macro's per-method dispatch site can resolve to an array index at
/// compile time.
pub const fn index_of_method_name(methods: &'static [TraitMethod], name: &'static str) -> usize {
    let mut i = 0;
    'outer: while i < methods.len() {
        let entry = methods[i].method_name;
        if entry.len() == name.len() {
            let mut j = 0;
            while j < name.len() {
                if entry.as_bytes()[j] != name.as_bytes()[j] {
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

pub const fn build_trait_vtable<
    B: TraitVtablePrototype + crate::registry::RegistryDef<TraitType>,
    const LEN: usize,
>(
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
        methods[index_of_method_name(
            <B as crate::registry::RegistryDef<TraitType>>::DEF.methods,
            name,
        )] = f;
        i += 1;
    }
    methods
}

#[cfg(test)]
mod tests {
    //! Asserts that each `serialization = "..."` annotation lands on the right
    //! `ValueTypePersistence` variant. These are purely compile-time /
    //! macro-expansion properties of the value types, so no turbo_tasks runtime
    //! is needed — we read the registered `ValueType` via `registry::get_value_type`
    //! and match on `persistence`.
    use super::ValueTypePersistence;
    use crate::{self as turbo_tasks, VcValueType, registry};

    #[turbo_tasks::value(serialization = "skip")]
    struct SkipValue(#[turbo_tasks(trace_ignore)] u32);

    #[turbo_tasks::value(serialization = "hash")]
    struct HashValue(u32);

    #[turbo_tasks::value(serialization = "skip", evict = "last")]
    struct SkipExpensiveValue(#[turbo_tasks(trace_ignore)] u32);

    #[turbo_tasks::value(serialization = "skip", evict = "never", cell = "new", eq = "manual")]
    struct SessionStatefulValue;

    #[turbo_tasks::value]
    struct PersistableValue(u32);

    #[test]
    fn skip_maps_to_skip_persist() {
        let vt = registry::get_value_type(SkipValue::get_value_type_id());
        assert!(
            matches!(
                vt.persistence,
                ValueTypePersistence::SkipPersist { expensive: false },
            ),
            "`serialization = \"skip\"` must map to SkipPersist {{ expensive: false }}"
        );
        assert!(!SkipValue::has_serialization());
    }

    #[test]
    fn hash_maps_to_hash_only() {
        let vt = registry::get_value_type(HashValue::get_value_type_id());
        assert!(
            matches!(vt.persistence, ValueTypePersistence::HashOnly),
            "`serialization = \"hash\"` must map to HashOnly"
        );
        assert!(!HashValue::has_serialization());
    }

    #[test]
    fn skip_expensive_maps_to_skip_persist_expensive() {
        let vt = registry::get_value_type(SkipExpensiveValue::get_value_type_id());
        assert!(
            matches!(
                vt.persistence,
                ValueTypePersistence::SkipPersist { expensive: true },
            ),
            "`serialization = \"skip\", evict = \"last\"` must map to SkipPersist {{ expensive: \
             true }}"
        );
        assert!(!SkipExpensiveValue::has_serialization());
    }

    #[test]
    fn session_stateful_maps_to_session_stateful() {
        let vt = registry::get_value_type(SessionStatefulValue::get_value_type_id());
        assert!(
            matches!(vt.persistence, ValueTypePersistence::SessionStateful),
            "`serialization = \"skip\", evict = \"never\"` must map to \
             ValueTypePersistence::SessionStateful"
        );
        assert!(!SessionStatefulValue::has_serialization());
    }

    #[test]
    fn default_maps_to_persistable() {
        let vt = registry::get_value_type(PersistableValue::get_value_type_id());
        assert!(
            matches!(vt.persistence, ValueTypePersistence::Persistable(_, _)),
            "default (auto) serialization must map to ValueTypePersistence::Persistable"
        );
        assert!(PersistableValue::has_serialization());
    }
}
