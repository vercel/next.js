use std::{
    cell::UnsafeCell,
    ptr::NonNull,
    sync::{
        LazyLock,
        atomic::{AtomicUsize, Ordering},
    },
};

use crate::AllocationCounters;

static GLOBAL: LazyLock<Vec<AtomicCounters>> = LazyLock::new(|| {
    let size = match std::thread::available_parallelism() {
        Ok(s) => s.into(),
        Err(_) => 128,
    };
    let mut vec = Vec::with_capacity(size);
    for _ in 0..size {
        vec.push(AtomicCounters::new());
    }
    vec
});

static INDEX: AtomicUsize = AtomicUsize::new(0);

/// Returns a reference to an entry in global
fn get_global_ref() -> &'static AtomicCounters {
    let index = INDEX.fetch_add(1, Ordering::AcqRel) & (GLOBAL.len() - 1);

    GLOBAL.get(index).unwrap()
}

#[repr(align(64))] // cache line aligned to reduce false sharing between adjacent entries
struct AtomicCounters {
    allocations: AtomicUsize,
    deallocations: AtomicUsize,
    allocation_count: AtomicUsize,
    deallocation_count: AtomicUsize,
}

impl AtomicCounters {
    const fn new() -> Self {
        Self {
            allocations: AtomicUsize::new(0),
            deallocations: AtomicUsize::new(0),
            allocation_count: AtomicUsize::new(0),
            deallocation_count: AtomicUsize::new(0),
        }
    }
}

struct ThreadLocalCounter {
    counters: AllocationCounters,
    global: Option<&'static AtomicCounters>,
}

impl ThreadLocalCounter {
    const fn new() -> Self {
        Self {
            global: None,
            counters: AllocationCounters::new(),
        }
    }

    fn add(&mut self, size: usize, global: &AtomicCounters) {
        self.counters.allocations += size;
        self.counters.allocation_count += 1;

        global.allocations.fetch_add(size, Ordering::Relaxed);
        global.allocation_count.fetch_add(1, Ordering::Relaxed);
    }

    fn remove(&mut self, size: usize, global: &AtomicCounters) {
        self.counters.deallocations += size;
        self.counters.deallocation_count += 1;
        global.deallocations.fetch_add(size, Ordering::Relaxed);
        global.deallocation_count.fetch_add(1, Ordering::Relaxed);
    }

    fn update(&mut self, old_size: usize, new_size: usize, global: &AtomicCounters) {
        self.add(new_size, global);
        self.remove(old_size, global);
    }
}

thread_local! {
  static LOCAL_COUNTER: UnsafeCell<ThreadLocalCounter> = const {UnsafeCell::new(ThreadLocalCounter::new())};
}

// stores an estimate of the peak memory allocated.
static MAX_ALLOCATED: AtomicUsize = AtomicUsize::new(0);

/// Returns an estimate of the total memory statistics
pub fn global_counters() -> AllocationCounters {
    let mut counters = AllocationCounters::new();
    for global in GLOBAL.iter() {
        counters.allocation_count += global.allocation_count.load(Ordering::Acquire);
        counters.deallocation_count += global.deallocation_count.load(Ordering::Acquire);
        counters.allocations += global.allocations.load(Ordering::Acquire);
        counters.deallocations += global.deallocations.load(Ordering::Acquire);
    }

    MAX_ALLOCATED.fetch_max(
        counters.allocations - counters.deallocations,
        Ordering::AcqRel,
    );
    counters
}

pub fn allocation_counters() -> AllocationCounters {
    with_local_counter(|local, _| local.counters.clone())
}

/// Resets the counters for the current thread.
/// This is used to exclude some work from the metrics and as such should be used sparingly.
/// NOTE: this does not exclude the allocations from the global metrics
pub fn reset_allocation_counters(start: AllocationCounters) {
    with_local_counter(|local, _| local.counters = start);
}

fn with_local_counter<T>(f: impl FnOnce(&mut ThreadLocalCounter, &AtomicCounters) -> T) -> T {
    LOCAL_COUNTER.with(|local| {
        let ptr = local.get();
        // SAFETY: This is a thread local, and the functions we pass do not recursively access the
        // threadlocal
        let mut local = unsafe { NonNull::new_unchecked(ptr) };
        let local = unsafe { local.as_mut() };
        let global = *local.global.get_or_insert_with(get_global_ref);
        f(local, global)
    })
}

/// Adds some `size` to the global counter in a thread-local buffered way.
pub fn add(size: usize) {
    with_local_counter(|local, global| local.add(size, global));
}

/// Removes some `size` to the global counter in a thread-local buffered way.
pub fn remove(size: usize) {
    with_local_counter(|local, global| local.remove(size, global));
}

/// Adds some `size` to the global counter in a thread-local buffered way.
pub fn update(old_size: usize, new_size: usize) {
    with_local_counter(|local, global| local.update(old_size, new_size, global));
}

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;

    #[test]
    fn test_counters() {
        let mut t1 = ThreadLocalCounter::new();
        let mut t2 = ThreadLocalCounter::new();

        assert_eq!(0, global_counters().allocations);

        assert_eq!(0, global_counters().allocations);

        t1.add(100, &GLOBAL[0]);
        t2.add(300, &GLOBAL[0]);
        assert_eq!(400, global_counters().allocations);

        t2.remove(300, &GLOBAL[0]);
        t1.remove(100, &GLOBAL[0]);
        assert_eq!(
            AllocationCounters {
                allocations: 400,
                allocation_count: 2,
                deallocations: 400,
                deallocation_count: 2,
                ..Default::default()
            },
            global_counters()
        );
        assert_eq!(400, MAX_ALLOCATED.load(Ordering::Acquire));
    }

    #[test]
    fn test_multithreaded() {
        const N_THREADS: usize = 1;
        let barrier = std::sync::Barrier::new(N_THREADS + 1);
        thread::scope(|s| {
            for _ in 0..N_THREADS {
                s.spawn(|| {
                    add(1);
                    barrier.wait();
                    barrier.wait();
                    remove(1);
                });
            }
            // Wait for all threads to reach the first barrier
            barrier.wait();
            let global = global_counters();
            assert_eq!(global.allocations, N_THREADS);
            barrier.wait(); // release all the threads
        });
        let global = global_counters();
        assert_eq!(global.allocations, N_THREADS);
        assert_eq!(global.deallocations, N_THREADS);
    }
}
