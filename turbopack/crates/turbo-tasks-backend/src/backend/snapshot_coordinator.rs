//! Coordinator that gates concurrent operations against snapshotting.
//!
//! Backend operations and snapshot work share a single [`SnapshotCoordinator`]
//! that enforces the protocol:
//!
//! - When no snapshot is in flight, [`begin_operation`](SnapshotCoordinator::begin_operation) is a
//!   single uncontended atomic increment.
//! - When a snapshot is requested, new operations block until the snapshot finishes, and operations
//!   already in flight either complete or call
//!   [`suspend_point`](SnapshotCoordinator::suspend_point) to suspend.
//! - The snapshotter waits for every in-flight operation to drain or suspend, takes its snapshot,
//!   then wakes everyone.

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use parking_lot::{Condvar, Mutex};
use rustc_hash::FxHashSet;

use crate::{backend::AnyOperation, utils::ptr_eq_arc::PtrEqArc};

/// High bit: set while a snapshot is requested or in flight.
/// Low bits: count of operations currently executing (not suspended).
const SNAPSHOT_REQUESTED_BIT: usize = 1 << (usize::BITS - 1);

/// State protected by the mutex.
struct State<O> {
    /// `true` between `begin_snapshot` and `SnapshotPhase::drop`.
    snapshot_requested: bool,
    /// Operations that called [`SnapshotCoordinator::suspend_point`] and have
    /// not yet resumed. Returned to the snapshotter via
    /// [`SnapshotPhase::suspended_operations`] so it can persist them in the
    /// uncompleted-operations log.
    suspended_operations: FxHashSet<PtrEqArc<O>>,
}

