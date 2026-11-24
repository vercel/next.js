//! Its own test binary, so it can use mimalloc as the global allocator and measure the resident
//! set size without other tests allocating concurrently.

#![cfg(all(target_os = "linux", feature = "custom_allocator", not(miri)))]

use std::fs;

use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

/// After freeing most of a heap, the remaining live allocations split the free memory into small
/// ranges. `TurboMalloc::collect_and_purge_all` must return those to the OS, even where mimalloc
/// only purges ranges of at least the transparent huge page size (2 MiB) by default.
#[test]
fn collect_and_purge_all_returns_small_free_ranges() {
    const SIZE: usize = 512 * 1024 * 1024;
    // Small enough to be allocated in mimalloc's 64 KiB small pages.
    const BLOCK: usize = 1024;
    // Keep one block per MiB alive, so every free range is shorter than 2 MiB.
    const KEEP_EVERY: usize = 1024 * 1024 / BLOCK;

    let rss_start = TurboMalloc::memory_footprint().unwrap();
    let blocks = (0..SIZE / BLOCK)
        .map(|i| vec![i as u8; BLOCK].into_boxed_slice())
        .collect::<Vec<_>>();
    let kept = blocks
        .into_iter()
        .enumerate()
        .filter(|(i, _)| i % KEEP_EVERY == 0)
        .map(|(_, block)| block)
        .collect::<Vec<_>>();

    // A regular forced collect returns free ranges only from the minimal purge size up. mimalloc
    // raises that to 2 MiB with transparent huge pages, which is when the fragmented memory stays
    // resident.
    TurboMalloc::collect(true);
    let rss_collected = TurboMalloc::memory_footprint().unwrap();
    let thp_available = fs::read_to_string("/sys/kernel/mm/transparent_hugepage/enabled")
        .is_ok_and(|enabled| !enabled.contains("[never]"));
    if thp_available {
        assert!(
            rss_collected > rss_start + SIZE / 2,
            "expected a regular forced collect to leave the small free ranges resident (start: \
             {rss_start}, after collect: {rss_collected})"
        );
    }

    TurboMalloc::collect_and_purge_all();
    let rss_purged = TurboMalloc::memory_footprint().unwrap();
    assert!(
        rss_purged < rss_start + SIZE / 4,
        "expected the small free ranges to be returned to the OS (start: {rss_start}, after \
         collect: {rss_collected}, after purging all: {rss_purged})"
    );
    drop(kept);
}
