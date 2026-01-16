//! Task Storage Schema Definition
//!
//! This module defines the complete schema for task storage using the TaskStorage derive macro.
//! The schema covers all CachedDataItem variants with appropriate storage types and categories.
//!
//! # Storage Types (`storage = "..."`)
//!
//! - `direct` - For single optional values (e.g., Output, Dirty, AggregationNumber)
//! - `auto_set` - For sets of keys with unit values (e.g., Child, OutputDependency)
//! - `counter_map` - For maps with counted references (e.g., Upper, Follower, Collectible)
//! - `auto_map` - For maps with non-counter values (e.g., CellData)
//! - `auto_multimap` - For maps with set values (e.g., CellDependents)
//! - `flag` - For boolean flags stored in TaskFlags bitfield
//!
//! # Categories (`category = "..."`)
//!
//! - `data` - Frequently changed bulk data (dependencies, cell data)
//! - `meta` - Rarely changed metadata (output, aggregation, flags)
//! - `transient` - Not serialized, only exists in memory
use turbo_tasks::{
    CellId, SharedReference, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId, task_storage,
};

use crate::{
    backend::counter_map::CounterMap,
    data::{
        ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
        InProgressCellState, InProgressState, LeafDistance, OutputValue,
    },
};

/// Auto-set storage for small sets of keys with unit values.
/// Optimized for small collections (< 8 items use SmallVec inline).
type AutoSet<K> = auto_hash_map::AutoSet<K, std::hash::BuildHasherDefault<rustc_hash::FxHasher>, 1>;

/// Auto-map storage for key-value pairs.
type AutoMap<K, V> =
    auto_hash_map::AutoMap<K, V, std::hash::BuildHasherDefault<rustc_hash::FxHasher>, 1>;

