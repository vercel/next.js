//! Coordinator that gates concurrent operations against snapshotting and garbage collection.
//!
//! Backend operations, snapshot work, and garbage collection share a single
//! [`SnapshotCoordinator`] that enforces the protocol:
//!
//! - When no exclusive phase is in flight,
//!   [`begin_operation`](SnapshotCoordinator::begin_operation) increments a striped counter.
//! - A phase waits for a zero-active boundary while new operations remain free to enter. An
//!   operation can depend on work started by another operation, so closing admission before all
//!   active work completes could deadlock graph propagation.
//! - At that boundary the phase atomically closes admission, does its work, then wakes new
//!   operations.
//! - The waiting phase polls for zero rather than having operations notify it, with striped
//!   counters a single operation completing cannot detect that all are complete.
//! - Because admission stays open while waiting, a busy graph may not reach a boundary for a long
//!   time. [`begin_snapshot`](SnapshotCoordinator::begin_snapshot) reports long waits to its
//!   caller, and [`try_begin_snapshot`](SnapshotCoordinator::try_begin_snapshot) doesn't wait at
//!   all, for callers that can retry later.

use std::{
    marker::PhantomData,
    sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering},
    thread,
    time::{Duration, Instant},
};

use crossbeam_utils::CachePadded;
use parking_lot::{Condvar, Mutex, MutexGuard};
use tracing::info_span;
use turbo_tasks::parallel::available_parallelism;

/// Blocks admission while a snapshot is in flight.
const SNAPSHOT_RUNNING_BIT: u8 = 1 << 0;
/// Marks a phase waiting for a zero-active boundary. Does not block admission.
const SNAPSHOT_WAITING_BIT: u8 = 1 << 1;
/// Upper bound on the number of counter stripes.
const MAX_STRIPES: usize = 512;
/// How long a waiting phase first sleeps between attempts to close admission. Doubles after each
/// failed attempt, up to [`MAX_POLL_INTERVAL`].
const MIN_POLL_INTERVAL: Duration = Duration::from_micros(20);
/// Upper bound on the sleep between attempts. Each failed attempt briefly sends operations
/// arriving at that moment through the state mutex, so attempts shouldn't be much more frequent.
const MAX_POLL_INTERVAL: Duration = Duration::from_millis(1);
/// How long a snapshot waits for operations to settle before reporting it. Later reports follow
/// each time the total wait doubles.
const DEFAULT_SLOW_SETTLE_REPORT_TIME: Duration = Duration::from_secs(10);

/// Passed to the [`begin_snapshot`](SnapshotCoordinator::begin_snapshot) callback when a snapshot
/// has been waiting a long time for active operations to finish.
///
/// Operations keep being admitted while the snapshot waits, so the counts can't tell whether the
/// same operations are still running or new ones keep replacing them.
pub struct SlowSettle {
    /// How long the snapshot has been waiting so far.
    pub waited: Duration,
    /// Operations that were active when the snapshot was requested.
    pub active_at_start: usize,
    /// Operations that were active at the latest attempt to close admission.
    pub active_now: usize,
}

/// State protected by the mutex.
struct State {
    /// `true` between `begin_snapshot` and `SnapshotPhase::drop`.
    snapshot_requested: bool,
}

/// Coordinates operation/snapshot/GC interleaving.
pub struct SnapshotCoordinator {
    /// Active operations; an operation increments and decrements the same stripe.
    active_operations: Box<[CachePadded<AtomicUsize>]>,
    /// [`SNAPSHOT_WAITING_BIT`] and [`SNAPSHOT_RUNNING_BIT`]. Written only by phases (under
    /// `state`), read by every operation.
    flags: AtomicU8,
    operations_waiting: AtomicBool,
    state: Mutex<State>,
    /// Notified by [`SnapshotPhase::drop`]. Awaited by operations arriving during a snapshot.
    snapshot_completed: Condvar,
    /// How long to
    slow_settle_report_timeout: Duration,
}

