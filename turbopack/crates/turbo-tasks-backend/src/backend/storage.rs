use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::{Arc, atomic::AtomicBool},
};

use bitfield::bitfield;
use smallvec::SmallVec;
use turbo_tasks::{
    CellId, FxDashMap, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId, parallel,
};

use crate::{
    backend::{
        dynamic_storage::DynamicStorage,
        storage_schema::{TaskData, TaskMeta, TypedStorage},
    },
    data::{
        ActivenessState, AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut, CellRef,
        CollectibleRef, CollectiblesRef, Dirtyness, InProgressCellState, InProgressState,
        OutputValue,
    },
    utils::{
        dash_map_drop_contents::drop_contents,
        dash_map_multi::{RefMut, get_multiple_mut},
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
}

impl TaskDataCategory {
    pub fn into_specific(self) -> SpecificTaskDataCategory {
        match self {
            TaskDataCategory::Meta => SpecificTaskDataCategory::Meta,
            TaskDataCategory::Data => SpecificTaskDataCategory::Data,
            TaskDataCategory::All => unreachable!(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SpecificTaskDataCategory {
    Meta,
    Data,
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
    // Note: Due to alignment in InnerStorage it doesn't matter if this struct is 1 or 4 bytes.
    #[derive(Clone, Default)]
    pub struct InnerStorageState(u32);
    impl Debug;
    pub meta_restored, set_meta_restored: 0;
    pub data_restored, set_data_restored: 1;
    /// Item was modified before snapshot mode was entered.
    pub meta_modified, set_meta_modified: 2;
    pub data_modified, set_data_modified: 3;
    /// Item was modified after snapshot mode was entered. A snapshot was taken.
    pub meta_snapshot, set_meta_snapshot: 4;
    pub data_snapshot, set_data_snapshot: 5;
    /// Prefetched dependencies
    pub prefetched, set_prefetched: 6;
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

    pub fn any_snapshot(&self) -> bool {
        self.meta_snapshot() || self.data_snapshot()
    }

    pub fn any_modified(&self) -> bool {
        self.meta_modified() || self.data_modified()
    }
}

pub struct InnerStorageSnapshot {
    // Typed storage data for persistence
    // Currently migrated: Output, AggregationNumber, Upper (in typed_meta), OutputDependent (in
    // typed_data)
    pub typed_data: TaskData,
    pub typed_meta: TaskMeta,
    dynamic: DynamicStorage,
    pub meta_modified: bool,
    pub data_modified: bool,
}

impl From<&InnerStorage> for InnerStorageSnapshot {
    fn from(inner: &InnerStorage) -> Self {
        Self {
            typed_data: inner.typed.data.clone(),
            typed_meta: inner.typed.meta.clone(),
            dynamic: inner.dynamic.snapshot_for_persisting(),
            meta_modified: inner.state.meta_modified(),
            data_modified: inner.state.data_modified(),
        }
    }
}

impl InnerStorageSnapshot {
    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        // Typed storage items (migrated fields including Output, AggregationNumber, Upper,
        // OutputDependent)
        self.typed_data
            .iter_all()
            .chain(self.typed_meta.iter_all())
            // Dynamic storage (unmigrated CachedDataItem variants)
            .chain(self.dynamic.iter_all())
    }

    pub fn len(&self) -> usize {
        self.typed_data.len() + self.typed_meta.len() + self.dynamic.len()
    }
}

#[derive(Debug, Clone)]
pub struct InnerStorage {
    // Typed storage for incremental migration
    // Fields will be migrated from dynamic -> typed one by one
    // Currently migrated: Output, AggregationNumber, Upper, OutputDependent
    typed: TypedStorage,
    // Dynamic storage for unmigrated CachedDataItem variants
    dynamic: DynamicStorage,
    state: InnerStorageState,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            typed: TypedStorage::new(),
            dynamic: DynamicStorage::new(),
            state: InnerStorageState::default(),
        }
    }

    /// Access the typed storage for direct field access
    #[inline]
    pub fn typed(&self) -> &TypedStorage {
        &self.typed
    }

    /// Access the typed storage mutably for direct field access
    #[inline]
    pub fn typed_mut(&mut self) -> &mut TypedStorage {
        &mut self.typed
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

    // fn extend
    (extend: $self:ident, $ty:ident, $items:ident: $tag:ident $key_field:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            return $self.$field.extend($items.map(|item| {
                let pair = turbo_tasks::KeyValuePair::into_key_and_value(item);
                if let (CachedDataItemKey::$tag { $key_field }, CachedDataItemValue::$tag { value }) = pair {
                    ($key_field, value)
                } else {
                    unreachable!()
                }
            }));
        }
    };
    (extend: $self:ident, $ty:ident, $items:ident: $tag:ident => $field:ident,) => {
        if let CachedDataItemType::$tag = $ty {
            return $self.$field.extend($items.map(|item| {
                let pair = turbo_tasks::KeyValuePair::into_key_and_value(item);
                if let (_, CachedDataItemValue::$tag { value }) = pair {
                    ((), value)
                } else {
                    unreachable!()
                }
            }));
        }
    };
    (extend: $self:ident, $ty:ident, $items:ident: $tag:ident $($key_field:ident)? => $field:ident, $($config:tt)+) => {
        $crate::generate_inner_storage_internal!(extend: $self, $ty, $items: $tag $($key_field)? => $field,);
        $crate::generate_inner_storage_internal!(extend: $self, $ty, $items: $($config)+)
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
    () => {
        impl InnerStorage {
            pub fn add(&mut self, item: CachedDataItem) -> bool {
                // Typed storage variants (migrated) - add is needed for persistence restore
                if let CachedDataItem::Output { value } = item {
                    return self.add_output(value);
                }
                if let CachedDataItem::AggregationNumber { value } = item {
                    return self.add_aggregation_number(value);
                }
                if let CachedDataItem::Upper { task, value } = item {
                    return self.add_upper(task, value);
                }
                if let CachedDataItem::OutputDependent { task, .. } = item {
                    return self.add_output_dependent(task);
                }
                // Flags (migrated)
                if let CachedDataItem::Stateful { .. } = item {
                    return self.add_stateful();
                }
                if let CachedDataItem::HasInvalidator { .. } = item {
                    return self.add_invalidator();
                }
                if let CachedDataItem::Immutable { .. } = item {
                    return self.add_immutable();
                }
                // State group (migrated)
                if let CachedDataItem::Dirty { value } = item {
                    return self.add_dirty(value);
                }
                if let CachedDataItem::AggregatedDirtyContainerCount { value } = item {
                    return self.add_aggregated_dirty_container_count(value);
                }
                if let CachedDataItem::AggregatedDirtyContainer { task, value } = item {
                    return self.add_aggregated_dirty_container(task, value);
                }
                // Collectibles group (migrated)
                if let CachedDataItem::Collectible { collectible, value } = item {
                    return self.add_collectible(collectible, value);
                }
                if let CachedDataItem::AggregatedCollectible { collectible, value } = item {
                    return self.add_aggregated_collectible(collectible, value);
                }
                // Aggregation group (migrated)
                if let CachedDataItem::Child { task, .. } = item {
                    return self.add_child(task);
                }
                if let CachedDataItem::Follower { task, value } = item {
                    return self.add_follower(task, value);
                }
                // Cells group (migrated)
                if let CachedDataItem::CellData { cell, value } = item {
                    return self.add_cell_data(cell, value);
                }
                if let CachedDataItem::CellTypeMaxIndex { cell_type, value } = item {
                    return self.add_cell_type_max_index(cell_type, value);
                }
                // Cell dependents group (migrated)
                if let CachedDataItem::CellDependent { cell, task, .. } = item {
                    return self.add_cell_dependent(cell, task);
                }
                // Collectibles dependents group (migrated)
                if let CachedDataItem::CollectiblesDependent {
                    collectible_type,
                    task,
                    ..
                } = item
                {
                    return self.add_collectibles_dependent(collectible_type, task);
                }
                // Dependencies group (migrated)
                if let CachedDataItem::OutputDependency { target, .. } = item {
                    return self.add_output_dependency(target);
                }
                if let CachedDataItem::CellDependency { target, .. } = item {
                    return self.add_cell_dependency(target);
                }
                if let CachedDataItem::CollectiblesDependency { target, .. } = item {
                    return self.add_collectibles_dependency(target);
                }
                if let CachedDataItem::OutdatedOutputDependency { target, .. } = item {
                    return self.add_outdated_output_dependency(target);
                }
                if let CachedDataItem::OutdatedCellDependency { target, .. } = item {
                    return self.add_outdated_cell_dependency(target);
                }
                if let CachedDataItem::OutdatedCollectiblesDependency { target, .. } = item {
                    return self.add_outdated_collectibles_dependency(target);
                }
                // Execution group (migrated) - transient, not persisted, but needed for runtime
                if let CachedDataItem::Activeness { value } = item {
                    return self.add_activeness(value);
                }
                if let CachedDataItem::InProgress { value } = item {
                    return self.add_in_progress(value);
                }
                if let CachedDataItem::InProgressCell { cell, value } = item {
                    return self.add_in_progress_cell(cell, value);
                }
                self.dynamic.add(item)
            }

            pub fn extend(
                &mut self,
                ty: CachedDataItemType,
                items: impl Iterator<Item = CachedDataItem>,
            ) -> bool {
                // Typed storage variants (migrated) - extend is needed for persistence restore
                // Returns true only if ALL items were new (matches data_storage::Storage semantics)
                if let CachedDataItemType::Output = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Output { value } = item {
                            all_new &= self.add_output(value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::AggregationNumber = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::AggregationNumber { value } = item {
                            all_new &= self.add_aggregation_number(value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::Upper = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Upper { task, value } = item {
                            all_new &= self.add_upper(task, value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::OutputDependent = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::OutputDependent { task, .. } = item {
                            all_new &= self.add_output_dependent(task);
                        }
                    }
                    return all_new;
                }
                // Flags (migrated)
                if let CachedDataItemType::Stateful = ty {
                    let mut all_new = true;
                    for item in items {
                        if matches!(item, CachedDataItem::Stateful { .. }) {
                            all_new &= self.add_stateful();
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::HasInvalidator = ty {
                    let mut all_new = true;
                    for item in items {
                        if matches!(item, CachedDataItem::HasInvalidator { .. }) {
                            all_new &= self.add_invalidator();
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::Immutable = ty {
                    let mut all_new = true;
                    for item in items {
                        if matches!(item, CachedDataItem::Immutable { .. }) {
                            all_new &= self.add_immutable();
                        }
                    }
                    return all_new;
                }
                // State group (migrated)
                if let CachedDataItemType::Dirty = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Dirty { value } = item {
                            all_new &= self.add_dirty(value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::AggregatedDirtyContainerCount = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::AggregatedDirtyContainerCount { value } = item {
                            all_new &= self.add_aggregated_dirty_container_count(value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::AggregatedDirtyContainer = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::AggregatedDirtyContainer { task, value } = item {
                            all_new &= self.add_aggregated_dirty_container(task, value);
                        }
                    }
                    return all_new;
                }
                // Collectibles group (migrated)
                if let CachedDataItemType::Collectible = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Collectible { collectible, value } = item {
                            all_new &= self.add_collectible(collectible, value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::AggregatedCollectible = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::AggregatedCollectible { collectible, value } = item {
                            all_new &= self.add_aggregated_collectible(collectible, value);
                        }
                    }
                    return all_new;
                }
                // Aggregation group (migrated)
                if let CachedDataItemType::Child = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Child { task, .. } = item {
                            all_new &= self.add_child(task);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::Follower = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::Follower { task, value } = item {
                            all_new &= self.add_follower(task, value);
                        }
                    }
                    return all_new;
                }
                // Cells group (migrated)
                if let CachedDataItemType::CellData = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CellData { cell, value } = item {
                            all_new &= self.add_cell_data(cell, value);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::CellTypeMaxIndex = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CellTypeMaxIndex { cell_type, value } = item {
                            all_new &= self.add_cell_type_max_index(cell_type, value);
                        }
                    }
                    return all_new;
                }
                // Cell dependents group (migrated)
                if let CachedDataItemType::CellDependent = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CellDependent { cell, task, .. } = item {
                            all_new &= self.add_cell_dependent(cell, task);
                        }
                    }
                    return all_new;
                }
                // Collectibles dependents group (migrated)
                if let CachedDataItemType::CollectiblesDependent = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CollectiblesDependent {
                            collectible_type,
                            task,
                            ..
                        } = item
                        {
                            all_new &= self.add_collectibles_dependent(collectible_type, task);
                        }
                    }
                    return all_new;
                }
                // Dependencies group (migrated)
                if let CachedDataItemType::OutputDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::OutputDependency { target, .. } = item {
                            all_new &= self.add_output_dependency(target);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::CellDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CellDependency { target, .. } = item {
                            all_new &= self.add_cell_dependency(target);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::CollectiblesDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::CollectiblesDependency { target, .. } = item {
                            all_new &= self.add_collectibles_dependency(target);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::OutdatedOutputDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::OutdatedOutputDependency { target, .. } = item {
                            all_new &= self.add_outdated_output_dependency(target);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::OutdatedCellDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::OutdatedCellDependency { target, .. } = item {
                            all_new &= self.add_outdated_cell_dependency(target);
                        }
                    }
                    return all_new;
                }
                if let CachedDataItemType::OutdatedCollectiblesDependency = ty {
                    let mut all_new = true;
                    for item in items {
                        if let CachedDataItem::OutdatedCollectiblesDependency { target, .. } = item
                        {
                            all_new &= self.add_outdated_collectibles_dependency(target);
                        }
                    }
                    return all_new;
                }
                self.dynamic.extend(ty, items)
            }

            pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
                // Typed storage variants - use typed accessors via TaskGuard instead
                if matches!(item, CachedDataItem::Output { .. }) {
                    panic!("Use TaskGuard::set_output() instead of insert() for Output");
                }
                if matches!(item, CachedDataItem::AggregationNumber { .. }) {
                    panic!(
                        "Use TaskGuard::set_aggregation_number() instead of insert() for \
                         AggregationNumber"
                    );
                }
                if matches!(item, CachedDataItem::Upper { .. }) {
                    panic!("Use TaskGuard::upper_mut() instead of insert() for Upper");
                }
                if matches!(item, CachedDataItem::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of insert() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(item, CachedDataItem::Stateful { .. }) {
                    panic!("Use TaskGuard::set_stateful() instead of insert() for Stateful");
                }
                if matches!(item, CachedDataItem::HasInvalidator { .. }) {
                    panic!(
                        "Use TaskGuard::set_invalidator() instead of insert() for HasInvalidator"
                    );
                }
                if matches!(item, CachedDataItem::Immutable { .. }) {
                    panic!("Use TaskGuard::set_immutable() instead of insert() for Immutable");
                }
                // State group (migrated)
                if matches!(item, CachedDataItem::Dirty { .. }) {
                    panic!("Use TaskGuard::set_dirty() instead of insert() for Dirty");
                }
                if matches!(item, CachedDataItem::AggregatedDirtyContainerCount { .. }) {
                    panic!(
                        "Use TaskGuard::set_aggregated_dirty_container_count() instead of \
                         insert() for AggregatedDirtyContainerCount"
                    );
                }
                if matches!(item, CachedDataItem::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of insert() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(item, CachedDataItem::CurrentSessionClean { .. }) {
                    panic!(
                        "Use TaskGuard::set_current_session_clean() instead of insert() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    item,
                    CachedDataItem::AggregatedCurrentSessionCleanContainerCount { .. }
                ) {
                    panic!(
                        "Use TaskGuard::set_aggregated_current_session_clean_container_count() \
                         instead of insert() for AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    item,
                    CachedDataItem::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of insert() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(item, CachedDataItem::Collectible { .. }) {
                    panic!("Use TaskGuard::collectibles_mut() instead of insert() for Collectible");
                }
                if matches!(item, CachedDataItem::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of insert() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(item, CachedDataItem::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of insert() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(item, CachedDataItem::Child { .. }) {
                    panic!("Use TaskGuard::children_mut() instead of insert() for Child");
                }
                if matches!(item, CachedDataItem::Follower { .. }) {
                    panic!("Use TaskGuard::followers_mut() instead of insert() for Follower");
                }
                // Cells group (migrated)
                if matches!(item, CachedDataItem::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data_mut() instead of insert() for CellData");
                }
                if matches!(item, CachedDataItem::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of insert() for \
                         TransientCellData"
                    );
                }
                if matches!(item, CachedDataItem::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of insert() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(item, CachedDataItem::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of insert() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(item, CachedDataItem::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of insert() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(item, CachedDataItem::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of insert() for \
                         OutputDependency"
                    );
                }
                if matches!(item, CachedDataItem::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of insert() for \
                         CellDependency"
                    );
                }
                if matches!(item, CachedDataItem::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of insert() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(item, CachedDataItem::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of insert() \
                         for OutdatedOutputDependency"
                    );
                }
                if matches!(item, CachedDataItem::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of insert() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(item, CachedDataItem::OutdatedCollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         insert() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(item, CachedDataItem::Activeness { .. }) {
                    panic!(
                        "Use TaskGuard::set_activeness() instead of insert() for Activeness"
                    );
                }
                if matches!(item, CachedDataItem::InProgress { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_mut() instead of insert() for InProgress"
                    );
                }
                if matches!(item, CachedDataItem::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_cells_mut() instead of insert() for \
                         InProgressCell"
                    );
                }
                self.dynamic.insert(item)
            }

            pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
                // Typed storage variants - use typed accessors via TaskGuard instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!("Use typed storage accessors instead of remove() for Output");
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!("Use typed storage accessors instead of remove() for AggregationNumber");
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!("Use TaskGuard::upper_mut() instead of remove() for Upper");
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of remove() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!("Use TaskGuard::take_stateful() instead of remove() for Stateful");
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!(
                        "Use TaskGuard::take_invalidator() instead of remove() for HasInvalidator"
                    );
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!("Use TaskGuard::take_immutable() instead of remove() for Immutable");
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!("Use TaskGuard::take_dirty() instead of remove() for Dirty");
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use TaskGuard::take_aggregated_dirty_container_count() instead of \
                         remove() for AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of remove() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use TaskGuard::take_current_session_clean() instead of remove() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use TaskGuard::take_aggregated_current_session_clean_container_count() \
                         instead of remove() for AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of remove() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!("Use TaskGuard::collectibles_mut() instead of remove() for Collectible");
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of remove() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of remove() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!("Use TaskGuard::children_mut() instead of remove() for Child");
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!("Use TaskGuard::followers_mut() instead of remove() for Follower");
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data_mut() instead of remove() for CellData");
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of remove() for \
                         TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of remove() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of remove() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of remove() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of remove() for \
                         OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of remove() for \
                         CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of remove() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of remove() \
                         for OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of remove() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         remove() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::take_activeness() instead of remove() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::take_in_progress() instead of remove() for InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::remove_in_progress_cell() instead of remove() for \
                         InProgressCell"
                    );
                }
                self.dynamic.remove(key)
            }

            pub fn count(&self, ty: CachedDataItemType) -> usize {
                // Typed storage variants - use typed storage accessors instead
                if matches!(ty, CachedDataItemType::Output) {
                    panic!("Use typed storage accessors instead of count() for Output");
                }
                if matches!(ty, CachedDataItemType::AggregationNumber) {
                    panic!("Use typed storage accessors instead of count() for AggregationNumber");
                }
                if matches!(ty, CachedDataItemType::Upper) {
                    panic!("Use TaskGuard::upper() instead of count() for Upper");
                }
                if matches!(ty, CachedDataItemType::OutputDependent) {
                    panic!(
                        "Use TaskGuard::output_dependent() instead of count() for OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(ty, CachedDataItemType::Stateful) {
                    panic!("Use TaskGuard::has_stateful() instead of count() for Stateful");
                }
                if matches!(ty, CachedDataItemType::HasInvalidator) {
                    panic!(
                        "Use TaskGuard::has_invalidator() instead of count() for HasInvalidator"
                    );
                }
                if matches!(ty, CachedDataItemType::Immutable) {
                    panic!("Use TaskGuard::has_immutable() instead of count() for Immutable");
                }
                // State group (migrated)
                if matches!(ty, CachedDataItemType::Dirty) {
                    panic!("Use TaskGuard::has_dirty() instead of count() for Dirty");
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainerCount) {
                    panic!(
                        "Use TaskGuard::has_aggregated_dirty_container_count() instead of count() \
                         for AggregatedDirtyContainerCount"
                    );
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainer) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers() instead of count() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(ty, CachedDataItemType::CurrentSessionClean) {
                    panic!(
                        "Use TaskGuard::has_current_session_clean() instead of count() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainerCount
                ) {
                    panic!(
                        "Use typed storage accessors instead of count() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainer
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers() instead of \
                         count() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(ty, CachedDataItemType::Collectible) {
                    panic!("Use TaskGuard::collectibles() instead of count() for Collectible");
                }
                if matches!(ty, CachedDataItemType::AggregatedCollectible) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles() instead of count() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectible) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles() instead of count() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(ty, CachedDataItemType::Child) {
                    panic!("Use TaskGuard::children() instead of count() for Child");
                }
                if matches!(ty, CachedDataItemType::Follower) {
                    panic!("Use TaskGuard::followers() instead of count() for Follower");
                }
                // Cells group (migrated)
                if matches!(ty, CachedDataItemType::CellData) {
                    panic!("Use TaskGuard::cell_data() instead of count() for CellData");
                }
                if matches!(ty, CachedDataItemType::TransientCellData) {
                    panic!(
                        "Use TaskGuard::transient_cell_data() instead of count() for \
                         TransientCellData"
                    );
                }
                if matches!(ty, CachedDataItemType::CellTypeMaxIndex) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index() instead of count() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(ty, CachedDataItemType::CellDependent) {
                    panic!("Use TaskGuard::cell_dependents() instead of count() for CellDependent");
                }
                // Collectibles dependents group (migrated)
                if matches!(ty, CachedDataItemType::CollectiblesDependent) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents() instead of count() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(ty, CachedDataItemType::OutputDependency) {
                    panic!(
                        "Use TaskGuard::output_dependencies() instead of count() for \
                         OutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CellDependency) {
                    panic!(
                        "Use TaskGuard::cell_dependencies() instead of count() for CellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies() instead of count() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedOutputDependency) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies() instead of count() for \
                         OutdatedOutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCellDependency) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies() instead of count() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies() instead of count() \
                         for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(ty, CachedDataItemType::Activeness) {
                    panic!(
                        "Use TaskGuard::has_activeness() instead of count() for Activeness"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgress) {
                    panic!(
                        "Use TaskGuard::has_in_progress() instead of count() for InProgress"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgressCell) {
                    panic!(
                        "Use TaskGuard::in_progress_cells() instead of count() for InProgressCell"
                    );
                }
                self.dynamic.count(ty)
            }

            pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
                // Typed storage variants - use typed accessors via TaskGuard instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!("Use TaskGuard::get_output_ref() instead of get() for Output");
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!(
                        "Use TaskGuard::get_aggregation_number_ref() instead of get() for \
                         AggregationNumber"
                    );
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!("Use TaskGuard::upper() instead of get() for Upper");
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent() instead of get() for OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!("Use TaskGuard::get_stateful_ref() instead of get() for Stateful");
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!(
                        "Use TaskGuard::get_invalidator_ref() instead of get() for HasInvalidator"
                    );
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!("Use TaskGuard::get_immutable_ref() instead of get() for Immutable");
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!("Use TaskGuard::get_dirty_ref() instead of get() for Dirty");
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use TaskGuard::get_aggregated_dirty_container_count_ref() instead of \
                         get() for AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers() instead of get() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use TaskGuard::get_current_session_clean_ref() instead of get() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use typed storage accessors instead of get() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers() instead of \
                         get() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!("Use TaskGuard::collectibles() instead of get() for Collectible");
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles() instead of get() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles() instead of get() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!("Use TaskGuard::children() instead of get() for Child");
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!("Use TaskGuard::followers() instead of get() for Follower");
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data() instead of get() for CellData");
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data() instead of get() for \
                         TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index() instead of get() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!("Use TaskGuard::cell_dependents() instead of get() for CellDependent");
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents() instead of get() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies() instead of get() for \
                         OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies() instead of get() for CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies() instead of get() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies() instead of get() for \
                         OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies() instead of get() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies() instead of get() for \
                         OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::get_activeness_ref() instead of get() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::get_in_progress_ref() instead of get() for InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::get_in_progress_cell() instead of get() for InProgressCell"
                    );
                }
                self.dynamic.get(key)
            }

            pub fn contains_key(&self, key: &CachedDataItemKey) -> bool {
                // Typed storage variants - use typed accessors via TaskGuard instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!("Use TaskGuard::has_output() instead of contains_key() for Output");
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!(
                        "Use TaskGuard::has_aggregation_number() instead of contains_key() for \
                         AggregationNumber"
                    );
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!("Use TaskGuard::upper() instead of contains_key() for Upper");
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent() instead of contains_key() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!("Use TaskGuard::has_stateful() instead of contains_key() for Stateful");
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!(
                        "Use TaskGuard::has_invalidator() instead of contains_key() for \
                         HasInvalidator"
                    );
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!(
                        "Use TaskGuard::has_immutable() instead of contains_key() for Immutable"
                    );
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!("Use TaskGuard::has_dirty() instead of contains_key() for Dirty");
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use TaskGuard::has_aggregated_dirty_container_count() instead of \
                         contains_key() for AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers() instead of contains_key() \
                         for AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use TaskGuard::has_current_session_clean() instead of contains_key() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use typed storage accessors instead of contains_key() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers() instead of \
                         contains_key() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles() instead of contains_key() for Collectible"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles() instead of contains_key() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles() instead of contains_key() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!("Use TaskGuard::children() instead of contains_key() for Child");
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!("Use TaskGuard::followers() instead of contains_key() for Follower");
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data() instead of contains_key() for CellData");
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data() instead of contains_key() for \
                         TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index() instead of contains_key() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents() instead of contains_key() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents() instead of contains_key() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies() instead of contains_key() for \
                         OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies() instead of contains_key() for \
                         CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies() instead of contains_key() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies() instead of contains_key() \
                         for OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies() instead of contains_key() \
                         for OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies() instead of \
                         contains_key() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::has_activeness() instead of contains_key() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::has_in_progress() instead of contains_key() for InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_cells().is_some_and(|m| m.contains_key()) \
                         instead of contains_key() for InProgressCell"
                    );
                }
                self.dynamic.contains_key(key)
            }

            pub fn get_mut(
                &mut self,
                key: &CachedDataItemKey,
            ) -> Option<CachedDataItemValueRefMut<'_>> {
                // Typed storage variants - use typed storage accessors instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!("Use typed storage accessors instead of get_mut() for Output");
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut() for AggregationNumber"
                    );
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!("Use TaskGuard::upper_mut() instead of get_mut() for Upper");
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of get_mut() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!("Use typed storage accessors instead of get_mut() for Stateful");
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!("Use typed storage accessors instead of get_mut() for HasInvalidator");
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!("Use typed storage accessors instead of get_mut() for Immutable");
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!("Use typed storage accessors instead of get_mut() for Dirty");
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut() for \
                         AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of get_mut() \
                         for AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut() for CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use typed storage accessors instead of get_mut() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of get_mut() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_mut() instead of get_mut() for Collectible"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of get_mut() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of get_mut() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!("Use TaskGuard::children_mut() instead of get_mut() for Child");
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!("Use TaskGuard::followers_mut() instead of get_mut() for Follower");
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data_mut() instead of get_mut() for CellData");
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of get_mut() for \
                         TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of get_mut() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of get_mut() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of get_mut() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of get_mut() for \
                         OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of get_mut() for \
                         CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of get_mut() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of get_mut() \
                         for OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of get_mut() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         get_mut() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::get_activeness_mut() instead of get_mut() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::get_in_progress_mut() instead of get_mut() for InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_cells_mut() instead of get_mut() for \
                         InProgressCell"
                    );
                }
                self.dynamic.get_mut(key)
            }

            pub fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
                // Typed storage variants don't need shrink_to_fit (fixed size or managed
                // separately)
                if matches!(
                    ty,
                    CachedDataItemType::Output
                        | CachedDataItemType::AggregationNumber
                        | CachedDataItemType::Upper
                        | CachedDataItemType::OutputDependent
                        | CachedDataItemType::Stateful
                        | CachedDataItemType::HasInvalidator
                        | CachedDataItemType::Immutable
                        | CachedDataItemType::Dirty
                        | CachedDataItemType::AggregatedDirtyContainerCount
                        | CachedDataItemType::AggregatedDirtyContainer
                        | CachedDataItemType::CurrentSessionClean
                        | CachedDataItemType::AggregatedCurrentSessionCleanContainerCount
                        | CachedDataItemType::AggregatedCurrentSessionCleanContainer
                        | CachedDataItemType::Collectible
                        | CachedDataItemType::AggregatedCollectible
                        | CachedDataItemType::OutdatedCollectible
                        | CachedDataItemType::Child
                        | CachedDataItemType::Follower
                        | CachedDataItemType::CellData
                        | CachedDataItemType::TransientCellData
                        | CachedDataItemType::CellTypeMaxIndex
                        | CachedDataItemType::CellDependent
                        | CachedDataItemType::CollectiblesDependent
                        | CachedDataItemType::OutputDependency
                        | CachedDataItemType::CellDependency
                        | CachedDataItemType::CollectiblesDependency
                        | CachedDataItemType::OutdatedOutputDependency
                        | CachedDataItemType::OutdatedCellDependency
                        | CachedDataItemType::OutdatedCollectiblesDependency
                        // Execution group (migrated)
                        | CachedDataItemType::Activeness
                        | CachedDataItemType::InProgress
                        | CachedDataItemType::InProgressCell
                ) {
                    return;
                }
                self.dynamic.shrink_to_fit(ty)
            }

            pub fn update(
                &mut self,
                key: CachedDataItemKey,
                update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
            ) {
                // Typed storage variants - use typed storage accessors instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!("Use typed storage accessors instead of update() for Output");
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!("Use typed storage accessors instead of update() for AggregationNumber");
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!("Use TaskGuard::upper_mut() instead of update() for Upper");
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of update() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!("Use typed storage accessors instead of update() for Stateful");
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!("Use typed storage accessors instead of update() for HasInvalidator");
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!("Use typed storage accessors instead of update() for Immutable");
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!("Use typed storage accessors instead of update() for Dirty");
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use typed storage accessors instead of update() for \
                         AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of update() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use typed storage accessors instead of update() for CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use typed storage accessors instead of update() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of update() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!("Use TaskGuard::collectibles_mut() instead of update() for Collectible");
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of update() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of update() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!("Use TaskGuard::children_mut() instead of update() for Child");
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!("Use TaskGuard::followers_mut() instead of update() for Follower");
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!("Use TaskGuard::cell_data_mut() instead of update() for CellData");
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of update() for \
                         TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of update() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of update() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of update() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of update() for \
                         OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of update() for \
                         CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of update() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of update() \
                         for OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of update() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         update() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::get_activeness_mut() instead of update() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::get_in_progress_mut() instead of update() for InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_cells_mut() instead of update() for \
                         InProgressCell"
                    );
                }
                self.dynamic.update(key, update)
            }

            pub fn extract_if<'l, F>(
                &'l mut self,
                ty: CachedDataItemType,
                f: F,
            ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
            where
                F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
            {
                // Typed storage variants - use typed storage accessors instead
                if matches!(ty, CachedDataItemType::Output) {
                    panic!("Use typed storage accessors instead of extract_if() for Output");
                }
                if matches!(ty, CachedDataItemType::AggregationNumber) {
                    panic!(
                        "Use typed storage accessors instead of extract_if() for AggregationNumber"
                    );
                }
                if matches!(ty, CachedDataItemType::Upper) {
                    panic!("Use TaskGuard::upper_mut() instead of extract_if() for Upper");
                }
                if matches!(ty, CachedDataItemType::OutputDependent) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of extract_if() for \
                         OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(ty, CachedDataItemType::Stateful) {
                    panic!("Use typed storage accessors instead of extract_if() for Stateful");
                }
                if matches!(ty, CachedDataItemType::HasInvalidator) {
                    panic!(
                        "Use typed storage accessors instead of extract_if() for HasInvalidator"
                    );
                }
                if matches!(ty, CachedDataItemType::Immutable) {
                    panic!("Use typed storage accessors instead of extract_if() for Immutable");
                }
                // State group (migrated)
                if matches!(ty, CachedDataItemType::Dirty) {
                    panic!("Use typed storage accessors instead of extract_if() for Dirty");
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainerCount) {
                    panic!(
                        "Use typed storage accessors instead of extract_if() for \
                         AggregatedDirtyContainerCount"
                    );
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainer) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of extract_if() \
                         for AggregatedDirtyContainer"
                    );
                }
                if matches!(ty, CachedDataItemType::CurrentSessionClean) {
                    panic!(
                        "Use typed storage accessors instead of extract_if() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainerCount
                ) {
                    panic!(
                        "Use typed storage accessors instead of extract_if() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainer
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of extract_if() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(ty, CachedDataItemType::Collectible) {
                    panic!(
                        "Use TaskGuard::collectibles_mut() instead of extract_if() for Collectible"
                    );
                }
                if matches!(ty, CachedDataItemType::AggregatedCollectible) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of extract_if() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectible) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of extract_if() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(ty, CachedDataItemType::Child) {
                    panic!("Use TaskGuard::children_mut() instead of extract_if() for Child");
                }
                if matches!(ty, CachedDataItemType::Follower) {
                    panic!("Use TaskGuard::followers_mut() instead of extract_if() for Follower");
                }
                // Cells group (migrated)
                if matches!(ty, CachedDataItemType::CellData) {
                    panic!("Use TaskGuard::cell_data_mut() instead of extract_if() for CellData");
                }
                if matches!(ty, CachedDataItemType::TransientCellData) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of extract_if() for \
                         TransientCellData"
                    );
                }
                if matches!(ty, CachedDataItemType::CellTypeMaxIndex) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of extract_if() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(ty, CachedDataItemType::CellDependent) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of extract_if() for \
                         CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(ty, CachedDataItemType::CollectiblesDependent) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of extract_if() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(ty, CachedDataItemType::OutputDependency) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of extract_if() for \
                         OutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CellDependency) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of extract_if() for \
                         CellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of extract_if() \
                         for CollectiblesDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedOutputDependency) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of \
                         extract_if() for OutdatedOutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCellDependency) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of extract_if() \
                         for OutdatedCellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         extract_if() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated) - Activeness and InProgress are direct, no extract_if
                if matches!(ty, CachedDataItemType::Activeness) {
                    panic!(
                        "Use TaskGuard::take_activeness() instead of extract_if() for Activeness"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgress) {
                    panic!(
                        "Use TaskGuard::take_in_progress() instead of extract_if() for InProgress"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgressCell) {
                    panic!(
                        "Use TaskGuard::in_progress_cells_mut() instead of extract_if() for \
                         InProgressCell"
                    );
                }
                self.dynamic.extract_if(ty, f)
            }

            pub fn get_mut_or_insert_with(
                &mut self,
                key: CachedDataItemKey,
                f: impl FnOnce() -> CachedDataItemValue,
            ) -> CachedDataItemValueRefMut<'_> {
                // Typed storage variants - use typed storage accessors instead
                if matches!(key, CachedDataItemKey::Output {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         Output"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregationNumber {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         AggregationNumber"
                    );
                }
                if matches!(key, CachedDataItemKey::Upper { .. }) {
                    panic!(
                        "Use TaskGuard::upper_mut() instead of get_mut_or_insert_with() for Upper"
                    );
                }
                if matches!(key, CachedDataItemKey::OutputDependent { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependent_mut() instead of \
                         get_mut_or_insert_with() for OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(key, CachedDataItemKey::Stateful {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         Stateful"
                    );
                }
                if matches!(key, CachedDataItemKey::HasInvalidator {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         HasInvalidator"
                    );
                }
                if matches!(key, CachedDataItemKey::Immutable {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         Immutable"
                    );
                }
                // State group (migrated)
                if matches!(key, CachedDataItemKey::Dirty {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for Dirty"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainerCount {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         AggregatedDirtyContainerCount"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedDirtyContainer { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers_mut() instead of \
                         get_mut_or_insert_with() for AggregatedDirtyContainer"
                    );
                }
                if matches!(key, CachedDataItemKey::CurrentSessionClean {}) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         CurrentSessionClean"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {}
                ) {
                    panic!(
                        "Use typed storage accessors instead of get_mut_or_insert_with() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::AggregatedCurrentSessionCleanContainer { .. }
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers_mut() instead \
                         of get_mut_or_insert_with() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(key, CachedDataItemKey::Collectible { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_mut() instead of get_mut_or_insert_with() \
                         for Collectible"
                    );
                }
                if matches!(key, CachedDataItemKey::AggregatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles_mut() instead of \
                         get_mut_or_insert_with() for AggregatedCollectible"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCollectible { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_mut() instead of \
                         get_mut_or_insert_with() for OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(key, CachedDataItemKey::Child { .. }) {
                    panic!(
                        "Use TaskGuard::children_mut() instead of get_mut_or_insert_with() for \
                         Child"
                    );
                }
                if matches!(key, CachedDataItemKey::Follower { .. }) {
                    panic!(
                        "Use TaskGuard::followers_mut() instead of get_mut_or_insert_with() for \
                         Follower"
                    );
                }
                // Cells group (migrated)
                if matches!(key, CachedDataItemKey::CellData { .. }) {
                    panic!(
                        "Use TaskGuard::cell_data_mut() instead of get_mut_or_insert_with() for \
                         CellData"
                    );
                }
                if matches!(key, CachedDataItemKey::TransientCellData { .. }) {
                    panic!(
                        "Use TaskGuard::transient_cell_data_mut() instead of \
                         get_mut_or_insert_with() for TransientCellData"
                    );
                }
                if matches!(key, CachedDataItemKey::CellTypeMaxIndex { .. }) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index_mut() instead of \
                         get_mut_or_insert_with() for CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(key, CachedDataItemKey::CellDependent { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependents_mut() instead of get_mut_or_insert_with() \
                         for CellDependent"
                    );
                }
                // Collectibles dependents group (migrated)
                if matches!(key, CachedDataItemKey::CollectiblesDependent { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents_mut() instead of \
                         get_mut_or_insert_with() for CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(key, CachedDataItemKey::OutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::output_dependencies_mut() instead of \
                         get_mut_or_insert_with() for OutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::cell_dependencies_mut() instead of \
                         get_mut_or_insert_with() for CellDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::CollectiblesDependency { .. }) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies_mut() instead of \
                         get_mut_or_insert_with() for CollectiblesDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedOutputDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies_mut() instead of \
                         get_mut_or_insert_with() for OutdatedOutputDependency"
                    );
                }
                if matches!(key, CachedDataItemKey::OutdatedCellDependency { .. }) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies_mut() instead of \
                         get_mut_or_insert_with() for OutdatedCellDependency"
                    );
                }
                if matches!(
                    key,
                    CachedDataItemKey::OutdatedCollectiblesDependency { .. }
                ) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies_mut() instead of \
                         get_mut_or_insert_with() for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(key, CachedDataItemKey::Activeness {}) {
                    panic!(
                        "Use TaskGuard::get_activeness_mut_or_insert_with() instead of \
                         get_mut_or_insert_with() for Activeness"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgress {}) {
                    panic!(
                        "Use TaskGuard::in_progress_mut() instead of get_mut_or_insert_with() for \
                         InProgress"
                    );
                }
                if matches!(key, CachedDataItemKey::InProgressCell { .. }) {
                    panic!(
                        "Use TaskGuard::in_progress_cells_mut() instead of \
                         get_mut_or_insert_with() for InProgressCell"
                    );
                }
                self.dynamic.get_mut_or_insert_with(key, f)
            }

            pub fn iter(
                &self,
                ty: CachedDataItemType,
            ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
                // Typed storage variants - use typed storage accessors instead
                if matches!(ty, CachedDataItemType::Output) {
                    panic!("Use typed storage accessors instead of iter() for Output");
                }
                if matches!(ty, CachedDataItemType::AggregationNumber) {
                    panic!("Use typed storage accessors instead of iter() for AggregationNumber");
                }
                if matches!(ty, CachedDataItemType::Upper) {
                    panic!("Use TaskGuard::upper() instead of iter() for Upper");
                }
                if matches!(ty, CachedDataItemType::OutputDependent) {
                    panic!(
                        "Use TaskGuard::output_dependent() instead of iter() for OutputDependent"
                    );
                }
                // Flags (migrated)
                if matches!(ty, CachedDataItemType::Stateful) {
                    panic!("Use typed storage accessors instead of iter() for Stateful");
                }
                if matches!(ty, CachedDataItemType::HasInvalidator) {
                    panic!("Use typed storage accessors instead of iter() for HasInvalidator");
                }
                if matches!(ty, CachedDataItemType::Immutable) {
                    panic!("Use typed storage accessors instead of iter() for Immutable");
                }
                // State group (migrated)
                if matches!(ty, CachedDataItemType::Dirty) {
                    panic!("Use typed storage accessors instead of iter() for Dirty");
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainerCount) {
                    panic!(
                        "Use typed storage accessors instead of iter() for \
                         AggregatedDirtyContainerCount"
                    );
                }
                if matches!(ty, CachedDataItemType::AggregatedDirtyContainer) {
                    panic!(
                        "Use TaskGuard::aggregated_dirty_containers() instead of iter() for \
                         AggregatedDirtyContainer"
                    );
                }
                if matches!(ty, CachedDataItemType::CurrentSessionClean) {
                    panic!("Use typed storage accessors instead of iter() for CurrentSessionClean");
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainerCount
                ) {
                    panic!(
                        "Use typed storage accessors instead of iter() for \
                         AggregatedCurrentSessionCleanContainerCount"
                    );
                }
                if matches!(
                    ty,
                    CachedDataItemType::AggregatedCurrentSessionCleanContainer
                ) {
                    panic!(
                        "Use TaskGuard::aggregated_current_session_clean_containers() instead of \
                         iter() for AggregatedCurrentSessionCleanContainer"
                    );
                }
                // Collectibles group (migrated)
                if matches!(ty, CachedDataItemType::Collectible) {
                    panic!("Use TaskGuard::collectibles() instead of iter() for Collectible");
                }
                if matches!(ty, CachedDataItemType::AggregatedCollectible) {
                    panic!(
                        "Use TaskGuard::aggregated_collectibles() instead of iter() for \
                         AggregatedCollectible"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectible) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles() instead of iter() for \
                         OutdatedCollectible"
                    );
                }
                // Aggregation group (migrated)
                if matches!(ty, CachedDataItemType::Child) {
                    panic!("Use TaskGuard::children() instead of iter() for Child");
                }
                if matches!(ty, CachedDataItemType::Follower) {
                    panic!("Use TaskGuard::followers() instead of iter() for Follower");
                }
                // Cells group (migrated)
                if matches!(ty, CachedDataItemType::CellData) {
                    panic!("Use TaskGuard::cell_data() instead of iter() for CellData");
                }
                if matches!(ty, CachedDataItemType::TransientCellData) {
                    panic!(
                        "Use TaskGuard::transient_cell_data() instead of iter() for \
                         TransientCellData"
                    );
                }
                if matches!(ty, CachedDataItemType::CellTypeMaxIndex) {
                    panic!(
                        "Use TaskGuard::cell_type_max_index() instead of iter() for \
                         CellTypeMaxIndex"
                    );
                }
                // Cell dependents group (migrated)
                if matches!(ty, CachedDataItemType::CellDependent) {
                    panic!("Use TaskGuard::cell_dependents() instead of iter() for CellDependent");
                }
                // Collectibles dependents group (migrated)
                if matches!(ty, CachedDataItemType::CollectiblesDependent) {
                    panic!(
                        "Use TaskGuard::collectibles_dependents() instead of iter() for \
                         CollectiblesDependent"
                    );
                }
                // Dependencies group (migrated)
                if matches!(ty, CachedDataItemType::OutputDependency) {
                    panic!(
                        "Use TaskGuard::output_dependencies() instead of iter() for \
                         OutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CellDependency) {
                    panic!(
                        "Use TaskGuard::cell_dependencies() instead of iter() for CellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::CollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::collectibles_dependencies() instead of iter() for \
                         CollectiblesDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedOutputDependency) {
                    panic!(
                        "Use TaskGuard::outdated_output_dependencies() instead of iter() for \
                         OutdatedOutputDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCellDependency) {
                    panic!(
                        "Use TaskGuard::outdated_cell_dependencies() instead of iter() for \
                         OutdatedCellDependency"
                    );
                }
                if matches!(ty, CachedDataItemType::OutdatedCollectiblesDependency) {
                    panic!(
                        "Use TaskGuard::outdated_collectibles_dependencies() instead of iter() \
                         for OutdatedCollectiblesDependency"
                    );
                }
                // Execution group (migrated)
                if matches!(ty, CachedDataItemType::Activeness) {
                    panic!(
                        "Use TaskGuard::get_activeness_ref() instead of iter() for Activeness"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgress) {
                    panic!(
                        "Use TaskGuard::get_in_progress_ref() instead of iter() for InProgress"
                    );
                }
                if matches!(ty, CachedDataItemType::InProgressCell) {
                    panic!(
                        "Use TaskGuard::in_progress_cells() instead of iter() for InProgressCell"
                    );
                }
                self.dynamic.iter(ty)
            }
        }
    };
}

// No legacy specialized fields remain - all are migrated to typed storage
generate_inner_storage!();

// Typed storage methods for migrated variants
// These add methods are needed for persistence restore via the `add` method
impl InnerStorage {
    fn add_output(&mut self, value: OutputValue) -> bool {
        if self.typed.meta.output.is_some() {
            false
        } else {
            self.typed.meta.output = Some(value);
            true
        }
    }

    fn add_aggregation_number(&mut self, value: AggregationNumber) -> bool {
        if self.typed.meta.aggregation_number.is_some() {
            false
        } else {
            self.typed.meta.aggregation_number = Some(value);
            true
        }
    }

    fn add_upper(&mut self, task: TaskId, value: u32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let was_new = !self.typed.meta.upper.contains_key(&task);
        self.typed.meta.upper.insert(task, value);
        was_new
    }

    fn add_output_dependent(&mut self, task: TaskId) -> bool {
        self.typed.data.output_dependent.insert(task)
    }

    // Flags (migrated)
    fn add_stateful(&mut self) -> bool {
        if self.typed.meta.flags.stateful.is_some() {
            false
        } else {
            self.typed.meta.flags.stateful = Some(());
            true
        }
    }

    fn add_invalidator(&mut self) -> bool {
        if self.typed.meta.flags.invalidator.is_some() {
            false
        } else {
            self.typed.meta.flags.invalidator = Some(());
            true
        }
    }

    fn add_immutable(&mut self) -> bool {
        if self.typed.meta.flags.immutable.is_some() {
            false
        } else {
            self.typed.meta.flags.immutable = Some(());
            true
        }
    }

    // State group (migrated)
    fn add_dirty(&mut self, value: Dirtyness) -> bool {
        if self.typed.meta.state.dirty.is_some() {
            false
        } else {
            self.typed.meta.state.dirty = Some(value);
            true
        }
    }

    fn add_aggregated_dirty_container_count(&mut self, value: i32) -> bool {
        if self
            .typed
            .meta
            .state
            .aggregated_dirty_container_count
            .is_some()
        {
            false
        } else {
            self.typed.meta.state.aggregated_dirty_container_count = Some(value);
            true
        }
    }

    fn add_aggregated_dirty_container(&mut self, task: TaskId, value: i32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let was_new = !self
            .typed
            .meta
            .state
            .aggregated_dirty_containers
            .contains_key(&task);
        self.typed
            .meta
            .state
            .aggregated_dirty_containers
            .insert(task, value);
        was_new
    }

    // Collectibles group (migrated)
    fn add_collectible(&mut self, collectible: CollectibleRef, value: i32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let group = self
            .typed
            .meta
            .collectibles
            .get_or_insert_with(Default::default);
        let was_new = !group.collectibles.contains_key(&collectible);
        group.collectibles.insert(collectible, value);
        was_new
    }

    fn add_aggregated_collectible(&mut self, collectible: CollectibleRef, value: i32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let group = self
            .typed
            .meta
            .collectibles
            .get_or_insert_with(Default::default);
        let was_new = !group.aggregated_collectibles.contains_key(&collectible);
        group.aggregated_collectibles.insert(collectible, value);
        was_new
    }

    // Aggregation group (migrated)
    fn add_child(&mut self, task: TaskId) -> bool {
        let group = self
            .typed
            .meta
            .aggregation
            .get_or_insert_with(Default::default);
        group.children.insert(task)
    }

    fn add_follower(&mut self, task: TaskId, value: u32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let group = self
            .typed
            .meta
            .aggregation
            .get_or_insert_with(Default::default);
        let was_new = !group.followers.contains_key(&task);
        group.followers.insert(task, value);
        was_new
    }

    // Cells group (migrated)
    fn add_cell_data(&mut self, cell: CellId, value: TypedSharedReference) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let group = self.typed.data.cells.get_or_insert_with(Default::default);
        let was_new = !group.cell_data.contains_key(&cell);
        group.cell_data.insert(cell, value);
        was_new
    }

    fn add_cell_type_max_index(&mut self, cell_type: ValueTypeId, value: u32) -> bool {
        // Matches extend semantics: overwrites existing, returns false if key existed
        let group = self.typed.data.cells.get_or_insert_with(Default::default);
        let was_new = !group.cell_type_max_index.contains_key(&cell_type);
        group.cell_type_max_index.insert(cell_type, value);
        was_new
    }

    // Cell dependents group (migrated)
    fn add_cell_dependent(&mut self, cell: CellId, task: TaskId) -> bool {
        // cell_dependents is AutoMap<CellId, FxHashSet<TaskId>>
        // We need to get or create the set for this cell, then insert the task
        let group = self
            .typed
            .data
            .cell_dependents
            .get_or_insert_with(Default::default);
        group.cell_dependents.entry(cell).or_default().insert(task)
    }

    // Collectibles dependents group (migrated)
    fn add_collectibles_dependent(&mut self, collectible_type: TraitTypeId, task: TaskId) -> bool {
        // collectibles_dependents is AutoMap<TraitTypeId, FxHashSet<TaskId>>
        // We need to get or create the set for this collectible_type, then insert the task
        let group = self
            .typed
            .meta
            .collectibles_dependents
            .get_or_insert_with(Default::default);
        group
            .collectibles_dependents
            .entry(collectible_type)
            .or_default()
            .insert(task)
    }

    // Dependencies group (migrated)
    fn add_output_dependency(&mut self, target: TaskId) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.output_dependencies.insert(target)
    }

    fn add_cell_dependency(&mut self, target: CellRef) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.cell_dependencies.insert(target)
    }

    fn add_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.collectibles_dependencies.insert(target)
    }

    fn add_outdated_output_dependency(&mut self, target: TaskId) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.outdated_output_dependencies.insert(target)
    }

    fn add_outdated_cell_dependency(&mut self, target: CellRef) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.outdated_cell_dependencies.insert(target)
    }

    fn add_outdated_collectibles_dependency(&mut self, target: CollectiblesRef) -> bool {
        let group = self
            .typed
            .data
            .dependencies
            .get_or_insert_with(Default::default);
        group.outdated_collectibles_dependencies.insert(target)
    }

    // Execution group (migrated) - transient, not persisted, but needed for runtime
    fn add_activeness(&mut self, value: ActivenessState) -> bool {
        let group = self
            .typed
            .meta
            .execution
            .get_or_insert_with(Default::default);
        if group.activeness.is_some() {
            false
        } else {
            group.activeness = Some(value);
            true
        }
    }

    fn add_in_progress(&mut self, value: InProgressState) -> bool {
        let group = self
            .typed
            .meta
            .execution
            .get_or_insert_with(Default::default);
        if group.in_progress.is_some() {
            false
        } else {
            group.in_progress = Some(value);
            true
        }
    }

    fn add_in_progress_cell(&mut self, cell: CellId, value: InProgressCellState) -> bool {
        let group = self
            .typed
            .meta
            .execution
            .get_or_insert_with(Default::default);
        // Matches extend semantics: overwrites existing, returns false if key existed
        let was_new = !group.in_progress_cells.contains_key(&cell);
        group.in_progress_cells.insert(cell, value);
        was_new
    }
}

impl InnerStorage {
    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        // Typed storage items (all specialized fields are now migrated)
        self.typed
            .iter_all()
            // Dynamic storage (unmigrated CachedDataItem variants)
            .chain(self.dynamic.iter_all())
    }

    pub fn len(&self) -> usize {
        self.typed.len() + self.dynamic.len()
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
    pub fn new(shard_amount: usize, small_preallocation: bool) -> Self {
        let map_capacity: usize = if small_preallocation {
            1024
        } else {
            1024 * 1024
        };
        let modified_capacity: usize = if small_preallocation { 0 } else { 1024 };

        Self {
            snapshot_mode: AtomicBool::new(false),
            modified: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                modified_capacity,
                Default::default(),
                shard_amount,
            ),
            map: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                map_capacity,
                Default::default(),
                shard_amount,
            ),
        }
    }

    /// Processes every modified item (resp. a snapshot of it) with the given functions and returns
    /// the results. Ends snapshot mode afterwards.
    /// preprocess is potentially called within a lock, so it should be fast.
    /// process is called outside of locks, so it could do more expensive operations.
    pub fn take_snapshot<
        'l,
        T,
        R,
        PP: for<'a> Fn(TaskId, &'a InnerStorage) -> T + Sync,
        P: Fn(TaskId, T) -> R + Sync,
        PS: Fn(TaskId, Box<InnerStorageSnapshot>) -> R + Sync,
    >(
        &'l self,
        preprocess: &'l PP,
        process: &'l P,
        process_snapshot: &'l PS,
    ) -> Vec<SnapshotShard<'l, PP, P, PS>> {
        if !self.snapshot_mode() {
            self.start_snapshot();
        }

        let guard = Arc::new(SnapshotGuard { storage: self });

        // The number of shards is much larger than the number of threads, so the effect of the
        // locks held is negligible.
        parallel::map_collect::<_, _, Vec<_>>(self.modified.shards(), |shard| {
            let mut direct_snapshots: Vec<(TaskId, Box<InnerStorageSnapshot>)> = Vec::new();
            let mut modified: SmallVec<[TaskId; 4]> = SmallVec::new();
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
                                direct_snapshots.push((*key, snapshot));
                            }
                        }
                    }
                }
                // Safety: guard must outlive the iterator.
                drop(guard);
            }

            SnapshotShard {
                direct_snapshots,
                modified,
                storage: self,
                guard: Some(guard.clone()),
                process,
                preprocess,
                process_snapshot,
            }
        })
    }

    /// Start snapshot mode.
    pub fn start_snapshot(&self) {
        self.snapshot_mode
            .store(true, std::sync::atomic::Ordering::Release);
    }

    /// End snapshot mode.
    /// Items that have snapshots will be kept as modified since they have been accessed during the
    /// snapshot mode. Items that are modified will be removed and considered as unmodified.
    /// When items are accessed in future they will be marked as modified.
    fn end_snapshot(&self) {
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

        // We also need to unset all the modified flags.
        for key in removed_modified {
            if let Some(mut inner) = self.map.get_mut(&key) {
                let state = inner.state_mut();
                state.set_data_modified(false);
                state.set_meta_modified(false);
            }
        }

        // Now modified only contains snapshots.
        // We leave snapshot mode. Any access would be stored as modified and not as snapshot.
        self.snapshot_mode
            .store(false, std::sync::atomic::Ordering::Release);

        // We can change all the snapshots to modified now.
        let mut removed_snapshots = Vec::new();
        for mut item in self.modified.iter_mut() {
            match item.value() {
                ModifiedState::Snapshot(_) => {
                    removed_snapshots.push(*item.key());
                    *item.value_mut() = ModifiedState::Modified;
                }
                ModifiedState::Modified => {
                    // This means it was concurrently modified.
                    // It's already in the correct state.
                }
            }
        }

        // And update the flags
        for key in removed_snapshots {
            if let Some(mut inner) = self.map.get_mut(&key) {
                let state = inner.state_mut();
                if state.meta_snapshot() {
                    state.set_meta_snapshot(false);
                    state.set_meta_modified(true);
                }
                if state.data_snapshot() {
                    state.set_data_snapshot(false);
                    state.set_data_modified(true);
                }
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

    pub fn drop_contents(&self) {
        drop_contents(&self.map);
        drop_contents(&self.modified);
    }
}

pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: RefMut<'a, TaskId, Box<InnerStorage>>,
}

impl StorageWriteGuard<'_> {
    /// Tracks mutation of this task
    pub fn track_modification(&mut self, category: SpecificTaskDataCategory) {
        let state = self.inner.state();
        let snapshot = match category {
            SpecificTaskDataCategory::Meta => state.meta_snapshot(),
            SpecificTaskDataCategory::Data => state.data_snapshot(),
        };
        if !snapshot {
            let modified = match category {
                SpecificTaskDataCategory::Meta => state.meta_modified(),
                SpecificTaskDataCategory::Data => state.data_modified(),
            };
            match (self.storage.snapshot_mode(), modified) {
                (false, false) => {
                    // Not in snapshot mode and item is unmodified
                    if !state.any_snapshot() && !state.any_modified() {
                        self.storage
                            .modified
                            .insert(*self.inner.key(), ModifiedState::Modified);
                    }
                    let state = self.inner.state_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_modified(true),
                        SpecificTaskDataCategory::Data => state.set_data_modified(true),
                    }
                }
                (false, true) => {
                    // Not in snapshot mode and item is already modified
                    // Do nothing
                }
                (true, false) => {
                    // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                    if !state.any_snapshot() {
                        self.storage
                            .modified
                            .insert(*self.inner.key(), ModifiedState::Snapshot(None));
                    }
                    let state = self.inner.state_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_snapshot(true),
                        SpecificTaskDataCategory::Data => state.set_data_snapshot(true),
                    }
                }
                (true, true) => {
                    // In snapshot mode and item is modified (so it's part of the snapshot)
                    // We need to store the original version that is part of the snapshot
                    if !state.any_snapshot() {
                        self.storage.modified.insert(
                            *self.inner.key(),
                            ModifiedState::Snapshot(Some(Box::new((&**self.inner).into()))),
                        );
                    }
                    let state = self.inner.state_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_snapshot(true),
                        SpecificTaskDataCategory::Data => state.set_data_snapshot(true),
                    }
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

macro_rules! get {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValueRef::$key {
            value,
        }) = $task.get_internal(&$crate::data::CachedDataItemKey::$key $input) {
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
        }) = $task.get_mut_internal(&$crate::data::CachedDataItemKey::$key $input) {
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
        } = $task.get_mut_or_insert_with_internal($crate::data::CachedDataItemKey::$key $input, move || $crate::data::CachedDataItemValue::$key { value: functor() }) else {
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
            .iter_internal($crate::data::CachedDataItemType::$key)
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
            .iter_internal($crate::data::CachedDataItemType::$key)
            .filter_map(|(key, value)| match (key, value) {
                (
                    $crate::data::CachedDataItemKey::$key $input,
                    $crate::data::CachedDataItemValueRef::$key { value: $value_pattern }
                ) $(if $cond)? => Some($iter_item),
                _ => None,
            })
    }};
}

