mod base;
mod counter;
mod eager_purge;
mod memory_footprint;
mod memory_pressure;
#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
mod option_override;

/// Overrides mimalloc's `arena_purge_min_size` option (in KiB) with one arena slice, see
/// [`TurboMalloc::collect_and_purge_all`]. mimalloc reads it afresh on every purge, and it only
/// decides which free ranges are purged, so changing it at runtime is benign (see
/// [`option_override`]). 0, the default, picks the size automatically (2 MiB with transparent huge
/// pages); any other value was set explicitly and is left alone.
///
/// Don't override `allow_thp` instead: it also decides whether new memory uses huge pages.
#[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
static PURGE_SMALL_RANGES: option_override::OptionOverride = option_override::OptionOverride::new(
    mimalloc::sys::mi_option_arena_purge_min_size,
    64,
    |previous| previous == 0,
);

use std::{
    alloc::{GlobalAlloc, Layout},
    marker::PhantomData,
    ops::{Add, AddAssign},
};

use self::counter::{add, flush, remove, update};
pub use self::eager_purge::EagerPurgeGuard;

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
    /// Returns the bytes mimalloc currently has committed from the OS. This measures what the
    /// allocator holds rather than the process's total footprint, and it does not track frees in
    /// lock step, since mimalloc reuses and purges pages on its own schedule.
    ///
    /// See `current_commit` in [`mi_process_info`], which documents each figure mimalloc reports.
    ///
    /// [`mi_process_info`]: https://github.com/microsoft/mimalloc/blob/main3/include/mimalloc.h
    ///
    /// Without the `custom_allocator` feature this is a process-wide live-bytes counter instead,
    /// which is approximate because threads buffer their updates.
    pub fn memory_usage() -> usize {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
        {
            // `current_commit` is a relaxed atomic load, but `mi_process_info` also calls
            // `_mi_prim_process_info`, which is a `getrusage` (plus a `task_info` on macOS). All
            // eight out-params are optional, so ask only for the one we use.
            let mut current_commit = 0usize;
            // Safety: every out-param is either null or a valid `usize` we own.
            unsafe {
                mimalloc::sys::mi_process_info(
                    /* elapsed_msecs */ std::ptr::null_mut(),
                    /* user_msecs */ std::ptr::null_mut(),
                    /* system_msecs */ std::ptr::null_mut(),
                    /* current_rss */ std::ptr::null_mut(),
                    /* peak_rss */ std::ptr::null_mut(),
                    &mut current_commit,
                    /* peak_commit */ std::ptr::null_mut(),
                    /* page_faults */ std::ptr::null_mut(),
                );
            }
            current_commit
        }
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri))))]
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
    /// This works from any thread, including one that never allocated before.
    pub fn collect(force: bool) {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
        {
            if force {
                // `mi_collect` does nothing, not even the process-wide purge, when the calling
                // thread's heap isn't initialized yet, which is the case for a thread that never
                // allocated (e.g. a freshly spawned thread of a thread pool). This is a no-op when
                // the heap is already initialized.
                // Safety: initializes the calling thread's mimalloc state, has no preconditions.
                unsafe { mimalloc::sys::mi_thread_init() };
            }
            mimalloc::collect(force);
        }
        #[cfg(not(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri))))]
        {
            let _ = force;
        }
    }

    /// Makes the allocator return memory to the OS as soon as it's freed, until the returned guard
    /// is dropped. Guards can overlap; the previous behavior is restored when the last one is
    /// dropped.
    ///
    /// By default mimalloc delays returning freed pages to the OS, so they can be reused cheaply.
    /// Use this while freeing a lot of memory that won't be reused soon (e.g. when dropping caches
    /// at shutdown), so it doesn't stay resident. Don't use it during normal operation: returning
    /// and recommitting memory often is expensive.
    ///
    /// Freed memory whose return was already scheduled before entering this mode is returned once
    /// the mode ends (when the delay expires, or with [`TurboMalloc::collect(true)`]), and forced
    /// collects don't return it while the mode is active.
    ///
    /// Has no effect without mimalloc, or if returning memory is disabled (a negative
    /// `MIMALLOC_PURGE_DELAY`).
    ///
    /// This changes a process-wide mimalloc option while other threads use the allocator, which
    /// mimalloc doesn't formally support; it only affects purge timing, see [`EagerPurgeGuard`].
    ///
    /// [`TurboMalloc::collect(true)`]: TurboMalloc::collect
    pub fn enter_eager_purge_mode() -> EagerPurgeGuard {
        EagerPurgeGuard::new()
    }

    /// Like [`TurboMalloc::collect(true)`], but also returns freed memory to the OS that lies in
    /// small free ranges between memory that's still in use.
    ///
    /// mimalloc only returns free ranges of a minimal size to the OS. On Linux with transparent
    /// huge pages available, mimalloc v3 sets that size to the huge page size (2 MiB), to avoid
    /// breaking up huge pages. After freeing most of a large, fragmented heap, most free ranges are
    /// smaller than that, so [`TurboMalloc::collect(true)`] leaves them resident. This lowers the
    /// minimal size to one arena slice (64 KiB) for the duration of the collect, unless it was set
    /// explicitly (`MIMALLOC_ARENA_PURGE_MIN_SIZE`).
    ///
    /// Breaking up huge pages makes memory that's still in use slower to access, so only use this
    /// when the remaining heap is small or won't be used much any more (e.g. after shutting down).
    ///
    /// This changes a process-wide mimalloc option while other threads use the allocator, which
    /// mimalloc doesn't formally support; it only affects which free ranges are returned to the
    /// OS, see the `option_override` module.
    ///
    /// [`TurboMalloc::collect(true)`]: TurboMalloc::collect
    pub fn collect_and_purge_all() {
        #[cfg(all(feature = "custom_allocator", not(target_family = "wasm"), not(miri)))]
        let _override = PURGE_SMALL_RANGES.enter();
        Self::collect(true);
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

    /// Returns the resident memory size of the current process in bytes, or
    /// `None` when the current platform does not expose a memory footprint
    /// signal or a query for it failed.
    ///
    /// - On Linux this is the resident set size from `/proc/self/statm`.
    /// - On macOS this is `rusage_info_v0::ri_phys_footprint` from `proc_pid_rusage` (what Apple
    ///   calls "memory footprint" / Activity Monitor's "Memory" column).
    /// - On Windows this is `PROCESS_MEMORY_COUNTERS::WorkingSetSize`.
    /// - On other platforms this returns `None`.
    pub fn memory_footprint() -> Option<usize> {
        memory_footprint::memory_footprint()
    }
}

