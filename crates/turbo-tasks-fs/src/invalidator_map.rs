use std::{
    collections::HashMap,
    sync::{LockResult, Mutex, MutexGuard},
};

use concurrent_queue::ConcurrentQueue;
use turbo_tasks::Invalidator;

pub struct InvalidatorMap {
    queue: ConcurrentQueue<(String, Invalidator)>,
    map: Mutex<HashMap<String, Invalidator>>,
}

impl InvalidatorMap {
    pub fn new() -> Self {
        Self {
            queue: ConcurrentQueue::unbounded(),
            map: Default::default(),
        }
    }

    pub fn lock(&self) -> LockResult<MutexGuard<'_, HashMap<String, Invalidator>>> {
        let mut guard = self.map.lock()?;
        while let Ok((key, value)) = self.queue.pop() {
            guard.insert(key, value);
        }
        Ok(guard)
    }

    #[allow(unused_must_use)]
    pub fn insert(&self, key: String, invalidator: Invalidator) {
        self.queue.push((key, invalidator));
    }
}
