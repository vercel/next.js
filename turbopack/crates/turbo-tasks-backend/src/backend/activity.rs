//! Tracks whether the backend is idle, busy or stopping, when the current idle period began and
//! how much active (non-idle) time has accumulated.
//!
//! The state is published through a [`tokio::sync::watch`] channel. Receivers always see the
//! latest value, but several changes may be coalesced into one. Because an idle value carries the
//! time its idle period began, a coalesced idle → busy → idle still shows up as a new value.

use parking_lot::Mutex;
use tokio::{
    sync::watch,
    time::{Duration, Instant},
};

use crate::utils::stopwatch::Stopwatch;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BackendActivity {
    /// No foreground job is scheduled, since `since`.
    Idle { since: Instant },
    /// At least one foreground job is scheduled.
    Busy,
    /// The backend is shutting down. Terminal: never replaced by `Idle` or `Busy`.
    Stopping,
}

impl BackendActivity {
    pub fn is_idle(self) -> bool {
        matches!(self, Self::Idle { .. })
    }

    /// When an idle snapshot should be taken under `strategy`, or `None` if there is no idle
    /// deadline (busy, stopping, or an idle period excluded by `strategy`).
    pub fn idle_deadline(
        self,
        strategy: IdleDeadlineStrategy,
        timeout: Duration,
    ) -> Option<Instant> {
        let Self::Idle { since } = self else {
            return None;
        };
        match strategy {
            IdleDeadlineStrategy::Fresh { not_before } => Some(since.max(not_before) + timeout),
            IdleDeadlineStrategy::After { cutoff } => (since > cutoff).then(|| since + timeout),
        }
    }

    /// Whether the idle snapshot is due now. Call this with the latest value: the idle period may
    /// have changed since a deadline was computed.
    pub fn should_snapshot(self, strategy: IdleDeadlineStrategy, timeout: Duration) -> bool {
        self.idle_deadline(strategy, timeout)
            .is_some_and(|deadline| deadline <= Instant::now())
    }

    #[cfg(test)]
    fn should_snapshot_at(
        self,
        strategy: IdleDeadlineStrategy,
        timeout: Duration,
        now: Instant,
    ) -> bool {
        self.idle_deadline(strategy, timeout)
            .is_some_and(|deadline| deadline <= now)
    }
}

/// Which idle periods get an idle-snapshot deadline, and from when it is timed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum IdleDeadlineStrategy {
    /// Any idle period, timed from when it began but not before `not_before`.
    Fresh { not_before: Instant },
    /// Only an idle period that began strictly after `cutoff`, timed from when it began.
    After { cutoff: Instant },
}

/// Owns the [`BackendActivity`] channel and the active-time stopwatch. Updates only notify
/// receivers when the value actually changes.
pub(crate) struct ActivityMonitor {
    sender: watch::Sender<BackendActivity>,
    /// Runs while `Busy` is published, stops while `Idle` or `Stopping` is. Publications update it
    /// under the channel's lock, together with the published value.
    active_time: Mutex<Stopwatch>,
}

impl ActivityMonitor {
    /// Starts out idle: no foreground job can be scheduled before the backend exists.
    pub fn new() -> Self {
        Self::with_idle_since(Instant::now())
    }

    fn with_idle_since(since: Instant) -> Self {
        Self {
            sender: watch::Sender::new(BackendActivity::Idle { since }),
            active_time: Mutex::new(Stopwatch::new()),
        }
    }

    /// Publishes `Idle` or `Busy` as reported by `is_idle`. Does nothing once `Stopping` was
    /// published, and keeps the existing `Idle { since }` if already idle. Returns whether the
    /// value changed.
    // Accepts the idle state as a predicate because idle transitions are not synchronized with
    // each other.
    pub fn publish_idle_state(&self, is_idle: impl FnOnce() -> bool) -> bool {
        self.publish_idle_state_with(is_idle, Instant::now)
    }

    #[cfg(test)]
    fn publish_idle_state_at(&self, is_idle: bool, now: Instant) -> bool {
        self.publish_idle_state_with(|| is_idle, || now)
    }

