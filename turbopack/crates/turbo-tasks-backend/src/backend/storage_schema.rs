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
/// generates the TypedStorage struct, LazyField enum, and all accessor methods.
///
/// Fields without `lazy` are stored inline on TypedStorage.
/// Fields with `lazy` are stored in a Vec<LazyField> for memory efficiency.
#[derive(TaskStorage)]
pub struct TaskStorageSchema {
    // =========================================================================
    // INLINE FIELDS (hot path, always allocated inline)
    // =========================================================================
    /// The task's aggregation number for the aggregation tree.
    #[task_storage(storage = "direct", category = "meta")]
    pub aggregation_number: Option<AggregationNumber>,

    /// Tasks that depend on this task's output.
    #[task_storage(storage = "auto_set", category = "data")]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    #[task_storage(storage = "direct", category = "meta")]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta")]
    pub upper: CounterMap<TaskId, u32>,

    // =========================================================================
    // COLLECTIBLES (meta, lazy)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", lazy)]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[task_storage(storage = "counter_map", category = "meta", lazy)]
    pub aggregated_collectibles: CounterMap<CollectibleRef, i32>,

    /// Outdated collectibles to be cleaned up (transient).
    #[task_storage(storage = "counter_map", category = "meta", lazy, transient)]
    pub outdated_collectibles: CounterMap<CollectibleRef, i32>,

    // =========================================================================
    // STATE FIELDS (meta) - stored inline
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    #[task_storage(storage = "direct", category = "meta")]
    pub dirty: Option<Dirtyness>,

    /// Count of dirty containers in the aggregated subgraph.
    #[task_storage(storage = "direct", category = "meta")]
    pub aggregated_dirty_container_count: Option<i32>,

    /// Individual dirty containers in the aggregated subgraph.
    #[task_storage(storage = "counter_map", category = "meta")]
    pub aggregated_dirty_containers: CounterMap<TaskId, i32>,

    /// Whether clean in current session (transient flag).
    #[task_storage(flag, transient)]
    pub current_session_clean: bool,

    /// Count of clean containers in current session (transient).
    #[task_storage(storage = "direct", category = "meta", transient)]
    pub aggregated_current_session_clean_container_count: Option<i32>,

    /// Individual clean containers in current session (transient).
    #[task_storage(storage = "counter_map", category = "meta", transient)]
    pub aggregated_current_session_clean_containers: CounterMap<TaskId, i32>,

    // =========================================================================
    // FLAGS (meta) - Boolean flags stored in TaskFlags bitfield
    // Persisted flags come first, then transient flags.
    // =========================================================================
    /// Whether the task has mutable state (persisted).
    #[task_storage(flag)]
    pub stateful: bool,

    /// Whether the task has an invalidator (persisted).
    #[task_storage(flag)]
    pub invalidator: bool,

    /// Whether the task output is immutable (persisted).
    #[task_storage(flag)]
    pub immutable: bool,

    // =========================================================================
    // CHILDREN & AGGREGATION (meta, lazy)
    // =========================================================================
    /// Child tasks of this task.
    #[task_storage(storage = "auto_set", category = "meta", lazy)]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", lazy)]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES (data, lazy)
    // =========================================================================
    /// Tasks whose output this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy)]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy)]
    pub cell_dependencies: AutoSet<CellRef>,

    /// Collectibles this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy)]
    pub collectibles_dependencies: AutoSet<CollectiblesRef>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", lazy, transient)]
    pub outdated_output_dependencies: AutoSet<TaskId>,

    /// Outdated cell dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", lazy, transient)]
    pub outdated_cell_dependencies: AutoSet<CellRef>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", lazy, transient)]
    pub outdated_collectibles_dependencies: AutoSet<CollectiblesRef>,

    // =========================================================================
    // DEPENDENTS (lazy) - Tasks that depend on this task's cells
    // =========================================================================
    /// Tasks that depend on specific cells of this task.
    /// Maps CellId -> Set<TaskId>
    #[task_storage(storage = "auto_map", category = "data", lazy)]
    pub cell_dependents: AutoMap<CellId, FxHashSet<TaskId>>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>
    #[task_storage(storage = "auto_map", category = "meta", lazy)]
    pub collectibles_dependents: AutoMap<TraitTypeId, FxHashSet<TaskId>>,

