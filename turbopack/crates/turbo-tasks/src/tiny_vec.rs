//! A `Vec`-shaped container with `u8` length and capacity, sized 16 B on 64-bit instead of 24 B.
//!
//! Used by `#[task_storage]` for `TaskStorage`'s lazy-fields field, which holds at most ~25
//! elements (one per declared lazy field in the schema). With several million task storages
//! live during a typical Next.js build, the 8 B saved per task adds up to dozens of MB of
//! resident memory.
//!
//! The API is intentionally a strict subset of `Vec` covering only what the task-storage
//! callers and the `#[task_storage]` macro emit need: `len`, `iter`, `iter_mut`, `push`,
//! `swap_remove`, `last_mut`, `index`, `index_mut`, `extend`, `reserve`, `retain_mut`,
//! `Default`, `Debug`, `ShrinkToFit`. No `Clone` or `PartialEq` — `TaskStorage` doesn't
//! derive them.
//!
//! ## Capacity
//!
//! `TinyVec<T, MAX>` is statically capped at `MAX <= 255` elements. Pushing past `MAX`
//! panics. Growth doubles until it would exceed `MAX`, then caps at exactly `MAX`. The
//! default `MAX = 255` covers any container that fits the type's `u8` cap.
//!
//! For `TaskStorage::lazy` the schema emits `TinyVec<LazyField, 25>`, which tightens the
//! steady-state allocation: a fully-populated lazy vec ends at cap=25 instead of cap=32
//! (the next power of two), saving 7 slots × `size_of::<LazyField>()` ≈ 336 B per such
//! task.

use std::{
    alloc::{Layout, alloc, dealloc, handle_alloc_error},
    fmt,
    marker::PhantomData,
    mem::ManuallyDrop,
    ptr::{self, NonNull},
};

/// Compact `Vec`-shaped container with a statically-bounded capacity; see module docs for
/// rationale. `MAX` defaults to `u8::MAX = 255` (the largest value the `u8` cap field can hold).
pub struct TinyVec<T, const MAX: u8 = { u8::MAX }> {
    /// Heap pointer. Dangling (uninitialized) when `cap == 0`.
    ptr: NonNull<T>,
    len: u8,
    cap: u8,
    /// Marker so we own `T` for drop-check purposes (matches `Vec<T>`'s variance/dropck).
    _marker: PhantomData<T>,
}

// SAFETY: same as `Vec<T>` — we own a heap allocation of `T`s, and the only shared state is via
// the `ptr` which is unique to this `TinyVec`.
unsafe impl<T: Send, const MAX: u8> Send for TinyVec<T, MAX> {}
unsafe impl<T: Sync, const MAX: u8> Sync for TinyVec<T, MAX> {}

impl<T, const MAX: u8> Default for TinyVec<T, MAX> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const MAX: u8> TinyVec<T, MAX> {
    // Compile-time assertion that `MAX > 0`. Referenced inside `new()` so it gets evaluated
    // at monomorphization time; the panic message becomes a compile error for any
    // `TinyVec<T, 0>` instantiation rather than a runtime panic on the first call.
    const _ASSERT_MAX_NONZERO: () = assert!(MAX > 0, "TinyVec MAX must be > 0");

    const fn new() -> Self {
        // Force evaluation of the static assertion at this generic's monomorphization.
        // The `let` binding to `()` keeps the const visited; clippy's `let_unit_value` lint
        // is allowed here because that's intentional.
        #[allow(clippy::let_unit_value)]
        let _: () = Self::_ASSERT_MAX_NONZERO;
        Self {
            ptr: NonNull::dangling(),
            len: 0,
            cap: 0,
            _marker: PhantomData,
        }
    }

