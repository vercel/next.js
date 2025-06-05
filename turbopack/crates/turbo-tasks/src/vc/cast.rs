use std::marker::PhantomData;

use anyhow::Result;

use crate::{ReadRef, TraitRef, VcValueTrait, VcValueType, backend::TypedCellContent};

/// Trait defined to share behavior between values and traits within
/// [`ReadRawVcFuture`][crate::ReadRawVcFuture]. See [`VcValueTypeCast`] and
/// [`VcValueTraitCast`].
///
/// This trait is sealed and cannot be implemented by users.
pub trait VcCast: private::Sealed {
    type Output;

    fn cast(content: TypedCellContent) -> Result<Self::Output>;
}

/// Casts an arbitrary cell content into a [`ReadRef<T>`].
pub struct VcValueTypeCast<T> {
    _phantom: PhantomData<T>,
}

impl<T> VcCast for VcValueTypeCast<T>
where
    T: VcValueType,
{
    type Output = ReadRef<T>;

    fn cast(content: TypedCellContent) -> Result<Self::Output> {
        content.cast()
    }
}

/// Casts an arbitrary cell content into a [`TraitRef<T>`].
pub struct VcValueTraitCast<T>
where
    T: ?Sized,
{
    _phantom: PhantomData<T>,
}

impl<T> VcCast for VcValueTraitCast<T>
where
    T: VcValueTrait + ?Sized,
{
    type Output = TraitRef<T>;

    fn cast(content: TypedCellContent) -> Result<Self::Output> {
        // Safety: Constructor ensures the cell content points to a value that
        // implements T
        content.cast_trait::<T>()
    }
}

// Implement the sealed trait pattern for `VcCast`.
// https://rust-lang.github.io/api-guidelines/future-proofing.html
mod private {
    use super::{VcValueTraitCast, VcValueTypeCast};
    use crate::{VcValueTrait, VcValueType};

    pub trait Sealed {}
    impl<T> Sealed for VcValueTypeCast<T> where T: VcValueType {}
    impl<T> Sealed for VcValueTraitCast<T> where T: VcValueTrait + ?Sized {}
}
