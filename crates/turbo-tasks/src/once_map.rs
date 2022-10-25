use std::{hash::Hash, sync::Mutex};

use flurry::{HashMap, HashMapRef, TryInsertError};

pub struct OnceConcurrentlyMap<
    K: ?Sized + Hash + Eq + Ord + Send + Sync + 'static,
    V: Clone + Send + Sync,
> {
    inner: HashMap<&'static K, Mutex<Option<V>>>,
}

impl<K: ?Sized + Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync> Default
    for OnceConcurrentlyMap<K, V>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K: ?Sized + Hash + Eq + Ord + Send + Sync, V: Clone + Send + Sync> OnceConcurrentlyMap<K, V> {
    pub fn new() -> Self {
        Self {
            inner: HashMap::new(),
        }
    }

    pub fn action(&self, key: &K, func: impl FnOnce() -> V) -> V {
        let inner = self.inner.pin();

        let mutex = Mutex::new(None);
        let temp = TemporarilyInserted { inner: &inner, key };
        let mutex = match temp.try_insert(mutex) {
            Ok(mutex) => mutex,
            Err(e) => e.current,
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
        value
    }
}

struct TemporarilyInserted<
    'a,
    'map,
    K: 'static + ?Sized + Hash + Eq + Ord + Send + Sync,
    V: Send + Sync,
> {
    inner: &'a HashMapRef<'map, &'static K, V>,
    key: &'a K,
}

impl<'a, 'map, K: ?Sized + Hash + Eq + Ord + Send + Sync, V: Send + Sync>
    TemporarilyInserted<'a, 'map, K, V>
{
    fn try_insert(&self, value: V) -> Result<&'_ V, TryInsertError<'_, V>> {
        // SAFETY: We remove the value again after this function is done
        let static_key: &'static K = unsafe { std::mem::transmute(self.key) };
        self.inner.try_insert(static_key, value)
    }
}

impl<'a, 'map, K: ?Sized + Hash + Eq + Ord + Send + Sync, V: Send + Sync> Drop
    for TemporarilyInserted<'a, 'map, K, V>
{
    fn drop(&mut self) {
        let static_key: &'static K = unsafe { std::mem::transmute(self.key) };
        self.inner.remove(&static_key);
    }
}

pub struct SafeOnceConcurrentlyMap<
    K: Clone + Hash + Eq + Ord + Send + Sync + 'static,
    V: Clone + Send + Sync,
> {
    inner: HashMap<K, Mutex<Option<V>>>,
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
            inner: HashMap::new(),
        }
    }

    pub fn action(&self, key: &K, func: impl FnOnce() -> V) -> V {
        let inner = self.inner.pin();

        let mutex = Mutex::new(None);
        let temp = SafeTemporarilyInserted { inner: &inner, key };
        let mutex = match temp.try_insert(mutex) {
            Ok(mutex) => mutex,
            Err(e) => e.current,
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
        value
    }
}

struct SafeTemporarilyInserted<
    'a,
    'map,
    K: 'static + Clone + Hash + Eq + Ord + Send + Sync,
    V: Send + Sync,
> {
    inner: &'a HashMapRef<'map, K, V>,
    key: &'a K,
}

impl<'a, 'map, K: Clone + Hash + Eq + Ord + Send + Sync, V: Send + Sync>
    SafeTemporarilyInserted<'a, 'map, K, V>
{
    fn try_insert(&self, value: V) -> Result<&'_ V, TryInsertError<'_, V>> {
        // SAFETY: We remove the value again after this function is done
        self.inner.try_insert(self.key.clone(), value)
    }
}

impl<'a, 'map, K: Clone + Hash + Eq + Ord + Send + Sync, V: Send + Sync> Drop
    for SafeTemporarilyInserted<'a, 'map, K, V>
{
    fn drop(&mut self) {
        self.inner.remove(self.key);
    }
}
