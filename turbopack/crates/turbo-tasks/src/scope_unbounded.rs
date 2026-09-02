//! Unbounded scoped parallelism: enables running jobs that can discover and enqueue more work

use std::{
    any::Any,
    ops::ControlFlow,
    panic::{self, AssertUnwindSafe, catch_unwind},
    sync::{
        Arc, OnceLock, SyncView,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpmc,
    },
    time::Duration,
};

use fixedbitset::FixedBitSet;
use parking_lot::{Condvar, Mutex, RwLock};
use tokio::{runtime::Handle, task::AbortHandle};
use tracing::{Span, info_span};

use crate::{TurboTasksApi, manager::try_turbo_tasks, turbo_tasks_scope};

/// How long a scope worker waits on an empty queue before exiting.
///
/// Optimizes respawning which triggers overhead managing WorkerSlots and the accumulator variables
/// pausing for a short time is worthwhile to avoid that.
const WORKER_IDLE_TIMEOUT: Duration = Duration::from_micros(100);

/// Runs `run` over `initial` and everything it transitively spawns, returning once every item has
/// been processed. No results are collected; jobs communicate through state captured in `run`. Use
/// [`scope_unbounded_with`] to accumulate a value instead.
//////
/// Items must be `'static` (they sit in a queue drained by other threads); the `run` closure may
/// borrow `'env` data.
///
/// # Aborting
///
/// Both [`ControlFlow::Break`] and a panic abandon all queued-but-unstarted items, so the scope
/// returns as soon as the currently-running jobs finish. Jobs already in flight on other threads
/// are **not** interrupted in either case.
pub fn scope_unbounded<'env, T, F>(initial: impl IntoIterator<Item = T>, run: F)
where
    T: Send + 'static,
    F: Fn(&Scope<'_, T, ()>, T) -> ControlFlow<()> + Send + Sync + 'env,
{
    scope_unbounded_with(
        initial,
        || (),
        |spawner, item, ()| run(spawner, item),
        |(), ()| (),
    )
}

/// [`scope_unbounded`], plus a per-drainer accumulator folded into a single return value.
///
/// Each drainer builds its own accumulator with `init`, `run` mutates it in place while processing
/// items, and the accumulators are combined pairwise with `merge` as drainers finish. `merge` must
/// be associative and commutative — drainers finish in a nondeterministic order, so the grouping
/// and ordering of the folds are not specified.
///
/// This exists so `run` can efficiently accumulate with minimal locking overhead managed by the
/// scope.
///
/// `init` is called potentially many times for each thread context.
///
/// Returns `init()` when no item is ever processed (e.g. an empty `initial`).
///
/// # Panics and aborts
///
/// Both [`ControlFlow::Break`] and a panic abort the scope, abandoning every queued-but-unstarted
/// item (see [`scope_unbounded`]). They differ in what comes back:
///
/// - On `Break`, results accumulated before the abort are returned as usual; the abandoned items
///   simply never contributed.
/// - On a panic, the panic is re-raised after the join and **all accumulated results are
///   discarded** — the return value is only produced on the normal path.
pub fn scope_unbounded_with<'env, T, R, F, Init, Merge>(
    initial: impl IntoIterator<Item = T>,
    init: Init,
    run: F,
    merge: Merge,
) -> R
where
    T: Send + 'static,
    R: Send + 'env,
    F: Fn(&Scope<'_, T, R>, T, &mut R) -> ControlFlow<()> + Send + Sync + 'env,
    Init: Fn() -> R + Send + Sync + 'env,
    Merge: Fn(R, R) -> R + Send + Sync + 'env,
{
    let handle = Handle::current();
    // One worker per runtime thread beyond the calling thread
    let max_workers = handle.metrics().num_workers().saturating_sub(1);
    let span = Span::current();

    // `ScopeInner` is parameterized over the borrow lifetime, so these go in as ordinary
    // references. The one erasure to `'static` is at the tokio hand-off in
    // `spawn_worker_if_needed`.
    let init_ref: &(dyn Fn() -> R + Send + Sync + '_) = &init;
    let merge_ref: &(dyn Fn(R, R) -> R + Send + Sync + '_) = &merge;

    let (sender, receiver) = mpmc::channel();
    let mut inner = ScopeInner {
        remaining_tasks: AtomicUsize::new(0),
        panic: OnceLock::new(),
        work_queue: receiver,
        work_queue_sender: RwLock::new(Some(sender)),
        aborted: AtomicBool::new(false),
        available_slots: AtomicUsize::new(max_workers),
        workers: Mutex::new(WorkerSlots::new(max_workers)),
        handle: handle.clone(),
        span: span.clone(),
        workers_idle: Condvar::new(),
        turbo_tasks: try_turbo_tasks(),
        run: &run,
        results: Mutex::new(None),
        init: init_ref,
        merge: merge_ref,
    };

    // Arm the join guard before anything can spawn, so a worker can never outlive the join.
    let joiner = Joiner { inner: &inner };

    // Increment remaining tasks to ensure the scope cannot exit before all tasks are enqueued
    inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    for item in initial {
        enqueue(&inner, item);
    }

    // Drain and join before checking for a panic. Every drainer has merged its accumulator by the
    // time this returns.
    drop(joiner);

    if let Some(err) = inner.panic.take() {
        panic::resume_unwind(err.into_inner());
    }

    inner.results.lock().take().unwrap_or_else(init)
}

/// Handle passed to the `run` closure of [`scope_unbounded`], used to enqueue additional items into
/// the same scope.
pub struct Scope<'scope, T: Send + 'static, R = ()> {
    inner: &'scope ScopeInner<'scope, T, R>,
}

impl<T: Send + 'static, R: Send> Scope<'_, T, R> {
    /// Enqueue another item to be processed by `run`. Callable any number of times from inside
    /// `run`, on any drainer thread.
    ///
    /// Silently drops `item` once the scope has aborted.
    pub fn spawn(&self, item: T) {
        enqueue(self.inner, item);
    }
}

/// A reference to the shared per-item closure for a [`scope_unbounded`] run. `'run` is the lifetime
/// of the borrows it captures (`'env` at the call site, erased to `'static` when handed to tokio).
/// `R` is the per-drainer accumulator threaded through by [`scope_unbounded_with`].
type RunFn<'run, T, R> =
    &'run (dyn Fn(&Scope<'_, T, R>, T, &mut R) -> ControlFlow<()> + Send + Sync + 'run);

/// Shared state for a [`scope_unbounded`] run, living on the caller's stack.
///
/// `'run` is the lifetime of the borrows held by the `run`/`init`/`merge` closures (`'env` at the
/// call site). It stays a real lifetime here rather than being pinned to `'static` so the fields
/// don't each force `R: 'static`; the single erasure to `'static` happens at the [`Drainable`]
/// hand-off to tokio.
struct ScopeInner<'run, T: Send + 'static, R> {
    /// Items enqueued but not yet finished. The scope is done exactly when this reaches zero; see
    /// [`enqueue`] for the increment-before-push ordering that makes zero reliable.
    remaining_tasks: AtomicUsize,
    /// First panic raised while processing an item; propagated to the caller after the join.
    panic: OnceLock<SyncView<Box<dyn Any + Send + 'static>>>,
    /// Receiving end of the work queue, shared by every drainer.
    work_queue: mpmc::Receiver<T>,
    /// Sending end of the queue, modeled so we can `take` and thus close the queue
    work_queue_sender: RwLock<Option<mpmc::Sender<T>>>,
    aborted: AtomicBool,
    /// Spawn budget, mutated under the workers slot, atomic so it can be read outside of it.
    available_slots: AtomicUsize,
    workers: Mutex<WorkerSlots>,
    /// Triggered when the last worker in `workers` is cleared.
    workers_idle: Condvar,
    handle: Handle,
    span: Span,
    turbo_tasks: Option<Arc<dyn TurboTasksApi>>,
    /// The per-item closure.
    run: RunFn<'run, T, R>,
    init: &'run (dyn Fn() -> R + Send + Sync + 'run),
    merge: &'run (dyn Fn(R, R) -> R + Send + Sync + 'run),
    // Accumulated results, workers aggregate into this using init/merge as workers exit their
    // scope
    results: Mutex<Option<R>>,
}