impl Default for SnapshotCoordinator {
    fn default() -> Self {
        Self::new()
    }
}

impl SnapshotCoordinator {
    pub fn new() -> Self {
        Self::new_with_options(DEFAULT_SLOW_SETTLE_REPORT_TIME, default_stripes())
    }

    /// `stripes` must be a power of two.
    fn new_with_options(slow_settle_report_timeout: Duration, stripes: usize) -> Self {
        debug_assert!(stripes.is_power_of_two());
        Self {
            active_operations: (0..stripes)
                .map(|_| CachePadded::new(AtomicUsize::new(0)))
                .collect(),
            flags: AtomicU8::new(0),
            operations_waiting: AtomicBool::new(false),
            state: Mutex::new(State {
                snapshot_requested: false,
            }),
            snapshot_completed: Condvar::new(),
            slow_settle_report_timeout,
        }
    }

    /// The calling thread's counter, picked by its [`ThreadId`](thread::ThreadId).
    fn current_thread_counter(&self) -> &AtomicUsize {
        let id = thread::current_id().as_u64().get() as usize;
        // the stripe count is a power of two
        &self.active_operations[id & (self.active_operations.len() - 1)]
    }

    /// Begin an operation. Returns a guard that decrements on drop.
    ///
    /// If a snapshot is in flight, blocks until the snapshot finishes before
    /// returning the guard.
    pub fn begin_operation(&self) -> OperationGuard<'_> {
        let stripe = self.current_thread_counter();
        // Fast path: no snapshot in flight, one atomic increment on this thread's stripe.
        //
        // SeqCst because it must be visible before the load of `flags` below decides that admission
        // is open. Otherwise a phase could sum the stripes without seeing it, and this
        // operation could see the running bit still clear. Both sides must be `SeqCst`.
        stripe.fetch_add(1, Ordering::SeqCst);
        if (self.flags.load(Ordering::SeqCst) & SNAPSHOT_RUNNING_BIT) == 0 {
            return OperationGuard {
                active_operation_counter: stripe,
                _not_send: PhantomData,
            };
        }
        #[cold]
        fn wait_for_admission(this: &SnapshotCoordinator, stripe: &AtomicUsize) {
            loop {
                // Back out our +1 before waiting: a phase holds the running bit, and the state
                // mutex, for the whole of an attempt to close admission, and it can only
                // succeed once the stripes sum to zero.
                stripe.fetch_sub(1, Ordering::Release);
                {
                    // Once we have the mutex, the attempt has either failed and reopened
                    // admission, or succeeded and requested a snapshot.
                    let mut state = this.state.lock();
                    if state.snapshot_requested {
                        this.operations_waiting.store(true, Ordering::Relaxed);
                        tokio::task::block_in_place(|| {
                            this.snapshot_completed
                                .wait_while(&mut state, |s| s.snapshot_requested);
                        });
                    }
                }
                // Retry the handshake: another attempt may have started since we let go of the
                // mutex.
                stripe.fetch_add(1, Ordering::SeqCst);
                if (this.flags.load(Ordering::SeqCst) & SNAPSHOT_RUNNING_BIT) == 0 {
                    return;
                }
            }
        }
        wait_for_admission(self, stripe);
        OperationGuard {
            active_operation_counter: stripe,
            _not_send: PhantomData,
        }
    }

    /// Sums the stripes: `Ok` if no operation is active, else how many were.
    ///
    /// Must be called under the state mutex with the running bit set. Admission is open
    /// otherwise, and an operation can increment a stripe after it was summed, so a zero would
    /// be stale before it is returned. The loads are `SeqCst` to pair with the increment in
    /// [`begin_operation`](Self::begin_operation): either the sum sees the increment or the
    /// operation sees the running bit.
    fn check_drained_with_admission_closed(&self) -> Result<(), usize> {
        let active: usize = self
            .active_operations
            .iter()
            .map(|s| s.load(Ordering::SeqCst))
            .sum();
        if active == 0 { Ok(()) } else { Err(active) }
    }

    /// Must be called under the state mutex by a waiting phase: close admission if no operation is
    /// active (the running bit stays set, the waiting bit is cleared and `Ok` is returned), else
    /// reopen admission and return how many operations were still active.
    ///
    /// `grace` is how long to keep admission closed while re-scanning for zero. Under load, some
    /// thread almost always has an operation open, so a single scan rarely sees zero even though
    /// each operation is short. Holding admission closed briefly stops new operations from
    /// replacing the ones that finish, so the in-flight ones can drain.
    fn try_close_admission(&self, grace: Duration) -> Result<(), usize> {
        self.flags.store(
            SNAPSHOT_WAITING_BIT | SNAPSHOT_RUNNING_BIT,
            Ordering::SeqCst,
        );
        let deadline = Instant::now() + grace;
        loop {
            match self.check_drained_with_admission_closed() {
                Ok(()) => {
                    self.flags.store(SNAPSHOT_RUNNING_BIT, Ordering::SeqCst);
                    return Ok(());
                }
                Err(active) if grace.is_zero() || Instant::now() >= deadline => {
                    // Operations are still active. Ones that saw the bit meanwhile are waiting for
                    // the mutex; they will find no snapshot requested and retry.
                    self.flags.store(SNAPSHOT_WAITING_BIT, Ordering::SeqCst);
                    return Err(active);
                }
                Err(_) => std::hint::spin_loop(),
            }
        }
    }

    /// Begin a snapshot. Wait for all admitted work to finish without preventing dependent
    /// operations from entering, then atomically close admission at a zero-active boundary.
    ///
    /// Waits for as long as it takes. If the wait gets long, `on_slow_settle` is called after
    /// [`SLOW_SETTLE_REPORT`] and again each time the total wait doubles.
    ///
    /// Concurrent callers panic. Production callers
    /// must serialize themselves (see `snapshot_in_progress` lock in
    /// `mod.rs`); the coordinator does not own that mutex because some
    /// callers want to interleave additional work between phases.
    pub fn begin_snapshot(&self, mut on_slow_settle: impl FnMut(SlowSettle)) -> SnapshotPhase<'_> {
        let mut state = self.state.lock();
        // Callers must serialize snapshots themselves.
        assert!(
            !state.snapshot_requested,
            "begin_snapshot called while another snapshot was already in flight"
        );
        // Request a drain without blocking new operations that an active graph update may
        // depend on.
        let prev = self.flags.swap(SNAPSHOT_WAITING_BIT, Ordering::SeqCst);
        assert!(
            (prev & (SNAPSHOT_WAITING_BIT | SNAPSHOT_RUNNING_BIT)) == 0,
            "begin_snapshot called while another snapshot was already in flight"
        );
        let wait_start = Instant::now();
        let mut next_report = wait_start + self.slow_settle_report_timeout;
        // Fast path: nothing active, so no need to give up the Tokio worker. Otherwise the
        // attempt's count, taken with the running bit set, is the number of operations we wait
        // for; a sum taken with admission open is only a hint.
        let first_attempt = self.try_close_admission(Duration::ZERO);
        let active_at_start = first_attempt.err().unwrap_or(0);
        let _span =
            info_span!("await operations settle", num_operations = active_at_start).entered();
        if first_attempt.is_err() {
            // This runs in a background Tokio task; release its worker so admitted work can
            // complete while we wait.
            tokio::task::block_in_place(|| {
                let mut poll_interval = MIN_POLL_INTERVAL;
                let mut active_now = active_at_start;
                loop {
                    let now = Instant::now();
                    if now >= next_report {
                        let waited = now - wait_start;
                        let slow_settle = SlowSettle {
                            waited,
                            active_at_start,
                            active_now,
                        };
                        // Don't hold the mutex while running caller code.
                        MutexGuard::unlocked(&mut state, || on_slow_settle(slow_settle));
                        next_report = now + waited;
                    }
                    // Sleep without the mutex, so that operations which saw a failed attempt's
                    // running bit can take it and go on. Wake up at `next_report` at the latest
                    // so a long wait gets reported.
                    let sleep = poll_interval.min(next_report.saturating_duration_since(now));
                    MutexGuard::unlocked(&mut state, || thread::sleep(sleep));
                    // A single scan rarely finds zero when every thread keeps an operation open,
                    // so give in-flight operations a moment to finish. Admission is closed for
                    // at most 1/20 of the time we wait.
                    match self.try_close_admission(poll_interval / 20) {
                        Ok(()) => break,
                        Err(active) => active_now = active,
                    }
                    poll_interval = (poll_interval * 2).min(MAX_POLL_INTERVAL);
                }
            });
        }
        state.snapshot_requested = true;
        // Release the mutex now — the snapshotter does the heavy work without holding it.
        // New operations wait for the phase to complete.
        drop(state);
        SnapshotPhase { coord: self }
    }

    /// Like [`begin_snapshot`](Self::begin_snapshot), but never waits: begins the snapshot only
    /// if no operation is active right now, otherwise returns `None`. A refused attempt leaves the
    /// flags as they were; it may briefly set the running bit, which sends operations arriving in
    /// that moment through the mutex.
    ///
    /// Like `begin_snapshot`, concurrent callers panic.
    pub fn try_begin_snapshot(&self) -> Option<SnapshotPhase<'_>> {
        let mut state = self.state.lock();
        // Callers must serialize snapshots themselves.
        assert!(
            !state.snapshot_requested,
            "begin_snapshot called while another snapshot was already in flight"
        );
        // A `begin_snapshot` waiting for its drain also has `snapshot_requested` clear, so check
        // the flags too: closing admission here would clear its request.
        assert_eq!(
            self.flags.load(Ordering::SeqCst),
            0,
            "try_begin_snapshot called while another snapshot was already in flight"
        );
        // Without waiting there is no need to request a drain: either nothing is active and we
        // close admission immediately, or we give up and leave the flags clear.
        self.flags.store(SNAPSHOT_RUNNING_BIT, Ordering::SeqCst);
        if self.check_drained_with_admission_closed().is_err() {
            // Operations that saw the bit meanwhile are waiting for the mutex; they will find no
            // snapshot requested and retry.
            self.flags.store(0, Ordering::SeqCst);
            return None;
        }
        // Operations that see the bit before this is set block on the state mutex we hold, then
        // observe the flag.
        state.snapshot_requested = true;
        drop(state);
        Some(SnapshotPhase { coord: self })
    }
}

