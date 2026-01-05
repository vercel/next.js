//! New TaskStorage Design
//!
//! This module contains the design for the unified TaskStorage struct that replaces:
//! - TypedStorage (TaskData + TaskMeta)
//! - DynamicStorage (now empty, can be removed)
//! - InnerStorage wrapper
//!
//! Goals:
//! 1. Reduce per-task memory footprint from 256 bytes to ~130 bytes
//! 2. Remove iter_all/extend serialization overhead
//! 3. Simplify the codebase by removing DynamicStorage and CachedDataItem indirection

use bitfield::bitfield;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{
    CellId, SharedReference, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId,
};

use crate::data::{
    ActivenessState, AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness,
    InProgressCellState, InProgressState, OutputValue,
};

// =============================================================================
// BITFIELD FOR FLAGS AND STATE
// =============================================================================

bitfield! {
    /// Combined bitfield for task flags and restoration state.
    /// Using u16 gives us room for expansion while staying small.
    #[derive(Clone, Default)]
    pub struct TaskFlags(u16);
    impl Debug;

    // Task property flags (persisted)
    pub stateful, set_stateful: 0;
    pub invalidator, set_invalidator: 1;
    pub immutable, set_immutable: 2;

    // Restoration state (transient)
    pub meta_restored, set_meta_restored: 3;
    pub data_restored, set_data_restored: 4;

    // Modification tracking (transient)
    pub meta_modified, set_meta_modified: 5;
    pub data_modified, set_data_modified: 6;

    // Snapshot state (transient)
    pub meta_snapshot, set_meta_snapshot: 7;
    pub data_snapshot, set_data_snapshot: 8;

    // Prefetch state (transient)
    pub prefetched, set_prefetched: 9;

    // Session-dependent state (transient)
    pub current_session_clean, set_current_session_clean: 10;
}

// =============================================================================
// LAZY FIELD ENUM
// =============================================================================

/// All lazily-allocated fields stored in a single Vec.
/// Fields are stored directly (unboxed) to avoid allocation overhead.
///
/// The discriminant tells us:
/// - What field this is
/// - Whether it's persistent or transient (for serialization filtering)
/// - What category it belongs to (meta vs data)
///
/// Size analysis: FxHashMap/FxHashSet are 32 bytes when empty. With discriminant
/// and padding, the enum is ~40 bytes. This is better than boxing (16 bytes + 32 heap
/// + allocator overhead ~64 bytes total) for most use cases.
#[derive(Debug, Clone)]
pub enum LazyField {
    // === META CATEGORY - PERSISTENT ===
    /// Collectibles emitted by this task
    Collectibles(FxHashMap<CollectibleRef, i32>),
    /// Aggregated collectibles from subgraph
    AggregatedCollectibles(FxHashMap<CollectibleRef, i32>),
    /// Individual dirty containers in aggregated subgraph
    AggregatedDirtyContainers(FxHashMap<TaskId, i32>),
    /// Child tasks
    Children(FxHashSet<TaskId>),
    /// Follower nodes in aggregation tree
    Followers(FxHashMap<TaskId, u32>),
    /// Tasks that depend on collectibles of specific types
    CollectiblesDependents(FxHashMap<TraitTypeId, FxHashSet<TaskId>>),

    // === META CATEGORY - TRANSIENT ===
    /// Outdated collectibles to clean up
    OutdatedCollectibles(FxHashMap<CollectibleRef, i32>),
    /// Clean containers in current session
    AggregatedCurrentSessionCleanContainers(FxHashMap<TaskId, i32>),
    /// Activeness state for root/once tasks
    Activeness(ActivenessState),
    /// In-progress execution state
    InProgress(InProgressState),
    /// In-progress cell states
    InProgressCells(FxHashMap<CellId, InProgressCellState>),

    // === DATA CATEGORY - PERSISTENT ===
    /// Cell data (persistent)
    CellData(FxHashMap<CellId, TypedSharedReference>),
    /// Maximum cell index per cell type
    CellTypeMaxIndex(FxHashMap<ValueTypeId, u32>),
    /// Tasks that depend on specific cells
    CellDependents(FxHashMap<CellId, FxHashSet<TaskId>>),
    /// Output dependencies
    OutputDependencies(FxHashSet<TaskId>),
    /// Cell dependencies
    CellDependencies(FxHashSet<CellRef>),
    /// Collectibles dependencies
    CollectiblesDependencies(FxHashSet<CollectiblesRef>),

