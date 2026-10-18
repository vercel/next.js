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

/// Which idle periods arm the idle-snapshot timer, and from when it is timed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum IdleArming {
    /// Any idle period, timed from when it began but not before `not_before`.
    Fresh { not_before: Instant },
    /// Only an idle period that began strictly after `cutoff`, timed from when it began.
    After { cutoff: Instant },
}

impl BackendActivity {
    pub fn is_idle(self) -> bool {
        matches!(self, Self::Idle { .. })
    }

    /// When an idle snapshot should be taken given `arming`, or `None` if this value doesn't arm
    /// the timer (busy, stopping, or an idle period excluded by `arming`).
    pub fn idle_deadline(self, arming: IdleArming, timeout: Duration) -> Option<Instant> {
        let Self::Idle { since } = self else {
            return None;
        };
        match arming {
            IdleArming::Fresh { not_before } => Some(since.max(not_before) + timeout),
            IdleArming::After { cutoff } => (since > cutoff).then(|| since + timeout),
        }
    }

    /// Whether to take the idle snapshot at `now`. Call this with the latest value: the idle
    /// period may have changed since a deadline was computed.
    pub fn should_snapshot(self, arming: IdleArming, timeout: Duration, now: Instant) -> bool {
        self.idle_deadline(arming, timeout)
            .is_some_and(|deadline| deadline <= now)
    }
}

/// Owns the [`BackendActivity`] channel and the active-time stopwatch. Updates only notify
/// receivers when the value actually changes.
pub(crate) struct ActivityMonitor {
    sender: watch::Sender<BackendActivity>,
    /// Runs while `Busy` is published, stops while `Idle` is. Publications update it under the
    /// channel's lock, together with the published value; reads and resets only take its own
    /// lock.
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
    ///
    /// Takes a predicate instead of the new state because the idle hooks can run out of order:
    /// `TurboTasks` calls `idle_start` / `idle_end` *after* updating its foreground-job counter,
    /// from whichever thread made the transition, with no ordering between those threads. So a
    /// hook may run after a newer, opposite transition was already published. `is_idle` is
    /// sampled under the channel's lock, so whichever update runs last sees the counter after
    /// every transition before it, and the published value converges to the counter.
    pub fn publish_idle_state(&self, is_idle: impl FnOnce() -> bool) -> bool {
        self.publish_idle_state_with(is_idle, Instant::now)
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
            // Sampled under both locks, so a concurrent reset can't interleave with it.
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

    /// Publishes `Stopping`. Returns whether the value changed.
    pub fn publish_stopping(&self) -> bool {
        self.sender.send_if_modified(|activity| {
            let changed = *activity != BackendActivity::Stopping;
            *activity = BackendActivity::Stopping;
            changed
        })
    }

    /// The latest published value.
    pub fn current(&self) -> BackendActivity {
        *self.sender.borrow()
    }

    /// A receiver that considers the current value seen: [`watch::Receiver::changed`] reports
    /// only later changes. Check the current value (e.g. with [`watch::Receiver::borrow`]) before
    /// waiting, so a terminal `Stopping` that is already published isn't waited for.
    pub fn subscribe(&self) -> watch::Receiver<BackendActivity> {
        self.sender.subscribe()
    }

    /// Accumulated active (non-idle) time since the last reset, including a running busy period.
    pub fn active_time(&self) -> Duration {
        self.active_time_with(Instant::now)
    }

    /// Discards the accumulated active time. A running busy period keeps running from now.
    pub fn reset_active_time(&self) {
        self.reset_active_time_with(Instant::now)
    }

    // The time is sampled under the stopwatch's lock: a time taken before it could predate a
    // busy period published in between.

    fn active_time_with(&self, now: impl FnOnce() -> Instant) -> Duration {
        let active_time = self.active_time.lock();
        active_time.elapsed_at(now().into_std())
    }

    fn reset_active_time_with(&self, now: impl FnOnce() -> Instant) {
        let mut active_time = self.active_time.lock();
        active_time.reset_at(now().into_std());
    }
}

#[cfg(test)]
mod tests {
    use std::{
        pin::pin,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        task::{Context, Poll, Wake, Waker},
    };

    use tokio::time::{Duration, Instant};

    use super::{ActivityMonitor, BackendActivity, IdleArming};

    const TIMEOUT: Duration = Duration::from_secs(5);

