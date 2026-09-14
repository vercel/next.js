use std::{
    any::{Any, type_name},
    fmt::Debug,
    hash::Hash,
};

use turbo_dyn_eq_hash::{
    DynEq, DynHash, impl_eq_for_dyn, impl_hash_for_dyn, impl_partial_eq_for_dyn,
};

use crate::trace::TraceRawVcs;

pub trait DynTaskInputs: Debug + DynEq + DynHash + TraceRawVcs + Send + Sync + 'static {
    #[cfg(debug_assertions)]
    fn dyn_type_name(&self) -> &'static str;
}

impl<T> DynTaskInputs for T
where
    T: Debug + Eq + Hash + Send + Sync + TraceRawVcs + 'static,
{
    #[cfg(debug_assertions)]
    fn dyn_type_name(&self) -> &'static str {
        std::any::type_name::<T>()
    }
}

impl_partial_eq_for_dyn!(dyn DynTaskInputs);
impl_eq_for_dyn!(dyn DynTaskInputs);
impl_hash_for_dyn!(dyn DynTaskInputs);

pub fn any_as_encode<T: Any>(this: &dyn Any) -> &T {
    if let Some(enc) = this.downcast_ref::<T>() {
        return enc;
    }
    unreachable!(
        "any_as_encode::<{}> called with invalid type",
        type_name::<T>()
    );
}

/// A trait for task arguments that may reside on the stack.
///
/// This enables deferred boxing: on the cache-hit path (~85%), we only borrow
/// the argument via [`as_ref`](DynTaskInputsStorage::as_ref) for hash/equality lookups,
/// avoiding any heap allocation. On cache miss, [`take_box`](DynTaskInputsStorage::take_box)
/// moves the value into a `Box` with zero clones.
pub trait DynTaskInputsStorage {
    /// Borrow the argument as a type-erased reference (for cache lookup).
    fn as_ref(&self) -> &dyn DynTaskInputs;
    /// Move the argument out into a heap-allocated Box (panics if already taken).
    fn take_box(&mut self) -> Box<dyn DynTaskInputs>;
    /// Downcast to `&mut dyn Any` for concrete type recovery without boxing.
    fn as_any_mut(&mut self) -> &mut dyn Any;
}

/// Stack-resident slot wrapping a concrete typed value.
///
/// Created by macro-generated callsites. The value starts in `Some` on the
/// stack; [`take_box`](DynTaskInputsStorage::take_box) moves it to the heap on cache miss.
#[repr(transparent)]
pub struct StackDynTaskInputsStorage<T> {
    slot: Option<T>,
}

impl<T> StackDynTaskInputsStorage<T> {
    #[inline]
    pub fn new(value: T) -> Self {
        Self { slot: Some(value) }
    }

    #[inline]
    pub fn take(&mut self) -> T {
        self.slot
            .take()
            .expect("StackDynTaskInputsStorage::take called after value was already taken")
    }
}

impl<T: DynTaskInputs> DynTaskInputsStorage for StackDynTaskInputsStorage<T> {
    #[inline]
    fn as_ref(&self) -> &dyn DynTaskInputs {
        self.slot
            .as_ref()
            .expect("StackDynTaskInputsStorage::as_ref called after take_box")
    }

    #[inline]
    fn take_box(&mut self) -> Box<dyn DynTaskInputs> {
        Box::new(
            self.slot
                .take()
                .expect("StackDynTaskInputsStorage::take_box called twice"),
        )
    }

    #[inline]
    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}

/// Adapter for an already-boxed value (e.g., from async resolution tasks).
pub struct HeapDynTaskInputsStorage {
    slot: Option<Box<dyn DynTaskInputs>>,
}

impl HeapDynTaskInputsStorage {
    #[inline]
    pub fn new(value: Box<dyn DynTaskInputs>) -> Self {
        Self { slot: Some(value) }
    }
}

impl DynTaskInputsStorage for HeapDynTaskInputsStorage {
    #[inline]
    fn as_ref(&self) -> &dyn DynTaskInputs {
        &**self
            .slot
            .as_ref()
            .expect("HeapDynTaskInputsStorage::as_ref called after take_box")
    }

    #[inline]
    fn take_box(&mut self) -> Box<dyn DynTaskInputs> {
        self.slot
            .take()
            .expect("HeapDynTaskInputsStorage::take_box called twice")
    }

    #[inline]
    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}
