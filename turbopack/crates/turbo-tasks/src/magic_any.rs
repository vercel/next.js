use std::{
    any::{Any, type_name},
    fmt::Debug,
    hash::Hash,
};

use turbo_dyn_eq_hash::{
    DynEq, DynHash, impl_eq_for_dyn, impl_hash_for_dyn, impl_partial_eq_for_dyn,
};

use crate::trace::TraceRawVcs;

pub trait MagicAny: Debug + DynEq + DynHash + TraceRawVcs + Send + Sync + 'static {
    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str;
}

impl<T> MagicAny for T
where
    T: Debug + Eq + Hash + Send + Sync + TraceRawVcs + 'static,
{
    #[cfg(debug_assertions)]
    fn magic_type_name(&self) -> &'static str {
        std::any::type_name::<T>()
    }
}

impl_partial_eq_for_dyn!(dyn MagicAny);
impl_eq_for_dyn!(dyn MagicAny);
impl_hash_for_dyn!(dyn MagicAny);

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
/// the argument via [`as_ref`](StackMagicAny::as_ref) for hash/equality lookups,
/// avoiding any heap allocation. On cache miss, [`take_box`](StackMagicAny::take_box)
/// moves the value into a `Box` with zero clones.
pub trait StackMagicAny {
    /// Borrow the argument as a type-erased reference (for cache lookup).
    fn as_ref(&self) -> &dyn MagicAny;
    /// Move the argument out into a heap-allocated Box (panics if already taken).
    fn take_box(&mut self) -> Box<dyn MagicAny>;
    /// Downcast to `&mut dyn Any` for concrete type recovery without boxing.
    fn as_any_mut(&mut self) -> &mut dyn Any;
}

/// Stack-resident slot wrapping a concrete typed value.
///
/// Created by macro-generated callsites. The value starts in `Some` on the
/// stack; [`take_box`](StackMagicAny::take_box) moves it to the heap on cache miss.
#[repr(transparent)]
pub struct StackMagicAnySlot<T> {
    slot: Option<T>,
}

impl<T> StackMagicAnySlot<T> {
    #[inline]
    pub fn new(value: T) -> Self {
        Self { slot: Some(value) }
    }

    #[inline]
    pub fn take(&mut self) -> T {
        self.slot
            .take()
            .expect("StackMagicAnySlot::take called after value was already taken")
    }
}

impl<T: MagicAny> StackMagicAny for StackMagicAnySlot<T> {
    #[inline]
    fn as_ref(&self) -> &dyn MagicAny {
        self.slot
            .as_ref()
            .expect("StackMagicAnySlot::as_ref called after take_box")
    }

    #[inline]
    fn take_box(&mut self) -> Box<dyn MagicAny> {
        Box::new(
            self.slot
                .take()
                .expect("StackMagicAnySlot::take_box called twice"),
        )
    }

    #[inline]
    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}

/// Adapter for an already-boxed value (e.g., from async resolution tasks).
pub struct OwnedMagicAny {
    slot: Option<Box<dyn MagicAny>>,
}

impl OwnedMagicAny {
    #[inline]
    pub fn new(value: Box<dyn MagicAny>) -> Self {
        Self { slot: Some(value) }
    }
}

impl StackMagicAny for OwnedMagicAny {
    #[inline]
    fn as_ref(&self) -> &dyn MagicAny {
        &**self
            .slot
            .as_ref()
            .expect("OwnedMagicAny::as_ref called after take_box")
    }

    #[inline]
    fn take_box(&mut self) -> Box<dyn MagicAny> {
        self.slot
            .take()
            .expect("OwnedMagicAny::take_box called twice")
    }

    #[inline]
    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}
