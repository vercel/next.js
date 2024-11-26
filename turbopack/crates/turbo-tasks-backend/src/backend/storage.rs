use std::{
    hash::{BuildHasherDefault, Hash},
    mem::take,
    ops::{Deref, DerefMut},
    panic,
    thread::available_parallelism,
};

use auto_hash_map::{map::Entry, AutoMap};
use dashmap::DashMap;
use either::Either;
use rustc_hash::FxHasher;
use turbo_tasks::KeyValuePair;

use crate::{
    backend::indexed::Indexed,
    utils::dash_map_multi::{get_multiple_mut, RefMut},
};

const META_UNRESTORED: u32 = 1 << 31;
const DATA_UNRESTORED: u32 = 1 << 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
}

impl TaskDataCategory {
    pub fn flag(&self) -> u32 {
        match self {
            TaskDataCategory::Meta => META_UNRESTORED,
            TaskDataCategory::Data => DATA_UNRESTORED,
            TaskDataCategory::All => META_UNRESTORED | DATA_UNRESTORED,
        }
    }
}

impl IntoIterator for TaskDataCategory {
    type Item = TaskDataCategory;

    type IntoIter = TaskDataCategoryIterator;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            TaskDataCategory::Meta => TaskDataCategoryIterator::Meta,
            TaskDataCategory::Data => TaskDataCategoryIterator::Data,
            TaskDataCategory::All => TaskDataCategoryIterator::All,
        }
    }
}

pub enum TaskDataCategoryIterator {
    All,
    Meta,
    Data,
    None,
}

impl Iterator for TaskDataCategoryIterator {
    type Item = TaskDataCategory;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            TaskDataCategoryIterator::All => {
                *self = TaskDataCategoryIterator::Data;
                Some(TaskDataCategory::Meta)
            }
            TaskDataCategoryIterator::Meta => {
                *self = TaskDataCategoryIterator::None;
                Some(TaskDataCategory::Meta)
            }
            TaskDataCategoryIterator::Data => {
                *self = TaskDataCategoryIterator::None;
                Some(TaskDataCategory::Data)
            }
            TaskDataCategoryIterator::None => None,
        }
    }
}

pub struct PersistanceState {
    value: u32,
}

impl Default for PersistanceState {
    fn default() -> Self {
        Self {
            value: META_UNRESTORED | DATA_UNRESTORED,
        }
    }
}

impl PersistanceState {
    pub fn set_restored(&mut self, category: TaskDataCategory) {
        self.value &= !category.flag();
    }

    pub fn add_persisting_item(&mut self) {
        // TODO add when we need to track unpersisted items
        // self.value += 1;
    }

    pub fn add_persisting_items(&mut self, _count: u32) {
        // TODO add when we need to track unpersisted items
        // self.value += count;
    }

    // TODO remove when we need to track unpersisted items
    #[allow(dead_code)]
    pub fn finish_persisting_items(&mut self, _count: u32) {
        // TODO add when we need to track unpersisted items
        // self.value -= count;
    }

    pub fn is_restored(&self, category: TaskDataCategory) -> bool {
        (self.value & category.flag()) == 0
    }
}

const INDEX_THRESHOLD: usize = 1024;

type IndexedMap<T> = AutoMap<
    <<T as KeyValuePair>::Key as Indexed>::Index,
    AutoMap<<T as KeyValuePair>::Key, <T as KeyValuePair>::Value>,
>;

pub enum InnerStorage<T: KeyValuePair>
where
    T::Key: Indexed,
{
    Plain {
        map: AutoMap<T::Key, T::Value>,
        persistance_state: PersistanceState,
    },
    Indexed {
        map: IndexedMap<T>,
        persistance_state: PersistanceState,
    },
}

