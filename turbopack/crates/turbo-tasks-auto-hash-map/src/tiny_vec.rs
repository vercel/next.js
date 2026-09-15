//! A bounded small-vector with a `u8`-sized header and an optional inline
//! buffer. Backs both the `List` variant of [`crate::AutoMap`] and, with
//! `INLINE = 0`, `TaskStorage`'s lazy-fields collection.
//!
//! This is functionally a `SmallVec<[T; INLINE]>` that is *bounded* at `MAX`
//! elements, but with a much smaller header:
//!
//! * `SmallVec` stores a `usize` length **and**, in its spilled representation, a heap pointer plus
//!   a `usize` capacity. Three `usize`s of header.
//! * Because the element count never exceeds `MAX` (`<= 254`), both the length and the capacity fit
//!   in a `u8`. `TinyVec` stores `len: NonZeroU8` and `cap: u8` — two bytes of header — and
//!   overlaps the inline array with the heap pointer in a union.
//!
//! The length is stored as `NonZeroU8` (holding `actual_len + 1`) so that `0`
//! is a forbidden bit pattern. That niche lets the enclosing `AutoMap` enum
//! fold its `List`/`Map` discriminant in for free — no separate tag word. For
//! example `AutoMap<TaskId, (), _, 3>` (a `NonZero`-keyed set) shrinks from 32
//! bytes with `SmallVec` to 24, and `AutoMap<TaskId, (), _, 0>` to 16.
//!
//! # Type parameters
//! * `INLINE` — elements stored inline in the struct before spilling to the heap. `INLINE = 0` (the
//!   default) is a pure heap vector with a 2-byte header — 16 B on 64-bit, vs 24 B for `Vec`.
//! * `MAX` — hard cap on the element count. Defaults to [`MAX_LIST_SIZE`](crate::MAX_LIST_SIZE).
//!   Pushing past `MAX` panics; growth doubles until it would exceed `MAX`, then caps at exactly
//!   `MAX`.
//!
//! # Representation
//! * `cap == INLINE`: elements live inline in `data.inline[..len]`.
//! * `cap > INLINE`: elements live on the heap at `data.heap[..len]`, in an allocation of `cap`
//!   elements. Only reachable once more than `INLINE` elements are inserted; capped at `MAX`.

use std::{
    alloc::{self, Layout},
    fmt::{Debug, Formatter},
    mem::{ManuallyDrop, MaybeUninit},
    num::NonZeroU8,
    ops::{Deref, DerefMut},
    ptr::{self, NonNull, drop_in_place, slice_from_raw_parts_mut},
    slice::{Iter, IterMut},
};

use shrink_to_fit::ShrinkToFit;

union Data<T, const INLINE: usize> {
    inline: ManuallyDrop<[MaybeUninit<T>; INLINE]>,
    /// Valid only when `cap > INLINE`; points to an allocation of `cap` elements.
    heap: NonNull<T>,
}

const MAX_TINY_VEC_SIZE: usize = (u8::MAX - 1) as usize;
/// Bounded small-vector with an optional inline buffer; see the module docs.
pub struct TinyVec<T, const INLINE: usize, const MAX: usize = MAX_TINY_VEC_SIZE> {
    /// `actual_len + 1`. Always in `1..=MAX+1`; never `0` (the niche).
    len: NonZeroU8,
    /// Current capacity. `INLINE` while inline, `> INLINE` (and `<= MAX`) while
    /// spilled to the heap.
    cap: u8,
    data: Data<T, INLINE>,
}

// SAFETY: `TinyVec<T>` owns its `T`s (inline or in a private heap allocation),
// so it is `Send`/`Sync` exactly when `T` is, just like `Vec<T>`.
unsafe impl<T: Send, const INLINE: usize, const MAX: usize> Send for TinyVec<T, INLINE, MAX> {}
unsafe impl<T: Sync, const INLINE: usize, const MAX: usize> Sync for TinyVec<T, INLINE, MAX> {}

