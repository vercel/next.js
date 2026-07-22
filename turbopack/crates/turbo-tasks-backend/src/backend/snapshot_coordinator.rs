//! Coordinator that gates concurrent operations against snapshotting and garbage collection.
//!
//! Backend operations, snapshot work, and garbage collection share a single
//! [`SnapshotCoordinator`] that enforces the protocol:
//!
//! - When neither a snapshot nor a GC pass is in flight,
//!   [`begin_operation`](SnapshotCoordinator::begin_operation) is a single uncontended atomic
//!   increment.
//! - When a snapshot or GC pass is requested, new operations block until it finishes, and
//!   operations already in flight either complete or call
//!   [`suspend_point`](SnapshotCoordinator::suspend_point) to suspend.
//! - The snapshotter / collector waits for every in-flight operation to drain or suspend, does its
//!   work, then wakes everyone.
//!
//! Snapshots and GC use two distinct request bits ([`SNAPSHOT_REQUESTED_BIT`] and
//! [`GC_REQUESTED_BIT`]) so they can be reasoned about independently — a snapshot's exclusion is
//! never interrupted, whereas a GC pass may abort mid-mark. Operations drain/suspend for either
//! bit. Snapshots and GC are themselves mutually exclusive; callers serialize them with the
//! `snapshot_in_progress` mutex in `mod.rs` (the coordinator does not own that mutex).

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use parking_lot::{Condvar, Mutex};
use rustc_hash::FxHashSet;
use tracing::info_span;

use crate::{backend::AnyOperation, utils::ptr_eq_arc::PtrEqArc};

/// Top bit: set while a snapshot is requested or in flight.
const SNAPSHOT_REQUESTED_BIT: usize = 1 << (usize::BITS - 1);
/// Second-from-top bit: set while a garbage-collection pass is requested or in flight.
const GC_REQUESTED_BIT: usize = 1 << (usize::BITS - 2);
/// Mask of all "exclusion requested" bits. Operations must drain/suspend while any is set.
/// The remaining low bits hold the count of operations currently executing (not suspended).
const REQUEST_BITS: usize = SNAPSHOT_REQUESTED_BIT | GC_REQUESTED_BIT;

/// Whether an `in_progress_operations` value represents a fully-drained state that a waiting
/// snapshotter/collector should be woken for: at least one request bit is set (someone is waiting
/// to drain) and the operation count (low bits) has reached zero.
#[inline]
fn is_drained(value: usize) -> bool {
    (value & REQUEST_BITS) != 0 && (value & !REQUEST_BITS) == 0
}

/// State protected by the mutex.
struct State<O> {
    /// `true` between `begin_snapshot` and `SnapshotPhase::drop`.
    snapshot_requested: bool,
    /// `true` between `begin_gc` and `GcPhase::drop`.
    gc_requested: bool,
    /// Operations that called [`SnapshotCoordinator::suspend_point`] and have
    /// not yet resumed. Returned to the snapshotter via
    /// [`SnapshotPhase::suspended_operations`] so it can persist them in the
    /// uncompleted-operations log.
    suspended_operations: FxHashSet<PtrEqArc<O>>,
}

/// Coordinates operation/snapshot/GC interleaving.
///
/// Generic over the operation type the caller wants to suspend. The
/// coordinator only requires `O: Send + Sync + 'static`; it never inspects
/// the value, just stores it via [`PtrEqArc`].
pub struct SnapshotCoordinator<O = AnyOperation> {
    /// Combined count + request bits. See [`SNAPSHOT_REQUESTED_BIT`], [`GC_REQUESTED_BIT`].
    in_progress_operations: AtomicUsize,
    state: Mutex<State<O>>,
    /// Notified by the last operation to drain (count drops to zero while a request bit is set).
    /// Awaited by [`begin_snapshot`] and [`begin_gc`].
    operations_drained: Condvar,
    /// Notified by [`SnapshotPhase::drop`] and [`GcPhase::drop`]. Awaited by operations that hit a
    /// suspend point or arrive while a snapshot or GC pass is in flight. Operations wait while
    /// either `snapshot_requested` or `gc_requested` holds.
    exclusion_completed: Condvar,
}

impl<O> Default for SnapshotCoordinator<O> {
    fn default() -> Self {
        Self::new()
    }
}

impl<O> SnapshotCoordinator<O> {
    pub fn new() -> Self {
        Self {
            in_progress_operations: AtomicUsize::new(0),
            state: Mutex::new(State {
                snapshot_requested: false,
                gc_requested: false,
                suspended_operations: FxHashSet::default(),
            }),
            operations_drained: Condvar::new(),
            exclusion_completed: Condvar::new(),
        }
    }

