//! A minimal growable vector ([`BumpVec`]) backed by a bump allocator.
//!
//! `JsValue` analysis allocates all of its nodes into a per-thread [`Bump`](bumpalo::Bump) that is
//! freed in one shot when analysis finishes. For the list children that grow or are rebuilt after
//! construction, this module provides [`BumpVec`]: a `Send`/`Sync` growable vector that stores a
//! raw pointer into the arena, a capacity, and a length.

use std::{
    alloc::Layout,
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
    ptr::{self, NonNull},
};

use allocator_api2::alloc::Allocator;
use bumpalo::Bump;

/// A minimal growable vector for the list children of a `JsValue` that grow or are rebuilt after
/// construction (e.g. `Array.items`, `Object.parts`, `Alternatives.values`, `Add` operands, and the
/// `Call`/`MemberCall` lists).
///
/// It owns its `T` elements like `Vec<T>` but stores them through a raw pointer into the arena,
/// alongside a capacity and a length. The raw pointer makes it neither `Send` nor `Sync` on its
/// own, so those are declared via `unsafe impl` (sound because it owns the `T`s exactly like a
/// `Vec<T>`). The growth methods take the `&'a Bump` to allocate from.
pub struct BumpVec<'a, T> {
    /// Points at `cap` allocated (possibly uninitialized) `T` slots; dangling when `cap == 0`.
    ptr: NonNull<T>,
    cap: usize,
    len: usize,
    /// Binds the arena lifetime and signals ownership/variance over `T` to the compiler.
    _marker: PhantomData<&'a ()>,
}

// SAFETY: `BumpVec` owns its `T` elements just like `Vec<T>`; the raw pointer is merely an owning
// handle into the arena, so it is `Send`/`Sync` exactly when `T` is.
unsafe impl<T: Send> Send for BumpVec<'_, T> {}
unsafe impl<T: Sync> Sync for BumpVec<'_, T> {}

impl<T> Default for BumpVec<'_, T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a, T> BumpVec<'a, T> {
    pub fn new() -> Self {
        Self {
            ptr: NonNull::dangling(),
            cap: 0,
            len: 0,
            _marker: PhantomData,
        }
    }

    /// Allocate room for `cap` uninitialized `T` slots from the arena, or a dangling pointer when
    /// `cap == 0` (no allocation needed).
    fn alloc_uninitialized(bump: &'a Bump, cap: usize) -> NonNull<T> {
        if cap == 0 {
            return NonNull::dangling();
        }
        let layout = Layout::array::<T>(cap).expect("capacity overflow");
        bump.allocate(layout)
            .expect("bump allocation failed")
            .cast::<T>()
    }

    pub fn with_capacity_in(bump: &'a Bump, capacity: usize) -> Self {
        Self {
            ptr: Self::alloc_uninitialized(bump, capacity),
            cap: capacity,
            len: 0,
            _marker: PhantomData,
        }
    }

    /// Collect `iter` into a growable [`BumpVec`].
    pub fn from_iter_in(bump: &'a Bump, iter: impl IntoIterator<Item = T>) -> Self {
        let iter = iter.into_iter();
        let mut vec =
            Self::with_capacity_in(bump, iter.size_hint().1.unwrap_or(iter.size_hint().0));
        vec.extend(bump, iter);
        vec
    }

    /// Reallocate the buffer to `new_cap` elements (`new_cap >= len`), moving the live prefix into
    /// the new arena allocation. The old buffer is abandoned (the arena frees it in bulk); when it
    /// is the arena's most recent allocation, [`Allocator::grow`] extends it in place.
    unsafe fn realloc_to(&mut self, bump: &'a Bump, new_cap: usize) {
        debug_assert!(new_cap >= self.len);
        let new_layout = Layout::array::<T>(new_cap).expect("capacity overflow");
        let new_ptr = if self.cap == 0 {
            // Nothing allocated yet, so there is no prior block to grow from.
            bump.allocate(new_layout)
        } else {
            let old_layout = Layout::array::<T>(self.cap).expect("capacity overflow");
            // SAFETY: `ptr`/`old_layout` describe the current arena buffer and `new_layout` is
            // strictly larger, so growing it (and moving the bytes) is sound.

            // re: ptr must denote a block of memory currently allocated via this allocator.
            // While, this is not true, Bumpalo's implementation of `grow()` does not rely on
            // this. Instead, a new pointer in the `bump` that `grow()` was called on is
            // returned even if that was not the `bump` this vector was originally allocated
            // in. This is relevant to us as we wrap Bump in ThreadLocal<>, therefore, different
            // threads have different bumps.

            // See the `grow_across_separate_bumps()` test.

            unsafe { bump.grow(self.ptr.cast::<u8>(), old_layout, new_layout) }
        }
        .expect("bump allocation failed")
        .cast::<T>();
        self.ptr = new_ptr;
        self.cap = new_cap;
    }