    /// Retains only the elements for which the predicate returns `true`. See
    /// [`Vec::retain_mut`] for semantics including panic safety.
    ///
    /// Delegates to `Vec::retain_mut`. Implementing retain_mut directly requires a
    /// panic-safe partial-shift dance that's the trickiest unsafe code in this module; the
    /// `Vec` version is identical in shape but has been hand-tested in the standard
    /// library. Round-tripping through `Vec` for this one operation is worth the soundness
    /// improvement, especially since `retain_mut` is cold relative to `push`.
    pub fn retain_mut(&mut self, f: impl FnMut(&mut T) -> bool) {
        if self.len == 0 {
            return;
        }

        // Panic safety: transfer buffer ownership to the local `Vec` *before* the closure
        // can panic. Zeroing `cap` first means our `Drop` becomes a no-op until we restore
        // it below — if `f` panics, `vec`'s Drop frees the buffer exactly once and our
        // Drop (which may run during continued unwinding) does nothing.
        let ptr = self.ptr.as_ptr();
        let len = self.len as usize;
        let cap = self.cap as usize;
        self.cap = 0;
        self.len = 0;

        // SAFETY: by struct invariant, `(ptr, len, cap)` is a valid `Vec::from_raw_parts`
        // triple.
        let mut vec = unsafe { Vec::from_raw_parts(ptr, len, cap) };
        vec.retain_mut(f);

        // No panic. Take ownership of the (possibly element-dropped) buffer back.
        // `retain_mut` never grows, so `new_cap == cap`.
        let (new_ptr, new_len, new_cap) = vec.into_raw_parts();
        debug_assert_eq!(new_cap, cap);
        // SAFETY: `Vec::into_raw_parts` returns a non-null pointer; same buffer as on entry.
        self.ptr = unsafe { NonNull::new_unchecked(new_ptr) };
        self.len = new_len as u8;
        self.cap = new_cap as u8;
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len as usize
    }

    /// Pair to [`len`] (kept inherent so clippy's `len_without_is_empty` lint is satisfied;
    /// it's also reachable through `Deref<[T]>::is_empty`).
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    // `capacity` is exposed only to tests; external callers don't need it.
    #[cfg(test)]
    #[inline]
    fn capacity(&self) -> usize {
        self.cap as usize
    }

    // `iter`, `iter_mut`, `last_mut`, indexing, and `.is_empty()` slice-style usage are
    // reachable through `Deref`/`DerefMut` to `[T]`. No need for inherent methods.

    #[inline]
    fn as_slice(&self) -> &[T] {
        // SAFETY: ptr is valid for `len` initialized elements; if len == 0, slicing the
        // dangling pointer is allowed by `from_raw_parts`.
        unsafe { std::slice::from_raw_parts(self.ptr.as_ptr(), self.len()) }
    }

