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

use crate::data::{
    ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness, InProgressCellState, InProgressState, LeafDistance, OutputValue
};

/// Auto-set storage for small sets of keys with unit values.
/// Optimized for small collections (< 8 items use SmallVec inline).
type AutoSet<K> = auto_hash_map::AutoSet<K, std::hash::BuildHasherDefault<rustc_hash::FxHasher>, 1>;

use super::counter_map::CounterMap;

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
    #[field(storage = "direct", category = "meta", inline, default)]
    pub leaf_distance: LeafDistance;

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
        key_field = "target"
    )]
    pub cell_dependencies: AutoSet<CellRef>,

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
        key_field = "target"
    )]
    pub outdated_cell_dependencies: AutoSet<CellRef>,

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
        key_field = "task",
        filter_transient
    )]
    pub cell_dependents: AutoSet<(CellId, Option<u64>, TaskId)>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>

    #[field(
        storage = "auto_set",
        category = "meta",
        variant = "CollectiblesDependent",
        key_field = "task",
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

// ==========================================================================
// TaskStorage Serialization Helpers
// ==========================================================================

/// Serialize TaskStorage meta fields directly to bytes.
/// Uses the generated encode_meta method for efficient serialization.
pub fn serialize_task_storage_meta(
    storage: &TaskStorage,
) -> Result<turbo_bincode::TurboBincodeBuffer, bincode::error::EncodeError> {
    let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
    let mut encoder = bincode::enc::EncoderImpl::new(
        turbo_bincode::TurboBincodeWriter::new(&mut buffer),
        turbo_bincode::TURBO_BINCODE_CONFIG,
    );
    storage.encode_meta(&mut encoder)?;
    Ok(buffer)
}

/// Serialize TaskStorage data fields directly to bytes.
/// Uses the generated encode_data method for efficient serialization.
pub fn serialize_task_storage_data(
    storage: &TaskStorage,
) -> Result<turbo_bincode::TurboBincodeBuffer, bincode::error::EncodeError> {
    let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
    let mut encoder = bincode::enc::EncoderImpl::new(
        turbo_bincode::TurboBincodeWriter::new(&mut buffer),
        turbo_bincode::TURBO_BINCODE_CONFIG,
    );
    storage.encode_data(&mut encoder)?;
    Ok(buffer)
}

// ==========================================================================
// CachedDataItem Compatibility Layer
// ==========================================================================
//
// This module provides compatibility methods that allow TaskStorage to be used
// with the existing CachedDataItem-based API. This enables incremental migration
// from InnerStorage to TaskStorage without changing all call sites at once.
//
// The adapter maps each CachedDataItem variant to the corresponding TaskStorage
// field using a dispatch macro.

use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataItemValueRef};

impl TaskStorage {
    /// Add a CachedDataItem to storage.
    ///
    /// Returns `true` if the item was newly added, `false` if it already existed.
    /// This is the compatibility method for migrating from InnerStorage.
    pub fn add_cached_data_item(&mut self, item: CachedDataItem) -> bool {
        use turbo_tasks::KeyValuePair;
        let (key, value) = item.into_key_and_value();
        self.insert_kv(key, value).is_none()
    }

    /// Insert a CachedDataItem, returning the old value if present.
    pub fn insert_cached_data_item(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        use turbo_tasks::KeyValuePair;
        let (key, value) = item.into_key_and_value();
        self.insert_kv(key, value)
    }

