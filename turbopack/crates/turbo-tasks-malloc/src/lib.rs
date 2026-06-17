mod counter;
mod memory_pressure;

use std::{
    alloc::{GlobalAlloc, Layout},
    marker::PhantomData,
    ops::{Add, AddAssign},
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

    pub fn thread_park() {
        Self::collect(false);
    }

    /// When using mimalloc triggers some cleanup
    /// force=false: process threadlocal free lists and other threadlocal deferred work
    ///    only operates on thread local data and should be fast
    /// force=true: do all the work of `process=false` and then process global shared structures and
    /// return memory to the OS if possible, this is much slower and should only be done rarely.
    pub fn collect(force: bool) {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm")))]
        unsafe {
            libmimalloc_sys::mi_collect(force);
        }
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        {
            let _ = force;
        }
    }

    pub fn allocation_counters() -> AllocationCounters {
        self::counter::allocation_counters()
    }

    pub fn reset_allocation_counters(start: AllocationCounters) {
        self::counter::reset_allocation_counters(start);
    }

    /// Returns a memory pressure value in the range `0..=100`, or `None` when
    /// the current platform does not expose a memory pressure signal or a
    /// query for it failed.
    ///
    /// `0` means no memory pressure, `100` means maximum pressure.
    ///
    /// - On Linux this is derived from `/proc/pressure/memory` (the `some` `avg10` stall
    ///   percentage), falling back to `(MemTotal - MemAvailable) / MemTotal` from `/proc/meminfo`
    ///   when PSI is not available (older kernels, no `CONFIG_PSI`, or containers without access).
    /// - On macOS this is derived from the `kern.memorystatus_level` sysctl (`100 -
    ///   free_memory_percentage`).
    /// - On Windows this is `MEMORYSTATUSEX::dwMemoryLoad` (percentage of physical memory in use).
    /// - On other platforms this returns `None`.
    pub fn memory_pressure() -> Option<u8> {
        memory_pressure::memory_pressure()
    }
}

/// Get the allocator for this platform that we should wrap with TurboMalloc.
#[inline]
fn base_alloc() -> &'static impl GlobalAlloc {
    #[cfg(all(feature = "custom_allocator", not(target_family = "wasm")))]
    return &mimalloc::MiMalloc;
    #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
    return &std::alloc::System;
}

#[allow(unused_variables)]
unsafe fn base_alloc_size(ptr: *const u8, layout: Layout) -> usize {
    #[cfg(all(feature = "custom_allocator", not(target_family = "wasm")))]
    return unsafe { mimalloc::MiMalloc.usable_size(ptr) };
    #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
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

#[cfg(test)]
mod tests {
    use super::TurboMalloc;

    #[test]
    fn memory_pressure_is_in_range() {
        let value = TurboMalloc::memory_pressure();

        // On all supported platforms the value must be reported.
        #[cfg(any(
            all(target_os = "linux", not(target_family = "wasm")),
            target_os = "macos",
            windows,
        ))]
        let value = value.expect("memory_pressure() should return Some on this platform");

        // On unsupported platforms we expect None and have nothing further to assert.
        #[cfg(not(any(
            all(target_os = "linux", not(target_family = "wasm")),
            target_os = "macos",
            windows,
        )))]
        let Some(value) = value else {
            return;
        };

        assert!(
            value <= 100,
            "memory_pressure() returned {value}, expected a value in 0..=100"
        );
    }
}
