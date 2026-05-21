//! A push-only vector that grows in fixed-size chunks instead of one
//! contiguous reallocating buffer.
//!
//! The trade-off vs. `Vec`:
//! - One pointer indirection per indexed access (chunk lookup → element).
//! - Slightly larger per-element overhead from chunk pointers (negligible at 64K elements/chunk).
//! - References returned by `index`/`index_mut` are stable across `push` (a future-useful property;
//!   not currently relied on).
//!
//! API is intentionally minimal — only the operations the trace server
//! needs (`push`, `len`, indexed access, `get`, `truncate`).

use std::{
    mem::MaybeUninit,
    ops::{Index, IndexMut},
};

/// Number of elements per chunk. Power of two so `idx / CHUNK_SIZE` and
/// `idx % CHUNK_SIZE` compile to a shift and a mask.
const CHUNK_SIZE: usize = 1 << 16;

/// Returns the chunk index and intra-chunk offset for an element index.
#[inline]
fn split_index(idx: usize) -> (usize, usize) {
    (idx / CHUNK_SIZE, idx % CHUNK_SIZE)
}

type Chunk<T> = Box<[MaybeUninit<T>; CHUNK_SIZE]>;

/// Allocate a fresh chunk on the heap without ever materializing a
/// `CHUNK_SIZE`-element array on the stack.
fn new_chunk<T>() -> Chunk<T> {
    // SAFETY: `Box<MaybeUninit<[MaybeUninit<T>; N]>>` and
    // `Box<[MaybeUninit<T>; N]>` have identical layout; the outer
    // `MaybeUninit` is just deferring initialization of the array of
    // uninitialized slots, which trivially satisfies "init".
    unsafe {
        let raw: Box<MaybeUninit<[MaybeUninit<T>; CHUNK_SIZE]>> = Box::new_uninit();
        raw.assume_init()
    }
}

pub struct ChunkedVec<T> {
    chunks: Vec<Chunk<T>>,
    len: usize,
}

impl<T> ChunkedVec<T> {
    pub fn new() -> Self {
        Self {
            chunks: Vec::new(),
            len: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.len
    }

    /// Append an element. Returns the index it was placed at.
    pub fn push(&mut self, value: T) -> usize {
        let idx = self.len;
        let (chunk_idx, off) = split_index(idx);
        if off == 0 {
            // Crossing into a new chunk — allocate it.
            debug_assert_eq!(chunk_idx, self.chunks.len());
            self.chunks.push(new_chunk());
        }
        self.chunks[chunk_idx][off].write(value);
        self.len += 1;
        idx
    }

    pub fn get(&self, idx: usize) -> Option<&T> {
        if idx >= self.len {
            return None;
        }
        let (chunk_idx, off) = split_index(idx);
        // SAFETY: `idx < self.len` ⇒ slot was previously written by
        // `push` and not freed by `truncate`.
        Some(unsafe { self.chunks[chunk_idx][off].assume_init_ref() })
    }
}

impl<T> Default for ChunkedVec<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Drop for ChunkedVec<T> {
    fn drop(&mut self) {
        // Drop every initialized slot in [new_len, old_len). Walk the
        // chunks one by one so we visit each `MaybeUninit<T>` exactly
        // once.
        let (last_chunk, last_chunk_len) = split_index(self.len);

        for (chunk_index, chunk) in self.chunks.iter_mut().enumerate() {
            let chunk_end = if chunk_index == last_chunk {
                last_chunk_len
            } else {
                CHUNK_SIZE
            };
            for slot in &mut chunk[0..chunk_end] {
                // SAFETY: the slot was initialized by a prior `push`
                // and has not yet been dropped by `truncate`.
                unsafe { slot.assume_init_drop() };
            }
        }
    }
}

impl<T> Index<usize> for ChunkedVec<T> {
    type Output = T;

    #[inline]
    fn index(&self, idx: usize) -> &T {
        assert!(idx < self.len, "index out of bounds: {idx} >= {}", self.len);
        let (chunk_idx, off) = split_index(idx);
        // SAFETY: `idx < self.len` ⇒ slot is initialized.
        unsafe { self.chunks[chunk_idx][off].assume_init_ref() }
    }
}

impl<T> IndexMut<usize> for ChunkedVec<T> {
    #[inline]
    fn index_mut(&mut self, idx: usize) -> &mut T {
        assert!(idx < self.len, "index out of bounds: {idx} >= {}", self.len);
        let (chunk_idx, off) = split_index(idx);
        // SAFETY: `idx < self.len` ⇒ slot is initialized.
        unsafe { self.chunks[chunk_idx][off].assume_init_mut() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty() {
        let v: ChunkedVec<u32> = ChunkedVec::new();
        assert_eq!(v.len(), 0);
        assert!(v.get(0).is_none());
    }

    #[test]
    fn push_within_first_chunk() {
        let mut v = ChunkedVec::new();
        for i in 0..1000u32 {
            assert_eq!(v.push(i), i as usize);
        }
        assert_eq!(v.len(), 1000);
        assert_eq!(v[0], 0);
        assert_eq!(v[999], 999);
        assert_eq!(v.get(1000), None);
    }

    #[test]
    fn push_across_chunk_boundary() {
        let mut v = ChunkedVec::new();
        // Push enough to span three chunks.
        let total = 3 * CHUNK_SIZE + 17;
        for i in 0..total {
            v.push(i);
        }
        assert_eq!(v.len(), total);
        assert_eq!(v[0], 0);
        assert_eq!(v[CHUNK_SIZE - 1], CHUNK_SIZE - 1);
        assert_eq!(v[CHUNK_SIZE], CHUNK_SIZE);
        assert_eq!(v[2 * CHUNK_SIZE], 2 * CHUNK_SIZE);
        assert_eq!(v[total - 1], total - 1);
    }

    #[test]
    fn index_mut_writes_through() {
        let mut v = ChunkedVec::new();
        for i in 0..(CHUNK_SIZE + 5) {
            v.push(i);
        }
        v[CHUNK_SIZE + 3] = 9999;
        assert_eq!(v[CHUNK_SIZE + 3], 9999);
    }

    #[test]
    fn drops_elements_on_drop() {
        use std::rc::Rc;
        let counter = Rc::new(());
        {
            let mut v: ChunkedVec<Rc<()>> = ChunkedVec::new();
            // Span multiple chunks so we exercise the multi-chunk drop path.
            let total = 2 * CHUNK_SIZE + 5;
            for _ in 0..total {
                v.push(counter.clone());
            }
            assert_eq!(Rc::strong_count(&counter), total + 1);
        } // ChunkedVec drop runs here, dropping the remaining CHUNK_SIZE clones.
        assert_eq!(Rc::strong_count(&counter), 1);
    }
}
