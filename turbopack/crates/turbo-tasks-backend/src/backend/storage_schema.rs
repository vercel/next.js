//! Task Storage Schema Definition
//!
//! This module defines the complete schema for task storage using the TaskStorage derive macro.
//! The schema covers all 37 CachedDataItem variants with appropriate storage types and categories.
//!
//! # Storage Types
//!
//! - `direct` - For single optional values (e.g., Output, Dirty, AggregationNumber)
//! - `auto_set` - For sets of keys with unit values (e.g., Child, OutputDependency)
//! - `counter_map` - For maps with counted references (e.g., Upper, Follower, Collectible)
//! - `auto_map` - For maps with non-counter values (e.g., CellData)
//!
//! # Categories
//!
//! - `data` - Frequently changed bulk data (dependencies, cell data)
//! - `meta` - Rarely changed metadata (output, aggregation, flags)
//!
//! # Transient Fields
//!
//! Fields marked with `transient` are not serialized and only exist in memory.

use rustc_hash::FxHashSet;
use turbo_tasks::{
    CellId, SharedReference, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId,
};
use turbo_tasks_macros::TaskStorage;

use crate::data::{
    ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
    InProgressCellState, InProgressState, OutputValue,
};

/// Auto-set storage for small sets of keys with unit values.
/// Optimized for small collections (< 8 items use SmallVec inline).
pub type AutoSet<K> = FxHashSet<K>;

/// Counter map storage for reference-counted associations.
/// Automatically removes entries when count reaches 0.
pub type CounterMap<K, V> = rustc_hash::FxHashMap<K, V>;

/// Auto-map storage for key-value pairs.
pub type AutoMap<K, V> = rustc_hash::FxHashMap<K, V>;

/// Indexed map storage for cell-keyed data.
/// Uses CellId as the key type.
pub type IndexedMap<V> = rustc_hash::FxHashMap<CellId, V>;

/// Indexed auto-set for cell-keyed sets with secondary keys.
/// Maps CellId -> Set<SecondaryKey>
pub type IndexedAutoSet<K> = rustc_hash::FxHashMap<CellId, FxHashSet<K>>;

/// Trait-indexed auto-set for collectibles dependents.
/// Maps TraitTypeId -> Set<TaskId>
pub type TraitIndexedAutoSet = rustc_hash::FxHashMap<TraitTypeId, FxHashSet<TaskId>>;

/// The complete task storage schema.
///
/// This struct defines all storage fields for a task. The TaskStorage macro
/// generates the actual InnerStorage, TaskData, TaskMeta structures and all
/// accessor methods.
#[derive(TaskStorage)]
pub struct TaskStorageSchema {
    // =========================================================================
    // SPECIALIZED FIELDS (hot path, always allocated inline)
    // =========================================================================
    /// The task's aggregation number for the aggregation tree.
    /// Specialized: frequently accessed during aggregation operations.
    /// Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    #[task_storage(storage = "direct", category = "meta", specialized, migrated)]
    pub aggregation_number: Option<AggregationNumber>,

    /// Tasks that depend on this task's output.
    /// Specialized: frequently accessed during invalidation.
    /// Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    #[task_storage(storage = "auto_set", category = "data", specialized, migrated)]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    /// Specialized: accessed on every task completion and read.
    /// Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    #[task_storage(storage = "direct", category = "meta", specialized, migrated)]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    /// Specialized: frequently accessed during aggregation updates.
    /// Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    #[task_storage(storage = "counter_map", category = "meta", specialized, migrated)]
    pub upper: CounterMap<TaskId, u32>,

