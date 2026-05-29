//! A bump-allocation arena for [`JsValue`](super::JsValue) trees.
//!
//! A whole module analysis builds and links a large tree of `JsValue`s, where every nested node was
//! historically an individually heap-allocated `Box<JsValue>` / `Vec<JsValue>`. Building and
//! dropping those trees spends meaningful time in the global allocator. Instead we allocate all of
//! that tree storage from a single [`Arena`] that lives for the duration of
//! `analyze_ecmascript_module_internal` and is freed in one shot when that function returns.

use std::{
    alloc::Layout,
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
    mem::ManuallyDrop,
    ops::{Bound, Deref, DerefMut, RangeBounds},
    ptr::{self, NonNull},
    slice,
};

use bumpalo::Bump;

/// Bump-allocated box used for the scalar children of a `JsValue` (e.g. the operand of `Not`).
pub type BumpBox<'a, T> = bumpalo::boxed::Box<'a, T>;
/// Bump-allocated growable vector used for the list children of a `JsValue` (e.g. `Array` items).
///
/// This is [`ArenaVec`]. Unlike `bumpalo::collections::Vec`, it does **not** embed an `&Bump`: the
/// allocator is passed explicitly to the growth methods instead. That keeps the type one word
/// narrower (so `JsValue` stays at 32 bytes rather than 40) and means it borrows nothing beyond the
/// raw pointer into the arena.
pub type BumpVec<'a, T> = ArenaVec<'a, T>;

/// A growable vector whose backing storage lives in an [`Arena`].
///
/// Layout mirrors a minimal `Vec`: a pointer to the arena-owned buffer plus `len`/`cap`. The buffer
/// is never freed individually — it is reclaimed in bulk when the `Arena` is dropped — but element
/// destructors still run (via [`Drop`]) so owned leaves (`Atom`, `RcStr`, …) are released.
///
/// Growth methods ([`push`](Self::push), [`reserve`](Self::reserve),
/// [`extend_in`](Self::extend_in), …) take `&'a Arena` because, unlike `bumpalo`'s own `Vec`, this
/// type doesn't carry the allocator inside it.
pub struct ArenaVec<'a, T> {
    /// Points at the first slot of the arena-owned buffer. `ptr[..len]` is initialized; `ptr[len..
    /// cap]` is uninitialized spare capacity. Dangling (well-aligned) when `cap == 0`.
    ptr: NonNull<T>,
    cap: usize,
    len: usize,
    /// Borrows the arena for `'a` and marks ownership of `T` (covariant in `T`, like `Vec<T>`), so
    /// dropck and auto-trait inference behave as if the `T`s are stored inline.
    _marker: PhantomData<(&'a (), T)>,
}

// SAFETY: `ArenaVec` owns its `T`s (they live in the arena buffer it points at) and shares them
// only the way `std::vec::Vec` does, so the same `Send`/`Sync` rules apply — gated on `T`. The raw
// `NonNull` pointer is what suppresses the automatic impls; re-adding them here is sound because
// the pointer is unaliased arena storage and the arena is only ever allocated from / mutated by the
// single thread polling the analysis future (futures are never polled concurrently, and the linker
// awaits its callbacks sequentially — no `join!`/spawn over `&Arena`). This is what lets
// `JsValue<'a>` be `Send`/`Sync` across the analyzer's `await` points.
unsafe impl<T: Send> Send for ArenaVec<'_, T> {}
unsafe impl<T: Sync> Sync for ArenaVec<'_, T> {}

impl<'a, T> ArenaVec<'a, T> {
    /// A new empty vector. Allocates nothing until the first push.
    #[inline]
    pub fn new_in(_arena: &'a Arena) -> Self {
        Self {
            ptr: NonNull::dangling(),
            cap: 0,
            len: 0,
            _marker: PhantomData,
        }
    }

    /// A new vector with room for `capacity` elements (a single arena allocation).
    #[inline]
    pub fn with_capacity_in(arena: &'a Arena, capacity: usize) -> Self {
        Self {
            ptr: arena.alloc_uninit_slice::<T>(capacity),
            cap: capacity,
            len: 0,
            _marker: PhantomData,
        }
    }

