use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{LockResult, Mutex, MutexGuard},
};

use concurrent_queue::ConcurrentQueue;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize, de::Visitor};
use turbo_tasks::{Invalidator, ReadRef};

use crate::{FileContent, LinkContent};

#[derive(Serialize, Deserialize, PartialEq, Eq)]
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

impl Serialize for InvalidatorMap {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // TODO: This stores absolute `PathBuf`s, which are machine-specific. This should
        // normalize/denormalize paths relative to the disk filesystem root.
        //
        // Potential optimization: We invalidate all fs reads immediately upon resuming from a
        // persisted cache, but we don't invalidate the fs writes. Those read invalidations trigger
        // re-inserts into the `InvalidatorMap`. If we knew that certain invalidators were only
        // needed for reads, we could potentially avoid serializing those paths entirely.
        let inner: &LockedInvalidatorMap = &self.lock().unwrap();
        serializer.serialize_newtype_struct("InvalidatorMap", inner)
    }
}

impl<'de> Deserialize<'de> for InvalidatorMap {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct V;

        impl<'de> Visitor<'de> for V {
            type Value = InvalidatorMap;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "an InvalidatorMap")
            }

            fn visit_newtype_struct<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                Ok(InvalidatorMap {
                    queue: ConcurrentQueue::unbounded(),
                    map: Mutex::new(Deserialize::deserialize(deserializer)?),
                })
            }
        }

        deserializer.deserialize_newtype_struct("InvalidatorMap", V)
    }
}
