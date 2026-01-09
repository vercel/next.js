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

/// Auto-multimap storage for key -> set-of-values pairs.
/// A map where each key maps to a set of values (one-to-many relationship).
pub type AutoMultimap<K, V> = rustc_hash::FxHashMap<K, rustc_hash::FxHashSet<V>>;

/// The complete task storage schema.
///
/// This struct defines all storage fields for a task. The TaskStorage macro
/// generates the TaskStorage struct, LazyField enum, and all accessor methods.
///
/// Fields are stored lazily in Vec<LazyField> by default for memory efficiency.
/// Fields with `inline` are stored directly on TaskStorage (for hot-path access).
///
/// Note: This struct is only used as a schema definition for the macro.
/// The macro generates `TaskStorage`, `LazyField`, and `TaskFlags` from this.
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
    /// Uses Default::default() semantics - a zero aggregation number means "not set".
    #[task_storage(storage = "direct", category = "meta", inline, default)]
    pub aggregation_number: AggregationNumber,

    /// Tasks that depend on this task's output.
    #[task_storage(storage = "auto_set", category = "data", inline, filter_transient)]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    /// Filtered during serialization to skip transient outputs (referencing transient tasks).
    #[task_storage(storage = "direct", category = "meta", inline, filter_transient)]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", inline, filter_transient)]
    pub upper: CounterMap<TaskId, u32>,

    // =========================================================================
    // COLLECTIBLES (meta)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
    pub aggregated_collectibles: CounterMap<CollectibleRef, i32>,

    /// Outdated collectibles to be cleaned up (transient).
    #[task_storage(storage = "counter_map", category = "meta", transient)]
    pub outdated_collectibles: CounterMap<CollectibleRef, i32>,

    // =========================================================================
    // STATE FIELDS (meta)
    // Note: Lazy direct fields use bare types - Vec presence provides optionality
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    /// Absent = clean, present = dirty with the specified Dirtyness state.
    #[task_storage(storage = "direct", category = "meta")]
    pub dirty: Dirtyness,

    /// Count of dirty containers in the aggregated subgraph.
    /// Absent = 0, present = actual count.
    #[task_storage(storage = "direct", category = "meta")]
    pub aggregated_dirty_container_count: i32,

    /// Individual dirty containers in the aggregated subgraph.
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
    pub aggregated_dirty_containers: CounterMap<TaskId, i32>,

    /// Whether clean in current session (transient flag).
    #[task_storage(flag, transient)]
    pub current_session_clean: bool,

    /// Count of clean containers in current session (transient).
    /// Absent = 0, present = actual count.
    #[task_storage(storage = "direct", category = "meta", transient)]
    pub aggregated_current_session_clean_container_count: i32,

    /// Individual clean containers in current session (transient).
    #[task_storage(storage = "counter_map", category = "meta", transient)]
    pub aggregated_current_session_clean_containers: CounterMap<TaskId, i32>,

    // =========================================================================
    // FLAGS (meta) - Boolean flags stored in TaskFlags bitfield
    // Persisted flags come first, then transient flags.
    // =========================================================================
    /// Whether the task has an invalidator.
    #[task_storage(storage = "direct", flag, category = "meta")]
    pub invalidator: Option<()>,

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
    // CHILDREN & AGGREGATION (meta)
    // =========================================================================
    /// Child tasks of this task.
    #[task_storage(storage = "auto_set", category = "meta", filter_transient)]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[task_storage(storage = "counter_map", category = "meta", filter_transient)]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES (data)
    // =========================================================================
    /// Tasks whose output this task depends on.
    #[task_storage(storage = "auto_set", category = "data", filter_transient)]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[task_storage(storage = "auto_set", category = "data", filter_transient)]
    pub cell_dependencies: AutoSet<CellRef>,

    /// Collectibles this task depends on.
    #[task_storage(storage = "auto_set", category = "data", filter_transient)]
    pub collectibles_dependencies: AutoSet<CollectiblesRef>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", transient)]
    pub outdated_output_dependencies: AutoSet<TaskId>,

    /// Outdated cell dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", transient)]
    pub outdated_cell_dependencies: AutoSet<CellRef>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[task_storage(storage = "auto_set", category = "data", transient)]
    pub outdated_collectibles_dependencies: AutoSet<CollectiblesRef>,

    // =========================================================================
    // DEPENDENTS - Tasks that depend on this task's cells
    // =========================================================================
    /// Tasks that depend on specific cells of this task.
    /// Maps CellId -> Set<TaskId>
    /// AutoMultimap automatically filters transient values from inner sets during encoding.
    #[task_storage(storage = "auto_multimap", category = "data")]
    pub cell_dependents: AutoMultimap<CellId, TaskId>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>
    /// AutoMultimap automatically filters transient values from inner sets during encoding.
    #[task_storage(storage = "auto_multimap", category = "meta")]
    pub collectibles_dependents: AutoMultimap<TraitTypeId, TaskId>,

    // =========================================================================
    // CELL DATA (data)
    // =========================================================================
    /// Persistent cell data (serializable).
    #[task_storage(storage = "auto_map", category = "data")]
    pub cell_data: AutoMap<CellId, TypedSharedReference>,

    /// Transient cell data (not serializable).
    #[task_storage(storage = "auto_map", category = "data", transient)]
    pub transient_cell_data: AutoMap<CellId, SharedReference>,

    /// Maximum cell index per cell type.
    #[task_storage(storage = "auto_map", category = "data")]
    pub cell_type_max_index: AutoMap<ValueTypeId, u32>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient)
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    /// Note: Lazy storage provides natural optionality -
    /// presence in Vec<LazyField> = Some, absence = None. No Option wrapper needed.
    #[task_storage(storage = "direct", category = "meta", transient)]
    pub activeness: ActivenessState,

    /// In-progress execution state (transient).
    /// Note: Lazy storage provides natural optionality -
    /// presence in Vec<LazyField> = Some, absence = None. No Option wrapper needed.
    #[task_storage(storage = "direct", category = "meta", transient)]
    pub in_progress: InProgressState,

    /// In-progress cell state for cells being computed (transient).
    #[task_storage(storage = "auto_map", category = "meta", transient)]
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
// TaskStorage helper methods
// =============================================================================

