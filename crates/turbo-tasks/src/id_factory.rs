use std::{
    marker::PhantomData,
    ops::Deref,
    sync::atomic::{AtomicUsize, Ordering},
};

use concurrent_queue::ConcurrentQueue;
use once_cell::sync::Lazy;

pub struct IdFactory<T> {
    next_id: AtomicUsize,
    free_ids: Lazy<ConcurrentQueue<T>>,
    phantom_data: PhantomData<T>,
}

impl<T: From<usize> + Deref<Target = usize>> Default for IdFactory<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: From<usize> + Deref<Target = usize>> IdFactory<T> {
    pub const fn new() -> Self {
        Self {
            next_id: AtomicUsize::new(1),
            free_ids: Lazy::new(|| ConcurrentQueue::unbounded()),
            phantom_data: PhantomData,
        }
    }

    pub fn get(&self) -> T {
        if let Ok(id) = self.free_ids.pop() {
            return id;
        }
        self.next_id.fetch_add(1, Ordering::Relaxed).into()
    }

    /// # Safety
    ///
    /// It must be ensured that the id is no longer used
    pub unsafe fn reuse(&self, id: T) {
        let _ = self.free_ids.push(id);
    }
}
