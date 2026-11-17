//! Its own test binary, so it can use mimalloc as the global allocator and measure the resident
//! set size without other tests allocating concurrently.

#![cfg(all(target_os = "linux", not(miri)))]

use turbo_tasks::memory::release_freed_memory;
use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

/// Memory allocated by a blocking-pool thread that is idle afterwards, and freed from another
/// thread, stays resident until that thread collects its heap (or exits after tokio's 10s
/// keep-alive). `release_freed_memory` returns it right away.
#[test]
fn releases_memory_owned_by_idle_blocking_threads() {
    // Bytes kept alive until freed from the other thread; twice as much is allocated.
    const SIZE: usize = 256 * 1024 * 1024;
    // Small enough to be allocated in mimalloc pages owned by the allocating thread. Huge
    // allocations are returned to the OS directly on free.
    const BLOCK: usize = 1024;

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let rss_start = TurboMalloc::memory_footprint().unwrap();
        let blocks = tokio::task::spawn_blocking(|| {
            let mut blocks = (0..2 * SIZE / BLOCK)
                .map(|i| vec![i as u8; BLOCK].into_boxed_slice())
                .collect::<Vec<_>>();
            // Keep every other block. Pages that are completely full are abandoned by their
            // thread (mimalloc's `page_full_retain`), and frees from other threads can free those
            // directly. Partially used pages, as a real heap has them, stay owned by the thread.
            let mut i = 0;
            blocks.retain(|_| {
                i += 1;
                i % 2 == 0
            });
            // Collecting here is too early: it can't process frees that happen after this thread
            // has gone idle. This is why an end-of-blocking-work collect is not a replacement for
            // visiting the idle thread after the storage is dropped.
            TurboMalloc::collect(true);
            blocks
        })
        .await
        .unwrap();
        let rss_allocated = TurboMalloc::memory_footprint().unwrap();
        assert!(
            rss_allocated > rss_start + SIZE / 2,
            "allocating should grow the resident set (start: {rss_start}, allocated: \
             {rss_allocated})"
        );

        // Free from this thread while the allocating thread sits idle in the blocking pool. Neither
        // the earlier collect on the owner nor a forced collect here can free its pages.
        drop(blocks);
        TurboMalloc::collect(true);
        let rss_freed = TurboMalloc::memory_footprint().unwrap();
        assert!(
            rss_freed > rss_allocated - SIZE / 2,
            "expected the memory to stay resident before the idle thread collects (allocated: \
             {rss_allocated}, after free: {rss_freed})"
        );

        release_freed_memory().await;
        let rss_released = TurboMalloc::memory_footprint().unwrap();
        assert!(
            rss_released < rss_allocated - SIZE / 2,
            "expected the memory to be returned to the OS (allocated: {rss_allocated}, after \
             release: {rss_released})"
        );
    });
}
