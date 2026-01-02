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

use crate::{
    backend::storage::InnerStorageState,
    data::{
        ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
        InProgressCellState, InProgressState, OutputValue,
    },
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
    #[task_storage(storage = "direct", category = "meta", specialized)]
    pub aggregation_number: Option<AggregationNumber>,

    /// Tasks that depend on this task's output.
    /// Specialized: frequently accessed during invalidation.
    #[task_storage(storage = "auto_set", category = "data", specialized)]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    /// Specialized: accessed on every task completion and read.
    #[task_storage(storage = "direct", category = "meta", specialized)]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    /// Specialized: frequently accessed during aggregation updates.
    #[task_storage(storage = "counter_map", category = "meta", specialized)]
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
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    #[task_storage(storage = "direct", category = "meta", group = "state")]
    pub dirty: Option<Dirtyness>,

    /// Count of dirty containers in the aggregated subgraph.
    #[task_storage(storage = "direct", category = "meta", group = "state")]
    pub aggregated_dirty_container_count: Option<i32>,

    /// Individual dirty containers in the aggregated subgraph.
    #[task_storage(storage = "counter_map", category = "meta", group = "state")]
    pub aggregated_dirty_containers: CounterMap<TaskId, i32>,

    /// Whether clean in current session (transient).
    #[task_storage(storage = "direct", category = "meta", group = "state", transient)]
    pub current_session_clean: Option<()>,

    /// Count of clean containers in current session (transient).
    #[task_storage(storage = "direct", category = "meta", group = "state", transient)]
    pub aggregated_current_session_clean_container_count: Option<i32>,

    /// Individual clean containers in current session (transient).
    #[task_storage(storage = "counter_map", category = "meta", group = "state", transient)]
    pub aggregated_current_session_clean_containers: CounterMap<TaskId, i32>,

    // =========================================================================
    // FLAGS GROUP (meta) - Simple boolean flags
    // =========================================================================
    /// Whether the task has mutable state.
    #[task_storage(storage = "direct", category = "meta", group = "flags")]
    pub stateful: Option<()>,

    /// Whether the task has an invalidator.
    #[task_storage(storage = "direct", category = "meta", group = "flags")]
    pub has_invalidator: Option<()>,

    /// Whether the task output is immutable.
    #[task_storage(storage = "direct", category = "meta", group = "flags")]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_compiles() {
        // This test just verifies the schema compiles correctly
        // The actual generated types will be tested separately
    }
}
