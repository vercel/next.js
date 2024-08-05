use std::{
    hash::Hash,
    sync::{Arc, Mutex},
};

use dashmap::{mapref::entry::Entry, DashMap};

pub struct OnceConcurrentlyMap<K: Hash + Eq + Ord + Send + Sync + 'static, V: Clone + Send + Sync> {
    inner: DashMap<&'static K, Arc<Mutex<Option<V>>>>,
}

impl<K: Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync> Default
    for OnceConcurrentlyMap<K, V>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K: Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync> OnceConcurrentlyMap<K, V> {
    pub fn new() -> Self {
        Self {
            inner: DashMap::new(),
        }
    }

    pub fn action(&self, key: &K, func: impl FnOnce() -> V) -> V {
        let temp = TemporarilyInserted {
            inner: &self.inner,
            key,
        };
        let mutex = match temp.entry() {
            Entry::Occupied(e) => e.get().clone(),
            Entry::Vacant(e) => e.insert(Arc::new(Mutex::new(None))).clone(),
        };
        let mut guard = mutex.lock().unwrap();
        if let Some(value) = &*guard {
            // Yeah, somebody else already did it for us
            return value.clone();
        }
        // We are the one responsible for computing
        let value = func();
        *guard = Some(value.clone());
        drop(guard);
        drop(temp);
        value
    }
}

struct TemporarilyInserted<'a, K: 'static + Hash + Eq + Ord + Send + Sync, V: Send + Sync> {
    inner: &'a DashMap<&'static K, V>,
    key: &'a K,
}

impl<'a, K: Hash + Eq + Ord + Send + Sync, V: Send + Sync> TemporarilyInserted<'a, K, V> {
    fn entry(&self) -> Entry<'a, &'static K, V> {
        // SAFETY: We remove the value again after this function is done
        let static_key: &'static K = unsafe { std::mem::transmute(self.key) };
        self.inner.entry(static_key)
    }
}

impl<'a, K: Hash + Eq + Ord + Send + Sync, V: Send + Sync> Drop for TemporarilyInserted<'a, K, V> {
    fn drop(&mut self) {
        let static_key: &'static K = unsafe { std::mem::transmute(self.key) };
        self.inner.remove(&static_key);
    }
}

pub struct SafeOnceConcurrentlyMap<
    K: Clone + Hash + Eq + Ord + Send + Sync + 'static,
    V: Clone + Send + Sync,
> {
    inner: DashMap<K, Arc<Mutex<Option<V>>>>,
}

impl<K: Clone + Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync> Default
    for SafeOnceConcurrentlyMap<K, V>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K: Clone + Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync>
    SafeOnceConcurrentlyMap<K, V>
{
    pub fn new() -> Self {
        Self {
            inner: DashMap::new(),
        }
    }

    pub fn action(&self, key: &K, func: impl FnOnce() -> V) -> V {
        let temp = SafeTemporarilyInserted {
            inner: &self.inner,
            key,
        };
        let mutex = match temp.entry() {
            Entry::Occupied(e) => e.get().clone(),
            Entry::Vacant(e) => e.insert(Arc::new(Mutex::new(None))).clone(),
        };
        let mut guard = mutex.lock().unwrap();
        if let Some(value) = &*guard {
            // Yeah, somebody else already did it for us
            return value.clone();
        }
        // We are the one responsible for computing
        let value = func();
        *guard = Some(value.clone());
        drop(guard);
        drop(temp);
        value
    }
}

struct SafeTemporarilyInserted<
    'a,
    K: 'static + Clone + Hash + Eq + Ord + Send + Sync,
    V: Send + Sync,
> {
    inner: &'a DashMap<K, V>,
    key: &'a K,
}

impl<'a, K: Clone + Hash + Eq + Ord + Send + Sync, V: Send + Sync>
    SafeTemporarilyInserted<'a, K, V>
{
    fn entry(&self) -> Entry<'_, K, V> {
        // SAFETY: We remove the value again after this function is done
        self.inner.entry(self.key.clone())
    }
}

impl<'a, K: Clone + Hash + Eq + Ord + Send + Sync, V: Send + Sync> Drop
    for SafeTemporarilyInserted<'a, K, V>
{
    fn drop(&mut self) {
        self.inner.remove(self.key);
    }
}