    fn clock() -> impl Fn(u64) -> Instant {
        let base = Instant::now();
        move |ms: u64| base + Duration::from_millis(ms)
    }

    /// Publishes the sampled idle state at a fixed time.
    fn publish(monitor: &ActivityMonitor, is_idle: bool, now: Instant) -> bool {
        monitor.publish_idle_state_with(|| is_idle, || now)
    }

    fn active_at(monitor: &ActivityMonitor, now: Instant) -> Duration {
        monitor.active_time_with(|| now)
    }

    fn reset_at(monitor: &ActivityMonitor, now: Instant) {
        monitor.reset_active_time_with(|| now)
    }

    fn idle(since: Instant) -> BackendActivity {
        BackendActivity::Idle { since }
    }

    /// A waker that records whether it was woken.
    struct FlagWaker(AtomicBool);

    impl Wake for FlagWaker {
        fn wake(self: Arc<Self>) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    // --- publishing ---

    /// `idle_end` publishes for a 0 → 1 transition, but the `idle_start` of an earlier 1 → 0
    /// transition only runs afterwards, while the counter shows busy again.
    #[test]
    fn stale_idle_start_while_busy_stays_busy() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        assert!(publish(&monitor, false, at(10))); // idle_end, counter busy
        assert!(!publish(&monitor, false, at(20))); // late idle_start, counter still busy
        assert_eq!(monitor.current(), BackendActivity::Busy);
    }

    /// The mirror image: a late `idle_end` runs after the counter has gone back to idle.
    #[test]
    fn stale_idle_end_while_idle_stays_idle() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        publish(&monitor, false, at(10));
        assert!(publish(&monitor, true, at(20))); // idle_start, counter idle
        assert!(!publish(&monitor, true, at(30))); // late idle_end, counter idle again
        assert_eq!(monitor.current(), idle(at(20)));
    }

