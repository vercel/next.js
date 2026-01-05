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
    // COLLECTIBLES GROUP (meta, lazy)
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy,
        migrated
    )]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy,
        migrated
    )]
    pub aggregated_collectibles: CounterMap<CollectibleRef, i32>,

    /// Outdated collectibles to be cleaned up (transient).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "collectibles",
        lazy,
        transient,
        migrated
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
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Child tasks of this task.
    #[task_storage(
        storage = "auto_set",
        category = "meta",
        group = "aggregation",
        lazy,
        migrated
    )]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[task_storage(
        storage = "counter_map",
        category = "meta",
        group = "aggregation",
        lazy,
        migrated
    )]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES GROUP (data, lazy)
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Tasks whose output this task depends on.
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        migrated
    )]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        migrated
    )]
    pub cell_dependencies: AutoSet<CellRef>,

    /// Collectibles this task depends on.
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        migrated
    )]
    pub collectibles_dependencies: AutoSet<CollectiblesRef>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient,
        migrated
    )]
    pub outdated_output_dependencies: AutoSet<TaskId>,

    /// Outdated cell dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient,
        migrated
    )]
    pub outdated_cell_dependencies: AutoSet<CellRef>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[task_storage(
        storage = "auto_set",
        category = "data",
        group = "dependencies",
        lazy,
        transient,
        migrated
    )]
    pub outdated_collectibles_dependencies: AutoSet<CollectiblesRef>,

    // =========================================================================
    // DEPENDENTS GROUP (data, lazy) - Tasks that depend on this task's cells
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Tasks that depend on specific cells of this task.
    /// Maps CellId -> Set<TaskId>
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cell_dependents",
        lazy,
        migrated
    )]
    pub cell_dependents: AutoMap<CellId, FxHashSet<TaskId>>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>
    #[task_storage(
        storage = "auto_map",
        category = "meta",
        group = "collectibles_dependents",
        lazy,
        migrated
    )]
    pub collectibles_dependents: AutoMap<TraitTypeId, FxHashSet<TaskId>>,

    // =========================================================================
    // CELL DATA GROUP (data, lazy)
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Persistent cell data (serializable).
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cells",
        lazy,
        migrated
    )]
    pub cell_data: AutoMap<CellId, TypedSharedReference>,

    /// Transient cell data (not serializable).
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cells",
        lazy,
        transient,
        migrated
    )]
    pub transient_cell_data: AutoMap<CellId, SharedReference>,

    /// Maximum cell index per cell type.
    #[task_storage(
        storage = "auto_map",
        category = "data",
        group = "cells",
        lazy,
        migrated
    )]
    pub cell_type_max_index: AutoMap<ValueTypeId, u32>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient, lazy)
    // Migrated: uses TaskStorageAccessors trait for typed access via TaskGuard.
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "execution",
        lazy,
        transient,
        migrated
    )]
    pub activeness: Option<ActivenessState>,

    /// In-progress execution state (transient).
    #[task_storage(
        storage = "direct",
        category = "meta",
        group = "execution",
        lazy,
        transient,
        migrated
    )]
    pub in_progress: Option<InProgressState>,

    /// In-progress cell state for cells being computed (transient).
    #[task_storage(
        storage = "auto_map",
        category = "meta",
        group = "execution",
        lazy,
        transient,
        migrated
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
        let output_dependent_iter = self.output_dependent.iter().map(|task| {
            (
                CachedDataItemKey::OutputDependent { task: *task },
                CachedDataItemValueRef::OutputDependent { value: &() },
            )
        });

        // Cells group (lazy) - check if the Option<Box<_>> is Some before iterating
        let cell_data_iter = self.cells.as_ref().into_iter().flat_map(|group| {
            group.cell_data.iter().map(|(cell, value)| {
                (
                    CachedDataItemKey::CellData { cell: *cell },
                    CachedDataItemValueRef::CellData { value },
                )
            })
        });

        // Note: transient_cell_data is transient, so not included in iter_all (used for
        // persistence)

        let cell_type_max_index_iter = self.cells.as_ref().into_iter().flat_map(|group| {
            group.cell_type_max_index.iter().map(|(cell_type, value)| {
                (
                    CachedDataItemKey::CellTypeMaxIndex {
                        cell_type: *cell_type,
                    },
                    CachedDataItemValueRef::CellTypeMaxIndex { value },
                )
            })
        });

        // Cell dependents group (lazy) - map of CellId -> Set<TaskId>
        // Need to expand this to individual (cell, task) pairs for persistence
        let cell_dependents_iter = self.cell_dependents.as_ref().into_iter().flat_map(|group| {
            group.cell_dependents.iter().flat_map(|(cell, tasks)| {
                tasks.iter().map(move |task| {
                    (
                        CachedDataItemKey::CellDependent {
                            cell: *cell,
                            task: *task,
                        },
                        CachedDataItemValueRef::CellDependent { value: &() },
                    )
                })
            })
        });

        // Dependencies group (lazy) - only non-transient fields for persistence
        // Note: outdated_*_dependencies are transient, so not included
        let output_dependencies_iter = self.dependencies.as_ref().into_iter().flat_map(|group| {
            group.output_dependencies.iter().map(|target| {
                (
                    CachedDataItemKey::OutputDependency { target: *target },
                    CachedDataItemValueRef::OutputDependency { value: &() },
                )
            })
        });

        let cell_dependencies_iter = self.dependencies.as_ref().into_iter().flat_map(|group| {
            group.cell_dependencies.iter().map(|target| {
                (
                    CachedDataItemKey::CellDependency { target: *target },
                    CachedDataItemValueRef::CellDependency { value: &() },
                )
            })
        });

        let collectibles_dependencies_iter =
            self.dependencies.as_ref().into_iter().flat_map(|group| {
                group.collectibles_dependencies.iter().map(|target| {
                    (
                        CachedDataItemKey::CollectiblesDependency { target: *target },
                        CachedDataItemValueRef::CollectiblesDependency { value: &() },
                    )
                })
            });

        output_dependent_iter
            .chain(cell_data_iter)
            .chain(cell_type_max_index_iter)
            .chain(cell_dependents_iter)
            .chain(output_dependencies_iter)
            .chain(cell_dependencies_iter)
            .chain(collectibles_dependencies_iter)
        // TODO: Add remaining data fields as they are migrated
    }

    /// Count the number of data items.
    pub fn len(&self) -> usize {
        let mut count = self.output_dependent.len();
        // Cells group (lazy)
        if let Some(ref group) = self.cells {
            count += group.cell_data.len();
            // Note: transient_cell_data is transient
            count += group.cell_type_max_index.len();
        }
        // Cell dependents group (lazy) - count individual (cell, task) pairs
        if let Some(ref group) = self.cell_dependents {
            count += group
                .cell_dependents
                .values()
                .map(|set| set.len())
                .sum::<usize>();
        }
        // Dependencies group (lazy) - only non-transient fields for persistence
        // Note: outdated_*_dependencies are transient
        if let Some(ref group) = self.dependencies {
            count += group.output_dependencies.len();
            count += group.cell_dependencies.len();
            count += group.collectibles_dependencies.len();
        }
        // TODO: Add remaining data fields as they are migrated
        count
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

        // Collectibles group (lazy) - check if the Option<Box<_>> is Some before iterating
        let collectibles_iter = self.collectibles.as_ref().into_iter().flat_map(|group| {
            group.collectibles.iter().map(|(collectible, value)| {
                (
                    CachedDataItemKey::Collectible {
                        collectible: *collectible,
                    },
                    CachedDataItemValueRef::Collectible { value },
                )
            })
        });

        let aggregated_collectibles_iter =
            self.collectibles.as_ref().into_iter().flat_map(|group| {
                group
                    .aggregated_collectibles
                    .iter()
                    .map(|(collectible, value)| {
                        (
                            CachedDataItemKey::AggregatedCollectible {
                                collectible: *collectible,
                            },
                            CachedDataItemValueRef::AggregatedCollectible { value },
                        )
                    })
            });

        // Note: outdated_collectibles is transient, so not included in iter_all (used for
        // persistence)

        // Aggregation group (lazy)
        let children_iter = self.aggregation.as_ref().into_iter().flat_map(|group| {
            group.children.iter().map(|task| {
                (
                    CachedDataItemKey::Child { task: *task },
                    CachedDataItemValueRef::Child { value: &() },
                )
            })
        });

        let followers_iter = self.aggregation.as_ref().into_iter().flat_map(|group| {
            group.followers.iter().map(|(task, value)| {
                (
                    CachedDataItemKey::Follower { task: *task },
                    CachedDataItemValueRef::Follower { value },
                )
            })
        });

        // Collectibles dependents group (lazy) - map of TraitTypeId -> Set<TaskId>
        // Need to expand this to individual (collectible_type, task) pairs for persistence
        let collectibles_dependents_iter = self
            .collectibles_dependents
            .as_ref()
            .into_iter()
            .flat_map(|group| {
                group
                    .collectibles_dependents
                    .iter()
                    .flat_map(|(collectible_type, tasks)| {
                        tasks.iter().map(move |task| {
                            (
                                CachedDataItemKey::CollectiblesDependent {
                                    collectible_type: *collectible_type,
                                    task: *task,
                                },
                                CachedDataItemValueRef::CollectiblesDependent { value: &() },
                            )
                        })
                    })
            });

        aggregation_number_iter
            .chain(output_iter)
            .chain(upper_iter)
            .chain(stateful_iter)
            .chain(invalidator_iter)
            .chain(immutable_iter)
            .chain(dirty_iter)
            .chain(aggregated_dirty_container_count_iter)
            .chain(aggregated_dirty_containers_iter)
            .chain(collectibles_iter)
            .chain(aggregated_collectibles_iter)
            .chain(children_iter)
            .chain(followers_iter)
            .chain(collectibles_dependents_iter)
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
        // Collectibles group (lazy)
        if let Some(ref group) = self.collectibles {
            count += group.collectibles.len();
            count += group.aggregated_collectibles.len();
            // Note: outdated_collectibles is transient
        }
        // Aggregation group (lazy)
        if let Some(ref group) = self.aggregation {
            count += group.children.len();
            count += group.followers.len();
        }
        // Collectibles dependents group (lazy) - count individual (collectible_type, task) pairs
        if let Some(ref group) = self.collectibles_dependents {
            count += group
                .collectibles_dependents
                .values()
                .map(|set| set.len())
                .sum::<usize>();
        }
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
    use std::mem::size_of;

    use turbo_tasks::TaskId;

    use super::*;
    use crate::data::{AggregationNumber, CachedDataItemKey, OutputValue};

    #[test]
    fn test_schema_size() {
        assert_eq!(256, size_of::<TypedStorage>());
        assert_eq!(200, size_of::<TaskMeta>());
        assert_eq!(56, size_of::<TaskData>());
    }

    #[test]
    fn size_breakdown() {
        println!("\n=== Size Breakdown ===\n");

        // Option<Box<_>> is always 8 bytes
        println!(
            "Option<Box<T>>: {} bytes (pointer)",
            size_of::<Option<Box<u8>>>()
        );

        // Each FxHashMap/FxHashSet is 56 bytes when empty
        println!(
            "FxHashMap<TaskId, u32>: {} bytes",
            size_of::<rustc_hash::FxHashMap<TaskId, u32>>()
        );
        println!(
            "FxHashSet<TaskId>: {} bytes",
            size_of::<rustc_hash::FxHashSet<TaskId>>()
        );

        // Vec is 24 bytes (ptr + len + cap)
        println!("Vec<u8>: {} bytes", size_of::<Vec<u8>>());

        // Option<()> is 1 byte
        println!("Option<()>: {} bytes", size_of::<Option<()>>());

        println!("\n=== Group Sizes (when boxed) ===\n");
        println!("CellsDataGroup: {} bytes", size_of::<CellsDataGroup>());
        println!(
            "DependenciesDataGroup: {} bytes",
            size_of::<DependenciesDataGroup>()
        );
        println!(
            "Cell_dependentsDataGroup: {} bytes",
            size_of::<Cell_dependentsDataGroup>()
        );
        println!(
            "AggregationMetaGroup: {} bytes",
            size_of::<AggregationMetaGroup>()
        );
        println!(
            "CollectiblesMetaGroup: {} bytes",
            size_of::<CollectiblesMetaGroup>()
        );
        println!(
            "Collectibles_dependentsMetaGroup: {} bytes",
            size_of::<Collectibles_dependentsMetaGroup>()
        );
        println!(
            "ExecutionMetaGroup: {} bytes",
            size_of::<ExecutionMetaGroup>()
        );

        println!("\n=== Inline Groups ===\n");
        println!("FlagsMetaGroup: {} bytes", size_of::<FlagsMetaGroup>());
        println!("StateMetaGroup: {} bytes", size_of::<StateMetaGroup>());

        println!("\n=== TaskData Breakdown ===\n");
        println!("TaskData total: {} bytes", size_of::<TaskData>());
        println!(
            "  - output_dependent (FxHashSet<TaskId>): {} bytes",
            size_of::<AutoSet<TaskId>>()
        );
        println!(
            "  - cells (Option<Box<CellsDataGroup>>): {} bytes",
            size_of::<Option<Box<CellsDataGroup>>>()
        );
        println!(
            "  - cell_dependents (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<Cell_dependentsDataGroup>>>()
        );
        println!(
            "  - dependencies (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<DependenciesDataGroup>>>()
        );

        println!("\n=== TaskMeta Breakdown ===\n");
        println!("TaskMeta total: {} bytes", size_of::<TaskMeta>());
        println!(
            "  - aggregation_number: {} bytes",
            size_of::<Option<AggregationNumber>>()
        );
        println!("  - output: {} bytes", size_of::<Option<OutputValue>>());
        println!(
            "  - upper (CounterMap<TaskId, u32>): {} bytes",
            size_of::<CounterMap<TaskId, u32>>()
        );
        println!(
            "  - aggregation (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<AggregationMetaGroup>>>()
        );
        println!(
            "  - execution (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<ExecutionMetaGroup>>>()
        );
        println!("  - flags: {} bytes", size_of::<FlagsMetaGroup>());
        println!(
            "  - collectibles_dependents (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<Collectibles_dependentsMetaGroup>>>()
        );
        println!(
            "  - collectibles (Option<Box<_>>): {} bytes",
            size_of::<Option<Box<CollectiblesMetaGroup>>>()
        );
        println!("  - state: {} bytes", size_of::<StateMetaGroup>());

        println!("\n=== Lazy Field Analysis ===\n");
        let data_lazy = 3; // cells, cell_dependents, dependencies
        let meta_lazy = 4; // aggregation, execution, collectibles_dependents, collectibles
        println!(
            "TaskData has {} Option<Box<_>> = {} bytes overhead",
            data_lazy,
            data_lazy * 8
        );
        println!(
            "TaskMeta has {} Option<Box<_>> = {} bytes overhead",
            meta_lazy,
            meta_lazy * 8
        );
        println!(
            "Total Option<Box<_>> overhead: {} bytes",
            (data_lazy + meta_lazy) * 8
        );

        println!("\n=== Potential Savings ===\n");
        // Vec<LazyField> would be 24 bytes (ptr + len + cap)
        // vs 7 * 8 = 56 bytes for Option<Box<_>> fields
        println!(
            "Current: {} Option<Box<_>> = {} bytes",
            data_lazy + meta_lazy,
            (data_lazy + meta_lazy) * 8
        );
        println!("Vec approach: 1 Vec per category = {} bytes", 2 * 24);
        println!(
            "Potential savings from Vec: {} bytes",
            (data_lazy + meta_lazy) * 8 - 2 * 24
        );

        println!(
            "\nFlags with u8 bitfield: saves {} bytes",
            size_of::<FlagsMetaGroup>() - 1
        );
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
