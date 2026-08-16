//! Unbounded scoped parallelism: a running job may discover more work.
//!
//! The total number of items isn't known up front, so termination is driven by an
//! outstanding-item counter reaching zero rather than by a count supplied by the caller.
//!
//! `run` is the per-item body, invoked once per item and concurrently across every drainer — not a
//! single closure handed a scope object, as in [`std::thread::scope`] and
//! [`scope_bounded`](crate::scope_bounded::scope_bounded). Hence the seed set arriving as an
//! `initial` iterator, and [`ControlFlow::Break`] rather than local control flow for early
//! termination: aborting has to reach the *shared* queue, not just return from one invocation.

use std::{
    any::Any,
    ops::ControlFlow,
    panic::{self, AssertUnwindSafe, catch_unwind},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpmc::{self, Receiver, Sender},
    },
};

use parking_lot::{Condvar, Mutex, RwLock};
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Span, info_span};

use crate::{manager::try_turbo_tasks, turbo_tasks_scope};

/// A reference to the shared per-item closure for a [`scope_unbounded`] run. `'run` is the lifetime
/// of the borrows it captures (`'env` at the call site, erased to `'static` for storage in
/// [`UnboundedInner`]). `R` is the per-drainer accumulator threaded through by
/// [`scope_unbounded_with`].
type RunFn<'run, T, R> =
    &'run (dyn Fn(&Scope<'_, T, R>, T, &mut R) -> ControlFlow<()> + Send + Sync + 'run);

/// The drain loop, with the accumulator type erased.
///
/// Helper tasks are spawned onto tokio and so must be `'static`, but the accumulator `R` borrows
/// `'env`. A helper only ever needs to *run* the loop — it never names an `R` — so it holds the
/// scope through this trait instead of the concrete [`UnboundedInner`], keeping `R` out of the
/// spawned future's type entirely.
trait Drainable {
    fn drain(&self);
}

impl<T: Send + 'static, R> Drainable for UnboundedInner<'_, T, R> {
    fn drain(&self) {
        UnboundedInner::drain(self)
    }
}

