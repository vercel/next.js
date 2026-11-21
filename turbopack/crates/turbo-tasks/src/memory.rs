//! Returning freed memory to the OS.

use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use turbo_tasks_malloc::TurboMalloc;

/// Number of requests made with [`request_thread_cleanup`]. Threads remember the last value they
/// handled in a [`ThreadCleanupThrottle`].
static THREAD_CLEANUP_EPOCH: AtomicU64 = AtomicU64::new(0);

/// Asks threads to run their per-thread cleanup the next time they reach their cleanup point,
/// even if their normal throttle interval hasn't expired yet.
///
/// Per-thread cleanup is work that only the owning thread can do, like garbage-collecting a
/// thread-local interner. An embedder runs it at a natural point, e.g. when a scheduler worker
/// parks, with [`ThreadCleanupThrottle::run_if_due`].
///
/// The turbo-tasks backend calls this when it starts a background snapshot, a point where
/// values cached by finished work have often become unused. This only records the request: it
/// doesn't wake or block any thread, and it doesn't wait for the cleanups. Each thread handles it
/// the next time it reaches its cleanup point, which can be during or after the snapshot.
/// Requests that a thread misses in the meantime are coalesced into a single cleanup. Requests
/// are process-wide, so they apply to the threads of every turbo-tasks instance in the process.
pub fn request_thread_cleanup() {
    THREAD_CLEANUP_EPOCH.fetch_add(1, Ordering::Relaxed);
}

fn thread_cleanup_epoch() -> u64 {
    // Only a notification: no other memory is published with it.
    THREAD_CLEANUP_EPOCH.load(Ordering::Relaxed)
}

/// Decides when a thread runs its per-thread cleanup: at most once per interval, measured from
/// the end of the last cleanup, and right away when a cleanup was requested with
/// [`request_thread_cleanup`] since the last cleanup started.
///
/// Keep one per thread, e.g. in a `thread_local!`.
#[derive(Debug, Default)]
pub struct ThreadCleanupThrottle {
    last_run_end: Option<Instant>,
    handled_epoch: u64,
}

impl ThreadCleanupThrottle {
    pub const fn new() -> Self {
        Self {
            last_run_end: None,
            handled_epoch: 0,
        }
    }

    /// Runs `cleanup` if it's due, and returns whether it ran.
    ///
    /// It's due on the first call, when more than `interval` has passed since the last cleanup
    /// ended, or when a cleanup was requested since the last cleanup started.
    pub fn run_if_due(&mut self, interval: Duration, cleanup: impl FnOnce()) -> bool {
        self.run_if_due_with(thread_cleanup_epoch(), interval, Instant::now, cleanup)
    }

    /// [`Self::run_if_due`] with an explicit request epoch and clock.
    fn run_if_due_with(
        &mut self,
        epoch: u64,
        interval: Duration,
        now: impl Fn() -> Instant,
        cleanup: impl FnOnce(),
    ) -> bool {
        let requested = epoch != self.handled_epoch;
        let due = self
            .last_run_end
            .is_none_or(|end| now().saturating_duration_since(end) > interval);
        if !requested && !due {
            return false;
        }
        cleanup();
        // Requests made while the cleanup ran have a newer epoch, so they stay pending.
        self.handled_epoch = epoch;
        self.last_run_end = Some(now());
        true
    }
}

/// Makes memory that has already been freed (e.g. by dropping the turbo-tasks storage in
/// [`TurboTasks::stop_and_wait`][crate::TurboTasks::stop_and_wait]) available to the OS again,
/// instead of leaving it resident until the threads that allocated it exit.
///
/// mimalloc keeps each page in the heap of the thread that allocated it. A free from another
/// thread only queues the block on that page, and the owning thread has to collect its heap
/// before the page is free. Scheduler workers can do that whenever they park (with a
/// [`TurboMalloc::thread_park`] `on_thread_park` hook), but threads in tokio's blocking pool have
/// no such hook. Many of these were scheduler workers that did compilation work and handed their
/// worker role to a new thread in `block_in_place` (which [`crate::scope_bounded`] uses), so they
/// can own a large share of the heap. Left alone, they only collect when they exit after tokio's
/// idle keep-alive (10s by default).
///
/// This tries to visit each currently idle blocking-pool thread once to collect its heap, then
/// purges the freed pages to the OS, including small free ranges between memory that's still in
/// use (see [`TurboMalloc::collect_and_purge_all`]), since the heap is fragmented after freeing
/// most of it. It is best effort: the idle count is a snapshot, so threads
/// that change state concurrently may be missed, and a busy or capped blocking pool may not run the
/// visits on distinct threads before the bounded rendezvous times out. Missed threads still collect
/// when they exit. Purging many GB takes a while, so it runs on a blocking thread.
///
/// Must be called from within the tokio runtime whose threads should be collected.
pub async fn release_freed_memory() {
    #[cfg(not(target_family = "wasm"))]
    {
        let idle_threads = tokio::runtime::Handle::current()
            .metrics()
            .num_idle_blocking_threads();
        visit_idle_blocking_threads(idle_threads, || TurboMalloc::collect(false)).await;
        // This purges the freed pages of all threads, so one call is enough. It also works if
        // tokio runs this on a new blocking thread that never allocated.
        let _ = tokio::task::spawn_blocking(TurboMalloc::collect_and_purge_all).await;
    }
    #[cfg(target_family = "wasm")]
    TurboMalloc::collect_and_purge_all();
}