impl<T: KeyValuePair> InnerStorage<T>
where
    T::Key: Indexed,
{
    fn new() -> Self {
        Self::Plain {
            map: AutoMap::new(),
            persistance_state: PersistanceState::default(),
        }
    }

    pub fn persistance_state(&self) -> &PersistanceState {
        match self {
            InnerStorage::Plain {
                persistance_state, ..
            } => persistance_state,
            InnerStorage::Indexed {
                persistance_state, ..
            } => persistance_state,
        }
    }

    pub fn persistance_state_mut(&mut self) -> &mut PersistanceState {
        match self {
            InnerStorage::Plain {
                persistance_state, ..
            } => persistance_state,
            InnerStorage::Indexed {
                persistance_state, ..
            } => persistance_state,
        }
    }

    fn check_threshold(&mut self) {
        let InnerStorage::Plain {
            map: plain_map,
            persistance_state,
        } = self
        else {
            return;
        };
        if plain_map.len() >= INDEX_THRESHOLD {
            let mut map: IndexedMap<T> = AutoMap::new();
            for (key, value) in take(plain_map).into_iter() {
                let index = key.index();
                map.entry(index).or_default().insert(key, value);
            }
            *self = InnerStorage::Indexed {
                map,
                persistance_state: take(persistance_state),
            };
        }
    }

    fn get_or_create_map_mut(&mut self, key: &T::Key) -> &mut AutoMap<T::Key, T::Value> {
        self.check_threshold();
        match self {
            InnerStorage::Plain { map, .. } => map,
            InnerStorage::Indexed { map, .. } => map.entry(key.index()).or_default(),
        }
    }

    fn get_map_mut(&mut self, key: &T::Key) -> Option<&mut AutoMap<T::Key, T::Value>> {
        self.check_threshold();
        match self {
            InnerStorage::Plain { map, .. } => Some(map),
            InnerStorage::Indexed { map, .. } => map.get_mut(&key.index()),
        }
    }

    fn get_map(&self, key: &T::Key) -> Option<&AutoMap<T::Key, T::Value>> {
        match self {
            InnerStorage::Plain { map, .. } => Some(map),
            InnerStorage::Indexed { map, .. } => map.get(&key.index()),
        }
    }

    fn index_map(&self, index: <T::Key as Indexed>::Index) -> Option<&AutoMap<T::Key, T::Value>> {
        match self {
            InnerStorage::Plain { map, .. } => Some(map),
            InnerStorage::Indexed { map, .. } => map.get(&index),
        }
    }

    fn index_map_mut(
        &mut self,
        index: <T::Key as Indexed>::Index,
    ) -> Option<&mut AutoMap<T::Key, T::Value>> {
        match self {
            InnerStorage::Plain { map, .. } => Some(map),
            InnerStorage::Indexed { map, .. } => map.get_mut(&index),
        }
    }

    pub fn add(&mut self, item: T) -> bool {
        let (key, value) = item.into_key_and_value();
        match self.get_or_create_map_mut(&key).entry(key) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(value);
                true
            }
        }
    }

    pub fn insert(&mut self, item: T) -> Option<T::Value> {
        let (key, value) = item.into_key_and_value();
        self.get_or_create_map_mut(&key).insert(key, value)
    }

    pub fn remove(&mut self, key: &T::Key) -> Option<T::Value> {
        self.get_map_mut(key).and_then(|m| m.remove(key))
    }

    pub fn get(&self, key: &T::Key) -> Option<&T::Value> {
        self.get_map(key).and_then(|m| m.get(key))
    }

    pub fn get_mut(&mut self, key: &T::Key) -> Option<&mut T::Value> {
        self.get_map_mut(key).and_then(|m| m.get_mut(key))
    }

    pub fn has_key(&self, key: &T::Key) -> bool {
        self.get_map(key)
            .map(|m| m.contains_key(key))
            .unwrap_or_default()
    }

    pub fn is_indexed(&self) -> bool {
        matches!(self, InnerStorage::Indexed { .. })
    }

    pub fn iter(
        &self,
        index: <T::Key as Indexed>::Index,
    ) -> impl Iterator<Item = (&T::Key, &T::Value)> {
        self.index_map(index)
            .map(|m| m.iter())
            .into_iter()
            .flatten()
    }

    pub fn iter_all(&self) -> impl Iterator<Item = (&T::Key, &T::Value)> {
        match self {
            InnerStorage::Plain { map, .. } => Either::Left(map.iter()),
            InnerStorage::Indexed { map, .. } => {
                Either::Right(map.iter().flat_map(|(_, m)| m.iter()))
            }
        }
    }

    pub fn extract_if<'l, F>(
        &'l mut self,
        index: <T::Key as Indexed>::Index,
        mut f: F,
    ) -> impl Iterator<Item = T> + use<'l, T, F>
    where
        F: for<'a, 'b> FnMut(&'a T::Key, &'b T::Value) -> bool + 'l,
    {
        self.index_map_mut(index)
            .map(move |m| m.extract_if(move |k, v| f(k, v)))
            .into_iter()
            .flatten()
            .map(|(key, value)| T::from_key_and_value(key, value))
    }

    pub fn extract_if_all<'l, F>(&'l mut self, mut f: F) -> impl Iterator<Item = T> + use<'l, T, F>
    where
        F: for<'a, 'b> FnMut(&'a T::Key, &'b T::Value) -> bool + 'l,
    {
        match self {
            InnerStorage::Plain { map, .. } => map
                .extract_if(move |k, v| f(k, v))
                .map(|(key, value)| T::from_key_and_value(key, value)),
            InnerStorage::Indexed { .. } => {
                panic!("Do not use extract_if_all with indexed storage")
            }
        }
    }
}

