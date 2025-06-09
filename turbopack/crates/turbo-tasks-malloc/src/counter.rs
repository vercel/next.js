use std::{
    cell::UnsafeCell,
    ptr::NonNull,
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use rustc_hash::FxHashSet;

use crate::AllocationCounters;

lazy_static::lazy_static! {
    static ref ACTIVE: Mutex<GlobalData> = Mutex::new(Default::default());
}

#[derive(Default)]
struct GlobalData {
    /// Data accumulated from retired threads
    allocations: usize,
    deallocations: usize,
    allocation_count: usize,
    deallocation_count: usize,
    active: FxHashSet<RegisteredCounters>,
}

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

    fn from_allocation_counters(counter: AllocationCounters) -> Self {
        Self {
            allocations: AtomicUsize::new(counter.allocations),
            deallocations: AtomicUsize::new(counter.deallocations),
            allocation_count: AtomicUsize::new(counter.allocation_count),
            deallocation_count: AtomicUsize::new(counter.deallocation_count),
        }
    }
    fn to_allocation_counters(&self) -> AllocationCounters {
        AllocationCounters {
            allocations: self.allocations.load(Ordering::Relaxed),
            deallocations: self.deallocations.load(Ordering::Relaxed),
            allocation_count: self.allocation_count.load(Ordering::Relaxed),
            deallocation_count: self.deallocation_count.load(Ordering::Relaxed),
            ..Default::default()
        }
    }
}

#[derive(Eq, PartialEq, Hash, Copy, Clone)]
struct RegisteredCounters(*const AtomicCounters);
unsafe impl Send for RegisteredCounters {}
unsafe impl Sync for RegisteredCounters {}

struct ThreadLocalCounter {
    counters: AtomicCounters,
    registered: bool,
}

impl ThreadLocalCounter {
    const fn new() -> Self {
        Self {
            registered: false,
            counters: AtomicCounters::new(),
        }
    }
    #[inline]
    #[cold]
    fn register(&mut self) {
        let ptr = RegisteredCounters(&self.counters as *const AtomicCounters);
        let inserted = ACTIVE.lock().unwrap().active.insert(ptr);
        debug_assert!(inserted);
        self.registered = true;
    }

    fn add(&mut self, size: usize) {
        self.counters.allocations.fetch_add(size, Ordering::Relaxed);
        self.counters
            .allocation_count
            .fetch_add(1, Ordering::Relaxed);
    }

    fn remove(&mut self, size: usize) {
        self.counters
            .deallocations
            .fetch_add(size, Ordering::Relaxed);
        self.counters
            .deallocation_count
            .fetch_add(1, Ordering::Relaxed);
    }

    fn update(&mut self, old_size: usize, new_size: usize) {
        self.add(new_size);
        self.remove(old_size);
    }

    fn unload(&mut self) {
        if self.registered {
            {
                let mut guard = ACTIVE.lock().unwrap();
                let ptr = RegisteredCounters(&self.counters as *const AtomicCounters);
                let removed = guard.active.remove(&ptr);
                debug_assert!(removed);
                guard.allocation_count += self.counters.allocation_count.load(Ordering::Relaxed);
                guard.deallocation_count +=
                    self.counters.deallocation_count.load(Ordering::Relaxed);
                guard.allocations += self.counters.allocations.load(Ordering::Relaxed);
                guard.deallocations += self.counters.deallocations.load(Ordering::Relaxed);
            }
            self.registered = false;
            self.counters = AtomicCounters::new();
        }
    }
}

/// For the most parts threads managed by tokio have [unload] specifically called, so this `drop`
/// impl is really for threads not managed by tokio (rayon, chili, etc). Without we would leak
/// memory in those cases.
impl Drop for ThreadLocalCounter {
    fn drop(&mut self) {
        self.unload()
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
    {
        let guard = ACTIVE.lock().unwrap();
        counters.allocation_count = guard.allocation_count;
        counters.deallocation_count = guard.deallocation_count;
        counters.allocations = guard.allocations;
        counters.deallocations = guard.deallocations;
        for &thread in guard.active.iter() {
            // SAFETY: the ThreadLocalAllocationCounters cannot be dropped without grabbing the
            // lock and we are holding the lock right now so this reference is guaranteed to be
            // valid.
            let thread = unsafe { &*thread.0 };
            // TODO re-evaluate memory ordering.
            counters.allocation_count += thread.allocation_count.load(Ordering::Acquire);
            counters.deallocation_count += thread.deallocation_count.load(Ordering::Acquire);
            counters.allocations += thread.allocations.load(Ordering::Acquire);
            counters.deallocations += thread.deallocations.load(Ordering::Acquire);
        }
    }

    MAX_ALLOCATED.fetch_max(
        counters.allocations - counters.deallocations,
        Ordering::AcqRel,
    );
    counters
}

pub fn allocation_counters() -> AllocationCounters {
    with_local_counter(|local| local.counters.to_allocation_counters())
}

/// Resets the counters for the current thread.
/// This is used to exclude some work from the metrics and as such should be used sparingly.
pub fn reset_allocation_counters(start: AllocationCounters) {
    with_local_counter(|local| local.counters = AtomicCounters::from_allocation_counters(start));
}

fn with_local_counter<T>(f: impl FnOnce(&mut ThreadLocalCounter) -> T) -> T {
    LOCAL_COUNTER.with(|local| {
        let ptr = local.get();
        // SAFETY: This is a thread local, and the functions we pass do not recursively access the
        // threadlocal
        let mut local = unsafe { NonNull::new_unchecked(ptr) };
        let local = unsafe { local.as_mut() };
        if !local.registered {
            local.register();
        }
        f(local)
    })
}

/// Adds some `size` to the global counter in a thread-local buffered way.
pub fn add(size: usize) {
    with_local_counter(|local| local.add(size));
}

/// Removes some `size` to the global counter in a thread-local buffered way.
pub fn remove(size: usize) {
    with_local_counter(|local| local.remove(size));
}

/// Adds some `size` to the global counter in a thread-local buffered way.
pub fn update(old_size: usize, new_size: usize) {
    with_local_counter(|local| local.update(old_size, new_size));
}

/// Flushes the thread-local buffer to the global counter. This should be called
/// e. g. when a thread is stopped or goes to sleep for a long time.
pub fn flush() {
    with_local_counter(|local| local.unload());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_2_threads() {
        let mut t1 = ThreadLocalCounter::new();
        let mut t2 = ThreadLocalCounter::new();

        assert_eq!(0, global_counters().allocations);

        t1.register();
        t2.register();
        assert_eq!(0, global_counters().allocations);

        t1.add(100);
        t2.add(300);
        assert_eq!(400, global_counters().allocations);

        t2.remove(300);
        t1.remove(100);
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
}
