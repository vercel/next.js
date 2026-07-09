//! A bounded small-vector used to back the `List` variant of [`crate::AutoMap`].
//!
//! This is functionally a `SmallVec<[T; I]>` that is *bounded* at
//! [`MAX_LIST_SIZE`](crate::MAX_LIST_SIZE) elements (`AutoMap` converts `List`
//! -> `Map` before it would ever exceed that), but with a much smaller header:
//!
//! * `SmallVec` stores a `usize` length **and**, in its spilled representation, a heap pointer plus
//!   a `usize` capacity. Three `usize`s of header.
//! * Because the element count never exceeds `MAX_LIST_SIZE` (32), both the length and the capacity
//!   fit in a `u8`. `InlineVec` stores `len: NonZeroU8` and `cap: u8` — two bytes of header — and
//!   overlaps the inline array with the heap pointer in a union.
//!
//! The length is stored as `NonZeroU8` (holding `actual_len + 1`) so that `0`
//! is a forbidden bit pattern. That niche lets the enclosing `AutoMap` enum
//! fold its `List`/`Map` discriminant in for free — no separate tag word. For
//! example `AutoMap<TaskId, (), _, 3>` (a `NonZero`-keyed set) shrinks from 32
//! bytes with `SmallVec` to 24, and `AutoMap<TaskId, (), _, 0>` to 16.
//!
//! # Representation
//! * `cap == I`: elements live inline in `data.inline[..len]`.
//! * `cap > I`: elements live on the heap at `data.heap[..len]`, in an allocation of `cap`
//!   elements. Only reachable once more than `I` elements are inserted; capped at `MAX_LIST_SIZE`.

use std::{
    alloc::{self, Layout},
    fmt::Debug,
    mem::{ManuallyDrop, MaybeUninit},
    num::NonZeroU8,
    ptr::{self, NonNull},
    slice::{Iter, IterMut},
};

use crate::MAX_LIST_SIZE;

union Data<T, const I: usize> {
    inline: ManuallyDrop<[MaybeUninit<T>; I]>,
    /// Valid only when `cap > I`; points to an allocation of `cap` elements.
    heap: NonNull<T>,
}

/// Bounded small-vector; see the module docs.
pub struct InlineVec<T, const I: usize> {
    /// `actual_len + 1`. Always in `1..=MAX_LIST_SIZE+1`; never `0` (the niche).
    len: NonZeroU8,
    /// Current capacity. `I` while inline, `> I` (and `<= MAX_LIST_SIZE`) while
    /// spilled to the heap.
    cap: u8,
    data: Data<T, I>,
}

// SAFETY: `InlineVec<T>` owns its `T`s (inline or in a private heap allocation),
// so it is `Send`/`Sync` exactly when `T` is, just like `Vec<T>`.
unsafe impl<T: Send, const I: usize> Send for InlineVec<T, I> {}
unsafe impl<T: Sync, const I: usize> Sync for InlineVec<T, I> {}

impl<T, const I: usize> InlineVec<T, I> {
    /// Compile-time guards. Referenced from every constructor so violations fail
    /// to compile rather than corrupting the `len`/`cap` bytes at runtime.
    const ASSERT: () = {
        assert!(
            I <= MAX_LIST_SIZE,
            "InlineVec inline capacity I must be <= MAX_LIST_SIZE"
        );
        assert!(
            MAX_LIST_SIZE < u8::MAX as usize,
            "MAX_LIST_SIZE must fit in NonZeroU8 with the +1 offset",
        );
    };

    /// Stored length representing an empty vec (`actual_len == 0`).
    const EMPTY_LEN: NonZeroU8 = match NonZeroU8::new(1) {
        Some(n) => n,
        None => unreachable!(),
    };

    #[inline]
    pub const fn new() -> Self {
        let () = Self::ASSERT;
        Self {
            len: Self::EMPTY_LEN,
            cap: I as u8,
            data: Data {
                inline: ManuallyDrop::new([const { MaybeUninit::uninit() }; I]),
            },
        }
    }