    // =========================================================================
    // CELL DATA (data, lazy)
    // =========================================================================
    /// Persistent cell data (serializable).
    #[task_storage(storage = "auto_map", category = "data", lazy)]
    pub cell_data: AutoMap<CellId, TypedSharedReference>,

    /// Transient cell data (not serializable).
    #[task_storage(storage = "auto_map", category = "data", lazy, transient)]
    pub transient_cell_data: AutoMap<CellId, SharedReference>,

    /// Maximum cell index per cell type.
    #[task_storage(storage = "auto_map", category = "data", lazy)]
    pub cell_type_max_index: AutoMap<ValueTypeId, u32>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient, lazy)
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    #[task_storage(storage = "direct", category = "meta", lazy, transient)]
    pub activeness: Option<ActivenessState>,

    /// In-progress execution state (transient).
    #[task_storage(storage = "direct", category = "meta", lazy, transient)]
    pub in_progress: Option<InProgressState>,

    /// In-progress cell state for cells being computed (transient).
    #[task_storage(storage = "auto_map", category = "meta", lazy, transient)]
    pub in_progress_cells: AutoMap<CellId, InProgressCellState>,
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
        use crate::data::{CachedDataItemKey, CachedDataItemValueRef};

        // Specialized data fields
        let output_dependent_iter = self.output_dependent.iter().map(|task| {
            (
                CachedDataItemKey::OutputDependent { task: *task },
                CachedDataItemValueRef::OutputDependent { value: &() },
            )
        });

        // Specialized meta fields
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

        // Flags (stored in TaskFlags bitfield)
        let stateful_iter = if self.flags.stateful() {
            Some((
                CachedDataItemKey::Stateful {},
                CachedDataItemValueRef::Stateful { value: &() },
            ))
        } else {
            None
        }
        .into_iter();

        let invalidator_iter = if self.flags.invalidator() {
            Some((
                CachedDataItemKey::HasInvalidator {},
                CachedDataItemValueRef::HasInvalidator { value: &() },
            ))
        } else {
            None
        }
        .into_iter();

        let immutable_iter = if self.flags.immutable() {
            Some((
                CachedDataItemKey::Immutable {},
                CachedDataItemValueRef::Immutable { value: &() },
            ))
        } else {
            None
        }
        .into_iter();

        // State fields (direct, non-lazy)
        let dirty_iter = self
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
            self.aggregated_dirty_containers
                .iter()
                .map(|(task, count)| {
                    (
                        CachedDataItemKey::AggregatedDirtyContainer { task: *task },
                        CachedDataItemValueRef::AggregatedDirtyContainer { value: count },
                    )
                });

        // Note: current_session_clean and aggregated_current_session_clean_* are transient,
        // so they are not included in iter_all (used for persistence)

        // Cell data (lazy) - check if present in lazy Vec
        let cell_data_iter = self.cell_data().into_iter().flat_map(|map| {
            map.iter().map(|(cell, value)| {
                (
                    CachedDataItemKey::CellData { cell: *cell },
                    CachedDataItemValueRef::CellData { value },
                )
            })
        });

        // Note: transient_cell_data is transient, so not included in iter_all (used for
        // persistence)

        let cell_type_max_index_iter = self.cell_type_max_index().into_iter().flat_map(|map| {
            map.iter().map(|(cell_type, value)| {
                (
                    CachedDataItemKey::CellTypeMaxIndex {
                        cell_type: *cell_type,
                    },
                    CachedDataItemValueRef::CellTypeMaxIndex { value },
                )
            })
        });

        // Cell dependents (lazy) - map of CellId -> Set<TaskId>
        // Need to expand this to individual (cell, task) pairs for persistence
        let cell_dependents_iter = self.cell_dependents().into_iter().flat_map(|map| {
            map.iter().flat_map(|(cell, tasks)| {
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

        // Dependencies (lazy) - only non-transient fields for persistence
        // Note: outdated_*_dependencies are transient, so not included
        let output_dependencies_iter = self.output_dependencies().into_iter().flat_map(|set| {
            set.iter().map(|target| {
                (
                    CachedDataItemKey::OutputDependency { target: *target },
                    CachedDataItemValueRef::OutputDependency { value: &() },
                )
            })
        });

        let cell_dependencies_iter = self.cell_dependencies().into_iter().flat_map(|set| {
            set.iter().map(|target| {
                (
                    CachedDataItemKey::CellDependency { target: *target },
                    CachedDataItemValueRef::CellDependency { value: &() },
                )
            })
        });

        let collectibles_dependencies_iter =
            self.collectibles_dependencies()
                .into_iter()
                .flat_map(|set| {
                    set.iter().map(|target| {
                        (
                            CachedDataItemKey::CollectiblesDependency { target: *target },
                            CachedDataItemValueRef::CollectiblesDependency { value: &() },
                        )
                    })
                });

        // Collectibles (lazy)
        let collectibles_iter = self.collectibles().into_iter().flat_map(|map| {
            map.iter().map(|(collectible, value)| {
                (
                    CachedDataItemKey::Collectible {
                        collectible: *collectible,
                    },
                    CachedDataItemValueRef::Collectible { value },
                )
            })
        });

        let aggregated_collectibles_iter =
            self.aggregated_collectibles().into_iter().flat_map(|map| {
                map.iter().map(|(collectible, value)| {
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

        // Children and followers (lazy)
        let children_iter = self.children().into_iter().flat_map(|set| {
            set.iter().map(|task| {
                (
                    CachedDataItemKey::Child { task: *task },
                    CachedDataItemValueRef::Child { value: &() },
                )
            })
        });

        let followers_iter = self.followers().into_iter().flat_map(|map| {
            map.iter().map(|(task, value)| {
                (
                    CachedDataItemKey::Follower { task: *task },
                    CachedDataItemValueRef::Follower { value },
                )
            })
        });

        // Collectibles dependents (lazy) - map of TraitTypeId -> Set<TaskId>
        // Need to expand this to individual (collectible_type, task) pairs for persistence
        let collectibles_dependents_iter =
            self.collectibles_dependents().into_iter().flat_map(|map| {
                map.iter().flat_map(|(collectible_type, tasks)| {
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

        output_dependent_iter
            .chain(aggregation_number_iter)
            .chain(output_iter)
            .chain(upper_iter)
            .chain(stateful_iter)
            .chain(invalidator_iter)
            .chain(immutable_iter)
            .chain(dirty_iter)
            .chain(aggregated_dirty_container_count_iter)
            .chain(aggregated_dirty_containers_iter)
            .chain(cell_data_iter)
            .chain(cell_type_max_index_iter)
            .chain(cell_dependents_iter)
            .chain(output_dependencies_iter)
            .chain(cell_dependencies_iter)
            .chain(collectibles_dependencies_iter)
            .chain(collectibles_iter)
            .chain(aggregated_collectibles_iter)
            .chain(children_iter)
            .chain(followers_iter)
            .chain(collectibles_dependents_iter)
        // TODO: Add remaining fields as they are migrated
    }

    /// Count the number of items in typed storage.
    pub fn len(&self) -> usize {
        let mut count = self.output_dependent.len();
        // Specialized meta fields
        if self.aggregation_number.is_some() {
            count += 1;
        }
        if self.output.is_some() {
            count += 1;
        }
        count += self.upper.len();
        // Flags (stored in TaskFlags bitfield)
        if self.flags.stateful() {
            count += 1;
        }
        if self.flags.invalidator() {
            count += 1;
        }
        if self.flags.immutable() {
            count += 1;
        }
        // State fields (direct, non-lazy)
        if self.dirty.is_some() {
            count += 1;
        }
        if self.aggregated_dirty_container_count.is_some() {
            count += 1;
        }
        count += self.aggregated_dirty_containers.len();
        // Note: current_session_clean and aggregated_current_session_clean_* are transient
        // Cell data (lazy)
        if let Some(map) = self.cell_data() {
            count += map.len();
        }
        // Note: transient_cell_data is transient
        if let Some(map) = self.cell_type_max_index() {
            count += map.len();
        }
        // Cell dependents (lazy) - count individual (cell, task) pairs
        if let Some(map) = self.cell_dependents() {
            count += map.values().map(|set| set.len()).sum::<usize>();
        }
        // Dependencies (lazy) - only non-transient fields for persistence
        // Note: outdated_*_dependencies are transient
        if let Some(set) = self.output_dependencies() {
            count += set.len();
        }
        if let Some(set) = self.cell_dependencies() {
            count += set.len();
        }
        if let Some(set) = self.collectibles_dependencies() {
            count += set.len();
        }
        // Collectibles (lazy)
        if let Some(map) = self.collectibles() {
            count += map.len();
        }
        if let Some(map) = self.aggregated_collectibles() {
            count += map.len();
        }
        // Note: outdated_collectibles is transient
        // Children and followers (lazy)
        if let Some(set) = self.children() {
            count += set.len();
        }
        if let Some(map) = self.followers() {
            count += map.len();
        }
        // Collectibles dependents (lazy) - count individual (collectible_type, task) pairs
        if let Some(map) = self.collectibles_dependents() {
            count += map.values().map(|set| set.len()).sum::<usize>();
        }
        count
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
        // Unified TypedStorage - all fields directly on one struct
        // Size will be larger than separate TaskData + TaskMeta because fields
        // aren't split, but simpler access patterns
        println!("TypedStorage size: {} bytes", size_of::<TypedStorage>());
        // Size check - unified storage is approximately the sum of what was data + meta
        // Note: The exact size may vary due to alignment/padding in unified struct
        assert!(
            size_of::<TypedStorage>() <= 256,
            "TypedStorage should not be too large"
        );
    }

    #[test]
    fn size_breakdown() {
        println!("\n=== Size Breakdown ===\n");

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

        println!("\n=== TypedStorage (Unified with lazy) ===\n");
        println!("TypedStorage total: {} bytes", size_of::<TypedStorage>());
        println!("\nSpecialized fields (inline):");
        println!(
            "  - output_dependent (FxHashSet<TaskId>): {} bytes",
            size_of::<AutoSet<TaskId>>()
        );
        println!(
            "  - aggregation_number: {} bytes",
            size_of::<Option<AggregationNumber>>()
        );
        println!("  - output: {} bytes", size_of::<Option<OutputValue>>());
        println!(
            "  - upper (CounterMap<TaskId, u32>): {} bytes",
            size_of::<CounterMap<TaskId, u32>>()
        );
        println!("\nDirect fields (inline):");
        println!(
            "  - stateful/invalidator/immutable: 3 * {} bytes",
            size_of::<Option<()>>()
        );
        println!(
            "  - dirty: {} bytes",
            size_of::<Option<crate::data::Dirtyness>>()
        );
        println!(
            "  - aggregated_dirty_container_count: {} bytes",
            size_of::<Option<i32>>()
        );
        println!(
            "  - aggregated_dirty_containers: {} bytes",
            size_of::<CounterMap<TaskId, i32>>()
        );

        println!("\nLazy Vec (stores all lazy fields):");
        println!(
            "  - lazy: Vec<LazyField> = {} bytes",
            size_of::<Vec<LazyField>>()
        );
        println!("  - LazyField enum size: {} bytes", size_of::<LazyField>());

        println!("\n=== Lazy Field Analysis ===\n");
        // With lazy: all lazy fields in one Vec<LazyField> = 24 bytes
        // Without lazy: 7 Option<Box<_>> = 56 bytes
        println!(
            "Vec<LazyField> = {} bytes (stores all lazy fields)",
            size_of::<Vec<LazyField>>()
        );
        println!(
            "Savings vs 7 Option<Box<_>>: {} bytes",
            7 * 8 - size_of::<Vec<LazyField>>()
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
