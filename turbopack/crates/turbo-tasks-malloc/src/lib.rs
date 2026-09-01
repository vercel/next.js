mod counter;
mod memory_pressure;

use std::{
    alloc::{GlobalAlloc, Layout},
    marker::PhantomData,
    ops::{Add, AddAssign},
};

use self::counter::{add, flush, remove, update};

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
    /// Returns the bytes the allocator currently has committed from the OS.
    ///
    /// This is the allocator's own accounting, not a per-OS query, so it means the same thing on
    /// every platform. It counts what mimalloc has taken from the OS, which includes allocator
    /// overhead and fragmentation, and excludes anything mimalloc did not hand out — the binary,
    /// mmap'd files, and any memory allocated by the embedding process. It is a measure of what
    /// this allocator holds, not of the process's total footprint.
    ///
    /// It does not track frees in lock step. mimalloc reuses and purges pages on its own
    /// schedule, so the figure lags a burst of frees, and memory abandoned by threads that have
    /// since exited is only reclaimed by a forcing [`Self::collect`].
    ///
    /// Without the `custom_allocator` feature this is a process-wide counter of live bytes
    /// (allocations minus deallocations), maintained by [`self::counter`]. That figure is
    /// approximate: threads buffer their updates, so it can be off by up to a fixed amount per
    /// thread in either direction.
    pub fn memory_usage() -> usize {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm")))]
        {
            // `current_commit` is a relaxed atomic load, but `mi_process_info` also calls
            // `_mi_prim_process_info`, which is a `getrusage` (plus a `task_info` on macOS). All
            // eight out-params are optional, so ask only for the one we use.
            let mut current_commit = 0usize;
            // Safety: every out-param is either null or a valid `usize` we own.
            unsafe {
                libmimalloc_sys::mi_process_info(
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    &mut current_commit,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
            }
            current_commit
        }
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"))))]
        {
            self::counter::get()
        }
    }

    /// Clears the calling thread's allocation counters. Call this when a thread is about to stop,
    /// so a thread that reuses its slot does not inherit the previous totals.
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

    // `memory_usage` reports what *this* allocator has committed, so the test binary has to
    // actually route its allocations through it. Without this the `vec!` below goes to the
    // system allocator and mimalloc's counter never moves.
    #[global_allocator]
    static ALLOC: TurboMalloc = TurboMalloc;

    /// Also guards against the counter silently becoming unavailable. mimalloc's `committed`
    /// stat is maintained even at `MI_STAT 0` (which is what a release build compiles, since
    /// `build.rs` sets `MI_DEBUG=0`) because the `mi_os_stat_*` macros are not gated on
    /// `MI_STAT` — an internal detail rather than a documented guarantee, so a
    /// `libmimalloc-sys` bump could zero it out. If that happens, this fails.
    #[test]
    fn memory_usage_is_reported_and_tracks_a_large_allocation() {
        let before = TurboMalloc::memory_usage();
        assert!(before > 0, "a running process has live memory");

        // Large enough to dwarf whatever else the test process does concurrently, and written to
        // so the pages are actually committed.
        const SIZE: usize = 256 * 1024 * 1024;
        let mut buffer = vec![0u8; SIZE];
        for chunk in buffer.chunks_mut(4096) {
            chunk[0] = 1;
        }
        std::hint::black_box(&buffer);

        let after = TurboMalloc::memory_usage();
        assert!(
            after >= before + SIZE / 2,
            "expected a rise of at least {} bytes, got {before} -> {after}",
            SIZE / 2
        );
        drop(buffer);
    }

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
