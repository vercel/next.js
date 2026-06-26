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
use std::{
    hash::{BuildHasherDefault, Hash},
    sync::Arc,
};

use parking_lot::Mutex;
use rustc_hash::FxHasher;
use turbo_tasks::{
    CellId, SharedReference, TaskExecutionReason, TaskId, TinyVec, TraitTypeId, ValueTypeId,
    backend::{CachedTaskTypeArc, CellHash, TransientTaskType},
    event::Event,
    task_storage,
};

use crate::{
    backend::{cell_data::CellData, counter_map::CounterMap},
    data::{
        ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
        InProgressCellState, InProgressState, LeafDistance, OutputValue, RootType, TransientTask,
    },
};

type AutoSet<K, const I: usize> = auto_hash_map::AutoSet<K, BuildHasherDefault<FxHasher>, I>;

/// Auto-map storage for key-value pairs.
///
/// See [`AutoSet`] for the meaning of `I`.
type AutoMap<K, V, const I: usize> = auto_hash_map::AutoMap<K, V, BuildHasherDefault<FxHasher>, I>;

/// The complete task storage schema.
///
/// This struct defines all storage fields for a task. The `#[task_storage]` macro
/// transforms this schema into the actual implementation:
/// - `TaskStorage` struct with inline and lazy field storage
/// - `LazyField` enum for lazy-allocated fields
/// - `TaskFlags` bitfield for boolean flags
/// - Accessor methods and traits
///
/// Fields are stored lazily in `TinyVec<LazyField>` by default for memory efficiency.
/// Fields with `inline` are stored directly on TaskStorage (for hot-path access).
///
/// Note: This struct is consumed by the macro and does not appear in the output.
#[task_storage]
struct TaskStorageSchema {
    // =========================================================================
    // INLINE FIELDS (hot path, always allocated inline)
    // =========================================================================
    /// The task's distance for prioritizing invalidation execution
    #[field(storage = "direct", category = "data", inline, default)]
    leaf_distance: LeafDistance,

    /// The task's aggregation number for the aggregation tree.
    /// Uses Default::default() semantics - a zero aggregation number means "not set".

    #[field(storage = "direct", category = "meta", inline, default)]
    aggregation_number: AggregationNumber,

    /// Tasks that depend on this task's output.

