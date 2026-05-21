use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{LockResult, Mutex, MutexGuard},
};

use concurrent_queue::ConcurrentQueue;
use rustc_hash::FxHashSet;
use turbo_tasks::Invalidator;

pub type LockedInvalidatorMap = BTreeMap<PathBuf, FxHashSet<Invalidator>>;

pub struct InvalidatorMap {
    queue: ConcurrentQueue<(PathBuf, Invalidator)>,
    map: Mutex<LockedInvalidatorMap>,
}

impl Default for InvalidatorMap {
    fn default() -> Self {
        Self {
            queue: ConcurrentQueue::unbounded(),
            map: Mutex::<LockedInvalidatorMap>::default(),
        }
    }
}

impl InvalidatorMap {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn lock(&self) -> LockResult<MutexGuard<'_, LockedInvalidatorMap>> {
        let mut guard = self.map.lock()?;
        while let Ok((key, value)) = self.queue.pop() {
            guard.entry(key).or_default().insert(value);
        }
        Ok(guard)
    }

    pub fn insert(&self, key: PathBuf, invalidator: Invalidator) {
        self.queue.push((key, invalidator)).unwrap_or_else(|err| {
            let (key, ..) = err.into_inner();
            // PushError<T> is not Debug
            panic!(
                "failed to push {key:?} queue push should never fail, queue is unbounded and \
                 never closed"
            )
        });
    }
}
