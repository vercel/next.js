use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{LockResult, Mutex, MutexGuard},
};

use concurrent_queue::ConcurrentQueue;
use rustc_hash::FxHashMap;
use turbo_tasks::{Invalidator, ReadRef};

use crate::{FileContent, LinkContent};

#[derive(PartialEq, Eq)]
pub enum WriteContent {
    File(ReadRef<FileContent>),
    Link(ReadRef<LinkContent>),
}

pub type LockedInvalidatorMap = BTreeMap<PathBuf, FxHashMap<Invalidator, Option<WriteContent>>>;

pub struct InvalidatorMap {
    queue: ConcurrentQueue<(PathBuf, Invalidator, Option<WriteContent>)>,
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
        while let Ok((key, value, write_content)) = self.queue.pop() {
            guard.entry(key).or_default().insert(value, write_content);
        }
        Ok(guard)
    }

    pub fn insert(
        &self,
        key: PathBuf,
        invalidator: Invalidator,
        write_content: Option<WriteContent>,
    ) {
        self.queue
            .push((key, invalidator, write_content))
            .unwrap_or_else(|err| {
                let (key, ..) = err.into_inner();
                // PushError<T> is not Debug
                panic!(
                    "failed to push {key:?} queue push should never fail, queue is unbounded and \
                     never closed"
                )
            });
    }
}
