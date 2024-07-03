use std::{marker::PhantomData, mem::ManuallyDrop};

use anyhow::Result;

use crate::{backend::CellContent, ReadRef, TraitRef, VcRead, VcValueTrait, VcValueType};

/// Trait defined to share behavior between values and traits within
/// [`ReadRawVcFuture`][crate::ReadRawVcFuture]. See [`VcValueTypeCast`] and
/// [`VcValueTraitCast`].
///
/// This trait is sealed and cannot be implemented by users.
pub trait VcCast: private::Sealed {
    type Output;

    fn cast(content: CellContent) -> Result<Self::Output>;
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

    fn cast(content: CellContent) -> Result<Self::Output> {
        Ok(
            // Safety: the `VcValueType` implementor must guarantee that both `T` and
            // `Repr` are #[repr(transparent)].
            unsafe {
                // Downcast the cell content to the expected representation type, then
                // transmute it to the expected type.
                // See https://users.rust-lang.org/t/transmute-doesnt-work-on-generic-types/87272/9
                std::mem::transmute_copy::<
                    ManuallyDrop<ReadRef<<T::Read as VcRead<T>>::Repr>>,
                    Self::Output,
                >(&ManuallyDrop::new(
                    content.cast::<<T::Read as VcRead<T>>::Repr>()?,
                ))
            },
        )
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

    fn cast(content: CellContent) -> Result<Self::Output> {
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