macro_rules! update {
    ($task:ident, $key:ident $input:tt, $update:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        #[allow(unused_mut)]
        let mut update = $update;
        $task.update_internal($crate::data::CachedDataItemKey::$key $input, |old| {
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
    ($task:ident, $key:ident $input:tt, -$update:expr) => {
        match $update {
            update => {
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
            }
        }
    };
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
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_count!($task, $key {}, $update)
    };
}

macro_rules! update_count_and_get {
    ($task:ident, $key:ident $input:tt, -$update:expr) => {
        match $update {
            update => {
                let mut new = 0;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    let old = old.unwrap_or(0);
                    new = old - update;
                    (new != 0).then_some(new)
                });
                new
            }
        }
    };
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        match $update {
            update => {
                let mut new = 0;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    let old = old.unwrap_or(0);
                    new = old + update;
                    (new != 0).then_some(new)
                });
                new
            }
        }
    };
    ($task:ident, $key:ident, -$update:expr) => {
        $crate::backend::storage::update_count_and_get!($task, $key {}, -$update)
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_count_and_get!($task, $key {}, $update)
    };
}

macro_rules! remove {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.remove_internal(
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
pub(crate) use get_mut;
pub(crate) use get_mut_or_insert_with;
pub(crate) use iter_many;
pub(crate) use remove;
pub(crate) use update;
pub(crate) use update_count;
pub(crate) use update_count_and_get;

pub struct SnapshotGuard<'l> {
    storage: &'l Storage,
}

impl Drop for SnapshotGuard<'_> {
    fn drop(&mut self) {
        self.storage.end_snapshot();
    }
}