impl<T: Send + 'static, R> ScopeInner<'_, T, R> {
    /// Closes the work queue by dropping the only sender. Every blocked `recv` returns `Err` once
    /// this runs and the buffer is drained, which is how drainers learn the scope is finished.
    /// Idempotent.
    fn close(&self) {
        drop(self.work_queue_sender.write().take());
    }

    /// Abandons all queued-but-unstarted work. Idempotent.
    fn abort(&self) {
        self.aborted.store(true, Ordering::Release);
        self.close();
    }

    fn on_item_finished(&self) {
        if self.remaining_tasks.fetch_sub(1, Ordering::Release) == 1 {
            self.close();
        }
    }

    /// Keeps the first panic seen; later ones are dropped.
    fn record_panic(&self, err: Box<dyn Any + Send + 'static>) {
        self.abort();
        let _ = self.panic.set(SyncView::new(err));
    }

    /// Drain loop, run by both the workers and the calling thread until the scope terminates.
    ///
    /// - A scope worker (`is_worker`) exits after [`WORKER_IDLE_TIMEOUT`] on an empty queue
    /// - The calling thread blocks until the queue closes, which requires every item to be
    ///   finished.
    fn drain(&self, is_worker: bool) {
        if is_worker && let Some(turbo_tasks) = &self.turbo_tasks {
            turbo_tasks_scope(turbo_tasks.clone(), || self.drain_loop(is_worker))
        } else {
            self.drain_loop(is_worker)
        }
    }

