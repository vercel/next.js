//! A push-only vector that grows in fixed-size chunks instead of one
//! contiguous reallocating buffer.
//!
//! `Vec<T>` doubles its backing buffer on overflow, which is fine for
//! small workloads but expensive when the per-element size is large and
//! the element count is huge. The trace server pushes ~47M `Span`s of
//! ~376 bytes each during a load — every doubling copies gigabytes of
//! span data. `ChunkedVec` instead allocates a fresh chunk of `CHUNK_SIZE`
//! elements on overflow, so growth cost is constant per chunk and there
//! are no copies of existing elements.
//!
//! The trade-off vs. `Vec`:
//! - One pointer indirection per indexed access (chunk lookup → element).
//! - Slightly larger per-element overhead from chunk pointers (negligible at 64K elements/chunk ×
//!   376 bytes = 24 MB/chunk).
//! - References returned by `index`/`index_mut` are stable across `push` (a future-useful property;
//!   not currently relied on).
//!
//! Each chunk is a `Box<[MaybeUninit<T>; CHUNK_SIZE]>` rather than a
//! `Vec<T>` because chunks are fixed-size and never reallocate — the
//! per-chunk `len`/`capacity` fields a `Vec` would carry are pure
//! redundancy when `ChunkedVec::len` is the sole source of truth for the
//! init/uninit cutoff.
//!
//! API is intentionally minimal — only the operations the trace server
//! needs (`push`, `len`, indexed access, `get`, `truncate`).

use std::{
    mem::MaybeUninit,
    ops::{Index, IndexMut},
};

/// Number of elements per chunk. Power of two so `idx / CHUNK_SIZE` and
/// `idx % CHUNK_SIZE` compile to a shift and a mask. 64K elements ×
/// 376-byte `Span` = 24 MB per chunk; large allocations like this are
/// served via `mmap`, so they're naturally page-aligned.
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

    /// Drop all elements after `new_len`. Used by `Store::reset` with
    /// `new_len = 1` to keep the root span and discard everything else.
    pub fn truncate(&mut self, new_len: usize) {
        if new_len >= self.len {
            return;
        }
        let old_len = self.len;
        // Set len early so any panic in element drops doesn't leave us
        // with a `len` that points at already-dropped slots.
        self.len = new_len;

        // Drop every initialized slot in [new_len, old_len). Walk the
        // chunks one by one so we visit each `MaybeUninit<T>` exactly
        // once.
        let (first_chunk, first_off) = split_index(new_len);
        // `old_len > new_len >= 0` here, so `old_len > 0` and the last
        // populated chunk is `(old_len - 1) / CHUNK_SIZE`. The number
        // of initialized slots in that chunk is `((old_len - 1) %
        // CHUNK_SIZE) + 1` — which is `CHUNK_SIZE` when `old_len` lands
        // exactly on a chunk boundary.
        let last_chunk = (old_len - 1) / CHUNK_SIZE;
        let last_chunk_end = ((old_len - 1) % CHUNK_SIZE) + 1;

        for chunk_idx in first_chunk..=last_chunk {
            let chunk = &mut self.chunks[chunk_idx];
            let start = if chunk_idx == first_chunk {
                first_off
            } else {
                0
            };
            let end = if chunk_idx == last_chunk {
                last_chunk_end
            } else {
                CHUNK_SIZE
            };
            for slot in &mut chunk[start..end] {
                // SAFETY: the slot was initialized by a prior `push`
                // and has not yet been dropped by `truncate`.
                unsafe { slot.assume_init_drop() };
            }
        }

        // Free chunks that no longer hold any initialized slots.
        let chunks_to_keep = if first_off == 0 {
            first_chunk
        } else {
            first_chunk + 1
        };
        self.chunks.truncate(chunks_to_keep);
    }
}

impl<T> Default for ChunkedVec<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Drop for ChunkedVec<T> {
    fn drop(&mut self) {
        // Drops every initialized slot; the `Vec<Chunk<T>>` then frees
        // the chunk allocations themselves on its own drop.
        self.truncate(0);
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
    fn truncate_within_first_chunk() {
        let mut v = ChunkedVec::new();
        for i in 0..100 {
            v.push(i);
        }
        v.truncate(1);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0], 0);
        assert!(v.get(1).is_none());
    }

    #[test]
    fn truncate_across_chunks() {
        let mut v = ChunkedVec::new();
        for i in 0..(2 * CHUNK_SIZE + 10) {
            v.push(i);
        }
        // Truncate to a length that lands on a chunk boundary.
        v.truncate(CHUNK_SIZE);
        assert_eq!(v.len(), CHUNK_SIZE);
        assert_eq!(v[CHUNK_SIZE - 1], CHUNK_SIZE - 1);
        assert!(v.get(CHUNK_SIZE).is_none());
        // Truncate further into the first chunk.
        v.truncate(50);
        assert_eq!(v.len(), 50);
        assert_eq!(v[49], 49);
        assert!(v.get(50).is_none());
    }

    #[test]
    fn truncate_to_or_above_len_is_noop() {
        let mut v = ChunkedVec::new();
        for i in 0..10 {
            v.push(i);
        }
        v.truncate(10);
        assert_eq!(v.len(), 10);
        v.truncate(100);
        assert_eq!(v.len(), 10);
    }

    #[test]
    fn push_after_truncate_continues_at_correct_index() {
        let mut v = ChunkedVec::new();
        for i in 0..(CHUNK_SIZE + 5) {
            v.push(i);
        }
        v.truncate(3);
        assert_eq!(v.push(42), 3);
        assert_eq!(v.len(), 4);
        assert_eq!(v[3], 42);
    }

    #[test]
    fn drops_elements_on_truncate_and_drop() {
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
            // Truncate into the first chunk; should drop everything except
            // the first 10 clones.
            v.truncate(10);
            assert_eq!(Rc::strong_count(&counter), 10 + 1);
            // Truncate to a chunk boundary after pushing more; verify the
            // boundary case (off == 0) drops the whole trailing chunk.
            for _ in 0..(CHUNK_SIZE - 10) {
                v.push(counter.clone());
            }
            assert_eq!(v.len(), CHUNK_SIZE);
            assert_eq!(Rc::strong_count(&counter), CHUNK_SIZE + 1);
            v.truncate(CHUNK_SIZE);
            assert_eq!(Rc::strong_count(&counter), CHUNK_SIZE + 1);
        } // ChunkedVec drop runs here, dropping the remaining CHUNK_SIZE clones.
        assert_eq!(Rc::strong_count(&counter), 1);
    }
}
