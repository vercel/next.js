//! [`ConcurrentSlice`]: a slice whose elements can be written from multiple threads, each at most
//! once, e.g. to collect results of parallel work in their original order.
//!
//! The elements live in a [`ConcurrentSliceStorage`]: a borrowed `&mut [T]` for threads that finish
//! before the borrow ends (e.g. scoped threads), or an owned `Box<[T]>` / `Vec<T>` for `'static`
//! workers that share the slice through an `Arc` (e.g. spawned async tasks).

use std::{cell::UnsafeCell, mem::ManuallyDrop, ops::Deref};

/// Storage of the elements of a [`ConcurrentSlice`].
///
/// [`into_cells`] turns the storage into a form that gives shared access to the elements as
/// [`UnsafeCell`]s, so that [`ConcurrentSlice::write`] can replace them through a shared reference,
/// and [`from_cells`] turns it back.
///
/// # Safety
///
/// - [`into_cells`] must return cells that are exactly the storage's elements, in order, and
///   nothing else may access the elements while the [`Cells`] exist, except through the cells.
/// - [`from_cells`] must return the storage of the elements, given cells returned by
///   [`into_cells`].
/// - Dereferencing the [`Cells`] must always return the same slice (same pointer and length).
/// - `ConcurrentSlice` only accesses the elements through [`ConcurrentSlice::write`] (which callers
///   guarantee never touches an element from two threads at once) and by dropping or returning the
///   cells when it is owned. Under that access discipline:
///   - when `Self: Send`, moving the [`Cells`] to another thread and dropping or converting them
///     back there must be sound, even if the `Cells` type itself isn't `Send` (e.g.
///     `&[UnsafeCell<T>]` never is);
///   - when `Self::Item: Send`, dereferencing the same [`Cells`] from multiple threads at the same
///     time must be sound.
///
///   `ConcurrentSlice`'s `Send` and `Sync` implementations rely on this.
///
/// [`into_cells`]: ConcurrentSliceStorage::into_cells
/// [`from_cells`]: ConcurrentSliceStorage::from_cells
/// [`Cells`]: ConcurrentSliceStorage::Cells
pub unsafe trait ConcurrentSliceStorage: Sized {
    type Item;
    type Cells: Deref<Target = [UnsafeCell<Self::Item>]>;

    fn into_cells(self) -> Self::Cells;

    /// # Safety
    ///
    /// `cells` must have been returned by [`into_cells`] of this storage type, and no other access
    /// to them may exist.
    ///
    /// [`into_cells`]: ConcurrentSliceStorage::into_cells
    unsafe fn from_cells(cells: Self::Cells) -> Self;
}

// SAFETY: The cells are the borrowed elements, and the mutable borrow guarantees that nothing else
// accesses them for `'l`. Dereferencing a shared slice reference is a pure read of the pointer and
// length, so it always returns the same slice and is sound from any thread. Moving the cells to
// another thread is equivalent to moving the `&'l mut [T]` there, which is sound when `T: Send`,
// i.e. when `&'l mut [T]: Send`.
unsafe impl<'l, T> ConcurrentSliceStorage for &'l mut [T] {
    type Item = T;
    type Cells = &'l [UnsafeCell<T>];

    fn into_cells(self) -> Self::Cells {
        let len = self.len();
        // SAFETY: `UnsafeCell<T>` has the same memory layout as `T` (it is `#[repr(transparent)]`),
        // and the pointer comes from a mutable borrow of `len` elements that lasts for `'l`.
        unsafe { std::slice::from_raw_parts(self.as_mut_ptr().cast::<UnsafeCell<T>>(), len) }
    }

    unsafe fn from_cells(cells: Self::Cells) -> Self {
        // SAFETY: `cells` came from `into_cells`, i.e. from a mutable borrow for `'l` that has no
        // other access, so turning it back into a mutable borrow is sound. Same layout as above.
        unsafe {
            std::slice::from_raw_parts_mut(cells.as_ptr().cast_mut().cast::<T>(), cells.len())
        }
    }
}