impl<T, const INLINE: usize, const MAX: usize> TinyVec<T, INLINE, MAX> {
    /// Compile-time guards. Referenced from every constructor so violations fail
    /// to compile rather than corrupting the `len`/`cap` bytes at runtime.
    const ASSERT: () = {
        assert!(MAX > 0, "TinyVec MAX must be > 0");
        assert!(
            INLINE <= MAX,
            "TinyVec inline capacity INLINE must be <= MAX"
        );
        assert!(
            MAX <= MAX_TINY_VEC_SIZE,
            "TinyVec MAX must fit in NonZeroU8 with the +1 offset",
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
            cap: INLINE as u8,
            data: Data {
                inline: ManuallyDrop::new([const { MaybeUninit::uninit() }; INLINE]),
            },
        }
    }

    /// Allocate with room for at least `capacity` elements (clamped to `MAX`).
    /// Stays inline when `capacity <= INLINE`.
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        let () = Self::ASSERT;
        if capacity <= INLINE {
            return Self::new();
        }
        let cap = capacity.min(MAX);
        let heap = Self::alloc(cap);
        Self {
            len: Self::EMPTY_LEN,
            cap: cap as u8,
            data: Data { heap },
        }
    }

    #[inline]
    const fn is_spilled(&self) -> bool {
        self.cap as usize > INLINE
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
    fn set_len(&mut self, actual: usize) {
        debug_assert!(actual <= self.capacity());
        debug_assert!(actual <= MAX);
        // actual <= MAX <= 254 => actual + 1 in 1..=255, never zero.
        self.len = unsafe { NonZeroU8::new_unchecked(actual as u8 + 1u8) };
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
        Layout::array::<T>(cap).expect("TinyVec allocation layout overflow")
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
    /// growing the heap allocation as needed. Never exceeds `MAX` (the caller —
    /// `push` — asserts room before calling).
    fn grow(&mut self) {
        let old_cap = self.capacity();
        debug_assert!(old_cap < MAX, "TinyVec grown past MAX");
        // Growth schedule: jump off inline capacity, then double, clamped to MAX.
        let new_cap = (old_cap.max(1) * 2).clamp(INLINE + 1, MAX);
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

    /// Appends `value`. Panics if `len == MAX`.
    #[inline]
    pub fn push(&mut self, value: T) {
        let len = self.len();
        if len == self.capacity() {
            // At capacity: either grow (still below MAX) or the container is
            // saturated. A hard assert (not debug-only) keeps the `NonZeroU8`
            // length invariant sound in release — `AutoMap` converts List->Map
            // before this fires; `TaskStorage` relies on the panic.
            assert!(
                len < MAX,
                "TinyVec capacity overflow: already at MAX = {MAX}"
            );
            self.grow();
        }
        // SAFETY: `len < capacity` now; slot `len` is uninitialized.
        unsafe {
            self.as_mut_ptr().add(len).write(value);
        }
        self.set_len(len + 1);
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
            drop_in_place(slice_from_raw_parts_mut(self.as_mut_ptr(), len));
        }
        self.set_len(0);
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
        if len <= INLINE {
            // Move elements back inline.
            let mut inline: [MaybeUninit<T>; INLINE] = [const { MaybeUninit::uninit() }; INLINE];
            // SAFETY: heap holds `len <= INLINE` initialized elements; copy them
            // into the inline array, then free the heap buffer.
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
                self.cap = INLINE as u8;
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
    pub fn drain(&mut self) -> Drain<'_, T, INLINE, MAX> {
        let end = self.len();
        // Logically empty now; `Drain` owns the elements and drops any it does
        // not yield (panic safety).
        self.set_len(0);
        Drain {
            vec: self,
            idx: 0,
            end,
        }
    }

    /// Reserve room for at least `additional` more elements, spilling to (or
    /// growing) the heap as needed. Clamped to `MAX`; panics via `push`/`grow`
    /// only when actually filled past `MAX`, not here.
    pub fn reserve(&mut self, additional: usize) {
        let needed = self.len() + additional;
        if needed <= self.capacity() {
            return;
        }
        // Grow straight to the target (clamped to MAX) instead of doubling, so
        // an `extend_exact` of a known size allocates exactly once.
        let target = needed.min(MAX);
        if target <= INLINE {
            return;
        }
        let len = self.len();
        let new_heap = Self::alloc(target);
        // SAFETY: source holds `len` initialized elements; dest has room for
        // `target >= needed >= len`. Fresh allocation, so regions don't overlap.
        unsafe {
            ptr::copy_nonoverlapping(self.as_ptr(), new_heap.as_ptr(), len);
        }
        // SAFETY: free the old buffer if it was heap-allocated (elements moved).
        unsafe {
            self.dealloc_if_spilled();
        }
        self.data = Data { heap: new_heap };
        self.cap = target as u8;
    }
}

impl<T, const INLINE: usize, const MAX: usize> TinyVec<T, INLINE, MAX> {
    /// Extend from an exact-sized iterator, reserving exactly once up front
    /// (avoiding the `size_hint().0` lower-bound dance in the generic `Extend`).
    pub fn extend_exact<It>(&mut self, iter: It)
    where
        It: IntoIterator<Item = T>,
        It::IntoIter: ExactSizeIterator,
    {
        let iter = iter.into_iter();
        self.reserve(iter.len());
        for item in iter {
            self.push(item);
        }
    }
}

impl<T, const INLINE: usize, const MAX: usize> Default for TinyVec<T, INLINE, MAX> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const INLINE: usize, const MAX: usize> Drop for TinyVec<T, INLINE, MAX> {
    #[inline]
    fn drop(&mut self) {
        let len = self.len();
        // SAFETY: first `len` elements are initialized; drop them, then free
        // any heap allocation.
        unsafe {
            drop_in_place(slice_from_raw_parts_mut(self.as_mut_ptr(), len));
            self.dealloc_if_spilled();
        }
    }
}

impl<T: Clone, const INLINE: usize, const MAX: usize> Clone for TinyVec<T, INLINE, MAX> {
    fn clone(&self) -> Self {
        let mut out = Self::with_capacity(self.len());
        for v in self.iter() {
            out.push(v.clone());
        }
        out
    }
}

impl<T, const INLINE: usize, const MAX: usize> ShrinkToFit for TinyVec<T, INLINE, MAX> {
    #[inline]
    fn shrink_to_fit(&mut self) {
        Self::shrink_to_fit(self);
    }
}

impl<T: Debug, const INLINE: usize, const MAX: usize> Debug for TinyVec<T, INLINE, MAX> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(self.iter()).finish()
    }
}

