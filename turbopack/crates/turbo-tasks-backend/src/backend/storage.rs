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
use turbo_tasks::{KeyValuePair, TaskId};

use crate::{
    backend::indexed::Indexed,
    data::{CachedDataItem, CachedDataItemIndex, CachedDataItemKey, CachedDataItemValue},
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

const INDEX_THRESHOLD: usize = 128;

type IndexedMap =
    AutoMap<Option<CachedDataItemIndex>, AutoMap<CachedDataItemKey, CachedDataItemValue>>;

enum InnerStorageMap {
    Plain(AutoMap<CachedDataItemKey, CachedDataItemValue>),
    Indexed(IndexedMap),
}

pub struct InnerStorage {
    map: InnerStorageMap,
    persistance_state: PersistanceState,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            map: InnerStorageMap::Plain(AutoMap::new()),
            persistance_state: PersistanceState::default(),
        }
    }

    pub fn persistance_state(&self) -> &PersistanceState {
        &self.persistance_state
    }

    pub fn persistance_state_mut(&mut self) -> &mut PersistanceState {
        &mut self.persistance_state
    }

    fn check_threshold(&mut self) {
        let InnerStorageMap::Plain(plain_map) = &mut self.map else {
            return;
        };
        if plain_map.len() >= INDEX_THRESHOLD {
            let mut map: IndexedMap = AutoMap::new();
            for (key, value) in take(plain_map).into_iter() {
                let index = key.index();
                map.entry(index).or_default().insert(key, value);
            }
            self.map = InnerStorageMap::Indexed(map);
        }
    }

    fn get_or_create_map_mut(
        &mut self,
        key: &CachedDataItemKey,
    ) -> &mut AutoMap<CachedDataItemKey, CachedDataItemValue> {
        self.check_threshold();
        match &mut self.map {
            InnerStorageMap::Plain(map) => map,
            InnerStorageMap::Indexed(map) => map.entry(key.index()).or_default(),
        }
    }

    fn get_map_mut(
        &mut self,
        key: &CachedDataItemKey,
    ) -> Option<&mut AutoMap<CachedDataItemKey, CachedDataItemValue>> {
        self.check_threshold();
        match &mut self.map {
            InnerStorageMap::Plain(map) => Some(map),
            InnerStorageMap::Indexed(map) => map.get_mut(&key.index()),
        }
    }

    fn get_map(
        &self,
        key: &CachedDataItemKey,
    ) -> Option<&AutoMap<CachedDataItemKey, CachedDataItemValue>> {
        match &self.map {
            InnerStorageMap::Plain(map) => Some(map),
            InnerStorageMap::Indexed(map) => map.get(&key.index()),
        }
    }

    fn index_map(
        &self,
        index: <CachedDataItemKey as Indexed>::Index,
    ) -> Option<&AutoMap<CachedDataItemKey, CachedDataItemValue>> {
        match &self.map {
            InnerStorageMap::Plain(map) => Some(map),
            InnerStorageMap::Indexed(map) => map.get(&index),
        }
    }

    fn index_map_mut(
        &mut self,
        index: <CachedDataItemKey as Indexed>::Index,
    ) -> Option<&mut AutoMap<CachedDataItemKey, CachedDataItemValue>> {
        match &mut self.map {
            InnerStorageMap::Plain(map) => Some(map),
            InnerStorageMap::Indexed(map) => map.get_mut(&index),
        }
    }

    pub fn add(&mut self, item: CachedDataItem) -> bool {
        let (key, value) = item.into_key_and_value();
        match self.get_or_create_map_mut(&key).entry(key) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(value);
                true
            }
        }
    }

    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let (key, value) = item.into_key_and_value();
        self.get_or_create_map_mut(&key).insert(key, value)
    }

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        self.get_map_mut(key).and_then(|m| {
            if let Some(result) = m.remove(key) {
                m.shrink_amortized();
                Some(result)
            } else {
                None
            }
        })
    }

    pub fn get(&self, key: &CachedDataItemKey) -> Option<&CachedDataItemValue> {
        self.get_map(key).and_then(|m| m.get(key))
    }

    pub fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<&mut CachedDataItemValue> {
        self.get_map_mut(key).and_then(|m| m.get_mut(key))
    }

    pub fn has_key(&self, key: &CachedDataItemKey) -> bool {
        self.get_map(key)
            .map(|m| m.contains_key(key))
            .unwrap_or_default()
    }

    pub fn is_indexed(&self) -> bool {
        matches!(self.map, InnerStorageMap::Indexed { .. })
    }

    pub fn iter(
        &self,
        index: <CachedDataItemKey as Indexed>::Index,
    ) -> impl Iterator<Item = (&CachedDataItemKey, &CachedDataItemValue)> {
        self.index_map(index)
            .map(|m| m.iter())
            .into_iter()
            .flatten()
    }

    pub fn iter_all(&self) -> impl Iterator<Item = (&CachedDataItemKey, &CachedDataItemValue)> {
        match &self.map {
            InnerStorageMap::Plain(map) => Either::Left(map.iter()),
            InnerStorageMap::Indexed(map) => Either::Right(map.iter().flat_map(|(_, m)| m.iter())),
        }
    }

    pub fn extract_if<'l, F>(
        &'l mut self,
        index: <CachedDataItemKey as Indexed>::Index,
        mut f: F,
    ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
    where
        F: for<'a, 'b> FnMut(&'a CachedDataItemKey, &'b CachedDataItemValue) -> bool + 'l,
    {
        self.index_map_mut(index)
            .map(move |m| m.extract_if(move |k, v| f(k, v)))
            .into_iter()
            .flatten()
            .map(|(key, value)| CachedDataItem::from_key_and_value(key, value))
    }

    pub fn extract_if_all<'l, F>(
        &'l mut self,
        mut f: F,
    ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
    where
        F: for<'a, 'b> FnMut(&'a CachedDataItemKey, &'b CachedDataItemValue) -> bool + 'l,
    {
        match &mut self.map {
            InnerStorageMap::Plain(map) => map
                .extract_if(move |k, v| f(k, v))
                .map(|(key, value)| CachedDataItem::from_key_and_value(key, value)),
            InnerStorageMap::Indexed { .. } => {
                panic!("Do not use extract_if_all with indexed storage")
            }
        }
    }

    pub fn update(
        &mut self,
        key: &CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        let map = self.get_or_create_map_mut(key);
        if let Some(value) = map.get_mut(key) {
            let v = take(value);
            if let Some(v) = update(Some(v)) {
                *value = v;
            } else {
                map.remove(key);
                map.shrink_amortized();
            }
        } else if let Some(v) = update(None) {
            map.insert(key.clone(), v);
        }
    }
}

pub struct Storage {
    map: DashMap<TaskId, InnerStorage, BuildHasherDefault<FxHasher>>,
}

impl Storage {
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

    pub fn access_mut(&self, key: TaskId) -> StorageWriteGuard<'_> {
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
        key1: TaskId,
        key2: TaskId,
    ) -> (StorageWriteGuard<'_>, StorageWriteGuard<'_>) {
        let (a, b) = get_multiple_mut(&self.map, key1, key2, || InnerStorage::new());
        (
            StorageWriteGuard { inner: a },
            StorageWriteGuard { inner: b },
        )
    }
}

pub struct StorageWriteGuard<'a> {
    inner: RefMut<'a, TaskId, InnerStorage>,
}

impl Deref for StorageWriteGuard<'_> {
    type Target = InnerStorage;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for StorageWriteGuard<'_> {
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