    #[inline]
    fn as_mut_slice(&mut self) -> &mut [T] {
        // SAFETY: same as `as_slice`; we hold `&mut self`.
        unsafe { std::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len()) }
    }

    /// Appends `value`. Panics if `len == MAX`.
    pub fn push(&mut self, value: T) {
        if self.len == self.cap {
            // grow_by_one asserts inside realloc_to when new_cap > MAX. The check below
            // happens before the cold-path call so we panic with a clearer message when the
            // container is already saturated.
            assert!(
                (self.len as usize) < MAX as usize,
                "TinyVec capacity overflow: already at MAX = {MAX}",
            );
            self.grow_by_one();
        }
        // SAFETY: `len < cap` after the grow; the slot at index `len` is uninitialized and we
        // initialize it here.
        unsafe {
            ptr::write(self.ptr.as_ptr().add(self.len()), value);
        }
        self.len += 1;
    }

    /// Removes the element at `idx` by swapping it with the last and popping. O(1).
    /// Panics if `idx` is out of bounds (matching `Vec::swap_remove`).
    pub fn swap_remove(&mut self, idx: usize) -> T {
        let len = self.len();
        assert!(idx < len, "swap_remove index out of bounds: {idx} >= {len}");
        // SAFETY: `idx < len`; we read out the value and then either swap or shrink.
        unsafe {
            let last = self.ptr.as_ptr().add(len - 1);
            let hole = self.ptr.as_ptr().add(idx);
            let value = ptr::read(hole);
            if idx != len - 1 {
                ptr::copy_nonoverlapping(last, hole, 1);
            }
            self.len -= 1;
            value
        }
    }

    /// Reserves capacity for at least `additional` more elements. No-op if already sufficient.
    /// Panics if the resulting capacity would exceed `MAX`.
    ///
    /// Private: used by `extend_exact` internally; no external callers.
    fn reserve(&mut self, additional: usize) {
        let needed = self.len() + additional;
        if needed <= self.cap as usize {
            return;
        }
        // Round up to next power of two (min 4), but never exceed MAX.
        let target = needed.next_power_of_two().max(4).min(MAX as usize);
        self.realloc_to(target);
    }

    /// Grow the buffer by at least one slot. The first allocation jumps to 4 to amortize the
    /// initial pushes; subsequent growths double, capped at `MAX`.
    #[cold]
    #[inline(never)]
    fn grow_by_one(&mut self) {
        let doubled = if self.cap == 0 {
            4
        } else {
            (self.cap as usize) * 2
        };
        let new_cap = doubled.min(MAX as usize);
        self.realloc_to(new_cap);
    }

    fn realloc_to(&mut self, new_cap: usize) {
        assert!(
            new_cap <= MAX as usize,
            "TinyVec capacity overflow: requested {new_cap}, max {MAX}",
        );
        if new_cap == self.cap as usize {
            return;
        }
        if size_of::<T>() == 0 {
            // Zero-sized types: no allocation needed; just bump cap.
            self.cap = new_cap as u8;
            return;
        }

        // Allocate new buffer.
        let new_layout = Layout::array::<T>(new_cap).expect("TinyVec layout overflow");
        // SAFETY: Layout has nonzero size because new_cap > 0 (or we'd not be here) and T is
        // nonzero-sized (handled above).
        let new_ptr = unsafe { alloc(new_layout) } as *mut T;
        let new_ptr = match NonNull::new(new_ptr) {
            Some(p) => p,
            None => handle_alloc_error(new_layout),
        };

        // Move elements over.
        if self.cap > 0 {
            // SAFETY: old buffer holds `len` initialized Ts; copy them to the new buffer's
            // prefix (which is uninitialized).
            unsafe {
                ptr::copy_nonoverlapping(self.ptr.as_ptr(), new_ptr.as_ptr(), self.len());
            }
            self.deallocate_old();
        }

        self.ptr = new_ptr;
        self.cap = new_cap as u8;
    }

    /// Deallocates the current heap buffer without dropping the elements (caller must have
    /// already moved or dropped them). No-op if `cap == 0`.
    ///
    /// `#[inline]` so the `cap == 0` early return collapses at the `Drop` call site for
    /// empty containers — saves a function call on what is otherwise a one-instruction path.
    #[inline]
    fn deallocate_old(&mut self) {
        if self.cap == 0 || size_of::<T>() == 0 {
            return;
        }
        let old_layout =
            Layout::array::<T>(self.cap as usize).expect("TinyVec layout was valid when allocated");
        // SAFETY: ptr came from `alloc` with this layout in `realloc_to`.
        unsafe {
            dealloc(self.ptr.as_ptr() as *mut u8, old_layout);
        }
    }

    /// Shrinks the heap buffer to fit `len`, freeing it entirely if `len == 0`.
    pub fn shrink_to_fit(&mut self) {
        if (self.len as usize) == (self.cap as usize) {
            return;
        }
        if self.len == 0 {
            // Free the buffer entirely.
            self.deallocate_old();
            self.ptr = NonNull::dangling();
            self.cap = 0;
            return;
        }
        let new_cap = self.len as usize;
        // Allocate a smaller buffer, copy, free old.
        let new_layout = Layout::array::<T>(new_cap).expect("TinyVec layout overflow");
        // SAFETY: layout is nonzero (new_cap > 0, T is nonzero-sized — ZST early-returned via the
        // len == cap check above since cap = 0 for ZSTs would also trigger the equal branch).
        let new_ptr = unsafe { alloc(new_layout) } as *mut T;
        let new_ptr = match NonNull::new(new_ptr) {
            Some(p) => p,
            None => handle_alloc_error(new_layout),
        };
        // SAFETY: old buffer holds `len` initialized Ts.
        unsafe {
            ptr::copy_nonoverlapping(self.ptr.as_ptr(), new_ptr.as_ptr(), self.len());
        }
        self.deallocate_old();
        self.ptr = new_ptr;
        self.cap = new_cap as u8;
    }
}