/// The complete task storage schema.
///
/// This struct defines all storage fields for a task. The `#[task_storage]` macro
/// transforms this schema into the actual implementation:
/// - `TaskStorage` struct with inline and lazy field storage
/// - `LazyField` enum for lazy-allocated fields
/// - `TaskFlags` bitfield for boolean flags
/// - Accessor methods and traits
///
/// Fields are stored lazily in `Vec<LazyField>` by default for memory efficiency.
/// Fields with `inline` are stored directly on TaskStorage (for hot-path access).
///
/// Note: This struct is consumed by the macro and does not appear in the output.
#[task_storage]
struct TaskStorageSchema {
    // =========================================================================
    // INLINE FIELDS (hot path, always allocated inline)
    // =========================================================================
    /// The task's distance for prioritizing invalidation execution
    #[field(
        storage = "direct",
        category = "data",
        inline,
        default,
        variant = "LeafDistance"
    )]
    pub leaf_distance: LeafDistance,

    /// The task's aggregation number for the aggregation tree.
    /// Uses Default::default() semantics - a zero aggregation number means "not set".

    #[field(
        storage = "direct",
        category = "meta",
        inline,
        default,
        variant = "AggregationNumber"
    )]
    pub aggregation_number: AggregationNumber,

    /// Tasks that depend on this task's output.

    #[field(
        storage = "auto_set",
        category = "data",
        inline,
        filter_transient,
        variant = "OutputDependent",
        key_field = "task"
    )]
    pub output_dependent: AutoSet<TaskId>,

    /// The task's output value.
    /// Filtered during serialization to skip transient outputs (referencing transient tasks).
    #[field(
        storage = "direct",
        category = "meta",
        inline,
        filter_transient,
        variant = "Output"
    )]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    #[field(
        storage = "counter_map",
        category = "meta",
        inline,
        filter_transient,
        variant = "Upper",
        key_field = "task"
    )]
    pub upper: CounterMap<TaskId, u32>,

    // =========================================================================
    // COLLECTIBLES (meta)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[field(
        storage = "counter_map",
        category = "meta",
        filter_transient,
        variant = "Collectible",
        key_field = "collectible"
    )]
    pub collectibles: CounterMap<CollectibleRef, i32>,

    /// Aggregated collectibles from the subgraph.
    #[field(
        storage = "counter_map",
        category = "meta",
        filter_transient,
        variant = "AggregatedCollectible",
        key_field = "collectible"
    )]
    pub aggregated_collectibles: CounterMap<CollectibleRef, i32>,

    /// Outdated collectibles to be cleaned up (transient).
    #[field(
        storage = "counter_map",
        category = "transient",
        variant = "OutdatedCollectible",
        key_field = "collectible"
    )]
    pub outdated_collectibles: CounterMap<CollectibleRef, i32>,

    // =========================================================================
    // STATE FIELDS (meta)
    // Note: Lazy direct fields use bare types - Vec presence provides optionality
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    /// Absent = clean, present = dirty with the specified Dirtyness state.
    #[field(storage = "direct", category = "meta", variant = "Dirty")]
    pub dirty: Dirtyness,

    /// Count of dirty containers in the aggregated subgraph.
    /// Absent = 0, present = actual count.
    #[field(
        storage = "direct",
        category = "meta",
        variant = "AggregatedDirtyContainerCount"
    )]
    pub aggregated_dirty_container_count: i32,

    /// Individual dirty containers in the aggregated subgraph.
    #[field(
        storage = "counter_map",
        category = "meta",
        filter_transient,
        variant = "AggregatedDirtyContainer",
        key_field = "task"
    )]
    pub aggregated_dirty_containers: CounterMap<TaskId, i32>,

    /// Count of clean containers in current session (transient).
    /// Absent = 0, present = actual count.
    #[field(
        storage = "direct",
        category = "transient",
        variant = "AggregatedCurrentSessionCleanContainerCount"
    )]
    pub aggregated_current_session_clean_container_count: i32,

    /// Individual clean containers in current session (transient).
    #[field(
        storage = "counter_map",
        category = "transient",
        variant = "AggregatedCurrentSessionCleanContainer",
        key_field = "task"
    )]
    pub aggregated_current_session_clean_containers: CounterMap<TaskId, i32>,

    // =========================================================================
    // FLAGS (meta) - Boolean flags stored in TaskFlags bitfield
    // Persisted flags come first, then transient flags.
    // =========================================================================
    /// Whether the task has an invalidator.
    #[field(storage = "flag", category = "meta", variant = "HasInvalidator")]
    pub invalidator: bool,

    /// Whether the task output is immutable (persisted).
    #[field(storage = "flag", category = "meta", variant = "Immutable")]
    pub immutable: bool,

    /// Whether clean in current session (transient flag).
    #[field(
        storage = "flag",
        category = "transient",
        variant = "CurrentSessionClean"
    )]
    pub current_session_clean: bool,

    // =========================================================================
    // INTERNAL STATE FLAGS (transient) - Replaces InnerStorageState
    // These flags track internal state for persistence and snapshotting.
    // =========================================================================
    /// Whether meta data has been restored from persistent storage.
    #[field(storage = "flag", category = "transient")]
    pub meta_restored: bool,

    /// Whether data has been restored from persistent storage.
    #[field(storage = "flag", category = "transient")]
    pub data_restored: bool,

    /// Whether meta was modified before snapshot mode was entered.
    #[field(storage = "flag", category = "transient")]
    pub meta_modified: bool,

    /// Whether data was modified before snapshot mode was entered.
    #[field(storage = "flag", category = "transient")]
    pub data_modified: bool,

    /// Whether meta was modified after snapshot mode was entered (snapshot taken).
    #[field(storage = "flag", category = "transient")]
    pub meta_snapshot: bool,

    /// Whether data was modified after snapshot mode was entered (snapshot taken).
    #[field(storage = "flag", category = "transient")]
    pub data_snapshot: bool,

    /// Whether dependencies have been prefetched.
    #[field(storage = "flag", category = "transient")]
    pub prefetched: bool,

    // =========================================================================
    // CHILDREN & AGGREGATION (meta)
    // =========================================================================
    /// Child tasks of this task.
    #[field(
        storage = "auto_set",
        category = "meta",
        filter_transient,
        variant = "Child",
        key_field = "task"
    )]
    pub children: AutoSet<TaskId>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[field(
        storage = "counter_map",
        category = "meta",
        filter_transient,
        variant = "Follower",
        key_field = "task"
    )]
    pub followers: CounterMap<TaskId, u32>,

    // =========================================================================
    // DEPENDENCIES (data)
    // =========================================================================
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        variant = "OutputDependency",
        key_field = "target"
    )]
    pub output_dependencies: AutoSet<TaskId>,

    /// Cells this task depends on.
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        variant = "CellDependency",
        key_field = "target, key"
    )]
    pub cell_dependencies: AutoSet<(CellRef, Option<u64>)>,

    /// Collectibles this task depends on.
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        variant = "CollectiblesDependency",
        key_field = "target"
    )]
    pub collectibles_dependencies: AutoSet<CollectiblesRef>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[field(
        storage = "auto_set",
        category = "transient",
        variant = "OutdatedOutputDependency",
        key_field = "target"
    )]
    pub outdated_output_dependencies: AutoSet<TaskId>,

    /// Outdated cell dependencies to be cleaned up (transient).
    #[field(
        storage = "auto_set",
        category = "transient",
        variant = "OutdatedCellDependency",
        key_field = "target, key"
    )]
    pub outdated_cell_dependencies: AutoSet<(CellRef, Option<u64>)>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[field(
        storage = "auto_set",
        category = "transient",
        variant = "OutdatedCollectiblesDependency",
        key_field = "target"
    )]
    pub outdated_collectibles_dependencies: AutoSet<CollectiblesRef>,

    // =========================================================================
    // DEPENDENTS - Tasks that depend on this task's cells
    // =========================================================================
    #[field(
        storage = "auto_set",
        category = "data",
        variant = "CellDependent",
        key_field = "cell, key, task",
        filter_transient
    )]
    pub cell_dependents: AutoSet<(CellId, Option<u64>, TaskId)>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>

    #[field(
        storage = "auto_set",
        category = "meta",
        variant = "CollectiblesDependent",
        key_field = "collectible_type, task",
        filter_transient
    )]
    pub collectibles_dependents: AutoSet<(TraitTypeId, TaskId)>,

    // =========================================================================
    // CELL DATA (data)
    // =========================================================================
    /// Persistent cell data (serializable).
    #[field(
        storage = "auto_map",
        category = "data",
        variant = "CellData",
        key_field = "cell"
    )]
    pub cell_data: AutoMap<CellId, TypedSharedReference>,

    /// Transient cell data (not serializable).
    #[field(
        storage = "auto_map",
        category = "transient",
        variant = "TransientCellData",
        key_field = "cell"
    )]
    pub transient_cell_data: AutoMap<CellId, SharedReference>,

    /// Maximum cell index per cell type.
    #[field(
        storage = "auto_map",
        category = "data",
        variant = "CellTypeMaxIndex",
        key_field = "cell_type"
    )]
    pub cell_type_max_index: AutoMap<ValueTypeId, u32>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient)
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    #[field(storage = "direct", category = "transient", variant = "Activeness")]
    pub activeness: ActivenessState,

    /// In-progress execution state (transient).
    #[field(storage = "direct", category = "transient", variant = "InProgress")]
    pub in_progress: InProgressState,

    /// In-progress cell state for cells being computed (transient).
    #[field(
        storage = "auto_map",
        category = "transient",
        variant = "InProgressCell",
        key_field = "cell"
    )]
    pub in_progress_cells: AutoMap<CellId, InProgressCellState>,
}