    #[field(
        storage = "auto_set",
        category = "data",
        inline,
        filter_transient,
        drop_on_completion_if_immutable
    )]
    output_dependent: AutoSet<TaskId, 4>,

    /// The task's output value.
    /// Filtered during serialization to skip transient outputs (referencing transient tasks).
    #[field(storage = "direct", category = "meta", inline, filter_transient)]
    pub output: Option<OutputValue>,

    /// Upper nodes in the aggregation tree (reference counted).
    #[field(storage = "counter_map", category = "meta", inline, filter_transient)]
    upper: CounterMap<TaskId, u32, 2>,

    // =========================================================================
    // COLLECTIBLES (meta)
    // =========================================================================
    /// Collectibles emitted by this task (reference counted).
    #[field(
        storage = "counter_map",
        category = "meta",
        filter_transient,
        shrink_on_completion
    )]
    collectibles: CounterMap<CollectibleRef, i32, 1>,

    /// Aggregated collectibles from the subgraph.
    #[field(storage = "counter_map", category = "meta", filter_transient)]
    aggregated_collectibles: CounterMap<CollectibleRef, i32, 1>,

    /// Outdated collectibles to be cleaned up (transient).
    #[field(storage = "counter_map", category = "transient", shrink_on_completion)]
    outdated_collectibles: CounterMap<CollectibleRef, i32, 1>,

    // =========================================================================
    // STATE FIELDS (meta)
    // Note: Lazy direct fields use bare types - Vec presence provides optionality
    // =========================================================================
    /// Whether the task is dirty (needs re-execution).
    /// Absent = clean, present = dirty with the specified Dirtyness state.
    #[field(storage = "direct", category = "meta")]
    dirty: Dirtyness,

    /// Count of dirty containers in the aggregated subgraph.
    /// Absent = 0, present = actual count.
    #[field(storage = "direct", category = "meta")]
    aggregated_dirty_container_count: i32,

    /// Individual dirty containers in the aggregated subgraph.
    #[field(storage = "counter_map", category = "meta", filter_transient)]
    aggregated_dirty_containers: CounterMap<TaskId, i32, 3>,

    /// Count of clean containers in current session (transient).
    /// Absent = 0, present = actual count.
    #[field(storage = "direct", category = "transient")]
    aggregated_current_session_clean_container_count: i32,

    /// Individual clean containers in current session (transient).
    #[field(storage = "counter_map", category = "transient")]
    aggregated_current_session_clean_containers: CounterMap<TaskId, i32, 3>,

    // =========================================================================
    // FLAGS (meta) - Boolean flags stored in TaskFlags bitfield
    // Persisted flags come first, then transient flags.
    // =========================================================================
    /// Whether the task has an invalidator.
    #[field(storage = "flag", category = "data")]
    invalidator: bool,

    /// Whether the task output is immutable (persisted).
    #[field(storage = "flag", category = "data")]
    immutable: bool,

    /// Whether an optimization of the aggregation number for this task is pending.
    /// Set when an `OptimizeJob` for this task is dropped without being processed (because
    /// the in-memory `optimize_queue` was at capacity, or the `AggregationUpdateQueue` ran
    /// out of its optimization budget). Cleared by `optimize_task` when it actually runs.
    /// Persisted so that a dropped optimization is recovered after restart.
    #[field(storage = "flag", category = "meta")]
    optimization_pending: bool,

    /// Whether clean in current session (transient flag).
    #[field(storage = "flag", category = "transient")]
    current_session_clean: bool,

    // =========================================================================
    // INTERNAL STATE FLAGS (transient) - Replaces InnerStorageState
    // These flags track internal state for persistence and snapshotting.
    // =========================================================================
    /// Whether meta data has been restored from persistent storage.
    #[field(storage = "flag", category = "transient")]
    meta_restored: bool,

    /// Whether data has been restored from persistent storage.
    #[field(storage = "flag", category = "transient")]
    data_restored: bool,

    /// Whether meta data restoration is currently in progress by another thread.
    #[field(storage = "flag", category = "transient")]
    meta_restoring: bool,

    /// Whether data restoration is currently in progress by another thread.
    #[field(storage = "flag", category = "transient")]
    data_restoring: bool,

    /// Whether meta was modified before snapshot mode was entered.
    #[field(storage = "flag", category = "transient")]
    meta_modified: bool,

    /// Whether data was modified before snapshot mode was entered.
    #[field(storage = "flag", category = "transient")]
    data_modified: bool,

    /// Whether meta was modified after snapshot mode was entered (snapshot taken).
    #[field(storage = "flag", category = "transient")]
    meta_modified_during_snapshot: bool,

    /// Whether data was modified after snapshot mode was entered (snapshot taken).
    #[field(storage = "flag", category = "transient")]
    data_modified_during_snapshot: bool,

    /// Whether dependencies have been prefetched.
    #[field(storage = "flag", category = "transient")]
    prefetched: bool,

    /// Whether this task has allocated a State (has interior mutability).
    /// Only set when `verify_determinism`` feature is enabled.
    /// Used to skip determinism checks for stateful tasks.
    #[field(storage = "flag", category = "transient")]
    stateful: bool,

    /// Whether this task is new and needs its type persisted to the task cache.
    /// Set when task is created, cleared after persisting.
    #[field(storage = "flag", category = "transient")]
    pub new_task: bool,

    // =========================================================================
    // CHILDREN & AGGREGATION (meta)
    // =========================================================================
    /// Child tasks of this task.
    #[field(
        storage = "auto_set",
        category = "meta",
        filter_transient,
        shrink_on_completion
    )]
    children: AutoSet<TaskId, 6>,

    /// Follower nodes in the aggregation tree (reference counted).
    #[field(storage = "counter_map", category = "meta", filter_transient)]
    followers: CounterMap<TaskId, u32, 3>,

    // =========================================================================
    // DEPENDENCIES (data)
    // =========================================================================
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        shrink_on_completion,
        drop_on_completion_if_immutable
    )]
    output_dependencies: AutoSet<TaskId, 6>,

    /// Cells this task depends on as a whole (keyless `CellDependency::All`). The common case;
    /// kept separate from `cell_dependencies_hashed` so it stores a bare `CellRef` instead of the
    /// wider `CellDependency` enum (no tag, no `u64`).
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        shrink_on_completion,
        drop_on_completion_if_immutable
    )]
    cell_dependencies: AutoSet<CellRef, 2>,

    /// Cells this task depends on, narrowed to a hashed sub-value (`CellDependency::Hash`). Rare.
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        shrink_on_completion,
        drop_on_completion_if_immutable
    )]
    cell_dependencies_hashed: AutoSet<(CellRef, u64), 1>,

    /// Collectibles this task depends on.
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        shrink_on_completion,
        drop_on_completion_if_immutable
    )]
    collectibles_dependencies: AutoSet<CollectiblesRef, 3>,

    /// Outdated output dependencies to be cleaned up (transient).
    #[field(storage = "auto_set", category = "transient", shrink_on_completion)]
    outdated_output_dependencies: AutoSet<TaskId, 6>,

    /// Outdated keyless cell dependencies to be cleaned up (transient).
    #[field(storage = "auto_set", category = "transient", shrink_on_completion)]
    outdated_cell_dependencies: AutoSet<CellRef, 2>,

    /// Outdated hashed cell dependencies to be cleaned up (transient).
    #[field(storage = "auto_set", category = "transient", shrink_on_completion)]
    outdated_cell_dependencies_hashed: AutoSet<(CellRef, u64), 1>,

    /// Outdated collectibles dependencies to be cleaned up (transient).
    #[field(storage = "auto_set", category = "transient", shrink_on_completion)]
    outdated_collectibles_dependencies: AutoSet<CollectiblesRef, 3>,

    // =========================================================================
    // DEPENDENTS - Tasks that depend on this task's cells
    // =========================================================================
    /// Tasks that depend on this task's cells as a whole (keyless). Reverse of
    /// `cell_dependencies`. In a `cell_dependents` entry the `CellRef.task` field holds the
    /// DEPENDENT task's id and `CellRef.cell` is this task's cell (see `CellDependency` docs).
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        drop_on_completion_if_immutable
    )]
    cell_dependents: AutoSet<CellRef, 2>,

    /// Tasks that depend on a hashed sub-value of this task's cells. Reverse of
    /// `cell_dependencies_hashed`.
    #[field(
        storage = "auto_set",
        category = "data",
        filter_transient,
        drop_on_completion_if_immutable
    )]
    cell_dependents_hashed: AutoSet<(CellRef, u64), 1>,

    /// Tasks that depend on collectibles of a specific type from this task.
    /// Maps TraitTypeId -> Set<TaskId>

    #[field(storage = "auto_set", category = "meta", filter_transient)]
    collectibles_dependents: AutoSet<(TraitTypeId, TaskId), 3>,

    #[field(
        storage = "auto_map",
        category = "data",
        shrink_on_completion,
        custom_drop_partial,
        custom_mutators,
        as_type = "AutoMap<CellId, SharedReference, 1>"
    )]
    cell_data: CellData,

    /// Hash of transient cell data, persisted for hash-based change detection when
    /// transient data has been evicted from memory.
    ///
    /// Stored as `[u8; 16]` (little-endian bytes of a u128) rather than `u128` to keep
    /// the 1-byte alignment out of the `AutoMap` and therefore out of the `LazyField`
    /// enum; a bare `u128` would grow the enum from 56 to 64 bytes due to its 16-byte
    /// alignment requirement.
    #[field(storage = "auto_map", category = "data", shrink_on_completion)]
    cell_data_hash: AutoMap<CellId, CellHash, 1>,

    /// Maximum cell index per cell type.
    #[field(storage = "auto_map", category = "data", shrink_on_completion)]
    cell_type_max_index: AutoMap<ValueTypeId, u32, 3>,

    // =========================================================================
    // TRANSIENT EXECUTION STATE (transient)
    // =========================================================================
    /// Activeness state for root/once tasks (transient).
    #[field(storage = "direct", category = "transient")]
    activeness: ActivenessState,

    /// In-progress execution state (transient).
    #[field(storage = "direct", category = "transient")]
    in_progress: InProgressState,

    /// In-progress cell state for cells being computed (transient).
    #[field(storage = "auto_map", category = "transient", shrink_on_completion)]
    in_progress_cells: AutoMap<CellId, InProgressCellState, 1>,

    #[field(storage = "direct", category = "data", inline)]
    pub persistent_task_type: Option<CachedTaskTypeArc>,

    #[field(storage = "direct", category = "transient")]
    pub transient_task_type: Arc<TransientTask>,
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

    /// Check if the category's restoration is currently in progress by another thread
    pub fn is_restoring(&self, category: TaskDataCategory) -> bool {
        match category {
            TaskDataCategory::Meta => self.meta_restoring(),
            TaskDataCategory::Data => self.data_restoring(),
            TaskDataCategory::All => self.meta_restoring() || self.data_restoring(),
        }
    }

    /// Set or clear the restoring bits for the given category
    pub fn set_restoring(&mut self, category: TaskDataCategory, value: bool) {
        match category {
            TaskDataCategory::Meta => {
                self.set_meta_restoring(value);
            }
            TaskDataCategory::Data => {
                self.set_data_restoring(value);
            }
            TaskDataCategory::All => {
                self.set_meta_restoring(value);
                self.set_data_restoring(value);
            }
        }
    }

    /// Check if any snapshot flag is set
    pub fn any_modified_during_snapshot(&self) -> bool {
        self.meta_modified_during_snapshot() || self.data_modified_during_snapshot()
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
    pub fn is_modified_during_snapshot(&self, category: SpecificTaskDataCategory) -> bool {
        match category {
            SpecificTaskDataCategory::Meta => self.meta_modified_during_snapshot(),
            SpecificTaskDataCategory::Data => self.data_modified_during_snapshot(),
        }
    }

    /// Set the snapshot flag for the specified category
    pub fn set_modified_during_snapshot(
        &mut self,
        category: SpecificTaskDataCategory,
        value: bool,
    ) {
        match category {
            SpecificTaskDataCategory::Meta => self.set_meta_modified_during_snapshot(value),
            SpecificTaskDataCategory::Data => self.set_data_modified_during_snapshot(value),
        }
    }
}