    fn publish_idle_state_with(
        &self,
        is_idle: impl FnOnce() -> bool,
        now: impl FnOnce() -> Instant,
    ) -> bool {
        self.sender.send_if_modified(|activity| {
            if *activity == BackendActivity::Stopping {
                return false;
            }
            let is_idle = is_idle();
            if is_idle == activity.is_idle() {
                return false;
            }
            let mut active_time = self.active_time.lock();
            let now = now();
            if is_idle {
                active_time.stop_at(now.into_std());
                *activity = BackendActivity::Idle { since: now };
            } else {
                active_time.start_at(now.into_std());
                *activity = BackendActivity::Busy;
            }
            true
        })
    }

    /// Publishes `Stopping` and stops the active-time stopwatch. Returns whether the value
    /// changed.
    pub fn publish_stopping(&self) -> bool {
        self.publish_stopping_with(Instant::now)
    }

    #[cfg(test)]
    fn publish_stopping_at(&self, now: Instant) -> bool {
        self.publish_stopping_with(|| now)
    }

    fn publish_stopping_with(&self, now: impl FnOnce() -> Instant) -> bool {
        self.sender.send_if_modified(|activity| {
            if *activity == BackendActivity::Stopping {
                return false;
            }
            let mut active_time = self.active_time.lock();
            active_time.stop_at(now().into_std());
            *activity = BackendActivity::Stopping;
            true
        })
    }

    /// The latest published value.
    pub fn status(&self) -> BackendActivity {
        *self.sender.borrow()
    }

    /// A subscriber that considers the current value seen: [`ActivitySubscriber::changed`] only
    /// reports later changes.
    pub fn subscribe(&self) -> ActivitySubscriber {
        ActivitySubscriber(self.sender.subscribe())
    }

    /// Accumulated active (non-idle) time since the last reset, including a running busy period.
    pub fn active_time(&self) -> Duration {
        self.active_time_with(Instant::now)
    }

    #[cfg(test)]
    fn active_time_at(&self, now: Instant) -> Duration {
        self.active_time_with(|| now)
    }

    /// Discards the accumulated active time. A running busy period keeps running from now.
    pub fn reset_active_time(&self) {
        self.reset_active_time_with(Instant::now)
    }

    #[cfg(test)]
    fn reset_active_time_at(&self, now: Instant) {
        self.reset_active_time_with(|| now)
    }

    // The time is taken after locking, so it can't predate a busy period published in between.

    fn active_time_with(&self, now: impl FnOnce() -> Instant) -> Duration {
        let active_time = self.active_time.lock();
        active_time.elapsed_at(now().into_std())
    }

    fn reset_active_time_with(&self, now: impl FnOnce() -> Instant) {
        let mut active_time = self.active_time.lock();
        active_time.reset_at(now().into_std());
    }
}

/// Receives the [`BackendActivity`] published by an [`ActivityMonitor`].
pub(crate) struct ActivitySubscriber(watch::Receiver<BackendActivity>);

impl ActivitySubscriber {
    /// The latest value. Marks it as seen, so [`Self::changed`] only waits for later changes.
    pub fn status(&mut self) -> BackendActivity {
        *self.0.borrow_and_update()
    }

    /// Waits for a value newer than the last one seen. Fails once the monitor is dropped.
    pub async fn changed(&mut self) -> Result<(), watch::error::RecvError> {
        self.0.changed().await
    }