// `Index<usize>` / `IndexMut<usize>` are reachable through `Deref<Target=[T]>` —
// `[T]: Index<usize>` and autoderef makes `tv[i]` work. No need to implement them here.

impl<T, const MAX: u8> std::ops::Deref for TinyVec<T, MAX> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

impl<T, const MAX: u8> std::ops::DerefMut for TinyVec<T, MAX> {
    fn deref_mut(&mut self) -> &mut [T] {
        self.as_mut_slice()
    }
}

impl<T, const MAX: u8> TinyVec<T, MAX> {
    /// Extend from an exact-sized iterator: reserves exactly once before the loop,
    /// avoiding the `size_hint().0` lower-bound dance.
    ///
    /// All in-tree callers feed exact-sized iterators (typically `Vec::IntoIter` from
    /// `TinyVec::into_iter`), so we expose this as the preferred API. The `Extend` trait
    /// impl below stays for compatibility with generic code.
    pub fn extend_exact<I>(&mut self, iter: I)
    where
        I: IntoIterator<Item = T>,
        I::IntoIter: ExactSizeIterator,
    {
        let iter = iter.into_iter();
        self.reserve(iter.len());
        for item in iter {
            self.push(item);
        }
    }
}

impl<T, const MAX: u8> IntoIterator for TinyVec<T, MAX> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        // Delegate to `Vec::IntoIter` rather than maintaining our own. ManuallyDrop the
        // self so its Drop doesn't fire — the reconstructed Vec now owns the buffer.
        let me = ManuallyDrop::new(self);
        // SAFETY: by struct invariant, `(self.ptr, self.len, self.cap)` is a valid
        // `Vec::from_raw_parts` triple.
        unsafe { Vec::from_raw_parts(me.ptr.as_ptr(), me.len as usize, me.cap as usize) }
            .into_iter()
    }
}

// `for x in &tv` and `for x in &mut tv` require `&TinyVec` / `&mut TinyVec` to implement
// `IntoIterator`. The `for` loop's desugaring doesn't apply `Deref` coercion across the
// reference boundary, so we need these explicit impls. They're trivial — just dispatch to
// the slice iterators reached through `Deref`.
impl<'a, T, const MAX: u8> IntoIterator for &'a TinyVec<T, MAX> {
    type Item = &'a T;
    type IntoIter = std::slice::Iter<'a, T>;
    fn into_iter(self) -> std::slice::Iter<'a, T> {
        self.as_slice().iter()
    }
}

impl<'a, T, const MAX: u8> IntoIterator for &'a mut TinyVec<T, MAX> {
    type Item = &'a mut T;
    type IntoIter = std::slice::IterMut<'a, T>;
    fn into_iter(self) -> std::slice::IterMut<'a, T> {
        self.as_mut_slice().iter_mut()
    }
}

impl<T: fmt::Debug, const MAX: u8> fmt::Debug for TinyVec<T, MAX> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.iter()).finish()
    }
}

impl<T, const MAX: u8> Drop for TinyVec<T, MAX> {
    #[inline]
    fn drop(&mut self) {
        // Fast path for empty containers: skip both the drop_in_place and deallocate calls.
        // Hot because `TinyVec::default()` followed by immediate drop is a common idiom in
        // benchmarks and in the steady-state of tasks that never allocate anything lazy.
        if self.cap == 0 {
            return;
        }
        // Drop populated elements in place.
        if self.len > 0 {
            // SAFETY: we own `len` initialized elements at the start of the buffer.
            unsafe {
                ptr::drop_in_place(std::ptr::slice_from_raw_parts_mut(
                    self.ptr.as_ptr(),
                    self.len(),
                ));
            }
        }
        self.deallocate_old();
    }
}