    /// Cheap check used by hot paths. Returns `true` while a snapshot or GC pass is in flight (or
    /// being requested). May return `false` racily if one is just about to start; the actual
    /// coordination happens in [`suspend_point`](Self::suspend_point) and
    /// [`begin_operation`](Self::begin_operation).
    pub fn exclusion_pending(&self) -> bool {
        // Acquire so that observing a request bit synchronizes with anything the snapshotter /
        // collector wrote before setting it.
        (self.in_progress_operations.load(Ordering::Acquire) & REQUEST_BITS) != 0
    }

    /// Whether a GC phase is currently held (the `GC_REQUESTED_BIT` is set). Used by the GC-only
    /// execute context to `debug_assert` it is running under the exclusion it requires.
    pub fn gc_in_progress(&self) -> bool {
        (self.in_progress_operations.load(Ordering::Acquire) & GC_REQUESTED_BIT) != 0
    }

    /// Begin an operation. Returns a guard that decrements on drop.
    ///
    /// If a snapshot or GC pass is in flight, blocks until it finishes before returning the guard.
    pub fn begin_operation(&self) -> OperationGuard<'_, O> {
        // Fast path: no snapshot or GC in flight, single atomic increment.
        let prev = self.in_progress_operations.fetch_add(1, Ordering::AcqRel);
        if (prev & REQUEST_BITS) == 0 {
            return OperationGuard { coord: Some(self) };
        }
        #[cold]
        fn wait_for_exclusion_to_complete<O>(this: &SnapshotCoordinator<O>) {
            // We arrive here holding our +1 (the fetch_add in begin_operation).
            // Two cases:
            //   - A snapshot/GC pass is still in flight: back out our +1, wait for it to finish,
            //     then re-add. The drop balances the re-add.
            //   - It already finished between our fetch_add and acquiring this mutex: leave our +1
            //     in place; the drop balances it directly. No extra atomics needed.
            let mut state = this.state.lock();
            if state.snapshot_requested || state.gc_requested {
                let prev = this.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
                if is_drained(prev - 1) {
                    this.operations_drained.notify_all();
                }
                this.exclusion_completed
                    .wait_while(&mut state, |s| s.snapshot_requested || s.gc_requested);
                // Re-add now that the exclusion is done. Both bits are cleared because we just
                // observed both flags false under the mutex.
                this.in_progress_operations.fetch_add(1, Ordering::AcqRel);
            }
        }
        // Slow path: a snapshot or GC pass is in flight (or just requested). Back out the
        // increment, wait for it to complete, then re-increment.
        wait_for_exclusion_to_complete(self);
        OperationGuard { coord: Some(self) }
    }

    /// Suspend the current operation if a snapshot is requested. Otherwise a
    /// no-op. The closure is called only when actually suspending — it must
    /// produce a handle to this operation so the snapshotter can persist it
    /// for replay on the next startup.
    pub fn suspend_point(&self, suspend: impl FnOnce() -> O) {
        if !self.exclusion_pending() {
            return;
        }
        #[cold]
        fn suspend_point_cold<O>(this: &SnapshotCoordinator<O>, suspend: impl FnOnce() -> O) {
            let mut state = this.state.lock();
            if !state.snapshot_requested && !state.gc_requested {
                // Race: the snapshot/GC pass finished between the `exclusion_pending` check and
                // acquiring the mutex. Nothing to do.
                return;
            }
            // Record the suspended operation in the uncompleted-operations set unconditionally,
            // even when only a GC pass is in flight. A GC pass may hand its exclusion straight to a
            // snapshot (`GcPhase::into_snapshot`) without this operation resuming first; that
            // snapshot persists the operation's partial in-memory mutations, so it MUST also record
            // the operation for replay — otherwise a crash leaves the persisted graph inconsistent.
            // A standalone GC pass (ended via `GcPhase::Drop`, no snapshot) never persists, so the
            // recorded entry is simply never read; the cost of running `suspend()` there is
            // acceptable for the correctness guarantee.
            let op = Arc::new(suspend());
            state
                .suspended_operations
                .insert(PtrEqArc::from(op.clone()));
            // Decrement the count so the snapshotter / collector can drain.
            let prev = this.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
            // Protocol violation if either invariant fails. Keep as a regular
            // `assert!` so production builds also catch it: the alternative is
            // a corrupted counter that hangs the next snapshot/GC indefinitely.
            assert!(
                (prev & REQUEST_BITS) != 0 && (prev & !REQUEST_BITS) > 0,
                "suspend_point called without a live operation: prev={prev:#x}"
            );
            if is_drained(prev - 1) {
                this.operations_drained.notify_all();
            }
            // Wait for the snapshot / GC pass to finish.
            this.exclusion_completed
                .wait_while(&mut state, |s| s.snapshot_requested || s.gc_requested);
            // Resume: re-increment and remove ourselves from the suspended set.
            this.in_progress_operations.fetch_add(1, Ordering::AcqRel);
            state.suspended_operations.remove(&PtrEqArc::from(op));
        }
        suspend_point_cold(self, suspend);
    }

    /// Shared core of [`begin_snapshot`](Self::begin_snapshot) and [`begin_gc`](Self::begin_gc):
    /// asserts no snapshot or GC is already in flight, sets the requesting flag + request bit, and
    /// blocks until every in-flight operation has drained or suspended. Returns the still-held
    /// state lock so the caller can read `suspended_operations` (snapshot) before releasing it.
    ///
    /// `what` ("snapshot" / "gc") only labels the assertion messages and the drain span. Snapshot
    /// and GC are mutually exclusive; production callers serialize them via the
    /// `snapshot_in_progress` mutex in `mod.rs` (the coordinator doesn't own that mutex —
    /// callers interleave work between phases). The mutual-exclusion asserts are promoted from
    /// debug_assert because silently ignoring a violation leads straight to a stuck counter and
    /// a hung process.
    fn begin_exclusion(
        &self,
        what: Exclusion,
        set_requested: impl FnOnce(&mut State<O>),
    ) -> parking_lot::MutexGuard<'_, State<O>> {
        let request_bit = what.request_bit();
        let mut state = self.state.lock();
        assert!(
            !state.snapshot_requested && !state.gc_requested,
            "{} called while a {} was already in flight (snapshot and GC must be serialized)",
            what.begin_fn(),
            if state.snapshot_requested {
                "snapshot"
            } else {
                "GC pass"
            }
        );
        set_requested(&mut state);
        // AcqRel so the writes leading up to setting the bit are visible to the operation hot
        // path's Acquire load in `exclusion_pending`.
        let active = self
            .in_progress_operations
            .fetch_or(request_bit, Ordering::AcqRel);
        assert!(
            (active & request_bit) == 0,
            "{} request bit was already set when {} ran: {active:#x}",
            what.label(),
            what.begin_fn()
        );
        if (active & !REQUEST_BITS) != 0 {
            // Some operations are in flight. Wait for them to drain or suspend. The predicate is
            // Acquire-loaded so we synchronize with the AcqRel decrement that woke us. This can
            // block for a while under load (until every in-flight operation reaches a suspend point
            // or finishes), so it gets its own span for latency attribution.
            let num_operations = active & !REQUEST_BITS;
            let _span = match what {
                Exclusion::Snapshot => {
                    info_span!("snapshot: await operations settle", num_operations)
                }
                Exclusion::Gc => info_span!("gc: await operations settle", num_operations),
            }
            .entered();
            self.operations_drained.wait_while(&mut state, |_| {
                (self.in_progress_operations.load(Ordering::Acquire) & !REQUEST_BITS) != 0
            });
        }
        state
    }

    /// Begin a snapshot. Sets the snapshot bit, blocks until all in-flight
    /// operations have drained or suspended, and returns a [`SnapshotPhase`]
    /// guard that releases the bit on drop.
    ///
    /// Concurrent callers panic (see [`begin_exclusion`](Self::begin_exclusion)).
    pub fn begin_snapshot(&self) -> SnapshotPhase<'_, O> {
        let state = self.begin_exclusion(Exclusion::Snapshot, |s| s.snapshot_requested = true);
        // Snapshot ranges that follow can read the suspended_operations list; we read it while
        // still holding the lock, then release so the snapshotter does the heavy work
        // without it. Operations attempting to start during this window observe the bit set
        // and either suspend or wait on `exclusion_completed`.
        let suspended_operations: Vec<Arc<O>> = state
            .suspended_operations
            .iter()
            .map(|op| op.arc().clone())
            .collect();
        drop(state);
        SnapshotPhase {
            coord: self,
            suspended_operations,
        }
    }

    /// Begin a garbage-collection pass. Sets the GC bit, blocks until all in-flight operations have
    /// drained or suspended, and returns a [`GcPhase`] guard that releases the bit on drop. While
    /// the guard is held, no operation can be running, so the collector may mutate the task graph
    /// without racing.
    ///
    /// Concurrent callers panic (see [`begin_exclusion`](Self::begin_exclusion)).
    pub fn begin_gc(&self) -> GcPhase<'_, O> {
        let state = self.begin_exclusion(Exclusion::Gc, |s| s.gc_requested = true);
        drop(state);
        GcPhase { coord: self }
    }
}

