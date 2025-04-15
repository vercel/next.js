use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::atomic::AtomicBool,
    thread::available_parallelism,
};

use bitfield::*;
use rayon::iter::{IndexedParallelIterator, IntoParallelRefIterator, ParallelIterator};
use turbo_tasks::{FxDashMap, TaskId};

use crate::{
    backend::dynamic_storage::DynamicStorage,
    data::{
        AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut, OutputValue,
    },
    data_storage::{AutoMapStorage, OptionStorage},
    utils::{
        dash_map_multi::{get_multiple_mut, RefMut},
        swap_retain,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
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

bitfield! {
    #[derive(Clone, Default)]
    pub struct InnerStorageState(u32);
    impl Debug;
    pub meta_restored, set_meta_restored: 0;
    pub data_restored, set_data_restored: 1;
    /// Item was modified before snapshot mode was entered.
    pub modified, set_modified: 2;
    /// Item was modified after snapshot mode was entered. A snapshot was taken.
    pub snapshot, set_snapshot: 3;
}

impl InnerStorageState {
    pub fn set_restored(&mut self, category: TaskDataCategory) {
        match category {
            TaskDataCategory::Meta => {
                self.set_meta_restored(true);
            }
            TaskDataCategory::Data => {
                self.set_data_restored(true);
            }
            TaskDataCategory::All => {
                self.set_meta_restored(true);
                self.set_data_restored(true);
            }
        }
    }

    pub fn is_restored(&self, category: TaskDataCategory) -> bool {
        match category {
            TaskDataCategory::Meta => self.meta_restored(),
            TaskDataCategory::Data => self.data_restored(),
            TaskDataCategory::All => self.meta_restored() && self.data_restored(),
        }
    }
}

pub struct InnerStorageSnapshot {
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, i32>,
    dynamic: DynamicStorage,
    pub meta_restored: bool,
    pub data_restored: bool,
}

impl From<&InnerStorage> for InnerStorageSnapshot {
    fn from(inner: &InnerStorage) -> Self {
        Self {
            aggregation_number: inner.aggregation_number.clone(),
            output_dependent: inner.output_dependent.clone(),
            output: inner.output.clone(),
            upper: inner.upper.clone(),
            dynamic: inner.dynamic.snapshot_for_persisting(),
            meta_restored: inner.state.meta_restored(),
            data_restored: inner.state.data_restored(),
        }
    }
}

impl InnerStorageSnapshot {
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

    pub fn len(&self) -> usize {
        use crate::data_storage::Storage;
        self.dynamic.len()
            + self.aggregation_number.len()
            + self.output.len()
            + self.upper.len()
            + self.output_dependent.len()
    }
}

#[derive(Debug, Clone)]
pub struct InnerStorage {
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, i32>,
    dynamic: DynamicStorage,
    state: InnerStorageState,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            aggregation_number: Default::default(),
            output_dependent: Default::default(),
            output: Default::default(),
            upper: Default::default(),
            dynamic: DynamicStorage::new(),
            state: InnerStorageState::default(),
        }
    }

    pub fn state(&self) -> &InnerStorageState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut InnerStorageState {
        &mut self.state
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

    pub fn len(&self) -> usize {
        use crate::data_storage::Storage;
        self.dynamic.len()
            + self.aggregation_number.len()
            + self.output.len()
            + self.upper.len()
            + self.output_dependent.len()
    }
}

enum ModifiedState {
    /// It was modified before snapshot mode was entered, but it was not accessed during snapshot
    /// mode.
    Modified,
    /// Snapshot(Some):
    /// It was modified before snapshot mode was entered and it was accessed again during snapshot
    /// mode. A copy of the version of the item when snapshot mode was entered is stored here.
    /// Snapshot(None):
    /// It was not modified before snapshot mode was entered, but it was accessed during snapshot
    /// mode. Or the snapshot was already taken out by the snapshot operation.
    Snapshot(Option<Box<InnerStorageSnapshot>>),
}

pub struct Storage {
    snapshot_mode: AtomicBool,
    modified: FxDashMap<TaskId, ModifiedState>,
    map: FxDashMap<TaskId, Box<InnerStorage>>,
}

impl Storage {
    pub fn new() -> Self {
        let shard_amount =
            (available_parallelism().map_or(4, |v| v.get()) * 64).next_power_of_two();
        Self {
            snapshot_mode: AtomicBool::new(false),
            modified: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                1024,
                Default::default(),
                shard_amount,
            ),
            map: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                1024 * 1024,
                Default::default(),
                shard_amount,
            ),
        }
    }

    /// Processes every modified item (resp. a snapshot of it) with the given functions and returns
    /// the results. Ends snapshot mode afterwards.
    /// preprocess is potentially called within a lock, so it should be fast.
    /// process is called outside of locks, so it could do more expensive operations.
    pub fn take_snapshot<T, R: Send>(
        &self,
        preprocess: impl for<'a> Fn(TaskId, &'a InnerStorage) -> T + Sync,
        process: impl Fn(TaskId, T) -> R + Sync,
        process_snapshot: impl for<'a> Fn(TaskId, Box<InnerStorageSnapshot>) -> R + Sync,
    ) -> Vec<Vec<R>> {
        if !self.snapshot_mode() {
            self.start_snapshot();
        }

        let result = self
            .modified
            .shards()
            .par_iter()
            .with_max_len(1)
            .map(|shard| {
                let mut unprocessed: Vec<(TaskId, Box<InnerStorageSnapshot>)> = Vec::new();
                let mut modified: Vec<TaskId> = Vec::new();
                {
                    // Take the snapshots from the modified map
                    let guard = shard.write();
                    // Safety: guard must outlive the iterator.
                    for bucket in unsafe { guard.iter() } {
                        // Safety: the guard guarantees that the bucket is not removed and the ptr
                        // is valid.
                        let (key, shared_value) = unsafe { bucket.as_mut() };
                        let modified_state = shared_value.get_mut();
                        match modified_state {
                            ModifiedState::Modified => {
                                modified.push(*key);
                            }
                            ModifiedState::Snapshot(snapshot) => {
                                if let Some(snapshot) = snapshot.take() {
                                    unprocessed.push((*key, snapshot));
                                }
                            }
                        }
                    }
                    // Safety: guard must outlive the iterator.
                    drop(guard);
                }

                let mut processed: Vec<R> = Vec::with_capacity(unprocessed.len() + modified.len());

                // Try to take snapshots from the modified items
                swap_retain(&mut modified, |&mut key| {
                    let inner = self.map.get(&key).unwrap();
                    if !inner.state().snapshot() {
                        let preprocessed = preprocess(key, &inner);
                        drop(inner);
                        processed.push(process(key, preprocessed));
                        false
                    } else {
                        // It was modified in the meantime, so we need to look at the modified map
                        // again
                        true
                    }
                });

                // Serialize the snapshots taken so far
                for (key, snapshot) in unprocessed {
                    processed.push(process_snapshot(key, snapshot));
                }

                // Take snapshots from the modified map
                for key in modified {
                    let maybe_snapshot = {
                        let mut modified_state = self.modified.get_mut(&key).unwrap();
                        let ModifiedState::Snapshot(snapshot) = &mut *modified_state else {
                            unreachable!(
                                "The snapshot bit was set, so it must be in Snapshot state"
                            );
                        };
                        snapshot.take()
                    };
                    if let Some(snapshot) = maybe_snapshot {
                        processed.push(process_snapshot(key, snapshot));
                    }
                }

                processed
            })
            .collect::<Vec<_>>();

        let count = result.iter().map(|v| v.len()).sum::<usize>();
        println!("take_snapshot with {} items", count);

        self.end_snapshot();

        result
    }

    /// Start snapshot mode.
    pub fn start_snapshot(&self) {
        println!("start snapshot");
        self.snapshot_mode
            .store(true, std::sync::atomic::Ordering::Release);
    }

    /// End snapshot mode.
    /// Items that have snapshots will be kepts as modified since they have been accessed during the
    /// snapshot mode. Items that are modified will be removed and considered as unmodified.
    /// When items are accessed in future they will be marked as modified.
    fn end_snapshot(&self) {
        println!("end snapshot");
        // We are still in snapshot mode, so all accessed items would be stored as snapshot.
        // This means we can start by removing all modified items.
        let mut removed_modified = Vec::new();
        self.modified.retain(|key, inner| {
            if matches!(inner, ModifiedState::Modified) {
                removed_modified.push(*key);
                false
            } else {
                true
            }
        });
        println!("removed modified: {:?}", removed_modified.len());

        // We also need to unset all the modified flags.
        for key in removed_modified {
            if let Some(mut inner) = self.map.get_mut(&key) {
                inner.state_mut().set_modified(false);
            }
        }

        // Now modified only contains snapshots.
        // We leave snapshot mode. Any access would be stored as modified and not as snapshot.
        println!("leave snapshot mode");
        self.snapshot_mode
            .store(false, std::sync::atomic::Ordering::Release);

        // We can change all the snapshots to modified now.
        let mut full_snapsnots = 0;
        let mut removed_snapshots = Vec::new();
        for mut item in self.modified.iter_mut() {
            match item.value() {
                ModifiedState::Snapshot(s) => {
                    if s.is_some() {
                        full_snapsnots += 1;
                    }
                    removed_snapshots.push(*item.key());
                    *item.value_mut() = ModifiedState::Modified;
                }
                ModifiedState::Modified => {
                    // This means it was concurrently modified.
                    // It's already in the correct state.
                }
            }
        }
        println!(
            "removed snapshots: {:?} ({} with data)",
            removed_snapshots.len(),
            full_snapsnots
        );

        // And update the flags
        for key in removed_snapshots {
            if let Some(mut inner) = self.map.get_mut(&key) {
                inner.state_mut().set_snapshot(false);
                inner.state_mut().set_modified(true);
            }
        }

        // Remove excessive capacity in modified
        self.modified.shrink_to_fit();
    }

    fn snapshot_mode(&self) -> bool {
        self.snapshot_mode
            .load(std::sync::atomic::Ordering::Acquire)
    }

    pub fn access_mut(&self, key: TaskId) -> StorageWriteGuard<'_> {
        let inner = match self.map.entry(key) {
            dashmap::mapref::entry::Entry::Occupied(e) => e.into_ref(),
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(Box::new(InnerStorage::new())),
        };
        StorageWriteGuard {
            storage: self,
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
            StorageWriteGuard {
                storage: self,
                inner: a,
            },
            StorageWriteGuard {
                storage: self,
                inner: b,
            },
        )
    }
}

pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: RefMut<'a, TaskId, Box<InnerStorage>>,
}

impl StorageWriteGuard<'_> {
    /// Tracks mutation of this task
    pub fn track_modification(&mut self) {
        if !self.inner.state().snapshot() {
            match (self.storage.snapshot_mode(), self.inner.state().modified()) {
                (false, false) => {
                    // Not in snapshot mode and item is unmodified
                    self.storage
                        .modified
                        .insert(*self.inner.key(), ModifiedState::Modified);
                    self.inner.state_mut().set_modified(true);
                }
                (false, true) => {
                    // Not in snapshot mode and item is already modfied
                    // Do nothing
                }
                (true, false) => {
                    // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                    self.storage
                        .modified
                        .insert(*self.inner.key(), ModifiedState::Snapshot(None));
                    self.inner.state_mut().set_snapshot(true);
                }
                (true, true) => {
                    // In snapshot mode and item is modified (so it's part of the snapshot)
                    // We need to store the original version that is part of the snapshot
                    self.storage.modified.insert(
                        *self.inner.key(),
                        ModifiedState::Snapshot(Some(Box::new((&**self.inner).into()))),
                    );
                    self.inner.state_mut().set_snapshot(true);
                }
            }
        }
    }
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
