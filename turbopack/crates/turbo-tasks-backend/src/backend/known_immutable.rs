//! A lock-free set of task ids that are known to be immutable.
//!
//! Reading a cell of an immutable task needs no dependency edges, as an immutable task can never
//! be invalidated. Checking that requires the task lock, though, and cell reads lock the reader
//! task first (see `try_read_task_cell`). This set lets a cell read skip the reader task entirely
//! when the task being read is already known to be immutable.
//!
//! A task id is only added after its `immutable` flag was set under the task lock (or restored
//! with it). The set may miss immutable tasks (false negatives are fine: the reader then takes the
//! normal path, which re-checks the flag under the task lock), but it must never contain a task
//! that isn't immutable. That holds because:
//! - the `immutable` flag only ever changes from `false` to `true`, and eviction and restore keep
//!   it;
//! - task ids aren't reused (`IdFactoryWithReuse::reuse` has no callers, and GC doesn't recycle the
//!   ids of collected tasks). Recycling task ids would require removing them from this set while no
//!   reader can observe the id;
//! - transient and persistent task ids don't overlap, and each backend has its own set.

use std::{
    ptr::null_mut,
    sync::atomic::{AtomicPtr, AtomicU64, Ordering},
};

use turbo_tasks::TaskId;

/// Number of id bits addressed by one segment.
const SEGMENT_BITS: u32 = 16;
/// Number of ids per segment.
const SEGMENT_IDS: usize = 1 << SEGMENT_BITS;
/// Number of `u64` words per segment.
const SEGMENT_WORDS: usize = SEGMENT_IDS / 64;
/// Number of segments covering the whole `u32` id space.
const SEGMENTS: usize = 1 << (u32::BITS - SEGMENT_BITS);

type Segment = [AtomicU64; SEGMENT_WORDS];

/// A lock-free bitmap of task ids, see the module docs.
///
/// Segments of 64Ki ids (8 KiB) are allocated on first insertion and never freed before the set
/// is dropped. The segment directory covers the whole `u32` id space (64Ki pointers, 512 KiB).
pub struct KnownImmutable {
    segments: Box<[AtomicPtr<Segment>]>,
}

impl Default for KnownImmutable {
    fn default() -> Self {
        Self::new()
    }
}

impl KnownImmutable {
    pub fn new() -> Self {
        Self {
            segments: (0..SEGMENTS).map(|_| AtomicPtr::new(null_mut())).collect(),
        }
    }

    fn position(task_id: TaskId) -> (usize, usize, u64) {
        let id = *task_id;
        let segment = (id >> SEGMENT_BITS) as usize;
        let index = (id as usize) & (SEGMENT_IDS - 1);
        (segment, index / 64, 1 << (index % 64))
    }

    /// Whether the task is known to be immutable. Lock-free and allocation-free.
    ///
    /// A `true` result is only returned after the [`Self::insert`] of the task id happened, which
    /// itself happened after the task's `immutable` flag was set.
    #[inline]
    pub fn contains(&self, task_id: TaskId) -> bool {
        if cfg!(feature = "verify_immutable") {
            // Every read takes the normal path, so that immutability is verified.
            return false;
        }
        let (segment, word, bit) = Self::position(task_id);
        let segment = self.segments[segment].load(Ordering::Acquire);
        if segment.is_null() {
            return false;
        }
        // SAFETY: segments are only freed when `self` is dropped.
        let segment = unsafe { &*segment };
        segment[word].load(Ordering::Acquire) & bit != 0
    }

    /// Adds a task id. Must only be called after the task's `immutable` flag was set.
    ///
    /// Allocates the id's segment on its first insertion. Doesn't write when the id is already in
    /// the set, so that repeated insertions of a widely read task don't contend on the cache line.
    pub fn insert(&self, task_id: TaskId) {
        let (segment, word, bit) = Self::position(task_id);
        let slot = &self.segments[segment];
        let mut ptr = slot.load(Ordering::Acquire);
        if ptr.is_null() {
            let new = Box::into_raw(Box::new(std::array::from_fn::<_, SEGMENT_WORDS, _>(|_| {
                AtomicU64::new(0)
            })));
            match slot.compare_exchange(null_mut(), new, Ordering::AcqRel, Ordering::Acquire) {
                Ok(_) => ptr = new,
                Err(existing) => {
                    // SAFETY: `new` was never published.
                    drop(unsafe { Box::from_raw(new) });
                    ptr = existing;
                }
            }
        }
        // SAFETY: segments are only freed when `self` is dropped.
        let segment = unsafe { &*ptr };
        if segment[word].load(Ordering::Relaxed) & bit == 0 {
            segment[word].fetch_or(bit, Ordering::Release);
        }
    }
}

impl Drop for KnownImmutable {
    fn drop(&mut self) {
        for slot in self.segments.iter_mut() {
            let ptr = *slot.get_mut();
            if !ptr.is_null() {
                // SAFETY: the pointer came from `Box::into_raw` and is dropped only once.
                drop(unsafe { Box::from_raw(ptr) });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, thread};

    use turbo_tasks::TaskId;

    use super::KnownImmutable;

    fn id(n: u32) -> TaskId {
        TaskId::new(n).unwrap()
    }

    #[test]
    #[cfg_attr(feature = "verify_immutable", ignore)]
    fn insert_and_contains() {
        let set = KnownImmutable::new();
        for n in [1, 63, 64, 65, 65535, 65536, 0x4000_0001, u32::MAX] {
            assert!(!set.contains(id(n)));
            set.insert(id(n));
            assert!(set.contains(id(n)));
        }
        assert!(!set.contains(id(2)));
        assert!(!set.contains(id(65537)));
        assert!(!set.contains(id(0x4000_0002)));
    }

    #[test]
    #[cfg_attr(feature = "verify_immutable", ignore)]
    fn concurrent_inserts() {
        let set = Arc::new(KnownImmutable::new());
        let threads: Vec<_> = (0..8u32)
            .map(|t| {
                let set = set.clone();
                thread::spawn(move || {
                    for n in 0..10_000u32 {
                        set.insert(id(1 + n * 8 + t));
                    }
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        for n in 1..=80_000 {
            assert!(set.contains(id(n)), "{n}");
        }
        assert!(!set.contains(id(80_001)));
    }
}