// =============================================================================
// Eviction
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum UnevictableReason {
    // Either in progress or soon to be inprogress
    InProgress,
    /// Modified flags are set, or data/meta has not been restored yet.
    Modified,
    /// The task is transient
    Transient,
    // Keep `NothingToEvict` last: `COUNT` is derived from its discriminant.
    NothingToEvict,
}

impl UnevictableReason {
    /// All variants in discriminant order. Keep this in sync when adding variants —
    /// iteration and indexing rely on it covering every case.
    pub const ALL: [UnevictableReason; Self::COUNT] = [
        UnevictableReason::InProgress,
        UnevictableReason::Modified,
        UnevictableReason::Transient,
        UnevictableReason::NothingToEvict,
    ];

    /// Number of variants. Derived from the last variant's discriminant, so adding a
    /// new variant before `NothingToEvict` stays correct automatically.
    pub const COUNT: usize = (UnevictableReason::NothingToEvict as usize) + 1;

    #[inline]
    pub const fn index(self) -> usize {
        self as usize
    }

    /// Stable name used as a tracing span field. Matches the snake_case convention
    /// of the other span fields in `evict_after_snapshot`.
    pub const fn span_name(self) -> &'static str {
        match self {
            UnevictableReason::InProgress => "skipped_in_progress",
            UnevictableReason::Modified => "skipped_modified",
            UnevictableReason::Transient => "skipped_transient",
            UnevictableReason::NothingToEvict => "skipped_nothing_to_evict",
        }
    }
}

