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
    time::Duration,
};

use fixedbitset::FixedBitSet;
use parking_lot::{Condvar, Mutex, RwLock};
use tokio::{runtime::Handle, task::block_in_place};
use tracing::{Span, info_span};

use crate::{manager::try_turbo_tasks, turbo_tasks_scope};

/// How long a helper thread waits on an empty queue before releasing its runtime worker.
///
/// 5ms is a guess, we expect most tasks to be very fast so if there is nothing scheduled we should
/// release the thread, but we don't want to do it too eagerly to account for bursty task
/// production.
const HELPER_IDLE_TIMEOUT: Duration = Duration::from_millis(5);

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
    fn drain(&self, is_helper: bool);
    /// Take ownership of `slot`'s release, which [`spawn_helper_if_needed`] has already claimed.
    ///
    /// Exists on the trait so a spawned helper can build its guard without naming `R`.
    fn enter_helper(&self, slot: usize) -> HelperGuard<'_>;
}

impl<T: Send + 'static, R> Drainable for UnboundedInner<'_, T, R> {
    fn drain(&self, is_helper: bool) {
        UnboundedInner::drain(self, is_helper)
    }

    fn enter_helper(&self, slot: usize) -> HelperGuard<'_> {
        HelperGuard {
            slots: &self.helper_slots,
            helpers_done: &self.helpers_done,
            slot,
        }
    }
}

/// Fixed table of live helper slots, indexed by slot number, with a bitset of which are occupied.
///
/// This is both the spawn budget and the join set: a slot is occupied from before its helper task
/// exists until after that helper's last access to the caller's frame, so an empty `occupied` is
/// exactly the condition [`Joiner::drop`] needs. See [`UnboundedInner::helper_slots`] for why one
/// field can answer both questions.
struct HelperSlots {
    /// `Some` for a live helper, `None` for a free slot or one whose handle has been aborted and
    /// dropped. Length is the cap and never changes, so a slot index stays valid for the whole
    /// scope.
    handles: Vec<Option<tokio::task::AbortHandle>>,
    /// Bit `i` set means slot `i` is occupied — claimed by [`Self::occupy`] and not yet released
    /// by a [`HelperGuard`].
    ///
    /// This tracks *occupancy*, not handle presence: [`Joiner::drop`] aborts and drops every
    /// handle while leaving the bitset alone, because it is the join predicate and only a
    /// guard may clear a bit.
    occupied: FixedBitSet,
}

impl HelperSlots {
    /// Table sized for `max_helpers` (`runtime workers - 1`).
    fn new(max_helpers: usize) -> Self {
        Self {
            handles: vec![None; max_helpers],
            occupied: FixedBitSet::with_capacity(max_helpers),
        }
    }

    /// Index of the lowest free slot, or `None` when every slot is occupied (the budget is full).
    ///
    /// `zeroes()` only yields bits within the set's capacity, so a saturated table yields nothing.
    fn free_slot(&self) -> Option<usize> {
        self.occupied.zeroes().next()
    }

    /// Record a newly spawned helper in `slot`, which must have come from [`Self::free_slot`].
    ///
    /// Never overwrites a live handle: a slot stays occupied until its [`HelperGuard`] releases it,
    /// so `free_slot` cannot hand out one whose helper might still touch the caller's frame. Were
    /// that not so, [`Joiner::drop`] could abort a replacement instead of that helper.
    fn occupy(&mut self, slot: usize, handle: tokio::task::AbortHandle) {
        debug_assert!(
            !self.occupied.contains(slot),
            "slot {slot} already occupied"
        );
        self.occupied.insert(slot);
        let previous = self.handles[slot].replace(handle);
        debug_assert!(previous.is_none(), "slot {slot} held a live handle");
    }