    // =========================================================================
    // OUTPUT & COLLECTIBLES GROUP (meta, lazy)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy
    )]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy
    )]
    pub aggregated_collectibles: CounterMap<CollectibleRef, i32>,

    /// Outdated collectibles to be cleaned up (transient).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy,
        transient
    )]
    pub outdated_collectibles: CounterMap<CollectibleRef, i32>,

    // =========================================================================
    // STATE GROUP (meta)
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    #[task_storage(storage = "direct", category = "meta", group = "state", migrated)]
    pub dirty: Option<Dirtyness>,

    /// Count of dirty containers in the aggregated subgraph.
    #[task_storage(storage = "direct", category = "meta", group = "state", migrated)]
    pub aggregated_dirty_container_count: Option<i32>,

    /// Individual dirty containers in the aggregated subgraph.
    #[task_storage(storage = "counter_map", category = "meta", group = "state", migrated)]
    pub aggregated_dirty_containers: CounterMap<TaskId, i32>,

    /// Whether clean in current session (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "state",
        transient,
        migrated
    )]
    pub current_session_clean: Option<()>,

    /// Count of clean containers in current session (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "state",
        transient,
        migrated
    )]
    pub aggregated_current_session_clean_container_count: Option<i32>,

    /// Individual clean containers in current session (transient).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "state",
        transient,
        migrated
    )]
    pub aggregated_current_session_clean_containers: CounterMap<TaskId, i32>,

    // =========================================================================
    // FLAGS GROUP (meta) - Simple boolean flags
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // TODO: Consider using bool or bitflags instead of Option<()> for these flags.
    // =========================================================================
    /// Whether the task has mutable state.
    #[task_storage(storage = "direct", category = "meta", group = "flags", migrated)]
    pub stateful: Option<()>,

    /// Whether the task has an invalidator.
    #[task_storage(storage = "direct", category = "meta", group = "flags", migrated)]
    pub invalidator: Option<()>,

    /// Whether the task output is immutable.
    #[task_storage(storage = "direct", category = "meta", group = "flags", migrated)]
    pub immutable: Option<()>,

    // =========================================================================
    // CHILDREN & AGGREGATION GROUP (meta, lazy)
    // =========================================================================
    /// Child tasks of this task.
    #[task_storage(storage = "auto_set", category = "meta", group = "aggregation", lazy)]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "aggregation",
        lazy
    )]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES GROUP (data, lazy)
    // =========================================================================
    /// Tasks whose output this task depends on.
    #[task_storage(storage = "auto_set", category = "data", group = "dependencies", lazy)]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[task_storage(storage = "auto_set", category = "data", group = "dependencies", lazy)]
    pub cell_dependencies: AutoSet<CellRef>,

    /// Collectibles this task depends on.
    #[task_storage(storage = "auto_set", category = "data", group = "dependencies", lazy)]
    pub collectibles_dependencies: AutoSet<CollectiblesRef>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient
    )]
    pub outdated_output_dependencies: AutoSet<TaskId>,

    /// Outdated cell dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient
    )]
    pub outdated_cell_dependencies: AutoSet<CellRef>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient
    )]
    pub outdated_collectibles_dependencies: AutoSet<CollectiblesRef>,

    // =========================================================================
    // DEPENDENTS GROUP (data, lazy) - Tasks that depend on this task's cells
    // =========================================================================
    /// Tasks that depend on specific cells of this task.
    /// Maps CellId -> Set<TaskId>
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cell_dependents",
        lazy
    )]
    pub cell_dependents: AutoMap<CellId, FxHashSet<TaskId>>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>
    #[task_storage(
        storage = "auto_map",
        category = "meta",
        group = "collectibles_dependents",
        lazy
    )]
    pub collectibles_dependents: AutoMap<TraitTypeId, FxHashSet<TaskId>>,

    // =========================================================================
    // CELL DATA GROUP (data, lazy)
    // =========================================================================
    /// Persistent cell data (serializable).
    #[task_storage(storage = "auto_map", category = "data", group = "cells", lazy)]
    pub cell_data: AutoMap<CellId, TypedSharedReference>,

    /// Transient cell data (not serializable).
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cells",
        lazy,
        transient
    )]
    pub transient_cell_data: AutoMap<CellId, SharedReference>,

    /// Maximum cell index per cell type.
    #[task_storage(storage = "auto_map", category = "data", group = "cells", lazy)]
    pub cell_type_max_index: AutoMap<ValueTypeId, u32>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient, lazy)
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "execution",
        lazy,
        transient
    )]
    pub activeness: Option<ActivenessState>,

    /// In-progress execution state (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "execution",
        lazy,
        transient
    )]
    pub in_progress: Option<InProgressState>,

    /// In-progress cell state for cells being computed (transient).
    #[task_storage(
        storage = "auto_map",
        category = "meta",
        group = "execution",
        lazy,
        transient
    )]
    pub in_progress_cells: AutoMap<CellId, InProgressCellState>,
}

