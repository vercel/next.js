//! A minimal growable vector ([`BumpVec`]) backed by a bump allocator.
//!
//! `JsValue` analysis allocates all of its nodes into a per-thread [`Bump`](bumpalo::Bump) that is
//! freed in one shot when analysis finishes. For the list children that grow or are rebuilt after
//! construction, this module provides [`BumpVec`]: a `Send`/`Sync` growable vector that stores
//! nothing but an arena-allocated buffer and a length, with no `unsafe impl`.

use std::{
    fmt,
    hash::{Hash, Hasher},
    mem::{ManuallyDrop, MaybeUninit},
    ops::{Deref, DerefMut},
    ptr,
};

use bumpalo::Bump;

/// A minimal growable vector for the list children of a `JsValue` that grow or are rebuilt after
/// construction (e.g. `Array.items`, `Object.parts`, `Alternatives.values`, `Add` operands, and the
/// `Call`/`MemberCall` lists).
///
/// It holds nothing but an arena-allocated buffer and a length, so it is `Send`/`Sync` (a
/// `&'a mut [T]` is, when `T` is) with no `unsafe impl`. The growth methods take the `&'a Bump` to
/// allocate from. The only `unsafe` here is the localized `MaybeUninit` bookkeeping every growable
/// buffer needs.
pub struct BumpVec<'a, T> {
    buf: &'a mut [MaybeUninit<T>],
    len: usize,
}

impl<T> Default for BumpVec<'_, T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<'a, T> BumpVec<'a, T> {
    pub fn new() -> Self {
        Self {
            buf: &mut [],
            len: 0,
        }
    }

    pub fn with_capacity_in(bump: &'a Bump, capacity: usize) -> Self {
        Self {
            buf: bump.alloc_slice_fill_with(capacity, |_| MaybeUninit::uninit()),
            len: 0,
        }
    }

    /// Collect `iter` into a growable [`BumpVec`].
    pub fn from_iter_in(bump: &'a Bump, iter: impl IntoIterator<Item = T>) -> Self {
        let iter = iter.into_iter();
        let mut vec = Self::with_capacity_in(bump, iter.size_hint().0);
        vec.extend(bump, iter);
        vec
    }

    /// Reallocate the buffer to `new_cap` elements (`new_cap >= len`), moving the live prefix into
    /// the fresh arena allocation. The old buffer is abandoned (the arena frees it in bulk).
    fn realloc_to(&mut self, bump: &'a Bump, new_cap: usize) {
        debug_assert!(new_cap >= self.len);
        let new_buf = bump.alloc_slice_fill_with(new_cap, |_| MaybeUninit::uninit());
        for (dst, src) in new_buf.iter_mut().zip(self.buf.iter()).take(self.len) {
            // SAFETY: the first `len` slots are initialized; move each element into the new buffer.
            unsafe { dst.write(ptr::read(src.as_ptr())) };
        }
        self.buf = new_buf;
    }

    pub fn push(&mut self, bump: &'a Bump, value: T) {
        if self.len == self.buf.len() {
            self.realloc_to(bump, if self.len == 0 { 4 } else { self.len * 2 });
        }
        self.buf[self.len].write(value);
        self.len += 1;
    }

    pub fn extend(&mut self, bump: &'a Bump, iter: impl IntoIterator<Item = T>) {
        for value in iter {
            self.push(bump, value);
        }
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        // SAFETY: index `len` was initialized; move it out and logically shrink.
        Some(unsafe { ptr::read(self.buf[self.len].as_ptr()) })
    }

    /// Split the vec in two at `at`: `self` retains the prefix `[0, at)` and the returned vec owns
    /// the suffix `[at, len)`, moved into a fresh arena allocation.
    pub fn split_off(&mut self, bump: &'a Bump, at: usize) -> Self {
        assert!(at <= self.len, "split_off index out of bounds");
        let tail_len = self.len - at;
        let mut tail = Self::with_capacity_in(bump, tail_len);
        for (dst, src) in tail.buf.iter_mut().zip(self.buf[at..self.len].iter()) {
            // SAFETY: indices `[at, len)` are initialized; move each element into `tail`.
            dst.write(unsafe { ptr::read(src.as_ptr()) });
        }
        tail.len = tail_len;
        self.len = at;
        tail
    }
}

impl<T> Deref for BumpVec<'_, T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        // SAFETY: `MaybeUninit<T>` is layout-compatible with `T`, and `0..len` is initialized.
        unsafe { std::slice::from_raw_parts(self.buf.as_ptr() as *const T, self.len) }
    }
}

impl<T> DerefMut for BumpVec<'_, T> {
    fn deref_mut(&mut self) -> &mut [T] {
        // SAFETY: see `deref`.
        unsafe { std::slice::from_raw_parts_mut(self.buf.as_mut_ptr() as *mut T, self.len) }
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
        // Disable `Drop` (it would also drop the elements) and move the buffer out.
        let me = ManuallyDrop::new(self);
        // SAFETY: we move the `&mut` buffer out of the (forgotten) `BumpVec`; it is not aliased.
        IntoIter {
            buf: unsafe { ptr::read(&me.buf) },
            len: me.len,
            idx: 0,
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

/// Yields the not-yet-consumed elements of `slice` by value, dropping any that remain on `Drop`.
fn next_owned<T>(slice: &[MaybeUninit<T>], idx: &mut usize) -> Option<T> {
    let value = slice.get(*idx)?;
    *idx += 1;
    // SAFETY: every index `< slice.len()` is initialized and yielded at most once.
    Some(unsafe { ptr::read(value.as_ptr()) })
}

fn drop_owned<T>(slice: &mut [MaybeUninit<T>], idx: usize) {
    for slot in &mut slice[idx..] {
        // SAFETY: elements not yet yielded are still initialized.
        unsafe { ptr::drop_in_place(slot.as_mut_ptr()) }
    }
}

/// By-value iterator returned from [`BumpVec::into_iter`].
pub struct IntoIter<'a, T> {
    buf: &'a mut [MaybeUninit<T>],
    len: usize,
    idx: usize,
}

impl<T> Iterator for IntoIter<'_, T> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        next_owned(&self.buf[..self.len], &mut self.idx)
    }
}

impl<T> Drop for IntoIter<'_, T> {
    fn drop(&mut self) {
        let len = self.len;
        drop_owned(&mut self.buf[..len], self.idx)
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
