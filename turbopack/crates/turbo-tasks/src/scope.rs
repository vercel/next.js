//! A scoped tokio spawn implementation that allow a non-'static lifetime for tasks.

use std::{
    any::Any,
    collections::VecDeque,
    marker::PhantomData,
    panic::{self, AssertUnwindSafe, catch_unwind},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    thread::{self, Thread},
    time::{Duration, Instant},
};

use parking_lot::{Condvar, Mutex};
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Span, info_span};

use crate::{TurboTasksApi, manager::try_turbo_tasks, turbo_tasks_scope};

enum WorkQueueJob {
    Job(usize, Box<dyn FnOnce() + Send + 'static>),
    End,
}

struct ScopeInner {
    main_thread: Thread,
    remaining_tasks: AtomicUsize,
    /// The first panic that occurred in the tasks, by task index.
    /// The usize value is the index of the task.
    panic: Mutex<Option<(Box<dyn Any + Send + 'static>, usize)>>,
    /// The work queue for spawned jobs that have not yet been picked up by a worker task.
    work_queue: Mutex<VecDeque<WorkQueueJob>>,
    /// A condition variable to notify worker tasks of new work or end of work.
    work_queue_condition_var: Condvar,
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

        // Park with block_in_place to allow to continue other work
        block_in_place(|| {
            while self.remaining_tasks.load(Ordering::Acquire) != 0 {
                thread::park();
            }
        });
    }

    fn wait_and_rethrow_panic(&self) {
        self.wait();
        if let Some((err, _)) = self.panic.lock().take() {
            panic::resume_unwind(err);
        }
    }

    /// Pulls jobs from the shared work queue and runs them until the `End` sentinel, recording any
    /// panic. Both the opportunistic helper worker tasks and the calling thread (via
    /// `end_and_help_complete`) run this. Helpers are a pure optimization: whether zero or all of
    /// them ever get scheduled, the calling thread drains the whole queue by itself, so liveness
    /// never depends on a helper being scheduled.
    fn run_jobs(&self) {
        while let Some((index, job)) = self.pick_job_from_work_queue() {
            let result = catch_unwind(AssertUnwindSafe(job));
            let panic = result.err().map(|e| (e, index));
            self.on_task_finished(panic);
        }
    }

    fn pick_job_from_work_queue(&self) -> Option<(usize, Box<dyn FnOnce() + Send + 'static>)> {
        let mut work_queue = self.work_queue.lock();
        let job = loop {
            if let Some(job) = work_queue.pop_front() {
                break job;
            } else {
                self.work_queue_condition_var.wait(&mut work_queue);
            };
        };
        match job {
            WorkQueueJob::Job(index, job) => {
                // If work remains, wake another helper. `parking_lot` notifications are not
                // latched, so a `notify_one` at enqueue time is lost if no helper was parked yet
                // (e.g. it was busy running a previous job). Handing off the surplus wakeup here
                // ensures idle helpers still get pulled in, preserving parallelism.
                if !work_queue.is_empty() {
                    self.work_queue_condition_var.notify_one();
                }
                drop(work_queue);
                Some((index, job))
            }
            WorkQueueJob::End => {
                // Reinsert so other workers can find it
                work_queue.push_front(WorkQueueJob::End);
                drop(work_queue);
                self.work_queue_condition_var.notify_all();
                None
            }
        }
    }