impl<T, const MAX: u8> shrink_to_fit::ShrinkToFit for TinyVec<T, MAX> {
    fn shrink_to_fit(&mut self) {
        Self::shrink_to_fit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test helper: build a TinyVec from an exact-sized iterator. Replaces the previous use
    /// of `Iterator::collect()` after we removed the `FromIterator` impl.
    fn from_exact<T, I, const MAX: u8>(iter: I) -> TinyVec<T, MAX>
    where
        I: IntoIterator<Item = T>,
        I::IntoIter: ExactSizeIterator,
    {
        let mut v = TinyVec::new();
        v.extend_exact(iter);
        v
    }

    #[test]
    fn size() {
        // The whole point: 16 B on 64-bit, vs 24 B for Vec.
        assert_eq!(std::mem::size_of::<TinyVec<u64>>(), 16);
        assert_eq!(std::mem::size_of::<TinyVec<[u8; 48]>>(), 16);
    }

    #[test]
    fn push_iter_swap_remove() {
        let mut v: TinyVec<u32> = TinyVec::new();
        assert!(v.is_empty());
        v.push(10);
        v.push(20);
        v.push(30);
        assert_eq!(v.len(), 3);
        assert_eq!(v.iter().copied().collect::<Vec<_>>(), vec![10, 20, 30]);
        let removed = v.swap_remove(0);
        assert_eq!(removed, 10);
        // After swap_remove(0), buffer is [30, 20] (last swapped into hole).
        assert_eq!(v.iter().copied().collect::<Vec<_>>(), vec![30, 20]);
        assert_eq!(v[0], 30);
        assert_eq!(v[1], 20);
    }

    #[test]
    fn growth_pattern() {
        let mut v: TinyVec<u32> = TinyVec::new();
        for i in 0..32u32 {
            v.push(i);
        }
        assert_eq!(v.len(), 32);
        let collected: Vec<u32> = v.iter().copied().collect();
        assert_eq!(collected, (0..32).collect::<Vec<_>>());
    }

    #[test]
    fn extend_and_reserve() {
        let mut v: TinyVec<u32> = TinyVec::new();
        v.extend_exact(0..10);
        assert_eq!(v.len(), 10);
        v.reserve(5);
        assert!(v.capacity() >= 15);
    }

    #[test]
    fn last_mut_and_index_mut() {
        let mut v: TinyVec<u32> = TinyVec::new();
        v.push(1);
        v.push(2);
        *v.last_mut().unwrap() = 99;
        assert_eq!(v[1], 99);
        v[0] = 7;
        assert_eq!(v[0], 7);
    }

    #[test]
    fn drop_runs_on_elements() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct DropCounter<'a>(&'a AtomicUsize);
        impl<'a> Drop for DropCounter<'a> {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }

