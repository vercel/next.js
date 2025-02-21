use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    thread::available_parallelism,
};

use turbo_tasks::{FxDashMap, TaskId};

use crate::{
    backend::dynamic_storage::DynamicStorage,
    data::{
        AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut, OutputValue,
    },
    data_storage::{AutoMapStorage, OptionStorage},
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

pub struct InnerStorage {
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, i32>,
    dynamic: DynamicStorage,
    persistance_state: PersistanceState,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            aggregation_number: Default::default(),
            output_dependent: Default::default(),
            output: Default::default(),
            upper: Default::default(),
            dynamic: DynamicStorage::new(),
            persistance_state: PersistanceState::default(),
        }
    }

    pub fn persistance_state(&self) -> &PersistanceState {
        &self.persistance_state
    }

    pub fn persistance_state_mut(&mut self) -> &mut PersistanceState {
        &mut self.persistance_state
    }
}

#[macro_export]
macro_rules! generate_inner_storage_internal {
    // Matching on CachedDataItem with a $value
    (CachedDataItem: $self:ident, $item:ident, $value:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItem::$tag { $key_field, $value } = $item {
            let result = $self.$field.$fn($key_field, $($args)*);
            return $crate::generate_inner_storage_internal!(return_value: result, $return_ty: $tag $key_field => $field);
        }
    };
    (CachedDataItem: $self:ident, $item:ident, $value:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident => $field:ident,) => {
        if let CachedDataItem::$tag { $value } = $item {
            let result = $self.$field.$fn((), $($args)*);
            return $crate::generate_inner_storage_internal!(return_value: result, $return_ty: $tag => $field);
        }
    };
    (CachedDataItem: $self:ident, $item:ident, $value:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(CachedDataItem: $self, $item, $value, $return_ty, $fn($($args)*): $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(CachedDataItem: $self, $item, $value, $return_ty, $fn($($args)*): $($config)+)
    };
    // Matching on CachedDataItemKey without a $value
    (CachedDataItemKey: $self:ident, $item:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { $key_field } = $item {
            let result = $self.$field.$fn($key_field, $($args)*);
            return $crate::generate_inner_storage_internal!(return_value: result, $return_ty: $tag $key_field => $field);
        }
    };
    (CachedDataItemKey: $self:ident, $item:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { } = $item {
            let result = $self.$field.$fn(&(), $($args)*);
            return $crate::generate_inner_storage_internal!(return_value: result, $return_ty: $tag => $field);
        }
    };
    (CachedDataItemKey: $self:ident, $item:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(CachedDataItemKey: $self, $item, $return_ty, $fn($($args)*): $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(CachedDataItemKey: $self, $item, $return_ty, $fn($($args)*): $($config)+)
    };
    // Matching on CachedDataItemType without a $value
    (CachedDataItemType: $self:ident, $item:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $($key_field:ident)? => $field:ident,) => {
        if let CachedDataItemType::$tag = $item {
            let result = $self.$field.$fn($($args)*);
            return $crate::generate_inner_storage_internal!(return_value: result, $return_ty: $tag $($key_field)? => $field);
        }
    };
    (CachedDataItemType: $self:ident, $item:ident, $return_ty:tt, $fn:ident($($args:tt)*): $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(CachedDataItemType: $self, $item, $return_ty, $fn($($args)*): $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(CachedDataItemType: $self, $item, $return_ty, $fn($($args)*): $($config)+)
    };

    // fn update
    (update: $self:ident, $key:ident, $update:ident: $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { $key_field } = $key {
            $self.$field.update($key_field, |old| {
                let old = old.map(|old| CachedDataItemValue::$tag { value: old });
                let new = $update(old);
                new.map(|new| if let CachedDataItemValue::$tag { value } = new {
                    value
                } else {
                    unreachable!()
                })
            });
            return;
        }
    };
    (update: $self:ident, $key:ident, $update:ident: $tag:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { } = $key {
            $self.$field.update((), |old| {
                let old = old.map(|old| CachedDataItemValue::$tag { value: old });
                let new = $update(old);
                new.map(|new| if let CachedDataItemValue::$tag { value } = new {
                    value
                } else {
                    unreachable!()
                })
            });
            return;
        }
    };
    (update: $self:ident, $key:ident, $update:ident: $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(update: $self, $key, $update: $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(update: $self, $key, $update: $($config)+)
    };

    // fn get_mut_or_insert_with
    (get_mut_or_insert_with: $self:ident, $key:ident, $insert_with:ident: $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { $key_field } = $key {
            let value = $self.$field.get_mut_or_insert_with($key_field, || {
                let value = $insert_with();
                if let CachedDataItemValue::$tag { value } = value {
                    value
                } else {
                    unreachable!()
                }
            });
            return CachedDataItemValueRefMut::$tag { value };
        }
    };
    (get_mut_or_insert_with: $self:ident, $key:ident, $insert_with:ident: $tag:ident => $field:ident,) => {
        if let CachedDataItemKey::$tag { } = $key {
            let value = $self.$field.get_mut_or_insert_with((), || {
                let value = $insert_with();
                if let CachedDataItemValue::$tag { value } = value {
                    value
                } else {
                    unreachable!()
                }
            });
            return CachedDataItemValueRefMut::$tag { value };
        }
    };
    (get_mut_or_insert_with: $self:ident, $key:ident, $insert_with:ident: $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(get_mut_or_insert_with: $self, $key, $insert_with: $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(get_mut_or_insert_with: $self, $key, $insert_with: $($config)+)
    };

    // fn extract_if
    (extract_if: $self:ident, $ty:ident, $f:ident: $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            let iter = $self.$field.extract_if(move |key, value| {
                $f(CachedDataItemKey::$tag { $key_field: *key }, CachedDataItemValueRef::$tag { value })
            }).map(|($key_field, value)| CachedDataItem::$tag { $key_field, value });
            return InnerStorageIter::$tag(iter);
        }
    };
    (extract_if: $self:ident, $ty:ident, $f:ident: $tag:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            let iter = $self.$field.extract_if(move |_, value| {
                $f(CachedDataItemKey::$tag { }, CachedDataItemValueRef::$tag { value })
            }).map(|(_, value)| CachedDataItem::$tag { value });
            return InnerStorageIter::$tag(iter);
        }
    };
    (extract_if: $self:ident, $ty:ident, $f:ident: $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(extract_if: $self, $ty, $f: $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(extract_if: $self, $ty, $f: $($config)+)
    };

    // fn iter
    (iter: $self:ident, $ty:ident: $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            let iter = $self.$field.iter().map(|($key_field, value)| (CachedDataItemKey::$tag { $key_field: *$key_field }, CachedDataItemValueRef::$tag { value }));
            return InnerStorageIter::$tag(iter);
        }
    };
    (iter: $self:ident, $ty:ident: $tag:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            let iter = $self.$field.iter().map(|(_, value)| (CachedDataItemKey::$tag { }, CachedDataItemValueRef::$tag { value }));
            return InnerStorageIter::$tag(iter);
        }
    };
    (iter: $self:ident, $ty:ident: $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(iter: $self, $ty: $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(iter: $self, $ty: $($config)+)
    };


    // Return value handling
    (return_value: $result:ident, none: $($more:tt)*) => {
        $result
    };
    (return_value: $result:ident, option_value: $tag:ident $($more:tt)*) => {
        $result.map(|value| CachedDataItemValue::$tag { value })
    };
    (return_value: $result:ident, option_ref: $tag:ident $($more:tt)*) => {
        $result.map(|value| CachedDataItemValueRef::$tag { value })
    };
    (return_value: $result:ident, option_ref_mut: $tag:ident $($more:tt)*) => {
        $result.map(|value| CachedDataItemValueRefMut::$tag { value })
    };

    // Input value handling
    (input_value: $input:ident, option_value: $tag:ident $($more:tt)*) => {
        $input.map(|value| {
            if let CachedDataItemValue::$tag { value } = value {
                value
            } else {
                unreachable!()
            }
        })
    };

}

macro_rules! generate_inner_storage {
    ($($config:tt)*) => {
        impl InnerStorage {
            pub fn add(&mut self, item: CachedDataItem) -> bool {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItem: self, item, value, none, add(value): $($config)*);
                self.dynamic.add(item)
            }

            pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItem: self, item, value, option_value, insert(value): $($config)*);
                self.dynamic.insert(item)
            }

            pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemKey: self, key, option_value, remove(): $($config)*);
                self.dynamic.remove(key)
            }

            pub fn count(&self, ty: CachedDataItemType) -> usize {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemType: self, ty, none, len(): $($config)*);
                self.dynamic.count(ty)
            }

            pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef> {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemKey: self, key, option_ref, get(): $($config)*);
                self.dynamic.get(key)
            }

            pub fn contains_key(&self, key: &CachedDataItemKey) -> bool {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemKey: self, key, none, contains_key(): $($config)*);
                self.dynamic.contains_key(key)
            }

            pub fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut> {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemKey: self, key, option_ref_mut, get_mut(): $($config)*);
                self.dynamic.get_mut(key)
            }

            pub fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(CachedDataItemType: self, ty, none, shrink_to_fit(): $($config)*);
                self.dynamic.shrink_to_fit(ty)
            }

            pub fn update(
                &mut self,
                key: CachedDataItemKey,
                update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
            ) {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(update: self, key, update: $($config)*);
                self.dynamic.update(key, update)
            }

            pub fn extract_if<'l, F>(
                &'l mut self,
                ty: CachedDataItemType,
                mut f: F,
            ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
            where
                F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
            {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(extract_if: self, ty, f: $($config)*);
                InnerStorageIter::Dynamic(self.dynamic.extract_if(ty, f))
            }

            pub fn get_mut_or_insert_with(
                &mut self,
                key: CachedDataItemKey,
                f: impl FnOnce() -> CachedDataItemValue,
            ) -> CachedDataItemValueRefMut<'_>
            {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(get_mut_or_insert_with: self, key, f: $($config)*);
                self.dynamic.get_mut_or_insert_with(key, f)
            }

            pub fn iter(
                &self,
                ty: CachedDataItemType,
            ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)>
            {
                use crate::data_storage::Storage;
                $crate::generate_inner_storage_internal!(iter: self, ty: $($config)*);
                InnerStorageIter::Dynamic(self.dynamic.iter(ty))
            }

        }
    };
}