impl TaskStorage {
    /// Find a lazy field by predicate (immutable).
    ///
    /// The `extract` closure should return `Some(&T)` for the matching variant,
    /// or `None` for non-matching variants.
    fn find_lazy<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<&T> {
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
    fn get_or_create_lazy<T>(
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

    use turbo_tasks::{CellId, TaskId};

    use super::*;
    use crate::data::{AggregationNumber, CellRef, Dirtyness, OutputValue};

    // ==========================================================================
    // TaskStorage Tests (moved from storage_macro_test.rs)
    // ==========================================================================

    #[test]
    fn test_task_storage_generates_types() {
        // The macro generates a unified TaskStorage type
        let storage = TaskStorage::new();

        // Verify the generated structure compiles
        drop(storage);
    }

    #[test]
    fn test_field_access() {
        let mut storage = TaskStorage::new();

        // Test inline direct fields via accessor methods (meta category)
        assert!(storage.get_output().is_none());
        storage.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(1) }));
        assert!(storage.get_output().is_some());

        // Test inline direct field (meta category)
        assert!(storage.get_aggregation_number().is_none());
        storage.set_aggregation_number(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        });
        assert!(storage.get_aggregation_number().is_some());

        // Test lazy direct field via accessor methods
        assert!(storage.get_dirty().is_none());
        storage.set_dirty(Dirtyness::Dirty);
        assert_eq!(storage.get_dirty(), Some(&Dirtyness::Dirty));

        // Test lazy field accessors (auto_set)
        let deps = storage.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(10) });
        deps.insert(unsafe { TaskId::new_unchecked(20) });
        assert_eq!(deps.len(), 2);

        // Test inline field via accessor methods (counter_map)
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(5) }, 3);
        assert_eq!(
            storage.upper().get(&unsafe { TaskId::new_unchecked(5) }),
            Some(&3)
        );

        // Verify it compiles and drops correctly
        drop(storage);
    }

    #[test]
    fn test_memory_efficiency() {
        let empty_storage = TaskStorage::new();

        // Empty storage should not allocate the lazy fields
        // We can verify the structure compiles and basic operations work
        assert!(empty_storage.get_output().is_none());
        assert!(empty_storage.get_aggregation_number().is_none());

        // Create a storage with some data
        let mut storage_with_data = TaskStorage::new();
        storage_with_data.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(1) }));

        // Add some dependencies (should allocate lazily)
        let deps = storage_with_data.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(1) });

        assert!(storage_with_data.get_output().is_some());
    }

    #[test]
    fn test_inline_fields() {
        let mut storage = TaskStorage::new();

        // Test inline data field (output) via accessor methods
        storage.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(123) }));
        assert!(storage.get_output().is_some());

        // Test inline counter_map field (upper) via accessor methods
        storage = TaskStorage::new();
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(1) }, 10);
        assert_eq!(
            storage.upper().get(&unsafe { TaskId::new_unchecked(1) }),
            Some(&10)
        );

        // Test inline auto_set field (output_dependent) via accessor methods
        storage = TaskStorage::new();
        storage
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(5) });
        assert!(
            storage
                .output_dependent()
                .contains(&unsafe { TaskId::new_unchecked(5) })
        );

        // Test inline meta field (aggregation_number) via accessor methods
        storage = TaskStorage::new();
        storage.set_aggregation_number(AggregationNumber {
            base: 1,
            distance: 2,
            effective: 3,
        });
        assert!(storage.get_aggregation_number().is_some());
    }

    #[test]
    fn test_lazy_fields() {
        let mut storage = TaskStorage::new();

        // Test lazy auto_set fields
        let deps = storage.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(10) });
        assert!(storage.output_dependencies().is_some());
        assert_eq!(storage.output_dependencies().unwrap().len(), 1);

        let children = storage.children_mut();
        children.insert(unsafe { TaskId::new_unchecked(20) });
        assert!(storage.children().is_some());
        assert_eq!(storage.children().unwrap().len(), 1);

        // Test lazy counter_map field (followers)
        let followers = storage.followers_mut();
        followers.insert(unsafe { TaskId::new_unchecked(30) }, 5);
        assert!(storage.followers().is_some());
        assert_eq!(
            *storage
                .followers()
                .unwrap()
                .get(&unsafe { TaskId::new_unchecked(30) })
                .unwrap(),
            5
        );
    }

    #[test]
    fn test_flag_fields() {
        let mut storage = TaskStorage::new();

        // Test that flags are default false
        assert!(!storage.flags.invalidator());
        assert!(!storage.flags.immutable());
        assert!(!storage.flags.current_session_clean());

        // Test setting flags
        storage.flags.set_immutable(true);
        assert!(storage.flags.immutable());
        assert!(!storage.flags.invalidator()); // Other flags unchanged

        storage.flags.set_invalidator(true);
        storage.flags.set_immutable(true);
        assert!(storage.flags.invalidator());
        assert!(storage.flags.immutable());

        // Test transient flag (current_session_clean)
        storage.flags.set_current_session_clean(true);
        assert!(storage.flags.current_session_clean());

        // Test persisted_bits only includes non-transient flags
        // invalidator=bit 0, immutable=bit 1 (persisted)
        // current_session_clean=bit 2 (transient)
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b11); // Only bits 0, 1

        // Test TaskFlags constants
        assert_eq!(TaskFlags::PERSISTED_MASK, 0b11); // 2 persisted flags

        // Test set_persisted_bits preserves transient flags
        let mut storage2 = TaskStorage::new();
        storage2.flags.set_current_session_clean(true); // Set transient flag
        storage2.flags.set_persisted_bits(0b10); // Set immutable only
        assert!(storage2.flags.immutable());
        assert!(!storage2.flags.invalidator());
        assert!(storage2.flags.current_session_clean()); // Transient flag preserved
    }

    #[test]
    fn test_internal_state_flags() {
        // Test the new internal state flags (formerly InnerStorageState)
        let mut storage = TaskStorage::new();

        // All internal state flags should be default false
        assert!(!storage.flags.meta_restored());
        assert!(!storage.flags.data_restored());
        assert!(!storage.flags.meta_modified());
        assert!(!storage.flags.data_modified());
        assert!(!storage.flags.meta_snapshot());
        assert!(!storage.flags.data_snapshot());
        assert!(!storage.flags.prefetched());

        // Test setting restored flags
        storage.flags.set_meta_restored(true);
        storage.flags.set_data_restored(true);
        assert!(storage.flags.meta_restored());
        assert!(storage.flags.data_restored());

        // Test setting modified flags
        storage.flags.set_meta_modified(true);
        storage.flags.set_data_modified(true);
        assert!(storage.flags.meta_modified());
        assert!(storage.flags.data_modified());

        // Test setting snapshot flags
        storage.flags.set_meta_snapshot(true);
        storage.flags.set_data_snapshot(true);
        assert!(storage.flags.meta_snapshot());
        assert!(storage.flags.data_snapshot());

        // Test prefetched flag
        storage.flags.set_prefetched(true);
        assert!(storage.flags.prefetched());

        // Verify these are all transient (not in persisted_bits)
        // Only invalidator, immutable should be persisted
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b00); // No persisted flags set

        // Set a persisted flag and verify internal state flags are still transient
        storage.flags.set_immutable(true);
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b10); // Only immutable (bit 1)
    }

    #[test]
    fn test_autoset_iter_len_is_empty() {
        let mut storage = TaskStorage::new();

        // Test inline AutoSet (output_dependent) - direct TaskStorage methods
        // The iter_*, len_*, is_empty_* methods are generated on the TaskStorageAccessors trait
        // which is implemented for TaskGuardImpl, not TaskStorage directly.
        // Here we test the underlying storage behavior.
        assert!(storage.output_dependent().is_empty());
        assert_eq!(storage.output_dependent().len(), 0);
        assert_eq!(storage.output_dependent().iter().count(), 0);

        // Add items via mutable accessor
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };
        storage.output_dependent_mut().insert(task1);
        storage.output_dependent_mut().insert(task2);

        assert!(!storage.output_dependent().is_empty());
        assert_eq!(storage.output_dependent().len(), 2);
        let items: Vec<_> = storage.output_dependent().iter().copied().collect();
        assert_eq!(items.len(), 2);
        assert!(items.contains(&task1));
        assert!(items.contains(&task2));

        // Test lazy AutoSet (children) - direct TaskStorage methods
        assert!(storage.children().is_none()); // Not allocated yet
        assert_eq!(storage.children().map_or(0, |c| c.len()), 0);

        // Add items via mutable accessor (allocates the set)
        let task3 = unsafe { TaskId::new_unchecked(3) };
        let task4 = unsafe { TaskId::new_unchecked(4) };
        storage.children_mut().insert(task3);
        storage.children_mut().insert(task4);

        assert!(storage.children().is_some());
        assert_eq!(storage.children().unwrap().len(), 2);
        let items: Vec<_> = storage.children().unwrap().iter().copied().collect();
        assert_eq!(items.len(), 2);
        assert!(items.contains(&task3));
        assert!(items.contains(&task4));

        // Test another lazy AutoSet (output_dependencies)
        assert!(storage.output_dependencies().is_none());
        assert_eq!(storage.output_dependencies().map_or(0, |d| d.len()), 0);

        let task5 = unsafe { TaskId::new_unchecked(5) };
        storage.output_dependencies_mut().insert(task5);

        assert!(storage.output_dependencies().is_some());
        assert_eq!(storage.output_dependencies().unwrap().len(), 1);
        let items: Vec<_> = storage
            .output_dependencies()
            .unwrap()
            .iter()
            .copied()
            .collect();
        assert_eq!(items, vec![task5]);
    }

    // Helper to create encoder
    fn new_encoder(
        buffer: &mut turbo_bincode::TurboBincodeBuffer,
    ) -> turbo_bincode::TurboBincodeEncoder<'_> {
        bincode::enc::EncoderImpl::new(
            turbo_bincode::TurboBincodeWriter::new(buffer),
            turbo_bincode::TURBO_BINCODE_CONFIG,
        )
    }

    // Helper to create decoder
    fn new_decoder(buffer: &[u8]) -> turbo_bincode::TurboBincodeDecoder<'_> {
        bincode::de::DecoderImpl::new(
            turbo_bincode::TurboBincodeReader::new(buffer),
            turbo_bincode::TURBO_BINCODE_CONFIG,
            (),
        )
    }

    #[test]
    fn test_encode_decode_meta_roundtrip() {
        let mut original = TaskStorage::new();

        // Set inline meta fields via accessor methods
        original.set_aggregation_number(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        });
        original.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(42) }));
        original
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(100) }, 7);
        original
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(200) }, 3);
        original.set_dirty(Dirtyness::Dirty);
        original.set_aggregated_dirty_container_count(5);
        original
            .aggregated_dirty_containers_mut()
            .insert(unsafe { TaskId::new_unchecked(50) }, 2);

        // Set flags (persisted)
        original.flags.set_immutable(true);
        // Set transient flag (should NOT be serialized)
        original.flags.set_current_session_clean(true);

        // Set lazy meta fields (persisted)
        original
            .children_mut()
            .insert(unsafe { TaskId::new_unchecked(1000) });
        original
            .children_mut()
            .insert(unsafe { TaskId::new_unchecked(1001) });
        original
            .followers_mut()
            .insert(unsafe { TaskId::new_unchecked(2000) }, 4);

        // Encode meta fields using turbo_bincode
        let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut buffer);
            original.encode_meta(&mut encoder).expect("encode failed");
        }

        // Decode into new storage
        let mut decoded = TaskStorage::new();
        // Set transient flag before decode to verify it's preserved
        decoded.flags.set_current_session_clean(true);

        {
            let mut decoder = new_decoder(&buffer);
            decoded.decode_meta(&mut decoder).expect("decode failed");
        }

        // Verify inline meta fields via accessor methods
        assert_eq!(
            decoded.get_aggregation_number(),
            original.get_aggregation_number()
        );
        assert_eq!(decoded.get_output(), original.get_output());
        assert_eq!(decoded.upper(), original.upper());
        // Verify lazy meta fields via accessor methods
        assert_eq!(decoded.get_dirty(), original.get_dirty());
        assert_eq!(
            decoded.get_aggregated_dirty_container_count(),
            original.get_aggregated_dirty_container_count()
        );
        assert_eq!(
            decoded.aggregated_dirty_containers(),
            original.aggregated_dirty_containers()
        );

        // Verify flags (persisted bits should match)
        assert!(!decoded.flags.invalidator());
        assert!(decoded.flags.immutable());
        // Transient flag should be preserved (was set to true before decode)
        assert!(decoded.flags.current_session_clean());

        // Verify lazy meta fields
        assert_eq!(decoded.children().unwrap().len(), 2);
        assert!(
            decoded
                .children()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(1000) })
        );
        assert!(
            decoded
                .children()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(1001) })
        );
        assert_eq!(
            *decoded
                .followers()
                .unwrap()
                .get(&unsafe { TaskId::new_unchecked(2000) })
                .unwrap(),
            4
        );
    }

    #[test]
    fn test_encode_decode_data_roundtrip() {
        let mut original = TaskStorage::new();

        // Set inline data field via accessor methods
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(10) });
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(20) });

        // Set lazy data fields (persisted)
        original
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(100) });
        original
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(200) });
        original.cell_dependencies_mut().insert(CellRef {
            task: unsafe { TaskId::new_unchecked(1) },
            cell: CellId {
                type_id: unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) },
                index: 0,
            },
        });

        // Set lazy data transient field (should NOT be serialized)
        original
            .outdated_output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(999) });

        // Encode data fields
        let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut buffer);
            original.encode_data(&mut encoder).expect("encode failed");
        }

        // Decode into new storage
        let mut decoded = TaskStorage::new();

        {
            let mut decoder = new_decoder(&buffer);
            decoded.decode_data(&mut decoder).expect("decode failed");
        }

        // Verify inline data field
        assert_eq!(decoded.output_dependent().len(), 2);
        assert!(
            decoded
                .output_dependent()
                .contains(&unsafe { TaskId::new_unchecked(10) })
        );
        assert!(
            decoded
                .output_dependent()
                .contains(&unsafe { TaskId::new_unchecked(20) })
        );

        // Verify lazy data fields
        assert_eq!(decoded.output_dependencies().unwrap().len(), 2);
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(100) })
        );
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(200) })
        );
        assert_eq!(decoded.cell_dependencies().unwrap().len(), 1);

        // Verify transient fields were NOT decoded
        assert!(decoded.outdated_output_dependencies().is_none());
    }

    #[test]
    fn test_encode_decode_empty_storage() {
        // Test that empty storage can be encoded/decoded
        let original = TaskStorage::new();

        // Encode meta
        let mut meta_buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut meta_buffer);
            original
                .encode_meta(&mut encoder)
                .expect("encode meta failed");
        }

        // Encode data
        let mut data_buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut data_buffer);
            original
                .encode_data(&mut encoder)
                .expect("encode data failed");
        }

        // Decode meta
        let mut decoded = TaskStorage::new();
        {
            let mut decoder = new_decoder(&meta_buffer);
            decoded
                .decode_meta(&mut decoder)
                .expect("decode meta failed");
        }

        // Decode data
        {
            let mut decoder = new_decoder(&data_buffer);
            decoded
                .decode_data(&mut decoder)
                .expect("decode data failed");
        }

        // Verify empty via accessor methods
        assert!(decoded.get_aggregation_number().is_none());
        assert!(decoded.get_output().is_none());
        assert!(decoded.upper().is_empty());
        assert!(decoded.output_dependent().is_empty());
        assert!(decoded.children().is_none());
        assert!(decoded.output_dependencies().is_none());
    }

    // ==========================================================================
    // Schema Size Tests
    // ==========================================================================

    #[test]
    fn test_schema_size() {
        // AggregationNumber is 12 bytes (3 x u32).
        assert_eq!(
            size_of::<AggregationNumber>(),
            12,
            "AggregationNumber size changed! Was 12 bytes, now {} bytes.",
            size_of::<AggregationNumber>()
        );

        // TaskStorage uses lazy storage for most fields, keeping inline storage minimal.
        // Current layout (128 bytes):
        //   - output_dependent (AutoSet<TaskId>): 24 bytes
        //   - aggregation_number (AggregationNumber with default): 12 bytes
        //   - output (Option<OutputValue>): 32 bytes
        //   - upper (CounterMap<TaskId, u32>): 24 bytes
        //   - flags (TaskFlags): 8 bytes
        //   - lazy (Vec<LazyField>): 24 bytes
        //   - padding: 4 bytes
        //
        // Use exact size check to catch regressions in either direction.
        assert_eq!(
            size_of::<TaskStorage>(),
            128,
            "TaskStorage size changed! Was 128 bytes, now {} bytes. If this is intentional, \
             update this test.",
            size_of::<TaskStorage>()
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

        println!("\n=== TaskStorage (Unified with lazy) ===\n");
        println!("TaskStorage total: {} bytes", size_of::<TaskStorage>());
        println!("\nSpecialized fields (inline):");
        println!(
            "  - output_dependent (FxHashSet<TaskId>): {} bytes",
            size_of::<AutoSet<TaskId>>()
        );
        println!(
            "  - aggregation_number: {} bytes",
            size_of::<AggregationNumber>()
        );
        println!("  - output: {} bytes", size_of::<Option<OutputValue>>());
        println!(
            "  - upper (CounterMap<TaskId, u32>): {} bytes",
            size_of::<CounterMap<TaskId, u32>>()
        );
        println!("\nDirect fields (inline):");
        println!(
            "  - invalidator/immutable: 2 * {} bytes",
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
