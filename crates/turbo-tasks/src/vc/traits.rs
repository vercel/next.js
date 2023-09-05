use super::{cell_mode::VcCellMode, read::VcRead};
use crate::{TraitTypeId, ValueTypeId};

/// A trait implemented on all values types that can be put into a Value Cell
/// ([`Vc<T>`]).
///
/// # Safety
///
/// The implementor of this trait must ensure that the read and cell mode
/// implementations are correct for the value type. Otherwise, it is possible to
/// generate invalid reads, for instance by using `VcTransparentRead` for a
/// value type that is not repr(transparent).
pub unsafe trait VcValueType: Sized + Send + Sync + 'static {
    /// How to read the value.
    type Read: VcRead<Self>;

    /// How to update cells of this value type.
    type CellMode: VcCellMode<Self>;

    /// Returns the type id of the value type.
    fn get_value_type_id() -> ValueTypeId;
}

/// A trait implemented on all values trait object references that can be put
/// into a Value Cell ([`Vc<&dyn Trait>`]).
pub trait VcValueTrait {
    fn get_trait_type_id() -> TraitTypeId;
}

/// Marker trait that indicates that a [`Vc<Self>`] can be upcasted to a
/// [`Vc<T>`].
///
/// # Safety
///
/// The implementor of this trait must ensure that `Self` implements the
/// trait `T`.
pub unsafe trait Upcast<T>: Send
where
    T: VcValueTrait + ?Sized + Send,
{
}

/// Marker trait that indicates that a [`Vc<Self>`] can accept all methods
/// declared on a [`Vc<T>`].
///
/// # Safety
///
/// The implementor of this trait must ensure that `Self` implements the
/// trait `T`.
pub unsafe trait Dynamic<T>: Send
where
    T: VcValueTrait + ?Sized + Send,
{
}

/// Marker trait that a turbo_tasks::value is prepared for
/// serialization as Value<...> input.
/// Either use `#[turbo_tasks::value(serialization: auto_for_input)]`
/// or avoid Value<...> in favor of a real Vc
pub trait TypedForInput: VcValueType {}