/// Eviction level for a task after a snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueEvictability {
    /// Task cannot be evicted.
    Unevictable(UnevictableReason),
    Evictable {
        meta: bool,
        data: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyEvictability {
    Evictable,
    /// The task was already removed from `task_cache` in a prior eviction cycle.
    AlreadyEvicted,
    /// This means the task is new, so we cannot evict it
    Unevictable,
}

impl TaskStorage {
    /// Determine the evictability level of this task based on its flags.
    ///
    /// This checks only the flags on the TaskStorage itself. The caller
    /// must additionally check that the task is not transient (via TaskId).
    pub fn evictability(&self) -> (KeyEvictability, ValueEvictability) {
        let flags = &self.flags;

        let key_evictability = if flags.new_task() {
            KeyEvictability::Unevictable
        } else {
            match &self.persistent_task_type {
                None => KeyEvictability::Unevictable,
                // strong_count == 1: only this TaskStorage holds this Arc, so no task_cache entry
                // references it. It must have been already evicted on a prior cycle.
                Some(arc) if arc.count() == 1 => KeyEvictability::AlreadyEvicted,
                Some(_) => KeyEvictability::Evictable,
            }
        };
        // === Absolute blockers ===
        if flags.new_task() {
            return (
                key_evictability,
                ValueEvictability::Unevictable(UnevictableReason::Modified),
            );
        }
        // All these flags imply that the task is currently being used in some way
        // either literally executing, or about to
        if self.get_in_progress().is_some()
            || self.get_activeness().is_some()
            // Without these checks we could corrupt racing reads.
            // Basically if a task restores ALL but data is already restored, then it will set meta_restoring, so it would break semantics to clear data_restored while that is happening.  We could fix it by adding a loop to the restoring threads but it is just much simpler to back off in this case.
            || flags.meta_restoring()
            || flags.data_restoring()
        {
            return (
                key_evictability,
                ValueEvictability::Unevictable(UnevictableReason::InProgress),
            );
        }
        debug_assert!(
            self.get_transient_task_type().is_none(),
            "only transient tasks can have transient_task_types so it cannot be set here"
        );

        // This is common after a round of eviction we end up with tasks with only transient state
        // There is no need to search for it, we can just assume any task in this state is preserved
        // for some reason.  NOTE: new tasks have the restored flags set as part of construction so
        // the only way for a task to end up in this situation is through eviction
        if !flags.data_restored() && !flags.meta_restored() {
            return (
                key_evictability,
                ValueEvictability::Unevictable(UnevictableReason::NothingToEvict),
            );
        }

        // === Data evictability (independent) ===
        // Data can be dropped if it's been restored from disk and hasn't been
        // modified.
        let data_evictable = flags.data_restored()
            && !flags.data_modified()
            && !flags.data_modified_during_snapshot();

        // === Meta evictability (independent) ===
        // Same semantics as data: flag checks only.
        let meta_evictable = flags.meta_restored()
            && !flags.meta_modified()
            && !flags.meta_modified_during_snapshot();

        // === Combined decision ===
        (
            key_evictability,
            if !data_evictable && !meta_evictable {
                ValueEvictability::Unevictable(UnevictableReason::Modified)
            } else {
                ValueEvictability::Evictable {
                    meta: meta_evictable,
                    data: data_evictable,
                }
            },
        )
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
    fn find_lazy_mut<T>(
        &mut self,
        extract: impl Fn(&mut LazyField) -> Option<&mut T>,
    ) -> Option<&mut T> {
        self.lazy.iter_mut().find_map(extract)
    }

    /// Find and extract a lazy field, returning its index and a reference to the inner value.
    ///
    /// Combines index lookup and extraction into a single scan. The returned index
    /// can be used with `lazy_at_mut` for subsequent mutation without re-scanning.
    fn find_lazy_ref<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<(usize, &T)> {
        self.lazy
            .iter()
            .enumerate()
            .find_map(|(idx, field)| extract(field).map(|val| (idx, val)))
    }

    /// Access a lazy field by index (mutable), extracting the inner value.
    ///
    /// # Panics
    /// Panics if `idx` is out of bounds or the extractor returns `None`.
    fn lazy_at_mut<T>(
        &mut self,
        idx: usize,
        extract: impl FnOnce(&mut LazyField) -> Option<&mut T>,
    ) -> &mut T {
        extract(&mut self.lazy[idx]).unwrap()
    }

    /// Take a lazy field by known index, removing it from the Vec via swap_remove.
    ///
    /// # Panics
    /// Panics if `idx` is out of bounds.
    fn lazy_take_at<T>(&mut self, idx: usize, extract: impl FnOnce(LazyField) -> T) -> T {
        extract(self.lazy.swap_remove(idx))
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

    /// Initialize a transient task with the given root type and activeness tracking.
    ///
    /// This sets up the activeness state for root/once tasks.
    /// Called when creating transient tasks via `create_transient_task`.
    pub fn init_transient_task(
        &mut self,
        task_id: TaskId,
        task_type: TransientTaskType,
        should_track_activeness: bool,
    ) {
        // Mark as fully restored since transient tasks don't need restoration from disk,
        // and as new since this task was just created.
        self.flags.set_restored(TaskDataCategory::All);

        // This is a root (or once) task. These tasks use the max aggregation number.
        self.aggregation_number = AggregationNumber {
            base: u32::MAX,
            distance: 0,
            effective: u32::MAX,
        };
        let root_type = match task_type {
            TransientTaskType::Root(_) => RootType::RootTask,
            TransientTaskType::Once(_) => RootType::OnceTask,
        };
        if should_track_activeness {
            let activeness = ActivenessState::new_root(root_type, task_id);
            self.lazy.push(LazyField::Activeness(activeness));
        }

        // Set the task as scheduled so it can be executed
        let done_event = Event::new(move || {
            move || match root_type {
                RootType::RootTask => "Root Task".to_string(),
                RootType::OnceTask => "Once Task".to_string(),
            }
        });
        self.set_transient_task_type(Arc::new(match task_type {
            TransientTaskType::Root(f) => TransientTask::Root(f),
            TransientTaskType::Once(f) => TransientTask::Once(Mutex::new(Some(f))),
        }));
        self.set_in_progress(InProgressState::Scheduled {
            done_event,
            reason: TaskExecutionReason::Root,
        });
    }

    /// Returns counts for aggregation tree and collectibles fields.
    /// Used for cache size statistics.
    #[cfg(feature = "print_cache_item_size")]
    pub fn meta_counts(&self) -> MetaCounts {
        MetaCounts {
            upper: self.upper().len(),
            collectibles: self.collectibles().map_or(0, |c| c.len()),
            aggregated_collectibles: self.aggregated_collectibles().map_or(0, |c| c.len()),
            children: self.children().map_or(0, |c| c.len()),
            followers: self.followers().map_or(0, |c| c.len()),
            collectibles_dependents: self.collectibles_dependents().map_or(0, |c| c.len()),
            aggregated_dirty_containers: self.aggregated_dirty_containers().map_or(0, |c| c.len()),
        }
    }
}

/// Counts for aggregation tree and collectibles fields.
#[cfg(feature = "print_cache_item_size")]
#[derive(Default)]
pub struct MetaCounts {
    pub upper: usize,
    pub collectibles: usize,
    pub aggregated_collectibles: usize,
    pub children: usize,
    pub followers: usize,
    pub collectibles_dependents: usize,
    pub aggregated_dirty_containers: usize,
}

// Support serialization filtering for CellDependents and CollectibleDependents

trait IsTransient {
    fn is_transient(&self) -> bool;
}

impl IsTransient for TaskId {
    fn is_transient(&self) -> bool {
        TaskId::is_transient(self)
    }
}

impl IsTransient for CollectibleRef {
    fn is_transient(&self) -> bool {
        CollectibleRef::is_transient(self)
    }
}
impl IsTransient for CollectiblesRef {
    fn is_transient(&self) -> bool {
        CollectiblesRef::is_transient(self)
    }
}
impl IsTransient for OutputValue {
    fn is_transient(&self) -> bool {
        OutputValue::is_transient(self)
    }
}
impl IsTransient for (TraitTypeId, TaskId) {
    fn is_transient(&self) -> bool {
        self.1.is_transient()
    }
}
impl IsTransient for CellRef {
    fn is_transient(&self) -> bool {
        CellRef::is_transient(self)
    }
}
impl IsTransient for (CellRef, u64) {
    fn is_transient(&self) -> bool {
        self.0.is_transient()
    }
}

/// Defines a strategy for merging data from disk into this storage item.
///
/// For most types this is a trivial `extend` call
pub(crate) trait MergeRestore {
    type Item;
    fn merge_restore(&mut self, items: impl IntoIterator<Item = Self::Item>);
}

impl<K, V, const I: usize> MergeRestore for CounterMap<K, V, I>
where
    K: Eq + Hash,
{
    type Item = (K, V);
    fn merge_restore(&mut self, items: impl IntoIterator<Item = Self::Item>) {
        self.extend(items)
    }
}
impl<V, const I: usize> MergeRestore for AutoSet<V, I>
where
    V: Eq + Hash,
{
    type Item = V;
    fn merge_restore(&mut self, items: impl IntoIterator<Item = Self::Item>) {
        self.extend(items)
    }
}

/// Outcome of a `drop_partial` call: did residue (transient entries that
/// can't be reconstructed from disk) survive the drop?
#[must_use]
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum DropPartialOutcome {
    /// Field is fully empty after the drop
    Empty,
    /// Transient entries remain — they cannot be reconstructed from disk
    /// and must be preserved through the eviction
    HasResidue,
}

/// Helper trait for drop_partial implementation. `CellData` and the
/// macro-generated `LazyField` arms also implement this trait so all
/// `filter_transient` / `custom_drop_partial` fields share one signature.
pub(crate) trait DropPartial {
    /// Drop persistent entries; preserve transient residue. Returns
    /// [`DropPartialOutcome`] so callers must explicitly distinguish the
    /// empty and residue cases.
    fn drop_partial(&mut self) -> DropPartialOutcome;
}

impl<T: IsTransient> DropPartial for Option<T> {
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.take_if(|v| !v.is_transient());
        if self.is_none() {
            DropPartialOutcome::Empty
        } else {
            DropPartialOutcome::HasResidue
        }
    }
}

impl<T: IsTransient + Hash + Eq, const I: usize> DropPartial for AutoSet<T, I> {
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.retain(|t| t.is_transient());
        if self.is_empty() {
            DropPartialOutcome::Empty
        } else {
            self.shrink_to_fit();
            DropPartialOutcome::HasResidue
        }
    }
}

impl<K: IsTransient + Hash + Eq, V: Eq, const I: usize> DropPartial for CounterMap<K, V, I> {
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.retain(|k, _v| k.is_transient());
        if self.is_empty() {
            DropPartialOutcome::Empty
        } else {
            self.shrink_to_fit();
            DropPartialOutcome::HasResidue
        }
    }
}
impl<K: IsTransient + Hash + Eq, V: IsTransient, const I: usize> DropPartial for AutoMap<K, V, I> {
    fn drop_partial(&mut self) -> DropPartialOutcome {
        self.retain(|k, v| k.is_transient() || v.is_transient());
        if self.is_empty() {
            DropPartialOutcome::Empty
        } else {
            self.shrink_to_fit();
            DropPartialOutcome::HasResidue
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
        // optimization_pending=bit 0 (meta, persisted)
        // invalidator=bit 1, immutable=bit 2 (data, persisted)
        // current_session_clean=bit 3 (transient)
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b110); // invalidator + immutable

        // Test TaskFlags constants
        assert_eq!(TaskFlags::PERSISTED_MASK, 0b111); // 3 persisted flags

        // Test set_persisted_bits preserves transient flags
        let mut storage2 = TaskStorage::new();
        storage2.flags.set_current_session_clean(true); // Set transient flag
        storage2.flags.set_persisted_bits(0b100); // Set immutable only
        assert!(storage2.flags.immutable());
        assert!(!storage2.flags.invalidator());
        assert!(!storage2.flags.optimization_pending());
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
        assert!(!storage.flags.meta_modified_during_snapshot());
        assert!(!storage.flags.data_modified_during_snapshot());
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
        storage.flags.set_meta_modified_during_snapshot(true);
        storage.flags.set_data_modified_during_snapshot(true);
        assert!(storage.flags.meta_modified_during_snapshot());
        assert!(storage.flags.data_modified_during_snapshot());

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
        assert_eq!(persisted, 0b100); // Only immutable (bit 2)
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

        // Note: invalidator and immutable are data category flags, not meta
        // They should NOT have changed during meta encode/decode
        assert!(!decoded.flags.invalidator()); // still default false
        assert!(!decoded.flags.immutable()); // still default false
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
            cell: CellId::new(unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) }, 0),
        });

        // Set lazy data transient field (should NOT be serialized)
        original
            .outdated_output_dependencies_mut()
            .insert(TaskId::new(999).unwrap());

        // Set data category flags (persisted)
        original.flags.set_invalidator(true);
        original.flags.set_immutable(true);

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

        // Verify data category flags were decoded
        assert!(decoded.flags.invalidator());
        assert!(decoded.flags.immutable());
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
    // drop_partial + restore_*_from round-trip with transient residue
    // ==========================================================================

    fn persistent_task(id: u32) -> TaskId {
        assert!(id & turbo_tasks::TRANSIENT_TASK_BIT == 0);
        TaskId::new(id).unwrap()
    }

    fn transient_task(id: u32) -> TaskId {
        TaskId::new(id | turbo_tasks::TRANSIENT_TASK_BIT).unwrap()
    }

    /// After `drop_partial(data=true)`, persistent entries in `filter_transient`
    /// data fields are cleared but transient residue must remain so transient
    /// dependents aren't silently lost. `restore_data_from` must then merge the
    /// persistent portion back in without clobbering the residue.
    #[test]
    fn drop_partial_retains_transient_residue_data() {
        let mut storage = TaskStorage::new();

        // Mix persistent and transient references in a filter_transient data field.
        storage.output_dependent_mut().insert(persistent_task(1));
        storage.output_dependent_mut().insert(persistent_task(2));
        storage.output_dependent_mut().insert(transient_task(3));

        // Lazy filter_transient data field.
        storage.cell_dependencies_mut().insert(CellRef {
            task: persistent_task(10),
            cell: CellId::new(unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) }, 0),
        });

        // Mark as restored so the task is eligible for dropping.
        storage.flags.set_data_restored(true);
        storage.flags.set_meta_restored(true);

        assert_eq!(
            DropPartialOutcome::HasResidue,
            storage.drop_partial(true, false)
        );

        // Persistent entries gone; transient residue preserved.
        assert!(!storage.output_dependent().contains(&persistent_task(1)));
        assert!(!storage.output_dependent().contains(&persistent_task(2)));
        assert!(storage.output_dependent().contains(&transient_task(3)));
        assert_eq!(storage.output_dependent().len(), 1);
        // Lazy non-filter-transient residue: cell_dependencies had only persistent
        // entries and should be dropped entirely.
        assert!(storage.cell_dependencies().is_none());
        // data_restored cleared; meta_restored untouched.
        assert!(!storage.flags.data_restored());
        assert!(storage.flags.meta_restored());

        // Simulate a restore from disk: source has the persistent entries only
        // (transient ones would have been filtered during encode).
        let mut source = TaskStorage::new();
        source.output_dependent_mut().insert(persistent_task(1));
        source.output_dependent_mut().insert(persistent_task(2));

        storage.restore_data_from(source);

        // After restore: persistent + transient should both be present.
        assert!(storage.output_dependent().contains(&persistent_task(1)));
        assert!(storage.output_dependent().contains(&persistent_task(2)));
        assert!(storage.output_dependent().contains(&transient_task(3)));
        assert_eq!(storage.output_dependent().len(), 3);
    }

    /// Same idea for meta: transient `upper` keys (a `CounterMap` residue) must
    /// survive the drop and merge cleanly with the persistent upper set on
    /// restore.
    #[test]
    fn drop_partial_retains_transient_residue_meta() {
        let mut storage = TaskStorage::new();

        storage.upper_mut().insert(persistent_task(1), 1);
        storage.upper_mut().insert(transient_task(2), 1);

        // Also populate a lazy filter_transient meta field.
        storage.children_mut().insert(persistent_task(100));
        storage.children_mut().insert(transient_task(200));

        storage.flags.set_data_restored(true);
        storage.flags.set_meta_restored(true);

        assert_eq!(
            DropPartialOutcome::HasResidue,
            storage.drop_partial(false, true)
        );

        // Inline upper: transient residue remains.
        assert_eq!(storage.upper().len(), 1);
        assert_eq!(storage.upper().get(&transient_task(2)), Some(&1));
        // Lazy children: transient residue remains.
        assert_eq!(storage.children().unwrap().len(), 1);
        assert!(storage.children().unwrap().contains(&transient_task(200)));
        assert!(!storage.flags.meta_restored());
        assert!(storage.flags.data_restored());

        // Restore persistent meta fields.
        let mut source = TaskStorage::new();
        source.upper_mut().insert(persistent_task(1), 1);
        source.children_mut().insert(persistent_task(100));

        storage.restore_meta_from(source);

        // After restore: residue + persistent are both present.
        assert_eq!(storage.upper().len(), 2);
        assert_eq!(storage.upper().get(&persistent_task(1)), Some(&1));
        assert_eq!(storage.upper().get(&transient_task(2)), Some(&1));
        assert_eq!(storage.children().unwrap().len(), 2);
        assert!(storage.children().unwrap().contains(&persistent_task(100)));
        assert!(storage.children().unwrap().contains(&transient_task(200)));
    }

    /// `drop_partial` on a field with no transient entries must fully reset the
    /// field to default — this is the hot path we optimized for.
    #[test]
    fn drop_partial_resets_fields_without_transients() {
        let mut storage = TaskStorage::new();

        storage.output_dependent_mut().insert(persistent_task(1));
        storage.output_dependent_mut().insert(persistent_task(2));
        storage.flags.set_data_restored(true);
        storage.flags.set_meta_restored(true);

        // Only persistent entries → no `filter_transient` residue, but the
        // `meta_restored` transient flag is still set (we only dropped the
        // data category), so the authoritative outcome is `HasResidue`.
        assert_eq!(
            DropPartialOutcome::HasResidue,
            storage.drop_partial(true, false)
        );

        assert!(storage.output_dependent().is_empty());
    }

    /// Regression: `drop_partial(true, true)` must clear persisted flag bits
    /// so a fully-evicted task reports `is_empty()`. Before this, tasks with
    /// persistent data flags (e.g. `invalidator`, `immutable`) would get stuck
    /// as `NothingToEvict` because `self.flags.0 != 0` even though all data
    /// had been dropped.
    #[test]
    fn drop_partial_clears_persisted_flags_so_is_empty() {
        let mut storage = TaskStorage::new();
        storage.flags.set_data_restored(true);
        storage.flags.set_meta_restored(true);
        storage.flags.set_invalidator(true);
        storage.flags.set_immutable(true);

        // Drop both categories → both `*_restored` transient flags are
        // cleared, persisted flag bits are cleared, no residue. Outcome is
        // `Empty` and the caller can erase the entry.
        assert_eq!(DropPartialOutcome::Empty, storage.drop_partial(true, true));

        assert!(!storage.flags.invalidator());
        assert!(!storage.flags.immutable());
        assert!(!storage.flags.data_restored());
        assert!(!storage.flags.meta_restored());
        assert!(
            storage.is_empty(),
            "fully evicted storage should be is_empty() so it can be removed from the shard"
        );
    }

    /// Filter-transient `output`: when `output` is `Some(transient)` it must
    /// survive `drop_partial(meta=true)` so restore can merge the disk value
    /// back in (normally disk value would be `None` if current output was
    /// transient at encode time).
    #[test]
    fn drop_partial_retains_transient_output() {
        let mut storage = TaskStorage::new();
        storage.set_output(OutputValue::Output(transient_task(1)));
        storage.flags.set_data_restored(true);
        storage.flags.set_meta_restored(true);

        // Filter-transient `output` keeps its transient value → residue.
        assert_eq!(
            DropPartialOutcome::HasResidue,
            storage.drop_partial(false, true)
        );

        // Transient output retained.
        assert_eq!(
            storage.get_output(),
            Some(&OutputValue::Output(transient_task(1)))
        );
    }

    // ==========================================================================
    // cell_data custom_drop_partial dispatch
    // ==========================================================================

    mod cell_data_drop_partial {
        //! End-to-end: verify `TaskStorage::drop_partial` dispatches to
        //! `CellData::drop_partial`, and that `restore_data_from` merges the
        //! retained residue with incoming persistent entries instead of
        //! clobbering it. The per-variant partitioning is covered in
        //! `cell_data.rs` — here we only need one non-recoverable entry as
        //! residue and one recoverable entry to be dropped.
        use turbo_tasks::{self as turbo_tasks, VcValueType};

        use super::*;

        #[turbo_tasks::value]
        struct Keepable(#[allow(dead_code)] u32);

        #[turbo_tasks::value(serialization = "skip", evict = "last")]
        struct KeepMe(
            #[turbo_tasks(trace_ignore)]
            #[allow(dead_code)]
            u32,
        );

        fn dummy_ref() -> SharedReference {
            SharedReference::new(triomphe::Arc::new(0u32))
        }

        fn keepable_cell(index: u32) -> CellId {
            CellId::new(Keepable::get_value_type_id(), index)
        }

        fn keep_me_cell(index: u32) -> CellId {
            CellId::new(KeepMe::get_value_type_id(), index)
        }

        #[test]
        fn drop_partial_retains_non_recoverable_entries() {
            let mut storage = TaskStorage::new();
            storage
                .cell_data_mut()
                .insert(keepable_cell(0), dummy_ref());
            storage.cell_data_mut().insert(keep_me_cell(1), dummy_ref());
            storage.flags.set_data_restored(true);
            storage.flags.set_meta_restored(true);

            // KeepMe is `evict = "last"` → non-recoverable → retained as
            // residue.
            assert_eq!(
                DropPartialOutcome::HasResidue,
                storage.drop_partial(true, false)
            );

            let cells = storage.cell_data().expect("residue keeps the variant");
            assert_eq!(cells.len(), 1);
            assert!(cells.contains_key(&keep_me_cell(1)));
            assert!(!cells.contains_key(&keepable_cell(0)));
        }

        #[test]
        fn drop_partial_removes_variant_when_all_recoverable() {
            let mut storage = TaskStorage::new();
            storage
                .cell_data_mut()
                .insert(keepable_cell(0), dummy_ref());
            storage.flags.set_data_restored(true);
            storage.flags.set_meta_restored(true);

            assert_eq!(
                DropPartialOutcome::HasResidue,
                storage.drop_partial(true, false)
            );

            assert!(
                storage.cell_data().is_none(),
                "variant is dropped when drop_partial empties it"
            );
        }

        #[test]
        fn restore_merges_residue_with_incoming() {
            let mut storage = TaskStorage::new();
            storage
                .cell_data_mut()
                .insert(keepable_cell(0), dummy_ref());
            storage.cell_data_mut().insert(keep_me_cell(1), dummy_ref());
            storage.flags.set_data_restored(true);
            storage.flags.set_meta_restored(true);

            assert_eq!(
                DropPartialOutcome::HasResidue,
                storage.drop_partial(true, false)
            );
            // Only KeepMe entry survives.
            assert_eq!(storage.cell_data().unwrap().len(), 1);

            // Simulate a restore: disk had only the persistable entry.
            let mut source = TaskStorage::new();
            source.cell_data_mut().insert(keepable_cell(0), dummy_ref());

            storage.restore_data_from(source);

            let cells = storage
                .cell_data()
                .expect("residue + incoming both present");
            assert_eq!(cells.len(), 2);
            assert!(cells.contains_key(&keepable_cell(0)));
            assert!(cells.contains_key(&keep_me_cell(1)));
        }

        #[test]
        fn drop_partial_meta_does_not_touch_cell_data() {
            let mut storage = TaskStorage::new();
            storage
                .cell_data_mut()
                .insert(keepable_cell(0), dummy_ref());
            storage.flags.set_data_restored(true);
            storage.flags.set_meta_restored(true);

            // Meta-only drop doesn't touch `cell_data` (data category), so
            // the data category stays non-empty → `HasResidue`.
            assert_eq!(
                DropPartialOutcome::HasResidue,
                storage.drop_partial(false, true)
            );

            // cell_data is category=data; meta-only drop leaves it alone.
            assert_eq!(storage.cell_data().unwrap().len(), 1);
        }
    }

    // ==========================================================================
    // Schema Size Tests
    // ==========================================================================

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_schema_size() {
        assert_eq!(
            size_of::<TaskStorage>(),
            128,
            "TaskStorage size changed! Run print_schema_sizes and update this test."
        );
        // `LazyField` is 48 B = 40 B largest payload + 8 B discriminant.
        assert_eq!(
            size_of::<LazyField>(),
            48,
            "LazyField size changed! Run print_schema_sizes and update this test."
        );
    }
}
