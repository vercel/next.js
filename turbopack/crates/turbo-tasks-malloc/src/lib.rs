mod counter;

use std::{
    alloc::{GlobalAlloc, Layout},
    marker::PhantomData,
};

use self::counter::{add, flush, get, remove, update};

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

/// Turbo's preferred global allocator. This is a new type instead of a type
/// alias because you can't use type aliases to instantiate unit types (E0423).
pub struct TurboMalloc;

impl TurboMalloc {
    // Returns the current amount of memory
    pub fn memory_usage() -> usize {
        get()
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
    return &mimalloc_rspack::MiMalloc;
    #[cfg(any(
        not(feature = "custom_allocator"),
        any(target_family = "wasm", target_env = "musl")
    ))]
    return &std::alloc::System;
}

#[allow(unused_variables)]
unsafe fn base_alloc_size(ptr: *const u8, layout: Layout) -> usize {
    #[cfg(all(
        feature = "custom_allocator",
        not(any(target_family = "wasm", target_env = "musl"))
    ))]
    return unsafe { mimalloc_rspack::MiMalloc.usable_size(ptr) };
    #[cfg(any(
        not(feature = "custom_allocator"),
        any(target_family = "wasm", target_env = "musl")
    ))]
    return layout.size();
}

unsafe impl GlobalAlloc for TurboMalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ret = unsafe { base_alloc().alloc(layout) };
        if !ret.is_null() {
            let size = unsafe { base_alloc_size(ret, layout) };
            add(size);
        }
        ret
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        let size = unsafe { base_alloc_size(ptr, layout) };
        unsafe { base_alloc().dealloc(ptr, layout) };
        remove(size);
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let ret = unsafe { base_alloc().alloc_zeroed(layout) };
        if !ret.is_null() {
            let size = unsafe { base_alloc_size(ret, layout) };
            add(size);
        }
        ret
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let old_size = unsafe { base_alloc_size(ptr, layout) };
        let ret = unsafe { base_alloc().realloc(ptr, layout, new_size) };
        if !ret.is_null() {
            // SAFETY: the caller must ensure that the `new_size` does not overflow.
            // `layout.align()` comes from a `Layout` and is thus guaranteed to be valid.
            let new_layout = unsafe { Layout::from_size_align_unchecked(new_size, layout.align()) };
            let new_size = unsafe { base_alloc_size(ret, new_layout) };
            update(old_size, new_size);
        }
        ret
    }
}