    /// Collect `iter` into a new arena-backed vector.
    #[inline]
    pub fn from_iter_in<I: IntoIterator<Item = T>>(arena: &'a Arena, iter: I) -> Self {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        let mut v = Self::with_capacity_in(arena, lower);
        for item in iter {
            v.push(arena, item);
        }
        v
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.cap
    }

    #[inline]
    pub fn as_slice(&self) -> &[T] {
        self
    }

    #[inline]
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        self
    }

    /// Append `value`, growing the arena-backed buffer if necessary.
    #[inline]
    pub fn push(&mut self, arena: &'a Arena, value: T) {
        if self.len == self.cap {
            let new_cap = if self.cap == 0 { 4 } else { self.cap * 2 };
            self.grow_to(arena, new_cap);
        }
        // SAFETY: `len < cap` after the grow, so the slot at `len` is allocated and uninitialized.
        unsafe { self.ptr.as_ptr().add(self.len).write(value) };
        self.len += 1;
    }

    /// Remove and return the last element.
    #[inline]
    pub fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        // SAFETY: the slot at the new `len` was initialized; we transfer ownership out and won't
        // read it again (it's now part of the uninitialized tail).
        Some(unsafe { self.ptr.as_ptr().add(self.len).read() })
    }

    /// Reserve space for at least `additional` more elements (amortized growth).
    #[inline]
    pub fn reserve(&mut self, arena: &'a Arena, additional: usize) {
        let needed = self.len + additional;
        if needed > self.cap {
            let new_cap = needed.max(self.cap * 2).max(4);
            self.grow_to(arena, new_cap);
        }
    }

    /// Reserve space for exactly `additional` more elements.
    #[inline]
    pub fn reserve_exact(&mut self, arena: &'a Arena, additional: usize) {
        let needed = self.len + additional;
        if needed > self.cap {
            self.grow_to(arena, needed);
        }
    }

    /// Append all of `iter`.
    #[inline]
    pub fn extend_in<I: IntoIterator<Item = T>>(&mut self, arena: &'a Arena, iter: I) {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        self.reserve(arena, lower);
        for item in iter {
            self.push(arena, item);
        }
    }

    /// Shorten the vector to `len`, dropping the removed elements.
    #[inline]
    pub fn truncate(&mut self, len: usize) {
        if len < self.len {
            let remove = self.len - len;
            // Set the length first so a panic in an element's destructor can't cause a double-drop.
            self.len = len;
            // SAFETY: `ptr[len..len+remove]` was initialized and is no longer logically owned.
            unsafe {
                ptr::drop_in_place(ptr::slice_from_raw_parts_mut(
                    self.ptr.as_ptr().add(len),
                    remove,
                ));
            }
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        self.truncate(0);
    }

    /// Remove the element at `index`, replacing it with the last element (O(1), order-changing).
    #[inline]
    pub fn swap_remove(&mut self, index: usize) -> T {
        assert!(index < self.len, "swap_remove index out of bounds");
        let last = self.len - 1;
        self.as_mut_slice().swap(index, last);
        self.pop().unwrap()
    }

    /// Remove and yield the elements in `range`, leaving the elements before it in place.
    ///
    /// Only ranges that extend to the end of the vector (`..` and `start..`) are supported — that
    /// is all the analyzer uses, and it lets the drain avoid shifting any trailing elements.
    pub fn drain<R: RangeBounds<usize>>(&mut self, range: R) -> ArenaVecDrain<'_, 'a, T> {
        let start = match range.start_bound() {
            Bound::Included(&s) => s,
            Bound::Excluded(&s) => s + 1,
            Bound::Unbounded => 0,
        };
        assert!(
            matches!(range.end_bound(), Bound::Unbounded),
            "ArenaVec::drain only supports ranges ending at the vector's length"
        );
        assert!(start <= self.len, "drain start out of bounds");
        let end = self.len;
        // Logically truncate now. The returned drain owns `[start, end)` and drops whatever it
        // doesn't yield. There is nothing after `end`, so no tail needs to move.
        self.len = start;
        ArenaVecDrain {
            base: self.ptr,
            idx: start,
            end,
            _marker: PhantomData,
        }
    }

    /// Grow the backing buffer to `new_cap` (a no-op if already large enough). Allocates a fresh
    /// arena slice and copies the live elements over; the old buffer stays in the arena until it is
    /// reset/dropped.
    fn grow_to(&mut self, arena: &'a Arena, new_cap: usize) {
        if new_cap <= self.cap {
            return;
        }
        let new_ptr = arena.alloc_uninit_slice::<T>(new_cap);
        // SAFETY: source holds `len` initialized, non-overlapping elements; destination has room.
        unsafe { ptr::copy_nonoverlapping(self.ptr.as_ptr(), new_ptr.as_ptr(), self.len) };
        self.ptr = new_ptr;
        self.cap = new_cap;
    }
}