/// Which kind of exclusion [`SnapshotCoordinator::begin_exclusion`] is starting. Selects the
/// request bit and the labels used in assertion messages and the drain span.
#[derive(Clone, Copy)]
enum Exclusion {
    Snapshot,
    Gc,
}

impl Exclusion {
    fn request_bit(self) -> usize {
        match self {
            Exclusion::Snapshot => SNAPSHOT_REQUESTED_BIT,
            Exclusion::Gc => GC_REQUESTED_BIT,
        }
    }

    /// Human label for the exclusion kind (used in the "bit already set" assert).
    fn label(self) -> &'static str {
        match self {
            Exclusion::Snapshot => "snapshot",
            Exclusion::Gc => "GC",
        }
    }

    /// Name of the public entry point, for assertion messages.
    fn begin_fn(self) -> &'static str {
        match self {
            Exclusion::Snapshot => "begin_snapshot",
            Exclusion::Gc => "begin_gc",
        }
    }
}

/// Guard returned by [`SnapshotCoordinator::begin_operation`]. Decrements the
/// in-progress count on drop and notifies the snapshotter if it is waiting.
pub struct OperationGuard<'a, O> {
    coord: Option<&'a SnapshotCoordinator<O>>,
}

impl<O> OperationGuard<'_, O> {
    /// A guard that does nothing on drop. Useful for backends that don't
    /// participate in the snapshot protocol (e.g. when persistence is
    /// disabled).
    pub fn noop() -> Self {
        Self { coord: None }
    }
}