    fn drain_loop(&self, is_worker: bool) {
        let mut acc: Option<R> = None;
        while let Some(item) = if is_worker {
            self.work_queue.recv_timeout(WORKER_IDLE_TIMEOUT).ok()
        } else {
            self.work_queue.recv().ok()
        } {
            // Post-abort: discard without running, so the wind-down can't re-grow the queue.
            if self.aborted.load(Ordering::Acquire) {
                self.on_item_finished();
                continue;
            }
            let spawner = Scope { inner: self };
            let result = catch_unwind(AssertUnwindSafe(|| {
                // Lazily init the thread local accumulator only when we are going to execute an
                // item
                let acc = acc.get_or_insert_with(self.init);
                (self.run)(&spawner, item, acc)
            }));

            match result {
                Ok(ControlFlow::Continue(())) => {}
                Ok(ControlFlow::Break(())) => {
                    self.abort();
                }
                // A panic aborts too; see `scope_unbounded`.
                Err(panic) => {
                    self.record_panic(panic);
                }
            };
            self.on_item_finished();
        }

        // Fold this drainer's accumulator into the shared results slot
        if let Some(acc) = acc {
            let merged = catch_unwind(AssertUnwindSafe(|| {
                let mut results = self.results.lock();
                *results = Some(match results.take() {
                    Some(existing) => (self.merge)(existing, acc),
                    None => acc,
                });
            }));
            if let Err(panic) = merged {
                self.record_panic(panic);
            }
        }
    }
}

/// Account for and enqueue one item. The increment must happen before the push: pushing first would
/// let another drainer pop and finish the item before it is counted, so `remaining_tasks` could hit
/// zero with work still live.
fn enqueue<T: Send + 'static, R: Send>(inner: &ScopeInner<'_, T, R>, item: T) {
    if inner.aborted.load(Ordering::Acquire) {
        return;
    }
    let num_tasks = inner.remaining_tasks.fetch_add(1, Ordering::Relaxed) + 1;
    let sent = {
        let sender = inner.work_queue_sender.read();
        match sender.as_ref() {
            Some(sender) => sender.send(item).is_ok(),
            // Closed: the scope is winding down (aborted, or already finished).
            None => false,
        }
    };
    if !sent {
        inner.on_item_finished(); // since the item won't execute decrement now
        return;
    }
    spawn_worker_if_needed(inner, num_tasks);
}