    /// Allocate with room for at least `capacity` elements (clamped to
    /// `MAX_LIST_SIZE`). Stays inline when `capacity <= I`.
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        let () = Self::ASSERT;
        if capacity <= I {
            return Self::new();
        }
        let cap = capacity.min(MAX_LIST_SIZE);
        let heap = Self::alloc(cap);
        Self {
            len: Self::EMPTY_LEN,
            cap: cap as u8,
            data: Data { heap },
        }
    }

    #[inline]
    const fn is_spilled(&self) -> bool {
        self.cap as usize > I
    }

    #[inline]
    pub const fn len(&self) -> usize {
        (self.len.get() - 1) as usize
    }

    #[inline]
    pub const fn is_empty(&self) -> bool {
        self.len.get() == 1
    }

    #[inline]
    pub const fn capacity(&self) -> usize {
        self.cap as usize
    }

    /// # Safety
    /// `actual` must be `<= self.capacity()` and the first `actual` elements
    /// must be initialized.
    #[inline]
    unsafe fn set_len(&mut self, actual: usize) {
        debug_assert!(actual <= self.capacity());
        debug_assert!(actual <= MAX_LIST_SIZE);
        // actual <= MAX_LIST_SIZE <= 254 => actual + 1 in 1..=255, never zero.
        self.len = unsafe { NonZeroU8::new_unchecked((actual as u8).wrapping_add(1)) };
    }

    /// Pointer to element storage (inline or heap), valid for `len` reads.
    #[inline]
    fn as_ptr(&self) -> *const T {
        if self.is_spilled() {
            // SAFETY: spilled => `heap` is the active union field.
            unsafe { self.data.heap.as_ptr() as *const T }
        } else {
            // SAFETY: inline => `inline` is the active union field.
            unsafe { (*ptr::addr_of!(self.data.inline)).as_ptr().cast::<T>() }
        }
    }

    #[inline]
    fn as_mut_ptr(&mut self) -> *mut T {
        if self.is_spilled() {
            // SAFETY: spilled => `heap` is the active union field.
            unsafe { self.data.heap.as_ptr() }
        } else {
            // SAFETY: inline => `inline` is the active union field.
            unsafe {
                (*ptr::addr_of_mut!(self.data.inline))
                    .as_mut_ptr()
                    .cast::<T>()
            }
        }
    }

    #[inline]
    pub fn as_slice(&self) -> &[T] {
        // SAFETY: first `len()` elements are initialized (type invariant).
        unsafe { std::slice::from_raw_parts(self.as_ptr(), self.len()) }
    }

    #[inline]
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        let len = self.len();
        // SAFETY: first `len` elements are initialized (type invariant).
        unsafe { std::slice::from_raw_parts_mut(self.as_mut_ptr(), len) }
    }

    #[inline]
    pub fn iter(&self) -> Iter<'_, T> {
        self.as_slice().iter()
    }

    #[inline]
    pub fn iter_mut(&mut self) -> IterMut<'_, T> {
        self.as_mut_slice().iter_mut()
    }

    #[inline]
    pub fn last_mut(&mut self) -> Option<&mut T> {
        self.as_mut_slice().last_mut()
    }

    // ---- allocation helpers -------------------------------------------------

    #[inline]
    fn layout(cap: usize) -> Layout {
        Layout::array::<T>(cap).expect("InlineVec allocation layout overflow")
    }

    /// Free a heap buffer previously returned by [`Self::alloc`]. No-op for a
    /// ZST `T` (where `alloc` returned a dangling pointer).
    ///
    /// # Safety
    /// `ptr` must have come from `Self::alloc(cap)` and not been freed yet.
    #[inline]
    unsafe fn dealloc(ptr: NonNull<T>, cap: usize) {
        let layout = Self::layout(cap);
        if layout.size() == 0 {
            return;
        }
        // SAFETY: `ptr`/`layout` match a live allocation from `alloc` (caller
        // guarantee); non-ZST so it was really allocated.
        unsafe { alloc::dealloc(ptr.as_ptr() as *mut u8, layout) }
    }

    /// Allocate an uninitialized heap buffer of `cap` (`> 0`) elements. For a
    /// zero-sized `T` returns a dangling-but-aligned pointer (no allocation);
    /// element reads/writes on a ZST touch no memory.
    fn alloc(cap: usize) -> NonNull<T> {
        debug_assert!(cap > 0);
        let layout = Self::layout(cap);
        if layout.size() == 0 {
            // ZST `T`: no real allocation needed.
            return NonNull::dangling();
        }
        // SAFETY: `layout` has non-zero size (checked above).
        let ptr = unsafe { alloc::alloc(layout) } as *mut T;
        match NonNull::new(ptr) {
            Some(p) => p,
            None => alloc::handle_alloc_error(layout),
        }
    }

    /// Ensure capacity for at least one more element, spilling inline -> heap or
    /// growing the heap allocation as needed. Never exceeds `MAX_LIST_SIZE`
    /// (callers guarantee they stop before that).
    fn grow(&mut self) {
        let old_cap = self.capacity();
        debug_assert!(
            old_cap < MAX_LIST_SIZE,
            "InlineVec grown past MAX_LIST_SIZE"
        );
        // Growth schedule: jump off inline capacity, then double, clamped.
        let new_cap = (old_cap.max(1) * 2).clamp(I + 1, MAX_LIST_SIZE);
        let len = self.len();

        let new_heap = Self::alloc(new_cap);
        // Move existing elements into the new allocation.
        // SAFETY: source holds `len` initialized elements; dest has room for
        // `new_cap >= len`. Regions don't overlap (fresh allocation).
        unsafe {
            ptr::copy_nonoverlapping(self.as_ptr(), new_heap.as_ptr(), len);
        }
        if self.is_spilled() {
            // Free the old heap buffer (elements already moved out).
            // SAFETY: old buffer was allocated by `alloc` with `old_cap`.
            unsafe {
                let old = self.data.heap;
                Self::dealloc(old, old_cap);
            }
        }
        // else: inline storage needs no deallocation.
        self.data = Data { heap: new_heap };
        self.cap = new_cap as u8;
    }

    #[inline]
    pub fn push(&mut self, value: T) {
        let len = self.len();
        debug_assert!(len < MAX_LIST_SIZE, "InlineVec pushed past MAX_LIST_SIZE");
        if len == self.capacity() {
            self.grow();
        }
        // SAFETY: `len < capacity` now; slot `len` is uninitialized.
        unsafe {
            self.as_mut_ptr().add(len).write(value);
            self.set_len(len + 1);
        }
    }

    /// Swap-remove the element at `index` (order not preserved, matching the
    /// unordered `List` backing an `AutoSet`/`AutoMap`).
    #[inline]
    pub fn swap_remove(&mut self, index: usize) -> T {
        let len = self.len();
        assert!(index < len, "index out of bounds: {index} >= {len}");
        let ptr = self.as_mut_ptr();
        // SAFETY: element `index` is initialized; `len-1` is the last valid idx.
        unsafe {
            let out = ptr.add(index).read();
            if index != len - 1 {
                let last = ptr.add(len - 1).read();
                ptr.add(index).write(last);
            }
            self.set_len(len - 1);
            out
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        let len = self.len();
        // SAFETY: first `len` elements are initialized; drop them and reset.
        unsafe {
            ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(self.as_mut_ptr(), len));
            self.set_len(0);
        }
    }

    /// Drop the heap allocation if spilled (used by `Drop` and when converting
    /// back to inline). Does **not** drop elements — caller handles those.
    #[inline]
    unsafe fn dealloc_if_spilled(&mut self) {
        if self.is_spilled() {
            let cap = self.capacity();
            // SAFETY: heap buffer was allocated by `alloc` with `cap` elements.
            unsafe {
                Self::dealloc(self.data.heap, cap);
            }
        }
    }

    /// Shrink a spilled buffer back to inline storage when it fits, or to a
    /// tighter heap allocation. No-op when already inline.
    pub fn shrink_to_fit(&mut self) {
        if !self.is_spilled() {
            return;
        }
        let len = self.len();
        if len <= I {
            // Move elements back inline.
            let mut inline: [MaybeUninit<T>; I] = [const { MaybeUninit::uninit() }; I];
            // SAFETY: heap holds `len <= I` initialized elements; copy them into
            // the inline array, then free the heap buffer.
            unsafe {
                ptr::copy_nonoverlapping(
                    self.data.heap.as_ptr(),
                    inline.as_mut_ptr().cast::<T>(),
                    len,
                );
                let old = self.data.heap;
                let old_cap = self.capacity();
                self.data = Data {
                    inline: ManuallyDrop::new(inline),
                };
                self.cap = I as u8;
                Self::dealloc(old, old_cap);
            }
        } else if self.capacity() > len {
            // Reallocate the heap buffer to exactly `len`.
            let new_heap = Self::alloc(len);
            // SAFETY: move `len` elements to the tighter buffer, free the old.
            unsafe {
                ptr::copy_nonoverlapping(self.data.heap.as_ptr(), new_heap.as_ptr(), len);
                let old = self.data.heap;
                let old_cap = self.capacity();
                Self::dealloc(old, old_cap);
                self.data = Data { heap: new_heap };
                self.cap = len as u8;
            }
        }
    }

    /// Remove all elements and yield them by value, leaving `self` empty.
    #[inline]
    pub fn drain(&mut self) -> Drain<'_, T, I> {
        let end = self.len();
        // Logically empty now; `Drain` owns the elements and drops any it does
        // not yield (panic safety). Storage (inline/heap) stays as-is.
        // SAFETY: 0 <= capacity.
        unsafe { self.set_len(0) };
        Drain {
            vec: self,
            idx: 0,
            end,
        }
    }
}

