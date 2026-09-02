//! Allocation accounting.
//!
//! Every build tracks per-thread allocation totals, which the tracing layer reads through
//! [`allocation_counters`] to attribute allocations to spans.
//!
//! Builds without the `custom_allocator` feature additionally maintain a process-wide counter of
//! live bytes, which backs [`crate::TurboMalloc::memory_usage`]. With mimalloc that figure comes
//! from the allocator instead, so [`global`] is not compiled in: the atomic would otherwise be
//! contended by every thread on every allocation, and the thread-local buffering that makes it
//! affordable is inlined into every allocation site in the binary.

use std::{cell::UnsafeCell, ptr::NonNull};

#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
pub use self::global::get;
use crate::AllocationCounters;

/// The process-wide live-bytes counter, and the buffering that keeps updating it affordable.
///
/// Only compiled without the `custom_allocator` feature; see the module docs. Each thread holds
/// its buffer in its own [`ThreadLocalCounter`] and passes it in, so the counter's state lives in
/// exactly one place.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
mod global {
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Tracks the current total amount of memory allocated through all the
    /// [`super::ThreadLocalCounter`] instances.  This is an overestimate as individual threads
    /// 'preallocate' a [TARGET_BUFFER] bytes to reduce the number of global synchronizations.
    /// This means at any given time this might overcount by up to [MAX_BUFFER] bytes for each
    /// thread.
    static ALLOCATED: AtomicUsize = AtomicUsize::new(0);
    const KB: usize = 1024;
    /// When global counter is updates we will keep a thread-local buffer of this
    /// size.
    pub const TARGET_BUFFER: usize = 100 * KB;
    /// When the thread-local buffer would exceed this size, we will update the
    /// global counter.
    pub const MAX_BUFFER: usize = 200 * KB;

    /// Live bytes (allocations minus deallocations) across all threads.
    pub fn get() -> usize {
        ALLOCATED.load(Ordering::Relaxed)
    }

    /// Takes `size` from the global counter, refilling `buffer` while it is there.
    ///
    /// Kept out of the allocator's inlined hot path: the buffer means this runs about once per
    /// [`TARGET_BUFFER`] bytes rather than once per allocation.
    #[inline(never)]
    pub fn refill(buffer: &mut usize, size: usize) {
        debug_assert!(*buffer < size);
        let offset = size - *buffer + TARGET_BUFFER;
        *buffer = TARGET_BUFFER;
        ALLOCATED.fetch_add(offset, Ordering::Relaxed);
    }

    /// Returns everything buffered above [`TARGET_BUFFER`] to the global counter.
    #[inline(never)]
    pub fn flush_excess(buffer: &mut usize) {
        debug_assert!(*buffer > MAX_BUFFER);
        let offset = *buffer - TARGET_BUFFER;
        *buffer = TARGET_BUFFER;
        ALLOCATED.fetch_sub(offset, Ordering::Relaxed);
    }

    /// Returns everything buffered, for a thread that is going away.
    pub fn flush_all(buffer: &mut usize) {
        if *buffer > 0 {
            ALLOCATED.fetch_sub(*buffer, Ordering::Relaxed);
            *buffer = 0;
        }
    }

    impl super::ThreadLocalCounter {
        /// Charges `size` against this thread's buffer, refilling it from the global counter when
        /// it runs dry. Does nothing with `custom_allocator`, where there is no global
        /// counter.
        #[inline(always)]
        pub(super) fn buffered_add(&mut self, size: usize) {
            if self.buffer >= size {
                self.buffer -= size;
            } else {
                refill(&mut self.buffer, size);
            }
        }

        /// Returns `size` to this thread's buffer, flushing the excess to the global counter once
        /// the buffer grows past [`global::MAX_BUFFER`]. Does nothing with
        /// `custom_allocator`.
        #[inline(always)]
        pub(super) fn buffered_remove(&mut self, size: usize) {
            self.buffer += size;
            if self.buffer > MAX_BUFFER {
                flush_excess(&mut self.buffer);
            }
        }
    }
}

/// Per-thread allocation and deallocation totals.
#[derive(Default)]
struct ThreadLocalCounter {
    /// Thread-local buffer of allocated bytes that have been added to the
    /// global counter desprite not being allocated yet. It is unsigned so that
    /// means the global counter is always equal or greater than the real
    /// value.
    #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
    buffer: usize,
    allocation_counters: AllocationCounters,
}

impl ThreadLocalCounter {
    const fn new() -> Self {
        Self {
            #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
            buffer: 0,
            allocation_counters: AllocationCounters::new(),
        }
    }

    #[inline(always)]
    fn add(&mut self, size: usize) {
        self.allocation_counters.allocations += size;
        self.allocation_counters.allocation_count += 1;

        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        self.buffered_add(size);
    }

    #[inline(always)]
    fn remove(&mut self, size: usize) {
        self.allocation_counters.deallocations += size;
        self.allocation_counters.deallocation_count += 1;

        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        self.buffered_remove(size);
    }

    #[inline(always)]
    fn update(&mut self, old_size: usize, new_size: usize) {
        self.allocation_counters.deallocations += old_size;
        self.allocation_counters.deallocation_count += 1;
        self.allocation_counters.allocations += new_size;
        self.allocation_counters.allocation_count += 1;

        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        {
            match old_size.cmp(&new_size) {
                std::cmp::Ordering::Equal => {}
                std::cmp::Ordering::Less => self.buffered_add(new_size - old_size),
                std::cmp::Ordering::Greater => self.buffered_remove(old_size - new_size),
            }
        }
    }