/// Re-arm one worker if the scope is running below its budget.
fn spawn_worker_if_needed<T: Send + 'static, R: Send>(
    inner: &ScopeInner<'_, T, R>,
    num_enqueued_tasks: usize,
) {
    if num_enqueued_tasks <= 1
        || inner.available_slots.load(Ordering::Relaxed) == 0
        || inner.aborted.load(Ordering::Acquire)
    {
        return;
    }

    // SAFETY: `Joiner::drop` waits for every worker slot to be released before returning, and the
    // slot for this worker is claimed below under the table lock *before* the spawn, so no erased
    // reference can outlive `'env` or the `inner` stack slot.
    let erased: &(dyn Drainable + Send + Sync + '_) = inner;
    let erased: &'static (dyn Drainable + Send + Sync + 'static) = unsafe {
        std::mem::transmute::<
            &(dyn Drainable + Send + Sync + '_),
            &'static (dyn Drainable + Send + Sync + 'static),
        >(erased)
    };

    let mut slots = inner.workers.lock();
    let Some(slot) = slots.free_slot() else {
        return;
    };
    let span = inner.span.clone();
    // capture before the spawn and move into it
    let guard = erased.claim_worker_slot(slot);
    let handle = inner
        .handle
        .spawn(async move {
            let _span = span.entered();
            let _guard = guard;
            erased.drain(true);
        })
        .abort_handle();
    slots.occupy(slot, handle, &inner.available_slots);
}

/// The drain loop with the accumulator type erased.
///
/// Worker tasks are spawned onto tokio and so must be `'static`, but the accumulator `R` borrows
/// `'env`. A worker only ever needs to *run* the loop — it never names an `R` — so it holds the
/// scope through this trait instead of the concrete [`ScopeInner`], keeping `R` out of the spawned
/// future's type entirely.
trait Drainable {
    fn drain(&self, is_worker: bool);
    /// Take ownership of `slot`'s release, which [`spawn_worker_if_needed`] has already claimed.
    /// On the trait so a spawned worker can build its guard without naming `R`.
    fn claim_worker_slot(&self, slot: usize) -> WorkerGuard<'_>;
}

impl<T: Send + 'static, R> Drainable for ScopeInner<'_, T, R> {
    fn drain(&self, is_worker: bool) {
        ScopeInner::drain(self, is_worker)
    }

    fn claim_worker_slot(&self, slot: usize) -> WorkerGuard<'_> {
        WorkerGuard {
            slots: &self.workers,
            workers_idle: &self.workers_idle,
            available_slots: &self.available_slots,
            slot,
        }
    }
}

/// Fixed table of worker slots, indexed by slot number, with a bitset of which are occupied.
///
/// This is both the spawn budget and the join set, because a slot is occupied from *before* its
/// task exists until *after* that task's last access to the caller's frame:
struct WorkerSlots {
    handles: Vec<Option<AbortHandle>>,
    /// Bit `i` set means slot `i` is occupied — claimed by [`Self::occupy`] and not yet released
    /// by a [`WorkerGuard`]. Tracks *occupancy*, not handle presence.
    occupied: FixedBitSet,
}

impl WorkerSlots {
    fn new(max_workers: usize) -> Self {
        Self {
            handles: vec![None; max_workers],
            occupied: FixedBitSet::with_capacity(max_workers),
        }
    }

    fn free_slot(&self) -> Option<usize> {
        self.occupied.zeroes().next()
    }