    // === DATA CATEGORY - TRANSIENT ===
    /// Transient cell data (not serializable)
    TransientCellData(FxHashMap<CellId, SharedReference>),
    /// Outdated output dependencies
    OutdatedOutputDependencies(FxHashSet<TaskId>),
    /// Outdated cell dependencies
    OutdatedCellDependencies(FxHashSet<CellRef>),
    /// Outdated collectibles dependencies
    OutdatedCollectiblesDependencies(FxHashSet<CollectiblesRef>),
}

impl LazyField {
    /// Returns true if this field should be persisted (not transient)
    pub fn is_persistent(&self) -> bool {
        matches!(
            self,
            LazyField::Collectibles(_)
                | LazyField::AggregatedCollectibles(_)
                | LazyField::AggregatedDirtyContainers(_)
                | LazyField::Children(_)
                | LazyField::Followers(_)
                | LazyField::CollectiblesDependents(_)
                | LazyField::CellData(_)
                | LazyField::CellTypeMaxIndex(_)
                | LazyField::CellDependents(_)
                | LazyField::OutputDependencies(_)
                | LazyField::CellDependencies(_)
                | LazyField::CollectiblesDependencies(_)
        )
    }

    /// Returns true if this field belongs to the Meta category
    pub fn is_meta(&self) -> bool {
        matches!(
            self,
            LazyField::Collectibles(_)
                | LazyField::AggregatedCollectibles(_)
                | LazyField::AggregatedDirtyContainers(_)
                | LazyField::Children(_)
                | LazyField::Followers(_)
                | LazyField::CollectiblesDependents(_)
                | LazyField::OutdatedCollectibles(_)
                | LazyField::AggregatedCurrentSessionCleanContainers(_)
                | LazyField::Activeness(_)
                | LazyField::InProgress(_)
                | LazyField::InProgressCells(_)
        )
    }

    /// Returns true if this field belongs to the Data category
    pub fn is_data(&self) -> bool {
        !self.is_meta()
    }

    /// Returns true if this field is empty and can be removed
    pub fn is_empty(&self) -> bool {
        match self {
            LazyField::Collectibles(m) => m.is_empty(),
            LazyField::AggregatedCollectibles(m) => m.is_empty(),
            LazyField::AggregatedDirtyContainers(m) => m.is_empty(),
            LazyField::Children(s) => s.is_empty(),
            LazyField::Followers(m) => m.is_empty(),
            LazyField::CollectiblesDependents(m) => m.is_empty(),
            LazyField::OutdatedCollectibles(m) => m.is_empty(),
            LazyField::AggregatedCurrentSessionCleanContainers(m) => m.is_empty(),
            LazyField::Activeness(_) => false, // Presence means non-empty
            LazyField::InProgress(_) => false, // Presence means non-empty
            LazyField::InProgressCells(m) => m.is_empty(),
            LazyField::CellData(m) => m.is_empty(),
            LazyField::CellTypeMaxIndex(m) => m.is_empty(),
            LazyField::CellDependents(m) => m.is_empty(),
            LazyField::OutputDependencies(s) => s.is_empty(),
            LazyField::CellDependencies(s) => s.is_empty(),
            LazyField::CollectiblesDependencies(s) => s.is_empty(),
            LazyField::TransientCellData(m) => m.is_empty(),
            LazyField::OutdatedOutputDependencies(s) => s.is_empty(),
            LazyField::OutdatedCellDependencies(s) => s.is_empty(),
            LazyField::OutdatedCollectiblesDependencies(s) => s.is_empty(),
        }
    }

    /// Get discriminant value for serialization
    pub fn discriminant(&self) -> u8 {
        // The discriminant is the position in the enum
        match self {
            LazyField::Collectibles(_) => 0,
            LazyField::AggregatedCollectibles(_) => 1,
            LazyField::AggregatedDirtyContainers(_) => 2,
            LazyField::Children(_) => 3,
            LazyField::Followers(_) => 4,
            LazyField::CollectiblesDependents(_) => 5,
            LazyField::OutdatedCollectibles(_) => 6,
            LazyField::AggregatedCurrentSessionCleanContainers(_) => 7,
            LazyField::Activeness(_) => 8,
            LazyField::InProgress(_) => 9,
            LazyField::InProgressCells(_) => 10,
            LazyField::CellData(_) => 11,
            LazyField::CellTypeMaxIndex(_) => 12,
            LazyField::CellDependents(_) => 13,
            LazyField::OutputDependencies(_) => 14,
            LazyField::CellDependencies(_) => 15,
            LazyField::CollectiblesDependencies(_) => 16,
            LazyField::TransientCellData(_) => 17,
            LazyField::OutdatedOutputDependencies(_) => 18,
            LazyField::OutdatedCellDependencies(_) => 19,
            LazyField::OutdatedCollectiblesDependencies(_) => 20,
        }
    }
}