impl<O> Drop for OperationGuard<'_, O> {
    fn drop(&mut self) {
        let Some(coord) = self.coord else {
            return;
        };
        let prev = coord.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
        // Underflow means a guard was dropped without a matching increment;
        // promoted from debug_assert because the alternative is silently
        // wrapping to usize::MAX and breaking every subsequent snapshot.
        assert!(
            (prev & !REQUEST_BITS) > 0,
            "OperationGuard::drop underflow: in_progress_operations was {prev:#x}"
        );
        if is_drained(prev - 1) {
            #[cold]
            fn notify_drained<O>(coord: &SnapshotCoordinator<O>) {
                // Take the state mutex around `notify_all`. This is defensive against
                // `parking_lot::Condvar::notify_all`'s fast path: it does a `Relaxed` load
                // on the condvar's internal `state` and short-circuits if it observes
                // null. A waiter publishes that `state` under parking_lot's bucket lock
                // (not under the user mutex), so a notifier that has never synchronized
                // with the user mutex can racily observe stale null and drop the notify.
                //
                // It is generally a best practice to only notify under the loc
                let _g = coord.state.lock();
                coord.operations_drained.notify_all();
            }
            notify_drained(coord);
        }
    }
}

/// Guard returned by [`SnapshotCoordinator::begin_snapshot`]. Holds the
/// snapshot bit; on drop, releases it and wakes any operations parked on
/// `snapshot_completed`.
pub struct SnapshotPhase<'a, O> {
    coord: &'a SnapshotCoordinator<O>,
    suspended_operations: Vec<Arc<O>>,
}

impl<O> SnapshotPhase<'_, O> {
    /// Operations that were suspended at the moment the snapshot started.
    /// The snapshotter must persist these so they can be replayed on the
    /// next startup.
    #[cfg(test)]
    pub fn suspended_operations(&self) -> &[Arc<O>] {
        &self.suspended_operations
    }

    /// Take ownership of the suspended-operations list.
    pub fn take_suspended_operations(&mut self) -> Vec<Arc<O>> {
        std::mem::take(&mut self.suspended_operations)
    }
}

impl<O> Drop for SnapshotPhase<'_, O> {
    fn drop(&mut self) {
        let mut state = self.coord.state.lock();
        state.snapshot_requested = false;
        let prev = self
            .coord
            .in_progress_operations
            .fetch_sub(SNAPSHOT_REQUESTED_BIT, Ordering::AcqRel);
        assert!(
            (prev & SNAPSHOT_REQUESTED_BIT) != 0,
            "SnapshotPhase::drop: snapshot bit was already cleared (prev={prev:#x})"
        );
        // Notify everyone waiting for the snapshot to finish under the
        // mutex (correctness against parking_lot's notify_all fast path).
        self.coord.exclusion_completed.notify_all();
    }
}

