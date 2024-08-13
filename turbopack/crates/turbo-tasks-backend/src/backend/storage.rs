use std::{
    hash::{BuildHasherDefault, Hash},
    mem::take,
    ops::{Deref, DerefMut},
    thread::available_parallelism,
};

use auto_hash_map::{map::Entry, AutoMap};
use dashmap::{mapref::one::RefMut, DashMap};
use rustc_hash::FxHasher;
use turbo_tasks::KeyValuePair;

pub struct InnerStorage<T: KeyValuePair> {
    // TODO consider adding some inline storage
    map: AutoMap<T::Key, T::Value>,
}

impl<T: KeyValuePair> InnerStorage<T> {
    fn new() -> Self {
        Self {
            map: AutoMap::new(),
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

    pub fn insert(&mut self, item: T) -> Option<T::Value> {
        let (key, value) = item.into_key_and_value();
        self.map.insert(key, value)
    }

    pub fn remove(&mut self, key: &T::Key) -> Option<T::Value> {
        self.map.remove(key)
    }

    pub fn get(&self, key: &T::Key) -> Option<&T::Value> {
        self.map.get(key)
    }

    pub fn has_key(&self, key: &T::Key) -> bool {
        self.map.contains_key(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&T::Key, &T::Value)> {
        self.map.iter()
    }
}

impl<T: KeyValuePair> InnerStorage<T>
where
    T::Value: Default,
    T::Key: Clone,
{
    pub fn update(
        &mut self,
        key: &T::Key,
        update: impl FnOnce(Option<T::Value>) -> Option<T::Value>,
    ) {
        if let Some(value) = self.map.get_mut(key) {
            let v = take(value);
            if let Some(v) = update(Some(v)) {
                *value = v;
            } else {
                self.map.remove(key);
            }
        } else {
            if let Some(v) = update(None) {
                self.map.insert(key.clone(), v);
            }
        }
    }
}

impl<T: KeyValuePair + Default> InnerStorage<T>
where
    T::Value: PartialEq,
{
    pub fn has(&self, item: &mut T) -> bool {
        let (key, value) = take(item).into_key_and_value();
        let result = if let Some(stored_value) = self.map.get(&key) {
            *stored_value == value
        } else {
            false
        };
        *item = T::from_key_and_value(key, value);
        result
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
        &self.inner
    }
}

impl<'a, K: Eq + Hash, T: KeyValuePair> DerefMut for StorageWriteGuard<'a, K, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

#[macro_export]
macro_rules! get {
    ($task:ident, $key:ident $input:tt) => {
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.get(&$crate::data::CachedDataItemKey::$key $input).as_ref() {
            Some(value)
        } else {
            None
        }
    };
    ($task:ident, $key:ident) => {
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.get(&$crate::data::CachedDataItemKey::$key {}).as_ref() {
            Some(value)
        } else {
            None
        }
    };
}

#[macro_export]
macro_rules! get_many {
    ($task:ident, $key:ident $input:tt => $value:ident) => {
        $task
            .iter()
            .filter_map(|(key, _)| match *key {
                CachedDataItemKey::$key $input => Some($value),
                _ => None,
            })
            .collect()
    };
    ($task:ident, $key1:ident $input1:tt => $value1:ident, $key2:ident $input2:tt => $value2:ident) => {
        $task
            .iter()
            .filter_map(|(key, _)| match *key {
                CachedDataItemKey::$key1 $input1 => Some($value1),
                CachedDataItemKey::$key2 $input2 => Some($value2),
                _ => None,
            })
            .collect()
    };
}

#[macro_export]
macro_rules! update {
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        #[allow(unused_mut)]
        match $update {
            mut update => $task.update(&$crate::data::CachedDataItemKey::$key $input, |old| {
                update(old.and_then(|old| {
                    if let $crate::data::CachedDataItemValue::$key { value } = old {
                        Some(value)
                    } else {
                        None
                    }
                }))
                .map(|new| $crate::data::CachedDataItemValue::$key { value: new })
            })
        }
    };
    ($task:ident, $key:ident, $update:expr) => {
        #[allow(unused_mut)]
        match $update {
            mut update => $task.update(&$crate::data::CachedDataItemKey::$key {}, |old| {
                update(old.and_then(|old| {
                    if let $crate::data::CachedDataItemValue::$key { value } = old {
                        Some(value)
                    } else {
                        None
                    }
                }))
                .map(|new| $crate::data::CachedDataItemValue::$key { value: new })
            })
        }
    };
}

#[macro_export]
macro_rules! update_count {
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        match $update {
            update => {
                let mut state_change = false;
                $crate::update!($task, $key $input, |old: Option<u32>| {
                    if old.is_none() {
                        state_change = true;
                    }
                    let old = old.unwrap_or(0);
                    let new = old as i32 + update;
                    if new == 0 {
                        state_change = true;
                        None
                    } else {
                        Some(new as u32)
                    }
                });
                state_change
            }
        }
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::update_count!($task, $key {}, $update)
    };
}

#[macro_export]
macro_rules! remove {
    ($task:ident, $key:ident $input:tt) => {
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.remove(&$crate::data::CachedDataItemKey::$key $input) {
            Some(value)
        } else {
            None
        }
    };
    ($task:ident, $key:ident) => {
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.remove(&$crate::data::CachedDataItemKey::$key {}) {
            Some(value)
        } else {
            None
        }
    };
}