impl<T: KeyValuePair> InnerStorage<T>
where
    T::Key: Indexed,
    T::Value: Default,
    T::Key: Clone,
{
    pub fn update(
        &mut self,
        key: &T::Key,
        update: impl FnOnce(Option<T::Value>) -> Option<T::Value>,
    ) {
        let map = self.get_or_create_map_mut(key);
        if let Some(value) = map.get_mut(key) {
            let v = take(value);
            if let Some(v) = update(Some(v)) {
                *value = v;
            } else {
                map.remove(key);
            }
        } else if let Some(v) = update(None) {
            map.insert(key.clone(), v);
        }
    }
}

pub struct Storage<K, T: KeyValuePair>
where
    T::Key: Indexed,
{
    map: DashMap<K, InnerStorage<T>, BuildHasherDefault<FxHasher>>,
}

impl<K, T> Storage<K, T>
where
    T: KeyValuePair,
    T::Key: Indexed,
    K: Eq + std::hash::Hash + Clone,
{
    pub fn new() -> Self {
        let shard_amount =
            (available_parallelism().map_or(4, |v| v.get()) * 64).next_power_of_two();
        Self {
            map: DashMap::with_capacity_and_hasher_and_shard_amount(
                1024 * 1024,
                Default::default(),
                shard_amount,
            ),
        }
    }

    pub fn access_mut(&self, key: K) -> StorageWriteGuard<'_, K, T> {
        let inner = match self.map.entry(key) {
            dashmap::mapref::entry::Entry::Occupied(e) => e.into_ref(),
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(InnerStorage::new()),
        };
        StorageWriteGuard {
            inner: inner.into(),
        }
    }

    pub fn access_pair_mut(
        &self,
        key1: K,
        key2: K,
    ) -> (StorageWriteGuard<'_, K, T>, StorageWriteGuard<'_, K, T>) {
        let (a, b) = get_multiple_mut(&self.map, key1, key2, || InnerStorage::new());
        (
            StorageWriteGuard { inner: a },
            StorageWriteGuard { inner: b },
        )
    }
}

pub struct StorageWriteGuard<'a, K, T>
where
    T: KeyValuePair,
    T::Key: Indexed,
{
    inner: RefMut<'a, K, InnerStorage<T>>,
}

impl<K, T> Deref for StorageWriteGuard<'_, K, T>
where
    T: KeyValuePair,
    T::Key: Indexed,
    K: Eq + Hash,
{
    type Target = InnerStorage<T>;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<K, T> DerefMut for StorageWriteGuard<'_, K, T>
where
    T: KeyValuePair,
    T::Key: Indexed,
    K: Eq + Hash,
{
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

macro_rules! get {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValue::$key {
            value,
        }) = $task.get(&$crate::data::CachedDataItemKey::$key $input).as_ref() {
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::get!($task, $key {})
    };
}

macro_rules! get_mut {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValue::$key {
            value,
        }) = $task.get_mut(&$crate::data::CachedDataItemKey::$key $input).as_mut() {
            let () = $crate::data::allow_mut_access::$key;
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::get_mut!($task, $key {})
    };
}

