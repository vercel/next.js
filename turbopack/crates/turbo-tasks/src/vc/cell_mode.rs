use std::{any::type_name, marker::PhantomData};

use super::{read::VcRead, traits::VcValueType};
use crate::{
    RawVc, Vc, backend::VerificationMode, keyed::KeyedEq, manager::find_cell_by_type,
    task::shared_reference::TypedSharedReference,
};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

/// Trait that controls the behavior of [`Vc::cell`] based on the value type's
/// [`VcValueType::CellMode`].
///
/// This trait must remain sealed within this crate.
pub trait VcCellMode<T>
where
    T: VcValueType,
{
    /// Create a new cell.
    fn cell(value: VcReadTarget<T>) -> Vc<T>;

    /// Create a type-erased [`RawVc`] cell given a pre-existing type-erased
    /// [`SharedReference`][crate::task::SharedReference].
    ///
    /// This is used in APIs that already have a `SharedReference`, such as in
    /// [`ReadRef::cell`][crate::ReadRef::cell] or in [`Vc::resolve`] when
    /// resolving a local [`Vc`]. This avoids unnecessary cloning.
    fn raw_cell(value: TypedSharedReference) -> RawVc;
}

/// Mode that always updates the cell's content.
pub struct VcCellNewMode<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCellMode<T> for VcCellNewMode<T>
where
    T: VcValueType,
{
    fn cell(inner: VcReadTarget<T>) -> Vc<T> {
        let cell = find_cell_by_type::<T>();
        cell.update(
            <T::Read as VcRead<T>>::target_to_value(inner),
            VerificationMode::Skip,
        );
        Vc {
            node: cell.into(),
            _t: PhantomData,
        }
    }

    fn raw_cell(content: TypedSharedReference) -> RawVc {
        debug_assert_type::<T>(&content);
        let cell = find_cell_by_type::<T>();
        cell.update_with_shared_reference(content.reference, VerificationMode::Skip);
        cell.into()
    }
}

/// Mode that compares the cell's content with the new value and only updates
/// if the new value is different.
pub struct VcCellCompareMode<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCellMode<T> for VcCellCompareMode<T>
where
    T: VcValueType + PartialEq,
{
    fn cell(inner: VcReadTarget<T>) -> Vc<T> {
        let cell = find_cell_by_type::<T>();
        cell.compare_and_update(<T::Read as VcRead<T>>::target_to_value(inner));
        Vc {
            node: cell.into(),
            _t: PhantomData,
        }
    }

    fn raw_cell(content: TypedSharedReference) -> RawVc {
        debug_assert_type::<T>(&content);
        let cell = find_cell_by_type::<T>();
        cell.compare_and_update_with_shared_reference::<T>(content.reference);
        cell.into()
    }
}

/// Mode that compares the cell's content with the new value key by key and only updates
/// individual keys if the new value is different.
pub struct VcCellKeyedCompareMode<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCellMode<T> for VcCellKeyedCompareMode<T>
where
    T: VcValueType + PartialEq,
    VcReadTarget<T>: KeyedEq,
    <VcReadTarget<T> as KeyedEq>::Key: std::hash::Hash,
{
    fn cell(inner: VcReadTarget<T>) -> Vc<T> {
        let cell = find_cell_by_type::<T>();
        cell.keyed_compare_and_update(<T::Read as VcRead<T>>::target_to_value(inner));
        Vc {
            node: cell.into(),
            _t: PhantomData,
        }
    }

    fn raw_cell(content: TypedSharedReference) -> RawVc {
        debug_assert_type::<T>(&content);
        let cell = find_cell_by_type::<T>();
        cell.keyed_compare_and_update_with_shared_reference::<T>(content.reference);
        cell.into()
    }
}

fn debug_assert_type<T: VcValueType>(content: &TypedSharedReference) {
    debug_assert!(
        (*content.reference.0).is::<T>(),
        "SharedReference for type {} must contain data matching that type",
        type_name::<T>(),
    );
}
