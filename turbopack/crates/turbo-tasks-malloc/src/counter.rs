//! Allocation accounting.
//!
//! Every build tracks per-thread allocation totals, which the tracing layer reads through
//! [`allocation_counters`] to attribute allocations to spans.
//!
//! Builds without the `custom_allocator` feature additionally maintain [`ALLOCATED`], a
//! process-wide counter of live bytes that backs [`crate::TurboMalloc::memory_usage`]. With
//! mimalloc that figure comes from the allocator instead, so none of this is compiled in: the
//! atomic would otherwise be contended by every thread on every allocation, and the thread-local
//! buffering that makes it affordable is inlined into every allocation site in the binary.

#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::{cell::UnsafeCell, ptr::NonNull};

use crate::AllocationCounters;

/// Tracks the current total amount of memory allocated through all the [ThreadLocalCounter]
/// instances.  This is an overestimate as individual threads 'preallocate' a [TARGET_BUFFER] bytes
/// to reduce the number of global synchronizations.  This means at any given time this might
/// overcount by up to [MAX_BUFFER] bytes for each thread.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
static ALLOCATED: AtomicUsize = AtomicUsize::new(0);
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
const KB: usize = 1024;
/// When global counter is updates we will keep a thread-local buffer of this
/// size.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
const TARGET_BUFFER: usize = 100 * KB;
/// When the thread-local buffer would exceed this size, we will update the
/// global counter.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
const MAX_BUFFER: usize = 200 * KB;

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
        if self.buffer >= size {
            self.buffer -= size;
        } else {
            add_slow(self, size);
        }
    }

    #[inline(always)]
    fn remove(&mut self, size: usize) {
        self.allocation_counters.deallocations += size;
        self.allocation_counters.deallocation_count += 1;
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        {
            self.buffer += size;
            if self.buffer > MAX_BUFFER {
                remove_slow(self);
            }
        }
    }

    #[inline(always)]
    fn update(&mut self, old_size: usize, new_size: usize) {
        self.allocation_counters.deallocations += old_size;
        self.allocation_counters.deallocation_count += 1;
        self.allocation_counters.allocations += new_size;
        self.allocation_counters.allocation_count += 1;
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        match old_size.cmp(&new_size) {
            std::cmp::Ordering::Equal => {}
            std::cmp::Ordering::Less => {
                let size = new_size - old_size;
                if self.buffer >= size {
                    self.buffer -= size;
                } else {
                    add_slow(self, size);
                }
            }
            std::cmp::Ordering::Greater => {
                let size = old_size - new_size;
                self.buffer += size;
                if self.buffer > MAX_BUFFER {
                    remove_slow(self);
                }
            }
        }
    }

    fn unload(&mut self) {
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        if self.buffer > 0 {
            ALLOCATED.fetch_sub(self.buffer, Ordering::Relaxed);
            self.buffer = 0;
        }
        self.allocation_counters = AllocationCounters::default();
    }
}

// Keep the uncommon atomic updates out of the allocator's inlined hot path.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
#[cold]
#[inline(never)]
fn add_slow(local: &mut ThreadLocalCounter, size: usize) {
    debug_assert!(local.buffer < size);
    let offset = size - local.buffer + TARGET_BUFFER;
    local.buffer = TARGET_BUFFER;
    ALLOCATED.fetch_add(offset, Ordering::Relaxed);
}

#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
#[cold]
#[inline(never)]
fn remove_slow(local: &mut ThreadLocalCounter) {
    debug_assert!(local.buffer > MAX_BUFFER);
    let offset = local.buffer - TARGET_BUFFER;
    local.buffer = TARGET_BUFFER;
    ALLOCATED.fetch_sub(offset, Ordering::Relaxed);
}

thread_local! {
  static LOCAL_COUNTER: UnsafeCell<ThreadLocalCounter> = const {UnsafeCell::new(ThreadLocalCounter::new())};
}

/// Live bytes (allocations minus deallocations) across all threads.
///
/// Only maintained without the `custom_allocator` feature; see the module docs.
#[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
pub fn get() -> usize {
    ALLOCATED.load(Ordering::Relaxed)
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