    /// Free `slot` as its helper finishes, so a later spawn can reuse it. Dropping the handle here
    /// is what keeps the finished task's allocation from outliving the helper.
    ///
    /// Called only from [`HelperGuard::drop`], so "released" always means "done with the frame".
    fn release(&mut self, slot: usize) {
        self.occupied.remove(slot);
        self.handles[slot] = None;
    }

    /// Whether every slot is free, i.e. no helper can still touch the caller's frame. The predicate
    /// [`Joiner::drop`] waits on.
    fn is_idle(&self) -> bool {
        self.occupied.is_clear()
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
    /// Live helper slots: the abort handle of every helper that has been spawned and whose
    /// [`HelperGuard`] has not yet run.
    ///
    /// This single field answers both *"may I spawn?"* and *"may I free the caller's frame?"*.
    /// Both rest on **when** a slot is occupied and released:
    ///
    /// - **Occupied** by [`spawn_helper_if_needed`], on the spawning thread, under this lock, and
    ///   *before* `Handle::spawn` — so a slot exists before its task can possibly be polled. It
    ///   must not instead be claimed by the helper on entry to [`UnboundedInner::drain`]: between
    ///   tokio claiming the task for polling and that claim becoming visible, the task is neither
    ///   cancellable (`drain` is synchronous, so `abort` has no await point to act on) nor
    ///   counted, and a joiner reading the table in that window frees the frame out from under it.
    /// - **Released** by [`HelperGuard::drop`], which is strictly after every access the helper
    ///   makes to `run`/`init`/`merge`, and runs on the cancellation and unwind paths too.
    ///
    /// So the occupancy interval strictly contains the frame-access interval, with no gap at
    /// either end, and `is_idle()` means *no task can still touch the frame*.
    ///
    /// The calling thread needs no slot. [`Joiner::drop`] runs its own `drain(false)` to
    /// completion before it ever waits, so the caller's frame accesses are all in the past by
    /// then and could never contribute to the predicate.
    ///
    /// A `Mutex` rather than a `JoinSet` because respawn happens from [`enqueue`], which holds
    /// `&self`, while `JoinSet::spawn_on` needs `&mut self`. The lock is taken once per helper
    /// spawn or exit — bounded by re-arms, not by items — so it is off the hot path, unlike
    /// the sender lock.
    ///
    /// Being a `Mutex` is also what makes the join's condvar sound: `occupied` empties under this
    /// same lock that [`HelperGuard::drop`] notifies under, so the predicate cannot flip between
    /// the joiner's check and its `wait`. Waiting on *task completion* instead would be a lost
    /// wakeup waiting to happen: `AbortHandle::is_finished` flips outside any lock we hold.
    ///
    /// The table needs no "closed" state. Nothing reads it after [`Joiner::drop`] returns, and
    /// nothing can spawn into it once that join begins: the work queue is closed by then, and
    /// [`spawn_helper_if_needed`] is reached only after a *successful* send.
    helper_slots: Mutex<HelperSlots>,
    /// Runtime handle used to spawn replacement helpers from [`enqueue`].
    handle: Handle,
    /// Span replacement helpers enter, so respawned work stays attached to the caller's trace.
    span: Span,
    /// Woken when the last helper slot is released, so the joining thread can park instead of
    /// spinning. Paired with `helper_slots`: both the predicate (`is_idle()`) and the notify
    /// are under that one lock, which is what rules out a lost wakeup.
    helpers_done: Condvar,
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

/// Releases a helper's slot — claimed by [`spawn_helper_if_needed`] before the spawn — and wakes
/// [`Joiner::drop`] when it is the last one. See [`UnboundedInner::helper_slots`] for why the two
/// halves sit on opposite sides of the spawn.
///
/// A guard rather than a statement at the end of [`UnboundedInner::drain`], because the slot must
/// be released even when `drain` never runs: `Joiner::drop` aborts every live handle, and a task
/// tokio has not yet polled is dropped without its body executing. The spawned future owns this
/// guard, so dropping the future releases the slot, and cancelled and completed helpers need not be
/// told apart. It also covers an unwind out of `drain`, which the per-closure `catch_unwind`s there
/// should already prevent.
struct HelperGuard<'a> {
    slots: &'a Mutex<HelperSlots>,
    helpers_done: &'a Condvar,
    slot: usize,
}

impl Drop for HelperGuard<'_> {
    fn drop(&mut self) {
        let mut slots = self.slots.lock();
        slots.release(self.slot);
        if slots.is_idle() {
            // Still holding the lock: the predicate the joiner waits on is `!is_idle()`, read
            // under this same lock, so it cannot go true between its check and its `wait`.
            self.helpers_done.notify_all();
        }
    }
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

