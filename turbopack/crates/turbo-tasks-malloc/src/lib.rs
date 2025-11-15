#![feature(thread_local)]

mod counter;

use std::{
    alloc::{GlobalAlloc, Layout},
    cell::UnsafeCell,
    marker::PhantomData,
    ops::{Add, AddAssign},
};

use self::counter::{add, flush, get, remove, update};

#[thread_local]
static mut IN_ALLOCATOR: bool = false;

// This is the "poison pill" flag. It is set to true when the thread-local
// counter begins its destruction, signaling that the thread is exiting.
#[thread_local]
pub(crate) static IS_THREAD_EXITING_FLAG: UnsafeCell<bool> = UnsafeCell::new(false);


#[derive(Default, Clone, Debug)]
pub struct AllocationInfo {
    pub allocations: usize,
    pub deallocations: usize,
    pub allocation_count: usize,
    pub deallocation_count: usize,
}

impl AllocationInfo {
    pub const ZERO: Self = Self {
        allocations: 0,
        deallocations: 0,
        allocation_count: 0,
        deallocation_count: 0,
    };

    pub fn is_empty(&self) -> bool {
        self.allocations == 0
            && self.deallocations == 0
            && self.allocation_count == 0
            && self.deallocation_count == 0
    }

    pub fn memory_usage(&self) -> usize {
        self.allocations.saturating_sub(self.deallocations)
    }
}

impl Add<Self> for AllocationInfo {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self {
            allocations: self.allocations + other.allocations,
            deallocations: self.deallocations + other.deallocations,
            allocation_count: self.allocation_count + other.allocation_count,
            deallocation_count: self.deallocation_count + other.deallocation_count,
        }
    }
}

impl AddAssign<Self> for AllocationInfo {
    fn add_assign(&mut self, other: Self) {
        self.allocations += other.allocations;
        self.deallocations += other.deallocations;
        self.allocation_count += other.allocation_count;
        self.deallocation_count += other.deallocation_count;
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
            allocations: new.allocations.saturating_sub(self.allocations),
            deallocations: new.deallocations.saturating_sub(self.deallocations),
            allocation_count: new.allocation_count.saturating_sub(self.allocation_count),
            deallocation_count: new.deallocation_count.saturating_sub(self.deallocation_count),
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
        unsafe {
            *IS_THREAD_EXITING_FLAG.get() = true;
        }
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

#[inline(always)]
fn should_bypass() -> bool {
    // SAFETY: This is safe because these statics are thread-local.
    unsafe { IN_ALLOCATOR || *IS_THREAD_EXITING_FLAG.get() }
}

unsafe impl GlobalAlloc for TurboMalloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        unsafe {
            if should_bypass() {
                return base_alloc().alloc(layout);
            }

            struct AllocatorGuard;
            impl Drop for AllocatorGuard {
                fn drop(&mut self) {
                    unsafe { IN_ALLOCATOR = false; }
                }
            }
            
            IN_ALLOCATOR = true;
            let _guard = AllocatorGuard;
            let ret = base_alloc().alloc(layout);
            if !ret.is_null() {
                let size = base_alloc_size(ret, layout);
                add(size);
            }
            ret
        }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe {
            if should_bypass() {
                return base_alloc().dealloc(ptr, layout);
            }

            IN_ALLOCATOR = true;
            let size = base_alloc_size(ptr, layout);
            base_alloc().dealloc(ptr, layout);
            remove(size);
            IN_ALLOCATOR = false;
        }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        unsafe {
            if should_bypass() {
                return base_alloc().alloc_zeroed(layout);
            }

            IN_ALLOCATOR = true;
            let ret = base_alloc().alloc_zeroed(layout);
            if !ret.is_null() {
                let size = base_alloc_size(ret, layout);
                add(size);
            }
            IN_ALLOCATOR = false;
            ret
        }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        unsafe {
            if should_bypass() {
                return base_alloc().realloc(ptr, layout, new_size);
            }

            IN_ALLOCATOR = true;
            let old_size = base_alloc_size(ptr, layout);
            let ret = base_alloc().realloc(ptr, layout, new_size);
            if !ret.is_null() {
                let new_layout = Layout::from_size_align_unchecked(new_size, layout.align());
                let new_size = base_alloc_size(ret, new_layout);
                update(old_size, new_size);
            }
            IN_ALLOCATOR = false;
            ret
        }
    }
}