    pub fn push(&mut self, bump: &'a Bump, value: T) {
        if self.len == self.cap {
            unsafe { self.realloc_to(bump, if self.cap == 0 { 4 } else { self.cap * 2 }) };
        }
        // SAFETY: slot `len < cap` is allocated and uninitialized; write the value into it.
        unsafe { self.ptr.as_ptr().add(self.len).write(value) };
        self.len += 1;
    }

    /// Ensure there is room for at least `additional` more elements, growing the arena buffer
    /// (in one allocation) if necessary.
    pub fn reserve(&mut self, bump: &'a Bump, additional: usize) {
        let required = self.len + additional;
        if required > self.cap {
            unsafe { self.realloc_to(bump, required.max(self.cap * 2)) };
        }
    }

    pub fn extend(&mut self, bump: &'a Bump, iter: impl IntoIterator<Item = T>) {
        let iter = iter.into_iter();
        // Reserve the lower bound returned by `size_hint()`;
        // `push` still grows further if the hint is an underestimate.
        self.reserve(bump, iter.size_hint().1.unwrap_or(iter.size_hint().0));
        for value in iter {
            self.push(bump, value);
        }
    }

    /// Append a clone of every element in `other`, reserving the needed capacity up front.
    pub fn extend_from_slice(&mut self, bump: &'a Bump, other: &[T])
    where
        T: Clone,
    {
        self.reserve(bump, other.len());
        for value in other {
            // SAFETY: the reservation above guarantees slot `len < cap` is allocated; incrementing
            // `len` per write keeps the vec consistent if `T::clone` panics mid-loop.
            unsafe { self.ptr.as_ptr().add(self.len).write(value.clone()) };
            self.len += 1;
        }
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        // SAFETY: index `len` was initialized; move it out and logically shrink.
        Some(unsafe { self.ptr.as_ptr().add(self.len).read() })
    }

    /// Remove the element at `index` and return it, moving the last element into its slot. This
    /// does not preserve element order but is O(1). Panics if `index` is out of bounds.
    pub fn swap_remove(&mut self, index: usize) -> T {
        assert!(index < self.len, "swap_remove index out of bounds");
        // Move the last item into the slot and return the displaced one.
        let last = self.pop().unwrap();
        if index < self.len {
            std::mem::replace(&mut self[index], last)
        } else {
            last
        }
    }

    /// Split the vec in two at `at`: `self` retains the prefix `[0, at)` and the returned vec owns
    /// the suffix `[at, len)`, moved into a fresh arena allocation.
    pub fn split_off(&mut self, bump: &'a Bump, at: usize) -> Self {
        assert!(at <= self.len, "split_off index out of bounds");
        let tail_len = self.len - at;
        let mut tail = Self::with_capacity_in(bump, tail_len);
        // SAFETY: indices `[at, len)` are initialized and `tail` is a fresh, non-overlapping
        // allocation; move the suffix into it bytewise.
        unsafe {
            ptr::copy_nonoverlapping(self.ptr.as_ptr().add(at), tail.ptr.as_ptr(), tail_len);
        }
        tail.len = tail_len;
        self.len = at;
        tail
    }
}

impl<T> Deref for BumpVec<'_, T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        // SAFETY: `0..len` is initialized and `ptr` is valid for that range (dangling-but-aligned
        // when `len == 0`, which `from_raw_parts` accepts).
        unsafe { std::slice::from_raw_parts(self.ptr.as_ptr(), self.len) }
    }
}