generate_inner_storage!(
    AggregationNumber => aggregation_number,
    OutputDependent task => output_dependent,
    Output => output,
    Upper task => upper,
);

enum InnerStorageIter<A, B, C, D, E> {
    AggregationNumber(A),
    OutputDependent(B),
    Output(C),
    Upper(D),
    Dynamic(E),
}

impl<T, A, B, C, D, E> Iterator for InnerStorageIter<A, B, C, D, E>
where
    A: Iterator<Item = T>,
    B: Iterator<Item = T>,
    C: Iterator<Item = T>,
    D: Iterator<Item = T>,
    E: Iterator<Item = T>,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            InnerStorageIter::AggregationNumber(iter) => iter.next(),
            InnerStorageIter::OutputDependent(iter) => iter.next(),
            InnerStorageIter::Output(iter) => iter.next(),
            InnerStorageIter::Upper(iter) => iter.next(),
            InnerStorageIter::Dynamic(iter) => iter.next(),
        }
    }
}

impl InnerStorage {
    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        use crate::data_storage::Storage;
        self.dynamic
            .iter_all()
            .chain(self.aggregation_number.iter().map(|(_, value)| {
                (
                    CachedDataItemKey::AggregationNumber {},
                    CachedDataItemValueRef::AggregationNumber { value },
                )
            }))
            .chain(self.output.iter().map(|(_, value)| {
                (
                    CachedDataItemKey::Output {},
                    CachedDataItemValueRef::Output { value },
                )
            }))
            .chain(self.upper.iter().map(|(k, value)| {
                (
                    CachedDataItemKey::Upper { task: *k },
                    CachedDataItemValueRef::Upper { value },
                )
            }))
            .chain(self.output_dependent.iter().map(|(k, value)| {
                (
                    CachedDataItemKey::OutputDependent { task: *k },
                    CachedDataItemValueRef::OutputDependent { value },
                )
            }))
    }
}

pub struct Storage {
    map: FxDashMap<TaskId, Box<InnerStorage>>,
}

impl Storage {
    pub fn new() -> Self {
        let shard_amount =
            (available_parallelism().map_or(4, |v| v.get()) * 64).next_power_of_two();
        Self {
            map: FxDashMap::with_capacity_and_hasher_and_shard_amount(
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
        }) = $task.get_mut(&$crate::data::CachedDataItemKey::$key $input) {
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
        } = $task.get_mut_or_insert_with($crate::data::CachedDataItemKey::$key $input, move || $crate::data::CachedDataItemValue::$key { value: functor() }) else {
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