impl<T> Deref for ArenaVec<'_, T> {
    type Target = [T];
    #[inline]
    fn deref(&self) -> &[T] {
        // SAFETY: `ptr[..len]` is always initialized and lives as long as `self`.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.len) }
    }
}

impl<T> DerefMut for ArenaVec<'_, T> {
    #[inline]
    fn deref_mut(&mut self) -> &mut [T] {
        // SAFETY: as `deref`, and `&mut self` guarantees unique access.
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len) }
    }
}

impl<T> Drop for ArenaVec<'_, T> {
    fn drop(&mut self) {
        // SAFETY: drop the initialized prefix in place. The buffer memory itself is owned by the
        // arena and reclaimed in bulk, so we never free it here.
        unsafe {
            ptr::drop_in_place(ptr::slice_from_raw_parts_mut(self.ptr.as_ptr(), self.len));
        }
    }
}

/// Owned iterator for [`ArenaVec`]. Yields each element by value; drops any un-yielded tail.
pub struct ArenaVecIntoIter<'a, T> {
    ptr: NonNull<T>,
    idx: usize,
    len: usize,
    _marker: PhantomData<(&'a (), T)>,
}

// SAFETY: same reasoning as `ArenaVec`'s impls — the iterator owns the `T`s it has not yet yielded.
unsafe impl<T: Send> Send for ArenaVecIntoIter<'_, T> {}
unsafe impl<T: Sync> Sync for ArenaVecIntoIter<'_, T> {}

impl<T> Iterator for ArenaVecIntoIter<'_, T> {
    type Item = T;
    #[inline]
    fn next(&mut self) -> Option<T> {
        if self.idx == self.len {
            return None;
        }
        // SAFETY: `ptr[idx]` is initialized and yielded exactly once.
        let item = unsafe { self.ptr.as_ptr().add(self.idx).read() };
        self.idx += 1;
        Some(item)
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.len - self.idx;
        (remaining, Some(remaining))
    }
}

impl<T> ExactSizeIterator for ArenaVecIntoIter<'_, T> {}

impl<T> Drop for ArenaVecIntoIter<'_, T> {
    fn drop(&mut self) {
        // SAFETY: drop the not-yet-yielded elements `ptr[idx..len]`.
        unsafe {
            ptr::drop_in_place(ptr::slice_from_raw_parts_mut(
                self.ptr.as_ptr().add(self.idx),
                self.len - self.idx,
            ));
        }
    }
}

impl<'a, T> IntoIterator for ArenaVec<'a, T> {
    type Item = T;
    type IntoIter = ArenaVecIntoIter<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        // Don't run `ArenaVec::drop`; the iterator takes over dropping the elements.
        let me = ManuallyDrop::new(self);
        ArenaVecIntoIter {
            ptr: me.ptr,
            idx: 0,
            len: me.len,
            _marker: PhantomData,
        }
    }
}

/// Draining iterator returned by [`ArenaVec::drain`]. Yields the drained elements by value and
/// drops any it doesn't yield. Because only end-anchored ranges are allowed, there is no trailing
/// region to move back.
pub struct ArenaVecDrain<'v, 'a, T> {
    base: NonNull<T>,
    idx: usize,
    end: usize,
    _marker: PhantomData<&'v mut ArenaVec<'a, T>>,
}

impl<T> Iterator for ArenaVecDrain<'_, '_, T> {
    type Item = T;
    #[inline]
    fn next(&mut self) -> Option<T> {
        if self.idx == self.end {
            return None;
        }
        // SAFETY: `base[idx]` is initialized and yielded exactly once.
        let item = unsafe { self.base.as_ptr().add(self.idx).read() };
        self.idx += 1;
        Some(item)
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.end - self.idx;
        (remaining, Some(remaining))
    }
}

impl<T> ExactSizeIterator for ArenaVecDrain<'_, '_, T> {}