// SAFETY: The box owns the elements and is moved into the cells, so nothing else can access them.
// Dereferencing a box is a pure read of its pointer and length, so it always returns the same
// slice and is sound from any thread. Moving the cells to another thread is equivalent to moving
// the `Box<[T]>` there, which is sound when `T: Send`.
unsafe impl<T> ConcurrentSliceStorage for Box<[T]> {
    type Item = T;
    type Cells = Box<[UnsafeCell<T>]>;

    fn into_cells(self) -> Self::Cells {
        // SAFETY: `UnsafeCell<T>` has the same memory layout as `T`, so the allocation of `[T]` is
        // a valid allocation of `[UnsafeCell<T>]` with the same length and layout.
        unsafe { Box::from_raw(Box::into_raw(self) as *mut [UnsafeCell<T>]) }
    }

    unsafe fn from_cells(cells: Self::Cells) -> Self {
        // SAFETY: Same layout as above.
        unsafe { Box::from_raw(Box::into_raw(cells) as *mut [T]) }
    }
}

// SAFETY: Same as for `Box<[T]>`. The capacity is kept, so no reallocation happens.
unsafe impl<T> ConcurrentSliceStorage for Vec<T> {
    type Item = T;
    type Cells = Vec<UnsafeCell<T>>;

    fn into_cells(self) -> Self::Cells {
        let mut vec = ManuallyDrop::new(self);
        // SAFETY: `UnsafeCell<T>` has the same memory layout as `T`, so the allocation is a valid
        // allocation of `UnsafeCell<T>`s with the same length and capacity. `vec` isn't dropped,
        // so the allocation is owned by the returned `Vec` only.
        unsafe {
            Vec::from_raw_parts(
                vec.as_mut_ptr().cast::<UnsafeCell<T>>(),
                vec.len(),
                vec.capacity(),
            )
        }
    }

    unsafe fn from_cells(cells: Self::Cells) -> Self {
        let mut cells = ManuallyDrop::new(cells);
        // SAFETY: Same as above.
        unsafe {
            Vec::from_raw_parts(
                cells.as_mut_ptr().cast::<T>(),
                cells.len(),
                cells.capacity(),
            )
        }
    }
}

/// A slice whose elements can be written from multiple threads, as long as each element is written
/// at most once while the slice is shared.
///
/// The elements are stored in `S`, e.g. a borrowed `&mut [T]` or an owned `Box<[T]>` or `Vec<T>`
/// (see [`ConcurrentSliceStorage`]). [`into_inner`] returns the storage.
///
/// Every element is always initialized: the storage holds initialized elements, and [`write`]
/// replaces an element, dropping the previous value. So a `ConcurrentSlice` can be dropped at any
/// time, e.g. when only some elements were written because a worker panicked or was cancelled,
/// and dropping an owning one drops every element exactly once. To find out which elements were
/// written, use an element type like `Option<T>` that starts as `None`.
///
/// [`into_inner`]: ConcurrentSlice::into_inner
/// [`write`]: ConcurrentSlice::write
pub struct ConcurrentSlice<S: ConcurrentSliceStorage> {
    // No `Drop` impl: dropping the cells drops the storage, and `into_inner` moves them out.
    cells: S::Cells,
}

// SAFETY: Moving a `ConcurrentSlice` to another thread moves the storage's cells. That is sound
// when `S: Send` (required by `ConcurrentSliceStorage`), as `ConcurrentSlice` only accesses the
// elements through `write` and by dropping or returning the cells.
unsafe impl<S: ConcurrentSliceStorage + Send> Send for ConcurrentSlice<S> {}
// SAFETY: Through a shared `ConcurrentSlice`, other threads move `S::Item` values into the slice
// and drop the values they replace, which requires `S::Item: Send`. It never hands out references
// to elements, so it doesn't require `S::Item: Sync`. Dereferencing the cells from multiple threads
// is sound when `S::Item: Send` (required by `ConcurrentSliceStorage`). Callers of `write`
// guarantee that no element is accessed by two threads. Distinct elements are distinct memory
// locations, so writes from different threads to different elements never race or tear, even when
// an element is a single byte. This is the same guarantee that makes sending the halves of
// `split_at_mut` to different threads sound.
unsafe impl<S: ConcurrentSliceStorage> Sync for ConcurrentSlice<S> where S::Item: Send {}

