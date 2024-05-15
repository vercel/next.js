use std::{
    marker::PhantomData,
    ops::Deref,
    sync::atomic::{AtomicU32, Ordering},
};

use concurrent_queue::ConcurrentQueue;
use once_cell::sync::Lazy;

pub struct IdFactory<T> {
    next_id: AtomicU32,
    free_ids: Lazy<ConcurrentQueue<T>>,
    phantom_data: PhantomData<T>,
}

impl<T: From<u32> + Deref<Target = u32>> Default for IdFactory<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: From<u32> + Deref<Target = u32>> IdFactory<T> {
    pub const fn new() -> Self {
        Self {
            next_id: AtomicU32::new(1),
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