/// Creates an iterator over all [`CachedDataItemKey::$key`][crate::data::CachedDataItemKey]s in
/// `$task` matching the given `$key_pattern`, optional `$value_pattern`, and optional `if $cond`.
///
/// Each element in the iterator is determined by `$iter_item`, which may use fields extracted by
/// `$key_pattern` or `$value_pattern`.
macro_rules! iter_many {
    ($task:ident, $key:ident $key_pattern:tt $(if $cond:expr)? => $iter_item:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        $task
            .iter($crate::data::indicies::$key)
            .filter_map(|(key, _)| match key {
                $crate::data::CachedDataItemKey::$key $key_pattern $(if $cond)? => Some(
                    $iter_item
                ),
                _ => None,
            })
    }};
    ($task:ident, $key:ident $input:tt $value_pattern:tt $(if $cond:expr)? => $iter_item:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        $task
            .iter($crate::data::indicies::$key)
            .filter_map(|(key, value)| match (key, value) {
                (
                    $crate::data::CachedDataItemKey::$key $input,
                    $crate::data::CachedDataItemValue::$key { value: $value_pattern }
                ) $(if $cond)? => Some($iter_item),
                _ => None,
            })
    }};
}

/// A thin wrapper around [`iter_many`] that calls [`Iterator::collect`].
///
/// Note that the return type of [`Iterator::collect`] may be ambiguous in certain contexts, so
/// using this macro may require explicit type annotations on variables.
macro_rules! get_many {
    ($($args:tt)*) => {
        $crate::backend::storage::iter_many!($($args)*).collect()
    };
}

macro_rules! update {
    ($task:ident, $key:ident $input:tt, $update:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        #[allow(unused_mut)]
        let mut update = $update;
        $task.update(&$crate::data::CachedDataItemKey::$key $input, |old| {
            update(old.and_then(|old| {
                if let $crate::data::CachedDataItemValue::$key { value } = old {
                    Some(value)
                } else {
                    None
                }
            }))
            .map(|new| $crate::data::CachedDataItemValue::$key { value: new })
        })
    }};
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update!($task, $key {}, $update)
    };
}

macro_rules! update_ucount_and_get {
    ($task:ident, $key:ident $input:tt, -$update:expr) => {{
        let update = $update;
        let mut value = 0;
        $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
            if let Some(old) = old {
                value = old - update;
                (value != 0).then_some(value)
            } else {
                None
            }
        });
        value
    }};
    ($task:ident, $key:ident $input:tt, $update:expr) => {{
        let update = $update;
        let mut value = 0;
        $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
            if let Some(old) = old {
                value = old + update;
                (value != 0).then_some(value)
            } else {
                value = update;
                (update != 0).then_some(update)
            }
        });
        value
    }};
    ($task:ident, $key:ident, -$update:expr) => {
        $crate::backend::storage::update_ucount_and_get!($task, $key {}, -$update)
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_ucount_and_get!($task, $key {}, $update)
    };
}

macro_rules! update_count {
    ($task:ident, $key:ident $input:tt, -$update:expr) => {{
        let update = $update;
        let mut state_change = false;
        $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
            #[allow(unused_comparisons, reason = "type of update might be unsigned, where update < 0 is always false")]
            if let Some(old) = old {
                let new = old - update;
                state_change = old <= 0 && new > 0 || old > 0 && new <= 0;
                (new != 0).then_some(new)
            } else {
                state_change = update < 0;
                (update != 0).then_some(-update)
            }
        });
        state_change
    }};
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        match $update {
            update => {
                let mut state_change = false;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    if let Some(old) = old {
                        let new = old + update;
                        state_change = old <= 0 && new > 0 || old > 0 && new <= 0;
                        (new != 0).then_some(new)
                    } else {
                        state_change = update > 0;
                        (update != 0).then_some(update)
                    }
                });
                state_change
            }
        }
    };
    ($task:ident, $key:ident, -$update:expr) => {
        $crate::backend::storage::update_count!($task, $key {}, -$update)
    };    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_count!($task, $key {}, $update)
    };
}

macro_rules! remove {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.remove(
            &$crate::data::CachedDataItemKey::$key $input
        ) {
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::remove!($task, $key {})
    };
}

pub(crate) use get;
pub(crate) use get_many;
pub(crate) use get_mut;
pub(crate) use iter_many;
pub(crate) use remove;
pub(crate) use update;
pub(crate) use update_count;
pub(crate) use update_ucount_and_get;