// =============================================================================
// UNIFIED TASK STORAGE
// =============================================================================

/// Unified task storage combining all task data in a memory-efficient layout.
///
/// Size breakdown (estimated):
/// - output_dependent: 32 bytes (FxHashSet)
/// - aggregation_number: 16 bytes (Option<AggregationNumber>)
/// - output: 24 bytes (Option<OutputValue>)
/// - upper: 32 bytes (FxHashMap)
/// - flags: 2 bytes (u16 bitfield)
/// - dirty: ~8 bytes (Option<Dirtyness>)
/// - aggregated_dirty_container_count: 8 bytes (Option<i32> with padding)
/// - aggregated_current_session_clean_container_count: 8 bytes
/// - lazy: 24 bytes (Vec)
/// Total: ~154 bytes (vs 256 bytes current)
#[derive(Debug, Clone, Default)]
pub struct TaskStorage {
    // =========================================================================
    // SPECIALIZED FIELDS (hot path, always inline)
    // =========================================================================
    /// Tasks that depend on this task's output (data category, persistent)
    pub output_dependent: FxHashSet<TaskId>,

    /// The task's aggregation number (meta category, persistent)
    pub aggregation_number: Option<AggregationNumber>,

    /// The task's output value (meta category, persistent)
    pub output: Option<OutputValue>,

    /// Upper nodes in aggregation tree (meta category, persistent)
    pub upper: FxHashMap<TaskId, u32>,

    // =========================================================================
    // SMALL INLINE FIELDS
    // =========================================================================
    /// Combined flags and state bitfield
    pub flags: TaskFlags,

    /// Whether the task is dirty (meta category, persistent)
    pub dirty: Option<Dirtyness>,

    /// Count of dirty containers in aggregated subgraph (meta, persistent)
    pub aggregated_dirty_container_count: Option<i32>,

    /// Count of clean containers in current session (meta, transient)
    pub aggregated_current_session_clean_container_count: Option<i32>,

    // =========================================================================
    // LAZY FIELDS (allocated on demand)
    // =========================================================================
    /// All lazily-allocated fields in a single Vec
    pub lazy: Vec<LazyField>,
}

impl TaskStorage {
    pub fn new() -> Self {
        Self::default()
    }

    // =========================================================================
    // LAZY FIELD ACCESSORS
    // =========================================================================

    /// Find a lazy field by discriminant, returning a reference if found
    fn find_lazy<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<&T> {
        self.lazy.iter().find_map(extract)
    }

    /// Find a lazy field by discriminant, returning a mutable reference if found
    fn find_lazy_mut<T>(
        &mut self,
        extract: impl Fn(&mut LazyField) -> Option<&mut T>,
    ) -> Option<&mut T> {
        self.lazy.iter_mut().find_map(extract)
    }

    /// Get or create a lazy field, returning a mutable reference
    fn get_or_create_lazy<T>(
        &mut self,
        check: impl Fn(&LazyField) -> bool,
        extract: impl Fn(&mut LazyField) -> Option<&mut T>,
        create: impl FnOnce() -> LazyField,
    ) -> &mut T {
        // First check if it exists
        let idx = self.lazy.iter().position(|f| check(f));
        if let Some(idx) = idx {
            return extract(&mut self.lazy[idx]).unwrap();
        }
        // Create and add
        self.lazy.push(create());
        extract(self.lazy.last_mut().unwrap()).unwrap()
    }

    /// Remove a lazy field if it's empty
    fn remove_if_empty(&mut self, idx: usize) {
        if self.lazy[idx].is_empty() {
            self.lazy.swap_remove(idx);
        }
    }

    // =========================================================================
    // LAZY FIELD ACCESSORS - Generated pattern for each LazyField variant
    // =========================================================================

    // --- Collectibles (meta, persistent) ---
    pub fn collectibles(&self) -> Option<&FxHashMap<CollectibleRef, i32>> {
        self.find_lazy(|f| match f {
            LazyField::Collectibles(m) => Some(m),
            _ => None,
        })
    }

