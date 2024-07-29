use std::{
    hash::{BuildHasherDefault, Hash},
    ops::{Deref, DerefMut},
    thread::available_parallelism,
};

use auto_hash_map::{map::Entry, AutoMap};
use dashmap::{mapref::one::RefMut, DashMap};
use rustc_hash::FxHasher;
use turbo_tasks::KeyValuePair;

enum PersistanceState {
    /// We know that all state of the object is only in the cache and nothing is
    /// stored in the persistent cache.
    CacheOnly,
    /// We know that some state of the object is stored in the persistent cache.
    Persisted,
    /// We have never checked the persistent cache for the state of the object.
    Unknown,
}

pub struct InnerStorage<T: KeyValuePair> {
    // TODO consider adding some inline storage
    map: AutoMap<T::Key, T::Value>,
    persistance_state: PersistanceState,
}

impl<T: KeyValuePair> InnerStorage<T> {
    fn new() -> Self {
        Self {
            map: AutoMap::new(),
            persistance_state: PersistanceState::Unknown,
        }
    }

    pub fn add(&mut self, item: T) -> bool {
        let (key, value) = item.into_key_and_value();
        match self.map.entry(key) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(value);
                true
            }
        }
    }

    pub fn upsert(&mut self, item: T) -> Option<T::Value> {
        let (key, value) = item.into_key_and_value();
        self.map.insert(key, value)
    }

    pub fn remove(&mut self, key: &T::Key) -> Option<T::Value> {
        self.map.remove(key)
    }
}

pub struct Storage<K, T: KeyValuePair> {
    map: DashMap<K, InnerStorage<T>, BuildHasherDefault<FxHasher>>,
}

impl<K, T: KeyValuePair> Storage<K, T>
where
    K: Eq + std::hash::Hash + Clone,
    T: KeyValuePair,
{
    pub fn new() -> Self {
        Self {
            map: DashMap::with_capacity_and_hasher_and_shard_amount(
                1024 * 1024,
                Default::default(),
                available_parallelism().map_or(4, |v| v.get()) * 64,
            ),
        }
    }

    pub fn access_mut(&self, key: K) -> StorageWriteGuard<'_, K, T> {
        let inner = match self.map.entry(key) {
            dashmap::mapref::entry::Entry::Occupied(e) => e.into_ref(),
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(InnerStorage::new()),
        };
        StorageWriteGuard { inner }
    }
}

pub struct StorageWriteGuard<'a, K, T: KeyValuePair> {
    inner: RefMut<'a, K, InnerStorage<T>, BuildHasherDefault<FxHasher>>,
}

impl<'a, K: Eq + Hash, T: KeyValuePair> Deref for StorageWriteGuard<'a, K, T> {
    type Target = InnerStorage<T>;

    fn deref(&self) -> &Self::Target {
        &*self.inner
    }
}

impl<'a, K: Eq + Hash, T: KeyValuePair> DerefMut for StorageWriteGuard<'a, K, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut *self.inner
    }
}