impl<T, const I: usize> Default for InlineVec<T, I> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const I: usize> Drop for InlineVec<T, I> {
    #[inline]
    fn drop(&mut self) {
        let len = self.len();
        // SAFETY: first `len` elements are initialized; drop them, then free
        // any heap allocation.
        unsafe {
            ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(self.as_mut_ptr(), len));
            self.dealloc_if_spilled();
        }
    }
}

impl<T: Clone, const I: usize> Clone for InlineVec<T, I> {
    fn clone(&self) -> Self {
        let mut out = Self::with_capacity(self.len());
        for v in self.iter() {
            out.push(v.clone());
        }
        out
    }
}

impl<T: Debug, const I: usize> Debug for InlineVec<T, I> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(self.iter()).finish()
    }
}

impl<T, const I: usize> std::ops::Deref for InlineVec<T, I> {
    type Target = [T];
    #[inline]
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

impl<T, const I: usize> std::ops::DerefMut for InlineVec<T, I> {
    #[inline]
    fn deref_mut(&mut self) -> &mut [T] {
        self.as_mut_slice()
    }
}

impl<'a, T, const I: usize> IntoIterator for &'a InlineVec<T, I> {
    type Item = &'a T;
    type IntoIter = Iter<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'a, T, const I: usize> IntoIterator for &'a mut InlineVec<T, I> {
    type Item = &'a mut T;
    type IntoIter = IterMut<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter_mut()
    }
}

/// By-value iterator returned by [`InlineVec::into_iter`].
pub struct IntoIter<T, const I: usize> {
    vec: InlineVec<T, I>,
    idx: usize,
    end: usize,
}

impl<T, const I: usize> Iterator for IntoIter<T, I> {
    type Item = T;
    #[inline]
    fn next(&mut self) -> Option<T> {
        if self.idx == self.end {
            return None;
        }
        // SAFETY: element `idx` is still initialized and not yet yielded.
        let v = unsafe { self.vec.as_ptr().add(self.idx).read() };
        self.idx += 1;
        Some(v)
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let rem = self.end - self.idx;
        (rem, Some(rem))
    }
}

impl<T, const I: usize> ExactSizeIterator for IntoIter<T, I> {}

impl<T, const I: usize> Drop for IntoIter<T, I> {
    fn drop(&mut self) {
        // Drop not-yet-yielded elements; the inner `vec` (len already 0) then
        // frees any heap allocation without double-dropping.
        // SAFETY: elements `[idx, end)` are initialized and unyielded.
        unsafe {
            let base = self.vec.as_mut_ptr();
            ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(
                base.add(self.idx),
                self.end - self.idx,
            ));
        }
    }
}

