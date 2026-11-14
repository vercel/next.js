//! Returning freed memory to the OS.

use turbo_tasks_malloc::TurboMalloc;

/// Makes memory that has already been freed (e.g. by dropping the turbo-tasks storage in
/// [`TurboTasks::stop_and_wait`][crate::TurboTasks::stop_and_wait]) available to the OS again,
/// instead of leaving it resident until the threads that allocated it exit.
///
/// mimalloc keeps each page in the heap of the thread that allocated it. A free from another
/// thread only queues the block on that page, and the owning thread has to collect its heap
/// before the page is free. Scheduler workers can do that whenever they park (with a
/// [`TurboMalloc::thread_park`] `on_thread_park` hook), but a park hook only collects what was
/// freed before the thread parked: a worker that is parked while the storage is dropped keeps the
/// pages it owns until it gets work again. Threads in tokio's blocking pool have no such hook.
/// Many of these were scheduler workers that did compilation work and handed their worker role to
/// a new thread in `block_in_place` (which [`crate::scope_bounded`] uses), so they can own a large
/// share of the heap. Left alone, they only collect when they exit after tokio's idle keep-alive
/// (10s by default).
///
/// This tries to visit each scheduler worker (see [`visit_workers`]) and each currently idle
/// blocking-pool thread once to collect its heap, then purges the freed pages to the OS, including
/// small free ranges between memory that's still in use (see
/// [`TurboMalloc::collect_and_purge_all`]), since the heap is fragmented after freeing most of it.
/// It is best effort: workers that stay busy until the visit's deadline are skipped, the idle count
/// is a snapshot, so blocking threads that change state concurrently may be missed, and a busy or
/// capped blocking pool may not run the visits on distinct threads before the bounded rendezvous
/// times out. Missed workers collect when they next park (with the hook), missed blocking threads
/// when they exit. Purging many GB takes a while, so it runs on a blocking thread.
///
/// Must be called from within the tokio runtime whose threads should be collected, with the time
/// driver enabled.
pub async fn release_freed_memory() {
    #[cfg(not(target_family = "wasm"))]
    {
        let workers = visit_workers(|| TurboMalloc::collect(false), WORKER_VISIT_DEADLINE).await;
        tracing::trace!(
            workers = workers.workers,
            visited = workers.visited,
            elapsed_us = workers.elapsed.as_micros() as u64,
            "visited runtime workers"
        );
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

/// How long [`visit_workers`] waits for all workers to be visited. Visiting takes a few
/// milliseconds after a normal build, but when workers own GBs of memory freed from other threads
/// (e.g. after the build failed for lack of disk space), the collects themselves take up to about
/// a second, in the visit or in the workers' park hooks. This bounds the wait for workers that are
/// busy with other work.
#[cfg(not(target_family = "wasm"))]
const WORKER_VISIT_DEADLINE: std::time::Duration = std::time::Duration::from_secs(2);

/// The outcome of [`visit_workers`].
#[cfg(not(target_family = "wasm"))]
#[derive(Debug, Clone, Copy)]
struct WorkerVisits {
    /// The number of scheduler workers of the runtime (1 for a current-thread runtime).
    workers: usize,
    /// How many of them `f` ran on.
    visited: usize,
    elapsed: std::time::Duration,
}

/// Runs `f` once on each scheduler worker thread of the current runtime, without blocking any of
/// them.
///
/// tokio can't run a task on a given worker, and wakes parked workers in LIFO order, so spawning
/// tasks would mostly wake the same few workers again. Instead this spawns a few cooperative tasks
/// per worker. When polled on a worker that wasn't visited yet, a task runs `f` there. Until every
/// worker is visited, the tasks then yield instead of finishing: that keeps the workers that
/// already ran `f` busy (but never blocked, other tasks still run between polls), so tokio wakes
/// the remaining parked workers, which steal and poll the tasks. More tasks than workers are needed
/// for that: a worker only wakes another one while it has more than one task queued, and a worker
/// whose only task was stolen would park and be woken again first.
///
/// Workers are identified by their current thread
/// ([`tokio::runtime::RuntimeMetrics::worker_thread_id`]), so a worker role handed to a new thread
/// by `block_in_place` is visited on its new thread.
///
/// Bounded by `deadline`: when it expires, no further visits start, the tasks stop yielding, and
/// those that didn't get to run (e.g. because workers are busy with synchronous work) are aborted.
/// Workers that weren't visited by then are skipped. A deadline can't preempt `f` while it runs:
/// this only returns once every `f` that started has finished, so that nothing still collects when
/// the caller purges. Waiting for that doesn't block any thread. The wait uses the runtime's
/// timer, which only advances while some worker is free to drive it: if all workers are busy,
/// this returns once one of them is free again (without visiting any more workers).
///
/// On a current-thread runtime this just runs `f` on the calling thread, which is its only worker.
#[cfg(not(target_family = "wasm"))]
async fn visit_workers(
    f: impl Fn() + Send + Sync + 'static,
    deadline: std::time::Duration,
) -> WorkerVisits {
    use std::{
        collections::HashSet,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        thread::ThreadId,
        time::Instant,
    };

    use parking_lot::Mutex;
    use tokio::{
        runtime::{Handle, RuntimeFlavor, RuntimeMetrics},
        sync::Notify,
    };

    /// Grace period after the deadline for the tasks to notice it and finish.
    const GRACE: std::time::Duration = std::time::Duration::from_millis(20);
    /// With one task per worker, visiting 32 workers can take seconds, with two about a
    /// millisecond.
    const TASKS_PER_WORKER: usize = 2;

    #[derive(Default)]
    struct State {
        /// Threads `f` ran (or is running) on.
        visited: HashSet<ThreadId>,
        /// How many calls of `f` are running.
        running: usize,
        /// Set at the deadline: no more calls of `f` start.
        closed: bool,
    }

    struct Visits<F> {
        f: F,
        metrics: RuntimeMetrics,
        state: Mutex<State>,
        all_visited: AtomicBool,
        /// Notified when the last running call of `f` finished after `closed` was set.
        idle: Notify,
    }

    impl<F: Fn()> Visits<F> {
        fn is_worker_thread(&self, thread: ThreadId) -> bool {
            (0..self.metrics.num_workers())
                .any(|i| self.metrics.worker_thread_id(i) == Some(thread))
        }

        fn visited_workers(&self, state: &State) -> usize {
            (0..self.metrics.num_workers())
                .filter(|&i| {
                    self.metrics
                        .worker_thread_id(i)
                        .is_some_and(|thread| state.visited.contains(&thread))
                })
                .count()
        }

        /// Runs `f` if the calling thread is a worker that wasn't visited yet.
        fn visit_current_thread(&self) {
            let current = std::thread::current().id();
            {
                let mut state = self.state.lock();
                if state.closed
                    || state.visited.contains(&current)
                    || !self.is_worker_thread(current)
                {
                    return;
                }
                state.visited.insert(current);
                state.running += 1;
            }

            /// Marks the call of `f` as finished, also if it panics.
            struct Finish<'a, F: Fn()>(&'a Visits<F>);
            impl<F: Fn()> Drop for Finish<'_, F> {
                fn drop(&mut self) {
                    let visits = self.0;
                    let mut state = visits.state.lock();
                    state.running -= 1;
                    // Re-reads the workers' threads, in case a worker role moved to a new thread.
                    if visits.visited_workers(&state) == visits.metrics.num_workers() {
                        visits.all_visited.store(true, Ordering::Release);
                    }
                    if state.closed && state.running == 0 {
                        visits.idle.notify_one();
                    }
                }
            }
            let _finish = Finish(self);
            (self.f)();
        }

        /// Stops new calls of `f` and waits until the running ones finished.
        async fn close(&self) {
            self.state.lock().closed = true;
            // `notify_one` stores a permit if this isn't waiting yet, so no wakeup is lost.
            while self.state.lock().running > 0 {
                self.idle.notified().await;
            }
        }
    }

    let start = Instant::now();
    let handle = Handle::current();
    if handle.runtime_flavor() == RuntimeFlavor::CurrentThread {
        f();
        return WorkerVisits {
            workers: 1,
            visited: 1,
            elapsed: start.elapsed(),
        };
    }

    let metrics = handle.metrics();
    let workers = metrics.num_workers();
    let visits = Arc::new(Visits {
        f,
        metrics,
        state: Mutex::new(State::default()),
        all_visited: AtomicBool::new(false),
        idle: Notify::new(),
    });
    // When called from a worker, visit it right away; that's one task less to spread.
    visits.visit_current_thread();
    let end = start + deadline;
    let mut tasks: Vec<_> = (0..TASKS_PER_WORKER * workers)
        .map(|_| {
            let visits = visits.clone();
            tokio::spawn(async move {
                while !visits.all_visited.load(Ordering::Acquire) && Instant::now() < end {
                    visits.visit_current_thread();
                    // Also let the OS run other threads, e.g. the workers being woken, when there
                    // are more threads than CPUs.
                    std::thread::yield_now();
                    tokio::task::yield_now().await;
                }
            })
        })
        .collect();
    let wait_for_tasks = async {
        for task in &mut tasks {
            let _ = task.await;
        }
    };
    let _ = tokio::time::timeout(deadline + GRACE, wait_for_tasks).await;
    for task in &tasks {
        task.abort();
    }
    visits.close().await;
    let visited = visits.visited_workers(&visits.state.lock());
    WorkerVisits {
        workers,
        visited,
        elapsed: start.elapsed(),
    }
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

    fn multi_thread_runtime(workers: usize) -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(workers)
            .enable_all()
            .build()
            .unwrap()
    }

    fn worker_threads() -> HashSet<ThreadId> {
        let metrics = tokio::runtime::Handle::current().metrics();
        (0..metrics.num_workers())
            .map(|i| metrics.worker_thread_id(i).unwrap())
            .collect()
    }

    /// Waits until each worker thread of the current runtime has started.
    async fn wait_for_workers_to_start() {
        let metrics = tokio::runtime::Handle::current().metrics();
        let start = Instant::now();
        while (0..metrics.num_workers()).any(|i| metrics.worker_thread_id(i).is_none()) {
            assert!(
                start.elapsed() < Duration::from_secs(10),
                "workers did not start"
            );
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    }

    fn recorder() -> (Arc<Mutex<Vec<ThreadId>>>, impl Fn() + Send + Sync + 'static) {
        let visited = Arc::new(Mutex::new(Vec::new()));
        let f = {
            let visited = visited.clone();
            move || visited.lock().unwrap().push(std::thread::current().id())
        };
        (visited, f)
    }

    #[test]
    fn visits_each_worker_once() {
        const WORKERS: usize = 32;
        // With and without the LIFO slot (the Next.js runtime disables it), and from a task on a
        // worker, the usual case at shutdown, and from outside of the runtime.
        for (disable_lifo_slot, from_worker) in
            [(false, true), (false, false), (true, true), (true, false)]
        {
            let mut builder = tokio::runtime::Builder::new_multi_thread();
            builder.worker_threads(WORKERS).enable_all();
            if disable_lifo_slot {
                builder.disable_lifo_slot();
            }
            let rt = builder.build().unwrap();
            rt.block_on(async {
                wait_for_workers_to_start().await;
                let (visited, f) = recorder();
                let result = if from_worker {
                    tokio::spawn(visit_workers(f, Duration::from_secs(10)))
                        .await
                        .unwrap()
                } else {
                    visit_workers(f, Duration::from_secs(10)).await
                };

                let visited = visited.lock().unwrap();
                assert_eq!(
                    visited.len(),
                    WORKERS,
                    "from worker: {from_worker}, {result:?}"
                );
                assert_eq!(
                    visited.iter().copied().collect::<HashSet<_>>(),
                    worker_threads(),
                    "each worker must be visited once (from worker: {from_worker})"
                );
                assert_eq!(result.workers, WORKERS);
                assert_eq!(result.visited, WORKERS);
                assert!(
                    result.elapsed < Duration::from_secs(2),
                    "visiting idle workers must not take long, took {:?} (from worker: \
                     {from_worker}, LIFO slot disabled: {disable_lifo_slot})",
                    result.elapsed
                );
            });
        }
    }

    #[test]
    fn visits_the_worker_of_a_single_worker_runtime_from_outside() {
        let rt = multi_thread_runtime(1);
        rt.block_on(async {
            wait_for_workers_to_start().await;
            let (visited, f) = recorder();
            let result = visit_workers(f, Duration::from_secs(10)).await;
            assert_eq!(*visited.lock().unwrap(), Vec::from_iter(worker_threads()));
            assert_ne!(visited.lock().unwrap()[0], std::thread::current().id());
            assert_eq!((result.workers, result.visited), (1, 1));
        });
    }

    #[test]
    fn visits_the_calling_thread_of_a_current_thread_runtime() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            let (visited, f) = recorder();
            let result = visit_workers(f, Duration::from_secs(10)).await;
            assert_eq!(*visited.lock().unwrap(), [std::thread::current().id()]);
            assert_eq!((result.workers, result.visited), (1, 1));
        });
    }

    #[test]
    fn skips_busy_workers_at_the_deadline() {
        const WORKERS: usize = 4;
        const DEADLINE: Duration = Duration::from_millis(200);
        let rt = multi_thread_runtime(WORKERS);
        rt.block_on(async {
            wait_for_workers_to_start().await;
            // Occupy one worker with synchronous work that outlasts the deadline.
            let (started_tx, started_rx) = std::sync::mpsc::channel();
            let busy = tokio::spawn(async move {
                started_tx.send(std::thread::current().id()).unwrap();
                std::thread::sleep(Duration::from_secs(3));
            });
            let busy_thread = started_rx.recv().unwrap();

            let (visited, f) = recorder();
            let start = Instant::now();
            let result = visit_workers(f, DEADLINE).await;
            let elapsed = start.elapsed();

            assert!(
                elapsed < Duration::from_secs(2),
                "must not wait for the busy worker, took {elapsed:?}"
            );
            let visited = visited.lock().unwrap().iter().copied().collect::<Vec<_>>();
            assert!(!visited.contains(&busy_thread));
            let mut expected = worker_threads();
            expected.remove(&busy_thread);
            assert_eq!(visited.iter().copied().collect::<HashSet<_>>(), expected);
            assert_eq!(visited.len(), WORKERS - 1, "each worker is visited once");
            assert_eq!((result.workers, result.visited), (WORKERS, WORKERS - 1));
            busy.await.unwrap();
        });
    }

    #[test]
    fn gives_up_when_all_workers_are_busy() {
        const WORKERS: usize = 2;
        const DEADLINE: Duration = Duration::from_millis(200);
        const BUSY: Duration = Duration::from_secs(1);
        let rt = multi_thread_runtime(WORKERS);
        // Called from outside of the runtime, so the visit itself can still make progress.
        rt.block_on(async {
            wait_for_workers_to_start().await;
            let barrier = Arc::new(Barrier::new(WORKERS + 1));
            let busy: Vec<_> = (0..WORKERS)
                .map(|_| {
                    let barrier = barrier.clone();
                    tokio::spawn(async move {
                        barrier.wait();
                        std::thread::sleep(BUSY);
                    })
                })
                .collect();
            barrier.wait();

            let (visited, f) = recorder();
            let start = Instant::now();
            let result = visit_workers(f, DEADLINE).await;
            let elapsed = start.elapsed();

            // The runtime's timer can't fire while all workers are busy, so this returns once the
            // first one is free again, without visiting it: the deadline has passed by then.
            assert!(
                elapsed < BUSY + Duration::from_secs(2),
                "must not wait longer than the busy work, took {elapsed:?}"
            );
            assert_eq!((result.workers, result.visited), (WORKERS, 0));
            for task in busy {
                task.await.unwrap();
            }
            // The remaining visit tasks never run `f` once the workers are free again.
            tokio::time::sleep(Duration::from_millis(50)).await;
            assert!(visited.lock().unwrap().is_empty());
        });
    }

    #[test]
    fn concurrent_and_cancelled_visits() {
        const WORKERS: usize = 4;
        let rt = multi_thread_runtime(WORKERS);
        rt.block_on(async {
            wait_for_workers_to_start().await;
            let (visited_a, f_a) = recorder();
            let (visited_b, f_b) = recorder();
            let (a, b) = tokio::join!(
                tokio::spawn(visit_workers(f_a, Duration::from_secs(10))),
                tokio::spawn(visit_workers(f_b, Duration::from_secs(10))),
            );
            for (visited, result) in [(visited_a, a.unwrap()), (visited_b, b.unwrap())] {
                assert_eq!(visited.lock().unwrap().len(), WORKERS, "each worker once");
                assert_eq!(
                    visited
                        .lock()
                        .unwrap()
                        .iter()
                        .copied()
                        .collect::<HashSet<_>>(),
                    worker_threads()
                );
                assert_eq!(result.visited, WORKERS);
            }

            // Dropping a visit midway leaves its tasks to finish on their own, by the deadline.
            // One worker is busy, so the visit can't be complete when it's dropped.
            let metrics = tokio::runtime::Handle::current().metrics();
            let (started_tx, started_rx) = std::sync::mpsc::channel();
            let busy = tokio::spawn(async move {
                started_tx.send(()).unwrap();
                std::thread::sleep(Duration::from_millis(500));
            });
            started_rx.recv().unwrap();
            let tasks_before = metrics.num_alive_tasks();
            let (visited, f) = recorder();
            let mut visit = Box::pin(visit_workers(f, Duration::from_millis(100)));
            assert!(futures::poll!(visit.as_mut()).is_pending());
            drop(visit);
            let start = Instant::now();
            while metrics.num_alive_tasks() > tasks_before {
                assert!(
                    start.elapsed() < Duration::from_secs(2),
                    "the tasks of a dropped visit must finish by its deadline"
                );
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
            // Nothing visits after the deadline, not even the worker that was busy.
            busy.await.unwrap();
            let visits = visited.lock().unwrap().len();
            tokio::time::sleep(Duration::from_millis(50)).await;
            assert_eq!(visited.lock().unwrap().len(), visits);
            assert!(visits < WORKERS);
        });
        rt.shutdown_timeout(Duration::from_secs(5));
    }

    #[test]
    fn visits_the_new_thread_of_a_worker_handed_off_by_block_in_place() {
        const WORKERS: usize = 2;
        let rt = multi_thread_runtime(WORKERS);
        rt.block_on(async {
            wait_for_workers_to_start().await;
            let before = worker_threads();
            // Hand a worker role to a new thread; the old thread stays in `block_in_place`.
            let (handed_off_tx, handed_off_rx) = std::sync::mpsc::channel();
            let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
            let blocking = tokio::spawn(async move {
                tokio::task::block_in_place(|| {
                    handed_off_tx.send(std::thread::current().id()).unwrap();
                    release_rx.recv().unwrap();
                });
            });
            let old_thread = handed_off_rx.recv().unwrap();
            let start = Instant::now();
            let after = loop {
                let after = worker_threads();
                if after.len() == WORKERS && !after.contains(&old_thread) {
                    break after;
                }
                assert!(start.elapsed() < Duration::from_secs(10), "no handoff");
                tokio::time::sleep(Duration::from_millis(1)).await;
            };
            assert_ne!(after, before);

            let (visited, f) = recorder();
            let result = visit_workers(f, Duration::from_secs(10)).await;
            let visited = visited
                .lock()
                .unwrap()
                .iter()
                .copied()
                .collect::<HashSet<_>>();
            assert_eq!(visited, after, "the current worker threads are visited");
            assert!(!visited.contains(&old_thread));
            assert_eq!((result.workers, result.visited), (WORKERS, WORKERS));
            release_tx.send(()).unwrap();
            blocking.await.unwrap();
        });
    }

    #[test]
    fn waits_for_visits_that_outlast_the_deadline() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        const WORKERS: usize = 4;
        let rt = multi_thread_runtime(WORKERS);
        rt.block_on(async {
            wait_for_workers_to_start().await;
            let started = Arc::new(AtomicUsize::new(0));
            let running = Arc::new(AtomicUsize::new(0));
            let finished = Arc::new(AtomicUsize::new(0));
            let f = {
                let started = started.clone();
                let running = running.clone();
                let finished = finished.clone();
                move || {
                    running.fetch_add(1, Ordering::SeqCst);
                    // Only the first visit is slow, so the other workers keep the timer going.
                    if started.fetch_add(1, Ordering::SeqCst) == 0 {
                        std::thread::sleep(Duration::from_millis(600));
                    }
                    running.fetch_sub(1, Ordering::SeqCst);
                    finished.fetch_add(1, Ordering::SeqCst);
                }
            };
            let result = visit_workers(f, Duration::from_millis(50)).await;
            // The caller purges next: no visit may still be running then.
            assert_eq!(running.load(Ordering::SeqCst), 0);
            assert_eq!(finished.load(Ordering::SeqCst), result.visited);
            assert!(result.visited >= 1);
            // No visit starts after returning, either.
            tokio::time::sleep(Duration::from_millis(100)).await;
            assert_eq!(finished.load(Ordering::SeqCst), result.visited);
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
