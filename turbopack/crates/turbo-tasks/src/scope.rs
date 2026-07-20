//! A scoped tokio spawn implementation that allow a non-'static lifetime for tasks.

use std::{
    any::Any,
    collections::VecDeque,
    marker::PhantomData,
    num::NonZeroUsize,
    ops::ControlFlow,
    panic::{self, AssertUnwindSafe, catch_unwind},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpmc::{self, Receiver, Sender},
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

struct ScopeInner {
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
    handle: Handle,
    /// Max number of threads to use, threads are only spawned when needed. The calling thread
    /// counts towards this budget, so we spawn at most `worker_tasks - 1` helpers.
    worker_tasks: NonZeroUsize,
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
        // Never use more threads than there are jobs, or than the runtime has workers.
        let worker_tasks = NonZeroUsize::new(handle.metrics().num_workers().min(results.len()))
            .unwrap_or(NonZeroUsize::MIN);
        let (sender, receiver) = mpmc::channel();
        Self {
            results,
            index: AtomicUsize::new(0),
            inner: Arc::new(ScopeInner {
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

        // Add to the shared work queue, all threads read from this. Neither failure is reachable,
        // but a job silently dropped here would leave `remaining_tasks` above zero and hang the
        // scope, so panic instead.
        self.work_queue
            .as_ref()
            .expect("sender is only taken in Drop")
            .send((index, f))
            .expect("receiver is owned by inner and outlives the scope");

        // Spawn a tokio worker for each job until we hit the max `worker_tasks`.
        if index < self.worker_tasks.get() - 1 {
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
// Unbounded scope
// ---------------------------------------------------------------------------
//
// Unlike `scope_and_block` (a fixed job set, terminated by an `End` sentinel), a running job here
// may enqueue more work, so the total is unknown up front. Termination is driven by the
// `remaining_tasks` counter reaching zero. The counter/parking/panic handling mirror `ScopeInner`.

/// A reference to the shared per-item closure for a [`scope_unbounded`] run. Borrowed (not boxed) —
/// the closure lives on `scope_unbounded`'s stack frame, which outlives every drainer. `'run` is
/// the lifetime of the borrows it captures (`'env` at the call site, erased to `'static` for
/// storage in [`UnboundedInner`]).
type RunFn<'run, T> = &'run (dyn Fn(&Spawner<'_, T>, T) -> ControlFlow<()> + Send + Sync + 'run);

/// Shared state for a [`scope_unbounded`] run. Holds raw `T` items (not boxed closures) — the only
/// `'env`-borrowing thing is the shared `run`, whose borrows are erased once here rather than once
/// per item. Requires `T: 'static`, which the queue payload must satisfy anyway.
struct UnboundedInner<T: Send + 'static> {
    main_thread: Thread,
    /// Items enqueued but not yet finished. The scope is done exactly when this reaches zero; see
    /// [`Spawner::spawn`] for the increment-before-finish ordering that makes zero reliable.
    remaining_tasks: AtomicUsize,
    /// First panic raised while processing an item; propagated to the caller after the join.
    panic: Mutex<Option<Box<dyn Any + Send + 'static>>>,
    /// Items awaiting processing.
    work_queue: Mutex<VecDeque<T>>,
    work_queue_condition_var: Condvar,
    /// Set once the count reaches zero, so a drainer with an empty queue can tell "more coming"
    /// from "done". Read/written under the queue lock so the check-then-park can't lose a wakeup.
    done: AtomicBool,
    /// Set by [`UnboundedInner::abort`] when a `run` returns [`ControlFlow::Break`]. Latches: once
    /// set, the queue has been cleared and [`Spawner::spawn`] drops further items, so the scope
    /// winds down as soon as the in-flight `run` calls return. Written under the queue lock (like
    /// `done`) so a concurrent `spawn` can't slip an item past the `clear()`.
    aborted: AtomicBool,
    /// Reference to the per-item closure (with turbo-tasks context re-established), shared by
    /// every drainer. It lives on `scope_unbounded`'s stack; its `'env` borrows are erased to
    /// `'static` here, and the `Joiner` guarantees every drainer finishes before `'env` ends
    /// (and before the closure's stack frame is popped). See `scope_unbounded` for the safety
    /// argument.
    run: RunFn<'static, T>,
}

impl<T: Send + 'static> UnboundedInner<T> {
    /// Counts a newly-enqueued item. MUST run before the push, and — for a child spawned inside
    /// `run` — before the parent finishes; see [`Spawner::spawn`].
    #[inline]
    fn account_new_item(&self) {
        self.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    }

    /// Latches `done` and wakes all drainers + the main thread. Set under the queue lock so a
    /// drainer can't observe an empty queue, decide to park, and miss the wakeup. Idempotent.
    fn close(&self) {
        let _guard = self.work_queue.lock();
        self.done.store(true, Ordering::Release);
        self.work_queue_condition_var.notify_all();
        self.main_thread.unpark();
    }

    /// Abandons all queued-but-unstarted work: latches `aborted`, drops the queue in one shot, and
    /// discharges the dropped items from `remaining_tasks`.
    ///
    /// Dropping the queue wholesale is the point — letting each abandoned item be popped, wrapped
    /// in `catch_unwind`, dispatched to `run` only to return immediately, and then accounted costs
    /// a queue-lock round trip per item across every drainer, and a still-running job's spawns keep
    /// re-growing the queue while we are trying to wind down. One `clear()` plus one batched
    /// `fetch_sub` replaces all of that.
    ///
    /// Items already being processed on other threads are **not** interrupted; they run to
    /// completion. Only unstarted work is discarded.
    ///
    /// Both the flag store and the `clear()` happen under the queue lock, so a `spawn` racing this
    /// either lands before the clear (and is counted in `dropped`) or observes `aborted` and drops
    /// its item — nothing can be enqueued and then leaked from the count. Idempotent: a second
    /// abort finds an empty queue and subtracts nothing.
    fn abort(&self) {
        let dropped = {
            let mut work_queue = self.work_queue.lock();
            // Store under the lock so `spawn`'s check-then-enqueue can't interleave with the clear.
            self.aborted.store(true, Ordering::Release);
            let dropped = work_queue.len();
            work_queue.clear();
            dropped
        };
        if dropped == 0 {
            return;
        }
        // Discharge the abandoned items. `on_item_finished` does this one at a time and closes on
        // the 1 -> 0 edge; the same edge can happen here when the queue held the last outstanding
        // work (the aborting job itself is still counted until its own `on_item_finished` runs, so
        // usually it does not — but it can when several drainers abort concurrently).
        if self.remaining_tasks.fetch_sub(dropped, Ordering::Release) == dropped {
            self.close();
        }
    }

    /// Records that one item finished. `Release` pairs with the `Acquire` loads in `wait`/`pick` so
    /// observing zero also observes every prior queue/panic write.
    fn on_item_finished(&self, panic: Option<Box<dyn Any + Send + 'static>>) {
        if let Some(err) = panic {
            let mut slot = self.panic.lock();
            if slot.is_none() {
                *slot = Some(err);
            }
        }
        if self.remaining_tasks.fetch_sub(1, Ordering::Release) == 1 {
            self.close();
        }
    }

    /// Latches `done` if nothing is in flight. Needed for the empty-initial / already-drained case,
    /// where `on_item_finished` never fires (or already fired) so nothing else would `close`.
    fn close_if_idle(&self) {
        if self.remaining_tasks.load(Ordering::Acquire) == 0 {
            self.close();
        }
    }

    /// Drain loop, run by both helpers and the calling thread until the scope terminates.
    fn drain(&self) {
        while let Some(item) = self.pick() {
            let spawner = Spawner { inner: self };
            let result = catch_unwind(AssertUnwindSafe(|| (self.run)(&spawner, item)));
            // `Break` abandons the rest of the queue. Do this *before* `on_item_finished` so the
            // batched decrement and this item's decrement can't both observe a non-zero count and
            // leave nobody to `close()`.
            let panic = match result {
                Ok(ControlFlow::Continue(())) => None,
                Ok(ControlFlow::Break(())) => {
                    self.abort();
                    None
                }
                Err(panic) => Some(panic),
            };
            self.on_item_finished(panic);
        }
    }

    /// Blocks until an item is available (`Some`) or the scope is done (`None`). An empty queue is
    /// not "done" — more items may still be spawned — so park and re-check until `done`.
    fn pick(&self) -> Option<T> {
        let mut work_queue = self.work_queue.lock();
        loop {
            if let Some(item) = work_queue.pop_front() {
                // Hand off a wakeup for another idle helper (parking_lot notifications aren't
                // latched, so an enqueue-time `notify_one` can be lost if no one was parked yet).
                if !work_queue.is_empty() {
                    self.work_queue_condition_var.notify_one();
                }
                drop(work_queue);
                return Some(item);
            }
            if self.done.load(Ordering::Acquire) {
                return None;
            }
            // TODO: a single long-running tail item can leave other drainers parked here (queue
            // empty, not yet done) while it runs alone, with no work to steal. Consider a
            // timeout/steal strategy if that becomes a problem in practice.
            self.work_queue_condition_var.wait(&mut work_queue);
        }
    }

    /// Spin-park briefly, then `block_in_place` so tokio can reuse this core. Reached by the main
    /// thread only after it has drained everything it could.
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

/// Handle passed to the `run` closure of [`scope_unbounded`], used to enqueue additional items into
/// the same scope. Only borrows the scope's shared state; the items it enqueues are `T: 'static`,
/// so it carries no `'env` lifetime of its own.
pub struct Spawner<'scope, T: Send + 'static> {
    inner: &'scope UnboundedInner<T>,
}

impl<T: Send + 'static> Spawner<'_, T> {
    /// Enqueue another item to be processed by `run`. Callable any number of times from inside
    /// `run`, on any drainer thread.
    ///
    /// **After any `run` has returned [`ControlFlow::Break`], this silently drops `item`.** The
    /// scope is winding down and the queue has already been cleared; re-filling it from jobs that
    /// are still finishing would defeat the abort. Callers that abort must therefore treat
    /// unspawned work as abandoned — for a work-list that can be recomputed (like GC's, where
    /// collectibility is re-derived from durable state each pass) that is exactly the desired
    /// behaviour.
    pub fn spawn(&self, item: T) {
        enqueue(self.inner, item);
    }
}

/// Account + enqueue one item. Increment BEFORE the push (and, for a child spawned inside `run`,
/// before the parent finishes — this runs synchronously inside the parent's `run`, before its
/// `on_item_finished`). So `remaining_tasks` is always >= live work and reaches zero only once
/// every item (initial + transitively spawned) is done. Pushing first would let a worker pop and
/// finish the child before the increment, corrupting the count.
fn enqueue<T: Send + 'static>(inner: &UnboundedInner<T>, item: T) {
    // Cheap pre-check: once aborted, nothing will ever drain this item, and re-growing the queue
    // would fight the wind-down. The authoritative check is the re-test under the queue lock below
    // (`abort` latches the flag while holding that lock), so this is purely to skip the accounting
    // in the common post-abort case.
    if inner.aborted.load(Ordering::Acquire) {
        return;
    }
    inner.account_new_item();
    {
        let mut work_queue = inner.work_queue.lock();
        // Re-check under the lock: `abort` sets the flag and clears the queue in the same critical
        // section, so an abort that landed between the check above and here would otherwise leave
        // this item queued (and counted) with nobody to drain it — hanging the scope. Back the
        // accounting out instead.
        if inner.aborted.load(Ordering::Relaxed) {
            drop(work_queue);
            inner.on_item_finished(None);
            return;
        }
        work_queue.push_back(item);
    }
    inner.work_queue_condition_var.notify_one();
}

/// Like [`scope_and_block`], but the `run` closure receives a [`Spawner`] and may enqueue more
/// items while the scope drains. Completes only once every item — `initial` plus everything
/// transitively spawned — has been processed. No results are collected; jobs communicate through
/// state captured in `run`.
///
/// `run` is shared across the calling thread and up to `runtime workers - 1` helper tasks and may
/// run concurrently. Liveness matches `scope_and_block`: the calling thread drains the whole
/// (growing) queue itself if no helper is scheduled, so it never deadlocks on a thread-limited
/// runtime. Prefer calling from `spawn_blocking` when other work shares the task. The first panic
/// from any `run` is propagated after the join.
///
/// Items must be `'static` (they sit in a queue drained by helper threads); the `run` closure may
/// borrow `'env` data.
///
/// # Aborting
///
/// Returning [`ControlFlow::Break`] from `run` abandons all queued-but-unstarted items: the queue
/// is dropped in one shot and [`Spawner::spawn`] becomes a no-op, so the scope returns as soon as
/// the currently-running jobs finish. Jobs already in flight on other threads are **not**
/// interrupted — they run to completion. Use this when the remaining work is discardable (it can be
/// recomputed on a later run) and finishing it is not worth the latency.
///
/// TODO: Currently this spawns all workers who process the queue until all work is complete.  This
/// means all workers are occupied for the whole call duration.  If this proves to be problematic we
/// can adjust this to allow workers to time out if there is not enough work, and to spawn more if
/// new work is produced.  This could be useful if work is bursty, a small number of items turn into
/// a large number that turns into a long tail that turns into another large number of tasks.
pub fn scope_unbounded<'env, T, F>(initial: impl IntoIterator<Item = T>, run: F)
where
    T: Send + 'static,
    F: Fn(&Spawner<'_, T>, T) -> ControlFlow<()> + Send + Sync + 'env,
{
    let handle = Handle::current();
    // One helper per runtime worker beyond the calling thread; 0 on a current-thread runtime.
    // Liveness never depends on this.
    let worker_tasks = handle.metrics().num_workers().saturating_sub(1);
    let turbo_tasks = try_turbo_tasks();
    let span = Span::current();

    // Re-establish the turbo-tasks context per item (like `Scope::spawn`); one shared `Fn`, `'env`.
    let wrapped_run = move |spawner: &Spawner<'_, T>, item: T| {
        if let Some(turbo_tasks) = turbo_tasks.clone() {
            turbo_tasks_scope(turbo_tasks, || run(spawner, item))
        } else {
            run(spawner, item)
        }
    };

    // The items are `'static`, so the ONLY thing borrowing `'env` is `run`. `wrapped_run` lives on
    // this stack frame, which outlives every drainer (the `Joiner` below joins them all before this
    // function returns, i.e. before the frame is popped), so we hand out a *borrowed* reference to
    // it — no allocation — and erase its `'env` borrows to `'static` for storage in `Inner` (and
    // the `Arc` clones the helper tasks hold). This is `Scope::spawn`'s `'env`->`'static`
    // transmute, applied once to a reference to the single shared `run`.
    let run: RunFn<'_, T> = &wrapped_run;
    // SAFETY: the `Joiner` below joins every drainer (via the `remaining_tasks` counter, which only
    // reaches zero after the last `run` call has returned) before this function returns — i.e.
    // before `'env` ends and before `wrapped_run`'s stack frame is popped. So no drainer can invoke
    // `run` after either the erased `'env` borrows or the referent `wrapped_run` become invalid.
    let run: RunFn<'static, T> =
        unsafe { std::mem::transmute::<RunFn<'_, T>, RunFn<'static, T>>(run) };

    let inner = Arc::new(UnboundedInner {
        main_thread: thread::current(),
        remaining_tasks: AtomicUsize::new(0),
        panic: Mutex::new(None),
        work_queue: Mutex::new(VecDeque::new()),
        work_queue_condition_var: Condvar::new(),
        done: AtomicBool::new(false),
        aborted: AtomicBool::new(false),
        run,
    });

    // Drop guard that unconditionally drains-and-joins before returning (or before a panic
    // escapes), mirroring `Scope::drop`. This is what makes the `'env`->`'static` erasure of
    // `run` sound: every drainer has finished (releasing `run`'s `'env` borrows) before `'env`
    // ends. It also makes the calling thread drain the whole queue itself, so liveness never
    // depends on a helper being scheduled — even on the panic path.
    struct Joiner<T: Send + 'static> {
        inner: Arc<UnboundedInner<T>>,
        helper_handles: Vec<tokio::task::JoinHandle<()>>,
    }
    impl<T: Send + 'static> Drop for Joiner<T> {
        fn drop(&mut self) {
            // Empty-initial / already-drained: nothing will `close`, so do it here.
            self.inner.close_if_idle();
            // The calling thread drains the whole (growing) queue itself.
            self.inner.drain();
            // A helper may still be finishing the last item; join on the counter.
            self.inner.wait();
            self.helper_handles.clear();
        }
    }

    // Spawn helpers up front so they can pull as soon as items appear. Each holds an
    // `Arc<UnboundedInner>` clone and drains the shared queue. Helpers are a pure optimization.
    let mut helper_handles = Vec::with_capacity(worker_tasks);
    for _ in 0..worker_tasks {
        let inner = inner.clone();
        let span = span.clone();
        helper_handles.push(handle.spawn(async move {
            let _span = span.entered();
            inner.drain();
        }));
    }
    let joiner = Joiner {
        inner: inner.clone(),
        helper_handles,
    };

    // Fill the initial items. A panic here (from `initial`'s iterator) unwinds into `joiner`'s
    // Drop, which drains and joins before the panic propagates.
    for item in initial {
        enqueue(&inner, item);
    }

    // Normal completion: run `joiner`'s Drop now (drain-and-join) before checking for a panic.
    drop(joiner);

    if let Some(err) = inner.panic.lock().take() {
        panic::resume_unwind(err);
    }
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
        assert!(
            elapsed < RELEASE_AFTER / 2,
            "scope_and_block took {elapsed:?}; it should not depend on an occupied worker thread \
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

    /// Helpers must actually add parallelism when threads are available: jobs that each block
    /// briefly should complete in far less than their serial sum.
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
        // Half the serial time is a loose bound on purpose: 4 threads should beat it comfortably,
        // so a slow machine won't make this flaky.
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
    // scope_unbounded tests
    // -----------------------------------------------------------------------

    /// On a `current_thread` runtime there are no helper worker threads (`num_workers()` == 1 =>
    /// `worker_tasks` == 0) and `block_in_place` is disallowed. The calling thread must drain the
    /// entire queue — including everything spawned mid-run — inline, reaching termination before
    /// `wait()` would ever call `block_in_place`. This proves the "drains inline with zero helpers"
    /// property for the unbounded variant.
    #[tokio::test(flavor = "current_thread")]
    async fn test_unbounded_current_thread_runtime() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..16usize, move |spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                // Each of the first few items spawns one extra child, so work is fed in mid-drain.
                if item < 4 {
                    spawner.spawn(100 + item);
                }
                ControlFlow::Continue(())
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
    async fn test_unbounded_multi_thread() {
        const CHILDREN: usize = 1000;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(std::iter::once(0usize), move |spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                if item == 0 {
                    // The root fans out to CHILDREN leaves.
                    for i in 0..CHILDREN {
                        spawner.spawn(1 + i);
                    }
                }
                ControlFlow::Continue(())
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
    async fn test_unbounded_tree() {
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
            scope_unbounded(std::iter::once(1usize), move |spawner, id| {
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
                ControlFlow::Continue(())
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
    async fn test_unbounded_empty() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        scope_unbounded(std::iter::empty::<usize>(), move |_spawner, _item| {
            processed_clone.fetch_add(1, Ordering::SeqCst);
            ControlFlow::Continue(())
        });
        assert_eq!(processed.load(Ordering::SeqCst), 0);
    }

    /// `ControlFlow::Break` abandons the queued-but-unstarted items. The scope must still
    /// terminate, and must run far fewer than the seeded items — the whole point is not paying
    /// a dispatch per abandoned item.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_abort_skips_queue() {
        const ITEMS: usize = 10_000;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..ITEMS, move |_spawner, _item| {
                let n = processed_clone.fetch_add(1, Ordering::SeqCst);
                // Abort partway in. Items already dispatched to other drainers still complete, so
                // the final count is "a bit more than 1", not exactly 1.
                if n == 0 {
                    return ControlFlow::Break(());
                }
                ControlFlow::Continue(())
            });
        })
        .await
        .unwrap();
        let count = processed.load(Ordering::SeqCst);
        assert!(count >= 1, "the aborting item itself must have run");
        assert!(
            count < ITEMS,
            "abort must abandon the queue, but all {ITEMS} items ran"
        );
    }

    /// The accounting test that matters: aborting in the middle of a deep, still-growing cascade
    /// must terminate rather than hang. `remaining_tasks` reaching zero is the sole termination
    /// condition, and `abort` discharges a whole batch of it at once while other drainers are
    /// concurrently spawning — the race this pins down. A hang here fails as a test timeout.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_abort_during_cascade() {
        // Each item spawns two children until the id exceeds the bound, so the queue is still
        // growing when the abort lands.
        const MAX_ID: usize = 1 << 14;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(std::iter::once(1usize), move |spawner, id| {
                let n = processed_clone.fetch_add(1, Ordering::SeqCst);
                if n == 100 {
                    return ControlFlow::Break(());
                }
                let (left, right) = (id * 2, id * 2 + 1);
                if left <= MAX_ID {
                    spawner.spawn(left);
                }
                if right <= MAX_ID {
                    spawner.spawn(right);
                }
                ControlFlow::Continue(())
            });
        })
        .await
        .unwrap();
        let count = processed.load(Ordering::SeqCst);
        assert!(
            count < MAX_ID,
            "abort must cut the cascade short, but {count} items ran"
        );
    }

    /// `spawn` issued *after* the abort has latched is dropped, not enqueued. This is the case a
    /// job finishing concurrently with another job's abort hits. If such a `spawn` still counted an
    /// item into `remaining_tasks` without queueing it, the scope would never reach zero and this
    /// would hang rather than fail.
    ///
    /// The first item aborts (a `Break` return latches it), and every *later* item — there is at
    /// most one in flight, but the seeds guarantee at least a second dispatch attempt — spawns into
    /// the aborted scope.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_spawn_after_abort_is_dropped() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..64usize, move |spawner, item| {
                let n = processed_clone.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    return ControlFlow::Break(());
                }
                // Post-abort spawns: these must be dropped rather than counted-but-unqueued.
                for i in 0..1000 {
                    spawner.spawn(10_000 + item * 1000 + i);
                }
                ControlFlow::Continue(())
            });
        })
        .await
        .unwrap();
        // Terminating at all is the assertion. Nothing spawned after the abort may run, so the
        // count stays bounded by the seeds rather than exploding by the 1000-per-item fan-out.
        let count = processed.load(Ordering::SeqCst);
        assert!(
            count <= 64,
            "post-abort spawns must be dropped, but {count} items ran"
        );
    }

    /// Abort on a `current_thread` runtime (no helpers — the calling thread is the only drainer).
    /// Mirrors `test_unbounded_current_thread_runtime` for the abort path.
    #[tokio::test(flavor = "current_thread")]
    async fn test_unbounded_abort_current_thread_runtime() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..1000usize, move |spawner, _item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                spawner.spawn(9999);
                ControlFlow::Break(())
            });
        })
        .await
        .unwrap();
        // With a single drainer the abort lands before any other item is picked up.
        assert_eq!(processed.load(Ordering::SeqCst), 1);
    }

    /// A panic that happens while the scope is aborting still propagates: the `panic` slot is
    /// independent of `aborted`, and the `Joiner` drains/joins before re-raising.
    ///
    /// The seed panics *and* the scope aborts (from a sibling item), so the abort's queue-clear
    /// races the panic's unwind through `catch_unwind` -> `on_item_finished`. The panic must still
    /// reach the caller rather than being swallowed by the wind-down.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_abort_then_panic() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            scope_unbounded(0..1000usize, |_spawner, item| {
                if item == 0 {
                    panic!("Intentional panic");
                }
                ControlFlow::Break(())
            });
            unreachable!();
        }));
        let err = result.expect_err("the panic must propagate even though the scope aborted");
        assert_eq!(err.downcast_ref::<&str>(), Some(&"Intentional panic"));
    }

    /// A panic in a `run` invocation is propagated after all in-flight work is joined.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_panic() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            scope_unbounded(0..100usize, |spawner, item| {
                if item == 50 {
                    panic!("Intentional panic");
                }
                if item < 4 {
                    spawner.spawn(1000 + item);
                }
                ControlFlow::Continue(())
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