impl<T, const I: usize> IntoIterator for InlineVec<T, I> {
    type Item = T;
    type IntoIter = IntoIter<T, I>;
    #[inline]
    fn into_iter(mut self) -> Self::IntoIter {
        let end = self.len();
        // Prevent `InlineVec::drop` from dropping elements; `IntoIter` owns them
        // now. The heap buffer (if any) is freed by `IntoIter`'s inner `vec`.
        // SAFETY: 0 <= capacity.
        unsafe { self.set_len(0) };
        IntoIter {
            vec: self,
            idx: 0,
            end,
        }
    }
}

impl<T, const I: usize> FromIterator<T> for InlineVec<T, I> {
    fn from_iter<It: IntoIterator<Item = T>>(iter: It) -> Self {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        let mut out = Self::with_capacity(lower);
        for v in iter {
            out.push(v);
        }
        out
    }
}

impl<T, const I: usize> Extend<T> for InlineVec<T, I> {
    #[inline]
    fn extend<It: IntoIterator<Item = T>>(&mut self, iter: It) {
        for v in iter {
            self.push(v);
        }
    }
}

/// Draining iterator returned by [`InlineVec::drain`].
pub struct Drain<'a, T, const I: usize> {
    vec: &'a mut InlineVec<T, I>,
    idx: usize,
    end: usize,
}

