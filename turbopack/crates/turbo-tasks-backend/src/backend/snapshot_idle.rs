//! Idle bookkeeping for the background snapshot loop.
//!
//! The snapshot loop observes the backend's activity through a watch channel (see
//! [`crate::backend::activity`]), which always yields the latest published value but may
//! coalesce several publications into one change. [`SnapshotIdleState`] is fed every observed
//! value and derives all of its state from it. An observed idle value always (re)starts the idle
//! timeout: a busy period may have been coalesced away in between, so the system may not have
//! been idle for the whole time since the previous observation.
//!
//! For the same reason, when the idle timer fires while a change is still unread, the change is
//! handled first instead of taking the snapshot.

use tokio::{
    sync::watch,
    time::{Duration, Instant},
};

use crate::{backend::activity::BackendActivity, utils::stopwatch::Stopwatch};

/// What the snapshot loop does next after handling a change or the idle timer.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum IdleWait {
    /// Keep waiting.
    Continue,
    /// Take the idle snapshot.
    Snapshot,
    /// The backend is stopping (or gone): leave the loop.
    Stop,
}

/// The idle-snapshot timer and the active-time accounting of the snapshot loop.
///
/// Every method takes the observed idle state and the current time, which keeps the logic
/// deterministic and testable.
pub(crate) struct SnapshotIdleState {
    idle_timeout: Duration,
    /// When an idle snapshot should be taken, or `None` while turbo-tasks isn't (known to be)
    /// idle.
    idle_deadline: Option<Instant>,
    /// Accumulated compilation (non-idle) time since the last completed snapshot attempt. Runs
    /// while not idle, stops while idle. Used to skip snapshots that wouldn't save enough work to
    /// justify their fixed overhead.
    active_time: Stopwatch,
}

impl SnapshotIdleState {
    pub fn new(idle_timeout: Duration) -> Self {
        Self {
            idle_timeout,
            idle_deadline: None,
            active_time: Stopwatch::new(),
        }
    }

    /// Starts a wait cycle. The idle timer is armed only if turbo-tasks is idle and `fresh_idle`
    /// is set, i.e. there may be something new to persist. Otherwise the next observed change to
    /// idle arms it.
    pub fn begin_cycle(&mut self, is_idle: bool, fresh_idle: bool, now: Instant) {
        self.sync_active_time(is_idle, now);
        self.idle_deadline = (is_idle && fresh_idle).then(|| now + self.idle_timeout);
    }

    /// Handles an observed change of the backend's activity. Observing idle (re)starts the idle
    /// timeout, even if the previous observation was idle too.
    pub fn on_idle_changed(&mut self, is_idle: bool, now: Instant) {
        self.sync_active_time(is_idle, now);
        self.idle_deadline = is_idle.then(|| now + self.idle_timeout);
    }

    /// Reads the latest value from `activity`, marking it seen, and handles it as a change.
    pub fn on_activity_changed(
        &mut self,
        activity: &mut watch::Receiver<BackendActivity>,
        now: Instant,
    ) -> IdleWait {
        // Copy the value out: the borrow must not outlive this statement.
        let current = *activity.borrow_and_update();
        if current == BackendActivity::Stopping {
            return IdleWait::Stop;
        }
        self.on_idle_changed(current.is_idle(), now);
        IdleWait::Continue
    }

    /// Handles the idle deadline being reached. An unread change is handled first and the
    /// snapshot isn't taken: the change may hide a busy period, after which the timeout starts
    /// over (or it may be `Stopping`). This also keeps a pending change from depending on
    /// which branch the loop's `select!` happens to poll first.
    pub fn on_idle_deadline(
        &mut self,
        activity: &mut watch::Receiver<BackendActivity>,
        now: Instant,
    ) -> IdleWait {
        match activity.has_changed() {
            Err(_) => return IdleWait::Stop,
            Ok(true) => return self.on_activity_changed(activity, now),
            Ok(false) => {}
        }
        let is_idle = activity.borrow().is_idle();
        if self.on_idle_timer_fired(is_idle, now) {
            IdleWait::Snapshot
        } else {
            IdleWait::Continue
        }
    }

