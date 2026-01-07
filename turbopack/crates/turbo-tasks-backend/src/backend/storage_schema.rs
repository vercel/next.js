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

/// The complete task storage schema.
///
/// This struct defines all storage fields for a task. The TaskStorage macro
/// generates the TypedStorage struct, LazyField enum, and all accessor methods.
///
/// Fields without `lazy` are stored inline on TypedStorage.
/// Fields with `lazy` are stored in a Vec<LazyField> for memory efficiency.
///
/// Note: This struct is only used as a schema definition for the macro.
/// The macro generates `TypedStorage`, `LazyField`, and `TaskFlags` from this.
#[derive(TaskStorage)]
#[allow(
    dead_code,
    reason = "this isn't dead it is scaffolding for the derive macro"
)]
pub struct TaskStorageSchema {
    // =========================================================================
    // INLINE FIELDS (hot path, always allocated inline)
    // =========================================================================
    /// The task's aggregation number for the aggregation tree.
    #[task_storage(storage = "direct", category = "meta")]
    pub aggregation_number: Option<AggregationNumber>,

    /// Tasks that depend on this task's output.
    #[task_storage(storage = "auto_set", category = "data", filter_transient)]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    /// Filtered during serialization to skip transient outputs (referencing transient tasks).
    #[task_storage(storage = "direct", category = "meta", filter_transient)]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
    pub upper: CounterMap<TaskId, u32>,

    // =========================================================================
    // COLLECTIBLES (meta, lazy)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", lazy, filter_transient)]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[task_storage(storage = "counter_map", category = "meta", lazy, filter_transient)]
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
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
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
    // INTERNAL STATE FLAGS (transient) - Replaces InnerStorageState
    // These flags track internal state for persistence and snapshotting.
    // =========================================================================
    /// Whether meta data has been restored from persistent storage.
    #[task_storage(flag, transient)]
    pub meta_restored: bool,

    /// Whether data has been restored from persistent storage.
    #[task_storage(flag, transient)]
    pub data_restored: bool,

    /// Whether meta was modified before snapshot mode was entered.
    #[task_storage(flag, transient)]
    pub meta_modified: bool,

    /// Whether data was modified before snapshot mode was entered.
    #[task_storage(flag, transient)]
    pub data_modified: bool,

    /// Whether meta was modified after snapshot mode was entered (snapshot taken).
    #[task_storage(flag, transient)]
    pub meta_snapshot: bool,

    /// Whether data was modified after snapshot mode was entered (snapshot taken).
    #[task_storage(flag, transient)]
    pub data_snapshot: bool,

    /// Whether dependencies have been prefetched.
    #[task_storage(flag, transient)]
    pub prefetched: bool,

    // =========================================================================
    // CHILDREN & AGGREGATION (meta, lazy)
    // =========================================================================
    /// Child tasks of this task.
    #[task_storage(storage = "auto_set", category = "meta", lazy, filter_transient)]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", lazy, filter_transient)]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES (data, lazy)
    // =========================================================================
    /// Tasks whose output this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy, filter_transient)]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy, filter_transient)]
    pub cell_dependencies: AutoSet<CellRef>,

    /// Collectibles this task depends on.
    #[task_storage(storage = "auto_set", category = "data", lazy, filter_transient)]
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
    /// The set values need filtering for transient TaskIds.
    #[task_storage(storage = "auto_map", category = "data", lazy, filter_transient_values)]
    pub cell_dependents: AutoMap<CellId, FxHashSet<TaskId>>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>
    /// The set values need filtering for transient TaskIds.
    #[task_storage(storage = "auto_map", category = "meta", lazy, filter_transient_values)]
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
    /// Note: Uses the `lazy` storage attribute which provides natural optionality -
    /// presence in Vec<LazyField> = Some, absence = None. No Option wrapper needed.
    #[task_storage(storage = "direct", category = "meta", lazy, transient)]
    pub activeness: ActivenessState,

