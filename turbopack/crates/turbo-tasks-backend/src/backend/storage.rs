use std::{
    hash::{BuildHasherDefault, Hash},
    ops::{Deref, DerefMut},
    thread::available_parallelism,
};

use dashmap::DashMap;
use either::Either;
use rustc_hash::FxHasher;
use turbo_tasks::{KeyValuePair, TaskId};

use crate::{
    data::{
        CachedDataItem, CachedDataItemKey, CachedDataItemStorage, CachedDataItemType,
        CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut,
    },
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

type InnerStorageMap = Vec<CachedDataItemStorage>;

pub struct InnerStorage {
    map: InnerStorageMap,
    persistance_state: PersistanceState,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            map: Default::default(),
            persistance_state: PersistanceState::default(),
        }
    }

    pub fn persistance_state(&self) -> &PersistanceState {
        &self.persistance_state
    }

    pub fn persistance_state_mut(&mut self) -> &mut PersistanceState {
        &mut self.persistance_state
    }

    fn get_or_create_map_mut(&mut self, ty: CachedDataItemType) -> &mut CachedDataItemStorage {
        let i = self.map.iter().position(|m| m.ty() == ty);
        if let Some(i) = i {
            &mut self.map[i]
        } else {
            self.map.reserve_exact(1);
            self.map.push(CachedDataItemStorage::new(ty));
            self.map.last_mut().unwrap()
        }
    }

    fn get_map_mut(&mut self, ty: CachedDataItemType) -> Option<&mut CachedDataItemStorage> {
        self.map.iter_mut().find(|m| m.ty() == ty)
    }

    fn get_map_index(&mut self, ty: CachedDataItemType) -> Option<usize> {
        self.map.iter_mut().position(|m| m.ty() == ty)
    }

    fn get_or_create_map_index(&mut self, ty: CachedDataItemType) -> usize {
        let i = self.map.iter().position(|m| m.ty() == ty);
        if let Some(i) = i {
            i
        } else {
            let i = self.map.len();
            self.map.reserve_exact(1);
            self.map.push(CachedDataItemStorage::new(ty));
            i
        }
    }

    fn get_map(&self, ty: CachedDataItemType) -> Option<&CachedDataItemStorage> {
        self.map.iter().find(|m| m.ty() == ty)
    }

    pub fn add(&mut self, item: CachedDataItem) -> bool {
        let ty = item.ty();
        self.get_or_create_map_mut(ty).add(item)
    }

    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let ty = item.ty();
        self.get_or_create_map_mut(ty).insert(item)
    }

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        self.get_map_index(key.ty()).and_then(|i| {
            let storage = &mut self.map[i];
            let result = storage.remove(key);
            if result.is_some() && storage.is_empty() {
                self.map.swap_remove(i);
                self.map.shrink_to_fit();
            }
            result
        })
    }

    pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef> {
        self.get_map(key.ty()).and_then(|m| m.get(key))
    }

    pub fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut> {
        self.get_map_mut(key.ty()).and_then(|m| m.get_mut(key))
    }

    pub fn get_mut_or_insert_with(
        &mut self,
        key: &CachedDataItemKey,
        f: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_> {
        self.get_or_create_map_mut(key.ty())
            .get_mut_or_insert_with(key, f)
    }

    pub fn has_key(&self, key: &CachedDataItemKey) -> bool {
        self.get_map(key.ty())
            .map(|m| m.contains_key(key))
            .unwrap_or_default()
    }

    pub fn count(&self, ty: CachedDataItemType) -> usize {
        self.get_map(ty).map(|m| m.len()).unwrap_or_default()
    }

    pub fn iter(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.get_map(ty).map(|m| m.iter()).into_iter().flatten()
    }

    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.map.iter().flat_map(|m| m.iter())
    }

    pub fn extract_if<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        mut f: F,
    ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        // TODO this could be more efficient when the storage would support extract_if directly.
        // This requires some macro magic to make it work...
        // But we could potentially avoid the two temporary Vecs.
        let Some(i) = self.get_map_index(ty) else {
            return Either::Left(std::iter::empty());
        };
        let storage = &mut self.map[i];
        let items_to_extract = storage
            .iter()
            .filter(|(k, v)| f(*k, *v))
            .map(|(key, _)| key)
            .collect::<Vec<_>>();
        let items = items_to_extract
            .into_iter()
            .map(move |key| {
                let value = storage.remove(&key).unwrap();
                CachedDataItem::from_key_and_value(key, value)
            })
            .collect::<Vec<_>>();
        if self.map[i].is_empty() {
            self.map.swap_remove(i);
            self.map.shrink_to_fit();
        }
        Either::Right(items.into_iter())
    }

    pub fn update(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        let i = self.get_or_create_map_index(key.ty());
        let map = &mut self.map[i];
        if let Some(v) = update(map.remove(&key)) {
            map.insert(CachedDataItem::from_key_and_value(key, v));
        } else if map.is_empty() {
            self.map.swap_remove(i);
            self.map.shrink_to_fit();
        }
    }

    pub fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
        if let Some(map) = self.get_map_mut(ty) {
            map.shrink_to_fit();
        }
    }
}

pub struct Storage {
    map: DashMap<TaskId, Box<InnerStorage>, BuildHasherDefault<FxHasher>>,
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
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(Box::new(InnerStorage::new())),
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
        let (a, b) = get_multiple_mut(&self.map, key1, key2, || Box::new(InnerStorage::new()));
        (
            StorageWriteGuard { inner: a },
            StorageWriteGuard { inner: b },
        )
    }
}

pub struct StorageWriteGuard<'a> {
    inner: RefMut<'a, TaskId, Box<InnerStorage>>,
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

macro_rules! count {
    ($task:ident, $key:ident) => {{
        $task.count($crate::data::CachedDataItemType::$key)
    }};
}

macro_rules! get {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValueRef::$key {
            value,
        }) = $task.get(&$crate::data::CachedDataItemKey::$key $input) {
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
        if let Some($crate::data::CachedDataItemValueRefMut::$key {
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

macro_rules! get_mut_or_insert_with {
    ($task:ident, $key:ident $input:tt, $f:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        let () = $crate::data::allow_mut_access::$key;
        let functor = $f;
        let $crate::data::CachedDataItemValueRefMut::$key {
            value,
        } = $task.get_mut_or_insert_with(&$crate::data::CachedDataItemKey::$key $input, move || $crate::data::CachedDataItemValue::$key { value: functor() }) else {
            unreachable!()
        };
        value
    }};
    ($task:ident, $key:ident, $f:expr) => {
        $crate::backend::storage::get_mut_or_insert_with!($task, $key {}, $f)
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
            .iter($crate::data::CachedDataItemType::$key)
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
            .iter($crate::data::CachedDataItemType::$key)
            .filter_map(|(key, value)| match (key, value) {
                (
                    $crate::data::CachedDataItemKey::$key $input,
                    $crate::data::CachedDataItemValueRef::$key { value: $value_pattern }
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
        $task.update($crate::data::CachedDataItemKey::$key $input, |old| {
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

pub(crate) use count;
pub(crate) use get;
pub(crate) use get_many;
pub(crate) use get_mut;
pub(crate) use get_mut_or_insert_with;
pub(crate) use iter_many;
pub(crate) use remove;
pub(crate) use update;
pub(crate) use update_count;