/// Shared state for a [`scope_unbounded`] run.
///
/// `'run` is the lifetime of the borrows held by the `run`/`init`/`merge` closures (`'env` at the
/// call site). It stays a real lifetime here rather than being pinned to `'static` so the fields
/// don't each force `R: 'static`; the single erasure to `'static` happens at the `Drainable`
/// hand-off to tokio, where it is justified by the join in `Joiner::drop`.
struct UnboundedInner<'run, T: Send + 'static, R> {
    /// Items enqueued but not yet finished. The scope is done exactly when this reaches zero; see
    /// [`enqueue`] for the increment-before-finish ordering that makes zero reliable.
    remaining_tasks: AtomicUsize,
    /// First panic raised while processing an item; propagated to the caller after the join.
    panic: Mutex<Option<Box<dyn Any + Send + 'static>>>,
    /// Receiving end of the work queue, shared by every drainer.
    work_queue: Receiver<T>,
    /// Sending end. This is the *only* sender — drainers never hold a clone, because a clone
    /// parked in `recv` would keep the channel open and deadlock the close.
    ///
    /// The lock exists solely so [`UnboundedInner::close`] can *take* the sender atomically with
    /// respect to a racing send; `mpmc::Sender` is `Sync`, so concurrent sends need no mutual
    /// exclusion. It is an `RwLock` because a `Mutex` here serialized every spawn behind one
    /// global lock and dominated GC collect time in profiles.
    work_queue_sender: RwLock<Option<Sender<T>>>,
    /// Latched by [`UnboundedInner::abort`] when a `run` returns [`ControlFlow::Break`]: once set,
    /// [`Scope::spawn`] drops further items and drainers discard what is still buffered.
    ///
    /// Dropping the sender alone is not enough — it stops *new* sends, but items already buffered
    /// in the channel are still delivered, and a racing `spawn` must become a no-op before it
    /// touches `remaining_tasks`.
    aborted: AtomicBool,
    /// Number of drainers that have **entered** [`UnboundedInner::drain`] but not yet finished
    /// merging. Incremented as that function's first statement and decremented after its merge, so
    /// a non-zero value means some thread may still dereference the `run`/`init`/`merge` pointers
    /// into the caller's frame.
    ///
    /// This is what [`Joiner::drop`] joins on, and it is deliberately *not* `remaining_tasks`:
    /// a drainer merges its accumulator **after** its loop exits, which is strictly after the
    /// `on_item_finished` that drove `remaining_tasks` to zero. Joining on the item count would
    /// free the frame while a helper was still inside `(self.merge)(..)`.
    ///
    /// Only helpers that actually started running are counted, which is the whole point: the
    /// unstarted ones are cancelled outright (see [`Joiner::drop`]), so the join never waits on a
    /// task the scheduler has not yet polled.
    active_drainers: AtomicUsize,
    /// Woken when `active_drainers` hits zero, so the joining thread can park instead of spinning.
    drainers_done: Condvar,
    /// Mutex the joining thread holds while waiting on `drainers_done`. Guards no data — the count
    /// itself is atomic; this exists only because `Condvar` requires a lock to wait on.
    drainers_done_mutex: Mutex<()>,
    /// Reference to the per-item closure (with turbo-tasks context re-established), shared by
    /// every drainer. It lives on `scope_unbounded`'s stack, with its `'env` borrows erased to
    /// `'static` here; see the `SAFETY` comment there.
    run: RunFn<'run, T, R>,
    /// Accumulated results, folded together as each drainer finishes.
    ///
    /// Each drainer keeps its accumulator on its own stack for the whole drain loop and merges it
    /// in exactly once, on the way out — so this lock is taken once per *drainer*, not once per
    /// item.
    ///
    /// `None` until the first drainer merges. Left as-is on the panic path; the partial value is
    /// discarded along with it (see [`scope_unbounded_with`]).
    results: Mutex<Option<R>>,
    /// Builds a fresh accumulator for a drainer that is about to start its loop. Same lifetime
    /// laundering as `run`.
    init: &'run (dyn Fn() -> R + Send + Sync + 'run),
    /// Folds two accumulators into one. Same lifetime laundering as `run`.
    merge: &'run (dyn Fn(R, R) -> R + Send + Sync + 'run),
}

impl<T: Send + 'static, R> UnboundedInner<'_, T, R> {
    /// Closes the work queue by dropping the only sender. Every blocked `recv` returns `Err` once
    /// this runs and the buffer is drained, which is how drainers learn the scope is finished.
    /// Idempotent.
    fn close(&self) {
        drop(self.work_queue_sender.write().take());
    }

    /// Abandons all queued-but-unstarted work. Items already being processed on other threads are
    /// **not** interrupted; they run to completion. Idempotent.
    ///
    /// Buffered items are still delivered after the close, but [`UnboundedInner::drain`] discards
    /// them unrun. Since only `run` can spawn a successor, the buffer then drains monotonically to
    /// empty rather than being re-grown by jobs still finishing.
    ///
    /// `aborted` is stored before the close so a `spawn` racing this either lands while the channel
    /// is open (and is discarded later by `drain`) or observes the flag and never counts its item —
    /// nothing can be counted and then leaked.
    fn abort(&self) {
        self.aborted.store(true, Ordering::Release);
        self.close();
    }

    /// Records that one item finished; the last one closes the queue, which is how drainers learn
    /// to exit.
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

    /// Closes the queue if nothing is in flight. Needed for the empty-initial / already-drained
    /// case, where `on_item_finished` never fires (or already fired) so nothing else would close.
    fn close_if_idle(&self) {
        if self.remaining_tasks.load(Ordering::Acquire) == 0 {
            self.close();
        }
    }