    /// Drain loop, run by both helpers and the calling thread until the scope terminates.
    ///
    /// The accumulator lives on this thread's stack for the whole loop and is merged into the
    /// shared slot once, at the end — so `run` can accumulate without touching shared state per
    /// item.
    ///
    /// The asymmetry between the two callers is load-bearing:
    ///
    /// - A helper (`is_helper`) exits after [`HELPER_IDLE_TIMEOUT`] on an empty queue, handing the
    ///   worker back and freeing its slot for a future respawn. Helpers are a pure optimization, so
    ///   leaving early can only cost throughput.
    /// - The calling thread (`!is_helper`) blocks until the queue closes and holds no slot. It is
    ///   the correctness anchor: *someone* must drain the queue to completion, and only it is
    ///   guaranteed to be running.
    fn drain(&self, is_helper: bool) {
        // Per drainer accumulator, lazily allocated
        let mut acc: Option<R> = None;
        while let Some(item) = if is_helper {
            self.work_queue.recv_timeout(HELPER_IDLE_TIMEOUT).ok()
        } else {
            self.work_queue.recv().ok()
        } {
            // Post-abort: discard without running, so the wind-down can't re-grow the queue.
            if self.aborted.load(Ordering::Acquire) {
                self.on_item_finished(None);
                continue; // drain the rest of the buffer
            }
            let spawner = Scope { inner: self };
            // `init` must be inside the `catch_unwind`: it is user code, and it runs before this
            // item's `on_item_finished`. An unwind past that decrement would strand the item —
            // `remaining_tasks` never reaches zero, the queue never closes, and the calling
            // thread's `recv()` blocks forever.
            let result = catch_unwind(AssertUnwindSafe(|| {
                let acc = acc.get_or_insert_with(self.init);
                (self.run)(&spawner, item, acc)
            }));
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

        // Fold this drainer's accumulator into the shared results slot. This is the last access to
        // the caller's frame, and a helper's `HelperGuard` releases its slot just after — which is
        // what publishes this merge to the joiner, since both happen under `helper_slots`.
        //
        // `merge` is caught because an escaping panic has nowhere good to go: on a helper it would
        // be swallowed at the task boundary, silently dropping these results, and on the
        // calling thread `drain` runs from `Joiner::drop`, where unwinding during an unwind
        // aborts the process.
        if let Some(acc) = acc {
            let merged = catch_unwind(AssertUnwindSafe(|| {
                let mut results = self.results.lock();
                *results = Some(match results.take() {
                    Some(existing) => (self.merge)(existing, acc),
                    None => acc,
                });
            }));
            if let Err(panic) = merged {
                let mut slot = self.panic.lock();
                if slot.is_none() {
                    *slot = Some(panic);
                }
            }
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

impl<T: Send + 'static, R: Send> Scope<'_, T, R> {
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
fn enqueue<T: Send + 'static, R: Send>(inner: &UnboundedInner<'_, T, R>, item: T) {
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
        return;
    }
    // The item is queued; make sure someone is around to take it. No-op in the common case
    // (helpers all live), so this is one relaxed load on the hot path.
    spawn_helper_if_needed(inner);
}

/// Re-arm one helper if the scope is running below its worker budget.
///
/// Called from [`enqueue`] after an item lands, which is the only moment new parallelism can become
/// useful. Spawns at most one per call, so a burst of `n` spawns re-arms up to `n` helpers without
/// any one caller paying for the whole ramp.
///
/// A timing-out helper keeps its slot until its [`HelperGuard`] drops, so an `enqueue` in that
/// window reads the budget as full and declines to replace it. That costs throughput on a rare
/// interleaving but never hangs: the item waits for another drainer, worst case the calling thread,
/// which never times out. Releasing the slot earlier is not an option — occupancy is what
/// [`Joiner::drop`] joins on, so a slot must be held as long as it is unsafe to reuse, not merely
/// as long as it is useful.
fn spawn_helper_if_needed<T: Send + 'static, R: Send>(inner: &UnboundedInner<'_, T, R>) {
    // Cheap reject: nothing worth doing once the scope is winding down. (A current-thread runtime
    // needs no check of its own — its slot table is empty, so `free_slot` below always declines.)
    if inner.aborted.load(Ordering::Acquire) {
        return;
    }

    // SAFETY: `Joiner::drop` waits for every helper slot to be released before returning, and the
    // slot for this helper is claimed below under the table lock *before* the spawn, so no erased
    // reference can outlive `'env` or the `inner` stack slot.
    let erased: &(dyn Drainable + Send + Sync + '_) = inner;
    let erased: &'static (dyn Drainable + Send + Sync + 'static) = unsafe {
        std::mem::transmute::<
            &(dyn Drainable + Send + Sync + '_),
            &'static (dyn Drainable + Send + Sync + 'static),
        >(erased)
    };

    // Claim the slot and publish the handle under one lock acquisition: that makes them atomic
    // against a concurrent `enqueue` racing for the last slot, and against `Joiner::drop` reading
    // the table, so no task can exist with no slot claimed.
    let mut slots = inner.helper_slots.lock();
    // Full: every worker this scope may use is already occupied. Declining is correct — the item is
    // queued and a live helper will reach it, worst case the calling thread, which drains to
    // completion.
    let Some(slot) = slots.free_slot() else {
        return;
    };
    let span = inner.span.clone();
    // Keep only the abort handle; the join is on slot occupancy, never on the task itself.
    //
    // `enter_helper` runs *inside* the future so the guard is owned by it, which is what covers
    // cancellation before the first poll. Hence `occupy` below runs here rather than in the task.
    let handle = inner
        .handle
        .spawn(async move {
            let _span = span.entered();
            let _guard = erased.enter_helper(slot);
            erased.drain(true);
        })
        .abort_handle();
    slots.occupy(slot, handle);
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
        helper_slots: Mutex::new(HelperSlots::new(worker_tasks)),
        handle: handle.clone(),
        span: span.clone(),
        helpers_done: Condvar::new(),
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
    }
    impl<T: Send + 'static, R> Drop for Joiner<'_, '_, T, R> {
        fn drop(&mut self) {
            // Decrement the pseudo task used to bootstrap the initial loop.
            self.inner.on_item_finished(None);
            // Help to drain the queue, this will block until all tasks are processed and the Sender
            // is dropped.
            self.inner.drain(false);

            // Everything below is about lifetimes, not work: `run`/`init`/`merge` point into this
            // frame, so no helper may dereference them after we return. The condition is exactly
            // "every helper slot is free" — see `helper_slots`.
            //
            // No new helper can appear from here on, and nothing needs doing to ensure that: the
            // queue is closed (`drain(false)` above only returns once `recv` fails, i.e. once the
            // sole sender is dropped, and nothing restores it), and `spawn_helper_if_needed` is
            // reached only after a successful send. So the tasks that can still touch this frame
            // are exactly those `occupied` records now, and that set only shrinks.
            //
            // Aborting each live handle is what keeps the wait short: a task tokio has not yet
            // polled never runs its body, and dropping its future releases the slot.
            // One already being polled cannot be preempted (`drain` is synchronous, so
            // there is no await point), but it needs no help — the closed queue makes
            // its `recv` fail and it finishes on the thread it already holds. So the
            // join never waits for the scheduler to *start* a helper, which is
            // what would deadlock a runtime with no thread to spare.
            //
            // The abort's outcome is deliberately not inspected: cancelled and completed helpers
            // both release through the same guard.
            let _span = info_span!("blocking: waiting for scope to end").entered();
            let handles: Vec<_> = {
                let mut slots = self.inner.helper_slots.lock();
                // Take the handles but leave `occupied` alone: it is the join predicate, and only a
                // `HelperGuard` may clear a bit. The table keeps its length, so a guard's
                // `handles[slot] = None` stays in bounds.
                slots.handles.iter_mut().filter_map(Option::take).collect()
            };

            // Abort *outside* the lock: `abort()` on a task the scheduler has not yet claimed can
            // drop its future inline on this thread, running `HelperGuard::drop`, which
            // takes `helper_slots` — a self-deadlock if we still held it.
            for handle in handles {
                handle.abort();
            }

            let mut slots = self.inner.helper_slots.lock();
            // `block_in_place` hands our worker back while parked so the runtime keeps making
            // progress. It panics on a current-thread runtime, which is safe here only because such
            // a runtime has a zero-length slot table and so is always already idle.
            if !slots.is_idle() {
                block_in_place(|| {
                    while !slots.is_idle() {
                        self.inner.helpers_done.wait(&mut slots);
                    }
                });
            }
        }
    }