    fn end_and_help_complete(&self) {
        // Mark the end of work, then drain whatever remains inline. Pushing `End` first guarantees
        // `help` never blocks on the condvar (the queue is non-empty), and the `End` handling in
        // `pick_job_from_work_queue` wakes any parked helpers. This is what makes the calling
        // thread able to complete the whole scope by itself, regardless of whether any
        // helper ran.
        self.work_queue.lock().push_back(WorkQueueJob::End);
        self.run_jobs();
    }
}

/// Scope to allow spawning tasks with a limited lifetime.
///
/// Dropping this Scope will wait for all tasks to complete.
pub struct Scope<'scope, 'env: 'scope, R: Send + 'env> {
    results: &'scope [Mutex<Option<R>>],
    index: AtomicUsize,
    inner: Arc<ScopeInner>,
    handle: Handle,
    /// Max number of opportunistic helper worker tasks to spawn: the tokio runtime's worker count
    /// minus the main thread. Helper workers run synchronous code and hold their tokio core
    /// without yielding, so spawning more than there are worker threads would be pointless
    /// (they can't run concurrently) and, historically, deadlock-prone. Helpers are now a pure
    /// optimization — the main thread can drain the whole queue by itself — so this only sizes
    /// the parallelism, never correctness.
    worker_tasks: usize,
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
        let handle = Handle::current();
        // Size helpers to the actual runtime worker count minus the main thread. A helper runs
        // synchronous code and holds its tokio core without yielding, so spawning more than there
        // are worker threads can never add concurrency. This is the true ceiling: the
        // `TURBO_TASKS_AVAILABLE_PARALLELISM` override already flows in through `num_workers()`
        // because the runtime's worker thread count is derived from it. `num_workers()` is O(1) and
        // returns 1 for a current-thread runtime (=> 0 helpers => everything drains inline on the
        // main thread). Liveness never depends on this value — it only sizes the parallelism.
        let worker_tasks = handle.metrics().num_workers().saturating_sub(1);
        Self {
            results,
            index: AtomicUsize::new(0),
            inner: Arc::new(ScopeInner {
                main_thread: thread::current(),
                remaining_tasks: AtomicUsize::new(0),
                panic: Mutex::new(None),
                work_queue: Mutex::new(VecDeque::new()),
                work_queue_condition_var: Condvar::new(),
            }),
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

        let turbo_tasks = self.turbo_tasks.clone();
        let f: Box<dyn FnOnce() + Send + 'scope> = Box::new(|| {
            let result = {
                if let Some(turbo_tasks) = turbo_tasks {
                    // Ensure that the turbo tasks context is maintained across the job.
                    turbo_tasks_scope(turbo_tasks, f)
                } else {
                    // If no turbo tasks context is available, just run the job.
                    f()
                }
            };
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

        let span = self.span.clone();

        self.inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);

        // Every job goes on the shared work queue. The main thread (in Drop via
        // `end_and_help_complete`) drains the entire queue by itself if no helper ever runs, so
        // liveness never depends on a spawned helper being scheduled — this is what makes the
        // primitive robust on thread-limited or otherwise-contended runtimes.
        self.inner
            .work_queue
            .lock()
            .push_back(WorkQueueJob::Job(index, f));
        self.inner.work_queue_condition_var.notify_one();

        // Opportunistically spawn a helper worker task to add parallelism, up to `worker_tasks`.
        // Helpers pull from the same shared queue; they are never assigned a specific job (that
        // would double-run it). Index 0 is the main thread's share, so helpers cover indices
        // `1..=worker_tasks`.
        if (1..=self.worker_tasks).contains(&index) {
            let inner = self.inner.clone();
            self.handle.spawn(async move {
                let _span = span.entered();
                inner.run_jobs();
            });
        }
    }
}

impl<'scope, 'env: 'scope, R: Send + 'env> Drop for Scope<'scope, 'env, R> {
    fn drop(&mut self) {
        self.inner.end_and_help_complete();
        self.inner.wait_and_rethrow_panic();
    }
}