/// Guard returned by [`SnapshotCoordinator::begin_gc`]. Holds the GC bit; on drop, releases it and
/// wakes any operations parked on `exclusion_completed`.
pub struct GcPhase<'a, O> {
    coord: &'a SnapshotCoordinator<O>,
}

impl<'a, O> GcPhase<'a, O> {
    /// Atomically transitions from the GC phase directly into a snapshot phase **without ever
    /// releasing operation exclusion**. Under the state lock it clears the GC request bit and sets
    /// the snapshot request bit in one critical section, so no operation can start in between (an
    /// operation blocks while *either* bit is set). This closes the race where a mutation could
    /// resurrect a just-collected task in the gap between the GC pass and the snapshot: with an
    /// atomic hand-off there is no such gap, so the GC cascade's `parent_count` decrements and the
    /// snapshot see a consistent graph. `begin_gc` already drained operations to zero, so no
    /// further draining is needed.
    pub fn into_snapshot(self) -> SnapshotPhase<'a, O> {
        let coord = self.coord;
        // Do not run `GcPhase::Drop` — we are handing the exclusion off to the snapshot phase, not
        // releasing it. `forget` leaves the GC bit set; we clear it (and set the snapshot bit)
        // below under the lock.
        std::mem::forget(self);

        let mut state = coord.state.lock();
        debug_assert!(state.gc_requested, "into_snapshot: GC phase was not active");
        debug_assert!(
            !state.snapshot_requested,
            "into_snapshot: a snapshot was already in flight"
        );
        state.gc_requested = false;
        state.snapshot_requested = true;
        // Swap the bits atomically: clear GC, set snapshot, in one AcqRel RMW. Operations that
        // observe the value either before or after still see a request bit set, so none can start.
        let prev = coord.in_progress_operations.fetch_add(
            SNAPSHOT_REQUESTED_BIT.wrapping_sub(GC_REQUESTED_BIT),
            Ordering::AcqRel,
        );
        assert!(
            (prev & GC_REQUESTED_BIT) != 0 && (prev & SNAPSHOT_REQUESTED_BIT) == 0,
            "into_snapshot: unexpected request bits {prev:#x}"
        );
        debug_assert!(
            (prev & !REQUEST_BITS) == 0,
            "into_snapshot: operations in flight during hand-off {prev:#x}"
        );
        let suspended_operations: Vec<Arc<O>> = state
            .suspended_operations
            .iter()
            .map(|op| op.arc().clone())
            .collect();
        drop(state);
        SnapshotPhase {
            coord,
            suspended_operations,
        }
    }
}

