//! Its own test binary, so it can use mimalloc as the global allocator and measure the resident
//! set size without other tests allocating concurrently.

#![cfg(all(target_os = "linux", feature = "custom_allocator", not(miri)))]

use std::thread;

use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

/// `TurboMalloc::collect(true)` purges freed memory of the whole process to the OS. That must also
/// work when it's called on a thread that never allocated before (e.g. a freshly spawned thread
/// of a thread pool): mimalloc skips the purge when the calling thread's heap isn't initialized.
#[test]
fn forced_collect_on_fresh_thread_returns_freed_memory() {
    const SIZE: usize = 512 * 1024 * 1024;
    // Small enough to be allocated in mimalloc pages rather than as huge allocations, which are
    // returned to the OS directly on free.
    const BLOCK: usize = 1024;

    let rss_start = TurboMalloc::memory_footprint().unwrap();
    // Allocate and free on a separate thread. Its exit hands the freed pages to the arena, where
    // they stay committed until a purge.
    thread::spawn(|| {
        let blocks = (0..SIZE / BLOCK)
            .map(|i| vec![i as u8; BLOCK].into_boxed_slice())
            .collect::<Vec<_>>();
        drop(blocks);
        TurboMalloc::collect(false);
    })
    .join()
    .unwrap();
    let rss_freed = TurboMalloc::memory_footprint().unwrap();
    assert!(
        rss_freed > rss_start + SIZE / 2,
        "expected the freed memory to stay resident until it's purged (start: {rss_start}, after \
         free: {rss_freed})"
    );

    // Purge from a thread that does nothing else, so its heap is never initialized by an
    // allocation of its own.
    let collector = thread::Builder::new()
        .spawn(|| TurboMalloc::collect(true))
        .unwrap();
    collector.join().unwrap();
    let rss_purged = TurboMalloc::memory_footprint().unwrap();
    assert!(
        rss_purged < rss_start + SIZE / 2,
        "expected a forced collect to return the freed memory to the OS (start: {rss_start}, \
         after free: {rss_freed}, after collect: {rss_purged})"
    );
}
