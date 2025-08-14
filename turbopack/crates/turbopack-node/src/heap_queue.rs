use std::{collections::BinaryHeap, sync::Arc};

use parking_lot::Mutex;
use tokio::sync::{AcquireError, Semaphore};

pub struct HeapQueue<T> {
    heap: Mutex<BinaryHeap<T>>,
    semaphore: Semaphore,
}

impl<T: Ord> HeapQueue<T> {
    pub fn new() -> Self {
        Self {
            heap: Mutex::new(BinaryHeap::new()),
            semaphore: Semaphore::new(0),
        }
    }

    pub fn push(self: &Arc<Self>, item: T, active_queues: &Mutex<Vec<Arc<Self>>>) {
        {
            let mut heap = self.heap.lock();
            if heap.is_empty() {
                // If the heap was empty, add this queue to the active queues
                let mut queues = active_queues.lock();
                queues.push(self.clone());
            }
            heap.push(item);
        }
        self.semaphore.add_permits(1);
    }

    pub async fn pop(
        self: &Arc<Self>,
        active_queues: &Mutex<Vec<Arc<Self>>>,
    ) -> Result<T, AcquireError> {
        self.semaphore.acquire().await?.forget();
        let mut heap = self.heap.lock();
        let item = heap.pop().unwrap();
        if heap.is_empty() {
            // If the heap is empty, remove this queue from the active queues
            let mut queues = active_queues.lock();
            if let Some(pos) = queues.iter().position(|q| Arc::ptr_eq(q, self)) {
                queues.remove(pos);
            }
        }
        Ok(item)
    }

    pub fn reduce_to_one(&self) {
        // Drain the semaphore permits
        let mut n = self.semaphore.forget_permits(usize::MAX);
        if n <= 1 {
            self.semaphore.add_permits(n);
            return;
        }
        let mut heap: parking_lot::lock_api::MutexGuard<'_, parking_lot::RawMutex, BinaryHeap<T>> =
            self.heap.lock();
        // We must only pop n items even if there are more since we only have n permits
        let top = heap.pop().unwrap();
        n -= 1;
        for _ in 0..n {
            heap.pop();
        }
        heap.push(top);
        self.semaphore.add_permits(1);
    }

    pub fn reduce_to_zero(self: &Arc<Self>, active_queues: &Mutex<Vec<Arc<Self>>>) {
        // Drain the semaphore permits
        let n = self.semaphore.forget_permits(usize::MAX);
        if n == 0 {
            return;
        }
        let mut heap = self.heap.lock();
        // We must only pop n items even if there are more since we only have n permits
        for _ in 0..n {
            heap.pop();
        }
        if heap.is_empty() {
            // If the heap is empty, remove this queue from the active queues
            let mut queues = active_queues.lock();
            if let Some(pos) = queues.iter().position(|q| Arc::ptr_eq(q, self)) {
                queues.remove(pos);
            }
        }
    }
}
