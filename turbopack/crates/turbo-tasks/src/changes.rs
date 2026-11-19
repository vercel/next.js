//! Tracks changes whose new values may already be readable while tasks that depend on the old
//! values are not marked dirty yet, so that a root which looks settled during such a change is
//! not taken as current. See [`crate::read_strongly_consistent_and_apply_effects`].

use std::sync::{
    LazyLock,
    atomic::{AtomicU64, Ordering},
};

use crate::event::Event;

/// The number of changes in progress.
static IN_PROGRESS: AtomicU64 = AtomicU64::new(0);
/// Incremented whenever a change starts or ends. 64 bits don't wrap in practice.
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// Notified whenever a change ends.
static ENDED: LazyLock<Event> = LazyLock::new(|| Event::new(|| || "changes ended".to_string()));

/// A change in progress: from before it can be observed (a new value becomes readable, or a task
/// is marked dirty) until the dirtiness of every task depending on the old value has propagated
/// to their aggregating ancestors. Ends when dropped.
#[doc(hidden)]
pub struct ChangeInProgress(());

impl ChangeInProgress {
    pub fn start() -> Self {
        IN_PROGRESS.fetch_add(1, Ordering::SeqCst);
        GENERATION.fetch_add(1, Ordering::SeqCst);
        ChangeInProgress(())
    }
}

impl Drop for ChangeInProgress {
    fn drop(&mut self) {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        IN_PROGRESS.fetch_sub(1, Ordering::SeqCst);
        ENDED.notify(usize::MAX);
    }
}

/// Returns a value that changes whenever a change starts or ends, or `None` while one is in
/// progress. Two equal results mean that no change overlapped the time between them.
pub(crate) fn change_epoch() -> Option<u64> {
    // A change increments the count in progress before the generation when it starts, and the
    // generation before the count when it ends, so one that overlaps this read changes the
    // generation or is seen in progress.
    let generation = GENERATION.load(Ordering::SeqCst);
    let in_progress = IN_PROGRESS.load(Ordering::SeqCst);
    (in_progress == 0 && GENERATION.load(Ordering::SeqCst) == generation).then_some(generation)
}

/// Waits until a change ends, unless none is in progress. Changes can overlap without a moment
/// where none is in progress, so this doesn't wait for all of them.
pub(crate) async fn wait_for_change_to_end() {
    // Listening first catches a change that ends during the check.
    let ended = ENDED.listen();
    if change_epoch().is_none() {
        ended.await;
    }
}

#[cfg(test)]
mod tests {
    use std::pin::pin;

    use futures::{FutureExt, poll};

    use super::*;

    /// The changes are global, so the tests must not overlap.
    static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    #[tokio::test]
    async fn without_changes_does_not_wait() {
        let _serial = SERIAL.lock().await;
        assert!(wait_for_change_to_end().now_or_never().is_some());
    }

    #[tokio::test]
    async fn one_of_overlapping_changes_ending_is_enough() {
        let _serial = SERIAL.lock().await;
        let first = ChangeInProgress::start();
        let second = ChangeInProgress::start();
        let mut wait = pin!(wait_for_change_to_end());
        assert!(poll!(wait.as_mut()).is_pending());
        drop(first);
        wait.await;
        assert!(change_epoch().is_none());
        drop(second);
        assert!(change_epoch().is_some());
    }
}