// =============================================================================
// TaskFlags helper methods (for InnerStorageState compatibility)
// =============================================================================

use crate::backend::{TaskDataCategory, storage::SpecificTaskDataCategory};

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

    /// Check if the specified category is modified
    pub fn is_modified(&self, category: SpecificTaskDataCategory) -> bool {
        match category {
            SpecificTaskDataCategory::Meta => self.meta_modified(),
            SpecificTaskDataCategory::Data => self.data_modified(),
        }
    }

    /// Set the modified flag for the specified category
    pub fn set_modified(&mut self, category: SpecificTaskDataCategory, value: bool) {
        match category {
            SpecificTaskDataCategory::Meta => self.set_meta_modified(value),
            SpecificTaskDataCategory::Data => self.set_data_modified(value),
        }
    }

    /// Check if the specified category has a snapshot
    pub fn is_snapshot(&self, category: SpecificTaskDataCategory) -> bool {
        match category {
            SpecificTaskDataCategory::Meta => self.meta_snapshot(),
            SpecificTaskDataCategory::Data => self.data_snapshot(),
        }
    }

    /// Set the snapshot flag for the specified category
    pub fn set_snapshot(&mut self, category: SpecificTaskDataCategory, value: bool) {
        match category {
            SpecificTaskDataCategory::Meta => self.set_meta_snapshot(value),
            SpecificTaskDataCategory::Data => self.set_data_snapshot(value),
        }
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
    ///     |f| matches!(f, LazyField::OutputDependencies(_)),
    ///     |f| match f {
    ///         LazyField::OutputDependencies(v) => v,
    ///         _ => unreachable!(),
    ///     },
    ///     || LazyField::OutputDependencies(Default::default()),
    /// );
    /// ```
    fn get_or_create_lazy<T>(
        &mut self,
        matches: impl Fn(&LazyField) -> bool,
        extract: impl for<'a> FnOnce(&'a mut LazyField) -> &'a mut T,
        create: impl FnOnce() -> LazyField,
    ) -> &mut T {
        // Find the index of matching field (immutable borrow)
        let idx = self.lazy.iter().position(matches);
        if let Some(idx) = idx {
            extract(&mut self.lazy[idx])
        } else {
            self.lazy.push(create());
            extract(self.lazy.last_mut().unwrap())
        }
    }

    /// Take a lazy field by predicate, removing it from the Vec.
    ///
    /// Uses a `matches` predicate to find the field index, then `extract` to
    /// unwrap the value from the removed field.
    ///
    /// Returns `None` if no matching field exists.
    fn take_lazy<T>(
        &mut self,
        matches: impl Fn(&LazyField) -> bool,
        extract: impl FnOnce(LazyField) -> T,
    ) -> Option<T> {
        let idx = self.lazy.iter().position(matches)?;
        Some(extract(self.lazy.swap_remove(idx)))
    }

    /// Set a lazy field value, replacing any existing value.
    ///
    /// Uses a `matches` predicate to find an existing field. If found, replaces it
    /// in place and extracts the old value. Otherwise pushes the new value.
    ///
    /// Returns the old value if one existed.
    fn set_lazy<T>(
        &mut self,
        matches: impl Fn(&LazyField) -> bool,
        extract: impl FnOnce(LazyField) -> T,
        new_value: LazyField,
    ) -> Option<T> {
        if let Some(idx) = self.lazy.iter().position(matches) {
            let old = std::mem::replace(&mut self.lazy[idx], new_value);
            Some(extract(old))
        } else {
            self.lazy.push(new_value);
            None
        }
    }

    /// Encode fields for the specified category
    pub fn encode<E: bincode::enc::Encoder>(
        &self,
        category: SpecificTaskDataCategory,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        match category {
            SpecificTaskDataCategory::Meta => self.encode_meta(encoder),
            SpecificTaskDataCategory::Data => self.encode_data(encoder),
        }
    }

    /// Decode fields for the specified category
    pub fn decode<D: bincode::de::Decoder>(
        &mut self,
        category: SpecificTaskDataCategory,
        decoder: &mut D,
    ) -> Result<(), bincode::error::DecodeError> {
        match category {
            SpecificTaskDataCategory::Meta => self.decode_meta(decoder),
            SpecificTaskDataCategory::Data => self.decode_data(decoder),
        }
    }

    /// Clone only the fields for the specified category
    pub fn clone_category_snapshot(&self, category: SpecificTaskDataCategory) -> TaskStorage {
        match category {
            SpecificTaskDataCategory::Meta => self.clone_meta_snapshot(),
            SpecificTaskDataCategory::Data => self.clone_data_snapshot(),
        }
    }
}

