use crate::{
    NonLocalValue, ShrinkToFit, TraitTypeId, ValueTypeId, VcRead, macro_helpers::VTableRegistry,
    vc::cell_mode::VcCellMode,
};

/// A trait implemented on all values types that can be put into a value cell ([`Vc`][crate::Vc]).
///
/// Custom traits for `VcValueType`s should be subtraits of [`VcValueTrait`].
///
/// You should not implement this trait directly, but instead use the
/// [`#[turbo_tasks::value]`][crate::value] macro instead.
///
/// ## Safety
///
/// The implementor of this trait must ensure that the read and cell mode implementations are
/// correct for the value type. Otherwise, it is possible to generate invalid reads, for instance by
/// using [`VcTransparentRead`][crate::VcTransparentRead] for a value type that is not
/// `#[repr(transparent)]`.
pub unsafe trait VcValueType: ShrinkToFit + Sized + Send + Sync + 'static {
    /// How to read the value.
    type Read: VcRead<Self>;

    /// How to update cells of this value type.
    type CellMode: VcCellMode<Self>;

    /// Returns the type id of the value type.
    fn get_value_type_id() -> ValueTypeId;

    fn has_serialization() -> bool;
}

/// A trait implemented on all values trait object references that can be used with a value cell
/// ([`Vc<Box<dyn Trait>>`][crate::Vc]).
///
/// You should not create subtraits of this trait manually, but instead use the
/// [`#[turbo_tasks::value_trait]`][crate::value_trait] macro. Implementations of `VcValueTrait`s
/// should use the [`#[turbo_tasks::value_impl]`][crate::value_impl] macro.
///
/// [`Vc`]: crate::Vc
///
///
/// ## Upcasting
///
/// A concrete [`Vc`] of a [`VcValueType`] can be converted to a [`Vc`] of a `VcValueTrait` with an
/// upcast:
///
/// ```ignore
/// let something_vc: Vc<ConcreteType> = ...;
/// let trait_vc: Vc<Box<dyn MyTrait>> = Vc::upcast(something_vc);
///
/// // there is an equivalent API for ResolvedVc
/// let something_resolved_vc: ResolvedVc<ConcreteType> = ...;
/// let trait_resolved_vc: ResolvedVc<Box<dyn MyTrait>> = ResolvedVc::upcast(something_resolved_vc);
/// ```
///
/// Upcast safety is enforced at compile-time with the [`Upcast`] and [`UpcastStrict`] traits.
/// Upcasts always succeed.
///
///
/// ## Downcasting
///
/// A [`ResolvedVc`] containing a `VcValueTrait` subtrait can be downcast to a concrete type with
/// [`ResolvedVc::try_downcast_type`]:
///
/// ```ignore
/// let trait_vc: Vc<Box<dyn MyTrait>> = ...;
/// if let Some(something_vc) = ResolvedVc::try_downcast_type::<Something>(trait_vc) {
///     // ...
/// }
/// ```
///
/// A supertrait can be cast to a subtrait with [`ResolvedVc::try_downcast`]:
///
/// ```ignore
/// let trait_vc: Vc<Box<dyn SubTrait>> = ...;
/// if let Some(something_vc) = ResolvedVc::try_downcast::<Box<dyn SuperTrait>>(trait_vc) {
///     // ...
/// }
/// ```
///
/// If you have an unresolved [`Vc`] that you'd like to downcast, you should [resolve it first].
///
/// A compile-time check using the [`Upcast`] and [`UpcastStrict`] traits ensures that a downcast is
/// possible (the target type or trait implements the source trait), but it may still return
/// `None` at runtime if the concrete value does not implement the trait.
///
/// [`ResolvedVc`]: crate::ResolvedVc
/// [`ResolvedVc::try_downcast_type`]: crate::ResolvedVc::try_downcast_type
/// [`ResolvedVc::try_downcast`]: crate::ResolvedVc::try_downcast
/// [resolve it first]: crate::Vc::to_resolved
///
///
/// ## Sidecasting
///
/// In some cases, you may want to convert between two traits that do not have a supertrait/subtrait
/// relationship:
///
/// ```ignore
/// let trait_vc: Vc<Box<dyn MyTrait>> = ...;
/// if let Some(something_vc) = ResolvedVc::try_sidecast::<Box<dyn UnrelatedTrait>>(trait_vc) {
///     // ...
/// }
/// ```
///
/// If you have an unresolved [`Vc`] that you'd like to sidecast, you should [resolve it first].
///
/// This won't do any compile-time checks, so downcasting should be preferred if possible. It will
/// return `None` at runtime if the cast fails.
///
///
/// ## Reading
///
/// Trait object Vcs can be read by converting them to a [`TraitRef`], which allows non-turbo-tasks
/// functions defined on the trait to be called.
///
/// ```ignore
/// let trait_vc: Vc<Box<dyn MyTrait>> = ...;
/// let trait_ref: TraitRef<Box<dyn MyTrait>> = trait_vc.into_trait_ref().await?;
///
/// trait_ref.non_turbo_tasks_function();
/// ```
///
/// [`TraitRef`]: crate::TraitRef
pub trait VcValueTrait: NonLocalValue + Send + Sync + 'static {
    // The concrete type of the value_trait implementing VcValueTrait
    type ValueTrait: ?Sized + std::ptr::Pointee<Metadata = std::ptr::DynMetadata<Self::ValueTrait>>;

    /// The per-trait vtable registry, populated at program load by `#[ctor::ctor]`
    /// functions emitted by each `#[turbo_tasks::value_impl]` expansion.
    ///
    /// [`VTableRegistry::cast`] panics if the value type being cast doesn't implement this
    /// trait.
    const IMPL_VTABLES: &'static VTableRegistry<Self::ValueTrait>;

    /// Returns the type id of the trait object.
    fn get_trait_type_id() -> TraitTypeId;
}

/// Marker trait that indicates that a [`Vc<Self>`][crate::Vc] can be upcasted to a
/// [`Vc<T>`][crate::Vc].
///
/// See [`VcValueTrait`] for example usage.
///
/// # Safety
///
/// The implementor of this trait must ensure that `Self` implements the
/// trait `T`.
pub unsafe trait Upcast<T>
where
    T: VcValueTrait + ?Sized,
{
}

/// A specialization of [`Upcast`] that ensures that the upcast is strict meaning that `T !== Self`.
///
/// See [`VcValueTrait`] for example usage.
///
/// # Safety
///
/// The implementor of this trait must ensure that `Self` implements the
/// trait `T` and that `Self` is not equal to `T`.
pub unsafe trait UpcastStrict<T>: Upcast<T>
where
    T: VcValueTrait + ?Sized,
{
}

/// Marker trait that indicates that a [`Vc<Self>`][crate::Vc] can accept all
/// methods declared on a [`Vc<T>`][crate::Vc].
///
/// # Safety
///
/// The implementor of this trait must ensure that `Self` implements the
/// trait `T`.
pub unsafe trait Dynamic<T>
where
    T: VcValueTrait + ?Sized,
{
}