/// Helper method to spawn tasks in parallel, ensuring that all tasks are awaited and errors are
/// handled. Also ensures turbo tasks and tracing context are maintained across the tasks.
///
/// Jobs are added to a shared work queue and processed by up to `runtime worker threads - 1`
/// opportunistic helper worker tasks plus the calling thread. The helpers are a pure optimization:
/// the calling thread drains the whole queue by itself if no helper ever runs, so this does not
/// deadlock even on a thread-limited runtime or when the worker threads are otherwise occupied.
/// Jobs must be independent (they must not block waiting on each other), since the degree of real
/// concurrency is bounded by the runtime's worker threads.
///
/// Be aware that although this function avoids starving other independently spawned tasks, any
/// other code running concurrently in the same task will be suspended during the call to
/// block_in_place. This can happen e.g. when using the `join!` macro. To avoid this issue, call
/// `scope_and_block` in `spawn_blocking`.
pub fn scope_and_block<'env, F, R>(number_of_tasks: usize, f: F) -> impl Iterator<Item = R>
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
    use std::panic::{AssertUnwindSafe, catch_unwind};

    use super::*;

    /// Regression test for the deadlock this primitive hit when adopted for parallel consumption of
    /// a shared worklist (e.g. `gc_collect`) on a thread-limited runtime.
    ///
    /// Previously `scope_and_block` sized its worker count from the host cpu count
    /// (`available_parallelism() - 1`) and handed job indices `1..=WORKER_TASKS` *exclusively* to
    /// spawned worker tasks — those jobs were never placed on the shared work queue, so *only* a
    /// spawned worker could run them. A spawned worker runs synchronous code and, once scheduled,
    /// holds its tokio core without ever yielding it back. When the runtime's worker threads are
    /// already occupied by other synchronous/blocking work (as happens under GC, which holds a
    /// global operation lock while other tasks block), the scope's spawned workers can never be
    /// scheduled onto a core. The jobs assigned to them never run, `remaining_tasks` never reaches
    /// zero, and the caller blocks forever.
    ///
    /// This reproduces it deterministically without risking a hung test process. Every runtime
    /// worker thread is pinned by a task that blocks synchronously (holding its core, *not* via
    /// `block_in_place`, so tokio cannot hand the core off), and those tasks are released only
    /// after a fixed delay. The scope runs on a separate `spawn_blocking` thread. Pre-fix: the jobs
    /// assigned to spawned workers cannot run until a core frees up, so the scope cannot finish
    /// before the release delay. Post-fix: every job lives on the shared work queue and the
    /// caller's own thread drains all of them immediately, so the scope finishes well before the
    /// release. We assert the scope finished quickly — which fails cleanly (no hang) on the old
    /// code because the scope thread is still blocked when we check, but the release timer
    /// guarantees the process still makes progress and exits.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_scope_worker_threads_occupied() {
        const WORKER_THREADS: usize = 2;
        const JOBS: usize = 64;
        const RELEASE_AFTER: Duration = Duration::from_secs(4);

        // Pin every runtime worker thread with a task that blocks synchronously (holding its core,
        // no block_in_place hand-off) until the release deadline. Models threads stuck on other
        // work while GC runs.
        let ready = Arc::new(AtomicUsize::new(0));
        let mut occupiers = Vec::with_capacity(WORKER_THREADS);
        for _ in 0..WORKER_THREADS {
            let ready = ready.clone();
            occupiers.push(tokio::spawn(async move {
                ready.fetch_add(1, Ordering::SeqCst);
                // Synchronous sleep: holds the core for the whole duration.
                thread::sleep(RELEASE_AFTER);
            }));
        }
        // Wait until both occupiers are actually running (and thus holding both cores).
        while ready.load(Ordering::SeqCst) < WORKER_THREADS {
            tokio::task::yield_now().await;
        }

        let started = Instant::now();
        let results = tokio::task::spawn_blocking(move || {
            scope_and_block(JOBS, |scope| {
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
        // The scope must complete on its own thread without waiting for an occupied core to free
        // up. On the old code the jobs assigned to spawned workers could not run until an occupier
        // released its core, so this would take ~RELEASE_AFTER.
        assert!(
            elapsed < RELEASE_AFTER / 2,
            "scope_and_block took {elapsed:?}; it should not depend on an occupied worker thread \
             freeing up"
        );

        for occupier in occupiers {
            occupier.await.unwrap();
        }
    }

    /// On a `current_thread` runtime there are no worker threads to spawn helpers onto, and
    /// `block_in_place` is not even allowed. `num_workers()` reports 1, so `worker_tasks` is 0 and
    /// the main thread drains the entire queue inline — reaching `remaining_tasks == 0` before
    /// `wait()` would ever call `block_in_place`. This must complete rather than panic or hang.
    #[tokio::test(flavor = "current_thread")]
    async fn test_scope_current_thread_runtime() {
        let results = tokio::task::spawn_blocking(|| {
            scope_and_block(16, |scope| {
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

    /// Sanity check that helpers actually add parallelism when threads are available: with a pool
    /// larger than 1, many jobs that each block briefly complete in far less than their serial sum.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_scope_runs_in_parallel() {
        const JOBS: usize = 16;
        const PER_JOB: Duration = Duration::from_millis(50);
        let started = Instant::now();
        let results = tokio::task::spawn_blocking(|| {
            scope_and_block(JOBS, |scope| {
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
        // Serial would be JOBS * PER_JOB = 800ms. With 4 worker threads we expect a meaningful
        // speedup; assert well under half the serial time to avoid flakiness.
        assert!(
            elapsed < (JOBS as u32 * PER_JOB) / 2,
            "scope_and_block took {elapsed:?}; expected parallel speedup across worker threads"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_scope() {
        let results = scope_and_block(1000, |scope| {
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
        let results = scope_and_block(0, |scope| {
            if false {
                scope.spawn(|| 42);
            }
        });
        assert_eq!(results.count(), 0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_single_task() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(|| 42);
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_task_finish_before_scope() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(|| 42);
            thread::sleep(std::time::Duration::from_millis(100));
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_task_finish_after_scope() {
        let results = scope_and_block(1, |scope| {
            scope.spawn(|| {
                thread::sleep(std::time::Duration::from_millis(100));
                42
            });
        })
        .collect::<Vec<_>>();
        assert_eq!(results, vec![42]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_panic_in_scope_factory() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_and_block(1000, |scope| {
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
    async fn test_panic_in_scope_task() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _results = scope_and_block(1000, |scope| {
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