    /// In-progress execution state (transient).
    /// Note: Uses the `lazy` storage attribute which provides natural optionality -
    /// presence in Vec<LazyField> = Some, absence = None. No Option wrapper needed.
    #[task_storage(storage = "direct", category = "meta", lazy, transient)]
    pub in_progress: InProgressState,

    /// In-progress cell state for cells being computed (transient).
    #[task_storage(storage = "auto_map", category = "meta", lazy, transient)]
    pub in_progress_cells: AutoMap<CellId, InProgressCellState>,
}

// =============================================================================
// TaskFlags helper methods (for InnerStorageState compatibility)
// =============================================================================

use crate::backend::TaskDataCategory;

impl TaskFlags {
    /// Set restored flags based on category
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

    /// Check if category is restored
    pub fn is_restored(&self, category: TaskDataCategory) -> bool {
        match category {
            TaskDataCategory::Meta => self.meta_restored(),
            TaskDataCategory::Data => self.data_restored(),
            TaskDataCategory::All => self.meta_restored() && self.data_restored(),
        }
    }

    /// Check if any snapshot flag is set
    pub fn any_snapshot(&self) -> bool {
        self.meta_snapshot() || self.data_snapshot()
    }

    /// Check if any modified flag is set
    pub fn any_modified(&self) -> bool {
        self.meta_modified() || self.data_modified()
    }
}

// =============================================================================
// TypedStorage helper methods
// =============================================================================

impl TypedStorage {
    /// Find a lazy field by predicate (immutable).
    ///
    /// The `extract` closure should return `Some(&T)` for the matching variant,
    /// or `None` for non-matching variants.
    pub fn find_lazy<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<&T> {
        self.lazy.iter().find_map(extract)
    }

    /// Find a lazy field by predicate (mutable).
    ///
    /// The `extract` closure should return `Some(&mut T)` for the matching variant,
    /// or `None` for non-matching variants.
    pub fn find_lazy_mut<T>(
        &mut self,
        extract: impl Fn(&mut LazyField) -> Option<&mut T>,
    ) -> Option<&mut T> {
        self.lazy.iter_mut().find_map(extract)
    }

    /// Get or create a lazy field, returning a mutable reference.
    ///
    /// Uses a single `extract` closure that serves as both the matcher (by returning Some/None)
    /// and the value extractor. The closure is first used to find the field position,
    /// then to extract the mutable reference.
    ///
    /// # Example
    /// ```ignore
    /// let deps = storage.get_or_create_lazy(
    ///     |f| match f {
    ///         LazyField::OutputDependencies(v) => Some(v),
    ///         _ => None,
    ///     },
    ///     || LazyField::OutputDependencies(Default::default()),
    /// );
    /// ```
    pub fn get_or_create_lazy<T>(
        &mut self,
        extract: impl for<'a> Fn(&'a mut LazyField) -> Option<&'a mut T>,
        create: impl FnOnce() -> LazyField,
    ) -> &mut T {
        // Find the index of matching field
        let idx = self.lazy.iter_mut().position(|f| extract(f).is_some());
        if let Some(idx) = idx {
            extract(&mut self.lazy[idx]).unwrap()
        } else {
            self.lazy.push(create());
            extract(self.lazy.last_mut().unwrap()).unwrap()
        }
    }

    /// Remove a lazy field at index if it's empty.
    ///
    /// Uses `swap_remove` for O(1) removal (order is not preserved).
    pub fn remove_if_empty(&mut self, idx: usize) {
        if self.lazy[idx].is_empty() {
            self.lazy.swap_remove(idx);
        }
    }
}

// =============================================================================
// CounterMap Extension Trait
// =============================================================================

use std::{
    collections::hash_map::Entry,
    hash::Hash,
    ops::{Add, AddAssign, Sub},
};