    /// Drain loop, run by both helpers and the calling thread until the scope terminates.
    ///
    /// The accumulator lives on this thread's stack for the whole loop and is merged into the
    /// shared slot once, at the end — so `run` can accumulate without touching shared state per
    /// item.
    fn drain(&self) {
        // Register *before* touching anything reached through `self`. `Joiner::drop` joins on this
        // count, and only a drainer that has incremented it may dereference the `run`/`init`/
        // `merge` pointers into the caller's frame — `(self.init)()`, `(self.run)(..)` and
        // `(self.merge)(..)` below are all such dereferences.
        self.active_drainers.fetch_add(1, Ordering::Relaxed);
        // Built on the first item, not on entry: a drainer that never receives one contributes
        // nothing to the fold. Otherwise the result would depend on how many drainers happened to
        // start — including idle helpers that got no work — so a caller whose `init()` is not a
        // `merge` identity would see a scheduling-dependent answer.
        let mut acc: Option<R> = None;
        // `recv` blocks while the queue is empty and fails once the sender is dropped and the
        // buffer is drained, so this ends exactly when the scope is finished.
        //
        // TODO: drainers park here whenever the queue is momentarily empty — including mid-pass,
        // when one long-running job is about to spawn many successors — and hold their worker while
        // parked. Letting an idle drainer time out and hand the worker back is the fix; see the
        // TODO on `scope_unbounded_with`.
        while let Ok(item) = self.work_queue.recv() {
            // Post-abort: discard without running, so the wind-down can't re-grow the queue.
            if self.aborted.load(Ordering::Acquire) {
                self.on_item_finished(None);
                continue;
            }
            let spawner = Scope { inner: self };
            // First item on this drainer: build the accumulator now.
            let acc = acc.get_or_insert_with(self.init);
            let result = catch_unwind(AssertUnwindSafe(|| (self.run)(&spawner, item, acc)));
            // Abort *before* `on_item_finished` so the close and this item's decrement can't both
            // observe a non-zero count and leave nobody to close the queue.
            let panic = match result {
                Ok(ControlFlow::Continue(())) => None,
                Ok(ControlFlow::Break(())) => {
                    self.abort();
                    None
                }
                // A panic aborts too: it is going to be re-raised out of the scope, so the caller
                // never observes whatever the queued items would have produced. Running them would
                // only delay propagation.
                Err(panic) => {
                    self.abort();
                    Some(panic)
                }
            };
            self.on_item_finished(panic);
        }

        // Fold this drainer's accumulator into the shared slot if it was populated.
        if let Some(acc) = acc {
            let mut slot = self.results.lock();
            *slot = Some(match slot.take() {
                Some(existing) => (self.merge)(existing, acc),
                None => acc,
            });
        }

        // Last dereference of the caller's frame is done; release our registration. `Release` pairs
        // with the `Acquire` load in `Joiner::drop`, so a joiner that observes zero also observes
        // this drainer's merged results.
        //
        // The lock is taken around the notify (rather than just before it) so this can't slot
        // between the joiner's count check and its `wait`, which would lose the wakeup and park it
        // forever.
        if self.active_drainers.fetch_sub(1, Ordering::Release) == 1 {
            let _guard = self.drainers_done_mutex.lock();
            self.drainers_done.notify_all();
        }
    }
}

/// Handle passed to the `run` closure of [`scope_unbounded`], used to enqueue additional items into
/// the same scope.
///
/// Needs no `PhantomData<&'env mut &'env ()>` invariance marker, unlike
/// [`scope_bounded::Scope`](crate::scope_bounded::Scope): [`Scope::spawn`] takes `item: T` with
/// `T: Send + 'static`, so nothing borrowed from `'env` can enter and this type's covariance over
/// `'scope` is not exploitable.
pub struct Scope<'scope, T: Send + 'static, R = ()> {
    inner: &'scope UnboundedInner<'scope, T, R>,
}

impl<T: Send + 'static, R> Scope<'_, T, R> {
    /// Enqueue another item to be processed by `run`. Callable any number of times from inside
    /// `run`, on any drainer thread.
    ///
    /// **After any `run` has returned [`ControlFlow::Break`], this silently drops `item`.** Callers
    /// that abort must treat unspawned work as abandoned.
    pub fn spawn(&self, item: T) {
        enqueue(self.inner, item);
    }
}