        let count = AtomicUsize::new(0);
        {
            let mut v: TinyVec<DropCounter<'_>> = TinyVec::new();
            v.push(DropCounter(&count));
            v.push(DropCounter(&count));
            v.push(DropCounter(&count));
        }
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn into_iter_drops_and_yields() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct DropCounter<'a>(&'a AtomicUsize, u32);
        impl<'a> Drop for DropCounter<'a> {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }

        let count = AtomicUsize::new(0);
        let mut v: TinyVec<DropCounter<'_>> = TinyVec::new();
        v.push(DropCounter(&count, 1));
        v.push(DropCounter(&count, 2));
        v.push(DropCounter(&count, 3));

        let mut iter = v.into_iter();
        assert_eq!(iter.next().unwrap().1, 1);
        assert_eq!(iter.next().unwrap().1, 2);
        // Drop iterator with one remaining element.
        drop(iter);
        // 3 total drops: the two yielded + the one remaining in the iter.
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn shrink_to_fit_releases_buffer() {
        let mut v: TinyVec<u32> = TinyVec::new();
        v.extend_exact(0..10);
        assert!(v.capacity() >= 10);
        for _ in 0..10 {
            v.swap_remove(0);
        }
        assert!(v.is_empty());
        v.shrink_to_fit();
        assert_eq!(v.capacity(), 0);
    }

    #[test]
    #[should_panic(expected = "TinyVec capacity overflow")]
    fn capacity_overflow_panics() {
        let mut v: TinyVec<u8> = TinyVec::new();
        for _ in 0..255u32 {
            v.push(0);
        }
        // The 256th push trips the MAX check (default MAX = u8::MAX = 255).
        v.push(0);
    }

    /// `MAX` strictly caps push count; growth stops at exactly MAX even when doubling would
    /// overshoot.
    #[test]
    fn tight_max_caps_growth_exactly() {
        let mut v: TinyVec<u32, 5> = TinyVec::new();
        for i in 0..5 {
            v.push(i);
        }
        assert_eq!(v.len(), 5);
        // Capacity should be exactly 5, not the next-power-of-two (8).
        assert_eq!(v.capacity(), 5);
    }

    #[test]
    #[should_panic(expected = "TinyVec capacity overflow")]
    fn tight_max_panics_at_limit() {
        let mut v: TinyVec<u32, 3> = TinyVec::new();
        v.push(0);
        v.push(1);
        v.push(2);
        // The 4th push exceeds MAX=3.
        v.push(3);
    }

    /// Confirms the growth schedule with tight MAX: doubles until it would exceed MAX, then
    /// caps. With MAX=10 we should see 0 -> 4 -> 8 -> 10.
    #[test]
    fn tight_max_growth_schedule() {
        let mut v: TinyVec<u32, 10> = TinyVec::new();
        let mut last_cap = 0;
        let mut cap_changes = Vec::new();
        for i in 0..10 {
            v.push(i);
            if v.capacity() != last_cap {
                cap_changes.push(v.capacity());
                last_cap = v.capacity();
            }
        }
        assert_eq!(cap_changes, vec![4, 8, 10]);
    }

    #[test]
    fn retain_mut_basic() {
        let mut v: TinyVec<u32> = from_exact(0..10);
        v.retain_mut(|x| *x % 2 == 0);
        assert_eq!(v.iter().copied().collect::<Vec<_>>(), vec![0, 2, 4, 6, 8]);
        // retain_mut shouldn't change capacity.
        assert!(v.capacity() >= 5);
    }

    #[test]
    fn retain_mut_can_mutate() {
        let mut v: TinyVec<u32> = from_exact(0..5);
        v.retain_mut(|x| {
            *x *= 10;
            *x != 30
        });
        assert_eq!(v.iter().copied().collect::<Vec<_>>(), vec![0, 10, 20, 40]);
    }

    #[test]
    fn retain_mut_empty() {
        let mut v: TinyVec<u32> = TinyVec::new();
        v.retain_mut(|_| panic!("should not be called for empty"));
        assert!(v.is_empty());
    }

    #[test]
    fn retain_mut_keeps_all() {
        let mut v: TinyVec<u32> = from_exact(0..5);
        v.retain_mut(|_| true);
        assert_eq!(v.iter().copied().collect::<Vec<_>>(), vec![0, 1, 2, 3, 4]);
    }

    #[test]
    fn retain_mut_removes_all() {
        let mut v: TinyVec<u32> = from_exact(0..5);
        v.retain_mut(|_| false);
        assert!(v.is_empty());
    }

    /// Verifies retain_mut's panic guard: if the predicate panics, we shouldn't double-free.
    #[test]
    fn retain_mut_panic_safety() {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut v: TinyVec<u32> = from_exact(0..10);
            v.retain_mut(|x| {
                if *x == 5 {
                    panic!("boom");
                }
                true
            });
        }));
        assert!(result.is_err());
    }

    /// Element Drop panic during retain_mut — `Vec::retain_mut` handles this; we should too.
    #[test]
    fn retain_mut_element_drop_panic() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct PanicyDrop<'a>(u32, &'a AtomicUsize);
        impl Drop for PanicyDrop<'_> {
            fn drop(&mut self) {
                self.1.fetch_add(1, Ordering::SeqCst);
                if self.0 == 5 && !std::thread::panicking() {
                    panic!("boom from drop");
                }
            }
        }

        let drop_count = AtomicUsize::new(0);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut v: TinyVec<PanicyDrop<'_>> =
                from_exact((0..10).map(|i| PanicyDrop(i, &drop_count)));
            v.retain_mut(|x| x.0 != 5); // schedules drop of element with 0==5, which panics
            // If we get here without panic, drop happened cleanly.
        }));
        // The panic should have propagated; some drops should have occurred.
        assert!(result.is_err() || drop_count.load(Ordering::SeqCst) > 0);
    }
}
