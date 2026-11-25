use std::collections::BinaryHeap;

use anyhow::{Result, bail};
use parking_lot::Mutex;
use tokio::sync::Semaphore;

/// A queue of idle items that hands out the greatest item first.
///
/// The queue can be [closed](Self::close): this drops every queued item, and items pushed
/// afterwards are dropped immediately instead of being queued.
pub(super) struct HeapQueue<T> {
    /// `None` once the queue is closed.
    heap: Mutex<Option<BinaryHeap<T>>>,
    /// One permit per queued item. Closed together with the queue.
    semaphore: Semaphore,
}

impl<T: Ord> HeapQueue<T> {
    pub(super) fn new() -> Self {
        Self {
            heap: Mutex::new(Some(BinaryHeap::new())),
            semaphore: Semaphore::new(0),
        }
    }

    /// Queues `item`. If the queue is closed, `item` is dropped instead.
    pub(super) fn push(&self, item: T) {
        let mut heap = self.heap.lock();
        let Some(heap) = heap.as_mut() else {
            return;
        };
        heap.push(item);
        // Add the permit while holding the lock, so that `close` can't run in between and leave
        // a permit without an item behind.
        self.semaphore.add_permits(1);
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
        let Some(item) = heap.as_mut().and_then(|heap| heap.pop()) else {
            bail!("the idle queue was closed");
        };
        Ok(item)
    }

    pub(super) fn reduce_to_one(&self) {
        // Drain the semaphore permits
        let mut n = self.semaphore.forget_permits(usize::MAX);
        if n <= 1 {
            self.semaphore.add_permits(n);
            return;
        }
        let mut heap = self.heap.lock();
        let Some(heap) = heap.as_mut() else {
            return;
        };
        // We must only pop n items even if there are more since we only have n permits
        let top = heap.pop().unwrap();
        n -= 1;
        for _ in 0..n {
            heap.pop();
        }
        heap.push(top);
        self.semaphore.add_permits(1);
    }

    pub(super) fn reduce_to_zero(&self) {
        // Drain the semaphore permits
        let n = self.semaphore.forget_permits(usize::MAX);
        if n == 0 {
            return;
        }
        let mut heap = self.heap.lock();
        let Some(heap) = heap.as_mut() else {
            return;
        };
        // We must only pop n items even if there are more since we only have n permits
        for _ in 0..n {
            heap.pop();
        }
    }

    /// Closes the queue: drops every queued item and makes [`Self::push`] drop the items it is
    /// given from now on.
    pub(super) fn close(&self) {
        let items = {
            let mut heap = self.heap.lock();
            self.semaphore.close();
            heap.take()
        };
        // Drop the items outside of the lock.
        drop(items);
    }

    #[cfg(test)]
    pub(super) fn len(&self) -> usize {
        self.heap.lock().as_ref().map_or(0, |heap| heap.len())
    }
}