    /// Insert a key-value pair, returning the old value if present.
    fn insert_kv(
        &mut self,
        key: CachedDataItemKey,
        value: CachedDataItemValue,
    ) -> Option<CachedDataItemValue> {
        match (key, value) {
            // Direct fields (inline)
            (CachedDataItemKey::Output {}, CachedDataItemValue::Output { value }) => self
                .set_output(value)
                .map(|v| CachedDataItemValue::Output { value: v }),
            (
                CachedDataItemKey::AggregationNumber {},
                CachedDataItemValue::AggregationNumber { value },
            ) => self
                .set_aggregation_number(value)
                .map(|v| CachedDataItemValue::AggregationNumber { value: v }),

            // AutoSet fields (inline)
            (
                CachedDataItemKey::OutputDependent { task },
                CachedDataItemValue::OutputDependent { value: () },
            ) => {
                let existed = !self.output_dependent_mut().insert(task);
                if existed {
                    Some(CachedDataItemValue::OutputDependent { value: () })
                } else {
                    None
                }
            }

            // CounterMap fields (inline)
            (CachedDataItemKey::Upper { task }, CachedDataItemValue::Upper { value }) => self
                .upper_mut()
                .insert(task, value)
                .map(|v| CachedDataItemValue::Upper { value: v }),

            // Direct fields (lazy)
            (CachedDataItemKey::Dirty {}, CachedDataItemValue::Dirty { value }) => self
                .set_dirty(value)
                .map(|v| CachedDataItemValue::Dirty { value: v }),
            (
                CachedDataItemKey::AggregatedDirtyContainerCount {},
                CachedDataItemValue::AggregatedDirtyContainerCount { value },
            ) => self
                .set_aggregated_dirty_container_count(value)
                .map(|v| CachedDataItemValue::AggregatedDirtyContainerCount { value: v }),
            (CachedDataItemKey::Activeness {}, CachedDataItemValue::Activeness { value }) => self
                .set_activeness(value)
                .map(|v| CachedDataItemValue::Activeness { value: v }),
            (CachedDataItemKey::InProgress {}, CachedDataItemValue::InProgress { value }) => self
                .set_in_progress(value)
                .map(|v| CachedDataItemValue::InProgress { value: v }),
            (
                CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {},
                CachedDataItemValue::AggregatedCurrentSessionCleanContainerCount { value },
            ) => self
                .set_aggregated_current_session_clean_container_count(value)
                .map(
                    |v| CachedDataItemValue::AggregatedCurrentSessionCleanContainerCount {
                        value: v,
                    },
                ),

            // Flag fields
            (
                CachedDataItemKey::HasInvalidator {},
                CachedDataItemValue::HasInvalidator { value: () },
            ) => {
                let existed = self.flags.invalidator();
                self.flags.set_invalidator(true);
                if existed {
                    Some(CachedDataItemValue::HasInvalidator { value: () })
                } else {
                    None
                }
            }
            (CachedDataItemKey::Immutable {}, CachedDataItemValue::Immutable { value: () }) => {
                let existed = self.flags.immutable();
                self.flags.set_immutable(true);
                if existed {
                    Some(CachedDataItemValue::Immutable { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::CurrentSessionClean {},
                CachedDataItemValue::CurrentSessionClean { value: () },
            ) => {
                let existed = self.flags.current_session_clean();
                self.flags.set_current_session_clean(true);
                if existed {
                    Some(CachedDataItemValue::CurrentSessionClean { value: () })
                } else {
                    None
                }
            }

            // AutoSet fields (lazy)
            (CachedDataItemKey::Child { task }, CachedDataItemValue::Child { value: () }) => {
                let existed = !self.children_mut().insert(task);
                if existed {
                    Some(CachedDataItemValue::Child { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::OutputDependency { target },
                CachedDataItemValue::OutputDependency { value: () },
            ) => {
                let existed = !self.output_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::OutputDependency { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::CellDependency { target },
                CachedDataItemValue::CellDependency { value: () },
            ) => {
                let existed = !self.cell_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::CellDependency { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::CollectiblesDependency { target },
                CachedDataItemValue::CollectiblesDependency { value: () },
            ) => {
                let existed = !self.collectibles_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::CollectiblesDependency { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::OutdatedOutputDependency { target },
                CachedDataItemValue::OutdatedOutputDependency { value: () },
            ) => {
                let existed = !self.outdated_output_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::OutdatedOutputDependency { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::OutdatedCellDependency { target },
                CachedDataItemValue::OutdatedCellDependency { value: () },
            ) => {
                let existed = !self.outdated_cell_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::OutdatedCellDependency { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::OutdatedCollectiblesDependency { target },
                CachedDataItemValue::OutdatedCollectiblesDependency { value: () },
            ) => {
                let existed = !self.outdated_collectibles_dependencies_mut().insert(target);
                if existed {
                    Some(CachedDataItemValue::OutdatedCollectiblesDependency { value: () })
                } else {
                    None
                }
            }

            // CounterMap fields (lazy)
            (
                CachedDataItemKey::Collectible { collectible },
                CachedDataItemValue::Collectible { value },
            ) => self
                .collectibles_mut()
                .insert(collectible, value)
                .map(|v| CachedDataItemValue::Collectible { value: v }),
            (
                CachedDataItemKey::AggregatedCollectible { collectible },
                CachedDataItemValue::AggregatedCollectible { value },
            ) => self
                .aggregated_collectibles_mut()
                .insert(collectible, value)
                .map(|v| CachedDataItemValue::AggregatedCollectible { value: v }),
            (
                CachedDataItemKey::OutdatedCollectible { collectible },
                CachedDataItemValue::OutdatedCollectible { value },
            ) => self
                .outdated_collectibles_mut()
                .insert(collectible, value)
                .map(|v| CachedDataItemValue::OutdatedCollectible { value: v }),
            (CachedDataItemKey::Follower { task }, CachedDataItemValue::Follower { value }) => self
                .followers_mut()
                .insert(task, value)
                .map(|v| CachedDataItemValue::Follower { value: v }),
            (
                CachedDataItemKey::AggregatedDirtyContainer { task },
                CachedDataItemValue::AggregatedDirtyContainer { value },
            ) => self
                .aggregated_dirty_containers_mut()
                .insert(task, value)
                .map(|v| CachedDataItemValue::AggregatedDirtyContainer { value: v }),
            (
                CachedDataItemKey::AggregatedCurrentSessionCleanContainer { task },
                CachedDataItemValue::AggregatedCurrentSessionCleanContainer { value },
            ) => self
                .aggregated_current_session_clean_containers_mut()
                .insert(task, value)
                .map(|v| CachedDataItemValue::AggregatedCurrentSessionCleanContainer { value: v }),

            // AutoMap fields (lazy)
            (CachedDataItemKey::CellData { cell }, CachedDataItemValue::CellData { value }) => self
                .cell_data_mut()
                .insert(cell, value)
                .map(|v| CachedDataItemValue::CellData { value: v }),
            (
                CachedDataItemKey::TransientCellData { cell },
                CachedDataItemValue::TransientCellData { value },
            ) => self
                .transient_cell_data_mut()
                .insert(cell, value)
                .map(|v| CachedDataItemValue::TransientCellData { value: v }),
            (
                CachedDataItemKey::CellTypeMaxIndex { cell_type },
                CachedDataItemValue::CellTypeMaxIndex { value },
            ) => self
                .cell_type_max_index_mut()
                .insert(cell_type, value)
                .map(|v| CachedDataItemValue::CellTypeMaxIndex { value: v }),
            (
                CachedDataItemKey::InProgressCell { cell },
                CachedDataItemValue::InProgressCell { value },
            ) => self
                .in_progress_cells_mut()
                .insert(cell, value)
                .map(|v| CachedDataItemValue::InProgressCell { value: v }),

            // AutoMultimap fields
            (
                CachedDataItemKey::CellDependent { cell, task },
                CachedDataItemValue::CellDependent { value: () },
            ) => {
                let set = self.cell_dependents_mut().entry(cell).or_default();
                let existed = !set.insert(task);
                if existed {
                    Some(CachedDataItemValue::CellDependent { value: () })
                } else {
                    None
                }
            }
            (
                CachedDataItemKey::CollectiblesDependent {
                    collectible_type,
                    task,
                },
                CachedDataItemValue::CollectiblesDependent { value: () },
            ) => {
                let set = self
                    .collectibles_dependents_mut()
                    .entry(collectible_type)
                    .or_default();
                let existed = !set.insert(task);
                if existed {
                    Some(CachedDataItemValue::CollectiblesDependent { value: () })
                } else {
                    None
                }
            }

            // Catch-all for mismatched key/value types (should not happen in practice)
            #[allow(unreachable_patterns)]
            (key, value) => {
                panic!("Mismatched CachedDataItem key/value types: key={key:?}, value={value:?}");
            }
        }
    }

    /// Get a reference to a CachedDataItem value by key.
    pub fn get_cached_data_item(
        &self,
        key: &CachedDataItemKey,
    ) -> Option<CachedDataItemValueRef<'_>> {
        match key {
            // Direct fields (inline)
            CachedDataItemKey::Output {} => self
                .get_output()
                .map(|value| CachedDataItemValueRef::Output { value }),
            CachedDataItemKey::AggregationNumber {} => self
                .get_aggregation_number()
                .map(|value| CachedDataItemValueRef::AggregationNumber { value }),

            // AutoSet fields (inline)
            CachedDataItemKey::OutputDependent { task } => {
                if self.output_dependent().contains(task) {
                    Some(CachedDataItemValueRef::OutputDependent { value: &() })
                } else {
                    None
                }
            }

            // CounterMap fields (inline)
            CachedDataItemKey::Upper { task } => self
                .upper()
                .get(task)
                .map(|value| CachedDataItemValueRef::Upper { value }),

            // Direct fields (lazy)
            CachedDataItemKey::Dirty {} => self
                .get_dirty()
                .map(|value| CachedDataItemValueRef::Dirty { value }),
            CachedDataItemKey::AggregatedDirtyContainerCount {} => self
                .get_aggregated_dirty_container_count()
                .map(|value| CachedDataItemValueRef::AggregatedDirtyContainerCount { value }),
            CachedDataItemKey::Activeness {} => self
                .get_activeness()
                .map(|value| CachedDataItemValueRef::Activeness { value }),
            CachedDataItemKey::InProgress {} => self
                .get_in_progress()
                .map(|value| CachedDataItemValueRef::InProgress { value }),
            CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {} => self
                .get_aggregated_current_session_clean_container_count()
                .map(
                    |value| CachedDataItemValueRef::AggregatedCurrentSessionCleanContainerCount {
                        value,
                    },
                ),

            // Flag fields
            CachedDataItemKey::HasInvalidator {} => {
                if self.flags.invalidator() {
                    Some(CachedDataItemValueRef::HasInvalidator { value: &() })
                } else {
                    None
                }
            }
            CachedDataItemKey::Immutable {} => {
                if self.flags.immutable() {
                    Some(CachedDataItemValueRef::Immutable { value: &() })
                } else {
                    None
                }
            }
            CachedDataItemKey::CurrentSessionClean {} => {
                if self.flags.current_session_clean() {
                    Some(CachedDataItemValueRef::CurrentSessionClean { value: &() })
                } else {
                    None
                }
            }

            // AutoSet fields (lazy)
            CachedDataItemKey::Child { task } => self.children().and_then(|set| {
                if set.contains(task) {
                    Some(CachedDataItemValueRef::Child { value: &() })
                } else {
                    None
                }
            }),
            CachedDataItemKey::OutputDependency { target } => {
                self.output_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::OutputDependency { value: &() })
                    } else {
                        None
                    }
                })
            }
            CachedDataItemKey::CellDependency { target } => {
                self.cell_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::CellDependency { value: &() })
                    } else {
                        None
                    }
                })
            }
            CachedDataItemKey::CollectiblesDependency { target } => {
                self.collectibles_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::CollectiblesDependency { value: &() })
                    } else {
                        None
                    }
                })
            }
            CachedDataItemKey::OutdatedOutputDependency { target } => {
                self.outdated_output_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::OutdatedOutputDependency { value: &() })
                    } else {
                        None
                    }
                })
            }
            CachedDataItemKey::OutdatedCellDependency { target } => {
                self.outdated_cell_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::OutdatedCellDependency { value: &() })
                    } else {
                        None
                    }
                })
            }
            CachedDataItemKey::OutdatedCollectiblesDependency { target } => {
                self.outdated_collectibles_dependencies().and_then(|set| {
                    if set.contains(target) {
                        Some(CachedDataItemValueRef::OutdatedCollectiblesDependency { value: &() })
                    } else {
                        None
                    }
                })
            }

            // CounterMap fields (lazy)
            CachedDataItemKey::Collectible { collectible } => self
                .collectibles()
                .and_then(|map| map.get(collectible))
                .map(|value| CachedDataItemValueRef::Collectible { value }),
            CachedDataItemKey::AggregatedCollectible { collectible } => self
                .aggregated_collectibles()
                .and_then(|map| map.get(collectible))
                .map(|value| CachedDataItemValueRef::AggregatedCollectible { value }),
            CachedDataItemKey::OutdatedCollectible { collectible } => self
                .outdated_collectibles()
                .and_then(|map| map.get(collectible))
                .map(|value| CachedDataItemValueRef::OutdatedCollectible { value }),
            CachedDataItemKey::Follower { task } => self
                .followers()
                .and_then(|map| map.get(task))
                .map(|value| CachedDataItemValueRef::Follower { value }),
            CachedDataItemKey::AggregatedDirtyContainer { task } => self
                .aggregated_dirty_containers()
                .and_then(|map| map.get(task))
                .map(|value| CachedDataItemValueRef::AggregatedDirtyContainer { value }),
            CachedDataItemKey::AggregatedCurrentSessionCleanContainer { task } => self
                .aggregated_current_session_clean_containers()
                .and_then(|map| map.get(task))
                .map(
                    |value| CachedDataItemValueRef::AggregatedCurrentSessionCleanContainer {
                        value,
                    },
                ),

            // AutoMap fields (lazy)
            CachedDataItemKey::CellData { cell } => self
                .cell_data()
                .and_then(|map| map.get(cell))
                .map(|value| CachedDataItemValueRef::CellData { value }),
            CachedDataItemKey::TransientCellData { cell } => self
                .transient_cell_data()
                .and_then(|map| map.get(cell))
                .map(|value| CachedDataItemValueRef::TransientCellData { value }),
            CachedDataItemKey::CellTypeMaxIndex { cell_type } => self
                .cell_type_max_index()
                .and_then(|map| map.get(cell_type))
                .map(|value| CachedDataItemValueRef::CellTypeMaxIndex { value }),
            CachedDataItemKey::InProgressCell { cell } => self
                .in_progress_cells()
                .and_then(|map| map.get(cell))
                .map(|value| CachedDataItemValueRef::InProgressCell { value }),

            // AutoMultimap fields
            CachedDataItemKey::CellDependent { cell, task } => self
                .cell_dependents()
                .and_then(|map| map.get(cell))
                .and_then(|set| {
                    if set.contains(task) {
                        Some(CachedDataItemValueRef::CellDependent { value: &() })
                    } else {
                        None
                    }
                }),
            CachedDataItemKey::CollectiblesDependent {
                collectible_type,
                task,
            } => self
                .collectibles_dependents()
                .and_then(|map| map.get(collectible_type))
                .and_then(|set| {
                    if set.contains(task) {
                        Some(CachedDataItemValueRef::CollectiblesDependent { value: &() })
                    } else {
                        None
                    }
                }),
        }
    }

    /// Check if a CachedDataItem key exists in storage.
    pub fn contains_key(&self, key: &CachedDataItemKey) -> bool {
        self.get_cached_data_item(key).is_some()
    }

    /// Remove a CachedDataItem by key, returning the old value if present.
    pub fn remove_cached_data_item(
        &mut self,
        key: &CachedDataItemKey,
    ) -> Option<CachedDataItemValue> {
        match key {
            // Direct fields (inline)
            CachedDataItemKey::Output {} => self
                .take_output()
                .map(|value| CachedDataItemValue::Output { value }),
            CachedDataItemKey::AggregationNumber {} => self
                .take_aggregation_number()
                .map(|value| CachedDataItemValue::AggregationNumber { value }),

            // AutoSet fields (inline)
            CachedDataItemKey::OutputDependent { task } => {
                if self.output_dependent_mut().remove(task) {
                    Some(CachedDataItemValue::OutputDependent { value: () })
                } else {
                    None
                }
            }

            // CounterMap fields (inline)
            CachedDataItemKey::Upper { task } => self
                .upper_mut()
                .remove(task)
                .map(|value| CachedDataItemValue::Upper { value }),

            // Direct fields (lazy)
            CachedDataItemKey::Dirty {} => self
                .take_dirty()
                .map(|value| CachedDataItemValue::Dirty { value }),
            CachedDataItemKey::AggregatedDirtyContainerCount {} => self
                .take_aggregated_dirty_container_count()
                .map(|value| CachedDataItemValue::AggregatedDirtyContainerCount { value }),
            CachedDataItemKey::Activeness {} => self
                .take_activeness()
                .map(|value| CachedDataItemValue::Activeness { value }),
            CachedDataItemKey::InProgress {} => self
                .take_in_progress()
                .map(|value| CachedDataItemValue::InProgress { value }),
            CachedDataItemKey::AggregatedCurrentSessionCleanContainerCount {} => self
                .take_aggregated_current_session_clean_container_count()
                .map(
                    |value| CachedDataItemValue::AggregatedCurrentSessionCleanContainerCount {
                        value,
                    },
                ),

            // Flag fields
            CachedDataItemKey::HasInvalidator {} => {
                let existed = self.flags.invalidator();
                self.flags.set_invalidator(false);
                if existed {
                    Some(CachedDataItemValue::HasInvalidator { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::Immutable {} => {
                let existed = self.flags.immutable();
                self.flags.set_immutable(false);
                if existed {
                    Some(CachedDataItemValue::Immutable { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::CurrentSessionClean {} => {
                let existed = self.flags.current_session_clean();
                self.flags.set_current_session_clean(false);
                if existed {
                    Some(CachedDataItemValue::CurrentSessionClean { value: () })
                } else {
                    None
                }
            }

            // AutoSet fields (lazy) - use children() first to check, then children_mut() to remove
            CachedDataItemKey::Child { task } => {
                if self.children().is_some_and(|set| set.contains(task)) {
                    self.children_mut().remove(task);
                    Some(CachedDataItemValue::Child { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::OutputDependency { target } => {
                if self
                    .output_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.output_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::OutputDependency { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::CellDependency { target } => {
                if self
                    .cell_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.cell_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::CellDependency { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::CollectiblesDependency { target } => {
                if self
                    .collectibles_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.collectibles_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::CollectiblesDependency { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::OutdatedOutputDependency { target } => {
                if self
                    .outdated_output_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.outdated_output_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::OutdatedOutputDependency { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::OutdatedCellDependency { target } => {
                if self
                    .outdated_cell_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.outdated_cell_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::OutdatedCellDependency { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::OutdatedCollectiblesDependency { target } => {
                if self
                    .outdated_collectibles_dependencies()
                    .is_some_and(|set| set.contains(target))
                {
                    self.outdated_collectibles_dependencies_mut().remove(target);
                    Some(CachedDataItemValue::OutdatedCollectiblesDependency { value: () })
                } else {
                    None
                }
            }

            // CounterMap fields (lazy)
            CachedDataItemKey::Collectible { collectible } => self
                .collectibles()
                .is_some_and(|map| map.contains_key(collectible))
                .then(|| {
                    self.collectibles_mut()
                        .remove(collectible)
                        .map(|value| CachedDataItemValue::Collectible { value })
                })
                .flatten(),
            CachedDataItemKey::AggregatedCollectible { collectible } => self
                .aggregated_collectibles()
                .is_some_and(|map| map.contains_key(collectible))
                .then(|| {
                    self.aggregated_collectibles_mut()
                        .remove(collectible)
                        .map(|value| CachedDataItemValue::AggregatedCollectible { value })
                })
                .flatten(),
            CachedDataItemKey::OutdatedCollectible { collectible } => self
                .outdated_collectibles()
                .is_some_and(|map| map.contains_key(collectible))
                .then(|| {
                    self.outdated_collectibles_mut()
                        .remove(collectible)
                        .map(|value| CachedDataItemValue::OutdatedCollectible { value })
                })
                .flatten(),
            CachedDataItemKey::Follower { task } => self
                .followers()
                .is_some_and(|map| map.contains_key(task))
                .then(|| {
                    self.followers_mut()
                        .remove(task)
                        .map(|value| CachedDataItemValue::Follower { value })
                })
                .flatten(),
            CachedDataItemKey::AggregatedDirtyContainer { task } => self
                .aggregated_dirty_containers()
                .is_some_and(|map| map.contains_key(task))
                .then(|| {
                    self.aggregated_dirty_containers_mut()
                        .remove(task)
                        .map(|value| CachedDataItemValue::AggregatedDirtyContainer { value })
                })
                .flatten(),
            CachedDataItemKey::AggregatedCurrentSessionCleanContainer { task } => self
                .aggregated_current_session_clean_containers()
                .is_some_and(|map| map.contains_key(task))
                .then(|| {
                    self.aggregated_current_session_clean_containers_mut()
                        .remove(task)
                        .map(
                            |value| CachedDataItemValue::AggregatedCurrentSessionCleanContainer {
                                value,
                            },
                        )
                })
                .flatten(),

            // AutoMap fields (lazy)
            CachedDataItemKey::CellData { cell } => self
                .cell_data()
                .is_some_and(|map| map.contains_key(cell))
                .then(|| {
                    self.cell_data_mut()
                        .remove(cell)
                        .map(|value| CachedDataItemValue::CellData { value })
                })
                .flatten(),
            CachedDataItemKey::TransientCellData { cell } => self
                .transient_cell_data()
                .is_some_and(|map| map.contains_key(cell))
                .then(|| {
                    self.transient_cell_data_mut()
                        .remove(cell)
                        .map(|value| CachedDataItemValue::TransientCellData { value })
                })
                .flatten(),
            CachedDataItemKey::CellTypeMaxIndex { cell_type } => self
                .cell_type_max_index()
                .is_some_and(|map| map.contains_key(cell_type))
                .then(|| {
                    self.cell_type_max_index_mut()
                        .remove(cell_type)
                        .map(|value| CachedDataItemValue::CellTypeMaxIndex { value })
                })
                .flatten(),
            CachedDataItemKey::InProgressCell { cell } => self
                .in_progress_cells()
                .is_some_and(|map| map.contains_key(cell))
                .then(|| {
                    self.in_progress_cells_mut()
                        .remove(cell)
                        .map(|value| CachedDataItemValue::InProgressCell { value })
                })
                .flatten(),

            // AutoMultimap fields
            CachedDataItemKey::CellDependent { cell, task } => {
                let exists = self
                    .cell_dependents()
                    .and_then(|map| map.get(cell))
                    .is_some_and(|set| set.contains(task));
                if exists {
                    let map = self.cell_dependents_mut();
                    if let Some(set) = map.get_mut(cell) {
                        set.remove(task);
                        if set.is_empty() {
                            map.remove(cell);
                        }
                    }
                    Some(CachedDataItemValue::CellDependent { value: () })
                } else {
                    None
                }
            }
            CachedDataItemKey::CollectiblesDependent {
                collectible_type,
                task,
            } => {
                let exists = self
                    .collectibles_dependents()
                    .and_then(|map| map.get(collectible_type))
                    .is_some_and(|set| set.contains(task));
                if exists {
                    let map = self.collectibles_dependents_mut();
                    if let Some(set) = map.get_mut(collectible_type) {
                        set.remove(task);
                        if set.is_empty() {
                            map.remove(collectible_type);
                        }
                    }
                    Some(CachedDataItemValue::CollectiblesDependent { value: () })
                } else {
                    None
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
        original.cell_dependencies_mut().insert(CellRef {
            task: TaskId::new(1).unwrap(),
            cell: CellId {
                type_id: unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) },
                index: 0,
            },
        });

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

    #[test]
    fn test_serialize_helpers() {
        // Test the serialize_task_storage_meta/data helper functions
        let mut original = TaskStorage::new();
        original.set_aggregation_number(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        });
        original.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(42) }));
        original.flags.set_immutable(true);

        // Add some data-category items (output_dependent is in data category)
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(20) });
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(21) });

        // Serialize using helpers
        let meta_buffer =
            serialize_task_storage_meta(&original).expect("meta serialization failed");
        let data_buffer =
            serialize_task_storage_data(&original).expect("data serialization failed");

        // Decode into new storage
        let mut decoded = TaskStorage::new();
        {
            let mut decoder = new_decoder(&meta_buffer);
            decoded
                .decode_meta(&mut decoder)
                .expect("decode meta failed");
        }
        {
            let mut decoder = new_decoder(&data_buffer);
            decoded
                .decode_data(&mut decoder)
                .expect("decode data failed");
        }

        // Verify meta fields
        let agg = decoded
            .get_aggregation_number()
            .expect("missing aggregation_number");
        assert_eq!(agg.base, 10);
        assert_eq!(agg.distance, 5);
        assert_eq!(agg.effective, 15);
        assert!(decoded.get_output().is_some());
        assert!(decoded.flags.immutable());

        // Verify data fields
        assert_eq!(decoded.output_dependent().len(), 2);
        assert!(
            decoded
                .output_dependent()
                .contains(&unsafe { TaskId::new_unchecked(20) })
        );
        assert!(
            decoded
                .output_dependent()
                .contains(&unsafe { TaskId::new_unchecked(21) })
        );
    }

    // ==========================================================================
    // Schema Size Tests
    // ==========================================================================

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_schema_size() {
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

    // ==========================================================================
    // CachedDataItem Adapter Tests
    // ==========================================================================

    #[test]
    fn test_adapter_basic() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TaskStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test add for inline direct field (Output)
        let output_item = CachedDataItem::Output {
            value: OutputValue::Output(task1),
        };
        assert!(storage.add_cached_data_item(output_item.clone()));
        assert!(!storage.add_cached_data_item(output_item)); // Second add should return false

        // Test get for Output
        let key = CachedDataItemKey::Output {};
        assert!(storage.get_cached_data_item(&key).is_some());
        assert!(storage.contains_key(&key));

        // Test remove for Output
        let removed = storage.remove_cached_data_item(&key);
        assert!(matches!(removed, Some(CachedDataItemValue::Output { .. })));
        assert!(storage.get_cached_data_item(&key).is_none());

        // Test add for inline AutoSet field (OutputDependent)
        let dep_item = CachedDataItem::OutputDependent {
            task: task1,
            value: (),
        };
        assert!(storage.add_cached_data_item(dep_item.clone()));
        assert!(!storage.add_cached_data_item(dep_item)); // Already exists

        // Verify via typed accessor
        assert!(storage.output_dependent().contains(&task1));

        // Test add another
        let dep_item2 = CachedDataItem::OutputDependent {
            task: task2,
            value: (),
        };
        assert!(storage.add_cached_data_item(dep_item2));
        assert_eq!(storage.output_dependent().len(), 2);

        // Test remove OutputDependent
        let key = CachedDataItemKey::OutputDependent { task: task1 };
        let removed = storage.remove_cached_data_item(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::OutputDependent { value: () })
        ));
        assert_eq!(storage.output_dependent().len(), 1);
        assert!(!storage.output_dependent().contains(&task1));
        assert!(storage.output_dependent().contains(&task2));
    }

    #[test]
    fn test_adapter_flags() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TaskStorage::new();

        // Test flag field (Immutable)
        let immutable_item = CachedDataItem::Immutable { value: () };
        assert!(storage.add_cached_data_item(immutable_item.clone()));
        assert!(storage.flags.immutable());
        assert!(!storage.add_cached_data_item(immutable_item)); // Already set

        // Test get for flag
        let key = CachedDataItemKey::Immutable {};
        assert!(storage.get_cached_data_item(&key).is_some());

        // Test remove for flag
        let removed = storage.remove_cached_data_item(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::Immutable { value: () })
        ));
        assert!(!storage.flags.immutable());

        // Removing again should return None
        assert!(storage.remove_cached_data_item(&key).is_none());
    }

    #[test]
    fn test_adapter_counter_map() {
        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TaskStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test inline CounterMap field (Upper)
        let upper_item = CachedDataItem::Upper {
            task: task1,
            value: 5,
        };
        assert!(storage.add_cached_data_item(upper_item));
        assert_eq!(storage.upper().get(&task1), Some(&5));

        // Update the value (insert returns old value)
        let upper_update = CachedDataItem::Upper {
            task: task1,
            value: 10,
        };
        let old = storage.insert_cached_data_item(upper_update);
        assert!(matches!(old, Some(CachedDataItemValue::Upper { value: 5 })));
        assert_eq!(storage.upper().get(&task1), Some(&10));

        // Test lazy CounterMap field (Follower)
        let follower_item = CachedDataItem::Follower {
            task: task2,
            value: 3,
        };
        assert!(storage.add_cached_data_item(follower_item));
        assert_eq!(storage.followers().unwrap().get(&task2), Some(&3));

        // Test remove Follower
        let key = CachedDataItemKey::Follower { task: task2 };
        let removed = storage.remove_cached_data_item(&key);
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

        let mut storage = TaskStorage::new();
        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // Test lazy AutoSet field (Child)
        let child_item = CachedDataItem::Child {
            task: task1,
            value: (),
        };
        assert!(storage.add_cached_data_item(child_item));
        assert!(storage.children().is_some());
        assert!(storage.children().unwrap().contains(&task1));

        // Add another child
        let child_item2 = CachedDataItem::Child {
            task: task2,
            value: (),
        };
        assert!(storage.add_cached_data_item(child_item2));
        assert_eq!(storage.children().unwrap().len(), 2);

        // Test get
        let key = CachedDataItemKey::Child { task: task1 };
        assert!(storage.get_cached_data_item(&key).is_some());
        let key_missing = CachedDataItemKey::Child {
            task: unsafe { TaskId::new_unchecked(999) },
        };
        assert!(storage.get_cached_data_item(&key_missing).is_none());

        // Test remove
        let removed = storage.remove_cached_data_item(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::Child { value: () })
        ));
        assert_eq!(storage.children().unwrap().len(), 1);
        assert!(!storage.children().unwrap().contains(&task1));
    }

    #[test]
    fn test_adapter_multimap() {
        use turbo_tasks::ValueTypeId;

        use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue};

        let mut storage = TaskStorage::new();
        // CellId requires type_id and index
        let type_id = unsafe { ValueTypeId::new_unchecked(1) };
        let cell1 = CellId { type_id, index: 1 };
        let cell2 = CellId { type_id, index: 2 };
        let task1 = unsafe { TaskId::new_unchecked(10) };
        let task2 = unsafe { TaskId::new_unchecked(20) };
        let task3 = unsafe { TaskId::new_unchecked(30) };

        // Test AutoMultimap field (CellDependent)
        // Add task1 depending on cell1
        let item1 = CachedDataItem::CellDependent {
            cell: cell1,
            task: task1,
            value: (),
        };
        assert!(storage.add_cached_data_item(item1));

        // Add task2 depending on same cell1
        let item2 = CachedDataItem::CellDependent {
            cell: cell1,
            task: task2,
            value: (),
        };
        assert!(storage.add_cached_data_item(item2));

        // Add task3 depending on different cell2
        let item3 = CachedDataItem::CellDependent {
            cell: cell2,
            task: task3,
            value: (),
        };
        assert!(storage.add_cached_data_item(item3));

        // Verify via typed accessor
        let dependents = storage.cell_dependents().unwrap();
        assert_eq!(dependents.len(), 2); // Two cells
        assert_eq!(dependents.get(&cell1).unwrap().len(), 2);
        assert_eq!(dependents.get(&cell2).unwrap().len(), 1);

        // Test get
        let key = CachedDataItemKey::CellDependent {
            cell: cell1,
            task: task1,
        };
        assert!(storage.get_cached_data_item(&key).is_some());

        // Test remove one item from a cell with multiple dependents
        let removed = storage.remove_cached_data_item(&key);
        assert!(matches!(
            removed,
            Some(CachedDataItemValue::CellDependent { value: () })
        ));
        let dependents = storage.cell_dependents().unwrap();
        assert_eq!(dependents.get(&cell1).unwrap().len(), 1); // Still has task2

        // Remove the last dependent for cell2
        let key3 = CachedDataItemKey::CellDependent {
            cell: cell2,
            task: task3,
        };
        let removed = storage.remove_cached_data_item(&key3);
        assert!(removed.is_some());
        // After removing the only dependent, the cell entry should be removed
        let dependents = storage.cell_dependents().unwrap();
        assert!(dependents.get(&cell2).is_none());
    }
}
