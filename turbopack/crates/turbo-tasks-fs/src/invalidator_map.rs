use std::sync::{LockResult, Mutex, MutexGuard};

use concurrent_queue::ConcurrentQueue;
use rustc_hash::FxHashMap;
use serde::{de::Visitor, Deserialize, Serialize};
use turbo_tasks::{Invalidator, ReadRef};

use crate::{FileContent, LinkContent};

#[derive(Serialize, Deserialize, PartialEq, Eq)]
pub enum WriteContent {
    File(ReadRef<FileContent>),
    Link(ReadRef<LinkContent>),
}

type InnerMap = FxHashMap<String, FxHashMap<Invalidator, Option<WriteContent>>>;

pub struct InvalidatorMap {
    queue: ConcurrentQueue<(String, Invalidator, Option<WriteContent>)>,
    map: Mutex<InnerMap>,
}

impl Default for InvalidatorMap {
    fn default() -> Self {
        Self {
            queue: ConcurrentQueue::unbounded(),
            map: Default::default(),
        }
    }
}

impl InvalidatorMap {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn lock(&self) -> LockResult<MutexGuard<'_, InnerMap>> {
        let mut guard = self.map.lock()?;
        while let Ok((key, value, write_content)) = self.queue.pop() {
            guard.entry(key).or_default().insert(value, write_content);
        }
        Ok(guard)
    }

    #[allow(unused_must_use)]
    pub fn insert(
        &self,
        key: String,
        invalidator: Invalidator,
        write_content: Option<WriteContent>,
    ) {
        self.queue.push((key, invalidator, write_content));
    }
}

impl Serialize for InvalidatorMap {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_newtype_struct("InvalidatorMap", &*self.lock().unwrap())
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
