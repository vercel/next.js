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

/// A job placed on the work queue: its result-slot index and the closure to run.
type WorkQueueJob = (usize, Box<dyn FnOnce() + Send + 'static>);

struct WorkQueue {
    /// Jobs that have not yet been picked up by a drainer.
    jobs: VecDeque<WorkQueueJob>,
    /// Set once no more jobs will be enqueued. A drainer that finds the queue empty exits when
    /// this is set, or parks otherwise. Guarded by the same lock as `jobs`, so the "empty + not
    /// closed → park" and "close + notify" sequences are serialized and cannot lose a wakeup.
    closed: bool,
}

struct ScopeInner {
    main_thread: Thread,
    remaining_tasks: AtomicUsize,
    /// The first panic that occurred in the tasks, by task index.
    /// The usize value is the index of the task.
    panic: Mutex<Option<(Box<dyn Any + Send + 'static>, usize)>>,
    /// The work queue for spawned jobs that have not yet been picked up by a worker task.
    work_queue: Mutex<WorkQueue>,
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

    /// Pulls jobs from the shared work queue and runs them until the queue is closed and drained,
    /// recording any panic. Both the opportunistic helper worker tasks and the calling thread (via
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

    fn pick_job_from_work_queue(&self) -> Option<WorkQueueJob> {
        let mut work_queue = self.work_queue.lock();
        loop {
            if let Some(job) = work_queue.jobs.pop_front() {
                // If work remains, wake another helper. `parking_lot` notifications are not
                // latched, so a `notify_one` at enqueue time is lost if no helper was parked yet
                // (e.g. it was busy running a previous job). Handing off the surplus wakeup here
                // ensures idle helpers still get pulled in, preserving parallelism.
                if !work_queue.jobs.is_empty() {
                    self.work_queue_condition_var.notify_one();
                }
                return Some(job);
            } else if work_queue.closed {
                // No more jobs will ever be enqueued: this drainer is done.
                return None;
            } else {
                // Empty but not closed: wait for a job to arrive or for the queue to be closed.
                self.work_queue_condition_var.wait(&mut work_queue);
            }
        }
    }

    fn end_and_help_complete(&self) {
        // Close the queue and wake every parked drainer once; each will drain any remaining jobs
        // and then observe `closed` and exit. Closing under the queue lock (paired with `wait`
        // releasing it atomically) means a drainer cannot park after we close without seeing it.
        {
            let mut work_queue = self.work_queue.lock();
            work_queue.closed = true;
        }
        self.work_queue_condition_var.notify_all();
        // Drain whatever remains inline.
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
    /// Max number of opportunistic helper worker tasks to spawn
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
        // The calling thread is itself a drainer, so we only need helpers to cover the remaining
        // work.
        let worker_tasks = handle
            .metrics()
            .num_workers()
            .min(results.len())
            .saturating_sub(1);
        Self {
            results,
            index: AtomicUsize::new(0),
            inner: Arc::new(ScopeInner {
                main_thread: thread::current(),
                remaining_tasks: AtomicUsize::new(0),
                panic: Mutex::new(None),
                work_queue: Mutex::new(WorkQueue {
                    // Presize to the job count so `push_back` never reallocates while holding the
                    // queue lock during the enqueue loop.
                    jobs: VecDeque::with_capacity(results.len()),
                    closed: false,
                }),
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

        self.inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);

        // Every job goes on the shared work queue, this way work is never assigned to a task that
        // might never run.  Because we block synchronously on the main thread it is possible that
        // our spawned tasks cannot find threads to run on this ensures all the work is available to
        // all threads including the main_thread.
        self.inner.work_queue.lock().jobs.push_back((index, f));
        // This isn't needed for liveness, but optimizes behavior when we have limited threads
        // available.
        self.inner.work_queue_condition_var.notify_one();

        // Spawn a tokio worker for each task (except the last spawn call which will be handled by
        // this thread). Helpers all run the identical `run_jobs` loop pulling from the shared
        // queue, so nothing here is job-specific; we only clone the span for the workers we
        // actually spawn.
        if index < self.worker_tasks {
            let inner = self.inner.clone();
            let span = self.span.clone();
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

// ---------------------------------------------------------------------------
// Self-feeding scope
// ---------------------------------------------------------------------------
//
// `scope_and_block` above processes a *fixed* set of jobs: every job is enqueued before draining
// begins, and termination is detected via an `End` sentinel that is pushed once, after the factory
// closure returns. The self-feeding variant below relaxes that: a running job may enqueue MORE work
// into the same scope, so the total job count is not known up front and the `End`-sentinel model
// does not apply. Termination is instead driven purely by the `remaining_tasks` counter reaching
// zero.
//
// Sharing analysis (what is reused vs. what needs its own implementation):
//   * REUSED IN SPIRIT: the `remaining_tasks` counter + `main_thread.unpark()` handshake, the
//     panic-recording `Mutex`, and the `wait()`/`block_in_place` parking loop. These are copied
//     into `FeedingInner` essentially verbatim from `ScopeInner`, because their behaviour is
//     identical. (They are copied rather than factored into a shared base struct only to avoid
//     churning `ScopeInner`/`Scope`, which are load-bearing for `scope_and_block`; a follow-up
//     could hoist a shared `Waiter { main_thread, remaining_tasks, panic }` if desired. Flagged for
//     the reviewer.)
//   * NEEDS ITS OWN IMPL: the work queue payload (`T` items, not boxed `FnOnce`s), the
//     pick/run/wait loop, and the termination condition. The fixed-set `End` sentinel cannot be
//     used because more items may arrive after any given drain observes an empty queue.
//   * REUSED DIRECTLY: `worker_tasks` sizing logic, `turbo_tasks_scope` wrapping, the
//     `'scope`->`'static` transmute pattern, and the "main thread drains everything itself"
//     liveness property.

/// Shared, NON-generic state for a [`scope_self_feeding`] run: the counter, panic slot, and the
/// work queue of erased per-item jobs.
///
/// The work queue stores one boxed closure per item — exactly like [`ScopeInner`] — rather than raw
/// `T` values. This is a deliberate choice: it reuses `Scope::spawn`'s *proven* `'scope`->`'static`
/// transmute (erasing a boxed closure, not a `T`), so `FeedingInner` needs no `T` generic and we
/// never touch `dyn Any` / `T: 'static`. Each job closure captures its `T` and an `Arc` to the
/// generic [`Feeding`] context (which owns the shared `run`), and when invoked it reconstructs a
/// [`Spawner`] so `run` can enqueue children.
struct FeedingInner {
    main_thread: Thread,
    /// Number of items that have been enqueued but not yet finished processing. An item is counted
    /// from the moment it is pushed onto `work_queue` until its job closure returns (or panics).
    /// The scope is complete exactly when this reaches zero. See `Spawner::spawn` /
    /// `on_item_finished` for the ordering that makes zero a reliable "all done" signal.
    remaining_tasks: AtomicUsize,
    /// The first panic that occurred while processing an item. Unlike the fixed-set scope there is
    /// no meaningful per-item index to order panics by, so we keep the *first* panic to be
    /// recorded (ties broken by lock order).
    panic: Mutex<Option<Box<dyn Any + Send + 'static>>>,
    /// Queue of jobs awaiting processing. Each is a self-contained closure erased to `'static`
    /// (see `Spawner::spawn`).
    work_queue: Mutex<VecDeque<Box<dyn FnOnce() + Send + 'static>>>,
    /// Notifies parked workers of newly-enqueued work, and of termination (via `notify_all` once
    /// `remaining_tasks` hits zero).
    work_queue_condition_var: Condvar,
    /// Set once `remaining_tasks` reaches zero, so workers parked on the condvar with an empty
    /// queue can distinguish "more work coming" from "we are done". Checked under the queue lock.
    done: std::sync::atomic::AtomicBool,
}

impl FeedingInner {
    /// Records that a new item has been enqueued. MUST be called (incrementing `remaining_tasks`)
    /// *before* the item is pushed onto the queue, and — crucially — a job that spawns children
    /// must call this for each child BEFORE it finishes (before its own `on_item_finished`). See
    /// the ordering argument on `Spawner::spawn`.
    #[inline]
    fn account_new_item(&self) {
        self.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    }

    /// Latches `done` and wakes everyone. Called when the counter is (or has just become) zero.
    ///
    /// `done` is set and the notifications issued while holding the queue lock, so it is impossible
    /// for a worker to observe an empty queue, decide to wait, and only then miss the
    /// `done`/`notify_all` — a classic lost-wakeup. Holding the lock serializes against
    /// `pick_item`'s empty-queue-check-then-wait sequence. Idempotent: safe to call more than once
    /// and from more than one thread (e.g. a finishing worker and the post-fill idle check racing).
    fn latch_done_and_wake(&self) {
        let _guard = self.work_queue.lock();
        self.done.store(true, Ordering::Release);
        // Wake all parked workers (blocked on the condvar with an empty queue) and the main thread
        // (parked in `wait()`).
        self.work_queue_condition_var.notify_all();
        self.main_thread.unpark();
    }

    /// Records that one item finished processing. Mirrors `ScopeInner::on_task_finished`: records
    /// the first panic, and when the counter transitions to zero, latches `done` and wakes the main
    /// thread and every parked worker so they can observe termination.
    fn on_item_finished(&self, panic: Option<Box<dyn Any + Send + 'static>>) {
        if let Some(err) = panic {
            let mut slot = self.panic.lock();
            if slot.is_none() {
                *slot = Some(err);
            }
        }
        // `Release` pairs with the `Acquire` loads in `wait()` and `pick_item`, so that once a
        // thread observes zero / `done` it also observes every prior queue and panic write.
        if self.remaining_tasks.fetch_sub(1, Ordering::Release) == 1 {
            // This decrement brought the count to zero: the scope is done.
            self.latch_done_and_wake();
        }
    }

    /// Called by the calling thread once the initial fill is complete. If no work is (or is still)
    /// in flight — the empty-initial case, or the case where helpers already drained everything —
    /// then `on_item_finished` may never fire (or already fired), so nothing would ever latch
    /// `done` and the drain loops would block forever. Latch it here.
    ///
    /// Racing with a worker's own `latch_done_and_wake` is fine: both run under the queue lock and
    /// setting `done`/notifying twice is harmless. The `Acquire` load pairs with the finishing
    /// worker's `Release` decrement.
    fn finalize_if_idle(&self) {
        if self.remaining_tasks.load(Ordering::Acquire) == 0 {
            self.latch_done_and_wake();
        }
    }

    /// Worker/main-thread drain loop. Pulls jobs and runs them until the scope terminates
    /// (`remaining_tasks == 0`, surfaced via `done`). Both helpers and the calling thread run this;
    /// helpers are a pure optimization, exactly as in the fixed-set scope.
    fn run_items(&self) {
        while let Some(job) = self.pick_item() {
            let result = catch_unwind(AssertUnwindSafe(job));
            self.on_item_finished(result.err());
        }
    }

    /// Blocks until either a job is available (returned as `Some`) or the scope is done (`None`).
    /// Unlike the fixed-set `pick_job_from_work_queue`, an empty queue does NOT mean "done": more
    /// items may still be produced by in-flight jobs, so we wait on the condvar and re-check,
    /// terminating only when `done` is latched.
    fn pick_item(&self) -> Option<Box<dyn FnOnce() + Send + 'static>> {
        let mut work_queue = self.work_queue.lock();
        loop {
            if let Some(job) = work_queue.pop_front() {
                // If work remains, hand off a wakeup to pull in another idle worker. Same rationale
                // as the fixed-set scope: `parking_lot` notifications are not latched, so a
                // `notify_one` at enqueue time can be lost if no worker was parked yet.
                if !work_queue.is_empty() {
                    self.work_queue_condition_var.notify_one();
                }
                drop(work_queue);
                return Some(job);
            }
            // Queue is empty. If the scope is done, stop; otherwise wait for new work or the final
            // wakeup. `done` is read under the queue lock, so it cannot be set between our
            // emptiness check and going to sleep (see `on_item_finished`).
            if self.done.load(Ordering::Acquire) {
                return None;
            }
            self.work_queue_condition_var.wait(&mut work_queue);
        }
    }

    /// Same parking strategy as `ScopeInner::wait`: spin-park briefly, then fall back to
    /// `block_in_place` so tokio can reuse this core. Only reached by the main thread, and only
    /// after it has itself drained everything it could (`run_items` returned), so `block_in_place`
    /// is a last resort exactly as in the fixed-set scope.
    fn wait(&self) {
        if self.remaining_tasks.load(Ordering::Acquire) == 0 {
            return;
        }

        let _span = info_span!("blocking").entered();

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

        block_in_place(|| {
            while self.remaining_tasks.load(Ordering::Acquire) != 0 {
                thread::park();
            }
        });
    }
}

/// Handle passed to the `run` closure of [`scope_self_feeding`], used to enqueue additional items
/// into the same scope.
///
/// `'scope` ties the borrowed enqueue callback to a single `run` invocation; `'env` is the
/// caller-visible lifetime of the borrowed data captured by `run` and the items.
///
/// The concrete `run` closure type is hidden behind a single type-erased "enqueue one item"
/// callback (`dyn Fn(T) + 'env`), so callers only ever name `Spawner<'_, 'env, T>`. Crucially this
/// callback is `'env`-typed (not `'static`), which is what lets the internal `Spawner`s built by
/// worker threads type-check against the user's `run: Fn(&Spawner<'_, 'env, T>, T)` without any
/// lifetime transmute of the `Spawner` itself.
pub struct Spawner<'scope, 'env: 'scope, T: Send + 'env> {
    /// Called by `spawn`. Performs the increment-before-push accounting and enqueues a job. Erased
    /// so `F` does not appear here.
    ///
    /// No `Send`/`Sync` bound: a `Spawner` is constructed and used entirely within a single `run`
    /// invocation on one worker thread; it is never itself sent or shared across threads. (The
    /// *items* it enqueues are `T: Send`, which is what actually needs to cross threads, and that
    /// bound lives on the queue path.)
    enqueue: &'scope (dyn Fn(T) + 'env),
    /// Invariance over `'env` mirrors `Scope::env`: it keeps `'env` from shrinking, which the
    /// `'env`->`'static` job-closure transmute in `scope_self_feeding` relies on for soundness.
    _marker: PhantomData<&'env mut &'env ()>,
}

impl<'scope, 'env: 'scope, T: Send + 'env> Spawner<'scope, 'env, T> {
    /// Enqueue another item to be processed by `run`. Callable any number of times (including zero)
    /// from inside `run`, from any worker thread.
    pub fn spawn(&self, item: T) {
        (self.enqueue)(item);
    }
}

/// Like [`scope_and_block`], but *self-feeding*: the `run` closure receives a [`Spawner`] and may
/// enqueue additional items while the scope is draining. The scope completes only when every item —
/// the `initial` ones plus everything transitively spawned — has been processed. No per-item
/// results are collected; jobs communicate through shared state captured in `run`.
///
/// `run` is `Fn + Sync` and is shared (by reference) across the calling thread and up to
/// `runtime worker threads - 1` opportunistic helper worker tasks; it may therefore run
/// concurrently on multiple threads and is called exactly once per item.
///
/// Liveness matches `scope_and_block`: the calling thread participates in draining and will drain
/// the entire (growing) queue by itself if no helper is ever scheduled, so this does not deadlock
/// on a thread-limited or otherwise-contended runtime. The `block_in_place` fallback in `wait()` is
/// reached only after the calling thread can make no further progress on its own.
///
/// As with `scope_and_block`, prefer calling this from within `spawn_blocking` if other work is
/// running concurrently in the same task, since `block_in_place` will suspend it.
///
/// The first panic raised by any `run` invocation is propagated to the caller after all in-flight
/// work has been joined.
pub fn scope_self_feeding<'env, T, F>(initial: impl IntoIterator<Item = T>, run: F)
where
    T: Send + 'env,
    F: Fn(&Spawner<'_, 'env, T>, T) + Send + Sync + 'env,
{
    let handle = Handle::current();
    // Same sizing as `Scope::new`: one helper per runtime worker thread beyond the main thread.
    // `num_workers()` returns 1 on a current-thread runtime => 0 helpers => everything drains
    // inline on the calling thread. Liveness never depends on this value.
    let worker_tasks = handle.metrics().num_workers().saturating_sub(1);
    let turbo_tasks = try_turbo_tasks();
    let span = Span::current();

    // Wrap `run` so each invocation re-establishes the turbo tasks context, exactly like
    // `Scope::spawn`. A single shared `Fn` (not one per item). It closes over `run: F` (lifetime
    // `'env`) and `turbo_tasks` (`'static`), so `WrappedRun: 'env`.
    let wrapped_run = move |spawner: &Spawner<'_, 'env, T>, item: T| {
        if let Some(turbo_tasks) = turbo_tasks.clone() {
            turbo_tasks_scope(turbo_tasks, || run(spawner, item));
        } else {
            run(spawner, item);
        }
    };

    // Non-generic shared state, `Arc`-owned so helper tasks (which only ever touch the queue and
    // counter, never `run`) can hold a clone. `FeedingInner` is fully `'static` (no `'env`
    // borrows), so `Arc<FeedingInner>` is `'static`.
    let inner = Arc::new(FeedingInner {
        main_thread: thread::current(),
        remaining_tasks: AtomicUsize::new(0),
        panic: Mutex::new(None),
        work_queue: Mutex::new(VecDeque::new()),
        work_queue_condition_var: Condvar::new(),
        done: std::sync::atomic::AtomicBool::new(false),
    });

    // Shared context handed to every per-item job closure: `Arc` clones of the counter/queue state
    // and of the wrapped `run`. No raw pointers and no `unsafe impl Send` — both are ordinary
    // `Arc`s and `Arc<T>: Send + Sync` when `T: Send + Sync`, which holds (`FeedingInner: Send
    // + Sync`; `WrappedRun: Fn + Send + Sync`).
    //
    // `run` is an `Arc<WrappedRun>` where `WrappedRun: 'env`, so `Ctx` itself is a `'env`-lifetime
    // type. It is captured into each job closure, and that job closure is erased `'env`->`'static`
    // by the single boxed-closure transmute below (the same one `Scope::spawn` uses). The helpers
    // never capture `run` — they only run the already-erased job closures — so `run` never has to
    // independently satisfy `'static` for `handle.spawn`.
    struct Ctx<T, WrappedRun> {
        inner: Arc<FeedingInner>,
        run: Arc<WrappedRun>,
        _marker: PhantomData<fn(T)>,
    }
    impl<T, WrappedRun> Clone for Ctx<T, WrappedRun> {
        fn clone(&self) -> Self {
            Ctx {
                inner: self.inner.clone(),
                run: self.run.clone(),
                _marker: PhantomData,
            }
        }
    }

    let ctx = Ctx::<T, _> {
        inner: inner.clone(),
        run: Arc::new(wrapped_run),
        _marker: PhantomData,
    };

    // Build a self-contained job closure for `item`. When run it constructs a fresh `'env`-typed
    // enqueue callback, wraps it in a `Spawner`, and invokes the shared `run`. The returned box has
    // lifetime `'env` (it owns an `'env` `Ctx`); `enqueue_item` erases it to `'static` for storage.
    //
    // This is the direct analogue of `Scope::spawn`'s per-item boxed closure + `'scope`->`'static`
    // transmute — the proven pattern — the only addition being the enqueue callback that lets `run`
    // feed more work.
    fn make_job<'env, T, WrappedRun>(
        ctx: Ctx<T, WrappedRun>,
        item: T,
    ) -> Box<dyn FnOnce() + Send + 'env>
    where
        T: Send + 'env,
        WrappedRun: Fn(&Spawner<'_, 'env, T>, T) + Send + Sync + 'env,
    {
        Box::new(move || {
            // The enqueue callback handed to `run` via the `Spawner`. It owns a clone of `ctx`
            // (`'env`-lifetime), which is exactly what makes the `Spawner<'_, 'env, T>` below match
            // `run`'s signature without any transmute of the `Spawner` itself.
            let enqueue = {
                let ctx = ctx.clone();
                move |child: T| {
                    enqueue_item::<'env, T, WrappedRun>(ctx.clone(), child);
                }
            };
            let spawner = Spawner::<'_, 'env, T> {
                enqueue: &enqueue,
                _marker: PhantomData,
            };
            (ctx.run)(&spawner, item);
        })
    }

    // Account + enqueue one item. Shared by the initial fill and `Spawner::spawn` (through the
    // callback in `make_job`). See `Spawner`/the ordering comment for why the increment must happen
    // before the push and before the parent finishes.
    fn enqueue_item<'env, T, WrappedRun>(ctx: Ctx<T, WrappedRun>, item: T)
    where
        T: Send + 'env,
        WrappedRun: Fn(&Spawner<'_, 'env, T>, T) + Send + Sync + 'env,
    {
        // TERMINATION ORDERING (the crux of correctness):
        //
        // A job that spawns children must make those children "count" before it itself finishes.
        // `account_new_item` (the `remaining_tasks += 1` for the child) runs here, synchronously
        // inside the parent's `run` invocation, i.e. strictly BEFORE the parent's `run` returns and
        // therefore strictly before the parent's `on_item_finished` (`remaining_tasks -= 1`).
        //
        // Therefore the counter can never transiently reach zero while more work is pending:
        //   - While the parent is in flight it is itself counted (+1).
        //   - Each child is added (+1) before the parent is removed (-1).
        // So at every moment `remaining_tasks >= (unfinished items)`, and it hits zero only once
        // every enqueued item — initial and transitively spawned — has finished.
        //
        // We must increment BEFORE pushing: if we pushed first, a worker could pop and finish the
        // child (decrementing a count that was never incremented) before we increment, corrupting
        // the counter. Increment-then-push keeps the counter an upper bound on live work.
        ctx.inner.account_new_item();

        // Clone the `inner` Arc out before we move `ctx` into the job, so we can push/notify after.
        let inner = ctx.inner.clone();
        let job = make_job::<'env, T, WrappedRun>(ctx, item);
        let job: *mut (dyn FnOnce() + Send + 'env) = Box::into_raw(job);
        // SAFETY: erase the job's `'env`-derived captures to `'static` for storage. This is the ONE
        // unsafe operation in the primitive, and it is exactly `Scope::spawn`'s transmute: the job
        // — and everything it owns (the `'env` `Ctx`, i.e. an `Arc<WrappedRun>` that
        // transitively borrows `'env` data through `run`, plus its own `item: T: 'env`) —
        // is dropped before this function returns and thus before `'env` ends (guaranteed
        // by the `Joiner` join). `'env` is invariant via `Spawner::_marker`, so it cannot
        // shrink out from under us.
        let job = unsafe {
            std::mem::transmute::<
                *mut (dyn FnOnce() + Send + 'env),
                *mut (dyn FnOnce() + Send + 'static),
            >(job)
        };
        // SAFETY: we just called `Box::into_raw`.
        let job = unsafe { Box::from_raw(job) };

        inner.work_queue.lock().push_back(job);
        // Wake one parked worker. A lost wakeup (no worker parked yet) is recovered by the hand-off
        // in `pick_item` and by the main thread's own draining — liveness never depends on it.
        inner.work_queue_condition_var.notify_one();
    }

    // Drop guard that UNCONDITIONALLY drains-and-joins, mirroring `Scope::drop`. This is the load-
    // bearing soundness mechanism for the `'env`->`'static` job transmute: whether the fill loop
    // below completes normally or panics (`initial`'s iterator can panic, and a job's `run` can
    // panic — the latter caught inside `run_items`), this guard runs before any panic escapes and
    // guarantees every erased job closure has FINISHED EXECUTING and been dropped. Because a job
    // closure owns the only things that borrow `'env` (its `Arc<WrappedRun>` clone and its
    // `item: T`), joining before return means all `'env`-borrowing values are dropped before `'env`
    // ends. It also makes the calling thread drain the whole queue itself, so liveness never
    // depends on a helper being scheduled — even on the panic path.
    //
    // It holds an `Arc<FeedingInner>` clone (so `run_items()`/`wait()` stay valid) and the helper
    // `JoinHandle`s (kept alive until the join completes so tasks are not detached mid-run). Note
    // the anchoring of `WrappedRun`'s lifetime is via `Arc` refcounts, not stack drop-order: the
    // wrapped `run` lives exactly as long as some `Arc<WrappedRun>` clone (in a job or in `ctx`),
    // all of which are gone once the join below finishes.
    struct Joiner {
        inner: Arc<FeedingInner>,
        helper_handles: Vec<tokio::task::JoinHandle<()>>,
    }
    impl Drop for Joiner {
        fn drop(&mut self) {
            // The initial fill is complete (normally or via panic-unwind). If nothing is in flight
            // — empty initial set, or helpers already drained everything — latch `done` now so the
            // drain loops below do not block forever waiting for an `on_item_finished` that will
            // never come.
            self.inner.finalize_if_idle();
            // The calling thread participates in draining, exactly like
            // `ScopeInner::end_and_help_complete`: it runs the drain loop itself. Because
            // `pick_item` blocks for new work until `done`, the calling thread processes the entire
            // (growing) queue on its own if no helper is ever scheduled.
            self.inner.run_items();
            // `run_items` returned => this thread observed `done` (queue empty and count 0). A
            // helper could in principle still be finishing the last job; `wait()` joins on the
            // counter. In practice `done` implies count already hit 0, so this returns immediately
            // and never needs `block_in_place` — but it is kept as the same safety net as `Scope`.
            self.inner.wait();
            // Helpers have all observed termination (their `pick_item` returns `None` once `done`).
            // Dropping the handles now only detaches already-finished tasks.
            self.helper_handles.clear();
        }
    }

    // Spawn opportunistic helpers up front (before filling), so they can start pulling as soon as
    // items appear. Each holds only a clone of `Arc<FeedingInner>` and drains the shared queue by
    // running the self-contained job closures. Helpers are a pure optimization — see `Joiner`.
    let mut helper_handles = Vec::with_capacity(worker_tasks);
    for _ in 0..worker_tasks {
        let inner = inner.clone();
        let span = span.clone();
        helper_handles.push(handle.spawn(async move {
            let _span = span.entered();
            inner.run_items();
        }));
    }
    let joiner = Joiner {
        inner: inner.clone(),
        helper_handles,
    };

    // Fill the queue with the initial items via the same accounting/enqueue path as
    // `Spawner::spawn`. A panic here (from `initial`'s iterator) unwinds into `joiner`'s Drop,
    // which joins before the panic propagates — so the already-enqueued jobs are safely drained
    // first.
    for item in initial {
        enqueue_item::<'env, T, _>(ctx.clone(), item);
    }
    // `ctx` is not needed for driving any longer; the enqueued jobs each own their own clone. Drop
    // our copy so the `Arc<WrappedRun>` refcount is not held past the drain by this frame.
    drop(ctx);

    // Normal completion: trigger `joiner`'s Drop now (finalize-if-idle + drain-and-join), so the
    // whole queue is processed and every worker joined before we check for a panic below. (On the
    // fill-panic path this same Drop runs during unwind, before the panic propagates.)
    drop(joiner);

    // Propagate the first panic recorded by any `run` invocation. (A fill-loop / `initial` panic
    // has already resumed via the unwind through `joiner`'s Drop, so we only get here on the normal
    // path; the only thing left to surface is a job panic.)
    if let Some(err) = inner.panic.lock().take() {
        panic::resume_unwind(err);
    }
    // No manual lifetime anchoring needed: `WrappedRun` lives as long as some `Arc<WrappedRun>`
    // clone exists (in `ctx` or a job closure), and the join guarantees every job — and thus its
    // Arc clone — is dropped before this function returns (before `'env` ends). `inner` drops
    // normally at end of scope.
}

#[cfg(test)]
mod tests {
    use std::{
        panic::{AssertUnwindSafe, catch_unwind},
        sync::atomic::AtomicUsize,
    };

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

    // -----------------------------------------------------------------------
    // scope_self_feeding tests
    // -----------------------------------------------------------------------

    /// On a `current_thread` runtime there are no helper worker threads (`num_workers()` == 1 =>
    /// `worker_tasks` == 0) and `block_in_place` is disallowed. The calling thread must drain the
    /// entire queue — including everything spawned mid-run — inline, reaching termination before
    /// `wait()` would ever call `block_in_place`. This proves the "drains inline with zero helpers"
    /// property for the self-feeding variant.
    #[tokio::test(flavor = "current_thread")]
    async fn test_self_feeding_current_thread_runtime() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_self_feeding(0..16usize, move |spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                // Each of the first few items spawns one extra child, so work is fed in mid-drain.
                if item < 4 {
                    spawner.spawn(100 + item);
                }
            });
        })
        .await
        .unwrap();
        // 16 initial + 4 spawned children.
        assert_eq!(processed.load(Ordering::SeqCst), 20);
    }

    /// On a multi-thread runtime, work spawned from inside `run` must be picked up and processed —
    /// including by helper worker tasks. We seed a single item that fans out to a fixed number of
    /// children and assert every item runs exactly once.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_self_feeding_multi_thread() {
        const CHILDREN: usize = 1000;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_self_feeding(std::iter::once(0usize), move |spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                if item == 0 {
                    // The root fans out to CHILDREN leaves.
                    for i in 0..CHILDREN {
                        spawner.spawn(1 + i);
                    }
                }
            });
        })
        .await
        .unwrap();
        // 1 root + CHILDREN leaves.
        assert_eq!(processed.load(Ordering::SeqCst), 1 + CHILDREN);
    }

    /// Jobs spawn a *tree* of children (each node up to a depth/branching bound). Every node must
    /// be processed exactly once. We track visited node ids to assert both completeness (all
    /// expected nodes seen) and exactly-once (no duplicates).
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_self_feeding_tree() {
        // Binary tree of depth 10 => 2^11 - 1 = 2047 nodes, ids 1..=2047 (heap numbering).
        const DEPTH: u32 = 10;
        const MAX_ID: usize = (1 << (DEPTH + 1)) - 1;

        // One flag per possible node id; set on visit. Detects both "missing" and "double" visits.
        let visited: Arc<Vec<std::sync::atomic::AtomicBool>> = Arc::new(
            (0..=MAX_ID)
                .map(|_| std::sync::atomic::AtomicBool::new(false))
                .collect(),
        );
        let count = Arc::new(AtomicUsize::new(0));

        let visited_clone = visited.clone();
        let count_clone = count.clone();
        tokio::task::spawn_blocking(move || {
            scope_self_feeding(std::iter::once(1usize), move |spawner, id| {
                // Mark visited; must not have been visited before.
                let was = visited_clone[id].swap(true, Ordering::SeqCst);
                assert!(!was, "node {id} visited more than once");
                count_clone.fetch_add(1, Ordering::SeqCst);
                // Spawn children (heap numbering) while they fit in the tree.
                let left = id * 2;
                let right = id * 2 + 1;
                if left <= MAX_ID {
                    spawner.spawn(left);
                }
                if right <= MAX_ID {
                    spawner.spawn(right);
                }
            });
        })
        .await
        .unwrap();

        // Completeness: every id 1..=MAX_ID visited exactly once.
        assert_eq!(count.load(Ordering::SeqCst), MAX_ID);
        for id in 1..=MAX_ID {
            assert!(
                visited[id].load(Ordering::SeqCst),
                "node {id} never visited"
            );
        }
    }

    /// Empty initial set with no spawns must return immediately (never blocks).
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_self_feeding_empty() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        scope_self_feeding(std::iter::empty::<usize>(), move |_spawner, _item| {
            processed_clone.fetch_add(1, Ordering::SeqCst);
        });
        assert_eq!(processed.load(Ordering::SeqCst), 0);
    }

    /// A panic in a `run` invocation is propagated after all in-flight work is joined.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_self_feeding_panic() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            scope_self_feeding(0..100usize, |spawner, item| {
                if item == 50 {
                    panic!("Intentional panic");
                }
                if item < 4 {
                    spawner.spawn(1000 + item);
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