impl<T> DerefMut for BumpVec<'_, T> {
    fn deref_mut(&mut self) -> &mut [T] {
        // SAFETY: see `deref`.
        unsafe { std::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len) }
    }
}

impl<T> Drop for BumpVec<'_, T> {
    fn drop(&mut self) {
        // SAFETY: `0..len` is initialized; drop each element (the arena only frees memory).
        unsafe { ptr::drop_in_place(&mut **self) }
    }
}

impl<'a, T> IntoIterator for BumpVec<'a, T> {
    type Item = T;
    type IntoIter = IntoIter<'a, T>;
    fn into_iter(self) -> IntoIter<'a, T> {
        // Disable `Drop` (it would also drop the elements) and take over the buffer.
        let me = ManuallyDrop::new(self);
        IntoIter {
            ptr: me.ptr,
            len: me.len,
            idx: 0,
            _marker: PhantomData,
        }
    }
}

impl<'b, T> IntoIterator for &'b BumpVec<'_, T> {
    type Item = &'b T;
    type IntoIter = std::slice::Iter<'b, T>;
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'b, T> IntoIterator for &'b mut BumpVec<'_, T> {
    type Item = &'b mut T;
    type IntoIter = std::slice::IterMut<'b, T>;
    fn into_iter(self) -> Self::IntoIter {
        self.iter_mut()
    }
}

impl<T: PartialEq> PartialEq for BumpVec<'_, T> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}
impl<T: Eq> Eq for BumpVec<'_, T> {}
impl<T: Hash> Hash for BumpVec<'_, T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        (**self).hash(state)
    }
}
impl<T: fmt::Debug> fmt::Debug for BumpVec<'_, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&**self, f)
    }
}

/// By-value iterator returned from [`BumpVec::into_iter`]. Owns the arena buffer's elements and
/// drops any unconsumed remainder on `Drop`.
pub struct IntoIter<'a, T> {
    ptr: NonNull<T>,
    len: usize,
    idx: usize,
    _marker: PhantomData<&'a ()>,
}

// SAFETY: like `BumpVec`, `IntoIter` owns its `T` elements behind a raw pointer.
unsafe impl<T: Send> Send for IntoIter<'_, T> {}
unsafe impl<T: Sync> Sync for IntoIter<'_, T> {}

impl<T> Iterator for IntoIter<'_, T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        if self.idx == self.len {
            return None;
        }
        // SAFETY: index `idx < len` is initialized and yielded at most once.
        let value = unsafe { self.ptr.as_ptr().add(self.idx).read() };
        self.idx += 1;
        Some(value)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.len - self.idx;
        (remaining, Some(remaining))
    }
}

impl<T> ExactSizeIterator for IntoIter<'_, T> {}