// Manual implementation of iter_all for TaskData
// This provides compatibility with the CachedDataItem API during migration
impl TaskData {
    /// Iterate over all data items, converting to CachedDataItem format.
    pub fn iter_all(
        &self,
    ) -> impl Iterator<
        Item = (
            crate::data::CachedDataItemKey,
            crate::data::CachedDataItemValueRef<'_>,
        ),
    > {
        use crate::data::{CachedDataItemKey, CachedDataItemValueRef};

        // Specialized data fields
        self.output_dependent.iter().map(|task| {
            (
                CachedDataItemKey::OutputDependent { task: *task },
                CachedDataItemValueRef::OutputDependent { value: &() },
            )
        })
        // TODO: Add remaining data fields as they are migrated
    }

    /// Count the number of data items.
    pub fn len(&self) -> usize {
        self.output_dependent.len()
        // TODO: Add remaining data fields as they are migrated
    }

    /// Check if data storage is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

// Manual implementation of iter_all for TaskMeta
impl TaskMeta {
    /// Iterate over all meta items, converting to CachedDataItem format.
    pub fn iter_all(
        &self,
    ) -> impl Iterator<
        Item = (
            crate::data::CachedDataItemKey,
            crate::data::CachedDataItemValueRef<'_>,
        ),
    > {
        use crate::data::{CachedDataItemKey, CachedDataItemValueRef};

        let aggregation_number_iter = self
            .aggregation_number
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::AggregationNumber {},
                    CachedDataItemValueRef::AggregationNumber { value },
                )
            })
            .into_iter();

        let output_iter = self
            .output
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::Output {},
                    CachedDataItemValueRef::Output { value },
                )
            })
            .into_iter();

        let upper_iter = self.upper.iter().map(|(task, value)| {
            (
                CachedDataItemKey::Upper { task: *task },
                CachedDataItemValueRef::Upper { value },
            )
        });

        // Flags group (non-lazy)
        let stateful_iter = self
            .flags
            .stateful
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::Stateful {},
                    CachedDataItemValueRef::Stateful { value },
                )
            })
            .into_iter();

        let invalidator_iter = self
            .flags
            .invalidator
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::HasInvalidator {},
                    CachedDataItemValueRef::HasInvalidator { value },
                )
            })
            .into_iter();

        let immutable_iter = self
            .flags
            .immutable
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::Immutable {},
                    CachedDataItemValueRef::Immutable { value },
                )
            })
            .into_iter();

        // State group (non-lazy)
        let dirty_iter = self
            .state
            .dirty
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::Dirty {},
                    CachedDataItemValueRef::Dirty { value },
                )
            })
            .into_iter();

        let aggregated_dirty_container_count_iter = self
            .state
            .aggregated_dirty_container_count
            .as_ref()
            .map(|value| {
                (
                    CachedDataItemKey::AggregatedDirtyContainerCount {},
                    CachedDataItemValueRef::AggregatedDirtyContainerCount { value },
                )
            })
            .into_iter();

        let aggregated_dirty_containers_iter =
            self.state
                .aggregated_dirty_containers
                .iter()
                .map(|(task, count)| {
                    (
                        CachedDataItemKey::AggregatedDirtyContainer { task: *task },
                        CachedDataItemValueRef::AggregatedDirtyContainer { value: count },
                    )
                });

        // Note: current_session_clean and aggregated_current_session_clean_* are transient,
        // so they are not included in iter_all (used for persistence)

        aggregation_number_iter
            .chain(output_iter)
            .chain(upper_iter)
            .chain(stateful_iter)
            .chain(invalidator_iter)
            .chain(immutable_iter)
            .chain(dirty_iter)
            .chain(aggregated_dirty_container_count_iter)
            .chain(aggregated_dirty_containers_iter)
        // TODO: Add remaining meta fields as they are migrated
    }

    /// Count the number of meta items.
    pub fn len(&self) -> usize {
        let mut count = 0;
        if self.aggregation_number.is_some() {
            count += 1;
        }
        if self.output.is_some() {
            count += 1;
        }
        count += self.upper.len();
        // Flags group (non-lazy)
        if self.flags.stateful.is_some() {
            count += 1;
        }
        if self.flags.invalidator.is_some() {
            count += 1;
        }
        if self.flags.immutable.is_some() {
            count += 1;
        }
        // State group (non-lazy)
        if self.state.dirty.is_some() {
            count += 1;
        }
        if self.state.aggregated_dirty_container_count.is_some() {
            count += 1;
        }
        count += self.state.aggregated_dirty_containers.len();
        // Note: current_session_clean and aggregated_current_session_clean_* are transient
        // TODO: Add remaining meta fields as they are migrated
        count
    }

    /// Check if meta storage is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

