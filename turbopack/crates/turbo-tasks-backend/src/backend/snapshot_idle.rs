//! Idle bookkeeping for the background snapshot loop.
//!
//! The snapshot loop learns about idle transitions from the backend's `idle_start_event` and
//! `idle_end_event`. Those are notified with `Event::notify`, which only wakes listeners that
//! exist at that moment and doesn't queue. The loop re-creates each listener after handling it,
//! so a transition in between reaches no listener. And when several transitions happen before
//! the loop polls, it handles the ready listeners in arbitrary order. A notification therefore
//! doesn't say anything reliable about the *current* state.
//!
//! For example, idle-start, idle-end, idle-start all happen before the loop polls. The second
//! idle-start is lost, and the loop may handle the idle-start and then the idle-end. Treating the
//! idle-end as "now busy" would disarm the idle snapshot while turbo-tasks is idle, and no
//! further notification arrives until the next transition.
//!
//! [`SnapshotIdleState`] treats every notification only as a cue to re-check whether turbo-tasks
//! is idle, observed after the listener was re-created so later transitions aren't missed, and
//! derives all of its state from that observation.

use tokio::time::{Duration, Instant};

use crate::utils::stopwatch::Stopwatch;

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
    /// is set, i.e. there may be something new to persist. Otherwise the next idle transition
    /// arms it.
    pub fn begin_cycle(&mut self, is_idle: bool, fresh_idle: bool, now: Instant) {
        self.sync_active_time(is_idle, now);
        self.idle_deadline = (is_idle && fresh_idle).then(|| now + self.idle_timeout);
    }

    /// Handles an idle-start notification. `is_idle` must be observed after the listener was
    /// re-created.
    pub fn on_idle_start(&mut self, is_idle: bool, now: Instant) {
        self.on_idle_transition(is_idle, now);
    }

    /// Handles an idle-end notification. `is_idle` must be observed after the listener was
    /// re-created. This can be idle when a later idle-start was lost.
    pub fn on_idle_end(&mut self, is_idle: bool, now: Instant) {
        self.on_idle_transition(is_idle, now);
    }

    /// Handles the idle timer firing. Returns whether to take the idle snapshot. If turbo-tasks
    /// isn't idle (a pending idle-end, or a lost one), the timer is disarmed instead of firing
    /// again immediately, and the next idle-start re-arms it.
    pub fn on_idle_timer_fired(&mut self, is_idle: bool, now: Instant) -> bool {
        if !is_idle {
            self.on_idle_transition(false, now);
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

    /// A transition of either kind happened. An idle period that is observed now (re)starts the
    /// idle timeout, since the system may have been busy in between.
    fn on_idle_transition(&mut self, is_idle: bool, now: Instant) {
        self.sync_active_time(is_idle, now);
        self.idle_deadline = is_idle.then(|| now + self.idle_timeout);
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

    use super::SnapshotIdleState;

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

    /// The race this type exists to handle: idle-start, idle-end and idle-start again are all
    /// notified before the loop polls. The second idle-start reaches no listener (the first one
    /// was already notified), so the loop only handles the first idle-start and then the stale
    /// idle-end, while turbo-tasks is idle.
    #[test]
    fn idle_end_handled_while_idle_arms_the_timer() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(false, true, at(0));

        state.on_idle_start(true, at(100));
        state.on_idle_end(true, at(101));

        assert_eq!(state.idle_deadline(), Some(at(101) + TIMEOUT));
        assert_stopped(&state, at(101), at(5_000));
    }

    /// The mirror image: idle-end, idle-start and idle-end again, handled as end then a stale
    /// start while turbo-tasks is busy. The timer must not fire for a busy system.
    #[test]
    fn idle_start_handled_while_busy_does_not_arm_the_timer() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        state.on_idle_end(false, at(100));
        state.on_idle_start(false, at(101));

        assert_eq!(state.idle_deadline(), None);
        assert_running(&state, at(101), at(5_000));
    }

    #[test]
    fn idle_start_while_idle_arms_the_timer_and_stops_active_time() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(false, true, at(0));

        state.on_idle_start(true, at(300));

        assert_eq!(state.idle_deadline(), Some(at(300) + TIMEOUT));
        assert_eq!(state.active_time(at(1_000)), Duration::from_millis(300));
    }

    #[test]
    fn idle_end_while_busy_disarms_the_timer_and_runs_active_time() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));
        assert_eq!(state.idle_deadline(), Some(at(0) + TIMEOUT));

        state.on_idle_end(false, at(200));

        assert_eq!(state.idle_deadline(), None);
        assert_running(&state, at(200), at(700));
    }

    #[test]
    fn a_new_idle_period_restarts_the_timeout() {
        let at = clock();
        let mut state = SnapshotIdleState::new(TIMEOUT);
        state.begin_cycle(true, true, at(0));

        state.on_idle_end(false, at(1_000));
        state.on_idle_start(true, at(1_500));

        assert_eq!(state.idle_deadline(), Some(at(1_500) + TIMEOUT));
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

        // Idle at the next cycle, without the loop having handled an idle-start.
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