unsafe impl GlobalAlloc for TurboMalloc {
    #[inline]
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let (ret, size) = unsafe { base::alloc(layout) };
        if !ret.is_null() {
            add(size);
        }
        ret
    }

    #[inline]
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        let size = unsafe { base::dealloc(ptr, layout) };
        remove(size);
    }

    #[inline]
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let (ret, size) = unsafe { base::alloc_zeroed(layout) };
        if !ret.is_null() {
            add(size);
        }
        ret
    }

    #[inline]
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let (ret, old_size, new_size) = unsafe { base::realloc(ptr, layout, new_size) };
        if !ret.is_null() {
            update(old_size, new_size);
        }
        ret
    }
}

#[cfg(test)]
mod tests {
    use std::alloc::{GlobalAlloc, Layout};

    use super::TurboMalloc;

    // `memory_usage` reports what *this* allocator has committed, so the test binary has to
    // actually route its allocations through it. Without this the `vec!` below goes to the
    // system allocator and mimalloc's counter never moves.
    #[global_allocator]
    static ALLOC: TurboMalloc = TurboMalloc;

    /// The sizes reported on allocation and on deallocation must match. Otherwise the counters
    /// drift. Covers every size class and alignment path, including reallocation in place, moving
    /// reallocation and over-aligned reallocation.
    #[test]
    fn allocation_counters_balance() {
        // Small, at and above the small-size limit, medium, and huge.
        // Huge is skipped under Miri because it's too slow there.
        #[cfg(not(miri))]
        const SIZES: [usize; 6] = [1, 24, 1024, 1025, 64 * 1024, 8 * 1024 * 1024];
        #[cfg(miri)]
        const SIZES: [usize; 5] = [1, 24, 1024, 1025, 64 * 1024];
        const ALIGNS: [usize; 4] = [1, 16, 64, 4096];

        // No other allocation may happen on this thread between `before` and `after`, so collect
        // all layouts up front.
        let mut layouts = [Layout::new::<u8>(); SIZES.len() * ALIGNS.len()];
        for (i, (size, align)) in SIZES
            .iter()
            .flat_map(|size| ALIGNS.iter().map(move |align| (*size, *align)))
            .enumerate()
        {
            layouts[i] = Layout::from_size_align(size, align).unwrap();
        }

        let before = TurboMalloc::allocation_counters();
        for layout in layouts {
            for zeroed in [false, true] {
                unsafe {
                    let ptr = if zeroed {
                        ALLOC.alloc_zeroed(layout)
                    } else {
                        ALLOC.alloc(layout)
                    };
                    assert!(!ptr.is_null());
                    assert_eq!(ptr as usize % layout.align(), 0);
                    if zeroed {
                        assert_eq!(*ptr, 0);
                        assert_eq!(*ptr.add(layout.size() - 1), 0);
                    }
                    ptr.write_bytes(0xab, layout.size());

                    // Shrink a little (usually in place), then grow a lot (moves).
                    let mut layout = layout;
                    let mut ptr = ptr;
                    for new_size in [layout.size().div_ceil(2).max(1), layout.size() * 3] {
                        ptr = ALLOC.realloc(ptr, layout, new_size);
                        assert!(!ptr.is_null());
                        assert_eq!(ptr as usize % layout.align(), 0);
                        let kept = layout.size().min(new_size);
                        assert_eq!(*ptr, 0xab);
                        assert_eq!(*ptr.add(kept - 1), 0xab);
                        layout = Layout::from_size_align(new_size, layout.align()).unwrap();
                        ptr.write_bytes(0xab, layout.size());
                    }
                    ALLOC.dealloc(ptr, layout);
                }
            }
        }
        let after = TurboMalloc::allocation_counters();

        let allocated = after.allocations - before.allocations;
        let deallocated = after.deallocations - before.deallocations;
        assert!(allocated > 0);
        assert_eq!(allocated, deallocated);
    }

    /// Guards against the counter silently becoming unavailable.
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
            all(target_os = "linux", not(target_family = "wasm"), not(miri)),
            target_os = "macos",
            windows,
        ))]
        let value = value.expect("memory_pressure() should return Some on this platform");

        // On unsupported platforms we expect None and have nothing further to assert.
        #[cfg(not(any(
            all(target_os = "linux", not(target_family = "wasm"), not(miri)),
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
