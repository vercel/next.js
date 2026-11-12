//! Its own test binary, so it can use mimalloc as the global allocator and measure the resident
//! set size without other tests allocating concurrently.

#![cfg(all(target_os = "linux", feature = "custom_allocator", not(miri)))]

use std::thread;

use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

const SIZE: usize = 512 * 1024 * 1024;

/// Allocates and frees [`SIZE`] bytes on a thread that then exits, and returns the resident set
/// size afterwards.
fn allocate_and_free_on_thread() -> usize {
    thread::spawn(|| {
        // Small enough to be allocated in mimalloc pages rather than as huge allocations, which
        // are returned to the OS directly on free.
        const BLOCK: usize = 1024;
        let blocks = (0..SIZE / BLOCK)
            .map(|i| vec![i as u8; BLOCK].into_boxed_slice())
            .collect::<Vec<_>>();
        drop(blocks);
        TurboMalloc::collect(false);
    })
    .join()
    .unwrap();
    TurboMalloc::memory_footprint().unwrap()
}

#[test]
fn eager_purge_mode_returns_freed_memory_immediately() {
    let rss_start = TurboMalloc::memory_footprint().unwrap();

    // By default, the freed memory stays resident until a delayed purge.
    let rss_default = allocate_and_free_on_thread();
    assert!(
        rss_default > rss_start + SIZE / 2,
        "expected the freed memory to stay resident by default (start: {rss_start}, after free: \
         {rss_default})"
    );
    TurboMalloc::collect(true);
    let rss_collected = TurboMalloc::memory_footprint().unwrap();
    assert!(
        rss_collected < rss_start + SIZE / 2,
        "expected a forced collect to return the freed memory (start: {rss_start}, after collect: \
         {rss_collected})"
    );

    // In eager purge mode, it's returned as it's freed.
    let guard = TurboMalloc::enter_eager_purge_mode();
    let rss_eager = allocate_and_free_on_thread();
    drop(guard);
    assert!(
        rss_eager < rss_start + SIZE / 2,
        "expected the freed memory to be returned in eager purge mode (start: {rss_start}, after \
         free: {rss_eager})"
    );

    // Memory already queued for a delayed purge when the mode starts isn't returned by a forced
    // collect while it's active, only after it ended. (`project_shutdown` relies on this order: it
    // ends the mode before its final forced collect.)
    let rss_queued = allocate_and_free_on_thread();
    assert!(rss_queued > rss_start + SIZE / 2);
    let guard = TurboMalloc::enter_eager_purge_mode();
    TurboMalloc::collect(true);
    let rss_collected_in_mode = TurboMalloc::memory_footprint().unwrap();
    drop(guard);
    assert!(
        rss_collected_in_mode > rss_start + SIZE / 2,
        "expected memory queued before eager purge mode to stay resident until the mode ends \
         (start: {rss_start}, after collect: {rss_collected_in_mode}); if mimalloc now returns \
         it, the order in `project_shutdown` no longer matters"
    );
    TurboMalloc::collect(true);
    let rss_collected_after_mode = TurboMalloc::memory_footprint().unwrap();
    assert!(
        rss_collected_after_mode < rss_start + SIZE / 2,
        "expected a forced collect after eager purge mode to return the memory queued before it \
         (start: {rss_start}, after collect: {rss_collected_after_mode})"
    );
}