    /// Handles the idle timer firing with no unread change. Returns whether to take the idle
    /// snapshot. If turbo-tasks isn't idle, the timer is disarmed instead of firing again
    /// immediately, and the next observed idle value re-arms it.
    fn on_idle_timer_fired(&mut self, is_idle: bool, now: Instant) -> bool {
        if !is_idle {
            self.on_idle_changed(false, now);
        }
        is_idle
    }

    pub fn idle_deadline(&self) -> Option<Instant> {
        self.idle_deadline
    }

    pub fn active_time(&self, now: Instant) -> Duration {
        self.active_time.elapsed_at(now.into_std())
    }

    /// Discards the accumulated active time, e.g. after a completed snapshot attempt. If timing
    /// an active period, it keeps running from `now`.
    pub fn reset_active_time(&mut self, now: Instant) {
        self.active_time.reset_at(now.into_std());
    }

    fn sync_active_time(&mut self, is_idle: bool, now: Instant) {
        if is_idle {
            self.active_time.stop_at(now.into_std());
        } else {
            self.active_time.start_at(now.into_std());
        }
    }
}

#[cfg(test)]
mod tests {
    use tokio::time::{Duration, Instant};

    use super::{IdleWait, SnapshotIdleState};
    use crate::backend::activity::ActivityPublisher;

    const TIMEOUT: Duration = Duration::from_secs(5);

    fn clock() -> impl Fn(u64) -> Instant {
        let base = Instant::now();
        move |ms: u64| base + Duration::from_millis(ms)
    }

    /// Asserts that active time doesn't grow between `from` and `to`, i.e. the stopwatch is
    /// stopped.
    fn assert_stopped(state: &SnapshotIdleState, from: Instant, to: Instant) {
        assert_eq!(state.active_time(from), state.active_time(to));
    }

    /// Asserts that active time grows by exactly `to - from`, i.e. the stopwatch is running.
    fn assert_running(state: &SnapshotIdleState, from: Instant, to: Instant) {
        assert_eq!(state.active_time(to) - state.active_time(from), to - from);
    }

    #[test]
    fn observing_idle_arms_the_timer_and_stops_active_time() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(false, true, at(0));

        state.on_idle_changed(true, at(300));