impl<O> Drop for GcPhase<'_, O> {
    fn drop(&mut self) {
        let mut state = self.coord.state.lock();
        state.gc_requested = false;
        let prev = self
            .coord
            .in_progress_operations
            .fetch_sub(GC_REQUESTED_BIT, Ordering::AcqRel);
        assert!(
            (prev & GC_REQUESTED_BIT) != 0,
            "GcPhase::drop: GC bit was already cleared (prev={prev:#x})"
        );
        // Notify everyone waiting for the exclusion to finish, under the mutex (correctness against
        // parking_lot's notify_all fast path).
        self.coord.exclusion_completed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            Arc,
            atomic::{AtomicBool, AtomicUsize},
            mpsc::{self, RecvTimeoutError},
        },
        thread,
        time::Duration,
    };

    use super::*;

    /// Trivial operation type for tests — just a u32 tag.
    type Op = u32;

    /// Spin until `snapshot_pending()` returns true, yielding occasionally so
    /// we don't starve the snapshotter thread on single-core CI. Replaces
    /// fixed `thread::sleep` waits — those introduced both flakiness (too
    /// short) and slowness (too long).
    fn wait_for_snapshot_pending<O>(coord: &SnapshotCoordinator<O>) {
        while !coord.exclusion_pending() {
            thread::yield_now();
        }
    }

    #[test]
    fn no_snapshot_pending_initially() {
        let coord = SnapshotCoordinator::<Op>::new();
        assert!(!coord.exclusion_pending());
    }

    #[test]
    fn begin_operation_fast_path() {
        let coord = SnapshotCoordinator::<Op>::new();
        let g = coord.begin_operation();
        assert_eq!(coord.in_progress_operations.load(Ordering::Acquire), 1);
        drop(g);
        assert_eq!(coord.in_progress_operations.load(Ordering::Acquire), 0);
    }

    #[test]
    fn snapshot_with_no_ops_proceeds_immediately() {
        let coord = SnapshotCoordinator::<Op>::new();
        let phase = coord.begin_snapshot();
        assert!(coord.exclusion_pending());
        assert!(phase.suspended_operations().is_empty());
        drop(phase);
        assert!(!coord.exclusion_pending());
    }

    #[test]
    fn snapshot_waits_for_ops_to_drain() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());

        let g = coord.begin_operation();
        let started_snapshot = Arc::new(AtomicUsize::new(0));

        let coord2 = coord.clone();
        let snap_thread = thread::spawn({
            let started_snapshot = started_snapshot.clone();
            move || {
                let _phase = coord2.begin_snapshot();
                started_snapshot.store(1, Ordering::Release);
            }
        });

        // Wait for the snapshotter to set the bit. It can't make progress
        // past begin_snapshot while we hold `g`, so started_snapshot must
        // still be 0.
        wait_for_snapshot_pending(&coord);
        assert_eq!(started_snapshot.load(Ordering::Acquire), 0);

        // Drop the operation — snapshotter should now proceed.
        drop(g);
        snap_thread.join().unwrap();
        assert_eq!(started_snapshot.load(Ordering::Acquire), 1);
    }

    #[test]
    fn new_operation_blocks_during_snapshot() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let phase = coord.begin_snapshot();
        let started_op = Arc::new(AtomicUsize::new(0));
        let arrived = Arc::new(AtomicUsize::new(0));

        let coord2 = coord.clone();
        let op_thread = thread::spawn({
            let started_op = started_op.clone();
            let arrived = arrived.clone();
            move || {
                arrived.store(1, Ordering::Release);
                let _guard = coord2.begin_operation();
                started_op.store(1, Ordering::Release);
            }
        });

        // Wait until the worker is alive and about to call begin_operation.
        // We can't directly observe it entering begin_operation (its
        // fetch_add is transient — it backs out and parks before we can
        // sample), but since we hold `phase` the worker provably cannot
        // set started_op=1 from anywhere inside begin_operation. So
        // observing started_op==0 after the worker is running and on its
        // way into begin_operation is a real check, not a vacuous one.
        while arrived.load(Ordering::Acquire) == 0 {
            thread::yield_now();
        }
        assert_eq!(started_op.load(Ordering::Acquire), 0);

        drop(phase);
        op_thread.join().unwrap();
        assert_eq!(started_op.load(Ordering::Acquire), 1);
    }

    #[test]
    fn suspend_point_lets_snapshot_proceed() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let g = coord.begin_operation();

        let snapshotter_done = Arc::new(AtomicUsize::new(0));
        let coord_snap = coord.clone();

        let snap_thread = thread::spawn({
            let snapshotter_done = snapshotter_done.clone();
            move || {
                let phase = coord_snap.begin_snapshot();
                assert_eq!(phase.suspended_operations().len(), 1);
                snapshotter_done.store(1, Ordering::Release);
                // Hold the snapshot for a moment so the suspend_point thread
                // observes `snapshot_requested == true` after waking.
                thread::sleep(Duration::from_millis(20));
            }
        });

        wait_for_snapshot_pending(&coord);
        // Snapshotter is now waiting for our operation to drain. Calling
        // suspend_point should let it proceed.
        coord.suspend_point(|| 42u32);
        // suspend_point returns once the snapshot is finished.
        assert_eq!(snapshotter_done.load(Ordering::Acquire), 1);

        snap_thread.join().unwrap();
        drop(g);
    }

    /// Run `body` on a worker thread and wait up to `timeout` for it to
    /// finish.
    fn run_with_timeout(
        label: &'static str,
        timeout: Duration,
        body: impl FnOnce() + Send + 'static,
    ) {
        let (tx, rx) = mpsc::channel::<()>();
        let handle = thread::spawn(move || {
            body();
            let _ = tx.send(());
        });
        match rx.recv_timeout(timeout) {
            // Worker either finished normally or panicked (dropping the
            // sender). Either way it's no longer running, so join to
            // propagate any panic.
            Ok(()) | Err(RecvTimeoutError::Disconnected) => {
                handle.join().unwrap();
            }
            Err(RecvTimeoutError::Timeout) => {
                panic!(
                    "[watchdog] {label}: timed out after {timeout:?}, missed-wakeup race likely"
                );
            }
        }
    }

    /// Targeted stress test that reproduces the parking_lot notify-all
    /// fast-path missed-wakeup race when `OperationGuard::drop` does NOT
    /// take the state mutex.
    #[test]
    fn stress_no_missed_wakeups() {
        run_with_timeout("stress_no_missed_wakeups", Duration::from_secs(60), || {
            let coord = Arc::new(SnapshotCoordinator::<Op>::new());
            let snapshot_lock = Arc::new(Mutex::new(()));
            let stop = Arc::new(AtomicBool::new(false));
            let snap_count = Arc::new(AtomicUsize::new(0));

            let mut op_handles = Vec::new();
            for _ in 0..8 {
                let coord = coord.clone();
                op_handles.push(thread::spawn({
                    let stop = stop.clone();
                    move || {
                        while !stop.load(Ordering::Relaxed) {
                            let _g = coord.begin_operation();
                        }
                    }
                }));
            }
            let mut snap_handles = Vec::new();
            for _ in 0..2 {
                snap_handles.push(thread::spawn({
                    let coord = coord.clone();
                    let snapshot_lock = snapshot_lock.clone();
                    let snap_count = snap_count.clone();
                    move || {
                        for _ in 0..200 {
                            let _ser = snapshot_lock.lock();
                            let _phase = coord.begin_snapshot();
                            snap_count.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }));
            }

            // Progress watchdog: print snapshot count every 5s so we can see
            // if the test is making progress or actually wedged.
            let stop_progress = Arc::new(AtomicBool::new(false));

            let progress = thread::spawn({
                let stop_progress = stop_progress.clone();
                let snap_count = snap_count.clone();
                move || {
                    while !stop_progress.load(Ordering::Relaxed) {
                        thread::sleep(Duration::from_secs(1));
                        eprintln!(
                            "[stress] snapshots completed: {}",
                            snap_count.load(Ordering::Relaxed),
                        );
                    }
                }
            });

            for h in snap_handles {
                h.join().unwrap();
            }
            stop.store(true, Ordering::Relaxed);
            for h in op_handles {
                h.join().unwrap();
            }
            stop_progress.store(true, Ordering::Relaxed);
            let _ = progress.join();

            assert_eq!(coord.in_progress_operations.load(Ordering::Acquire), 0);
        });
    }

    #[test]
    fn many_concurrent_ops_and_snapshots() {
        // Stress test: hammer the protocol from many threads.
        // The coordinator does not serialize concurrent snapshotters (callers
        // are expected to do that with their own mutex), so we use one here.
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let snapshot_lock = Arc::new(Mutex::new(()));
        let counter = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::new();
        for _ in 0..8 {
            handles.push(thread::spawn({
                let coord = coord.clone();
                let counter = counter.clone();
                move || {
                    for _ in 0..200 {
                        let _g = coord.begin_operation();
                        counter.fetch_add(1, Ordering::Relaxed);
                    }
                }
            }));
        }
        for _ in 0..2 {
            handles.push(thread::spawn({
                let coord = coord.clone();
                let snapshot_lock = snapshot_lock.clone();
                move || {
                    for _ in 0..50 {
                        let _ser = snapshot_lock.lock();
                        let _phase = coord.begin_snapshot();
                        // Pretend to do snapshot work.
                        thread::sleep(Duration::from_micros(10));
                    }
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::Relaxed), 8 * 200);
        assert_eq!(
            coord.in_progress_operations.load(Ordering::Acquire),
            0,
            "in_progress_operations should be 0 after all ops and snapshots done"
        );
    }

    // === Garbage-collection gate ===

    #[test]
    fn gc_with_no_ops_proceeds_immediately() {
        let coord = SnapshotCoordinator::<Op>::new();
        let phase = coord.begin_gc();
        assert!(coord.exclusion_pending());
        drop(phase);
        assert!(!coord.exclusion_pending());
    }

    #[test]
    fn gc_waits_for_ops_to_drain() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let g = coord.begin_operation();
        let started_gc = Arc::new(AtomicUsize::new(0));

        let coord2 = coord.clone();
        let gc_thread = thread::spawn({
            let started_gc = started_gc.clone();
            move || {
                let _phase = coord2.begin_gc();
                started_gc.store(1, Ordering::Release);
            }
        });

        // The collector can't proceed past begin_gc while we hold `g`.
        wait_for_snapshot_pending(&coord);
        assert_eq!(started_gc.load(Ordering::Acquire), 0);

        drop(g);
        gc_thread.join().unwrap();
        assert_eq!(started_gc.load(Ordering::Acquire), 1);
    }

    #[test]
    fn new_operation_blocks_during_gc() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let phase = coord.begin_gc();
        let started_op = Arc::new(AtomicUsize::new(0));
        let arrived = Arc::new(AtomicUsize::new(0));

        let coord2 = coord.clone();
        let op_thread = thread::spawn({
            let started_op = started_op.clone();
            let arrived = arrived.clone();
            move || {
                arrived.store(1, Ordering::Release);
                let _guard = coord2.begin_operation();
                started_op.store(1, Ordering::Release);
            }
        });

        while arrived.load(Ordering::Acquire) == 0 {
            thread::yield_now();
        }
        assert_eq!(started_op.load(Ordering::Acquire), 0);

        drop(phase);
        op_thread.join().unwrap();
        assert_eq!(started_op.load(Ordering::Acquire), 1);
    }

    #[test]
    fn into_snapshot_keeps_operations_excluded_across_handoff() {
        // The GC->snapshot hand-off must never open a window in which an operation can start:
        // exclusion is held continuously from `begin_gc` through the snapshot phase.
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let gc_phase = coord.begin_gc();

        let started_op = Arc::new(AtomicUsize::new(0));
        let arrived = Arc::new(AtomicUsize::new(0));
        let coord2 = coord.clone();
        let op_thread = thread::spawn({
            let started_op = started_op.clone();
            let arrived = arrived.clone();
            move || {
                arrived.store(1, Ordering::Release);
                let _guard = coord2.begin_operation();
                started_op.store(1, Ordering::Release);
            }
        });

        // Wait until the op thread is trying to begin (and thus blocked on the GC bit).
        while arrived.load(Ordering::Acquire) == 0 {
            thread::yield_now();
        }
        assert_eq!(started_op.load(Ordering::Acquire), 0);

        // Hand off GC -> snapshot. The op must remain blocked (the snapshot bit is now set).
        let snapshot_phase = gc_phase.into_snapshot();
        // Give the op thread a chance to (wrongly) proceed if there were a gap.
        for _ in 0..1000 {
            thread::yield_now();
        }
        assert_eq!(
            started_op.load(Ordering::Acquire),
            0,
            "operation started during the GC->snapshot hand-off — exclusion was released"
        );

        // Only once the snapshot phase ends may the operation proceed.
        drop(snapshot_phase);
        op_thread.join().unwrap();
        assert_eq!(started_op.load(Ordering::Acquire), 1);
    }

    #[test]
    fn suspend_point_lets_gc_proceed() {
        let coord = Arc::new(SnapshotCoordinator::<Op>::new());
        let g = coord.begin_operation();

        let gc_done = Arc::new(AtomicUsize::new(0));
        let coord_gc = coord.clone();
        let gc_thread = thread::spawn({
            let gc_done = gc_done.clone();
            move || {
                let _phase = coord_gc.begin_gc();
                gc_done.store(1, Ordering::Release);
                thread::sleep(Duration::from_millis(20));
            }
        });

        wait_for_snapshot_pending(&coord);
        // The collector is waiting for our operation to drain. Suspending lets it proceed. The
        // suspend closure IS invoked and the operation IS recorded even for a GC suspension, so
        // that if the GC phase hands off to a snapshot (`into_snapshot`) the operation is
        // carried into the replay log (a GC-only pass simply never reads the recorded set).
        let recorded = Arc::new(AtomicUsize::new(0));
        let recorded_in_closure = recorded.clone();
        coord.suspend_point(move || {
            recorded_in_closure.fetch_add(1, Ordering::Release);
            0u32
        });
        assert_eq!(gc_done.load(Ordering::Acquire), 1);
        assert_eq!(
            recorded.load(Ordering::Acquire),
            1,
            "the suspend closure must run so the operation is recorded for a possible snapshot"
        );

        gc_thread.join().unwrap();
        drop(g);
    }

    #[test]
    #[should_panic(expected = "must be serialized")]
    fn gc_during_snapshot_panics() {
        let coord = SnapshotCoordinator::<Op>::new();
        let _snap = coord.begin_snapshot();
        // Callers must serialize GC vs snapshot; doing both at once is a protocol violation.
        let _gc = coord.begin_gc();
    }

    #[test]
    #[should_panic(expected = "must be serialized")]
    fn snapshot_during_gc_panics() {
        let coord = SnapshotCoordinator::<Op>::new();
        let _gc = coord.begin_gc();
        let _snap = coord.begin_snapshot();
    }
}