    fn unload(&mut self) {
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        global::flush_all(&mut self.buffer);
        self.allocation_counters = AllocationCounters::default();
    }
}

thread_local! {
  static LOCAL_COUNTER: UnsafeCell<ThreadLocalCounter> = const {UnsafeCell::new(ThreadLocalCounter::new())};
}

pub fn allocation_counters() -> AllocationCounters {
    with_local_counter(|local| local.allocation_counters.clone())
}

pub fn reset_allocation_counters(start: AllocationCounters) {
    with_local_counter(|local| local.allocation_counters = start);
}

#[inline(always)]
fn with_local_counter<T>(f: impl FnOnce(&mut ThreadLocalCounter) -> T) -> T {
    LOCAL_COUNTER.with(|local| {
        let ptr = local.get();
        // SAFETY: This is a thread local.
        let mut local = unsafe { NonNull::new_unchecked(ptr) };
        f(unsafe { local.as_mut() })
    })
}

/// Adds some `size` to the global counter in a thread-local buffered way.
#[inline(always)]
pub fn add(size: usize) {
    with_local_counter(|local| local.add(size));
}

/// Removes some `size` to the global counter in a thread-local buffered way.
#[inline(always)]
pub fn remove(size: usize) {
    with_local_counter(|local| local.remove(size));
}

/// Updates the global counter for a reallocation in a thread-local buffered way.
#[inline(always)]
pub fn update(old_size: usize, new_size: usize) {
    with_local_counter(|local| local.update(old_size, new_size));
}

/// Clears this thread's counters. Called when a thread stops, so a recycled thread does not
/// inherit the previous occupant's totals.
pub fn flush() {
    with_local_counter(|local| local.unload());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_allocations_and_deallocations() {
        let start = allocation_counters();

        add(100);
        add(250);
        remove(100);

        let after = allocation_counters();
        assert_eq!(after.allocations - start.allocations, 350);
        assert_eq!(after.allocation_count - start.allocation_count, 2);
        assert_eq!(after.deallocations - start.deallocations, 100);
        assert_eq!(after.deallocation_count - start.deallocation_count, 1);
    }

    #[test]
    fn update_counts_both_sides() {
        let start = allocation_counters();

        update(40, 100);

        let after = allocation_counters();
        assert_eq!(after.allocations - start.allocations, 100);
        assert_eq!(after.allocation_count - start.allocation_count, 1);
        assert_eq!(after.deallocations - start.deallocations, 40);
        assert_eq!(after.deallocation_count - start.deallocation_count, 1);
    }

    /// `reset_allocation_counters` restores a previously captured value, which is how the tracing
    /// layer excludes its own writes from a span's totals.
    #[test]
    fn reset_restores_a_captured_value() {
        let start = allocation_counters();
        add(4096);
        assert!(allocation_counters().allocations > start.allocations);

        reset_allocation_counters(start.clone());
        assert_eq!(allocation_counters().allocations, start.allocations);
        assert_eq!(
            allocation_counters().allocation_count,
            start.allocation_count
        );
    }

    /// `flush` is called when a thread stops so a thread reusing the slot starts clean.
    #[test]
    fn flush_clears_this_threads_counters() {
        std::thread::spawn(|| {
            add(1234);
            assert!(allocation_counters().allocations >= 1234);
            flush();
            let cleared = allocation_counters();
            assert_eq!(cleared.allocations, 0);
            assert_eq!(cleared.allocation_count, 0);
            assert_eq!(cleared.deallocations, 0);
            assert_eq!(cleared.deallocation_count, 0);
        })
        .join()
        .unwrap();
    }

    /// The buffered global counter only exists without the `custom_allocator` feature.
    ///
    /// Asserts the buffering arithmetic on a [`ThreadLocalCounter`] directly: how much a thread
    /// keeps buffered, and therefore when it has to touch the global. The global itself is not
    /// read — it is process-wide, and this binary installs [`crate::TurboMalloc`] as its global
    /// allocator, so every other thread moves it concurrently. `buffer` is thread-local and
    /// exact.
    #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
    #[test]
    fn counting() {
        use super::global::{MAX_BUFFER, TARGET_BUFFER};

        let mut local = ThreadLocalCounter::new();

        // A fresh counter has nothing buffered, so the first allocation has to reach the global,
        // taking a full TARGET_BUFFER while it is there.
        local.add(100);
        assert_eq!(local.buffer, TARGET_BUFFER);

        // Further small allocations come straight out of the buffer.
        local.add(100);
        assert_eq!(local.buffer, TARGET_BUFFER - 100);

        // An allocation larger than the buffer refills it from the global.
        local.add(MAX_BUFFER);
        assert_eq!(local.buffer, TARGET_BUFFER);

        // Frees go back into the buffer while it stays under MAX_BUFFER.
        local.remove(100);
        assert_eq!(local.buffer, TARGET_BUFFER + 100);

        // Past MAX_BUFFER the excess is flushed back to the global, down to TARGET_BUFFER.
        local.remove(MAX_BUFFER);
        assert_eq!(local.buffer, TARGET_BUFFER);

        // A reallocation that grows by less than the buffer is served locally.
        local.update(100, 200);
        assert_eq!(local.buffer, TARGET_BUFFER - 100);

        // One that grows beyond it refills.
        local.update(0, MAX_BUFFER);
        assert_eq!(local.buffer, TARGET_BUFFER);

        // One that shrinks beyond MAX_BUFFER flushes the excess.
        local.update(MAX_BUFFER + 1, 0);
        assert_eq!(local.buffer, TARGET_BUFFER);

        // Unloading returns whatever is still buffered.
        local.unload();
        assert_eq!(local.buffer, 0);
    }
}
