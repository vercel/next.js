use std::{
    collections::{HashMap, HashSet},
    sync::{LockResult, Mutex, MutexGuard},
};

use concurrent_queue::ConcurrentQueue;
use serde::{de::Visitor, Deserialize, Serialize};
use turbo_tasks::Invalidator;

pub struct InvalidatorMap {
    queue: ConcurrentQueue<(String, Invalidator)>,
    map: Mutex<HashMap<String, HashSet<Invalidator>>>,
}

impl InvalidatorMap {
    pub fn new() -> Self {
        Self {
            queue: ConcurrentQueue::unbounded(),
            map: Default::default(),
        }
    }

    pub fn lock(&self) -> LockResult<MutexGuard<'_, HashMap<String, HashSet<Invalidator>>>> {
        let mut guard = self.map.lock()?;
        while let Ok((key, value)) = self.queue.pop() {
            guard.entry(key).or_default().insert(value);
        }
        Ok(guard)
    }

    #[allow(unused_must_use)]
    pub fn insert(&self, key: String, invalidator: Invalidator) {
        self.queue.push((key, invalidator));
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