        assert_eq!(state.idle_deadline(), Some(at(300) + TIMEOUT));
        assert_eq!(state.active_time(at(1_000)), Duration::from_millis(300));
    }

    #[test]
    fn observing_busy_disarms_the_timer_and_runs_active_time() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));
        assert_eq!(state.idle_deadline(), Some(at(0) + TIMEOUT));

        state.on_idle_changed(false, at(200));

        assert_eq!(state.idle_deadline(), None);
        assert_running(&state, at(200), at(700));
    }

    #[test]
    fn a_new_idle_period_restarts_the_timeout() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        state.on_idle_changed(false, at(1_000));
        state.on_idle_changed(true, at(1_500));

        assert_eq!(state.idle_deadline(), Some(at(1_500) + TIMEOUT));
    }

    /// The watch channel coalesced idle -> busy -> idle into one change, so the loop observes
    /// idle twice in a row. The busy period in between means the idle timeout starts over.
    #[test]
    fn observing_idle_again_restarts_the_timeout() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        state.on_idle_changed(true, at(4_000));

        assert_eq!(state.idle_deadline(), Some(at(4_000) + TIMEOUT));
        assert_stopped(&state, at(4_000), at(8_000));
    }

    /// A request comes and goes while the previous cycle is snapshotting. The loop only peeks at
    /// the start of the next cycle, so the change is still pending for `changed()` and re-arms the
    /// timer, even though the cycle isn't fresh. Marking it seen at the cycle start would lose the
    /// idle snapshot for that request.
    #[test]
    fn change_during_snapshot_stays_pending_across_cycle_start() {
        let at = clock();
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        let mut state = SnapshotIdleState::new(TIMEOUT);

        publisher.publish_idle(|| false);
        publisher.publish_idle(|| true);

        let current = *receiver.borrow();
        state.begin_cycle(current.is_idle(), false, at(0));
        assert_eq!(state.idle_deadline(), None);

        assert!(receiver.has_changed().unwrap());
        assert_eq!(
            state.on_activity_changed(&mut receiver, at(1)),
            IdleWait::Continue
        );
        assert_eq!(state.idle_deadline(), Some(at(1) + TIMEOUT));
    }

    /// The idle deadline of an earlier idle period is reached while a coalesced busy -> idle
    /// change is still unread (the loop's `select!` polled the timer first). The change is
    /// handled and the timeout starts over instead of snapshotting right away.
    #[test]
    fn deadline_with_unread_change_restarts_the_timeout() {
        let at = clock();
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        publisher.publish_idle(|| false);
        publisher.publish_idle(|| true);

        assert_eq!(
            state.on_idle_deadline(&mut receiver, at(5_000)),
            IdleWait::Continue
        );
        assert_eq!(state.idle_deadline(), Some(at(5_000) + TIMEOUT));
        assert!(!receiver.has_changed().unwrap());
    }

    #[test]
    fn deadline_with_unread_stopping_stops() {
        let at = clock();
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        publisher.publish_stopping();

        assert_eq!(
            state.on_idle_deadline(&mut receiver, at(5_000)),
            IdleWait::Stop
        );
    }

    #[test]
    fn deadline_without_change_snapshots_when_idle_and_disarms_when_busy() {
        let at = clock();
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));
        assert_eq!(
            state.on_idle_deadline(&mut receiver, at(5_000)),
            IdleWait::Snapshot
        );

        // Busy, and the change was already handled by the loop.
        publisher.publish_idle(|| false);
        assert_eq!(
            state.on_activity_changed(&mut receiver, at(6_000)),
            IdleWait::Continue
        );
        assert_eq!(
            state.on_idle_deadline(&mut receiver, at(7_000)),
            IdleWait::Continue
        );
        assert_eq!(state.idle_deadline(), None);
    }

    #[test]
    fn begin_cycle_arms_the_timer_only_when_idle_and_fresh() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);

        state.begin_cycle(true, true, at(0));
        assert_eq!(state.idle_deadline(), Some(at(0) + TIMEOUT));
        assert_stopped(&state, at(0), at(1_000));

        // Not fresh: nothing new to persist since the last snapshot, so don't re-arm while idle.
        state.begin_cycle(true, false, at(1_000));
        assert_eq!(state.idle_deadline(), None);
        assert_stopped(&state, at(1_000), at(2_000));

        state.begin_cycle(false, true, at(2_000));
        assert_eq!(state.idle_deadline(), None);
        assert_running(&state, at(2_000), at(3_000));
    }

    #[test]
    fn begin_cycle_stops_active_time_when_idle() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(false, true, at(0));

        // Idle at the next cycle, without the loop having handled the change.
        state.begin_cycle(true, true, at(400));

        assert_eq!(state.active_time(at(2_000)), Duration::from_millis(400));
    }

    #[test]
    fn timer_firing_while_busy_disarms_instead_of_snapshotting() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        assert!(!state.on_idle_timer_fired(false, at(5_000)));
        assert_eq!(state.idle_deadline(), None);
        assert_running(&state, at(5_000), at(6_000));
    }

    #[test]
    fn timer_firing_while_idle_snapshots() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        assert!(state.on_idle_timer_fired(true, at(5_000)));
    }

    #[test]
    fn reset_active_time_discards_accumulated_time() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(false, true, at(0));

        state.reset_active_time(at(1_000));

        assert_eq!(state.active_time(at(1_000)), Duration::ZERO);
        assert_eq!(state.active_time(at(1_250)), Duration::from_millis(250));
    }
}
