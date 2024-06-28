use std::any::Any;

use unsize::Coercion;

/// Attempt to downcast a `triomphe::Arc<dyn Any + Send + Sync>` to a concrete
/// type.
///
/// Ported from [`std::sync::Arc::downcast`] to [`triomphe::Arc`].
pub fn downcast_triomphe_arc<T: Any + Send + Sync>(
    this: triomphe::Arc<dyn Any + Send + Sync>,
) -> Result<triomphe::Arc<T>, triomphe::Arc<dyn Any + Send + Sync>> {
    if (*this).is::<T>() {
        unsafe {
            // Get the pointer to the offset (*const T) inside of the ArcInner.
            let ptr = triomphe::Arc::into_raw(this);
            // SAFETY: The negative offset from the data (ptr) in an Arc to the start of the
            // data structure is fixed regardless of type `T`.
            //
            // SAFETY: Casting from a fat pointer to a thin pointer is safe, as long as the
            // types are compatible (they are).
            Ok(triomphe::Arc::from_raw(ptr.cast()))
        }
    } else {
        Err(this)
    }
}

/// [`Coerce::to_any`] except that it coerces to `dyn Any + Send + Sync` as
/// opposed to `dyn Any`.
pub fn coerce_to_any_send_sync<T: Any + Send + Sync>() -> Coercion<T, dyn Any + Send + Sync> {
    // SAFETY: The signature of this function guarantees the coercion is valid
    unsafe { Coercion::new(|x| x) }
}