// Support serialization filtering for CellDependents and CollectibleDependents

trait IsTransient {
    fn is_transient(&self) -> bool;
}

impl IsTransient for (TraitTypeId, TaskId) {
    fn is_transient(&self) -> bool {
        self.1.is_transient()
    }
}
impl IsTransient for (CellId, Option<u64>, TaskId) {
    fn is_transient(&self) -> bool {
        self.2.is_transient()
    }
}
impl IsTransient for (CellRef, Option<u64>) {
    fn is_transient(&self) -> bool {
        self.0.task.is_transient()
    }
}

#[cfg(test)]
mod tests {
    use std::mem::size_of;

    use turbo_tasks::{CellId, TaskId};

    use super::*;
    use crate::{
        backend::storage::SpecificTaskDataCategory,
        data::{AggregationNumber, CellRef, Dirtyness, OutputValue},
    };

    /// Test wrapper that implements TaskStorageAccessors for testing the CachedDataItem adapter.
    /// This wrapper doesn't track modifications since we're just testing functionality.
    struct TestStorage(TaskStorage);

    impl TestStorage {
        fn new() -> Self {
            Self(TaskStorage::new())
        }
    }

    impl TaskStorageAccessors for TestStorage {
        fn typed(&self) -> &TaskStorage {
            &self.0
        }