/// Account + enqueue one item. The increment must happen before the push: pushing first would let
/// another drainer pop and finish the item before it is counted, so `remaining_tasks` could hit
/// zero with work still live.
fn enqueue<T: Send + 'static, R>(inner: &UnboundedInner<'_, T, R>, item: T) {
    if inner.aborted.load(Ordering::Acquire) {
        return;
    }
    inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    // Take the send lock before testing the sender: `close` takes it under the *write* side of the
    // same lock, so either we get a live sender and our item is buffered, or the sender is already
    // gone. Either way the item cannot be counted and then stranded with nobody to drain it.
    let sent = {
        let sender = inner.work_queue_sender.read();
        match sender.as_ref() {
            Some(sender) => sender.send(item).is_ok(),
            // Closed: the scope is winding down (aborted, or already finished).
            None => false,
        }
    };
    if !sent {
        // Back the accounting out; this may be the 1 -> 0 edge that closes the scope.
        inner.on_item_finished(None);
    }
}

/// Runs `run` over `initial` and everything it transitively spawns, completing only once every item
/// has been processed. No results are collected; jobs communicate through state captured in `run`.
/// Use [`scope_unbounded_with`] to accumulate a value instead.
///
/// `run` is shared across the calling thread and up to `runtime workers - 1` helper tasks and may
/// run concurrently. Helpers are a pure optimization: the calling thread drains the whole (growing)
/// queue itself, and the join cancels any helper the scheduler never polled rather than waiting for
/// it — so this does not deadlock on a thread-limited or fully-occupied runtime, even one where
/// every other worker is blocked on a lock the caller holds. Prefer calling from `spawn_blocking`
/// when other work shares the task.
///
/// Items must be `'static` (they sit in a queue drained by helper threads); the `run` closure may
/// borrow `'env` data.
///
/// # Aborting
///
/// Both [`ControlFlow::Break`] and a panic abandon all queued-but-unstarted items, so the scope
/// returns as soon as the currently-running jobs finish. Jobs already in flight on other threads
/// are **not** interrupted in either case.
///
/// Use `Break` when the remaining work is discardable (it can be recomputed on a later run) and
/// finishing it is not worth the latency.
///
/// A panic aborts for the same reason it is re-raised: the caller never observes what the remaining
/// items would have produced, so running them only delays propagation. The first panic from any
/// `run` is re-raised after the join.
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
/// This exists so `run` can accumulate **without shared state**: each drainer writes only to its
/// own stack and pays one lock acquisition on the way out. In profiles of the GC collect pass,
/// per-item shared atomics were several percent of total time.
///
/// `init` is called once per drainer that receives at least one item — never for an idle helper —
/// but *how many* drainers that is depends on scheduling, not on the work. So `init()` must return
/// an identity for `merge`, or the result varies run to run. (`0` for a sum, an empty collection
/// for a concat, `Default::default()` for a struct of counters.)
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
///
/// TODO: this occupies every worker for the whole call duration, because drainers park in `recv`
/// rather than exiting when the queue is empty. Two independent steps:
///
/// - **Shrink** (`recv_timeout`): an idle helper merges and exits, handing its worker back.
///   Raceless — helpers are a pure optimization and the calling thread never times out, so losing
///   one can only cost throughput, never correctness or termination.
/// - **Grow** (respawn from `enqueue` when queue depth warrants): needs the `JoinSet` replaced with
///   abort handles behind a lock, since `spawn_on` takes `&mut self` while `enqueue` has `&self`. A
///   lost wakeup is **accepted** here: a helper deciding to exit concurrently with an `enqueue`
///   that still counts it as live leaves the item for another drainer — worst case the calling
///   thread, which always drains. Self-feeding jobs (one long job spawning hundreds of successors)
///   make that reachable but rare, and tolerating it avoids a CAS protocol between exit and spawn.
///
/// Measure before building grow: if the queue rarely empties mid-pass, shrink alone captures most
/// of the benefit, and grow would only thrash helpers at the timeout boundary.
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
    // One helper per runtime worker beyond the calling thread; 0 on a current-thread runtime.
    let worker_tasks = handle.metrics().num_workers().saturating_sub(1);
    let turbo_tasks = try_turbo_tasks();
    let span = Span::current();

    // Re-establish the turbo-tasks context per item, as `Scope::spawn` does.
    let wrapped_run = move |spawner: &Scope<'_, T, R>, item: T, acc: &mut R| {
        if let Some(turbo_tasks) = turbo_tasks.clone() {
            turbo_tasks_scope(turbo_tasks, || run(spawner, item, acc))
        } else {
            run(spawner, item, acc)
        }
    };

    // `UnboundedInner` is parameterized over the borrow lifetime, so these go in as ordinary
    // references — no laundering needed here. The one erasure to `'static` is at the tokio
    // hand-off below.
    let run: RunFn<'_, T, R> = &wrapped_run;
    let init_ref: &(dyn Fn() -> R + Send + Sync + '_) = &init;
    let merge_ref: &(dyn Fn(R, R) -> R + Send + Sync + '_) = &merge;

    let (sender, receiver) = mpmc::channel();
    let inner = UnboundedInner {
        remaining_tasks: AtomicUsize::new(0),
        panic: Mutex::new(None),
        work_queue: receiver,
        work_queue_sender: RwLock::new(Some(sender)),
        aborted: AtomicBool::new(false),
        active_drainers: AtomicUsize::new(0),
        drainers_done: Condvar::new(),
        drainers_done_mutex: Mutex::new(()),
        run,
        results: Mutex::new(None),
        init: init_ref,
        merge: merge_ref,
    };

    // Drop guard that unconditionally drains-and-joins before returning or before a panic escapes,
    // mirroring `Scope::drop`. This is what makes the `'env` -> `'static` erasure of `run` sound,
    // and what keeps liveness independent of any helper being scheduled, panic path included.
    struct Joiner<'a, 'run, T: Send + 'static, R> {
        inner: &'a UnboundedInner<'run, T, R>,
        helpers: tokio::task::JoinSet<()>,
    }
    impl<T: Send + 'static, R> Drop for Joiner<'_, '_, T, R> {
        fn drop(&mut self) {
            // Empty-initial / already-drained: nothing will `close`, so do it here.
            self.inner.close_if_idle();
            // The calling thread is a drainer too: it drains the whole (growing) queue itself, so
            // all the *work* is guaranteed done by the time this returns, with no help from the
            // scheduler.
            self.inner.drain();

            // Everything below is purely about lifetimes, not work: `run`/`init`/`merge` point into
            // this frame, so no helper may dereference them after we return.
            //
            // Helpers split into exactly two sets, and each is handled without ever waiting on the
            // scheduler to run one:
            //
            // - **Never polled.** `abort()` on an idle task atomically claims it and marks it
            //   cancelled (`transition_to_shutdown`), so it will never run its body and never
            //   touches this frame. This is what makes the join independent of scheduling — the
            //   previous version awaited these handles, which deadlocks whenever the runtime has no
            //   thread to spare (every worker parked, e.g. blocked on a lock the caller holds).
            // - **Already running.** `abort()` cannot preempt them: `drain` is synchronous, so
            //   there is no await point to cancel at and the cancel bit is only observed once the
            //   poll completes. These are exactly the drainers counted in `active_drainers`, and
            //   waiting for that count to reach zero is bounded — each is already on a thread, the
            //   queue is closed, so its `recv` returns `Err` and it finishes without needing to be
            //   scheduled again.
            //
            // The two sets partition the helpers with no gap: a task that wins the idle race never
            // increments, and one that has begun polling incremented before it could touch
            // anything (see `drain`).
            self.helpers.abort_all();

            // Fast path: no helper ever entered (single-worker runtime, or all cancelled above).
            if self.inner.active_drainers.load(Ordering::Acquire) == 0 {
                return;
            }
            let _span = info_span!("blocking").entered();
            // Hand the worker slot back while parked so the runtime can keep making progress —
            // this is a courtesy, not a correctness requirement, since the drainers we wait on are
            // already running. Only reachable on a multi-thread runtime: a current-thread runtime
            // spawns no helpers, so the count is zero and we returned above (and `block_in_place`
            // would panic there).
            block_in_place(|| {
                let mut guard = self.inner.drainers_done_mutex.lock();
                while self.inner.active_drainers.load(Ordering::Acquire) != 0 {
                    self.inner.drainers_done.wait(&mut guard);
                }
            });
        }
    }

    // Spawn helpers up front so they can pull as soon as items appear.
    //
    // Spawned futures must be `'static`, but `R` (and the closures behind `run`/`init`/`merge`)
    // borrow `'env`. Erasing to `dyn Drainable` keeps `R` out of the future's type entirely —
    // naming `UnboundedInner<'static, T, R>` would require `R: 'static`, which the fold API cannot
    // promise.
    //
    // SAFETY: `Joiner::drop` awaits or aborts every helper task before this function returns, so no
    // erased reference outlives `'env` or the `inner` stack slot it points at.
    let erased: &(dyn Drainable + Send + Sync + '_) = &inner;
    let erased: &'static (dyn Drainable + Send + Sync + 'static) = unsafe {
        std::mem::transmute::<
            &(dyn Drainable + Send + Sync + '_),
            &'static (dyn Drainable + Send + Sync + 'static),
        >(erased)
    };
    let mut helpers = tokio::task::JoinSet::new();
    for _ in 0..worker_tasks {
        let span = span.clone();
        helpers.spawn_on(
            async move {
                let _span = span.entered();
                erased.drain();
            },
            &handle,
        );
    }
    let joiner = Joiner {
        inner: &inner,
        helpers,
    };

    // Count the seeding loop itself as one outstanding item. Helpers are already draining, so
    // without this `remaining_tasks` could transiently hit zero between two seeds, close the queue,
    // and leave every remaining seed silently dropped.
    inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    for item in initial {
        enqueue(&inner, item);
    }
    inner.on_item_finished(None);

    // Drain and join before checking for a panic. Every drainer has merged its accumulator by the
    // time this returns.
    drop(joiner);

    if let Some(err) = inner.panic.lock().take() {
        panic::resume_unwind(err);
    }

    // Every drainer that ran an item has merged by now. When none did (an empty `initial`, or every
    // item discarded by an abort) the slot is empty, and the result is a single `init()` — the
    // identity of the fold.
    inner.results.lock().take().unwrap_or_else(init)
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, atomic::AtomicUsize},
        thread,
        time::Duration,
    };

    use super::*;

    // -----------------------------------------------------------------------
    // scope_unbounded tests
    // -----------------------------------------------------------------------

    /// On a `current_thread` runtime there are no helpers and `block_in_place` panics, so the
    /// calling thread must drain the entire queue — including everything spawned mid-run — inline.
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

    /// A single `run` call that enqueues a large batch of leaves: every one must be picked up and
    /// processed, including by the helper worker tasks.
    ///
    /// The leaves matter. Because none of them spawns in turn, the queue drains monotonically to
    /// empty, so accounting that counts an item only after pushing it lets `remaining_tasks` reach
    /// zero early and strands the rest. A cascade would hide that by refilling the queue.
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

    /// Jobs spawn a *tree* of children, so work is produced at every depth rather than all at once.
    /// Every node must be processed exactly once — the visited flags catch duplicate visits, the
    /// count catches dropped ones.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_tree() {
        // Binary tree of depth 10 => 2^11 - 1 = 2047 nodes, ids 1..=2047 (heap numbering).
        const DEPTH: u32 = 10;
        const MAX_ID: usize = (1 << (DEPTH + 1)) - 1;

        // One flag per possible node id; set on visit.
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

    /// A slow seeding iterator must not let the scope finish early. Helpers start draining as soon
    /// as the first item lands, so between two yields of the iterator the queue can be empty and
    /// every dispatched item already done — `remaining_tasks` would hit zero and close the queue
    /// with seeds still to come, silently dropping them.
    ///
    /// The sleep between yields makes that window near-certain rather than a rare interleaving.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_slow_seeding_iterator_completes() {
        const SEEDS: usize = 16;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            // Each `next()` blocks briefly, so helpers drain the queue to empty before the next
            // seed arrives.
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

    /// `ControlFlow::Break` abandons the queued-but-unstarted items: the scope must terminate
    /// having run far fewer than the seeded items.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_unbounded_abort_skips_queue() {
        const ITEMS: usize = 10_000;
        let processed = Arc::new(AtomicUsize::new(0));
        let processed_clone = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..ITEMS, move |_spawner, _item| {
                let n = processed_clone.fetch_add(1, Ordering::SeqCst);
                // Items already dispatched to other drainers still complete, so the final count is
                // "a bit more than 1", not exactly 1.
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

    /// Aborting in the middle of a deep, still-growing cascade must terminate rather than hang:
    /// `abort` discharges a whole batch of `remaining_tasks` at once while other drainers are
    /// concurrently spawning. A hang here surfaces as a test timeout.
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

    /// A panic aborts the scope: the queued-but-unstarted items are abandoned rather than run.
    ///
    /// The first item panics, so with a large seed set almost nothing else should be dispatched.
    /// Items already picked up by another drainer still complete, so the bound is "far fewer than
    /// seeded" rather than exactly one.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_panic_abandons_queue() {
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
        }));
        result.expect_err("the panic must propagate");
        let count = processed.load(Ordering::SeqCst);
        assert!(
            count < ITEMS,
            "a panic must abandon the queue, but all {ITEMS} items ran"
        );
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

    // -----------------------------------------------------------------------
    // scope_unbounded_with (fold results)
    // -----------------------------------------------------------------------

    /// Every item's contribution must survive the fold, across however many drainers ran. Uses a
    /// cascade so work is spread over helpers rather than all landing on the calling thread.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_with_sums_every_item() {
        const SEEDS: usize = 64;
        const CHILDREN: usize = 16;
        let total = tokio::task::spawn_blocking(|| {
            scope_unbounded_with(
                0..SEEDS,
                || 0usize,
                |spawner, item, acc| {
                    *acc += 1;
                    // Each seed fans out; children are tagged above the seed range.
                    if item < SEEDS {
                        for i in 0..CHILDREN {
                            spawner.spawn(SEEDS + i);
                        }
                    }
                    ControlFlow::Continue(())
                },
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        // Every seed plus every spawned child is counted exactly once.
        assert_eq!(total, SEEDS + SEEDS * CHILDREN);
    }

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

    /// On a `current_thread` runtime there are no helpers, so the calling thread is the only
    /// drainer and the fold must still produce the complete result.
    #[tokio::test(flavor = "current_thread")]
    async fn test_unbounded_with_current_thread_runtime() {
        let total = tokio::task::spawn_blocking(|| {
            scope_unbounded_with(
                0..16usize,
                || 0usize,
                |spawner, item, acc| {
                    *acc += 1;
                    if item < 4 {
                        spawner.spawn(100 + item);
                    }
                    ControlFlow::Continue(())
                },
                |a, b| a + b,
            )
        })
        .await
        .unwrap();
        assert_eq!(total, 20);
    }

    /// The join must not reach `block_in_place` when there are no helpers to await.
    ///
    /// Called **directly** on a `current_thread` runtime rather than through `spawn_blocking`:
    /// `block_in_place` panics outside a multi-thread runtime, so if `Joiner::drop` ever stopped
    /// gating on an empty helper set this test would panic rather than merely be slow. The other
    /// `current_thread` tests wrap the call in `spawn_blocking`, where `block_in_place` is allowed,
    /// so they cannot catch that regression.
    #[tokio::test(flavor = "current_thread")]
    async fn test_unbounded_current_thread_never_blocks_in_place() {
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

    /// A panic must still propagate through the fold path, and must not deadlock the join now that
    /// drainers merge after their loop.
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
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_with_borrowed_accumulator() {
        let label = String::from("item");
        let count = tokio::task::spawn_blocking(move || {
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
        })
        .await
        .unwrap();
        assert_eq!(count, 32);
    }
}
