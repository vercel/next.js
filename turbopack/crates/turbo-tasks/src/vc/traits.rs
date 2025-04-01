use crate::{
    vc::cell_mode::VcCellMode, NonLocalValue, ShrinkToFit, TraitTypeId, ValueTypeId, VcRead,
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
    fn get_trait_type_id() -> TraitTypeId;
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

/// Marker trait that a turbo_tasks::value is prepared for serialization as
/// [`Value<...>`][crate::Value] input.
///
/// Either use [`#[turbo_tasks::value(serialization = "auto_for_input")]`][macro@crate::value] or
/// avoid [`Value<...>`][crate::Value] in favor of a real [Vc][crate::Vc].
pub trait TypedForInput: VcValueType {}
