use std::cell::UnsafeCell;

/// A mutably borrowed slice whose elements can be written from multiple threads, as long as each
/// element is written at most once while the slice is shared.
///
/// Distinct elements are distinct memory locations, so writes from different threads to different
/// elements never race or tear, even when `T` is a single byte. This is the same guarantee that
/// makes sending the halves of `split_at_mut` to different threads sound. The elements are wrapped
/// in [`UnsafeCell`] because they are mutated through a shared reference.
pub(crate) struct ConcurrentSlice<'l, T> {
    data: &'l [UnsafeCell<T>],
}

// SAFETY: Through a shared `ConcurrentSlice`, other threads move `T` values into the slice and drop
// the values they replace, which requires `T: Send`. It never hands out references to elements, so
// it doesn't require `T: Sync`. Callers of `write` guarantee that no element is accessed by two
// threads.
unsafe impl<T: Send> Send for ConcurrentSlice<'_, T> {}
// SAFETY: See above.
unsafe impl<T: Send> Sync for ConcurrentSlice<'_, T> {}

impl<'l, T> ConcurrentSlice<'l, T> {
    pub(crate) fn new(slice: &'l mut [T]) -> Self {
        let len = slice.len();
        // SAFETY: `UnsafeCell<T>` has the same memory layout as `T` (it is `#[repr(transparent)]`),
        // and the pointer comes from a mutable borrow of `len` elements that lasts for `'l`, so no
        // other access to the elements exists while `data` is alive.
        let data =
            unsafe { std::slice::from_raw_parts(slice.as_mut_ptr().cast::<UnsafeCell<T>>(), len) };
        Self { data }
    }

    /// Replaces the element at `index` with `value`, dropping the previous value. Panics if
    /// `index` is out of bounds.
    ///
    /// # Safety
    ///
    /// Each `index` must be written at most once while `self` is shared, so no two threads access
    /// the same element.
    pub(crate) unsafe fn write(&self, index: usize, value: T) {
        let cell = &self.data[index];
        // SAFETY: The caller guarantees that no other access to this element happens concurrently.
        unsafe { *cell.get() = value };
    }
}

#[cfg(test)]
mod tests {
    use crate::concurrent_slice::ConcurrentSlice;

    #[test]
    fn writes_from_multiple_threads() {
        const LEN: usize = 64;
        // The previous values are boxed, so leaking or double-dropping them is detected by Miri.
        let mut values: Vec<Option<Box<usize>>> = vec![Some(Box::new(usize::MAX)); LEN];
        let writer = ConcurrentSlice::new(&mut values);
        std::thread::scope(|scope| {
            for thread in 0..4 {
                let writer = &writer;
                scope.spawn(move || {
                    for index in (thread..LEN).step_by(4) {
                        // SAFETY: Each thread writes a distinct residue class of indices.
                        unsafe { writer.write(index, Some(Box::new(index))) };
                    }
                });
            }
        });
        for (index, value) in values.iter().enumerate() {
            assert_eq!(value.as_deref(), Some(&index));
        }
    }

    #[test]
    fn writes_adjacent_bytes_from_multiple_threads() {
        const LEN: usize = 64;
        let mut values = [0u8; LEN];
        let writer = ConcurrentSlice::new(&mut values);
        std::thread::scope(|scope| {
            for thread in 0..4 {
                let writer = &writer;
                scope.spawn(move || {
                    // Adjacent bytes are written by different threads.
                    for index in (thread..LEN).step_by(4) {
                        // SAFETY: Each thread writes a distinct residue class of indices.
                        unsafe { writer.write(index, index as u8 + 1) };
                    }
                });
            }
        });
        for (index, &value) in values.iter().enumerate() {
            assert_eq!(value, index as u8 + 1);
        }
    }

    #[test]
    #[should_panic]
    fn write_out_of_bounds_panics() {
        let mut values = [0u32; 4];
        let writer = ConcurrentSlice::new(&mut values);
        // SAFETY: No other write happens.
        unsafe { writer.write(4, 1) };
    }
}