impl<T> Drop for ArenaVecDrain<'_, '_, T> {
    fn drop(&mut self) {
        // SAFETY: drop the not-yet-yielded drained elements `base[idx..end]`.
        unsafe {
            ptr::drop_in_place(ptr::slice_from_raw_parts_mut(
                self.base.as_ptr().add(self.idx),
                self.end - self.idx,
            ));
        }
    }
}

impl<'b, T> IntoIterator for &'b ArenaVec<'_, T> {
    type Item = &'b T;
    type IntoIter = slice::Iter<'b, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'b, T> IntoIterator for &'b mut ArenaVec<'_, T> {
    type Item = &'b mut T;
    type IntoIter = slice::IterMut<'b, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter_mut()
    }
}

impl<T: fmt::Debug> fmt::Debug for ArenaVec<'_, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&**self, f)
    }
}

impl<T: PartialEq> PartialEq for ArenaVec<'_, T> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl<T: Eq> Eq for ArenaVec<'_, T> {}

impl<T: Hash> Hash for ArenaVec<'_, T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Hash::hash(&**self, state);
    }
}

/// A bump-allocation arena scoped to a single module analysis.
///
/// Allocation is a pointer bump; "freeing" is dropping the whole `Arena`. No per-node `free` ever
/// happens — destructors of arena-allocated values still run, but their memory is reclaimed in
/// bulk.
pub struct Arena(Bump);

// SAFETY: An `Arena` is owned by exactly one `analyze_ecmascript_module_internal` call. That call's
// future is polled by at most one thread at a time (a future is never polled concurrently), and the
// linker awaits its visitor callbacks sequentially — it never `join!`s or spawns work that
// allocates from the same `&Arena` on two threads at once. Concurrent allocation is the only thing
// bumpalo's `!Sync` guards against, so sharing `&Arena` across the await-point thread hops the
// executor may perform is sound. This is required so the analyzer's `Send` futures / `Sync` linker
// closures can hold an `&Arena`.
unsafe impl Sync for Arena {}

impl Arena {
    pub fn new() -> Self {
        Self(Bump::new())
    }

    /// A new arena that has pre-allocated room for at least `capacity` bytes, avoiding bumpalo's
    /// initial small-chunk doubling on large analyses.
    pub fn with_capacity(capacity: usize) -> Self {
        Self(Bump::with_capacity(capacity))
    }

    /// The underlying bump allocator.
    #[inline]
    pub fn bump(&self) -> &Bump {
        &self.0
    }

    /// Allocate `value` in the arena and return an owning [`BumpBox`].
    #[inline]
    pub fn alloc<T>(&self, value: T) -> BumpBox<'_, T> {
        BumpBox::new_in(value, &self.0)
    }

    /// Allocate `value` in the arena and return a shared reference to it.
    #[inline]
    pub fn alloc_ref<T>(&self, value: T) -> &T {
        self.0.alloc(value)
    }

    /// Allocate room for `capacity` `T`s and return a pointer to the (uninitialized) buffer.
    /// Returns a dangling, well-aligned pointer for an empty / ZST request.
    #[inline]
    fn alloc_uninit_slice<T>(&self, capacity: usize) -> NonNull<T> {
        if capacity == 0 || size_of::<T>() == 0 {
            return NonNull::dangling();
        }
        let layout = Layout::array::<T>(capacity).expect("arena allocation layout overflow");
        self.0.alloc_layout(layout).cast::<T>()
    }

    /// A new empty [`BumpVec`] backed by this arena.
    #[inline]
    pub fn vec<T>(&self) -> BumpVec<'_, T> {
        ArenaVec::new_in(self)
    }

    /// A [`BumpVec`] with capacity for `capacity` elements.
    #[inline]
    pub fn vec_with_capacity<T>(&self, capacity: usize) -> BumpVec<'_, T> {
        ArenaVec::with_capacity_in(self, capacity)
    }

    /// Collect `iter` into a [`BumpVec`] backed by this arena.
    #[inline]
    pub fn vec_from_iter<T>(&self, iter: impl IntoIterator<Item = T>) -> BumpVec<'_, T> {
        ArenaVec::from_iter_in(self, iter)
    }
}

impl Default for Arena {
    fn default() -> Self {
        Self::new()
    }
}