impl<T> Drop for IntoIter<'_, T> {
    fn drop(&mut self) {
        // SAFETY: indices `[idx, len)` are still initialized; drop them in place exactly once.
        unsafe {
            ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(
                self.ptr.as_ptr().add(self.idx),
                self.len - self.idx,
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cell::Cell,
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
        rc::Rc,
    };

    use bumpalo::Bump;

    use super::BumpVec;

    #[test]
    fn push_grows_and_indexes() {
        let bump = Bump::new();
        let mut v = BumpVec::new();
        assert!(v.is_empty());
        // Grows well past the initial capacity, exercising several reallocations.
        for i in 0..100 {
            v.push(&bump, i);
        }
        assert_eq!(v.len(), 100);
        assert_eq!(&*v, &(0..100).collect::<Vec<_>>()[..]);
        assert_eq!(v[42], 42);
    }

    #[test]
    fn with_capacity_extend_and_from_iter() {
        let bump = Bump::new();
        let mut v = BumpVec::with_capacity_in(&bump, 4);
        assert!(v.is_empty());
        v.extend(&bump, [1, 2, 3]);
        assert_eq!(&*v, &[1, 2, 3][..]);

        let v2 = BumpVec::from_iter_in(&bump, [10, 20, 30, 40]);
        assert_eq!(&*v2, &[10, 20, 30, 40][..]);
    }

    #[test]
    fn extend_from_slice() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2]);
        // Appends onto existing contents, growing past the current capacity.
        v.extend_from_slice(&bump, &[3, 4, 5]);
        assert_eq!(&*v, &[1, 2, 3, 4, 5][..]);
        // Extending by an empty slice is a no-op.
        v.extend_from_slice(&bump, &[]);
        assert_eq!(&*v, &[1, 2, 3, 4, 5][..]);
        // Works on a freshly-constructed empty vec too.
        let mut empty = BumpVec::new();
        empty.extend_from_slice(&bump, &[7, 8, 9]);
        assert_eq!(&*empty, &[7, 8, 9][..]);
    }

    /// Confirms the cross-arena `grow()` behavior documented in `realloc_to`: a buffer allocated in
    /// one `Bump` can be grown by calling `grow()` on a *different* `Bump`. Bumpalo never treats
    /// the foreign pointer as its most-recent allocation, so it falls back to allocating fresh
    /// in the target arena and copying the bytes over — the contents survive intact.
    #[test]
    fn grow_across_separate_bumps() {
        let bump1 = Bump::new();
        let bump2 = Bump::new();

        // Allocate and fill to capacity entirely within `bump1`.
        let mut v = BumpVec::with_capacity_in(&bump1, 2);
        v.push(&bump1, 1);
        v.push(&bump1, 2);

        // The vec is now full, so this push reallocates via `bump2.grow(ptr, ..)` where `ptr` lives
        // in `bump1`. The prior elements must be moved across to `bump2` unharmed.
        v.push(&bump2, 3);
        v.push(&bump2, 4);
        v.push(&bump2, 5);
        assert_eq!(&*v, &[1, 2, 3, 4, 5][..]);

        // The buffer now lives in `bump2`; further growth on `bump2` keeps everything consistent.
        v.extend(&bump2, 6..=10);
        assert_eq!(&*v, &(1..=10).collect::<Vec<_>>()[..]);
    }

    /// Same cross-arena grow, but with a drop-tracked element type to prove nothing is dropped or
    /// duplicated when the buffer is copied from one arena to another.
    #[test]
    fn grow_across_separate_bumps_does_not_drop_during_move() {
        let bump1 = Bump::new();
        let bump2 = Bump::new();
        let counter = Rc::new(Cell::new(0));

        let mut v = BumpVec::with_capacity_in(&bump1, 2);
        v.push(&bump1, DropCounter(counter.clone()));
        v.push(&bump1, DropCounter(counter.clone()));
        // Cross-arena reallocation moves (does not drop) the existing elements.
        v.push(&bump2, DropCounter(counter.clone()));
        assert_eq!(counter.get(), 0);

        drop(v);
        assert_eq!(counter.get(), 3);
    }

    #[test]
    fn pop() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2, 3]);
        assert_eq!(v.pop(), Some(3));
        assert_eq!(v.pop(), Some(2));
        assert_eq!(v.pop(), Some(1));
        assert_eq!(v.pop(), None);
        assert!(v.is_empty());
    }

    #[test]
    fn swap_remove() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2, 3, 4, 5]);
        // Removing a middle element moves the last element into its slot.
        assert_eq!(v.swap_remove(1), 2);
        assert_eq!(&*v, &[1, 5, 3, 4][..]);
        // Removing the last element is just a pop.
        assert_eq!(v.swap_remove(3), 4);
        assert_eq!(&*v, &[1, 5, 3][..]);
        // Removing the first element.
        assert_eq!(v.swap_remove(0), 1);
        assert_eq!(&*v, &[3, 5][..]);
    }

    #[test]
    #[should_panic(expected = "swap_remove index out of bounds")]
    fn swap_remove_out_of_bounds() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2, 3]);
        v.swap_remove(3);
    }

    #[test]
    fn swap_remove_does_not_double_free() {
        let bump = Bump::new();
        let counter = Rc::new(Cell::new(0));
        let mut v = BumpVec::new();
        for _ in 0..3 {
            v.push(&bump, DropCounter(counter.clone()));
        }
        let removed = v.swap_remove(0);
        drop(removed);
        assert_eq!(counter.get(), 1);
        // The two remaining drop exactly once; the removed slot must not be dropped again.
        drop(v);
        assert_eq!(counter.get(), 3);
    }

    #[test]
    fn split_off_prefix_and_suffix() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2, 3, 4, 5]);
        let tail = v.split_off(&bump, 2);
        assert_eq!(&*v, &[1, 2][..]);
        assert_eq!(&*tail, &[3, 4, 5][..]);

        // Split at `len` yields an empty tail.
        let mut v = BumpVec::from_iter_in(&bump, [1, 2]);
        let tail = v.split_off(&bump, 2);
        assert_eq!(&*v, &[1, 2][..]);
        assert!(tail.is_empty());

        // Split at `0` empties `self`.
        let mut v = BumpVec::from_iter_in(&bump, [1, 2]);
        let tail = v.split_off(&bump, 0);
        assert!(v.is_empty());
        assert_eq!(&*tail, &[1, 2][..]);
    }

    #[test]
    fn iterates_by_ref_mut_and_value() {
        let bump = Bump::new();
        let mut v = BumpVec::from_iter_in(&bump, [1, 2, 3]);

        let sum: i32 = (&v).into_iter().copied().sum();
        assert_eq!(sum, 6);

        for x in &mut v {
            *x *= 2;
        }
        assert_eq!(&*v, &[2, 4, 6][..]);

        let collected: Vec<i32> = v.into_iter().collect();
        assert_eq!(collected, vec![2, 4, 6]);
    }

    #[test]
    fn eq_hash_and_debug() {
        let bump = Bump::new();
        let a = BumpVec::from_iter_in(&bump, [1, 2, 3]);
        let b = BumpVec::from_iter_in(&bump, [1, 2, 3]);
        let c = BumpVec::from_iter_in(&bump, [1, 2]);
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(format!("{a:?}"), "[1, 2, 3]");

        let mut ha = DefaultHasher::new();
        let mut hb = DefaultHasher::new();
        a.hash(&mut ha);
        b.hash(&mut hb);
        assert_eq!(ha.finish(), hb.finish());
    }

    /// Increments a shared counter when dropped, to prove elements are dropped exactly once (the
    /// arena reclaims memory but never drops contents, so `BumpVec` must).
    struct DropCounter(Rc<Cell<usize>>);
    impl Drop for DropCounter {
        fn drop(&mut self) {
            self.0.set(self.0.get() + 1);
        }
    }

    #[test]
    fn drops_each_element_exactly_once() {
        let bump = Bump::new();
        let counter = Rc::new(Cell::new(0));
        {
            let mut v = BumpVec::new();
            for _ in 0..10 {
                v.push(&bump, DropCounter(counter.clone()));
            }
            // Reallocations move elements (never drop them), so nothing has dropped yet.
            assert_eq!(counter.get(), 0);
        }
        assert_eq!(counter.get(), 10);
    }

    #[test]
    fn into_iter_drops_unconsumed_remainder() {
        let bump = Bump::new();
        let counter = Rc::new(Cell::new(0));
        let mut v = BumpVec::new();
        for _ in 0..5 {
            v.push(&bump, DropCounter(counter.clone()));
        }
        let mut iter = v.into_iter();
        drop(iter.next());
        drop(iter.next());
        assert_eq!(counter.get(), 2);
        drop(iter); // the remaining three must drop exactly once
        assert_eq!(counter.get(), 5);
    }

    #[test]
    fn pop_does_not_double_free() {
        let bump = Bump::new();
        let counter = Rc::new(Cell::new(0));
        let mut v = BumpVec::new();
        for _ in 0..3 {
            v.push(&bump, DropCounter(counter.clone()));
        }
        let popped = v.pop().unwrap();
        drop(popped);
        assert_eq!(counter.get(), 1);
        // Dropping the vec drops the two remaining; the popped slot must not be dropped again.
        drop(v);
        assert_eq!(counter.get(), 3);
    }
}
