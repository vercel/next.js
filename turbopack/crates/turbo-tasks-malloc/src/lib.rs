mod counter;

use std::{
    alloc::{GlobalAlloc, Layout},
    fmt::Display,
    marker::PhantomData,
};

use self::counter::{add, flush, global_counters, remove, update};

#[derive(Default, Clone, Debug)]
pub struct AllocationInfo {
    pub allocations: usize,
    pub deallocations: usize,
    pub allocation_count: usize,
    pub deallocation_count: usize,
}

impl AllocationInfo {
    pub fn is_empty(&self) -> bool {
        self.allocations == 0
            && self.deallocations == 0
            && self.allocation_count == 0
            && self.deallocation_count == 0
    }
}

#[derive(Default, Clone, Debug)]
pub struct AllocationCounters {
    pub allocations: usize,
    pub deallocations: usize,
    pub allocation_count: usize,
    pub deallocation_count: usize,
    _not_send: PhantomData<*mut ()>,
}

impl AllocationCounters {
    const fn new() -> Self {
        Self {
            allocation_count: 0,
            deallocation_count: 0,
            allocations: 0,
            deallocations: 0,
            _not_send: PhantomData {},
        }
    }
    pub fn until_now(&self) -> AllocationInfo {
        let new = TurboMalloc::allocation_counters();
        AllocationInfo {
            allocations: new.allocations - self.allocations,
            deallocations: new.deallocations - self.deallocations,
            allocation_count: new.allocation_count - self.allocation_count,
            deallocation_count: new.deallocation_count - self.deallocation_count,
        }
    }
}

impl Display for AllocationCounters {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        struct FormatBytes(usize);
        impl Display for FormatBytes {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                let bytes = self.0;
                const KB: usize = 1_024;
                const MB: usize = 1_024 * KB;
                const GB: usize = 1_024 * MB;
                if bytes > GB {
                    return write!(f, "{:.2}GiB", ((bytes / MB) as f32) / 1_024.0);
                }
                if bytes > MB {
                    return write!(f, "{:.2}MiB", ((bytes / KB) as f32) / 1_024.0);
                }
                if bytes > KB {
                    return write!(f, "{:.2}KiB", (bytes as f32) / 1_024.0);
                }
                write!(f, "{bytes}B")
            }
        }
        struct FormatCount(usize);

        impl Display for FormatCount {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                let num = self.0;
                const THOUSANDS: usize = 1000;
                const MILLIONS: usize = 1000 * THOUSANDS;
                const BUILLIONS: usize = 1_024 * MILLIONS;
                if num > BUILLIONS {
                    return write!(f, "{:.2}B", ((num / MILLIONS) as f32) / 1000.0);
                }
                if num > MILLIONS {
                    return write!(f, "{:.2}M", ((num / THOUSANDS) as f32) / 1000.0);
                }
                if num > THOUSANDS {
                    return write!(f, "{:.2}K", (num as f32) / 1000.0);
                }
                write!(f, "{num}")
            }
        }
        let allocated = FormatBytes(self.allocations - self.deallocations);
        let allocations = FormatBytes(self.allocations);
        let deallocations = FormatBytes(self.deallocations);
        let num_allocations = FormatCount(self.allocation_count);
        let num_deallocations = FormatCount(self.deallocation_count);
        write!(
            f,
            "\
Allocations:
  allocated: {allocated}
  allocations: {num_allocations}
  deadllocations: {num_deallocations}
  total allocation: {allocations}
  total deallocations: {deallocations}
"
        )
    }
}

/// Turbo's preferred global allocator. This is a new type instead of a type
/// alias because you can't use type aliases to instantiate unit types (E0423).
pub struct TurboMalloc;

impl TurboMalloc {
    // Returns the current amount of memory
    pub fn memory_usage() -> usize {
        let allocations = global_counters();
        allocations.allocations - allocations.deallocations
    }

    // Returns statistics for all allocations in the application that are tracked by TurboMalloc.
    pub fn global_allocation_counters() -> AllocationCounters {
        global_counters()
    }

    pub fn thread_stop() {
        flush();
    }

    pub fn allocation_counters() -> AllocationCounters {
        self::counter::allocation_counters()
    }

    pub fn reset_allocation_counters(start: AllocationCounters) {
        self::counter::reset_allocation_counters(start);
    }
}

/// Get the allocator for this platform that we should wrap with TurboMalloc.
#[inline]
fn base_alloc() -> &'static impl GlobalAlloc {
    #[cfg(all(
        feature = "custom_allocator",
        not(any(target_family = "wasm", target_env = "musl"))
    ))]
    return &mimalloc::MiMalloc;
    #[cfg(any(
        not(feature = "custom_allocator"),
        any(target_family = "wasm", target_env = "musl")
    ))]
    return &std::alloc::System;
}

unsafe impl GlobalAlloc for TurboMalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ret = unsafe { base_alloc().alloc(layout) };
        if !ret.is_null() {
            add(layout.size());
        }
        ret
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { base_alloc().dealloc(ptr, layout) };
        remove(layout.size());
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let ret = unsafe { base_alloc().alloc_zeroed(layout) };
        if !ret.is_null() {
            add(layout.size());
        }
        ret
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let ret = unsafe { base_alloc().realloc(ptr, layout, new_size) };
        if !ret.is_null() {
            let old_size = layout.size();
            update(old_size, new_size);
        }
        ret
    }
}