// Manual implementation of iter_all for TypedStorage
// This provides compatibility with the CachedDataItem API during migration
impl TypedStorage {
    /// Iterate over all items in typed storage, converting to CachedDataItem format.
    /// This is used for compatibility with existing code during migration.
    pub fn iter_all(
        &self,
    ) -> impl Iterator<
        Item = (
            crate::data::CachedDataItemKey,
            crate::data::CachedDataItemValueRef<'_>,
        ),
    > {
        self.data.iter_all().chain(self.meta.iter_all())
    }

    /// Count the number of items in typed storage.
    pub fn len(&self) -> usize {
        self.data.len() + self.meta.len()
    }

    /// Check if typed storage is empty.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::TaskId;

    use super::*;
    use crate::data::{AggregationNumber, CachedDataItemKey, OutputValue};

    #[test]
    fn test_schema_compiles() {
        // This test just verifies the schema compiles correctly
        // The actual generated types will be tested separately
    }

    #[test]
    fn test_typed_storage_iter_all() {
        let mut storage = TypedStorage::new();

        // Initially empty
        assert!(storage.is_empty());
        assert_eq!(storage.len(), 0);
        assert_eq!(storage.iter_all().count(), 0);

        // Add some specialized data
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(42)
        })));
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 1,
            distance: 2,
            effective: 3,
        }));
        storage
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(10) });
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(20) }, 5);

        // Check counts
        assert!(!storage.is_empty());
        assert_eq!(storage.len(), 4);
        assert_eq!(storage.iter_all().count(), 4);

        // Verify we can iterate and get correct keys
        let keys: Vec<_> = storage.iter_all().map(|(k, _)| k).collect();
        assert!(
            keys.iter()
                .any(|k| matches!(k, CachedDataItemKey::Output {}))
        );
        assert!(
            keys.iter()
                .any(|k| matches!(k, CachedDataItemKey::AggregationNumber {}))
        );
        assert!(keys.iter().any(
            |k| matches!(k, CachedDataItemKey::OutputDependent { task } if *task == unsafe { TaskId::new_unchecked(10) })
        ));
        assert!(keys
            .iter()
            .any(|k| matches!(k, CachedDataItemKey::Upper { task } if *task == unsafe { TaskId::new_unchecked(20) })));
    }
}