        fn typed_mut(&mut self) -> &mut TaskStorage {
            &mut self.0
        }

        fn track_modification(&mut self, _category: SpecificTaskDataCategory) {
            // No-op for tests
        }

        fn check_access(&self, _category: crate::backend::TaskDataCategory) {
            // No-op for tests
        }
    }

    #[test]
    fn test_accessors() {
        let mut storage = TaskStorage::new();

        // Inline direct fields (Option-wrapped)
        assert_eq!(storage.get_output(), None);
        assert_eq!(
            storage.set_output(OutputValue::Output(TaskId::new(1).unwrap())),
            None
        );
        assert_eq!(
            storage.get_output(),
            Some(&OutputValue::Output(TaskId::new(1).unwrap()))
        );

        assert_eq!(storage.get_aggregation_number(), None);
        storage.set_aggregation_number(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        });
        assert!(storage.get_aggregation_number().is_some());

        // Inline collection fields (always present)
        storage.upper_mut().insert(TaskId::new(5).unwrap(), 3);
        assert_eq!(storage.upper().get(&TaskId::new(5).unwrap()), Some(&3));

        storage
            .output_dependent_mut()
            .insert(TaskId::new(5).unwrap());
        assert!(
            storage
                .output_dependent()
                .contains(&TaskId::new(5).unwrap())
        );

        // Lazy direct fields
        assert!(storage.get_dirty().is_none());
        storage.set_dirty(Dirtyness::SessionDependent);
        assert_eq!(storage.get_dirty(), Some(&Dirtyness::SessionDependent));

        // Lazy collection fields (None until accessed via _mut)
        assert!(storage.output_dependencies().is_none());
        storage
            .output_dependencies_mut()
            .insert(TaskId::new(10).unwrap());
        assert_eq!(storage.output_dependencies().unwrap().len(), 1);

        assert!(storage.children().is_none());
        storage.children_mut().insert(TaskId::new(20).unwrap());
        assert_eq!(storage.children().unwrap().len(), 1);