/// Oversize the stripes: it is a small amount of RAM and zero contention is the goal. Being too
/// large makes waiting for settling slightly more expensive.
fn default_stripes() -> usize {
    (available_parallelism().map_or(1, |n| n.get()) * 2)
        .next_power_of_two()
        .min(MAX_STRIPES)
}

/// Guard returned by [`SnapshotCoordinator::begin_operation`]. Decrements `active_operations` on
/// drop.
pub struct OperationGuard<'a> {
    active_operation_counter: &'a AtomicUsize,
    // Ensures the thread that increments the counter is also the one that decrements it
    _not_send: PhantomData<*const ()>,
}

impl Drop for OperationGuard<'_> {
    fn drop(&mut self) {
        // `Release` is enough: only the increment takes part in the store-load handshake with a
        // closing phase. A phase whose `SeqCst` sum reads this decrement acquires the
        // operation's writes.
        let prev = self
            .active_operation_counter
            .fetch_sub(1, Ordering::Release);
        // Underflow means a guard was dropped without a matching increment;
        // promoted from debug_assert because the alternative is silently
        // wrapping to usize::MAX and breaking every subsequent snapshot.
        assert!(prev > 0, "OperationGuard::drop underflow");
    }
}

/// Guard returned by [`SnapshotCoordinator::begin_snapshot`]. Holds the
/// snapshot bit; on drop, releases it and wakes new operations.
pub struct SnapshotPhase<'a> {
    coord: &'a SnapshotCoordinator,
}

