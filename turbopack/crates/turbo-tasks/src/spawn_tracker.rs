use std::{
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    task::{Context, Poll},
};

use pin_project_lite::pin_project;

use crate::event::Event;

/// Counts spawned futures that are still alive, so that a caller can wait until all of them have
/// been dropped.
///
/// Job counters (e.g. foreground/background jobs in `TurboTasks`) are decremented from *within* a
/// spawned future, so they only tell that the work is done, not that the future (and everything it
/// captured, e.g. an `Arc<TurboTasks>`) has been dropped. This tracker closes that gap: a
/// [`SpawnGuard`] is held alongside the future and only released after the future was dropped.
pub(crate) struct SpawnTracker {
    count: AtomicUsize,
    event: Event,
}

impl SpawnTracker {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            count: AtomicUsize::new(0),
            event: Event::new(|| || "SpawnTracker::event".to_string()),
        })
    }

    /// Registers a new live future. The future counts as alive until the returned guard is dropped.
    pub fn guard(self: &Arc<Self>) -> SpawnGuard {
        self.count.fetch_add(1, Ordering::AcqRel);
        SpawnGuard {
            tracker: self.clone(),
        }
    }

    /// Wraps `future` so it counts as alive until it has been dropped.
    pub fn track<F: Future>(self: &Arc<Self>, future: F) -> Tracked<F> {
        Tracked {
            future,
            _guard: self.guard(),
        }
    }

    /// Waits until all tracked futures have been dropped.
    pub async fn wait_for_all_dropped(&self) {
        loop {
            let listener = self
                .event
                .listen_with_note(|| || "wait for spawned futures to be dropped".to_string());
            if self.count.load(Ordering::Acquire) == 0 {
                return;
            }
            listener.await;
        }
    }
}

/// Keeps a future registered as alive in a [`SpawnTracker`] until dropped.
///
/// When stored in the same struct as the tracked future, it must be declared *after* it, so that
/// the future is dropped first (struct fields are dropped in declaration order).
pub(crate) struct SpawnGuard {
    tracker: Arc<SpawnTracker>,
}

impl Drop for SpawnGuard {
    fn drop(&mut self) {
        if self.tracker.count.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.tracker.event.notify(usize::MAX);
        }
    }
}

pin_project! {
    /// A future that counts as alive in a [`SpawnTracker`] until it has been dropped.
    pub(crate) struct Tracked<F> {
        #[pin]
        future: F,
        // Declared after `future`, so it's dropped after it.
        _guard: SpawnGuard,
    }
}

impl<F: Future> Future for Tracked<F> {
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        self.project().future.poll(cx)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        future::poll_fn,
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        task::Poll,
    };

    use futures::FutureExt;

    use super::SpawnTracker;

    struct CountOnDrop {
        tracker: Arc<SpawnTracker>,
        tracked_count_on_drop: Arc<AtomicUsize>,
    }

    impl Drop for CountOnDrop {
        fn drop(&mut self) {
            self.tracked_count_on_drop.store(
                self.tracker.count.load(Ordering::Acquire),
                Ordering::Release,
            );
        }
    }

    #[test]
    fn tracked_future_stays_counted_until_its_captures_are_dropped() {
        let tracker = SpawnTracker::new();
        let tracked_count_on_drop = Arc::new(AtomicUsize::new(usize::MAX));
        let captured = CountOnDrop {
            tracker: tracker.clone(),
            tracked_count_on_drop: tracked_count_on_drop.clone(),
        };

        // A pending future, so `captured` is only dropped together with the tracked future.
        let mut future = Box::pin(tracker.track(async move {
            let _captured = captured;
            poll_fn(|_| Poll::<()>::Pending).await;
        }));

        assert!(future.as_mut().now_or_never().is_none());
        assert_eq!(tracker.count.load(Ordering::Acquire), 1);

        drop(future);

        // The guard is released only after the future's captures were dropped.
        assert_eq!(tracked_count_on_drop.load(Ordering::Acquire), 1);
        assert_eq!(tracker.count.load(Ordering::Acquire), 0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn wait_for_all_dropped_waits_for_cancelled_future() {
        let tracker = SpawnTracker::new();
        let handle = tokio::spawn(tracker.track(poll_fn(|_| Poll::<()>::Pending)));

        assert_eq!(tracker.count.load(Ordering::Acquire), 1);
        handle.abort();
        let _ = handle.await;

        tracker.wait_for_all_dropped().await;
        assert_eq!(tracker.count.load(Ordering::Acquire), 0);
    }
}
