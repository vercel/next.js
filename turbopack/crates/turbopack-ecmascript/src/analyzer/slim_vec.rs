//! `SlimVec<T>`: a `Vec`-alike with `u32` len and capacity instead of `usize`.
//!
//! 16 bytes on 64-bit platforms (8 B ptr + 4 B len + 4 B cap) vs 24 B for `Vec<T>`.
//! Used as the args storage for [`crate::analyzer::JsValue::Call`] and `New` so those
//! variant payloads fit in 32 B. Unlike `Box<[T]>`, conversion from `Vec` is zero-cost:
//! we keep whatever capacity the `Vec` had instead of calling `shrink_to_fit`, avoiding
//! a real realloc on every `Call`/`New` construction.

use std::{
    alloc::Layout,
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
    ptr::NonNull,
    slice,
};

/// `Vec`-alike with `u32` len + cap. Invariant: `len <= cap`, and `(ptr, cap)` is a live
/// allocation with capacity `cap * size_of::<T>()` produced by `Vec`'s allocator whenever
/// `cap > 0` (since every `SlimVec` originates from a `Vec` or is empty).
pub struct SlimVec<T> {
    ptr: NonNull<T>,
    len: u32,
    cap: u32,
    _marker: PhantomData<T>,
}

// SAFETY: mirrors `Vec<T>`'s Send/Sync bounds.
unsafe impl<T: Send> Send for SlimVec<T> {}
unsafe impl<T: Sync> Sync for SlimVec<T> {}

impl<T> SlimVec<T> {
    #[inline]
    pub const fn new() -> Self {
        Self {
            ptr: NonNull::dangling(),
            len: 0,
            cap: 0,
            _marker: PhantomData,
        }
    }

    /// Construct from a `Vec<T>` with no reallocation.
    ///
    /// Panics in debug if the `Vec`'s len or capacity exceeds `u32::MAX`. That never
    /// happens for the analyzer's call args (AST sizes are bounded).
    #[inline]
    pub fn from_vec(vec: Vec<T>) -> Self {
        let mut vec = ManuallyDrop::new(vec);
        let ptr = vec.as_mut_ptr();
        let len = vec.len();
        let cap = vec.capacity();
        debug_assert!(len <= u32::MAX as usize);
        debug_assert!(cap <= u32::MAX as usize);
        Self {
            // `Vec` guarantees a non-null pointer even when cap == 0 (it's dangling).
            ptr: unsafe { NonNull::new_unchecked(ptr) },
            len: len as u32,
            cap: cap as u32,
            _marker: PhantomData,
        }
    }

    /// Reverse of [`from_vec`]: hand the allocation back to a `Vec`. Zero-cost.
    #[inline]
    pub fn into_vec(self) -> Vec<T> {
        let me = ManuallyDrop::new(self);
        // SAFETY: we originated from `Vec`'s allocator with (ptr, len, cap) as invariants.
        unsafe { Vec::from_raw_parts(me.ptr.as_ptr(), me.len as usize, me.cap as usize) }
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len as usize
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    pub fn as_slice(&self) -> &[T] {
        // SAFETY: invariant holds — len elements of T initialized at `ptr`.
        unsafe { slice::from_raw_parts(self.ptr.as_ptr(), self.len as usize) }
    }

    #[inline]
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        // SAFETY: see `as_slice`.
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.len as usize) }
    }

    #[inline]
    pub fn iter(&self) -> slice::Iter<'_, T> {
        self.as_slice().iter()
    }

    #[inline]
    pub fn iter_mut(&mut self) -> slice::IterMut<'_, T> {
        self.as_mut_slice().iter_mut()
    }
}

impl<T> Default for SlimVec<T> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Drop for SlimVec<T> {
    fn drop(&mut self) {
        if self.cap == 0 {
            return;
        }
        // Hand the allocation to a `Vec` so it drops elements + deallocates correctly.
        // SAFETY: (ptr, len, cap) originated from `Vec`'s allocator.
        let _ =
            unsafe { Vec::from_raw_parts(self.ptr.as_ptr(), self.len as usize, self.cap as usize) };
        let _ = Layout::new::<T>(); // silence unused import in zero-T builds (no-op)
    }
}

impl<T> Deref for SlimVec<T> {
    type Target = [T];
    #[inline]
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

impl<T> DerefMut for SlimVec<T> {
    #[inline]
    fn deref_mut(&mut self) -> &mut [T] {
        self.as_mut_slice()
    }
}

impl<T: Clone> Clone for SlimVec<T> {
    fn clone(&self) -> Self {
        Self::from_vec(self.as_slice().to_vec())
    }
}

impl<T: fmt::Debug> fmt::Debug for SlimVec<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self.as_slice(), f)
    }
}

impl<T: PartialEq> PartialEq for SlimVec<T> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.as_slice() == other.as_slice()
    }
}

impl<T: Eq> Eq for SlimVec<T> {}

impl<T: Hash> Hash for SlimVec<T> {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_slice().hash(state);
    }
}

impl<T> From<Vec<T>> for SlimVec<T> {
    #[inline]
    fn from(vec: Vec<T>) -> Self {
        Self::from_vec(vec)
    }
}

impl<T> From<SlimVec<T>> for Vec<T> {
    #[inline]
    fn from(v: SlimVec<T>) -> Self {
        v.into_vec()
    }
}

impl<T> IntoIterator for SlimVec<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.into_vec().into_iter()
    }
}

impl<'a, T> IntoIterator for &'a SlimVec<T> {
    type Item = &'a T;
    type IntoIter = slice::Iter<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<'a, T> IntoIterator for &'a mut SlimVec<T> {
    type Item = &'a mut T;
    type IntoIter = slice::IterMut<'a, T>;
    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.iter_mut()
    }
}