impl SnapshotPhase<'_> {
    /// Whether any operation is currently blocked waiting for this exclusion to end
    pub fn operations_waiting(&self) -> bool {
        self.coord.operations_waiting.load(Ordering::Relaxed)
    }
}

impl Drop for SnapshotPhase<'_> {
    fn drop(&mut self) {
        let mut state = self.coord.state.lock();
        state.snapshot_requested = false;
        // Clear the sticky waiter flag for the next exclusion. Everyone is about to be unblocked
        // and because snapshot_requested is false no new waiters can arrive
        self.coord
            .operations_waiting
            .store(false, Ordering::Relaxed);
        let prev = self
            .coord
            .flags
            .fetch_and(!SNAPSHOT_RUNNING_BIT, Ordering::SeqCst);
        assert!(
            (prev & SNAPSHOT_RUNNING_BIT) != 0,
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

    /// What [`SnapshotCoordinator::observe`] saw.
    #[derive(Debug, PartialEq, Eq)]
    struct Observed {
        flags: u8,
        active_operations: usize,
    }

    impl Observed {
        /// No phase in flight and no operation active.
        const IDLE: Self = Self::new(0, 0);

        const fn new(flags: u8, active_operations: usize) -> Self {
            Self {
                flags,
                active_operations,
            }
        }
    }

    impl SnapshotCoordinator {
        /// The phase flags, read under the state mutex: a waiting phase sets the running bit
        /// for the length of each attempt to close admission, but only while holding it.
        fn settled_flags(&self) -> u8 {
            let _state = self.state.lock();
            self.flags.load(Ordering::Acquire)
        }

        fn snapshot_pending(&self) -> bool {
            (self.settled_flags() & SNAPSHOT_RUNNING_BIT) != 0
        }

        /// The phase flags and the active operation count. The count is only exact while no
        /// other thread is beginning or ending an operation.
        fn observe(&self) -> Observed {
            Observed {
                flags: self.settled_flags(),
                active_operations: self
                    .active_operations
                    .iter()
                    .map(|s| s.load(Ordering::SeqCst))
                    .sum(),
            }
        }
    }

    fn wait_for_snapshot_request(coord: &SnapshotCoordinator) {
        while (coord.settled_flags() & SNAPSHOT_WAITING_BIT) == 0 {
            thread::yield_now();
        }
    }

    #[test]
    fn no_snapshot_pending_initially() {
        let coord = SnapshotCoordinator::new();
        assert!(!coord.snapshot_pending());
    }

    #[test]
    fn begin_operation_fast_path() {
        let coord = SnapshotCoordinator::new();
        let g = coord.begin_operation();
        assert_eq!(coord.observe(), Observed::new(0, 1));
        drop(g);
        assert_eq!(coord.observe(), Observed::IDLE);
    }

    #[test]
    fn snapshot_with_no_ops_proceeds_immediately() {
        let coord = SnapshotCoordinator::new();
        let phase = coord.begin_snapshot(|_| {});
        assert!(coord.snapshot_pending());
        assert_eq!(coord.observe(), Observed::new(SNAPSHOT_RUNNING_BIT, 0));
        drop(phase);
        assert!(!coord.snapshot_pending());
    }

    #[test]
    fn snapshot_waits_for_ops_to_drain() {
        let coord = Arc::new(SnapshotCoordinator::new());

        let g = coord.begin_operation();
        let started_snapshot = Arc::new(AtomicUsize::new(0));

        let coord2 = coord.clone();
        let snap_thread = thread::spawn({
            let started_snapshot = started_snapshot.clone();
            move || {
                let _phase = coord2.begin_snapshot(|_| {});
                started_snapshot.store(1, Ordering::Release);
            }
        });

        // New work must remain admitted while the existing operation is running.
        wait_for_snapshot_request(&coord);
        assert!(!coord.snapshot_pending());
        assert_eq!(coord.observe(), Observed::new(SNAPSHOT_WAITING_BIT, 1));
        assert_eq!(started_snapshot.load(Ordering::Acquire), 0);

        // Drop the operation — snapshotter should now proceed.
        drop(g);
        snap_thread.join().unwrap();
        assert_eq!(started_snapshot.load(Ordering::Acquire), 1);
    }

    #[test]
    fn new_operation_blocks_during_snapshot() {
        let coord = Arc::new(SnapshotCoordinator::new());
        let phase = coord.begin_snapshot(|_| {});
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
        assert_eq!(
            started_op.load(Ordering::Acquire),
            0,
            "a new operation must block while the exclusion is held"
        );

        drop(phase);
        op_thread.join().unwrap();
        assert_eq!(
            started_op.load(Ordering::Acquire),
            1,
            "the operation must run once the exclusion ends"
        );
    }

    #[test]
    fn snapshot_waits_for_dependent_operations() {
        run_with_timeout("dependent operations", Duration::from_secs(10), || {
            let coord = Arc::new(SnapshotCoordinator::new());
            let removal = coord.begin_operation();
            let done = Arc::new(AtomicBool::new(false));
            let snap_coord = coord.clone();
            let done_at_snapshot = done.clone();
            let snapshot = thread::spawn(move || {
                let _phase = snap_coord.begin_snapshot(|_| {});
                assert!(done_at_snapshot.load(Ordering::Acquire));
            });
            wait_for_snapshot_request(&coord);
            // The add arrives after the snapshot was requested, but the active removal
            // depends on it. Closing admission before this point would deadlock.
            let add = coord.begin_operation();
            assert_eq!(coord.observe(), Observed::new(SNAPSHOT_WAITING_BIT, 2));
            done.store(true, Ordering::Release);
            drop(add);
            assert_eq!(coord.observe(), Observed::new(SNAPSHOT_WAITING_BIT, 1));
            drop(removal);
            snapshot.join().unwrap();
        });
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

    /// Stress test for missed wakeups: operations parked on `snapshot_completed` must all be
    /// woken when a phase ends, and every phase must eventually close.
    #[test]
    // Passes in isolation on wasm, but in a full-suite run it intermittently stops making progress
    // partway through (its own watchdog reports `missed-wakeup race likely`) and the abort takes
    // the whole test binary with it, since wasm is built `panic = abort`. Because progress
    // halts rather than merely being slow, a longer watchdog does not help. The stall is not
    // caused by any of the wasm changes — it reproduces on the parent layer too — so it is
    // ignored here and tracked for a separate PR.
    #[cfg_attr(
        target_family = "wasm",
        ignore = "stalls intermittently on wasm in a full-suite run; tracked separately"
    )]
    fn stress_no_missed_wakeups() {
        run_with_timeout("stress_no_missed_wakeups", Duration::from_secs(60), || {
            let coord = Arc::new(SnapshotCoordinator::new());
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
                            let _phase = coord.begin_snapshot(|_| {});
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

            assert_eq!(coord.observe(), Observed::IDLE);
        });
    }

    #[test]
    fn many_concurrent_ops_and_snapshots() {
        // Stress test: hammer the protocol from many threads.
        // The coordinator does not serialize concurrent snapshotters (callers
        // are expected to do that with their own mutex), so we use one here.
        let coord = Arc::new(SnapshotCoordinator::new());
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
                        let _phase = coord.begin_snapshot(|_| {});
                        // Pretend to do snapshot work.
                        thread::sleep(Duration::from_micros(10));
                    }
                }
            }));
        }
        // Attempts that frequently give up must leave the counter consistent.
        handles.push(thread::spawn({
            let coord = coord.clone();
            let snapshot_lock = snapshot_lock.clone();
            move || {
                for _ in 0..100 {
                    let _ser = snapshot_lock.lock();
                    drop(coord.try_begin_snapshot());
                }
            }
        }));

        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(counter.load(Ordering::Relaxed), 8 * 200);
        assert_eq!(
            coord.observe(),
            Observed::IDLE,
            "no operation or phase should remain after all ops and snapshots are done"
        );
    }

    #[test]
    fn operations_waiting_tracks_blocked_operations() {
        let coord = Arc::new(SnapshotCoordinator::new());

        // Fast path: no exclusion in flight, so these never blocked and are not waiters.
        let unblocked = coord.begin_operation();
        assert!(
            !coord.operations_waiting.load(Ordering::Relaxed),
            "operations that never blocked are not waiters"
        );
        drop(unblocked);

        let phase = coord.begin_snapshot(|_| {});
        assert!(
            !phase.operations_waiting(),
            "holding the exclusion alone is not a waiter"
        );

        let coord2 = coord.clone();
        let op_thread = thread::spawn(move || {
            let _guard = coord2.begin_operation();
        });

        // Wait until the operation is actually parked, not merely spawned: the flag is set under
        // the state lock right before the park.
        while !phase.operations_waiting() {
            thread::yield_now();
        }

        drop(phase); // releases the waiter
        assert!(
            !coord.operations_waiting.load(Ordering::Relaxed),
            "the sticky waiter flag must be cleared when the phase is dropped"
        );
        op_thread.join().unwrap();
    }

    #[test]
    fn slow_settle_is_reported() {
        const SLOW_SETTLE_TIME: Duration = Duration::from_millis(200);
        run_with_timeout("slow settle", Duration::from_secs(10), || {
            let coord = Arc::new(SnapshotCoordinator::new_with_options(
                SLOW_SETTLE_TIME,
                default_stripes(),
            ));
            let op = coord.begin_operation();
            let reports = Arc::new(Mutex::new(Vec::new()));
            let snapshot = thread::spawn({
                let coord = coord.clone();
                let reports = reports.clone();
                move || {
                    drop(coord.begin_snapshot(|slow| {
                        reports
                            .lock()
                            .push((slow.waited, slow.active_at_start, slow.active_now))
                    }));
                }
            });
            while reports.lock().is_empty() {
                thread::sleep(Duration::from_millis(50));
            }
            // An operation can still be admitted after the report released the mutex.
            drop(coord.begin_operation());
            drop(op);
            snapshot.join().unwrap();
            let reports = reports.lock();
            assert_eq!(reports.len(), 1);
            let (waited, active_at_start, active_now) = reports[0];
            assert!(waited >= SLOW_SETTLE_TIME);
            assert_eq!((active_at_start, active_now), (1, 1));
        });
    }

    #[test]
    fn try_begin_snapshot_proceeds_when_idle() {
        let coord = SnapshotCoordinator::new();
        let phase = coord.try_begin_snapshot().expect("no operation is active");
        assert!(coord.snapshot_pending());
        drop(phase);
        assert_eq!(coord.observe(), Observed::IDLE);
    }

    #[test]
    fn try_begin_snapshot_gives_up_while_busy() {
        let coord = SnapshotCoordinator::new();
        let op = coord.begin_operation();
        assert!(coord.try_begin_snapshot().is_none());
        // Giving up leaves no trace: only the active operation remains.
        assert_eq!(coord.observe(), Observed::new(0, 1));
        // Admission was never closed.
        drop(coord.begin_operation());
        drop(op);
        assert_eq!(coord.observe(), Observed::IDLE);
        // A later snapshot is unaffected by the abandoned one.
        drop(coord.begin_snapshot(|_| {}));
        assert_eq!(coord.observe(), Observed::IDLE);
    }

    #[test]
    fn stress_exclusion_with_shared_stripes() {
        // More threads than stripes, some holding their guard for a while, against both kinds of
        // phase. No operation may hold a guard while a phase is closed. Phases need moments
        // with no active operation, which a saturating load need not leave, so the operation
        // threads run a fixed amount of work; once they are done a phase must close. With the
        // slow-settle report an hour away, a missed drain hangs instead of being rescued.
        run_with_timeout("shared stripes", Duration::from_secs(60), || {
            // two stripes and six operation threads: threads share stripes
            let coord = SnapshotCoordinator::new_with_options(Duration::from_secs(3600), 2);
            let closed = AtomicBool::new(false);
            let ops_done = AtomicUsize::new(0);
            let snapshot_lock = Mutex::new(());
            const THREADS: usize = 6;
            thread::scope(|scope| {
                for t in 0..THREADS {
                    let (coord, closed, ops_done) = (&coord, &closed, &ops_done);
                    scope.spawn(move || {
                        for i in 0..20_000usize {
                            let guard = coord.begin_operation();
                            assert!(!closed.load(Ordering::SeqCst), "operation inside a phase");
                            if (i + t).is_multiple_of(5) {
                                // hold the guard long enough for a phase to try closing
                                for _ in 0..100 {
                                    std::hint::spin_loop();
                                }
                                assert!(
                                    !closed.load(Ordering::SeqCst),
                                    "phase closed while an operation was active"
                                );
                            }
                            drop(guard);
                        }
                        ops_done.fetch_add(1, Ordering::SeqCst);
                    });
                }
                for k in 0..2 {
                    let (coord, closed, ops_done, snapshot_lock) =
                        (&coord, &closed, &ops_done, &snapshot_lock);
                    scope.spawn(move || {
                        let mut j = 0usize;
                        while ops_done.load(Ordering::SeqCst) < THREADS {
                            let _ser = snapshot_lock.lock();
                            let phase = if (j + k).is_multiple_of(3) {
                                coord.try_begin_snapshot()
                            } else {
                                Some(coord.begin_snapshot(|_| {}))
                            };
                            if let Some(phase) = phase {
                                // Stay closed long enough for an operation admitted by mistake
                                // to observe it.
                                closed.store(true, Ordering::SeqCst);
                                for _ in 0..100 {
                                    std::hint::spin_loop();
                                }
                                closed.store(false, Ordering::SeqCst);
                                drop(phase);
                            }
                            j += 1;
                        }
                    });
                }
            });
            // every operation has ended: a phase closes at once
            drop(coord.begin_snapshot(|_| {}));
            assert_eq!(coord.observe(), Observed::IDLE);
        });
    }

    #[test]
    fn operation_guard_is_not_send() {
        // Resolves only if exactly one impl applies, i.e. if `OperationGuard` is not `Send`.
        trait AmbiguousIfSend<A> {
            fn check() {}
        }
        impl<T: ?Sized> AmbiguousIfSend<()> for T {}
        #[allow(dead_code)]
        struct Invalid;
        impl<T: ?Sized + Send> AmbiguousIfSend<Invalid> for T {}
        <OperationGuard<'static> as AmbiguousIfSend<_>>::check();
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    fn try_begin_snapshot_panics_while_a_snapshot_waits() {
        run_with_timeout("try_begin during a wait", Duration::from_secs(10), || {
            let coord = Arc::new(SnapshotCoordinator::new_with_options(
                Duration::from_secs(3600),
                default_stripes(),
            ));
            let op = coord.begin_operation();
            let snapshot = thread::spawn({
                let coord = coord.clone();
                move || drop(coord.begin_snapshot(|_| {}))
            });
            wait_for_snapshot_request(&coord);
            let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                coord.try_begin_snapshot().is_none()
            }));
            assert!(
                attempt.is_err(),
                "overlapping try_begin_snapshot must panic"
            );
            // the waiting phase is unaffected and closes once the operation ends
            drop(op);
            snapshot.join().unwrap();
            assert_eq!(coord.observe(), Observed::IDLE);
        });
    }

    #[test]
    #[should_panic(expected = "already in flight")]
    fn overlapping_exclusions_panic() {
        let coord = SnapshotCoordinator::new();
        let _first = coord.begin_snapshot(|_| {});
        let _second = coord.begin_snapshot(|_| {});
    }
}