    /// Waits until the latest value satisfies `predicate`, checking the current value first.
    /// Fails once the monitor is dropped.
    #[cfg(feature = "verify_aggregation_graph")]
    pub async fn wait_for(
        &mut self,
        mut predicate: impl FnMut(BackendActivity) -> bool,
    ) -> Result<(), watch::error::RecvError> {
        self.0
            .wait_for(|activity| predicate(*activity))
            .await
            .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use tokio::time::{Duration, Instant};

    use super::{ActivityMonitor, BackendActivity, IdleDeadlineStrategy};

    const TIMEOUT: Duration = Duration::from_secs(5);

    fn clock() -> impl Fn(u64) -> Instant {
        let base = Instant::now();
        move |ms: u64| base + Duration::from_millis(ms)
    }

    fn idle(since: Instant) -> BackendActivity {
        BackendActivity::Idle { since }
    }

    /// The idle hooks run after the foreground-job counter changed, in no particular order, so a
    /// late hook must not overwrite a newer state.
    #[test]
    fn stale_hooks_converge_to_the_sampled_state() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));

        assert!(monitor.publish_idle_state_at(false, at(10))); // idle_end, counter busy
        assert!(!monitor.publish_idle_state_at(false, at(20))); // late idle_start, still busy
        assert_eq!(monitor.status(), BackendActivity::Busy);

        assert!(monitor.publish_idle_state_at(true, at(30))); // idle_start, counter idle
        assert!(!monitor.publish_idle_state_at(true, at(40))); // late idle_end, idle again
        assert_eq!(monitor.status(), idle(at(30)));
    }

    /// Busy and idle again before the subscriber looks: it sees one change, to a new idle period
    /// with a later deadline, so the earlier deadline no longer triggers a snapshot.
    #[test]
    fn coalesced_idle_busy_idle_is_a_new_idle_period() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        let mut subscriber = monitor.subscribe();
        let strategy = IdleDeadlineStrategy::Fresh { not_before: at(0) };
        let old_deadline = subscriber
            .status()
            .idle_deadline(strategy, TIMEOUT)
            .unwrap();

        monitor.publish_idle_state_at(false, at(1_000));
        monitor.publish_idle_state_at(true, at(1_500));

        let latest = subscriber.status();
        assert_eq!(latest, idle(at(1_500)));
        assert!(!latest.should_snapshot_at(strategy, TIMEOUT, old_deadline));
        assert!(latest.should_snapshot_at(strategy, TIMEOUT, at(1_500) + TIMEOUT));
    }

    #[test]
    fn stopping_is_terminal_and_stops_active_time() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        monitor.publish_idle_state_at(false, at(100));

        assert!(monitor.publish_stopping_at(at(400)));
        assert!(!monitor.publish_idle_state_at(true, at(500)));
        assert!(!monitor.publish_idle_state_at(false, at(600)));
        assert!(!monitor.publish_stopping_at(at(700)));

        assert_eq!(monitor.status(), BackendActivity::Stopping);
        assert_eq!(
            monitor.active_time_at(at(60_000)),
            Duration::from_millis(300)
        );
    }

    /// Used at startup, after a snapshot with new data, and to retry an idle snapshot that
    /// couldn't run: an idle period that began earlier still waits a full timeout from
    /// `not_before`.
    #[test]
    fn fresh_deadline_is_timed_from_the_later_of_since_and_not_before() {
        let at = clock();
        let strategy = IdleDeadlineStrategy::Fresh {
            not_before: at(1_000),
        };
        assert_eq!(
            idle(at(500)).idle_deadline(strategy, TIMEOUT),
            Some(at(1_000) + TIMEOUT)
        );
        assert_eq!(
            idle(at(1_500)).idle_deadline(strategy, TIMEOUT),
            Some(at(1_500) + TIMEOUT)
        );
        assert_eq!(BackendActivity::Busy.idle_deadline(strategy, TIMEOUT), None);
        assert_eq!(
            BackendActivity::Stopping.idle_deadline(strategy, TIMEOUT),
            None
        );
    }

    /// Used after a snapshot that persisted nothing (cutoff: the attempt's start) or a skip for
    /// low active time (cutoff: the skip): only a later idle period gets a deadline.
    #[test]
    fn after_deadline_requires_idle_to_begin_after_the_cutoff() {
        let at = clock();
        let strategy = IdleDeadlineStrategy::After { cutoff: at(1_000) };
        assert_eq!(idle(at(500)).idle_deadline(strategy, TIMEOUT), None);
        assert_eq!(idle(at(1_000)).idle_deadline(strategy, TIMEOUT), None);
        assert_eq!(
            idle(at(1_200)).idle_deadline(strategy, TIMEOUT),
            Some(at(1_200) + TIMEOUT)
        );
    }

    #[test]
    fn active_time_accumulates_and_resets() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        monitor.publish_idle_state_at(false, at(100));
        monitor.publish_idle_state_at(true, at(400));
        monitor.publish_idle_state_at(false, at(1_000));
        monitor.publish_idle_state_at(true, at(1_250));
        assert_eq!(
            monitor.active_time_at(at(5_000)),
            Duration::from_millis(550)
        );

        // A running busy period counts, and keeps running from a reset.
        monitor.publish_idle_state_at(false, at(6_000));
        assert_eq!(
            monitor.active_time_at(at(6_250)),
            Duration::from_millis(800)
        );
        monitor.reset_active_time_at(at(6_250));
        assert_eq!(monitor.active_time_at(at(6_250)), Duration::ZERO);
        assert_eq!(
            monitor.active_time_at(at(6_500)),
            Duration::from_millis(250)
        );
    }
}