pub struct SnapshotShard<'l, PP, P, PS> {
    direct_snapshots: Vec<(TaskId, Box<InnerStorageSnapshot>)>,
    modified: SmallVec<[TaskId; 4]>,
    storage: &'l Storage,
    guard: Option<Arc<SnapshotGuard<'l>>>,
    process: &'l P,
    preprocess: &'l PP,
    process_snapshot: &'l PS,
}

impl<'l, T, R, PP, P, PS> Iterator for SnapshotShard<'l, PP, P, PS>
where
    PP: for<'a> Fn(TaskId, &'a InnerStorage) -> T + Sync,
    P: Fn(TaskId, T) -> R + Sync,
    PS: Fn(TaskId, Box<InnerStorageSnapshot>) -> R + Sync,
{
    type Item = R;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some((task_id, snapshot)) = self.direct_snapshots.pop() {
            return Some((self.process_snapshot)(task_id, snapshot));
        }
        while let Some(task_id) = self.modified.pop() {
            let inner = self.storage.map.get(&task_id).unwrap();
            let state = inner.state();
            if !state.any_snapshot() {
                let preprocessed = (self.preprocess)(task_id, &inner);
                drop(inner);
                return Some((self.process)(task_id, preprocessed));
            } else {
                drop(inner);
                let maybe_snapshot = {
                    let mut modified_state = self.storage.modified.get_mut(&task_id).unwrap();
                    let ModifiedState::Snapshot(snapshot) = &mut *modified_state else {
                        unreachable!("The snapshot bit was set, so it must be in Snapshot state");
                    };
                    snapshot.take()
                };
                if let Some(snapshot) = maybe_snapshot {
                    return Some((self.process_snapshot)(task_id, snapshot));
                }
            }
        }
        self.guard = None;
        None
    }
}
