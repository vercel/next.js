//! Bounded scoped parallelism: the number of tasks is known before the scope starts.
//!
//! [`scope_bounded`] takes that count up front, hands the caller a [`Scope`] to spawn each task
//! onto, and returns their results as an iterator. Tasks are closures and may borrow from the
//! enclosing scope (`'env`); the scope blocks until every one has finished, which is what makes
//! those borrows sound.
//!
//! Use [`scope_unbounded`](crate::scope_unbounded::scope_unbounded) instead when a running job can
//! discover more work, so the total isn't known up front.
//!
//! By default a caller that has to wait for jobs still running on helpers wraps that wait in
//! [`tokio::task::block_in_place`], so the runtime can keep running other work. Wrap the call in
//! [`without_block_in_place`] to wait by parking instead. This keeps tokio from turning the
//! worker into a blocking-pool thread and spawning a replacement.

use std::{
    any::Any,
    cell::Cell,
    marker::PhantomData,
    num::NonZeroUsize,
    panic::{self, AssertUnwindSafe, catch_unwind},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
        mpmc::{self, Receiver, Sender},
    },
    thread::{self, Thread},
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Span, info_span};

use crate::{TurboTasksApi, manager::try_turbo_tasks, turbo_tasks_scope};

/// A job placed on the work queue: its result-slot index and the closure to run.
type WorkQueueJob = (usize, Box<dyn FnOnce() + Send + 'static>);

thread_local! {
    /// Set while running inside [`without_block_in_place`] on this thread.
    static WITHOUT_BLOCK_IN_PLACE: Cell<bool> = const { Cell::new(false) };
}

/// Runs `f` so that every [`scope_bounded`] (and every `crate::parallel` helper) it calls waits for
/// its jobs by parking, without calling [`tokio::task::block_in_place`].
///
/// `block_in_place` gives up the worker's scheduler slot. The thread becomes a blocking-pool thread
/// and tokio starts a replacement worker. With many short parallel sections this grows the blocking
/// pool by up to one idle thread per worker, and every thread keeps its own allocator heap alive
/// until tokio's keep-alive expires. In this mode the calling worker stays a worker instead.
///
/// The mode carries over to the jobs: helpers that run jobs of a scope created in this mode run
/// them in this mode too, so nested scopes behave the same on every thread. Waiting never depends
/// on another task being scheduled, because the caller drains the queue itself first. This holds
/// as long as the jobs are independent, which [`scope_bounded`] requires anyway.
///
/// The trade-off is that the calling worker is not available to other tasks while it waits.
pub fn without_block_in_place<R>(f: impl FnOnce() -> R) -> R {
    struct Restore(bool);
    impl Drop for Restore {
        fn drop(&mut self) {
            WITHOUT_BLOCK_IN_PLACE.with(|flag| flag.set(self.0));
        }
    }
    let _restore = Restore(WITHOUT_BLOCK_IN_PLACE.with(|flag| flag.replace(true)));
    f()
}

fn is_without_block_in_place() -> bool {
    WITHOUT_BLOCK_IN_PLACE.with(Cell::get)
}

struct ScopeInner {
    /// Whether waiting may use `block_in_place`. Captured when the scope is created; see
    /// [`without_block_in_place`].
    allow_block_in_place: bool,
    main_thread: Thread,
    remaining_tasks: AtomicUsize,
    /// The first panic that occurred in the tasks, by task index.
    /// The usize value is the index of the task.
    panic: Mutex<Option<(Box<dyn Any + Send + 'static>, usize)>>,
    /// Receiving end of the work queue, shared by every drainer. Dropping the `Scope`'s sender is
    /// what signals that no more jobs are coming.
    work_queue: Receiver<WorkQueueJob>,
}

impl ScopeInner {
    fn on_task_finished(&self, panic: Option<(Box<dyn Any + Send + 'static>, usize)>) {
        if let Some((err, index)) = panic {
            let mut old_panic = self.panic.lock();
            if old_panic.as_ref().is_none_or(|&(_, i)| i > index) {
                *old_panic = Some((err, index));
            }
        }
        if self.remaining_tasks.fetch_sub(1, Ordering::Release) == 1 {
            self.main_thread.unpark();
        }
    }

    fn wait(&self) {
        if self.remaining_tasks.load(Ordering::Acquire) == 0 {
            return;
        }

        let _span = info_span!("blocking").entered();

        // Park up to 1ms without block_in_place to avoid the overhead.
        const TIMEOUT: Duration = Duration::from_millis(1);
        let beginning_park = Instant::now();

        let mut timeout_remaining = TIMEOUT;
        loop {
            thread::park_timeout(timeout_remaining);
            if self.remaining_tasks.load(Ordering::Acquire) == 0 {
                return;
            }
            let elapsed = beginning_park.elapsed();
            if elapsed >= TIMEOUT {
                break;
            }
            timeout_remaining = TIMEOUT - elapsed;
        }

        let park_until_done = || {
            while self.remaining_tasks.load(Ordering::Acquire) != 0 {
                thread::park();
            }
        };
        if self.allow_block_in_place {
            // Park with block_in_place to allow to continue other work
            block_in_place(park_until_done);
        } else {
            // Keep this thread's worker slot: no blocking-pool hand-off (see
            // `without_block_in_place`). Only jobs already running elsewhere are left, because
            // the queue was drained inline before waiting.
            park_until_done();
        }
    }

    fn wait_and_rethrow_panic(&self) {
        self.wait();
        if let Some((err, _)) = self.panic.lock().take() {
            panic::resume_unwind(err);
        }
    }

    /// Pulls jobs from the shared work queue and runs them until the queue is closed and drained,
    /// recording any panic. Both the opportunistic helper worker tasks and the calling thread (via
    /// `Scope::drop`) run this.
    fn run_jobs(&self) {
        while let Ok((index, job)) = self.work_queue.recv() {
            let result = catch_unwind(AssertUnwindSafe(job));
            let panic = result.err().map(|e| (e, index));
            self.on_task_finished(panic);
        }
    }
}

/// Scope to allow spawning tasks with a limited lifetime.
///
/// Dropping this Scope will wait for all tasks to complete.
pub struct Scope<'scope, 'env: 'scope, R: Send + 'env> {
    results: &'scope [Mutex<Option<R>>],
    index: AtomicUsize,
    inner: Arc<ScopeInner>,
    /// Sending end of the work queue. The only sender; `Drop` takes it to close the queue.
    work_queue: Option<Sender<WorkQueueJob>>,
    /// The runtime to spawn helpers on. `None` outside of a tokio runtime, in which case the
    /// calling thread runs every job itself.
    handle: Option<Handle>,
    /// Max number of threads to use, threads are only spawned when needed. The calling thread
    /// counts towards this budget, so we spawn at most `worker_tasks - 1` helpers.
    worker_tasks: NonZeroUsize,
    /// The caller's turbo-tasks context, entered by each helper task so jobs on helper threads see
    /// the same context as jobs drained inline by the calling thread.
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    span: Span,
    /// Invariance over 'env, to make sure 'env cannot shrink, which is necessary for soundness.
    ///
    /// See the comment in the stdlib implementation:
    /// <https://github.com/rust-lang/rust/blob/3b1b0ef4d8/library/std/src/thread/scoped.rs#L12-L33>
    env: PhantomData<&'env mut &'env ()>,
}

impl<'scope, 'env: 'scope, R: Send + 'env> Scope<'scope, 'env, R> {
    /// Creates a new scope.
    ///
    /// # Safety
    ///
    /// The caller must ensure `Scope` is dropped and not forgotten.
    unsafe fn new(results: &'scope [Mutex<Option<R>>]) -> Self {
        let handle = Handle::try_current().ok();
        // Never use more threads than there are jobs, or than the runtime has workers.
        let worker_tasks = handle
            .as_ref()
            .and_then(|handle| NonZeroUsize::new(handle.metrics().num_workers().min(results.len())))
            .unwrap_or(NonZeroUsize::MIN);
        let (sender, receiver) = mpmc::channel();
        Self {
            results,
            index: AtomicUsize::new(0),
            inner: Arc::new(ScopeInner {
                allow_block_in_place: !is_without_block_in_place(),
                main_thread: thread::current(),
                remaining_tasks: AtomicUsize::new(0),
                panic: Mutex::new(None),
                work_queue: receiver,
            }),
            work_queue: Some(sender),
            handle,
            worker_tasks,
            turbo_tasks: try_turbo_tasks(),
            span: Span::current(),
            env: PhantomData,
        }
    }

    /// Spawns a new task in the scope.
    pub fn spawn<F>(&self, f: F)
    where
        F: FnOnce() -> R + Send + 'env,
    {
        let index = self.index.fetch_add(1, Ordering::Relaxed);
        assert!(index < self.results.len(), "Too many tasks spawned");
        let result_cell: &Mutex<Option<R>> = &self.results[index];

        // The turbo-tasks context is not entered per job: helpers enter it once (below), and the
        // calling thread already has it. Re-entering it on the calling thread would panic when the
        // caller holds a borrow of the task-local, e.g. inside `with_turbo_tasks`.
        let f: Box<dyn FnOnce() + Send + 'scope> = Box::new(|| {
            let result = f();
            *result_cell.lock() = Some(result);
        });
        let f: *mut (dyn FnOnce() + Send + 'scope) = Box::into_raw(f);

        // SAFETY: Scope ensures (e. g. in Drop) that spawned tasks is awaited before the
        // lifetime `'env` ends.
        let f = unsafe {
            std::mem::transmute::<
                *mut (dyn FnOnce() + Send + 'scope),
                *mut (dyn FnOnce() + Send + 'static),
            >(f)
        };

        // SAFETY: We just called `Box::into_raw`.
        let f = unsafe { Box::from_raw(f) };

        self.inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);

        // Add to the shared work queue, all threads read from this. Neither failure is reachable,
        // but a job silently dropped here would leave `remaining_tasks` above zero and hang the
        // scope, so panic instead.
        self.work_queue
            .as_ref()
            .expect("sender is only taken in Drop")
            .send((index, f))
            .expect("receiver is owned by inner and outlives the scope");

        // Spawn a tokio worker for each job until we hit the max `worker_tasks`.
        if index < self.worker_tasks.get() - 1
            && let Some(handle) = &self.handle
        {
            let inner = self.inner.clone();
            let span = self.span.clone();
            let turbo_tasks = self.turbo_tasks.clone();
            handle.spawn(async move {
                let _span = span.entered();
                let run_jobs = || {
                    if inner.allow_block_in_place {
                        inner.run_jobs();
                    } else {
                        // Nested scopes created by these jobs must not hand off this worker
                        // either.
                        without_block_in_place(|| inner.run_jobs());
                    }
                };
                if let Some(turbo_tasks) = turbo_tasks {
                    // Ensure that the turbo tasks context is maintained across the jobs.
                    turbo_tasks_scope(turbo_tasks, run_jobs);
                } else {
                    run_jobs();
                }
            });
        }
    }
}

impl<'scope, 'env: 'scope, R: Send + 'env> Drop for Scope<'scope, 'env, R> {
    fn drop(&mut self) {
        // Close the queue by dropping the only sender. This must happen before draining below:
        // `run_jobs` blocks in `recv` until the queue is closed, so a live sender here would hang
        // the scope.
        drop(
            self.work_queue
                .take()
                .expect("sender is taken exactly once, here in Drop"),
        );
        // Drain inline so completion never depends on a helper being scheduled.
        self.inner.run_jobs();
        self.inner.wait_and_rethrow_panic();
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
///
/// Jobs are added to a shared work queue and processed by the calling thread plus up to
/// `runtime worker threads - 1` opportunistic helpers. The helpers are a pure optimization — the
/// calling thread drains the whole queue by itself if none ever runs — so this does not deadlock on
/// a thread-limited runtime or when the worker threads are otherwise occupied. Jobs must be
/// independent (they must not block waiting on each other), since the degree of real concurrency is
/// bounded by the runtime's worker threads.
///
/// Be aware that although this function avoids starving other independently spawned tasks, any
/// other code running concurrently in the same task will be suspended during the call to
/// block_in_place. This can happen e.g. when using the `join!` macro. To avoid this issue, call
/// `scope_bounded` in `spawn_blocking`.
///
/// Inside [`without_block_in_place`] the caller waits by parking instead of calling
/// block_in_place. Outside of a tokio runtime the calling thread runs every job itself.
pub fn scope_bounded<'env, F, R>(number_of_tasks: usize, f: F) -> impl Iterator<Item = R>
where
    R: Send + 'env,
    F: for<'scope> FnOnce(&'scope Scope<'scope, 'env, R>) + 'env,
{
    let mut results = Vec::with_capacity(number_of_tasks);
    for _ in 0..number_of_tasks {
        results.push(Mutex::new(None));
    }
    let results = results.into_boxed_slice();
    let result = {
        // SAFETY: We drop the Scope later.
        let scope = unsafe { Scope::new(&results) };
        catch_unwind(AssertUnwindSafe(|| f(&scope)))
    };
    if let Err(panic) = result {
        panic::resume_unwind(panic);
    }
    results.into_iter().map(|mutex| {
        mutex
            .into_inner()
            .expect("All values are set when the scope returns without panic")
    })
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::atomic::AtomicUsize,
    };

    use super::*;

    /// A scope must make progress even when every runtime worker thread is busy, since the calling
    /// thread can always drain the shared queue itself.
    ///
    /// Every worker thread is pinned by a task blocking synchronously until a release deadline, so
    /// no helper can be scheduled; we assert the scope still finishes well before that deadline.
    /// The deadline also guarantees the test fails cleanly instead of hanging.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_scope_worker_threads_occupied() {
        const WORKER_THREADS: usize = 2;
        const JOBS: usize = 64;
        const RELEASE_AFTER: Duration = Duration::from_secs(4);

        // Pin every runtime worker thread with a task that blocks synchronously (holding its core,
        // no block_in_place hand-off) until the release deadline.
        let ready = Arc::new(AtomicUsize::new(0));
        let mut occupiers = Vec::with_capacity(WORKER_THREADS);
        for _ in 0..WORKER_THREADS {
            let ready = ready.clone();
            occupiers.push(tokio::spawn(async move {
                ready.fetch_add(1, Ordering::SeqCst);
                thread::sleep(RELEASE_AFTER);
            }));
        }
        // Wait until both occupiers are actually running (and thus holding both cores).
        while ready.load(Ordering::SeqCst) < WORKER_THREADS {
            tokio::task::yield_now().await;
        }

        let started = Instant::now();
        let results = tokio::task::spawn_blocking(move || {
            scope_bounded(JOBS, |scope| {
                for i in 0..JOBS {
                    scope.spawn(move || i);
                }
            })
            .collect::<Vec<_>>()
        })
        .await
        .unwrap();
        let elapsed = started.elapsed();

        assert_eq!(results.len(), JOBS);
        results.iter().enumerate().for_each(|(i, &result)| {
            assert_eq!(result, i);
        });
        assert!(
            elapsed < RELEASE_AFTER / 2,
            "scope_bounded took {elapsed:?}; it should not depend on an occupied worker thread \
             freeing up"
        );

        for occupier in occupiers {
            occupier.await.unwrap();
        }
    }

    /// On a `current_thread` runtime no helpers can be spawned and `block_in_place` is not allowed,
    /// so the calling thread must drain the queue inline rather than panicking or hanging.
    #[tokio::test(flavor = "current_thread")]
    async fn test_scope_current_thread_runtime() {
        let results = tokio::task::spawn_blocking(|| {
            scope_bounded(16, |scope| {
                for i in 0..16 {
                    scope.spawn(move || i);
                }
            })
            .collect::<Vec<_>>()
        })
        .await
        .unwrap();
        assert_eq!(results.len(), 16);
        results.iter().enumerate().for_each(|(i, &result)| {
            assert_eq!(result, i);
        });
    }

    /// Helpers must actually add parallelism when threads are available: jobs that each block
    /// briefly should complete in far less than their serial sum.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    // Node Worker startup makes the native timing bound too strict on wasm. A later layer uses a
    // platform-aware bound that still distinguishes parallel from serial execution.
    #[cfg_attr(
        target_family = "wasm",
        ignore = "timing bound is too strict for Node Worker startup"
    )]
    async fn test_scope_runs_in_parallel() {
        const JOBS: usize = 16;
        const PER_JOB: Duration = Duration::from_millis(50);
        let started = Instant::now();
        let results = tokio::task::spawn_blocking(|| {
            scope_bounded(JOBS, |scope| {
                for i in 0..JOBS {
                    scope.spawn(move || {
                        thread::sleep(PER_JOB);
                        i
                    });
                }
            })
            .collect::<Vec<_>>()
        })
        .await
        .unwrap();
        let elapsed = started.elapsed();
        assert_eq!(results.len(), JOBS);
        // Half the serial time is a loose bound on purpose: 4 threads should beat it comfortably,
        // so a slow machine won't make this flaky.
        assert!(
            elapsed < (JOBS as u32 * PER_JOB) / 2,
            "scope_bounded took {elapsed:?}; expected parallel speedup across worker threads"
        );
    }

    /// Runs `JOBS` jobs from a runtime worker thread so that the caller has to wait for jobs still
    /// running on helpers. Every job also starts a nested scope. Returns the results and how many
    /// blocking-pool threads the runtime gained.
    async fn run_jobs_caller_waits_on_helpers(without: bool) -> (Vec<usize>, usize) {
        const JOBS: usize = 16;
        const HELPER_JOB: Duration = Duration::from_millis(100);
        const WAIT_FOR_HELPER: Duration = Duration::from_secs(2);
        tokio::spawn(async move {
            let metrics = Handle::current().metrics();
            let before = metrics.num_blocking_threads();
            let caller = thread::current().id();
            let helper_started = &std::sync::atomic::AtomicBool::new(false);
            let run = || {
                scope_bounded(JOBS, |scope| {
                    for i in 0..JOBS {
                        scope.spawn(move || {
                            // The mode carries over to helper threads and nested scopes.
                            assert_eq!(is_without_block_in_place(), without);
                            let nested = scope_bounded(2, |scope| {
                                scope.spawn(move || i);
                                scope.spawn(move || i);
                            })
                            .sum::<usize>()
                                / 2;
                            if thread::current().id() == caller {
                                // Make sure some job is running on a helper, so the caller has to
                                // wait for it after draining the queue.
                                let started = Instant::now();
                                while !helper_started.load(Ordering::Acquire)
                                    && started.elapsed() < WAIT_FOR_HELPER
                                {
                                    thread::yield_now();
                                }
                            } else {
                                helper_started.store(true, Ordering::Release);
                                thread::sleep(HELPER_JOB);
                            }
                            nested
                        });
                    }
                })
                .collect::<Vec<_>>()
            };
            let results = if without {
                without_block_in_place(run)
            } else {
                run()
            };
            assert!(helper_started.load(Ordering::Acquire));
            let after = metrics.num_blocking_threads();
            (results, after.saturating_sub(before))
        })
        .await
        .unwrap()
    }

    /// Inside `without_block_in_place`, a caller waiting for helper jobs keeps its worker, so the
    /// blocking pool does not grow.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_without_block_in_place_does_not_grow_blocking_pool() {
        let (results, new_blocking_threads) = run_jobs_caller_waits_on_helpers(true).await;
        assert_eq!(results, (0..16).collect::<Vec<_>>());
        assert_eq!(
            new_blocking_threads, 0,
            "without_block_in_place must not hand workers off to the blocking pool"
        );
    }

    /// The default mode waits with `block_in_place`, which moves workers to the blocking pool. This
    /// is what `without_block_in_place` avoids, and it shows the test above can detect it.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_default_mode_grows_blocking_pool() {
        let (results, new_blocking_threads) = run_jobs_caller_waits_on_helpers(false).await;
        assert_eq!(results, (0..16).collect::<Vec<_>>());
        assert!(new_blocking_threads > 0);
    }

    /// Without `block_in_place`, a caller on a runtime worker must still finish when every other
    /// worker is occupied, because it drains the queue itself.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_without_block_in_place_other_workers_occupied() {
        const JOBS: usize = 64;
        const RELEASE_AFTER: Duration = Duration::from_secs(4);

        let ready = Arc::new(AtomicUsize::new(0));
        let occupier = {
            let ready = ready.clone();
            tokio::spawn(async move {
                ready.fetch_add(1, Ordering::SeqCst);
                thread::sleep(RELEASE_AFTER);
            })
        };
        while ready.load(Ordering::SeqCst) < 1 {
            tokio::task::yield_now().await;
        }

        let started = Instant::now();
        let results = tokio::spawn(async move {
            without_block_in_place(|| {
                scope_bounded(JOBS, |scope| {
                    for i in 0..JOBS {
                        scope.spawn(move || i);
                    }
                })
                .collect::<Vec<_>>()
            })
        })
        .await
        .unwrap();
        assert!(started.elapsed() < RELEASE_AFTER / 2);
        assert_eq!(results, (0..JOBS).collect::<Vec<_>>());
        occupier.await.unwrap();
    }

    /// Outside of a tokio runtime the calling thread runs every job itself.
    #[test]
    fn test_scope_outside_runtime() {
        let results = thread::spawn(|| {
            scope_bounded(16, |scope| {
                for i in 0..16 {
                    scope.spawn(move || {
                        // Nested scopes work too.
                        scope_bounded(1, |scope| scope.spawn(move || i)).sum::<usize>()
                    });
                }
            })
            .collect::<Vec<_>>()
        })
        .join()
        .unwrap();
        assert_eq!(results, (0..16).collect::<Vec<_>>());
    }

    /// The mode is restored when `without_block_in_place` returns or unwinds.
    #[test]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "no unwinding on wasm: std is built panic=abort, so catch_unwind cannot catch"
    )]
    fn test_without_block_in_place_restores_mode() {
        assert!(!is_without_block_in_place());
        without_block_in_place(|| {
            assert!(is_without_block_in_place());
            without_block_in_place(|| assert!(is_without_block_in_place()));
            assert!(is_without_block_in_place());
        });
        assert!(!is_without_block_in_place());
        let _ = catch_unwind(|| without_block_in_place(|| panic!("Intentional panic")));
        assert!(!is_without_block_in_place());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_scope() {
        let results = scope_bounded(1000, |scope| {
            for i in 0..1000 {
                scope.spawn(move || i);
            }
        });
        let results = results.collect::<Vec<_>>();
        results.iter().enumerate().for_each(|(i, &result)| {
            assert_eq!(result, i);
        });
        assert_eq!(results.len(), 1000);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_empty_scope() {
        let results = scope_bounded(0, |scope| {
            if false {
                scope.spawn(|| 42);
            }
        });
        assert_eq!(results.count(), 0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_single_task() {
        let results = scope_bounded(1, |scope| {
            scope.spawn(|| 42);
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_task_finish_before_scope() {
        let results = scope_bounded(1, |scope| {
            scope.spawn(|| 42);
            thread::sleep(std::time::Duration::from_millis(100));
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_task_finish_after_scope() {
        let results = scope_bounded(1, |scope| {
            scope.spawn(|| {
                thread::sleep(std::time::Duration::from_millis(100));
                42
            });
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    // Relies on `catch_unwind` catching, which needs unwinding; wasm is panic = abort.
    #[cfg_attr(
        target_family = "wasm",
        ignore = "no unwinding on wasm: std is built panic=abort, so catch_unwind cannot catch"
    )]
    async fn test_panic_in_scope_factory() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_bounded(1000, |scope| {
                for i in 0..500 {
                    scope.spawn(move || i);
                }
                panic!("Intentional panic");
            });
            unreachable!();
        }));
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().downcast_ref::<&str>(),
            Some(&"Intentional panic")
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    // Relies on `catch_unwind` catching, which needs unwinding; wasm is panic = abort.
    #[cfg_attr(
        target_family = "wasm",
        ignore = "no unwinding on wasm: std is built panic=abort, so catch_unwind cannot catch"
    )]
    async fn test_panic_in_scope_task() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_bounded(1000, |scope| {
                for i in 0..1000 {
                    scope.spawn(move || {
                        if i == 500 {
                            panic!("Intentional panic");
                        } else if i == 501 {
                            panic!("Wrong intentional panic");
                        } else {
                            i
                        }
                    });
                }
            });
            unreachable!();
        }));
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().downcast_ref::<&str>(),
            Some(&"Intentional panic")
        );
    }
}