impl<S: ConcurrentSliceStorage> ConcurrentSlice<S> {
    pub fn new(storage: S) -> Self {
        Self {
            cells: storage.into_cells(),
        }
    }

    pub fn len(&self) -> usize {
        self.cells.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }

    /// Replaces the element at `index` with `value`, dropping the previous value. Panics if
    /// `index` is out of bounds.
    ///
    /// # Safety
    ///
    /// Each `index` must be written at most once while `self` is shared, so no two threads access
    /// the same element.
    pub unsafe fn write(&self, index: usize, value: S::Item) {
        let cell = &self.cells[index];
        // SAFETY: The caller guarantees that no other access to this element happens concurrently.
        unsafe { *cell.get() = value };
    }

    /// Returns the storage. Taking `self` by value guarantees that no write is in progress.
    pub fn into_inner(self) -> S {
        // SAFETY: The cells came from `S::into_cells`, and `self` is owned, so no other access to
        // them exists.
        unsafe { S::from_cells(self.cells) }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use crate::ConcurrentSlice;

    #[test]
    fn writes_from_multiple_threads() {
        const LEN: usize = 64;
        // The previous values are boxed, so leaking or double-dropping them is detected by Miri.
        let mut values: Vec<Option<Box<usize>>> = vec![Some(Box::new(usize::MAX)); LEN];
        let writer = ConcurrentSlice::new(values.as_mut_slice());
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
        let writer = ConcurrentSlice::new(&mut values[..]);
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
    fn into_inner_returns_the_borrow() {
        let mut values = [0u32; 4];
        let writer = ConcurrentSlice::new(&mut values[..]);
        // SAFETY: No other write happens.
        unsafe { writer.write(2, 7) };
        let slice = writer.into_inner();
        slice[3] = 9;
        assert_eq!(values, [0, 0, 7, 9]);
    }

    #[test]
    #[should_panic]
    fn write_out_of_bounds_panics() {
        let mut values = [0u32; 4];
        let writer = ConcurrentSlice::new(&mut values[..]);
        // SAFETY: No other write happens.
        unsafe { writer.write(4, 1) };
    }

    /// Writes every index from 4 `'static` threads sharing the slice through an `Arc`, then returns
    /// the storage.
    fn write_all_from_static_threads<S>(storage: S) -> S
    where
        S: crate::ConcurrentSliceStorage<Item = Option<Box<usize>>> + Send + Sync + 'static,
    {
        let writer = Arc::new(ConcurrentSlice::new(storage));
        let len = writer.len();
        let threads = (0..4)
            .map(|thread| {
                let writer = writer.clone();
                std::thread::spawn(move || {
                    for index in (thread..len).step_by(4) {
                        // SAFETY: Each thread writes a distinct residue class of indices.
                        unsafe { writer.write(index, Some(Box::new(index))) };
                    }
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            thread.join().unwrap();
        }
        Arc::into_inner(writer).unwrap().into_inner()
    }

    #[test]
    fn owned_box_writes_from_static_threads() {
        const LEN: usize = 64;
        let values = write_all_from_static_threads(vec![None; LEN].into_boxed_slice());
        assert_eq!(values.len(), LEN);
        for (index, value) in values.iter().enumerate() {
            assert_eq!(value.as_deref(), Some(&index));
        }
    }

    #[test]
    fn owned_vec_writes_from_static_threads_and_keeps_capacity() {
        const LEN: usize = 64;
        let mut values = Vec::with_capacity(LEN * 2);
        values.resize(LEN, None);
        let ptr = values.as_ptr();
        let values = write_all_from_static_threads(values);
        assert_eq!(values.len(), LEN);
        assert_eq!(values.capacity(), LEN * 2);
        assert_eq!(values.as_ptr(), ptr, "the allocation is reused");
        for (index, value) in values.iter().enumerate() {
            assert_eq!(value.as_deref(), Some(&index));
        }
    }

    /// Counts drops, so tests can check that every value is dropped exactly once. Miri additionally
    /// detects leaks and double drops of the boxed payload.
    struct Tracked {
        _payload: Box<usize>,
        drops: Arc<AtomicUsize>,
    }

    impl Tracked {
        fn new(value: usize, drops: &Arc<AtomicUsize>) -> Self {
            Self {
                _payload: Box::new(value),
                drops: drops.clone(),
            }
        }
    }

    impl Drop for Tracked {
        fn drop(&mut self) {
            self.drops.fetch_add(1, Ordering::Relaxed);
        }
    }

    #[test]
    fn owned_drops_every_element_once_when_partially_written() {
        const LEN: usize = 16;
        let drops = Arc::new(AtomicUsize::new(0));
        let values: Box<[Option<Tracked>]> = (0..LEN)
            .map(|index| (index == 5).then(|| Tracked::new(5, &drops)))
            .collect();
        let writer = ConcurrentSlice::new(values);
        // Write only some elements, one of them replacing an initial value.
        // SAFETY: Each index is written once.
        unsafe {
            writer.write(1, Some(Tracked::new(1, &drops)));
            writer.write(5, Some(Tracked::new(55, &drops)));
        }
        assert_eq!(
            drops.load(Ordering::Relaxed),
            1,
            "the replaced value is dropped"
        );
        // Dropped without `into_inner`, as when the owner is cancelled.
        drop(writer);
        assert_eq!(drops.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn owned_drops_every_element_once_after_a_writer_panics() {
        const LEN: usize = 64;
        let drops = Arc::new(AtomicUsize::new(0));
        let values: Vec<Option<Tracked>> = (0..LEN).map(|_| None).collect();
        let writer = Arc::new(ConcurrentSlice::new(values));
        let threads = (0..4)
            .map(|thread| {
                let writer = writer.clone();
                let drops = drops.clone();
                std::thread::spawn(move || {
                    for index in (thread..LEN).step_by(4) {
                        if thread == 0 && index >= LEN / 2 {
                            panic!("writer panics after writing some elements");
                        }
                        // SAFETY: Each thread writes a distinct residue class of indices.
                        unsafe { writer.write(index, Some(Tracked::new(index, &drops))) };
                    }
                })
            })
            .collect::<Vec<_>>();
        let panicked = threads
            .into_iter()
            .map(|thread| thread.join().is_err())
            .filter(|&panicked| panicked)
            .count();
        assert_eq!(panicked, 1);
        // Thread 0 wrote the indices `0, 4, .., 28`, the other threads all of theirs.
        let written = LEN / 4 / 2 + 3 * (LEN / 4);
        assert_eq!(drops.load(Ordering::Relaxed), 0);
        drop(writer);
        assert_eq!(drops.load(Ordering::Relaxed), written);
    }

    #[test]
    fn owned_outlives_its_creator_and_drops_every_element_once() {
        const LEN: usize = 8;
        let drops = Arc::new(AtomicUsize::new(0));
        let values: Vec<Option<Tracked>> = (0..LEN).map(|_| None).collect();
        let writer = Arc::new(ConcurrentSlice::new(values));
        let (start, started) = std::sync::mpsc::channel::<()>();
        let worker = {
            let writer = writer.clone();
            let drops = drops.clone();
            std::thread::spawn(move || {
                started.recv().unwrap();
                for index in 0..LEN / 2 {
                    // SAFETY: Only this thread writes, each index once.
                    unsafe { writer.write(index, Some(Tracked::new(index, &drops))) };
                }
                // The last reference is dropped here.
            })
        };
        // The creator gives up its reference before the worker writes, as when the owner of a
        // detached worker is cancelled.
        drop(writer);
        start.send(()).unwrap();
        worker.join().unwrap();
        assert_eq!(drops.load(Ordering::Relaxed), LEN / 2);
    }

    #[test]
    #[should_panic]
    fn owned_write_out_of_bounds_panics() {
        let writer = ConcurrentSlice::new(vec![0u32; 4].into_boxed_slice());
        // SAFETY: No other write happens.
        unsafe { writer.write(4, 1) };
    }
}
