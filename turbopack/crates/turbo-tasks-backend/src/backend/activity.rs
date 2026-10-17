//! Whether the backend is idle, busy or stopping, published through a [`tokio::sync::watch`]
//! channel.
//!
//! A watch channel always exposes the latest published value: a receiver can't miss a published
//! change, it can only see several of them coalesced into one. Consumers therefore never have to
//! re-check some other source of truth after waking up. (Foreground-job transitions that cancel
//! out before a hook samples the counter don't publish anything at all.)
//!
//! The idle hooks need one extra precaution. `TurboTasks` calls [`Backend::idle_start`] and
//! [`Backend::idle_end`] *after* updating its foreground-job counter, from whichever thread made
//! the 0 → 1 or 1 → 0 transition, with no ordering between those threads. A hook can therefore
//! run after a newer, opposite transition has already been published. So a hook doesn't publish
//! its own kind; it samples [`TurboTasks::is_idle`] inside the channel's update closure, which runs
//! under the channel's lock. Whichever update runs last samples the counter after every
//! transition that preceded it, so the published value converges to the counter.
//!
//! [`Backend::idle_start`]: turbo_tasks::backend::Backend::idle_start
//! [`Backend::idle_end`]: turbo_tasks::backend::Backend::idle_end
//! [`TurboTasks::is_idle`]: turbo_tasks::TurboTasks::is_idle

use tokio::sync::watch;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BackendActivity {
    /// No foreground job is scheduled.
    Idle,
    /// At least one foreground job is scheduled.
    Busy,
    /// The backend is shutting down. Terminal: never replaced by `Idle` or `Busy`.
    Stopping,
}

impl BackendActivity {
    pub fn is_idle(self) -> bool {
        self == Self::Idle
    }
}

/// The sending side of the [`BackendActivity`] channel. Updates only notify receivers when the
/// value actually changes.
pub(crate) struct ActivityPublisher {
    sender: watch::Sender<BackendActivity>,
}

impl ActivityPublisher {
    /// Starts out `Idle`: no foreground job can be scheduled before the backend exists.
    pub fn new() -> Self {
        Self {
            sender: watch::Sender::new(BackendActivity::Idle),
        }
    }

    /// Publishes `Idle` or `Busy` as reported by `is_idle`, which is called under the channel's
    /// lock. Does nothing once `Stopping` was published. Returns whether the value changed.
    pub fn publish_idle(&self, is_idle: impl FnOnce() -> bool) -> bool {
        self.sender.send_if_modified(|activity| {
            if *activity == BackendActivity::Stopping {
                return false;
            }
            let observed = if is_idle() {
                BackendActivity::Idle
            } else {
                BackendActivity::Busy
            };
            let changed = *activity != observed;
            *activity = observed;
            changed
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

    use super::{ActivityPublisher, BackendActivity};

    /// A waker that records whether it was woken.
    struct FlagWaker(AtomicBool);

    impl Wake for FlagWaker {
        fn wake(self: Arc<Self>) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    /// `idle_end` publishes for a 0 → 1 transition, but the `idle_start` of an earlier 1 → 0
    /// transition only runs afterwards, while the counter shows busy again.
    #[test]
    fn stale_idle_start_while_busy_stays_busy() {
        let publisher = ActivityPublisher::new();
        assert!(publisher.publish_idle(|| false)); // idle_end, counter busy
        assert!(!publisher.publish_idle(|| false)); // late idle_start, counter still busy
        assert_eq!(publisher.current(), BackendActivity::Busy);
    }

    /// The mirror image: a late `idle_end` runs after the counter has gone back to idle.
    #[test]
    fn stale_idle_end_while_idle_stays_idle() {
        let publisher = ActivityPublisher::new();
        publisher.publish_idle(|| false);
        assert!(publisher.publish_idle(|| true)); // idle_start, counter idle
        assert!(!publisher.publish_idle(|| true)); // late idle_end, counter idle again
        assert_eq!(publisher.current(), BackendActivity::Idle);
    }

    #[test]
    fn unchanged_sample_does_not_mark_changed() {
        let publisher = ActivityPublisher::new();
        let receiver = publisher.subscribe();
        assert!(!publisher.publish_idle(|| true));
        assert!(!receiver.has_changed().unwrap());
    }

    /// Busy and idle again before the receiver looks: the receiver sees one change, ending idle.
    /// The snapshot loop treats that as a new idle period.
    #[test]
    fn coalesced_idle_busy_idle_marks_changed_with_idle() {
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        assert!(publisher.publish_idle(|| false));
        assert!(publisher.publish_idle(|| true));
        assert!(receiver.has_changed().unwrap());
        assert_eq!(*receiver.borrow_and_update(), BackendActivity::Idle);
    }

    #[test]
    fn stopping_is_terminal() {
        let publisher = ActivityPublisher::new();
        assert!(publisher.publish_stopping());
        let receiver = publisher.subscribe();

        assert!(!publisher.publish_idle(|| false));
        assert!(!publisher.publish_idle(|| true));
        assert!(!publisher.publish_stopping());

        assert_eq!(publisher.current(), BackendActivity::Stopping);
        assert!(!receiver.has_changed().unwrap());
    }

    #[test]
    fn late_receiver_observes_stopping_without_waiting() {
        let publisher = ActivityPublisher::new();
        publisher.publish_stopping();
        let mut receiver = publisher.subscribe();
        assert_eq!(*receiver.borrow_and_update(), BackendActivity::Stopping);
    }

    /// The receiver is provably parked in `changed()` (polled to `Pending`) before `Stopping` is
    /// published. Publishing must wake it, and it must then observe `Stopping`.
    #[test]
    fn waiting_receiver_wakes_on_stopping() {
        let publisher = ActivityPublisher::new();
        let mut receiver = publisher.subscribe();
        let flag = Arc::new(FlagWaker(AtomicBool::new(false)));
        let waker = Waker::from(flag.clone());
        let mut cx = Context::from_waker(&waker);

        {
            let mut changed = pin!(receiver.changed());
            assert!(changed.as_mut().poll(&mut cx).is_pending());

            publisher.publish_stopping();

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
}