    /// Record a newly spawned worker in `slot`, which must have come from [`Self::free_slot`].
    fn occupy(&mut self, slot: usize, handle: AbortHandle, available_slots: &AtomicUsize) {
        debug_assert!(
            !self.occupied.contains(slot),
            "slot {slot} already occupied"
        );
        available_slots.fetch_sub(1, Ordering::Relaxed);
        self.occupied.insert(slot);
        let previous = self.handles[slot].replace(handle);
        debug_assert!(previous.is_none(), "slot {slot} held a live handle");
    }

    /// Dropping the handle here keeps the finished task's allocation from outliving the worker.
    fn release(&mut self, slot: usize, available_slots: &AtomicUsize) {
        available_slots.fetch_add(1, Ordering::Relaxed);
        self.occupied.remove(slot);
        self.handles[slot] = None;
    }

    /// Whether every slot is free, i.e. no task can still touch the caller's frame. The predicate
    /// [`Joiner::drop`] waits on.
    fn is_idle(&self) -> bool {
        self.occupied.is_clear()
    }
}

/// Releases a worker's slot and wakes [`Joiner::drop`] when it is the last one.
struct WorkerGuard<'a> {
    slots: &'a Mutex<WorkerSlots>,
    workers_idle: &'a Condvar,
    available_slots: &'a AtomicUsize,
    slot: usize,
}

impl Drop for WorkerGuard<'_> {
    fn drop(&mut self) {
        let mut slots_guard = self.slots.lock();
        slots_guard.release(self.slot, self.available_slots);
        if slots_guard.is_idle() {
            // Still holding the lock: the predicate the joiner waits on is read under this same
            // lock, so it cannot go true between its check and its `wait`.
            self.workers_idle.notify_all();
        }
    }
}

/// Drains the queue and joins the workers, on the return path and on an unwind alike.
struct Joiner<'a, 'run, T: Send + 'static, R> {
    inner: &'a ScopeInner<'run, T, R>,
}

