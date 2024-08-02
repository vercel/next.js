use std::marker::PhantomData;

use super::{read::VcRead, traits::VcValueType};
use crate::{manager::find_cell_by_type, Vc};

/// Trait that controls the behavior of `Vc::cell` on a value type basis.
///
/// This trait must remain sealed within this crate.
pub trait VcCellMode<T>
where
    T: VcValueType,
{
    fn cell(value: <T::Read as VcRead<T>>::Target) -> Vc<T>;
}

/// Mode that always updates the cell's content.
pub struct VcCellNewMode<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCellMode<T> for VcCellNewMode<T>
where
    T: VcValueType,
{
    fn cell(inner: <T::Read as VcRead<T>>::Target) -> Vc<T> {
        let cell = find_cell_by_type(T::get_value_type_id());
        cell.update_shared(<T::Read as VcRead<T>>::target_to_repr(inner));
        Vc {
            node: cell.into(),
            _t: PhantomData,
        }
    }
}

/// Mode that compares the cell's content with the new value and only updates
/// if the new value is different.
pub struct VcCellSharedMode<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCellMode<T> for VcCellSharedMode<T>
where
    T: VcValueType,
    <T::Read as VcRead<T>>::Repr: PartialEq,
{
    fn cell(inner: <T::Read as VcRead<T>>::Target) -> Vc<T> {
        let cell = find_cell_by_type(T::get_value_type_id());
        cell.compare_and_update_shared(<T::Read as VcRead<T>>::target_to_repr(inner));
        Vc {
            node: cell.into(),
            _t: PhantomData,
        }
    }
}