    #[test]
    fn unchanged_idle_sample_keeps_since() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        let receiver = monitor.subscribe();
        assert!(!publish(&monitor, true, at(100)));
        assert_eq!(monitor.current(), idle(at(0)));
        assert!(!receiver.has_changed().unwrap());
    }

    /// Busy and idle again before the receiver looks: it sees one change, to a new idle period
    /// with a later `since`, and so a later deadline.
    #[test]
    fn coalesced_idle_busy_idle_is_a_new_idle_period() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        let mut receiver = monitor.subscribe();
        let arming = IdleArming::Fresh { not_before: at(0) };
        let before = receiver.borrow().idle_deadline(arming, TIMEOUT);

        publish(&monitor, false, at(1_000));
        publish(&monitor, true, at(1_500));

        assert!(receiver.has_changed().unwrap());
        let current = *receiver.borrow_and_update();
        assert_eq!(current, idle(at(1_500)));
        assert_eq!(before, Some(at(0) + TIMEOUT));
        assert_eq!(
            current.idle_deadline(arming, TIMEOUT),
            Some(at(1_500) + TIMEOUT)
        );
    }

    #[test]
    fn stopping_is_terminal() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        assert!(monitor.publish_stopping());
        let receiver = monitor.subscribe();

        assert!(!publish(&monitor, false, at(10)));
        assert!(!publish(&monitor, true, at(20)));
        assert!(!monitor.publish_stopping());

        assert_eq!(monitor.current(), BackendActivity::Stopping);
        assert!(!receiver.has_changed().unwrap());
    }

    #[test]
    fn late_receiver_observes_stopping_without_waiting() {
        let monitor = ActivityMonitor::new();
        monitor.publish_stopping();
        let mut receiver = monitor.subscribe();
        assert_eq!(*receiver.borrow_and_update(), BackendActivity::Stopping);
    }

    /// The receiver is provably parked in `changed()` (polled to `Pending`) before `Stopping` is
    /// published. Publishing must wake it, and it must then observe `Stopping`.
    #[test]
    fn waiting_receiver_wakes_on_stopping() {
        let monitor = ActivityMonitor::new();
        let mut receiver = monitor.subscribe();
        let flag = Arc::new(FlagWaker(AtomicBool::new(false)));
        let waker = Waker::from(flag.clone());
        let mut cx = Context::from_waker(&waker);

        {
            let mut changed = pin!(receiver.changed());
            assert!(changed.as_mut().poll(&mut cx).is_pending());

            monitor.publish_stopping();

            assert!(
                flag.0.load(Ordering::SeqCst),
                "the waiting receiver wasn't woken"
            );
            assert!(matches!(
                changed.as_mut().poll(&mut cx),
                Poll::Ready(Ok(()))
            ));
        }
        assert_eq!(*receiver.borrow_and_update(), BackendActivity::Stopping);
    }

    // --- deadlines ---

    #[test]
    fn fresh_deadline_is_timed_from_the_later_of_since_and_not_before() {
        let at = clock();
        let arming = IdleArming::Fresh {
            not_before: at(1_000),
        };
        assert_eq!(
            idle(at(500)).idle_deadline(arming, TIMEOUT),
            Some(at(1_000) + TIMEOUT)
        );
        assert_eq!(
            idle(at(1_000)).idle_deadline(arming, TIMEOUT),
            Some(at(1_000) + TIMEOUT)
        );
        assert_eq!(
            idle(at(1_500)).idle_deadline(arming, TIMEOUT),
            Some(at(1_500) + TIMEOUT)
        );
    }

    #[test]
    fn after_deadline_requires_idle_to_begin_strictly_after_the_cutoff() {
        let at = clock();
        let arming = IdleArming::After { cutoff: at(1_000) };
        assert_eq!(idle(at(500)).idle_deadline(arming, TIMEOUT), None);
        assert_eq!(idle(at(1_000)).idle_deadline(arming, TIMEOUT), None);
        assert_eq!(
            idle(at(1_500)).idle_deadline(arming, TIMEOUT),
            Some(at(1_500) + TIMEOUT)
        );
    }

    #[test]
    fn busy_and_stopping_have_no_deadline() {
        let at = clock();
        for arming in [
            IdleArming::Fresh { not_before: at(0) },
            IdleArming::After { cutoff: at(0) },
        ] {
            assert_eq!(BackendActivity::Busy.idle_deadline(arming, TIMEOUT), None);
            assert_eq!(
                BackendActivity::Stopping.idle_deadline(arming, TIMEOUT),
                None
            );
            assert!(!BackendActivity::Busy.should_snapshot(arming, TIMEOUT, at(60_000)));
            assert!(!BackendActivity::Stopping.should_snapshot(arming, TIMEOUT, at(60_000)));
        }
    }

    // --- the snapshot-on-deadline decision ---

    /// The deadline computed for an earlier idle period is reached, but the latest value is a
    /// newer idle period: no snapshot yet, its own deadline is later.
    #[test]
    fn no_snapshot_when_the_idle_period_changed_after_the_deadline_was_computed() {
        let at = clock();
        let arming = IdleArming::Fresh { not_before: at(0) };
        let deadline = idle(at(0)).idle_deadline(arming, TIMEOUT).unwrap();

        let latest = idle(at(3_000));
        assert!(!latest.should_snapshot(arming, TIMEOUT, deadline));
        assert!(latest.should_snapshot(arming, TIMEOUT, at(3_000) + TIMEOUT));
    }

    #[test]
    fn snapshot_when_the_deadline_passed_for_the_same_idle_period() {
        let at = clock();
        let arming = IdleArming::Fresh { not_before: at(0) };
        let latest = idle(at(0));
        assert!(!latest.should_snapshot(arming, TIMEOUT, at(4_999)));
        assert!(latest.should_snapshot(arming, TIMEOUT, at(5_000)));
        assert!(latest.should_snapshot(arming, TIMEOUT, at(9_000)));
    }

    // --- the snapshot loop's cycle arming paths ---

    /// After an idle snapshot found operations in flight, or after a snapshot that persisted new
    /// data, the next cycle is `Fresh` from its start: an idle period that began earlier waits a
    /// full timeout again instead of snapshotting right away.
    #[test]
    fn fresh_cycle_waits_a_full_timeout_from_the_cycle_start() {
        let at = clock();
        let latest = idle(at(0));
        let cycle_start = at(20_000);
        let arming = IdleArming::Fresh {
            not_before: cycle_start,
        };
        assert!(!latest.should_snapshot(arming, TIMEOUT, cycle_start));
        assert!(!latest.should_snapshot(
            arming,
            TIMEOUT,
            cycle_start + TIMEOUT - Duration::from_millis(1)
        ));
        assert!(latest.should_snapshot(arming, TIMEOUT, cycle_start + TIMEOUT));
    }

    /// After a snapshot that persisted nothing, the cutoff is the attempt's start. The idle
    /// period the attempt covered doesn't re-arm; one that began during the attempt does.
    #[test]
    fn after_no_data_snapshot_only_an_idle_period_from_during_the_attempt_re_arms() {
        let at = clock();
        let attempt_start = at(10_000);
        let arming = IdleArming::After {
            cutoff: attempt_start,
        };

        let covered = idle(at(0));
        assert!(!covered.should_snapshot(arming, TIMEOUT, at(60_000)));

        // A request came and went while the snapshot was running.
        let during_attempt = idle(at(10_200));
        assert_eq!(
            during_attempt.idle_deadline(arming, TIMEOUT),
            Some(at(10_200) + TIMEOUT)
        );
        assert!(during_attempt.should_snapshot(arming, TIMEOUT, at(10_200) + TIMEOUT));
    }

    /// After a low-active-time skip, the cutoff is the skip decision: only a later idle period
    /// re-arms.
    #[test]
    fn after_low_active_skip_only_a_later_idle_period_re_arms() {
        let at = clock();
        let decision = at(30_000);
        let arming = IdleArming::After { cutoff: decision };

        assert!(!idle(at(25_000)).should_snapshot(arming, TIMEOUT, at(90_000)));
        let later = idle(at(31_000));
        assert!(!later.should_snapshot(
            arming,
            TIMEOUT,
            at(31_000) + TIMEOUT - Duration::from_millis(1)
        ));
        assert!(later.should_snapshot(arming, TIMEOUT, at(31_000) + TIMEOUT));
    }

    // --- active time ---

    #[test]
    fn active_time_accumulates_across_busy_periods() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        publish(&monitor, false, at(100));
        publish(&monitor, true, at(400));
        publish(&monitor, false, at(1_000));
        publish(&monitor, true, at(1_250));

        assert_eq!(active_at(&monitor, at(5_000)), Duration::from_millis(550));
    }

    /// The receiver only sees the final idle value, but the busy period in between still counts.
    #[test]
    fn active_time_counts_busy_periods_the_receiver_saw_coalesced() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        let mut receiver = monitor.subscribe();
        publish(&monitor, false, at(1_000));
        publish(&monitor, true, at(1_700));

        assert_eq!(*receiver.borrow_and_update(), idle(at(1_700)));
        assert_eq!(active_at(&monitor, at(2_000)), Duration::from_millis(700));
    }

    #[test]
    fn active_time_includes_a_running_busy_period() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        publish(&monitor, false, at(100));
        assert_eq!(active_at(&monitor, at(350)), Duration::from_millis(250));
    }

    #[test]
    fn reset_active_time_while_busy_keeps_running_from_now() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        publish(&monitor, false, at(0));
        reset_at(&monitor, at(1_000));
        assert_eq!(active_at(&monitor, at(1_000)), Duration::ZERO);
        assert_eq!(active_at(&monitor, at(1_250)), Duration::from_millis(250));
    }

    #[test]
    fn reset_active_time_while_idle_discards_everything() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        publish(&monitor, false, at(0));
        publish(&monitor, true, at(800));
        reset_at(&monitor, at(900));
        assert_eq!(active_at(&monitor, at(5_000)), Duration::ZERO);
    }

    /// Every time sample used for active time is taken while the stopwatch's lock is held, so a
    /// concurrent publication or reset can't slip in between sampling and applying it.
    #[test]
    fn active_time_clock_is_sampled_under_the_stopwatch_lock() {
        let at = clock();
        let monitor = ActivityMonitor::with_idle_since(at(0));
        let locked = |monitor: &ActivityMonitor| monitor.active_time.try_lock().is_none();

        monitor.publish_idle_state_with(
            || false,
            || {
                assert!(locked(&monitor), "publication sampled the clock unlocked");
                at(100)
            },
        );
        monitor.reset_active_time_with(|| {
            assert!(locked(&monitor), "reset sampled the clock unlocked");
            at(200)
        });
        let elapsed = monitor.active_time_with(|| {
            assert!(locked(&monitor), "read sampled the clock unlocked");
            at(450)
        });
        assert_eq!(elapsed, Duration::from_millis(250));
    }
}