    pub fn collectibles_mut(&mut self) -> &mut FxHashMap<CollectibleRef, i32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::Collectibles(_)),
            |f| match f {
                LazyField::Collectibles(m) => Some(m),
                _ => None,
            },
            || LazyField::Collectibles(Default::default()),
        )
    }

    // --- AggregatedCollectibles (meta, persistent) ---
    pub fn aggregated_collectibles(&self) -> Option<&FxHashMap<CollectibleRef, i32>> {
        self.find_lazy(|f| match f {
            LazyField::AggregatedCollectibles(m) => Some(m),
            _ => None,
        })
    }

    pub fn aggregated_collectibles_mut(&mut self) -> &mut FxHashMap<CollectibleRef, i32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::AggregatedCollectibles(_)),
            |f| match f {
                LazyField::AggregatedCollectibles(m) => Some(m),
                _ => None,
            },
            || LazyField::AggregatedCollectibles(Default::default()),
        )
    }

    // --- AggregatedDirtyContainers (meta, persistent) ---
    pub fn aggregated_dirty_containers(&self) -> Option<&FxHashMap<TaskId, i32>> {
        self.find_lazy(|f| match f {
            LazyField::AggregatedDirtyContainers(m) => Some(m),
            _ => None,
        })
    }

    pub fn aggregated_dirty_containers_mut(&mut self) -> &mut FxHashMap<TaskId, i32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::AggregatedDirtyContainers(_)),
            |f| match f {
                LazyField::AggregatedDirtyContainers(m) => Some(m),
                _ => None,
            },
            || LazyField::AggregatedDirtyContainers(Default::default()),
        )
    }

    // --- Children (meta, persistent) ---
    pub fn children(&self) -> Option<&FxHashSet<TaskId>> {
        self.find_lazy(|f| match f {
            LazyField::Children(s) => Some(s),
            _ => None,
        })
    }

    pub fn children_mut(&mut self) -> &mut FxHashSet<TaskId> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::Children(_)),
            |f| match f {
                LazyField::Children(s) => Some(s),
                _ => None,
            },
            || LazyField::Children(Default::default()),
        )
    }

    // --- Followers (meta, persistent) ---
    pub fn followers(&self) -> Option<&FxHashMap<TaskId, u32>> {
        self.find_lazy(|f| match f {
            LazyField::Followers(m) => Some(m),
            _ => None,
        })
    }

    pub fn followers_mut(&mut self) -> &mut FxHashMap<TaskId, u32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::Followers(_)),
            |f| match f {
                LazyField::Followers(m) => Some(m),
                _ => None,
            },
            || LazyField::Followers(Default::default()),
        )
    }

    // --- CollectiblesDependents (meta, persistent) ---
    pub fn collectibles_dependents(&self) -> Option<&FxHashMap<TraitTypeId, FxHashSet<TaskId>>> {
        self.find_lazy(|f| match f {
            LazyField::CollectiblesDependents(m) => Some(m),
            _ => None,
        })
    }

    pub fn collectibles_dependents_mut(
        &mut self,
    ) -> &mut FxHashMap<TraitTypeId, FxHashSet<TaskId>> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CollectiblesDependents(_)),
            |f| match f {
                LazyField::CollectiblesDependents(m) => Some(m),
                _ => None,
            },
            || LazyField::CollectiblesDependents(Default::default()),
        )
    }

    // --- OutdatedCollectibles (meta, transient) ---
    pub fn outdated_collectibles(&self) -> Option<&FxHashMap<CollectibleRef, i32>> {
        self.find_lazy(|f| match f {
            LazyField::OutdatedCollectibles(m) => Some(m),
            _ => None,
        })
    }

    pub fn outdated_collectibles_mut(&mut self) -> &mut FxHashMap<CollectibleRef, i32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::OutdatedCollectibles(_)),
            |f| match f {
                LazyField::OutdatedCollectibles(m) => Some(m),
                _ => None,
            },
            || LazyField::OutdatedCollectibles(Default::default()),
        )
    }

    // --- AggregatedCurrentSessionCleanContainers (meta, transient) ---
    pub fn aggregated_current_session_clean_containers(&self) -> Option<&FxHashMap<TaskId, i32>> {
        self.find_lazy(|f| match f {
            LazyField::AggregatedCurrentSessionCleanContainers(m) => Some(m),
            _ => None,
        })
    }

    pub fn aggregated_current_session_clean_containers_mut(
        &mut self,
    ) -> &mut FxHashMap<TaskId, i32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::AggregatedCurrentSessionCleanContainers(_)),
            |f| match f {
                LazyField::AggregatedCurrentSessionCleanContainers(m) => Some(m),
                _ => None,
            },
            || LazyField::AggregatedCurrentSessionCleanContainers(Default::default()),
        )
    }

    // --- Activeness (meta, transient) - Option-like semantics ---
    pub fn activeness(&self) -> Option<&ActivenessState> {
        self.find_lazy(|f| match f {
            LazyField::Activeness(s) => Some(s),
            _ => None,
        })
    }

    pub fn activeness_mut(&mut self) -> Option<&mut ActivenessState> {
        self.find_lazy_mut(|f| match f {
            LazyField::Activeness(s) => Some(s),
            _ => None,
        })
    }

    pub fn set_activeness(&mut self, state: ActivenessState) {
        // Remove existing if any, then add new
        self.lazy.retain(|f| !matches!(f, LazyField::Activeness(_)));
        self.lazy.push(LazyField::Activeness(state));
    }

    pub fn take_activeness(&mut self) -> Option<ActivenessState> {
        let idx = self
            .lazy
            .iter()
            .position(|f| matches!(f, LazyField::Activeness(_)))?;
        match self.lazy.swap_remove(idx) {
            LazyField::Activeness(s) => Some(s),
            _ => unreachable!(),
        }
    }

    // --- InProgress (meta, transient) - Option-like semantics ---
    pub fn in_progress(&self) -> Option<&InProgressState> {
        self.find_lazy(|f| match f {
            LazyField::InProgress(s) => Some(s),
            _ => None,
        })
    }

    pub fn in_progress_mut(&mut self) -> Option<&mut InProgressState> {
        self.find_lazy_mut(|f| match f {
            LazyField::InProgress(s) => Some(s),
            _ => None,
        })
    }

    pub fn set_in_progress(&mut self, state: InProgressState) {
        self.lazy.retain(|f| !matches!(f, LazyField::InProgress(_)));
        self.lazy.push(LazyField::InProgress(state));
    }

    pub fn take_in_progress(&mut self) -> Option<InProgressState> {
        let idx = self
            .lazy
            .iter()
            .position(|f| matches!(f, LazyField::InProgress(_)))?;
        match self.lazy.swap_remove(idx) {
            LazyField::InProgress(s) => Some(s),
            _ => unreachable!(),
        }
    }

    // --- InProgressCells (meta, transient) ---
    pub fn in_progress_cells(&self) -> Option<&FxHashMap<CellId, InProgressCellState>> {
        self.find_lazy(|f| match f {
            LazyField::InProgressCells(m) => Some(m),
            _ => None,
        })
    }

    pub fn in_progress_cells_mut(&mut self) -> &mut FxHashMap<CellId, InProgressCellState> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::InProgressCells(_)),
            |f| match f {
                LazyField::InProgressCells(m) => Some(m),
                _ => None,
            },
            || LazyField::InProgressCells(Default::default()),
        )
    }

    // --- CellData (data, persistent) ---
    pub fn cell_data(&self) -> Option<&FxHashMap<CellId, TypedSharedReference>> {
        self.find_lazy(|f| match f {
            LazyField::CellData(m) => Some(m),
            _ => None,
        })
    }

    pub fn cell_data_mut(&mut self) -> &mut FxHashMap<CellId, TypedSharedReference> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CellData(_)),
            |f| match f {
                LazyField::CellData(m) => Some(m),
                _ => None,
            },
            || LazyField::CellData(Default::default()),
        )
    }

    // --- CellTypeMaxIndex (data, persistent) ---
    pub fn cell_type_max_index(&self) -> Option<&FxHashMap<ValueTypeId, u32>> {
        self.find_lazy(|f| match f {
            LazyField::CellTypeMaxIndex(m) => Some(m),
            _ => None,
        })
    }

    pub fn cell_type_max_index_mut(&mut self) -> &mut FxHashMap<ValueTypeId, u32> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CellTypeMaxIndex(_)),
            |f| match f {
                LazyField::CellTypeMaxIndex(m) => Some(m),
                _ => None,
            },
            || LazyField::CellTypeMaxIndex(Default::default()),
        )
    }

    // --- CellDependents (data, persistent) ---
    pub fn cell_dependents(&self) -> Option<&FxHashMap<CellId, FxHashSet<TaskId>>> {
        self.find_lazy(|f| match f {
            LazyField::CellDependents(m) => Some(m),
            _ => None,
        })
    }

    pub fn cell_dependents_mut(&mut self) -> &mut FxHashMap<CellId, FxHashSet<TaskId>> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CellDependents(_)),
            |f| match f {
                LazyField::CellDependents(m) => Some(m),
                _ => None,
            },
            || LazyField::CellDependents(Default::default()),
        )
    }

    // --- OutputDependencies (data, persistent) ---
    pub fn output_dependencies(&self) -> Option<&FxHashSet<TaskId>> {
        self.find_lazy(|f| match f {
            LazyField::OutputDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn output_dependencies_mut(&mut self) -> &mut FxHashSet<TaskId> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::OutputDependencies(_)),
            |f| match f {
                LazyField::OutputDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::OutputDependencies(Default::default()),
        )
    }

    // --- CellDependencies (data, persistent) ---
    pub fn cell_dependencies(&self) -> Option<&FxHashSet<CellRef>> {
        self.find_lazy(|f| match f {
            LazyField::CellDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn cell_dependencies_mut(&mut self) -> &mut FxHashSet<CellRef> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CellDependencies(_)),
            |f| match f {
                LazyField::CellDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::CellDependencies(Default::default()),
        )
    }

    // --- CollectiblesDependencies (data, persistent) ---
    pub fn collectibles_dependencies(&self) -> Option<&FxHashSet<CollectiblesRef>> {
        self.find_lazy(|f| match f {
            LazyField::CollectiblesDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn collectibles_dependencies_mut(&mut self) -> &mut FxHashSet<CollectiblesRef> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::CollectiblesDependencies(_)),
            |f| match f {
                LazyField::CollectiblesDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::CollectiblesDependencies(Default::default()),
        )
    }

    // --- TransientCellData (data, transient) ---
    pub fn transient_cell_data(&self) -> Option<&FxHashMap<CellId, SharedReference>> {
        self.find_lazy(|f| match f {
            LazyField::TransientCellData(m) => Some(m),
            _ => None,
        })
    }

    pub fn transient_cell_data_mut(&mut self) -> &mut FxHashMap<CellId, SharedReference> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::TransientCellData(_)),
            |f| match f {
                LazyField::TransientCellData(m) => Some(m),
                _ => None,
            },
            || LazyField::TransientCellData(Default::default()),
        )
    }

    // --- OutdatedOutputDependencies (data, transient) ---
    pub fn outdated_output_dependencies(&self) -> Option<&FxHashSet<TaskId>> {
        self.find_lazy(|f| match f {
            LazyField::OutdatedOutputDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn outdated_output_dependencies_mut(&mut self) -> &mut FxHashSet<TaskId> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::OutdatedOutputDependencies(_)),
            |f| match f {
                LazyField::OutdatedOutputDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::OutdatedOutputDependencies(Default::default()),
        )
    }

    // --- OutdatedCellDependencies (data, transient) ---
    pub fn outdated_cell_dependencies(&self) -> Option<&FxHashSet<CellRef>> {
        self.find_lazy(|f| match f {
            LazyField::OutdatedCellDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn outdated_cell_dependencies_mut(&mut self) -> &mut FxHashSet<CellRef> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::OutdatedCellDependencies(_)),
            |f| match f {
                LazyField::OutdatedCellDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::OutdatedCellDependencies(Default::default()),
        )
    }

    // --- OutdatedCollectiblesDependencies (data, transient) ---
    pub fn outdated_collectibles_dependencies(&self) -> Option<&FxHashSet<CollectiblesRef>> {
        self.find_lazy(|f| match f {
            LazyField::OutdatedCollectiblesDependencies(s) => Some(s),
            _ => None,
        })
    }

    pub fn outdated_collectibles_dependencies_mut(&mut self) -> &mut FxHashSet<CollectiblesRef> {
        self.get_or_create_lazy(
            |f| matches!(f, LazyField::OutdatedCollectiblesDependencies(_)),
            |f| match f {
                LazyField::OutdatedCollectiblesDependencies(s) => Some(s),
                _ => None,
            },
            || LazyField::OutdatedCollectiblesDependencies(Default::default()),
        )
    }

    // =========================================================================
    // SERIALIZATION (direct, no iter_all/CachedDataItem conversion)
    // =========================================================================

    /// Encode meta category fields directly to bincode
    pub fn encode_meta<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        // Specialized meta fields
        bincode::Encode::encode(&self.aggregation_number, encoder)?;
        bincode::Encode::encode(&self.output, encoder)?;
        bincode::Encode::encode(&self.upper, encoder)?;

        // Inline meta fields
        // Encode flags as persisted bits only
        let persisted_flags = self.flags.0 & 0b111; // stateful, invalidator, immutable
        bincode::Encode::encode(&persisted_flags, encoder)?;
        bincode::Encode::encode(&self.dirty, encoder)?;
        bincode::Encode::encode(&self.aggregated_dirty_container_count, encoder)?;

        // Lazy meta fields (persistent only)
        let meta_persistent_count = self
            .lazy
            .iter()
            .filter(|f| f.is_meta() && f.is_persistent())
            .count();
        bincode::Encode::encode(&(meta_persistent_count as u16), encoder)?;

        for field in &self.lazy {
            if field.is_meta() && field.is_persistent() {
                // Encode discriminant + data
                match field {
                    LazyField::Collectibles(m) => {
                        bincode::Encode::encode(&0u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::AggregatedCollectibles(m) => {
                        bincode::Encode::encode(&1u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::AggregatedDirtyContainers(m) => {
                        bincode::Encode::encode(&2u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::Children(s) => {
                        bincode::Encode::encode(&3u8, encoder)?;
                        bincode::Encode::encode(s, encoder)?;
                    }
                    LazyField::Followers(m) => {
                        bincode::Encode::encode(&4u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::CollectiblesDependents(m) => {
                        bincode::Encode::encode(&5u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    _ => {} // Skip transient fields
                }
            }
        }

        Ok(())
    }

    /// Encode data category fields directly to bincode
    pub fn encode_data<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        // Specialized data fields
        bincode::Encode::encode(&self.output_dependent, encoder)?;

        // Lazy data fields (persistent only)
        let data_persistent_count = self
            .lazy
            .iter()
            .filter(|f| f.is_data() && f.is_persistent())
            .count();
        bincode::Encode::encode(&(data_persistent_count as u16), encoder)?;

        for field in &self.lazy {
            if field.is_data() && field.is_persistent() {
                match field {
                    LazyField::CellData(m) => {
                        bincode::Encode::encode(&0u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::CellTypeMaxIndex(m) => {
                        bincode::Encode::encode(&1u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::CellDependents(m) => {
                        bincode::Encode::encode(&2u8, encoder)?;
                        bincode::Encode::encode(m, encoder)?;
                    }
                    LazyField::OutputDependencies(s) => {
                        bincode::Encode::encode(&3u8, encoder)?;
                        bincode::Encode::encode(s, encoder)?;
                    }
                    LazyField::CellDependencies(s) => {
                        bincode::Encode::encode(&4u8, encoder)?;
                        bincode::Encode::encode(s, encoder)?;
                    }
                    LazyField::CollectiblesDependencies(s) => {
                        bincode::Encode::encode(&5u8, encoder)?;
                        bincode::Encode::encode(s, encoder)?;
                    }
                    _ => {} // Skip transient fields
                }
            }
        }

        Ok(())
    }

    /// Decode meta category fields from bincode
    pub fn decode_meta<D: bincode::de::Decoder>(
        &mut self,
        decoder: &mut D,
    ) -> Result<(), bincode::error::DecodeError> {
        // Specialized meta fields
        self.aggregation_number = bincode::Decode::decode(decoder)?;
        self.output = bincode::Decode::decode(decoder)?;
        self.upper = bincode::Decode::decode(decoder)?;

        // Inline meta fields
        let persisted_flags: u16 = bincode::Decode::decode(decoder)?;
        // Only restore the persisted bits (0-2), leave transient bits (3+) as default
        self.flags.0 = (self.flags.0 & !0b111) | (persisted_flags & 0b111);
        self.dirty = bincode::Decode::decode(decoder)?;
        self.aggregated_dirty_container_count = bincode::Decode::decode(decoder)?;

        // Lazy meta fields
        let count: u16 = bincode::Decode::decode(decoder)?;
        for _ in 0..count {
            let discriminant: u8 = bincode::Decode::decode(decoder)?;
            let field = match discriminant {
                0 => LazyField::Collectibles(bincode::Decode::decode(decoder)?),
                1 => LazyField::AggregatedCollectibles(bincode::Decode::decode(decoder)?),
                2 => LazyField::AggregatedDirtyContainers(bincode::Decode::decode(decoder)?),
                3 => LazyField::Children(bincode::Decode::decode(decoder)?),
                4 => LazyField::Followers(bincode::Decode::decode(decoder)?),
                5 => LazyField::CollectiblesDependents(bincode::Decode::decode(decoder)?),
                _ => {
                    return Err(bincode::error::DecodeError::Other(
                        "Unknown meta lazy field discriminant",
                    ));
                }
            };
            self.lazy.push(field);
        }

        Ok(())
    }

    /// Decode data category fields from bincode
    pub fn decode_data<D: bincode::de::Decoder>(
        &mut self,
        decoder: &mut D,
    ) -> Result<(), bincode::error::DecodeError> {
        // Specialized data fields
        self.output_dependent = bincode::Decode::decode(decoder)?;

        // Lazy data fields
        let count: u16 = bincode::Decode::decode(decoder)?;
        for _ in 0..count {
            let discriminant: u8 = bincode::Decode::decode(decoder)?;
            let field = match discriminant {
                0 => LazyField::CellData(bincode::Decode::decode(decoder)?),
                1 => LazyField::CellTypeMaxIndex(bincode::Decode::decode(decoder)?),
                2 => LazyField::CellDependents(bincode::Decode::decode(decoder)?),
                3 => LazyField::OutputDependencies(bincode::Decode::decode(decoder)?),
                4 => LazyField::CellDependencies(bincode::Decode::decode(decoder)?),
                5 => LazyField::CollectiblesDependencies(bincode::Decode::decode(decoder)?),
                _ => {
                    return Err(bincode::error::DecodeError::Other(
                        "Unknown data lazy field discriminant",
                    ));
                }
            };
            self.lazy.push(field);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::mem::size_of;

    use super::*;

    #[test]
    fn test_task_storage_size() {
        println!("TaskStorage size: {} bytes", size_of::<TaskStorage>());
        println!("TaskFlags size: {} bytes", size_of::<TaskFlags>());
        println!("LazyField size: {} bytes", size_of::<LazyField>());
        println!("Vec<LazyField> size: {} bytes", size_of::<Vec<LazyField>>());

        // Target: < 160 bytes
        assert!(
            size_of::<TaskStorage>() < 180,
            "TaskStorage is {} bytes, should be < 180",
            size_of::<TaskStorage>()
        );
    }

    #[test]
    fn test_lazy_field_size() {
        // LazyField without boxing: discriminant + largest variant (FxHashMap = 32 bytes)
        // Expected size ~40 bytes
        println!("LazyField size: {} bytes", size_of::<LazyField>());
        assert!(
            size_of::<LazyField>() <= 48,
            "LazyField is {} bytes, should be <= 48",
            size_of::<LazyField>()
        );
    }

    #[test]
    fn check_variant_sizes_unboxed() {
        use crate::data::{ActivenessState, InProgressCellState, InProgressState};

        println!("\n=== LazyField Variant Sizes (If Unboxed) ===");
        println!(
            "FxHashMap<CollectibleRef, i32>: {} bytes",
            size_of::<FxHashMap<CollectibleRef, i32>>()
        );
        println!(
            "FxHashSet<TaskId>: {} bytes",
            size_of::<FxHashSet<TaskId>>()
        );
        println!(
            "FxHashMap<TaskId, u32>: {} bytes",
            size_of::<FxHashMap<TaskId, u32>>()
        );
        println!("ActivenessState: {} bytes", size_of::<ActivenessState>());
        println!("InProgressState: {} bytes", size_of::<InProgressState>());
        println!(
            "InProgressCellState: {} bytes",
            size_of::<InProgressCellState>()
        );

        // The largest variant determines LazyField size if unboxed
        let max_variant = [
            size_of::<FxHashMap<CollectibleRef, i32>>(),
            size_of::<FxHashSet<TaskId>>(),
            size_of::<ActivenessState>(),
            size_of::<InProgressState>(),
        ]
        .into_iter()
        .max()
        .unwrap();

        println!("\nMax variant size: {} bytes", max_variant);
        println!(
            "LazyField if unboxed would be: ~{} bytes (including discriminant)",
            max_variant + 8
        );
        println!(
            "Current (unboxed) LazyField: {} bytes",
            size_of::<LazyField>()
        );
        println!(
            "Difference per variant: {} bytes saved by boxing",
            max_variant + 8 - size_of::<LazyField>()
        );
    }

    // Note: Roundtrip test requires turbo_bincode helpers which have complex APIs.
    // The encode/decode methods are designed to be used with the project's bincode wrappers.
    // Testing will be done during integration when these replace the current implementation.
}