/// Coordinates operation/snapshot interleaving.
///
/// Generic over the operation type the caller wants to suspend. The
/// coordinator only requires `O: Send + Sync + 'static`; it never inspects
/// the value, just stores it via [`PtrEqArc`].
pub struct SnapshotCoordinator<O = AnyOperation> {
    /// Combined count + bit. See [`SNAPSHOT_REQUESTED_BIT`].
    in_progress_operations: AtomicUsize,
    state: Mutex<State<O>>,
    /// Notified by the last operation to drain (count drops to `BIT` while
    /// `SNAPSHOT_REQUESTED_BIT` is set). Awaited by [`begin_snapshot`].
    operations_drained: Condvar,
    /// Notified by [`SnapshotPhase::drop`]. Awaited by operations that hit a
    /// suspend point or arrive while a snapshot is in flight.
    snapshot_completed: Condvar,
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
                suspended_operations: FxHashSet::default(),
            }),
            operations_drained: Condvar::new(),
            snapshot_completed: Condvar::new(),
        }
    }

    /// Cheap check used by hot paths. Returns `true` while a snapshot is in
    /// flight (or being requested). May return `false` racily if a snapshot
    /// is just about to start; the actual coordination happens in
    /// [`suspend_point`](Self::suspend_point) and [`begin_operation`](Self::begin_operation).
    pub fn snapshot_pending(&self) -> bool {
        // Acquire so that observing the bit synchronizes with anything the
        // snapshotter wrote before setting it.
        (self.in_progress_operations.load(Ordering::Acquire) & SNAPSHOT_REQUESTED_BIT) != 0
    }

    /// Begin an operation. Returns a guard that decrements on drop.
    ///
    /// If a snapshot is in flight, blocks until the snapshot finishes before
    /// returning the guard.
    pub fn begin_operation(&self) -> OperationGuard<'_, O> {
        // Fast path: no snapshot in flight, single atomic increment.
        let prev = self.in_progress_operations.fetch_add(1, Ordering::AcqRel);
        if (prev & SNAPSHOT_REQUESTED_BIT) == 0 {
            return OperationGuard { coord: Some(self) };
        }
        #[cold]
        fn wait_for_snapshot_to_complete<O>(this: &SnapshotCoordinator<O>) {
            // We arrive here holding our +1 (the fetch_add in begin_operation).
            // Two cases:
            //   - Snapshot is still in flight: back out our +1, wait for it to finish, then re-add.
            //     The drop balances the re-add.
            //   - Snapshot already finished between our fetch_add and acquiring this mutex: leave
            //     our +1 in place; the drop balances it directly. No extra atomics needed.
            let mut state = this.state.lock();
            if state.snapshot_requested {
                let prev = this.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
                if prev - 1 == SNAPSHOT_REQUESTED_BIT {
                    this.operations_drained.notify_all();
                }
                this.snapshot_completed
                    .wait_while(&mut state, |s| s.snapshot_requested);
                // Re-add now that the snapshot is done. Bit is cleared because
                // we just observed `snapshot_requested == false` under the
                // mutex.
                this.in_progress_operations.fetch_add(1, Ordering::AcqRel);
            }
        }
        // Slow path: a snapshot is in flight (or just requested). Back out
        // the increment, wait for the snapshot to complete, then re-increment.
        wait_for_snapshot_to_complete(self);
        OperationGuard { coord: Some(self) }
    }

    /// Suspend the current operation if a snapshot is requested. Otherwise a
    /// no-op. The closure is called only when actually suspending — it must
    /// produce a handle to this operation so the snapshotter can persist it
    /// for replay on the next startup.
    pub fn suspend_point(&self, suspend: impl FnOnce() -> O) {
        if !self.snapshot_pending() {
            return;
        }
        #[cold]
        fn suspend_point_cold<O>(this: &SnapshotCoordinator<O>, suspend: impl FnOnce() -> O) {
            let op = Arc::new(suspend());
            let mut state = this.state.lock();
            if !state.snapshot_requested {
                // Race: snapshot finished between the `snapshot_pending` check
                // and acquiring the mutex. Nothing to do.
                return;
            }
            state
                .suspended_operations
                .insert(PtrEqArc::from(op.clone()));
            // Decrement the count so the snapshotter can drain.
            let prev = this.in_progress_operations.fetch_sub(1, Ordering::AcqRel);
            // Protocol violation if either invariant fails. Keep as a regular
            // `assert!` so production builds also catch it: the alternative is
            // a corrupted counter that hangs the next snapshot indefinitely.
            assert!(
                (prev & SNAPSHOT_REQUESTED_BIT) != 0 && (prev & !SNAPSHOT_REQUESTED_BIT) > 0,
                "suspend_point called without a live operation: prev={prev:#x}"
            );
            if prev - 1 == SNAPSHOT_REQUESTED_BIT {
                this.operations_drained.notify_all();
            }
            // Wait for the snapshot to finish.
            this.snapshot_completed
                .wait_while(&mut state, |s| s.snapshot_requested);
            // Resume: re-increment and remove ourselves from the suspended set.
            this.in_progress_operations.fetch_add(1, Ordering::AcqRel);
            state.suspended_operations.remove(&PtrEqArc::from(op));
        }
        suspend_point_cold(self, suspend);
    }

    /// Begin a snapshot. Sets the snapshot bit, blocks until all in-flight
    /// operations have drained or suspended, and returns a [`SnapshotPhase`]
    /// guard that releases the bit on drop.
    ///
    /// Concurrent callers panic via the debug assertion. Production callers
    /// must serialize themselves (see `snapshot_in_progress` lock in
    /// `mod.rs`); the coordinator does not own that mutex because some
    /// callers want to interleave additional work between phases.
    pub fn begin_snapshot(&self) -> SnapshotPhase<'_, O> {
        let mut state = self.state.lock();
        // Protocol violation: callers must serialize snapshots themselves.
        // Promoted from debug_assert: silently ignoring this leads directly
        // to a stuck counter and a hung process.
        assert!(
            !state.snapshot_requested,
            "begin_snapshot called while another snapshot was already in flight"
        );
        state.snapshot_requested = true;
        // AcqRel so the writes leading up to setting the bit are visible to
        // the operation hot path's Acquire load in `snapshot_pending`.
        let active = self
            .in_progress_operations
            .fetch_or(SNAPSHOT_REQUESTED_BIT, Ordering::AcqRel);
        assert!(
            (active & SNAPSHOT_REQUESTED_BIT) == 0,
            "snapshot bit was already set when begin_snapshot ran: {active:#x}"
        );
        if (active & !SNAPSHOT_REQUESTED_BIT) != 0 {
            // Some operations are in flight. Wait for them to drain or
            // suspend. The predicate is Acquire-loaded so we synchronize
            // with the AcqRel decrement that woke us.
            self.operations_drained.wait_while(&mut state, |_| {
                self.in_progress_operations.load(Ordering::Acquire) != SNAPSHOT_REQUESTED_BIT
            });
        }
        // Snapshot ranges that follow can read the suspended_operations
        // list; we leave the mutex held until the caller drops the phase.
        let suspended_operations: Vec<Arc<O>> = state
            .suspended_operations
            .iter()
            .map(|op| op.arc().clone())
            .collect();
        // Release the mutex now — the snapshotter does the heavy work
        // without holding it. Operations attempting to start during this
        // window observe the bit set and either suspend or wait on
        // `snapshot_completed`.
        drop(state);
        SnapshotPhase {
            coord: self,
            suspended_operations,
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
            (prev & !SNAPSHOT_REQUESTED_BIT) > 0,
            "OperationGuard::drop underflow: in_progress_operations was {prev:#x}"
        );
        if prev - 1 == SNAPSHOT_REQUESTED_BIT {
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
        self.coord.snapshot_completed.notify_all();
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
        while !coord.snapshot_pending() {
            thread::yield_now();
        }
    }

    #[test]
    fn no_snapshot_pending_initially() {
        let coord = SnapshotCoordinator::<Op>::new();
        assert!(!coord.snapshot_pending());
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
        assert!(coord.snapshot_pending());
        assert!(phase.suspended_operations().is_empty());
        drop(phase);
        assert!(!coord.snapshot_pending());
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
}