        // Lazy counter_map
        assert!(storage.followers().is_none());
        storage.followers_mut().insert(TaskId::new(30).unwrap(), 5);
        assert_eq!(
            storage.followers().unwrap().get(&TaskId::new(30).unwrap()),
            Some(&5)
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
        original.set_output(OutputValue::Output(TaskId::new(42).unwrap()));
        original.upper_mut().insert(TaskId::new(100).unwrap(), 7);
        original.upper_mut().insert(TaskId::new(200).unwrap(), 3);
        original.set_dirty(Dirtyness::SessionDependent);
        original.set_aggregated_dirty_container_count(5);
        original
            .aggregated_dirty_containers_mut()
            .insert(TaskId::new(50).unwrap(), 2);

        // Set flags (persisted)
        original.flags.set_immutable(true);
        // Set transient flag (should NOT be serialized)
        original.flags.set_current_session_clean(true);

        // Set lazy meta fields (persisted)
        original.children_mut().insert(TaskId::new(1000).unwrap());
        original.children_mut().insert(TaskId::new(1001).unwrap());
        original
            .followers_mut()
            .insert(TaskId::new(2000).unwrap(), 4);

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
                .contains(&TaskId::new(1000).unwrap())
        );
        assert!(
            decoded
                .children()
                .unwrap()
                .contains(&TaskId::new(1001).unwrap())
        );
        assert_eq!(
            *decoded
                .followers()
                .unwrap()
                .get(&TaskId::new(2000).unwrap())
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
            .insert(TaskId::new(10).unwrap());
        original
            .output_dependent_mut()
            .insert(TaskId::new(20).unwrap());

        // Set lazy data fields (persisted)
        original
            .output_dependencies_mut()
            .insert(TaskId::new(100).unwrap());
        original
            .output_dependencies_mut()
            .insert(TaskId::new(200).unwrap());
        original.cell_dependencies_mut().insert((
            CellRef {
                task: TaskId::new(1).unwrap(),
                cell: CellId {
                    type_id: unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) },
                    index: 0,
                },
            },
            None,
        ));

        // Set lazy data transient field (should NOT be serialized)
        original
            .outdated_output_dependencies_mut()
            .insert(TaskId::new(999).unwrap());

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
                .contains(&TaskId::new(10).unwrap())
        );
        assert!(
            decoded
                .output_dependent()
                .contains(&TaskId::new(20).unwrap())
        );

        // Verify lazy data fields
        assert_eq!(decoded.output_dependencies().unwrap().len(), 2);
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&TaskId::new(100).unwrap())
        );
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&TaskId::new(200).unwrap())
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
        assert_eq!(decoded.get_aggregation_number(), None);
        assert_eq!(decoded.get_output(), None);
        assert!(decoded.upper().is_empty());
        assert!(decoded.output_dependent().is_empty());
        assert_eq!(decoded.children(), None);
        assert_eq!(decoded.output_dependencies(), None);
    }

    // ==========================================================================
    // Schema Size Tests
    // ==========================================================================

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_schema_size() {
        assert_eq!(
            size_of::<TaskStorage>(),
            136,
            "TaskStorage size changed! If this is intentional, update this test."
        );
    }

    // ==========================================================================
    // CachedDataItem Adapter Tests
    // ==========================================================================

    #[test]
    fn test_adapter_basic() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TestStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test add for inline direct field (Output)
        let output_item = CachedDataItem::Output {
            value: OutputValue::Output(task1),
        };
        assert!(storage.add(output_item.clone()));
        assert!(!storage.add(output_item)); // Second add should return false

        // Test get for Output
        let key = CachedDataItemKey::Output {};
        assert!(storage.get(&key).is_some());
        assert!(storage.contains_key(&key));

        // Test remove for Output
        let removed = storage.remove(&key);
        assert!(matches!(removed, Some(CachedDataItemValue::Output { .. })));
        assert!(storage.get(&key).is_none());

        // Test add for inline AutoSet field (OutputDependent)
        let dep_item = CachedDataItem::OutputDependent {
            task: task1,
            value: (),
        };
        assert!(storage.add(dep_item.clone()));
        assert!(!storage.add(dep_item)); // Already exists

        // Verify via typed accessor
        assert!(storage.typed().output_dependent().contains(&task1));

        // Test add another
        let dep_item2 = CachedDataItem::OutputDependent {
            task: task2,
            value: (),
        };
        assert!(storage.add(dep_item2));
        assert_eq!(storage.typed().output_dependent().len(), 2);

        // Test remove OutputDependent
        let key = CachedDataItemKey::OutputDependent { task: task1 };
        let removed = storage.remove(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::OutputDependent { value: () })
        ));
        assert_eq!(storage.typed().output_dependent().len(), 1);
        assert!(!storage.typed().output_dependent().contains(&task1));
        assert!(storage.typed().output_dependent().contains(&task2));
    }

    #[test]
    fn test_adapter_flags() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TestStorage::new();

        // Test flag field (Immutable)
        let immutable_item = CachedDataItem::Immutable { value: () };
        assert!(storage.add(immutable_item.clone()));
        assert!(storage.typed().flags.immutable());
        assert!(!storage.add(immutable_item)); // Already set

        // Test get for flag
        let key = CachedDataItemKey::Immutable {};
        assert!(storage.get(&key).is_some());

        // Test remove for flag
        let removed = storage.remove(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::Immutable { value: () })
        ));
        assert!(!storage.typed().flags.immutable());

        // Removing again should return None
        assert!(storage.remove(&key).is_none());
    }

    #[test]
    fn test_adapter_counter_map() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TestStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test inline CounterMap field (Upper)
        let upper_item = CachedDataItem::Upper {
            task: task1,
            value: 5,
        };
        assert!(storage.add(upper_item));
        assert_eq!(storage.upper().get(&task1), Some(&5));

        // Update the value (insert returns old value)
        let upper_update = CachedDataItem::Upper {
            task: task1,
            value: 10,
        };
        let old = storage.insert(upper_update);
        assert!(matches!(old, Some(CachedDataItemValue::Upper { value: 5 })));
        assert_eq!(storage.upper().get(&task1), Some(&10));

        // Test lazy CounterMap field (Follower)
        let follower_item = CachedDataItem::Follower {
            task: task2,
            value: 3,
        };
        assert!(storage.add(follower_item));
        assert_eq!(storage.followers().unwrap().get(&task2), Some(&3));

        // Test remove Follower
        let key = CachedDataItemKey::Follower { task: task2 };
        let removed = storage.remove(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::Follower { value: 3 })
        ));
        // After removal, followers map might be empty or the key just removed
        assert!(storage.followers().is_none_or(|f| f.get(&task2).is_none()));
    }

    #[test]
    fn test_adapter_lazy_autoset() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TestStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test lazy AutoSet field (Child)
        let child_item = CachedDataItem::Child {
            task: task1,
            value: (),
        };
        assert!(storage.add(child_item));
        assert!(storage.children().is_some());
        assert!(storage.children().unwrap().contains(&task1));

        // Add another child
        let child_item2 = CachedDataItem::Child {
            task: task2,
            value: (),
        };
        assert!(storage.add(child_item2));
        assert_eq!(storage.children().unwrap().len(), 2);

        // Test get
        let key = CachedDataItemKey::Child { task: task1 };
        assert!(storage.get(&key).is_some());
        let key_missing = CachedDataItemKey::Child {
            task: unsafe { TaskId::new_unchecked(999) },
        };
        assert!(storage.get(&key_missing).is_none());

        // Test remove
        let removed = storage.remove(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::Child { value: () })
        ));
        assert_eq!(storage.children().unwrap().len(), 1);
        assert!(!storage.children().unwrap().contains(&task1));
    }
}