impl<T, const I: usize> Iterator for Drain<'_, T, I> {
    type Item = T;
    #[inline]
    fn next(&mut self) -> Option<T> {
        if self.idx == self.end {
            return None;
        }
        // SAFETY: element `idx` is initialized and unyielded (vec len is 0).
        let v = unsafe { self.vec.as_ptr().add(self.idx).read() };
        self.idx += 1;
        Some(v)
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let rem = self.end - self.idx;
        (rem, Some(rem))
    }
}

impl<T, const I: usize> ExactSizeIterator for Drain<'_, T, I> {}

impl<T, const I: usize> Drop for Drain<'_, T, I> {
    fn drop(&mut self) {
        // SAFETY: elements `[idx, end)` are initialized and unyielded.
        unsafe {
            let base = self.vec.as_mut_ptr();
            ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(
                base.add(self.idx),
                self.end - self.idx,
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, mem::size_of, num::NonZeroU32, rc::Rc};

    use super::*;
    use crate::MAX_LIST_SIZE;

    /// Enum mirroring `AutoMap`'s layout, to assert the `NonZeroU8` niche folds
    /// the discriminant in (enum size == inline-vec size, no extra tag word).
    #[allow(dead_code)]
    enum MapLike<T, const I: usize> {
        List(InlineVec<T, I>),
        Map(Box<u32>),
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn niche_and_sizes() {
        type Tid = NonZeroU32;
        // The whole point: enum is no bigger than the List payload.
        assert_eq!(size_of::<InlineVec<(Tid, ()), 3>>(), 24);
        assert_eq!(size_of::<MapLike<(Tid, ()), 3>>(), 24, "niche not folded");
        assert_eq!(size_of::<MapLike<(Tid, ()), 0>>(), 16);
        assert_eq!(size_of::<MapLike<(Tid, ()), 6>>(), 32);
    }

    #[test]
    fn push_spill_and_back() {
        let mut v: InlineVec<u32, 3> = InlineVec::new();
        assert_eq!(v.capacity(), 3);
        // Fill inline.
        for i in 0..3 {
            v.push(i);
        }
        assert_eq!(v.capacity(), 3);
        assert_eq!(v.as_slice(), &[0, 1, 2]);
        // Spill to heap.
        for i in 3..20 {
            v.push(i);
        }
        assert_eq!(v.len(), 20);
        assert!(v.capacity() > 3 && v.capacity() <= MAX_LIST_SIZE);
        let got: Vec<u32> = v.iter().copied().collect();
        assert_eq!(got, (0..20).collect::<Vec<_>>());
        // Shrink back below inline threshold.
        while v.len() > 2 {
            v.swap_remove(v.len() - 1);
        }
        v.shrink_to_fit();
        assert_eq!(v.capacity(), 3, "should return to inline storage");
        assert_eq!(v.len(), 2);
    }

    #[test]
    fn swap_remove_semantics() {
        let mut v: InlineVec<u32, 4> = InlineVec::new();
        v.extend([10, 20, 30, 40]);
        assert_eq!(v.swap_remove(1), 20); // 40 moves into slot 1
        let mut got: Vec<u32> = v.iter().copied().collect();
        got.sort();
        assert_eq!(got, vec![10, 30, 40]);
    }

    #[test]
    fn drains_and_reuses() {
        let mut v: InlineVec<u32, 2> = InlineVec::new();
        v.extend([1, 2, 3, 4, 5]); // spilled
        let drained: Vec<u32> = v.drain().collect();
        assert_eq!(drained, vec![1, 2, 3, 4, 5]);
        assert!(v.is_empty());
        // Reuse after drain (storage retained).
        v.push(99);
        assert_eq!(v.as_slice(), &[99]);
    }

    // --- drop accounting: every element dropped exactly once, no leaks ---

    struct DropTok(Rc<Cell<i32>>);
    impl DropTok {
        fn new(c: &Rc<Cell<i32>>) -> Self {
            c.set(c.get() + 1);
            Self(c.clone())
        }
    }
    impl Drop for DropTok {
        fn drop(&mut self) {
            self.0.set(self.0.get() - 1);
        }
    }

    fn assert_balanced(f: impl FnOnce(&Rc<Cell<i32>>)) {
        let live = Rc::new(Cell::new(0));
        f(&live);
        assert_eq!(live.get(), 0, "unbalanced drops (leak or double free)");
    }

    #[test]
    fn drop_paths() {
        // plain drop, inline
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 4> = InlineVec::new();
            v.push(DropTok::new(c));
            v.push(DropTok::new(c));
        });
        // plain drop, spilled
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 2> = InlineVec::new();
            for _ in 0..10 {
                v.push(DropTok::new(c));
            }
        });
        // clear
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 2> = InlineVec::new();
            for _ in 0..6 {
                v.push(DropTok::new(c));
            }
            v.clear();
            assert!(v.is_empty());
        });
        // partial into_iter then drop (spilled)
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 2> = InlineVec::new();
            for _ in 0..6 {
                v.push(DropTok::new(c));
            }
            let mut it = v.into_iter();
            drop(it.next());
            drop(it.next());
            // remaining 4 dropped when `it` drops
        });
        // partial drain then drop
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 4> = InlineVec::new();
            for _ in 0..3 {
                v.push(DropTok::new(c));
            }
            let mut d = v.drain();
            drop(d.next());
            drop(d); // remaining 2
        });
        // swap_remove returns and drops
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 4> = InlineVec::new();
            for _ in 0..4 {
                v.push(DropTok::new(c));
            }
            let x = v.swap_remove(0);
            drop(x);
            // 3 remain, dropped with v
        });
        // shrink_to_fit heap->inline preserves elements
        assert_balanced(|c| {
            let mut v: InlineVec<DropTok, 3> = InlineVec::new();
            for _ in 0..8 {
                v.push(DropTok::new(c));
            }
            while v.len() > 2 {
                drop(v.swap_remove(0));
            }
            v.shrink_to_fit();
            assert_eq!(v.capacity(), 3);
            assert_eq!(v.len(), 2);
        });
    }

    #[test]
    fn clone_matches() {
        let mut v: InlineVec<u32, 2> = InlineVec::new();
        v.extend([1, 2, 3, 4]); // spilled
        let c = v.clone();
        assert_eq!(
            v.iter().copied().collect::<Vec<_>>(),
            c.iter().copied().collect::<Vec<_>>()
        );
    }

    #[test]
    fn zst_elements() {
        // ZST must never touch the allocator, even when "spilled".
        let mut v: InlineVec<(), 1> = InlineVec::new();
        for _ in 0..10 {
            v.push(());
        }
        assert_eq!(v.len(), 10);
        assert_eq!(v.iter().count(), 10);
        v.clear();
        assert!(v.is_empty());
    }
}