    // Arm the guard before anything can spawn, so a helper can never outlive the join.
    let joiner = Joiner { inner: &inner };

    // Count the seeding loop itself as one outstanding item, so an interleaving where every
    // dispatched seed finishes before the iterator yields the next one cannot drive
    // `remaining_tasks` to zero and close the queue with seeds still to come.
    //
    // Discharged by `Joiner::drop`, which is why the guard is armed *above* this increment: a panic
    // out of the iterator's `next()` then unwinds through a live guard, which discharges the count
    // and closes the queue. Reversed, that unwind would strand the placeholder and park the
    // joiner's own `recv` forever.
    inner.remaining_tasks.fetch_add(1, Ordering::Relaxed);
    for item in initial {
        enqueue(&inner, item);
    }

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
    #[test]
    fn test_unbounded_tree() {
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
        with_runtime(4, move || {
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
        });

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
    ///
    /// Runs under Miri (see [`with_runtime`]): the borrowed `label` and the accumulator both live
    /// in the calling frame, so a join that returned while a helper still held them would be
    /// reported here as a use-after-free rather than passing silently.
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
    // helper shrink / respawn tests
    //
    // `init` runs once per drainer that receives an item, so counting `init` calls counts
    // *distinct drainer lifetimes*. That is the only externally visible signal that a helper
    // exited and a later one replaced it.
    // -----------------------------------------------------------------------

    /// A drainer that goes idle past `HELPER_IDLE_TIMEOUT` releases its worker, and a later
    /// `spawn` re-arms one. Both halves are observed through the `init` count: the scope processes
    /// two items separated by a long gap, so a single persistent drainer would yield 1 `init`,
    /// while shrink-then-respawn yields more.
    ///
    /// Serialized by construction (one item in flight at a time), so the count is deterministic
    /// rather than timing-dependent: the gap is many multiples of the timeout.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_helper_respawns_after_idle_timeout() {
        let inits = Arc::new(AtomicUsize::new(0));
        let counted = inits.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded_with(
                std::iter::once(0usize),
                move || {
                    counted.fetch_add(1, Ordering::SeqCst);
                },
                |spawner, item, ()| {
                    if item == 0 {
                        // Idle the queue well past the timeout so every *other* drainer exits,
                        // then produce work again. The respawn path is the only way a fresh
                        // drainer can pick this up.
                        thread::sleep(HELPER_IDLE_TIMEOUT * 20);
                        spawner.spawn(1);
                    }
                    ControlFlow::Continue(())
                },
                |(), ()| (),
            )
        })
        .await
        .unwrap();
        // Both items ran (the scope only returns once the queue is drained), and at least one
        // drainer built an accumulator. The exact count depends on which drainer wins each item.
        let count = inits.load(Ordering::SeqCst);
        assert!(
            (1..=2).contains(&count),
            "expected 1-2 drainer lifetimes, got {count}"
        );
    }

    /// Helpers are not spawned for a scope that never has queued work: an empty `initial` must not
    /// occupy a worker.
    ///
    /// No drainer builds an accumulator, so the single `init` call observed here is the one
    /// `scope_unbounded_with` makes at the end to produce the fold's identity — not a drainer
    /// lifetime.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_empty_spawns_no_helpers() {
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

    /// Sustained work keeps helpers alive rather than churning them: with a queue that never
    /// empties, drainer lifetimes must stay bounded by the worker count instead of growing with
    /// the item count.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_busy_queue_does_not_churn_helpers() {
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
        // 4 workers => at most 3 helpers + the calling thread. A churning implementation would
        // produce far more lifetimes than this.
        let count = inits.load(Ordering::SeqCst);
        assert!(
            count <= 4,
            "a queue that never empties should not churn drainers, got {count} lifetimes"
        );
    }

    /// A helper that is spawned but never polled must still be joined, not merely aborted.
    ///
    /// Every runtime worker is held busy until after the scope returns, so a helper spawned by
    /// `enqueue` cannot be polled while the scope is live — it is cancelled instead, and its slot
    /// must still be accounted for and released when its future drops.
    ///
    /// A join that instead waited on a counter incremented inside `drain` would read zero here and
    /// return early, freeing the caller's frame under a live helper. That is invisible in an
    /// unsanitized run, so this test is built to run under Miri (no I/O driver), where the
    /// freed-frame access is reported.
    #[test]
    fn test_unbounded_unpolled_helper_is_joined() {
        // Built by hand rather than via `with_runtime`: this test drives blockers concurrently with
        // the scope, so it needs the runtime handle itself.
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(3)
            .enable_time()
            .build()
            .unwrap();
        runtime.block_on(async {
            // Occupy the workers so no helper the scope spawns can run, and release them only after
            // the scope has returned, so the block outlives the join.
            //
            // A latch rather than a `Barrier`: a barrier would make the blockers wait for an
            // arrival from this task, but with every worker occupied there may be no
            // thread left to poll this future, so that arrival can never come and the
            // test deadlocks itself. Waiting on a store instead lets the
            // `spawn_blocking` thread below always release them.
            let release = Arc::new(AtomicBool::new(false));
            let mut blockers = Vec::new();
            for _ in 0..2 {
                let release = release.clone();
                blockers.push(tokio::spawn(async move {
                    tokio::task::block_in_place(|| {
                        while !release.load(Ordering::Acquire) {
                            thread::yield_now();
                        }
                    });
                }));
            }
            // Give the blockers time to actually claim their workers.
            tokio::time::sleep(Duration::from_millis(50)).await;

            let processed = Arc::new(AtomicUsize::new(0));
            let counted = processed.clone();
            let released = release.clone();
            let scope = tokio::task::spawn_blocking(move || {
                // Each item spawns one child, so `enqueue` tries to re-arm helpers repeatedly while
                // every worker is unavailable.
                scope_unbounded(0..64usize, move |spawner, item| {
                    counted.fetch_add(1, Ordering::SeqCst);
                    if item < 64 {
                        spawner.spawn(1000 + item);
                    }
                    ControlFlow::Continue(())
                });
                // Freeing the workers from this thread — not from the async block — is what keeps
                // the test independent of whether anything is left to poll the outer future.
                released.store(true, Ordering::Release);
                processed.load(Ordering::SeqCst)
            });

            // The calling thread is the only drainer, and it must finish all the work regardless.
            let count = scope.await.unwrap();
            assert_eq!(
                count, 128,
                "the calling thread must drain everything even when no helper can run"
            );

            for blocker in blockers {
                blocker.await.unwrap();
            }
        });
    }

    /// A panic in `merge` must propagate rather than deadlock or be swallowed.
    ///
    /// `merge` runs after the drain loop, outside the per-item `catch_unwind` that guards `run`,
    /// and on the calling thread it runs from inside `Joiner::drop` — so an unguarded panic
    /// would vanish at a helper's task boundary, or abort the process mid-unwind on the caller.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_merge_panic_propagates() {
        let result = tokio::task::spawn_blocking(|| {
            catch_unwind(AssertUnwindSafe(|| {
                scope_unbounded_with(
                    0..256usize,
                    || 0usize,
                    |_spawner, _item, acc: &mut usize| {
                        *acc += 1;
                        ControlFlow::Continue(())
                    },
                    // Only reached when two drainers both accumulated, which the wide seed set
                    // over 4 workers makes overwhelmingly likely.
                    |_a, _b| panic!("Intentional merge panic"),
                )
            }))
        })
        .await
        .unwrap();
        // Either the merge ran and its panic propagated, or only one drainer ever accumulated so
        // `merge` was never called. Both are correct; a hang or an abort is not.
        match result {
            Err(err) => assert_eq!(
                err.downcast_ref::<&str>(),
                Some(&"Intentional merge panic"),
                "unexpected panic payload"
            ),
            Ok(total) => assert_eq!(total, 256, "single-drainer run must still count every item"),
        }
    }

    /// A panic in `init` must propagate rather than hang the scope.
    ///
    /// `init` runs before the item's `on_item_finished`, so an unwind that escaped the per-item
    /// `catch_unwind` would leave that item outstanding forever: `remaining_tasks` never reaches
    /// zero, the queue never closes, and the calling thread's `recv()` blocks for good. A
    /// timeout here means `init` has fallen back outside the guard.
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_init_panic_propagates() {
        let result = tokio::task::spawn_blocking(|| {
            catch_unwind(AssertUnwindSafe(|| {
                scope_unbounded_with(
                    0..256usize,
                    || -> usize { panic!("Intentional init panic") },
                    |_spawner, _item, acc: &mut usize| {
                        *acc += 1;
                        ControlFlow::Continue(())
                    },
                    |a, b| a + b,
                )
            }))
        })
        .await
        .unwrap();
        let err = result.expect_err("the init panic must propagate");
        assert_eq!(err.downcast_ref::<&str>(), Some(&"Intentional init panic"));
    }

    /// The respawn path must not resurrect a scope that is winding down: after an abort, `spawn`
    /// drops items and no new helper may be created (its handle could outlive the join).
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_unbounded_no_respawn_after_abort() {
        let processed = Arc::new(AtomicUsize::new(0));
        let counted = processed.clone();
        tokio::task::spawn_blocking(move || {
            scope_unbounded(0..1000usize, move |spawner, item| {
                counted.fetch_add(1, Ordering::SeqCst);
                if item == 0 {
                    // Abort, then keep trying to grow the pool. Every one of these must be
                    // dropped without spawning a helper.
                    for i in 0..100 {
                        spawner.spawn(10_000 + i);
                    }
                    return ControlFlow::Break(());
                }
                ControlFlow::Continue(())
            });
        })
        .await
        .unwrap();
        // The post-abort spawns were dropped; only pre-abort work could have run.
        assert!(
            processed.load(Ordering::SeqCst) < 1000,
            "abort must abandon the queue"
        );
    }
}
