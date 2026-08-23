use std::{cell::UnsafeCell, ptr::NonNull};

use crate::AllocationCounters;

/// Per-thread allocation and deallocation totals.
///
/// There is deliberately no process-wide byte counter here. Live memory is reported by
/// [`crate::TurboMalloc::memory_usage`], which asks the OS; a global atomic maintained from every
/// allocation site needed a thread-local buffer to amortize it, and that buffering was the bulk of
/// this module.
#[derive(Default)]
struct ThreadLocalCounter {
    allocation_counters: AllocationCounters,
}

impl ThreadLocalCounter {
    const fn new() -> Self {
        Self {
            allocation_counters: AllocationCounters::new(),
        }
    }

    #[inline(always)]
    fn add(&mut self, size: usize) {
        self.allocation_counters.allocations += size;
        self.allocation_counters.allocation_count += 1;
    }

    #[inline(always)]
    fn remove(&mut self, size: usize) {
        self.allocation_counters.deallocations += size;
        self.allocation_counters.deallocation_count += 1;
    }

    #[inline(always)]
    fn update(&mut self, old_size: usize, new_size: usize) {
        self.allocation_counters.deallocations += old_size;
        self.allocation_counters.deallocation_count += 1;
        self.allocation_counters.allocations += new_size;
        self.allocation_counters.allocation_count += 1;
    }

    fn unload(&mut self) {
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

    /// The counters are thread-local, and this test runs alongside others in the same process, so
    /// it measures deltas from whatever this thread has already allocated rather than absolutes.
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

    /// A reallocation counts as both a deallocation of the old block and an allocation of the new.
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
}
