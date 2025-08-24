use std::any::Any;

use unsize::Coercion;

/// Attempt to downcast a [`triomphe::Arc<dyn Any + Send +
/// Sync>`][`triomphe::Arc`] to a concrete type.
///
/// Checks that the downcast is safe using [`Any::is`].
///
/// Ported from [`std::sync::Arc::downcast`] to [`triomphe::Arc`].
pub fn downcast_triomphe_arc<T: Any + Send + Sync>(
    this: triomphe::Arc<dyn Any + Send + Sync>,
) -> Result<triomphe::Arc<T>, triomphe::Arc<dyn Any + Send + Sync>> {
    if (*this).is::<T>() {
        unsafe { Ok(unchecked_sidecast_triomphe_arc(this)) }
    } else {
        Err(this)
    }
}

/// Transmutes the contents of `Arc<T>` to `Arc<U>`. Updates the `Arc`'s fat
/// pointer metadata.
///
/// Unlike [`downcast_triomphe_arc`] this make no checks the transmute is safe.
///
/// # Safety
///
/// It must be [safe to transmute][transmutes] from `T` to `U`.
///
/// [transmutes]: https://doc.rust-lang.org/nomicon/transmutes.html
pub unsafe fn unchecked_sidecast_triomphe_arc<T, U>(this: triomphe::Arc<T>) -> triomphe::Arc<U>
where
    T: ?Sized,
{
    unsafe {
        // Get the pointer to the offset (*const T) inside of the ArcInner.
        let ptr = triomphe::Arc::into_raw(this);
        // SAFETY: The negative offset from the data (ptr) in an Arc to the start of the
        // data structure is fixed regardless of type `T`.
        //
        // SAFETY: Casting from a fat pointer to a thin pointer is safe, as long as the
        // types are compatible (they are).
        triomphe::Arc::from_raw(ptr.cast())
    }
}

/// [`Coercion::to_any`] except that it coerces to `dyn Any + Send + Sync` as
/// opposed to `dyn Any`.
pub fn coerce_to_any_send_sync<T: Any + Send + Sync>() -> Coercion<T, dyn Any + Send + Sync> {
    // SAFETY: The signature of this function guarantees the coercion is valid
    unsafe { Coercion::new(|x| x) }
}