impl<T: Send + 'static, R> Drop for Joiner<'_, '_, T, R> {
    fn drop(&mut self) {
        // Discharge the placeholder item that covered the seeding loop.
        self.inner.on_item_finished();
        // Returns only once the queue is closed, so no new work can arrive after this.
        self.inner.drain(false);
        // The queue is now closed so no workers can spawn. Capture all the handles.
        // There should be no contention on this slot
        let _span = info_span!("blocking: waiting for scope to end").entered();
        let handles: Vec<_> = {
            let mut slots = self.inner.workers.lock();
            slots.handles.iter_mut().filter_map(Option::take).collect()
        };

        // Abort all workers, that way workers we have spawned but have never run get dropped and
        // release their slots.  Otherwise a contended runtime could delay shutdown of the scope.
        for handle in handles {
            handle.abort();
        }

        // Wait for all workers to exit and drop their guards.  This should be fast, after the
        // aborts and the queue is dropped each worker just needs to merge their accumulated
        // stats.  So we wait for that.
        let mut slots = self.inner.workers.lock();
        while !slots.is_idle() {
            self.inner.workers_idle.wait(&mut slots);
        }
    }
}
#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, atomic::AtomicUsize},
        thread,
        time::Duration,
    };

    use super::*;

    /// Runs `body` on a runtime with the I/O driver disabled, so the test also works under Miri.
    ///
    /// `#[tokio::test]` hardcodes `Builder::enable_all()`, whose I/O driver calls
    /// `kqueue()`/`epoll_create1()` — Miri has no shim for either, so such a test aborts at runtime
    /// construction before reaching any code under test. Nothing here needs I/O.
    ///
    /// `body` runs on a blocking thread, as production callers are expected to: `scope_unbounded`
    /// blocks, and its `block_in_place` requires a multi-thread runtime.
    fn with_runtime<F, T>(worker_threads: usize, body: F) -> T
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(worker_threads)
            .enable_time()
            .build()
            .unwrap();
        runtime.block_on(async { tokio::task::spawn_blocking(body).await.unwrap() })
    }

    /// A single `run` call enqueues a large batch of leaves; every one must be processed.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_wide_burst_of_leaves() {
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

    /// A slow seeding iterator must not let the scope finish early.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_slow_seeding_iterator_completes() {
        const SEEDS: usize = 16;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            // Each `next()` blocks briefly, so the queue drains to empty before the next seed
            // arrives.
            let slow_seeds = std::iter::from_fn({
                let mut next = 0;
                move || {
                    if next == SEEDS {
                        return None;
                    }
                    thread::sleep(Duration::from_millis(2));
                    next += 1;
                    Some(next - 1)
                }
            });
            scope_unbounded(slow_seeds, move |_spawner, _item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                ControlFlow::Continue(())
            });
        })
        .await
        .unwrap();
        assert_eq!(
            processed.load(Ordering::SeqCst),
            SEEDS,
            "seeds produced after the queue briefly drained must still be processed"
        );
    }

    /// Aborting in the middle of a deep, still-growing cascade must terminate rather than hang:
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

    /// `spawn` issued *after* the abort has latched must be dropped, not enqueued — the case a job
    /// finishing concurrently with another job's abort hits. A `spawn` that counted an item into
    /// `remaining_tasks` without queueing it would never reach zero, so this hangs rather than
    /// fails.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_spawn_after_abort_is_dropped() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        const SEEDS: usize = 64;
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..SEEDS, move |spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                // Spawning *before* the `Break` is the point: these spawns race the abort latch and
                // must be dropped rather than counted-but-unqueued.
                for i in 0..1000 {
                    spawner.spawn(SEEDS + item * 1000 + i);
                }
                ControlFlow::Break(())
            });
        })
        .await
        .unwrap();
        // Only seeds may run: every spawned id is >= SEEDS, so processing even one would push the
        // count past the seed total.
        let count = processed.load(Ordering::SeqCst);
        assert!(
            count <= SEEDS,
            "post-abort spawns must be dropped, but {count} items ran"
        );
    }

    /// Abort on a `current_thread` runtime, where the calling thread is the only drainer.
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

    /// A panic that happens while the scope is aborting still propagates rather than being
    /// swallowed by the wind-down: the abort's queue-clear races the panic's unwind through
    /// `catch_unwind` -> `on_item_finished`.
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

    /// A panic in a `run` invocation propagates after all in-flight work is joined, and aborts the
    /// scope: the queued-but-unstarted items are abandoned rather than run.
    ///
    /// The first item panics, so with a large seed set almost nothing else should be dispatched.
    /// Items already picked up by another drainer still complete, so the bound is "far fewer than
    /// seeded" rather than exactly one.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_panic_propagates_and_abandons_queue() {
        const ITEMS: usize = 10_000;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        let result = catch_unwind(AssertUnwindSafe(|| {
            scope_unbounded(0..ITEMS, move |_spawner, item| {
                processed_clone.fetch_add(1, Ordering::SeqCst);
                if item == 0 {
                    panic!("Intentional panic");
                }
                ControlFlow::Continue(())
            });
            unreachable!();
        }));
        let err = result.expect_err("the panic must propagate");
        assert_eq!(err.downcast_ref::<&str>(), Some(&"Intentional panic"));
        let count = processed.load(Ordering::SeqCst);
        assert!(
            count < ITEMS,
            "a panic must abandon the queue, but all {ITEMS} items ran"
        );
    }

    // -----------------------------------------------------------------------
    // scope_unbounded_with (fold results)
    // -----------------------------------------------------------------------

    /// The accumulator must be per-drainer, not shared: collecting into a `Vec` and merging by
    /// concatenation must preserve every element even with several drainers running.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_with_collects_all_values() {
        const ITEMS: usize = 500;
        let mut collected = tokio::task::spawn_blocking(|| {
            scope_unbounded_with(
                0..ITEMS,
                Vec::new,
                |_spawner, item: usize, acc: &mut Vec<usize>| {
                    acc.push(item);
                    ControlFlow::Continue(())
                },
                |mut a: Vec<usize>, b| {
                    a.extend(b);
                    a
                },
            )
        })
        .await
        .unwrap();
        collected.sort_unstable();
        assert_eq!(collected, (0..ITEMS).collect::<Vec<_>>());
    }

    /// With no items, no drainer builds an accumulator, so the result is exactly one `init()` —
    /// not a fold of one per drainer that happened to start.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_with_empty_returns_init() {
        let total = tokio::task::spawn_blocking(|| {
            scope_unbounded_with(
                std::iter::empty::<usize>(),
                || 42usize,
                |_spawner, _item, _acc| ControlFlow::Continue(()),
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        assert_eq!(total, 42, "expected exactly one init(), got {total}");
    }

    /// A scope driven **directly** on a `current_thread` runtime — not via `spawn_blocking` — must
    /// still complete.
    #[tokio::test(flavor = "current_thread")]
    async fn test_unbounded_current_thread_direct_call_completes() {
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        scope_unbounded(0..8usize, move |spawner, item| {
            processed_clone.fetch_add(1, Ordering::SeqCst);
            if item < 3 {
                spawner.spawn(100 + item);
            }
            ControlFlow::Continue(())
        });
        assert_eq!(processed.load(Ordering::SeqCst), 11);
    }

    /// Aborting returns the results accumulated up to that point rather than discarding them —
    /// only the abandoned items are missing. The run must still terminate cleanly.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_with_abort_returns_partial_results() {
        let processed = tokio::task::spawn_blocking(|| {
            scope_unbounded_with(
                0..1000usize,
                || 0usize,
                |_spawner, item, acc| {
                    *acc += 1;
                    if item == 0 {
                        return ControlFlow::Break(());
                    }
                    ControlFlow::Continue(())
                },
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        // At least the aborting item ran, and the abort must have cut the run short.
        assert!(processed >= 1, "expected the aborting item to be counted");
        assert!(
            processed < 1000,
            "abort should abandon queued items, but all {processed} ran"
        );
    }

    /// A panic must propagate through the fold path without deadlocking the join, which drainers
    /// reach only after their merge.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_with_panic_propagates() {
        let result = catch_unwind(AssertUnwindSafe(|| {
            scope_unbounded_with(
                0..100usize,
                || 0usize,
                |_spawner, item, acc| {
                    if item == 50 {
                        panic!("Intentional panic");
                    }
                    *acc += 1;
                    ControlFlow::Continue(())
                },
                |a, b| a + b,
            );
            unreachable!();
        }));
        let err = result.expect_err("the panic must propagate out of the fold API");
        assert_eq!(err.downcast_ref::<&str>(), Some(&"Intentional panic"));
    }

    /// The accumulator may borrow `'env` data (it is not `'static`), mirroring how `run` may.
    #[test]
    fn test_unbounded_with_borrowed_accumulator() {
        let label = String::from("item");
        let count = with_runtime(4, move || {
            let label = &label;
            scope_unbounded_with(
                0..32usize,
                Vec::new,
                |_spawner, item: usize, acc: &mut Vec<String>| {
                    acc.push(format!("{label}-{item}"));
                    ControlFlow::Continue(())
                },
                |mut a: Vec<String>, b| {
                    a.extend(b);
                    a
                },
            )
            .len()
        });
        assert_eq!(count, 32);
    }

    // -----------------------------------------------------------------------
    // worker exit / respawn tests
    //
    // `init` runs once per drainer that receives an item, so counting `init` calls counts *distinct
    // drainer lifetimes* — the only externally visible signal that a worker exited and a later one
    // replaced it.
    // -----------------------------------------------------------------------

    /// A worker exits once the queue is empty, and a later `spawn` re-arms one: the scope must
    /// still finish work produced after every worker has gone away.
    ///
    /// Serialized by construction — one item in flight at a time, with a gap long enough that any
    /// worker has certainly timed out — so reaching the second item at all exercises the respawn
    /// path rather than a still-live worker.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_worker_respawns_after_going_idle() {
        let inits = Arc::new(AtomicUsize::new(0));
        let counted = inits.clone();
        let processed = Arc::new(AtomicUsize::new(0));
        let ran = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded_with(
                std::iter::once(0usize),
                move || {
                    counted.fetch_add(1, Ordering::SeqCst);
                },
                move |spawner, item, ()| {
                    ran.fetch_add(1, Ordering::SeqCst);
                    if item == 0 {
                        // Let the queue sit empty long enough that any worker has exited, then
                        // produce work again. A fresh drainer is the only thing that can pick it
                        // up.
                        thread::sleep(Duration::from_millis(100));
                        spawner.spawn(1);
                    }
                    ControlFlow::Continue(())
                },
                |(), ()| (),
            )
        })
        .await
        .unwrap();
        assert_eq!(
            processed.load(Ordering::SeqCst),
            2,
            "work spawned after the pool went idle must still run"
        );
        // Both items ran (the scope only returns once the queue is drained), and at least one
        // drainer built an accumulator. The exact count depends on which drainer wins each item.
        let count = inits.load(Ordering::SeqCst);
        assert!(
            (1..=2).contains(&count),
            "expected 1-2 drainer lifetimes, got {count}"
        );
    }

    /// A scope that never has queued work must not occupy a worker at all.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_empty_spawns_no_workers() {
        let inits = Arc::new(AtomicUsize::new(0));
        let counted = inits.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded_with(
                std::iter::empty::<usize>(),
                move || counted.fetch_add(1, Ordering::SeqCst),
                |_spawner, _item, _acc| ControlFlow::Continue(()),
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        assert_eq!(
            inits.load(Ordering::SeqCst),
            1,
            "expected only the terminal identity init(), not a per-drainer one"
        );
    }

    /// Sustained work keeps workers alive rather than churning them:
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_busy_queue_does_not_churn_workers() {
        const ITEMS: usize = 20_000;
        let inits = Arc::new(AtomicUsize::new(0));
        let counted = inits.clone();
        let processed = tokio::task::spawn_blocking(move || {
            scope_unbounded_with(
                0..ITEMS,
                move || {
                    counted.fetch_add(1, Ordering::SeqCst);
                    0usize
                },
                |_spawner, _item, acc| {
                    *acc += 1;
                    ControlFlow::Continue(())
                },
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        assert_eq!(processed, ITEMS, "every item must run");
        // 4 runtime workers => 3 scope workers + the calling thread at any instant. The bound is
        // loose because a worker can still lose a race to the last queued item and be re-armed, and
        // the rest of the suite competes for the same threads — but a churning implementation lands
        // in the thousands, so anything near the worker count proves the timeout is doing its job.
        let count = inits.load(Ordering::SeqCst);
        assert!(
            count <= 16,
            "a saturated queue should not churn drainers, got {count} lifetimes for {ITEMS} items"
        );
    }

    /// The join must not depend on tokio scheduling, even when every runtime thread is contended
    /// and workers are still mid-drain.
    #[test]
    fn test_unbounded_join_under_thread_starvation() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_time()
            .build()
            .unwrap();
        runtime.block_on(async {
            let mut scopes = Vec::new();
            for _ in 0..8 {
                scopes.push(tokio::task::spawn_blocking(|| {
                    let processed = Arc::new(AtomicUsize::new(0));
                    let counted = processed.clone();
                    scope_unbounded(0..200usize, move |spawner, item| {
                        counted.fetch_add(1, Ordering::SeqCst);
                        // Keep the queue growing so workers are still draining at join time.
                        if item < 200 {
                            spawner.spawn(1000 + item);
                        }
                        thread::yield_now();
                        ControlFlow::Continue(())
                    });
                    processed.load(Ordering::SeqCst)
                }));
            }
            for scope in scopes {
                assert_eq!(scope.await.unwrap(), 400, "every scope must drain fully");
            }
        });
    }
}
