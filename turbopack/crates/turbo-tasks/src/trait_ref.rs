use std::{fmt::Debug, marker::PhantomData};

use crate::{
    Vc, VcValueTrait, registry::get_value_type, task::shared_reference::TypedSharedReference,
};

/// Similar to a [`ReadRef<T>`][crate::ReadRef], but contains a value trait object instead.
///
/// Non-turbo-task methods with a `&self` receiver can be called on this reference.
///
/// A `TraitRef<T>` can be turned back into a value trait vc by calling [`TraitRef::cell`].
///
/// Internally it stores a reference counted reference to a value on the heap.
pub struct TraitRef<T>
where
    T: ?Sized,
{
    shared_reference: TypedSharedReference,
    _t: PhantomData<T>,
}

impl<T> Debug for TraitRef<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TraitRef")
            .field("shared_reference", &self.shared_reference)
            .finish()
    }
}

impl<T> Clone for TraitRef<T> {
    fn clone(&self) -> Self {
        Self {
            shared_reference: self.shared_reference.clone(),
            _t: PhantomData,
        }
    }
}

impl<T> PartialEq for TraitRef<T> {
    fn eq(&self, other: &Self) -> bool {
        self.shared_reference == other.shared_reference
    }
}

impl<T> Eq for TraitRef<T> {}

impl<T> std::hash::Hash for TraitRef<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.shared_reference.hash(state)
    }
}

impl<U> std::ops::Deref for TraitRef<Box<U>>
where
    Box<U>: VcValueTrait<ValueTrait = U>,
    U: std::ptr::Pointee<Metadata = std::ptr::DynMetadata<U>> + ?Sized,
{
    type Target = U;

    fn deref(&self) -> &Self::Target {
        // This lookup will fail if the value type stored does not actually implement the trait,
        // which implies a bug in either the registry code or the macro code.
        let downcast_ptr = <Box<U> as VcValueTrait>::IMPL_VTABLES.cast(
            self.shared_reference.type_id,
            self.shared_reference.reference.0.as_ptr() as *const (),
        );
        // SAFETY: the pointer is derived from an Arc
        unsafe { &*downcast_ptr }
    }
}

// Otherwise, TraitRef<Box<dyn Trait>> would not be Sync.
// SAFETY: TraitRef doesn't actually contain a T.
unsafe impl<T> Sync for TraitRef<T> where T: ?Sized {}

// Otherwise, TraitRef<Box<dyn Trait>> would not be Send.
// SAFETY: TraitRef doesn't actually contain a T.
unsafe impl<T> Send for TraitRef<T> where T: ?Sized {}

impl<T> Unpin for TraitRef<T> where T: ?Sized {}

impl<T> TraitRef<T>
where
    T: ?Sized,
{
    pub(crate) fn new(shared_reference: TypedSharedReference) -> Self {
        Self {
            shared_reference,
            _t: PhantomData,
        }
    }

    pub fn ptr_eq(this: &Self, other: &Self) -> bool {
        triomphe::Arc::ptr_eq(
            &this.shared_reference.reference.0,
            &other.shared_reference.reference.0,
        )
    }
}

impl<T> TraitRef<T>
where
    T: VcValueTrait + ?Sized,
{
    /// Returns a new cell that points to a value that implements the value
    /// trait `T`.
    pub fn cell(trait_ref: TraitRef<T>) -> Vc<T> {
        let TraitRef {
            shared_reference, ..
        } = trait_ref;
        let value_type = get_value_type(shared_reference.type_id);
        (value_type.raw_cell)(shared_reference).into()
    }
}