/// Extension trait for counter map operations.
///
/// Provides common operations for maps that track reference counts, where
/// entries are automatically removed when their count reaches zero.
pub trait CounterMapExt<K, V> {
    /// Update a counter by the given delta, returning `true` if the count
    /// crossed zero (became zero or became non-zero).
    ///
    /// This is useful for tracking state transitions where crossing zero
    /// indicates a significant change (e.g., first reference added or last
    /// reference removed).
    fn update_count(&mut self, key: K, delta: V) -> bool;

    /// Update a counter by the given delta and return the new value.
    fn update_and_get(&mut self, key: K, delta: V) -> V;

    /// Update a counter using a closure that receives the current value
    /// (or None if not present) and returns the new value (or None to remove).
    fn update_with<F>(&mut self, key: K, f: F)
    where
        F: FnOnce(Option<V>) -> Option<V>;

    /// Add a new entry, panicking if the entry already exists.
    fn add_entry(&mut self, key: K, value: V);

    /// Update a signed counter by the given delta, returning `true` if the count
    /// crossed the positive boundary (became positive or became non-positive).
    ///
    /// This is useful for tracking collectibles where positive counts indicate
    /// presence and non-positive counts indicate absence.
    fn update_positive_crossing(&mut self, key: K, delta: V) -> bool;
}

/// Trait for counter value types that support the required operations.
pub trait CounterValue:
    Copy + Default + PartialEq + PartialOrd + Add<Output = Self> + AddAssign + Sub<Output = Self>
{
    /// Check if this value is zero.
    fn is_zero(&self) -> bool;

    /// Check if this value is positive (> 0).
    fn is_positive(&self) -> bool;
}

impl CounterValue for u32 {
    fn is_zero(&self) -> bool {
        *self == 0
    }

    fn is_positive(&self) -> bool {
        *self > 0
    }
}

impl CounterValue for i32 {
    fn is_zero(&self) -> bool {
        *self == 0
    }

    fn is_positive(&self) -> bool {
        *self > 0
    }
}

impl<K: Hash + Eq, V: CounterValue> CounterMapExt<K, V> for CounterMap<K, V> {
    fn update_count(&mut self, key: K, delta: V) -> bool {
        match self.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get();
                let new = old + delta;
                let state_change =
                    (old.is_zero() && !new.is_zero()) || (!old.is_zero() && new.is_zero());
                if new.is_zero() {
                    e.remove();
                } else {
                    *e.get_mut() = new;
                }
                state_change
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                    true
                } else {
                    false
                }
            }
        }
    }

    fn update_and_get(&mut self, key: K, delta: V) -> V {
        match self.entry(key) {
            Entry::Occupied(mut e) => {
                let new_value = *e.get() + delta;
                if new_value.is_zero() {
                    e.remove();
                } else {
                    *e.get_mut() = new_value;
                }
                new_value
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                }
                delta
            }
        }
    }

    fn update_with<F>(&mut self, key: K, f: F)
    where
        F: FnOnce(Option<V>) -> Option<V>,
    {
        match self.entry(key) {
            Entry::Occupied(mut e) => match f(Some(*e.get())) {
                Some(new) => {
                    *e.get_mut() = new;
                }
                None => {
                    e.remove();
                }
            },
            Entry::Vacant(e) => {
                if let Some(new) = f(None) {
                    e.insert(new);
                }
            }
        }
    }

    fn add_entry(&mut self, key: K, value: V) {
        let old = self.insert(key, value);
        assert!(old.is_none(), "Entry already exists");
    }

    fn update_positive_crossing(&mut self, key: K, delta: V) -> bool {
        match self.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get();
                let new = old + delta;
                let state_change = (!old.is_positive() && new.is_positive())
                    || (old.is_positive() && !new.is_positive());
                if new.is_zero() {
                    e.remove();
                } else {
                    *e.get_mut() = new;
                }
                state_change
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                    delta.is_positive()
                } else {
                    false
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::mem::size_of;

    use turbo_tasks::TaskId;

    use super::*;
    use crate::data::{AggregationNumber, OutputValue};

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
}