/// Runs `f` once on each of `count` distinct blocking-pool threads.
///
/// tokio hands a new blocking task to an idle thread if there is one, and only spawns a new
/// thread otherwise. Spawning `count` tasks at once that each wait for all the others normally
/// prevents two of them from running on the same thread.
///
/// The wait is bounded, so this can't hang if the blocking pool is busy or capped. In that case a
/// visit can be repeated on a thread after the timeout, and some idle threads can be missed.
#[cfg(not(target_family = "wasm"))]
async fn visit_idle_blocking_threads(count: usize, f: impl Fn() + Clone + Send + 'static) {
    use std::{
        sync::{Arc, Condvar, Mutex},
        time::Duration,
    };

    /// Visiting takes milliseconds; this only bounds the wait.
    const RENDEZVOUS_TIMEOUT: Duration = Duration::from_secs(1);

    if count == 0 {
        return;
    }
    let arrived = Arc::new((Mutex::new(0usize), Condvar::new()));
    let tasks: Vec<_> = (0..count)
        .map(|_| {
            let arrived = arrived.clone();
            let f = f.clone();
            tokio::task::spawn_blocking(move || {
                f();
                let (lock, condvar) = &*arrived;
                let mut arrived = lock.lock().unwrap_or_else(|e| e.into_inner());
                *arrived += 1;
                condvar.notify_all();
                let _ = condvar
                    .wait_timeout_while(arrived, RENDEZVOUS_TIMEOUT, |arrived| *arrived < count);
            })
        })
        .collect();
    for task in tasks {
        let _ = task.await;
    }
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests {
    use std::{
        collections::HashSet,
        sync::{Arc, Barrier, Mutex},
        thread::ThreadId,
        time::{Duration, Instant},
    };

    use super::*;

    const INTERVAL: Duration = Duration::from_secs(2);

    /// Runs a no-op cleanup at `at` for the given request epoch.
    fn run_at(throttle: &mut ThreadCleanupThrottle, epoch: u64, at: Instant) -> bool {
        throttle.run_if_due_with(epoch, INTERVAL, || at, || {})
    }

    #[test]
    fn cleanup_throttle_runs_on_first_call_then_after_the_interval() {
        let start = Instant::now();
        let mut throttle = ThreadCleanupThrottle::new();

        assert!(run_at(&mut throttle, 0, start));
        assert!(!run_at(&mut throttle, 0, start + Duration::from_secs(1)));
        assert!(!run_at(&mut throttle, 0, start + INTERVAL));
        assert!(run_at(
            &mut throttle,
            0,
            start + Duration::from_millis(2001)
        ));
    }

    #[test]
    fn cleanup_interval_starts_when_the_cleanup_ends() {
        let start = Instant::now();
        let clock = std::cell::Cell::new(start);
        let mut throttle = ThreadCleanupThrottle::new();

        // The cleanup takes 1s.
        assert!(throttle.run_if_due_with(
            0,
            INTERVAL,
            || clock.get(),
            || clock.set(start + Duration::from_secs(1))
        ));
        assert!(!run_at(
            &mut throttle,
            0,
            start + Duration::from_millis(2500)
        ));
        assert!(run_at(
            &mut throttle,
            0,
            start + Duration::from_millis(3001)
        ));
    }

    #[test]
    fn cleanup_request_overrides_the_interval_once() {
        let start = Instant::now();
        let mut throttle = ThreadCleanupThrottle::new();
        assert!(run_at(&mut throttle, 0, start));

        let soon = start + Duration::from_millis(100);
        assert!(run_at(&mut throttle, 1, soon));
        assert!(!run_at(&mut throttle, 1, soon + Duration::from_millis(100)));
    }

    #[test]
    fn missed_cleanup_requests_are_coalesced() {
        let start = Instant::now();
        let mut throttle = ThreadCleanupThrottle::new();
        assert!(run_at(&mut throttle, 0, start));

        // Three requests arrived while the thread wasn't at its cleanup point.
        let next = start + Duration::from_millis(100);
        assert!(run_at(&mut throttle, 3, next));
        assert!(!run_at(&mut throttle, 3, next + Duration::from_millis(100)));
    }

    #[test]
    fn cleanup_request_made_during_a_cleanup_stays_pending() {
        let start = Instant::now();
        let mut throttle = ThreadCleanupThrottle::new();
        assert!(run_at(&mut throttle, 0, start));

        // A cleanup for request 1 runs, and request 2 is made while it runs.
        let soon = start + Duration::from_millis(100);
        assert!(run_at(&mut throttle, 1, soon));
        assert!(run_at(&mut throttle, 2, soon + Duration::from_millis(100)));
        assert!(!run_at(&mut throttle, 2, soon + Duration::from_millis(200)));
    }

    #[test]
    fn each_thread_handles_a_request_once() {
        let start = Instant::now();
        let mut first = ThreadCleanupThrottle::new();
        let mut second = ThreadCleanupThrottle::new();
        assert!(run_at(&mut first, 0, start));
        assert!(run_at(&mut second, 0, start));

        let soon = start + Duration::from_millis(100);
        assert!(run_at(&mut first, 1, soon));
        assert!(!run_at(&mut first, 1, soon));
        assert!(run_at(&mut second, 1, soon));
        assert!(!run_at(&mut second, 1, soon));
    }

    #[test]
    fn run_if_due_runs_the_cleanup_only_when_due() {
        let mut throttle = ThreadCleanupThrottle::new();
        let mut runs = 0;
        assert!(throttle.run_if_due(Duration::from_secs(3600), || runs += 1));
        assert!(!throttle.run_if_due(Duration::from_secs(3600), || runs += 1));
        assert_eq!(runs, 1);
    }

    #[test]
    fn visits_each_idle_blocking_thread_once() {
        const THREADS: usize = 8;

        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            // Start THREADS blocking-pool threads and wait until they are all idle again.
            let barrier = Arc::new(Barrier::new(THREADS));
            let tasks: Vec<_> = (0..THREADS)
                .map(|_| {
                    let barrier = barrier.clone();
                    tokio::task::spawn_blocking(move || {
                        barrier.wait();
                    })
                })
                .collect();
            for task in tasks {
                task.await.unwrap();
            }
            let metrics = tokio::runtime::Handle::current().metrics();
            while metrics.num_idle_blocking_threads() < THREADS {
                tokio::task::yield_now().await;
            }
            let threads_before = metrics.num_blocking_threads();

            let visited = Arc::new(Mutex::new(Vec::<ThreadId>::new()));
            visit_idle_blocking_threads(THREADS, {
                let visited = visited.clone();
                move || visited.lock().unwrap().push(std::thread::current().id())
            })
            .await;

            let visited = visited.lock().unwrap();
            assert_eq!(visited.len(), THREADS);
            assert_eq!(
                visited.iter().collect::<HashSet<_>>().len(),
                THREADS,
                "each visit must run on a distinct thread"
            );
            // The idle threads were reused rather than new ones spawned.
            assert_eq!(metrics.num_blocking_threads(), threads_before);
        });
    }

    #[test]
    fn zero_visits_spawns_no_blocking_threads() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let metrics = tokio::runtime::Handle::current().metrics();
            let threads_before = metrics.num_blocking_threads();
            visit_idle_blocking_threads(0, || panic!("must not visit")).await;
            assert_eq!(metrics.num_blocking_threads(), threads_before);
        });
    }

    #[test]
    fn capped_blocking_pool_times_out_instead_of_hanging() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(1)
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let visits = Arc::new(Mutex::new(0usize));
            let start = Instant::now();
            visit_idle_blocking_threads(2, {
                let visits = visits.clone();
                move || *visits.lock().unwrap() += 1
            })
            .await;

            assert_eq!(*visits.lock().unwrap(), 2);
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "the bounded rendezvous should release the capped pool"
            );
        });
    }
}
