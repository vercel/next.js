use std::{cmp::Ordering, collections::BinaryHeap, sync::Arc, time::Duration};

use anyhow::{Result, bail};
use parking_lot::Mutex;
use tokio::{
    sync::{Notify, Semaphore},
    time::Instant,
};

use crate::idle_timeout::{IdleQueue, NodePoolOptions, split_expired};

/// How long to wait before checking for expired items again when an expired item couldn't be
/// removed because `pop` is about to take an item.
const RECHECK_DELAY: Duration = Duration::from_millis(10);

/// A queued item, together with the time it was queued.
struct Idle<T> {
    item: T,
    idle_since: Instant,
}

// Ordered by the item only.
impl<T: Ord> Ord for Idle<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.item.cmp(&other.item)
    }
}

impl<T: Ord> PartialOrd for Idle<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T: Ord> PartialEq for Idle<T> {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl<T: Ord> Eq for Idle<T> {}

/// A queue of idle items that hands out the greatest item first.
///
/// The queue can be [closed](Self::close): this drops every queued item, and items pushed
/// afterwards are dropped immediately instead of being queued.
pub(super) struct HeapQueue<T> {
    /// `None` once the queue is closed.
    heap: Mutex<Option<BinaryHeap<Idle<T>>>>,
    /// One permit per queued item. Closed together with the queue.
    semaphore: Semaphore,
    /// See [`IdleQueue::idle_changed`].
    idle_changed: Arc<Notify>,
}

impl<T: Ord> HeapQueue<T> {
    pub(super) fn new() -> Self {
        Self {
            heap: Mutex::new(Some(BinaryHeap::new())),
            semaphore: Semaphore::new(0),
            idle_changed: Arc::new(Notify::new()),
        }
    }

    /// Queues `item`. If the queue is closed, `item` is dropped instead.
    pub(super) fn push(&self, item: T) {
        {
            let mut heap = self.heap.lock();
            let Some(heap) = heap.as_mut() else {
                return;
            };
            heap.push(Idle {
                item,
                idle_since: Instant::now(),
            });
            // Add the permit while holding the lock, so that `close` can't run in between and
            // leave a permit without an item behind.
            self.semaphore.add_permits(1);
        }
        self.idle_changed.notify_waiters();
    }

    /// Waits for an item and takes it out of the queue. Fails once the queue is closed.
    pub(super) async fn pop(&self) -> Result<T> {
        let Ok(permit) = self.semaphore.acquire().await else {
            bail!("the idle queue was closed");
        };
        permit.forget();
        let mut heap = self.heap.lock();
        // Every permit belongs to a queued item, so the heap only lacks the item if it was closed
        // after the permit was acquired.
        let Some(Idle { item, .. }) = heap.as_mut().and_then(|heap| heap.pop()) else {
            bail!("the idle queue was closed");
        };
        Ok(item)
    }

    /// Closes the queue: drops every queued item and makes [`Self::push`] drop the items it is
    /// given from now on.
    pub(super) fn close(&self) {
        let items = {
            let mut heap = self.heap.lock();
            self.semaphore.close();
            heap.take()
        };
        self.idle_changed.notify_waiters();
        // Drop the items outside of the lock.
        drop(items);
    }
}

impl<T: Ord + Send + 'static> IdleQueue for HeapQueue<T> {
    type Item = T;

    /// Keeps the greatest items, which [`Self::pop`] hands out first.
    fn expire_idle(
        &self,
        options: &NodePoolOptions,
        now: Instant,
    ) -> Option<(Vec<T>, Option<Instant>)> {
        let mut heap = self.heap.lock();
        let heap = heap.as_mut()?;
        let items = std::mem::take(heap)
            .into_sorted_vec()
            .into_iter()
            .map(|Idle { item, idle_since }| (item, idle_since))
            .collect();
        let (mut expired, kept, next_expiry) = split_expired(items, options, now);
        // An item can only be removed together with its permit. A permit that `pop` already
        // acquired belongs to the greatest item, which `pop` takes once it gets the lock, so keep
        // the greatest expired items if not every permit is available.
        let removable = self.semaphore.forget_permits(expired.len());
        let still_needed = expired.split_off(removable);
        let next_expiry = if still_needed.is_empty() {
            next_expiry
        } else {
            // Check again once `pop` took its item.
            Some(now + RECHECK_DELAY)
        };
        heap.extend(
            kept.into_iter()
                .chain(still_needed)
                .map(|(item, idle_since)| Idle { item, idle_since }),
        );
        Some((
            expired.into_iter().map(|(item, _)| item).collect(),
            next_expiry,
        ))
    }

    fn idle_changed(&self) -> &Arc<Notify> {
        &self.idle_changed
    }
}
