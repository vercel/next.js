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
    thread::{self, Thread, available_parallelism},
    time::{Duration, Instant},
};

use once_cell::sync::Lazy;
use parking_lot::{Condvar, Mutex};
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Span, info_span};

use crate::{TurboTasksApi, manager::try_turbo_tasks, turbo_tasks_scope};

/// Number of worker tasks to spawn that process jobs. It's 1 less than the number of cpus as we
/// also use the current task as worker.
static WORKER_TASKS: Lazy<usize> = Lazy::new(|| available_parallelism().map_or(0, |n| n.get() - 1));

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

    fn worker(&self, first_job_index: usize, first_job: Box<dyn FnOnce() + Send + 'static>) {
        let mut current_job_index = first_job_index;
        let mut current_job = first_job;
        loop {
            let result = catch_unwind(AssertUnwindSafe(current_job));
            let panic = result.err().map(|e| (e, current_job_index));
            self.on_task_finished(panic);
            let Some((index, job)) = self.pick_job_from_work_queue() else {
                return;
            };
            current_job_index = index;
            current_job = job;
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
                drop(work_queue);
                Some((index, job))
            }
            WorkQueueJob::End => {
                work_queue.push_front(WorkQueueJob::End);
                drop(work_queue);
                self.work_queue_condition_var.notify_all();
                None
            }
        }
    }

    fn end_and_help_complete(&self) {
        let job;
        {
            let mut work_queue = self.work_queue.lock();
            job = work_queue.pop_front();
            work_queue.push_back(WorkQueueJob::End);
        }
        self.work_queue_condition_var.notify_all();
        if let Some(WorkQueueJob::Job(index, job)) = job {
            self.worker(index, job);
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
    handle: Handle,
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    span: Span,
    /// Invariance over 'env, to make sure 'env cannot shrink,
    /// which is necessary for soundness.
    ///
    /// see https://doc.rust-lang.org/src/std/thread/scoped.rs.html#12-29
    env: PhantomData<&'env mut &'env ()>,
}

impl<'scope, 'env: 'scope, R: Send + 'env> Scope<'scope, 'env, R> {
    /// Creates a new scope.
    ///
    /// # Safety
    ///
    /// The caller must ensure `Scope` is dropped and not forgotten.
    unsafe fn new(results: &'scope [Mutex<Option<R>>]) -> Self {
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
            handle: Handle::current(),
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

        let f: Box<dyn FnOnce() + Send + 'scope> = Box::new(|| {
            let result = f();
            *result_cell.lock() = Some(result);
        });
        let f: *mut (dyn FnOnce() + Send + 'scope) = Box::into_raw(f);
        // SAFETY: Scope ensures (e. g. in Drop) that spawned tasks is awaited before the
        // lifetime `'env` ends.
        #[allow(
            clippy::unnecessary_cast,
            reason = "Clippy thinks this is unnecessary, but it actually changes the lifetime"
        )]
        let f = f as *mut (dyn FnOnce() + Send + 'static);
        // SAFETY: We just called `Box::into_raw`.
        let f = unsafe { Box::from_raw(f) };

        let turbo_tasks = self.turbo_tasks.clone();
        let span = self.span.clone();

        self.inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);

        // The first job always goes to the work_queue to be worked on by the main thread.
        // After that we spawn a new worker for every job until we reach WORKER_TASKS.
        // After that we queue up jobs in the work_queue again.
        if (1..=*WORKER_TASKS).contains(&index) {
            let inner = self.inner.clone();
            // Spawn a worker task that will process that tasks and potentially more.
            self.handle.spawn(async move {
                let _span = span.entered();
                if let Some(turbo_tasks) = turbo_tasks {
                    // Ensure that the turbo tasks context is maintained across the worker.
                    turbo_tasks_scope(turbo_tasks, || {
                        inner.worker(index, f);
                    });
                } else {
                    // If no turbo tasks context is available, just run the worker.
                    inner.worker(index, f);
                }
            });
        } else {
            // Queue the task to be processed by a worker task.
            self.inner
                .work_queue
                .lock()
                .push_back(WorkQueueJob::Job(index, f));
            self.inner.work_queue_condition_var.notify_one();
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