impl<T, const INLINE: usize, const MAX: usize> Deref for TinyVec<T, INLINE, MAX> {
    type Target = [T];
    #[inline]
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

impl<T, const INLINE: usize, const MAX: usize> DerefMut for TinyVec<T, INLINE, MAX> {
    #[inline]
    fn deref_mut(&mut self) -> &mut [T] {
        self.as_mut_slice()
    }
}

impl<'a, T, const INLINE: usize, const MAX: usize> IntoIterator for &'a TinyVec<T, INLINE, MAX> {
    type Item = &'a T;
    type IntoIter = Iter<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'a, T, const INLINE: usize, const MAX: usize> IntoIterator
    for &'a mut TinyVec<T, INLINE, MAX>
{
    type Item = &'a mut T;
    type IntoIter = IterMut<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter_mut()
    }
}

/// By-value iterator returned by [`TinyVec::into_iter`].
pub struct IntoIter<T, const INLINE: usize, const MAX: usize> {
    vec: TinyVec<T, INLINE, MAX>,
    idx: usize,
    end: usize,
}

impl<T, const INLINE: usize, const MAX: usize> Iterator for IntoIter<T, INLINE, MAX> {
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

impl<T, const INLINE: usize, const MAX: usize> ExactSizeIterator for IntoIter<T, INLINE, MAX> {}

impl<T, const INLINE: usize, const MAX: usize> Drop for IntoIter<T, INLINE, MAX> {
    fn drop(&mut self) {
        // Drop not-yet-yielded elements; the inner `vec` (len already 0) then
        // frees any heap allocation without double-dropping.
        // SAFETY: elements `[idx, end)` are initialized and unyielded.
        unsafe {
            let base = self.vec.as_mut_ptr();
            drop_in_place(slice_from_raw_parts_mut(
                base.add(self.idx),
                self.end - self.idx,
            ));
        }
    }
}

impl<T, const INLINE: usize, const MAX: usize> IntoIterator for TinyVec<T, INLINE, MAX> {
    type Item = T;
    type IntoIter = IntoIter<T, INLINE, MAX>;
    #[inline]
    fn into_iter(mut self) -> Self::IntoIter {
        let end = self.len();
        // Prevent `TinyVec::drop` from dropping elements; `IntoIter` owns them
        // now. The heap buffer (if any) is freed by `IntoIter`'s inner `vec`.
        self.set_len(0);
        IntoIter {
            vec: self,
            idx: 0,
            end,
        }
    }
}

impl<T, const INLINE: usize, const MAX: usize> FromIterator<T> for TinyVec<T, INLINE, MAX> {
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

impl<T, const INLINE: usize, const MAX: usize> Extend<T> for TinyVec<T, INLINE, MAX> {
    #[inline]
    fn extend<It: IntoIterator<Item = T>>(&mut self, iter: It) {
        for v in iter {
            self.push(v);
        }
    }
}

/// Draining iterator returned by [`TinyVec::drain`].
pub struct Drain<'a, T, const INLINE: usize, const MAX: usize> {
    vec: &'a mut TinyVec<T, INLINE, MAX>,
    idx: usize,
    end: usize,
}

impl<T, const INLINE: usize, const MAX: usize> Iterator for Drain<'_, T, INLINE, MAX> {
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

impl<T, const INLINE: usize, const MAX: usize> ExactSizeIterator for Drain<'_, T, INLINE, MAX> {}

impl<T, const INLINE: usize, const MAX: usize> Drop for Drain<'_, T, INLINE, MAX> {
    fn drop(&mut self) {
        // SAFETY: elements `[idx, end)` are initialized and unyielded.
        unsafe {
            let base = self.vec.as_mut_ptr();
            drop_in_place(slice_from_raw_parts_mut(
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
    use crate::MAX_USEFUL_LINEAR_SCAN;

    /// Enum mirroring `AutoMap`'s layout, to assert the `NonZeroU8` niche folds
    /// the discriminant in (enum size == tiny-vec size, no extra tag word).
    #[allow(dead_code)]
    enum MapLike<T, const INLINE: usize, const MAX: usize = MAX_USEFUL_LINEAR_SCAN> {
        List(TinyVec<T, INLINE, MAX>),
        Map(Box<u32>),
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn niche_and_sizes() {
        type Tid = NonZeroU32;
        // The whole point: enum is no bigger than the List payload.
        assert_eq!(size_of::<TinyVec<(Tid, ()), 3>>(), 24);
        assert_eq!(size_of::<MapLike<(Tid, ()), 3>>(), 24, "niche not folded");
        assert_eq!(size_of::<MapLike<(Tid, ()), 0>>(), 16);
        assert_eq!(size_of::<MapLike<(Tid, ()), 6>>(), 32);

        // The `MAX` const param is purely compile-time: shrinking it does not
        // change the layout (still a 2-byte header + union). This pins the
        // property that `TaskStorage`'s `TinyVec<_, 0, N>` stays 16 B for any N.
        assert_eq!(size_of::<TinyVec<u64, 0, 25>>(), 16);
        assert_eq!(size_of::<TinyVec<u64, 0, 254>>(), 16); // 254 = the largest valid MAX
        assert_eq!(
            size_of::<MapLike<(Tid, ()), 0, 8>>(),
            16,
            "MAX must not affect layout"
        );
    }

    #[test]
    fn push_spill_and_back() {
        let mut v: TinyVec<u32, 3> = TinyVec::new();
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
        assert!(v.capacity() > 3 && v.capacity() <= MAX_USEFUL_LINEAR_SCAN);
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
        let mut v: TinyVec<u32, 4> = TinyVec::new();
        v.extend([10, 20, 30, 40]);
        assert_eq!(v.swap_remove(1), 20); // 40 moves into slot 1
        let mut got: Vec<u32> = v.iter().copied().collect();
        got.sort();
        assert_eq!(got, vec![10, 30, 40]);
    }

    #[test]
    fn drains_and_reuses() {
        let mut v: TinyVec<u32, 2> = TinyVec::new();
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
            let mut v: TinyVec<DropTok, 4> = TinyVec::new();
            v.push(DropTok::new(c));
            v.push(DropTok::new(c));
        });
        // plain drop, spilled
        assert_balanced(|c| {
            let mut v: TinyVec<DropTok, 2> = TinyVec::new();
            for _ in 0..10 {
                v.push(DropTok::new(c));
            }
        });
        // clear
        assert_balanced(|c| {
            let mut v: TinyVec<DropTok, 2> = TinyVec::new();
            for _ in 0..6 {
                v.push(DropTok::new(c));
            }
            v.clear();
            assert!(v.is_empty());
        });
        // partial into_iter then drop (spilled)
        assert_balanced(|c| {
            let mut v: TinyVec<DropTok, 2> = TinyVec::new();
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
            let mut v: TinyVec<DropTok, 4> = TinyVec::new();
            for _ in 0..3 {
                v.push(DropTok::new(c));
            }
            let mut d = v.drain();
            drop(d.next());
            drop(d); // remaining 2
        });
        // swap_remove returns and drops
        assert_balanced(|c| {
            let mut v: TinyVec<DropTok, 4> = TinyVec::new();
            for _ in 0..4 {
                v.push(DropTok::new(c));
            }
            let x = v.swap_remove(0);
            drop(x);
            // 3 remain, dropped with v
        });
        // shrink_to_fit heap->inline preserves elements
        assert_balanced(|c| {
            let mut v: TinyVec<DropTok, 3> = TinyVec::new();
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
        let mut v: TinyVec<u32, 2> = TinyVec::new();
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
        let mut v: TinyVec<(), 1> = TinyVec::new();
        for _ in 0..10 {
            v.push(());
        }
        assert_eq!(v.len(), 10);
        assert_eq!(v.iter().count(), 10);
        v.clear();
        assert!(v.is_empty());
    }

    // ---- ported from turbo-tasks TinyVec: MAX cap, extend_exact, retain_mut ----

    /// `INLINE = 0` is the pure-heap `TinyVec` shape used by `TaskStorage`.
    #[test]
    fn heap_only_push_grows() {
        let mut v: TinyVec<u32, 0> = TinyVec::new();
        assert_eq!(v.capacity(), 0);
        for i in 0..20 {
            v.push(i);
        }
        assert_eq!(v.len(), 20);
        assert_eq!(
            v.iter().copied().collect::<Vec<_>>(),
            (0..20).collect::<Vec<_>>()
        );
    }

    #[test]
    fn extend_exact_reserves_once() {
        let mut v: TinyVec<u32, 0> = TinyVec::new();
        v.extend_exact(0..10);
        assert_eq!(v.len(), 10);
        // Reserved exactly 10 (not a doubling artifact), since 10 <= MAX.
        assert_eq!(v.capacity(), 10);
        v.extend_exact(10..15);
        assert_eq!(
            v.iter().copied().collect::<Vec<_>>(),
            (0..15).collect::<Vec<_>>()
        );
    }

    /// A tight `MAX` caps growth exactly and panics past it.
    #[test]
    fn tight_max_caps_growth_exactly() {
        let mut v: TinyVec<u32, 0, 5> = TinyVec::new();
        for i in 0..5 {
            v.push(i);
        }
        assert_eq!(v.len(), 5);
        assert_eq!(v.capacity(), 5, "growth must cap at MAX, not overshoot");
    }

    #[test]
    #[should_panic(expected = "TinyVec capacity overflow")]
    fn tight_max_panics_at_limit() {
        let mut v: TinyVec<u32, 0, 3> = TinyVec::new();
        for i in 0..3 {
            v.push(i);
        }
        v.push(3); // 4th push exceeds MAX = 3
    }

    /// Growth doubles from the inline threshold, then caps at MAX. For
    /// `INLINE = 0`: 0 -> 2 -> 4 -> 8 -> 10 (last step clamps to MAX rather than
    /// overshooting to 16).
    #[test]
    fn tight_max_growth_schedule() {
        let mut v: TinyVec<u32, 0, 10> = TinyVec::new();
        let mut last = 0;
        let mut changes = Vec::new();
        for i in 0..10 {
            v.push(i);
            if v.capacity() != last {
                changes.push(v.capacity());
                last = v.capacity();
            }
        }
        assert_eq!(changes, vec![2, 4, 8, 10]);
    }
}
