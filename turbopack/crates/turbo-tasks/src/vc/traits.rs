use crate::{
    NonLocalValue, ShrinkToFit, TraitTypeId, ValueTypeId, VcRead, macro_helpers::VTableRegistry,
    vc::cell_mode::VcCellMode,
};

/// A trait implemented on all values types that can be put into a Value Cell
/// ([`Vc<T>`][crate::Vc]).
///
/// # Safety
///
/// The implementor of this trait must ensure that the read and cell mode
/// implementations are correct for the value type. Otherwise, it is possible to
/// generate invalid reads, for instance by using
/// [`VcTransparentRead`][crate::VcTransparentRead] for a value type that is not
/// `#[repr(transparent)]`.
pub unsafe trait VcValueType: ShrinkToFit + Sized + Send + Sync + 'static {
    /// How to read the value.
    type Read: VcRead<Self>;

    /// How to update cells of this value type.
    type CellMode: VcCellMode<Self>;

    /// Returns the type id of the value type.
    fn get_value_type_id() -> ValueTypeId;
}

/// A trait implemented on all values trait object references that can be put
/// into a Value Cell ([`Vc<Box<dyn Trait>>`][crate::Vc]).
pub trait VcValueTrait: NonLocalValue + Send + Sync + 'static {
    // The concrete type of the value_trait implementing VcValueTrait
    type ValueTrait: ?Sized;

    /// Returns the type id of the trait object.
    fn get_trait_type_id() -> TraitTypeId;

    /// Returns the vtable for an implementation of this trait.
    /// Panics if ValueTypeId does not implement the trait.
    fn get_impl_vtables() -> &'static VTableRegistry<Self::ValueTrait>;
}

/// Marker trait that indicates that a [`Vc<Self>`][crate::Vc] can be upcasted
/// to a [`Vc<T>`][crate::Vc].
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

/// A speialization of [`Upcast`] that ensures that the upcast is strict meaning that T !== Self
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
