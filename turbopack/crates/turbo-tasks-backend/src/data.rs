use std::cmp::Ordering;

use serde::{Deserialize, Serialize};
use turbo_tasks::{
    event::{Event, EventListener},
    registry,
    util::SharedError,
    CellId, KeyValuePair, SessionId, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId,
};

use crate::backend::{indexed::Indexed, TaskDataCategory};

// this traits are needed for the transient variants of `CachedDataItem`
// transient variants are never cloned or compared
macro_rules! transient_traits {
    ($name:ident) => {
        impl Clone for $name {
            fn clone(&self) -> Self {
                // this impl is needed for the transient variants of `CachedDataItem`
                // transient variants are never cloned
                panic!(concat!(stringify!($name), " cannot be cloned"));
            }
        }

        impl PartialEq for $name {
            fn eq(&self, _other: &Self) -> bool {
                panic!(concat!(stringify!($name), " cannot be compared"));
            }
        }
    };
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct CellRef {
    pub task: TaskId,
    pub cell: CellId,
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectibleRef {
    pub collectible_type: TraitTypeId,
    pub cell: CellRef,
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectiblesRef {
    pub task: TaskId,
    pub collectible_type: TraitTypeId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputValue {
    Cell(CellRef),
    Output(TaskId),
    Error,
    Panic,
}
impl OutputValue {
    fn is_transient(&self) -> bool {
        match self {
            OutputValue::Cell(cell) => cell.task.is_transient(),
            OutputValue::Output(task) => task.is_transient(),
            OutputValue::Error => false,
            OutputValue::Panic => false,
        }
    }
}

#[derive(Debug)]
pub struct RootState {
    pub ty: ActiveType,
    pub all_clean_event: Event,
}

impl RootState {
    pub fn new(ty: ActiveType, id: TaskId) -> Self {
        Self {
            ty,
            all_clean_event: Event::new(move || format!("RootState::all_clean_event {:?}", id)),
        }
    }
}

transient_traits!(RootState);

impl Eq for RootState {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct DirtyState {
    pub clean_in_session: Option<SessionId>,
}

impl DirtyState {
    pub fn get(&self, session: SessionId) -> bool {
        self.clean_in_session != Some(session)
    }
}

fn add_with_diff(v: &mut i32, u: i32) -> i32 {
    let old = *v;
    *v += u;
    if old <= 0 && *v > 0 {
        1
    } else if old > 0 && *v <= 0 {
        -1
    } else {
        0
    }
}

/// Represents a count of dirty containers. Since dirtyness can be session dependent, there might be
/// a different count for a specific session. It only need to store the highest session count, since
/// old sessions can't be visited again, so we can ignore their counts.
#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DirtyContainerCount {
    pub count: i32,
    pub count_in_session: Option<(SessionId, i32)>,
}

impl DirtyContainerCount {
    /// Get the count for a specific session. It's only expected to be asked for the current
    /// session, since old session counts might be dropped.
    pub fn get(&self, session: SessionId) -> i32 {
        if let Some((s, count)) = self.count_in_session {
            if s == session {
                return count;
            }
        }
        self.count
    }

    /// Increase/decrease the count by the given value.
    pub fn update(&mut self, count: i32) -> DirtyContainerCount {
        self.update_count(&DirtyContainerCount {
            count,
            count_in_session: None,
        })
    }

    /// Increase/decrease the count by the given value, but does not update the count for a specific
    /// session. This matches the "dirty, but clean in one session" behavior.
    pub fn update_session_dependent(
        &mut self,
        ignore_session: SessionId,
        count: i32,
    ) -> DirtyContainerCount {
        self.update_count(&DirtyContainerCount {
            count,
            count_in_session: Some((ignore_session, 0)),
        })
    }

    /// Adds the `count` to the current count. This correctly handles session dependent counts.
    /// Returns a new count object that represents the aggregated count. The aggregated count will
    /// be +1 when the self count changes from <= 0 to > 0 and -1 when the self count changes from >
    /// 0 to <= 0. The same for the session dependent count.
    pub fn update_count(&mut self, count: &DirtyContainerCount) -> DirtyContainerCount {
        let mut diff = DirtyContainerCount::default();
        match (
            self.count_in_session.as_mut(),
            count.count_in_session.as_ref(),
        ) {
            (None, None) => {}
            (Some((s, c)), None) => {
                let d = add_with_diff(c, count.count);
                diff.count_in_session = Some((*s, d));
            }
            (None, Some((s, c))) => {
                let mut new = self.count;
                let d = add_with_diff(&mut new, *c);
                self.count_in_session = Some((*s, new));
                diff.count_in_session = Some((*s, d));
            }
            (Some((s1, c1)), Some((s2, c2))) => match (*s1).cmp(s2) {
                Ordering::Less => {
                    let mut new = self.count;
                    let d = add_with_diff(&mut new, *c2);
                    self.count_in_session = Some((*s2, new));
                    diff.count_in_session = Some((*s2, d));
                }
                Ordering::Equal => {
                    let d = add_with_diff(c1, *c2);
                    diff.count_in_session = Some((*s1, d));
                }
                Ordering::Greater => {
                    let d = add_with_diff(c1, count.count);
                    diff.count_in_session = Some((*s1, d));
                }
            },
        }
        let d = add_with_diff(&mut self.count, count.count);
        diff.count = d;
        diff
    }

    /// Applies a dirty state to the count. Returns an aggregated count that represents the change.
    pub fn update_with_dirty_state(&mut self, dirty: &DirtyState) -> DirtyContainerCount {
        if let Some(clean_in_session) = dirty.clean_in_session {
            self.update_session_dependent(clean_in_session, 1)
        } else {
            self.update(1)
        }
    }

    /// Undoes the effect of a dirty state on the count. Returns an aggregated count that represents
    /// the change.
    pub fn undo_update_with_dirty_state(&mut self, dirty: &DirtyState) -> DirtyContainerCount {
        if let Some(clean_in_session) = dirty.clean_in_session {
            self.update_session_dependent(clean_in_session, -1)
        } else {
            self.update(-1)
        }
    }

    /// Replaces the old dirty state with the new one. Returns an aggregated count that represents
    /// the change.
    pub fn replace_dirty_state(
        &mut self,
        old: &DirtyState,
        new: &DirtyState,
    ) -> DirtyContainerCount {
        let mut diff = self.undo_update_with_dirty_state(old);
        diff.update_count(&self.update_with_dirty_state(new));
        diff
    }

    /// Returns true if the count is zero and appling it would have no effect
    pub fn is_zero(&self) -> bool {
        self.count == 0 && self.count_in_session.map(|(_, c)| c == 0).unwrap_or(true)
    }

    /// Negates the counts.
    pub fn negate(&self) -> Self {
        Self {
            count: -self.count,
            count_in_session: self.count_in_session.map(|(s, c)| (s, -c)),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ActiveType {
    RootTask,
    OnceTask,
    /// The aggregated task graph was scheduled because it has reached an AggregatedRoot while
    /// propagating the dirty container or is read strongly consistent. This state is reset when
    /// all this sub graph becomes clean again.
    CachedActiveUntilClean,
}

#[derive(Debug)]
pub enum InProgressState {
    Scheduled {
        done_event: Event,
    },
    InProgress {
        stale: bool,
        #[allow(dead_code)]
        once_task: bool,
        session_dependent: bool,
        done_event: Event,
    },
}

transient_traits!(InProgressState);

impl Eq for InProgressState {}

#[derive(Debug)]
pub struct InProgressCellState {
    pub event: Event,
}

transient_traits!(InProgressCellState);

impl Eq for InProgressCellState {}

impl InProgressCellState {
    pub fn new(task_id: TaskId, cell: CellId) -> Self {
        InProgressCellState {
            event: Event::new(move || {
                format!("InProgressCellState::event ({} {:?})", task_id, cell)
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AggregationNumber {
    pub base: u32,
    pub distance: u32,
    pub effective: u32,
}

#[derive(Debug, Clone, KeyValuePair, Serialize, Deserialize)]
pub enum CachedDataItem {
    // Output
    Output {
        value: OutputValue,
    },
    Collectible {
        collectible: CollectibleRef,
        value: i32,
    },

    // State
    Dirty {
        value: DirtyState,
    },

    // Children
    Child {
        task: TaskId,
        value: (),
    },
    ChildrenCount {
        value: u32,
    },

    // Cells
    CellData {
        cell: CellId,
        value: TypedSharedReference,
    },
    CellTypeMaxIndex {
        cell_type: ValueTypeId,
        value: u32,
    },

    // Dependencies
    OutputDependency {
        target: TaskId,
        value: (),
    },
    CellDependency {
        target: CellRef,
        value: (),
    },
    CollectiblesDependency {
        target: CollectiblesRef,
        value: (),
    },

    // Dependent
    OutputDependent {
        task: TaskId,
        value: (),
    },
    CellDependent {
        cell: CellId,
        task: TaskId,
        value: (),
    },
    CollectiblesDependent {
        collectible_type: TraitTypeId,
        task: TaskId,
        value: (),
    },

    // Aggregation Graph
    AggregationNumber {
        value: AggregationNumber,
    },
    Follower {
        task: TaskId,
        value: i32,
    },
    Upper {
        task: TaskId,
        value: i32,
    },
    PersistentUpperCount {
        // Only counting persistent tasks
        value: u32,
    },

    // Aggregated Data
    AggregatedDirtyContainer {
        task: TaskId,
        value: DirtyContainerCount,
    },
    AggregatedCollectible {
        collectible: CollectibleRef,
        value: i32,
    },
    AggregatedDirtyContainerCount {
        value: DirtyContainerCount,
    },

    // Transient Root Type
    #[serde(skip)]
    AggregateRoot {
        value: RootState,
    },

    // Transient In Progress state
    #[serde(skip)]
    InProgress {
        value: InProgressState,
    },
    #[serde(skip)]
    InProgressCell {
        cell: CellId,
        value: InProgressCellState,
    },
    #[serde(skip)]
    OutdatedCollectible {
        collectible: CollectibleRef,
        value: i32,
    },
    #[serde(skip)]
    OutdatedOutputDependency {
        target: TaskId,
        value: (),
    },
    #[serde(skip)]
    OutdatedCellDependency {
        target: CellRef,
        value: (),
    },
    #[serde(skip)]
    OutdatedCollectiblesDependency {
        target: CollectiblesRef,
        value: (),
    },
    #[serde(skip)]
    OutdatedChild {
        task: TaskId,
        value: (),
    },

    // Transient Error State
    #[serde(skip)]
    Error {
        value: SharedError,
    },
}

impl CachedDataItem {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItem::Output { value } => value.is_transient(),
            CachedDataItem::Collectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItem::Dirty { .. } => true,
            CachedDataItem::Child { task, .. } => !task.is_transient(),
            CachedDataItem::ChildrenCount { .. } => true,
            CachedDataItem::CellData { .. } => true,
            CachedDataItem::CellTypeMaxIndex { .. } => true,
            CachedDataItem::OutputDependency { target, .. } => !target.is_transient(),
            CachedDataItem::CellDependency { target, .. } => !target.task.is_transient(),
            CachedDataItem::CollectiblesDependency { target, .. } => !target.task.is_transient(),
            CachedDataItem::OutputDependent { task, .. } => !task.is_transient(),
            CachedDataItem::CellDependent { task, .. } => !task.is_transient(),
            CachedDataItem::CollectiblesDependent { task, .. } => !task.is_transient(),
            CachedDataItem::AggregationNumber { .. } => true,
            CachedDataItem::Follower { task, .. } => !task.is_transient(),
            CachedDataItem::Upper { task, .. } => !task.is_transient(),
            CachedDataItem::PersistentUpperCount { .. } => true,
            CachedDataItem::AggregatedDirtyContainer { task, .. } => !task.is_transient(),
            CachedDataItem::AggregatedCollectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItem::AggregatedDirtyContainerCount { .. } => true,
            CachedDataItem::AggregateRoot { .. } => false,
            CachedDataItem::InProgress { .. } => false,
            CachedDataItem::InProgressCell { .. } => false,
            CachedDataItem::OutdatedCollectible { .. } => false,
            CachedDataItem::OutdatedOutputDependency { .. } => false,
            CachedDataItem::OutdatedCellDependency { .. } => false,
            CachedDataItem::OutdatedCollectiblesDependency { .. } => false,
            CachedDataItem::OutdatedChild { .. } => false,
            CachedDataItem::Error { .. } => false,
        }
    }

    pub fn new_scheduled(description: impl Fn() -> String + Sync + Send + 'static) -> Self {
        CachedDataItem::InProgress {
            value: InProgressState::Scheduled {
                done_event: Event::new(move || format!("{} done_event", description())),
            },
        }
    }

    pub fn new_scheduled_with_listener(
        description: impl Fn() -> String + Sync + Send + 'static,
        note: impl Fn() -> String + Sync + Send + 'static,
    ) -> (Self, EventListener) {
        let done_event = Event::new(move || format!("{} done_event", description()));
        let listener = done_event.listen_with_note(note);
        (
            CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event },
            },
            listener,
        )
    }

    pub fn category(&self) -> TaskDataCategory {
        match self {
            Self::Collectible { .. }
            | Self::Child { .. }
            | Self::ChildrenCount { .. }
            | Self::CellData { .. }
            | Self::CellTypeMaxIndex { .. }
            | Self::OutputDependency { .. }
            | Self::CellDependency { .. }
            | Self::CollectiblesDependency { .. }
            | Self::OutputDependent { .. }
            | Self::CellDependent { .. }
            | Self::CollectiblesDependent { .. } => TaskDataCategory::Data,

            Self::Output { .. }
            | Self::AggregationNumber { .. }
            | Self::Dirty { .. }
            | Self::Follower { .. }
            | Self::Upper { .. }
            | Self::PersistentUpperCount { .. }
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::OutdatedChild { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Error { .. }
            | Self::AggregateRoot { .. } => TaskDataCategory::All,
        }
    }
}

impl CachedDataItemKey {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItemKey::Output { .. } => true,
            CachedDataItemKey::Collectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItemKey::Dirty { .. } => true,
            CachedDataItemKey::Child { task, .. } => !task.is_transient(),
            CachedDataItemKey::ChildrenCount {} => true,
            CachedDataItemKey::CellData { .. } => true,
            CachedDataItemKey::CellTypeMaxIndex { .. } => true,
            CachedDataItemKey::OutputDependency { target, .. } => !target.is_transient(),
            CachedDataItemKey::CellDependency { target, .. } => !target.task.is_transient(),
            CachedDataItemKey::CollectiblesDependency { target, .. } => !target.task.is_transient(),
            CachedDataItemKey::OutputDependent { task, .. } => !task.is_transient(),
            CachedDataItemKey::CellDependent { task, .. } => !task.is_transient(),
            CachedDataItemKey::CollectiblesDependent { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregationNumber { .. } => true,
            CachedDataItemKey::Follower { task, .. } => !task.is_transient(),
            CachedDataItemKey::Upper { task, .. } => !task.is_transient(),
            CachedDataItemKey::PersistentUpperCount {} => true,
            CachedDataItemKey::AggregatedDirtyContainer { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregatedCollectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItemKey::AggregatedDirtyContainerCount { .. } => true,
            CachedDataItemKey::AggregateRoot { .. } => false,
            CachedDataItemKey::InProgress { .. } => false,
            CachedDataItemKey::InProgressCell { .. } => false,
            CachedDataItemKey::OutdatedCollectible { .. } => false,
            CachedDataItemKey::OutdatedOutputDependency { .. } => false,
            CachedDataItemKey::OutdatedCellDependency { .. } => false,
            CachedDataItemKey::OutdatedCollectiblesDependency { .. } => false,
            CachedDataItemKey::OutdatedChild { .. } => false,
            CachedDataItemKey::Error { .. } => false,
        }
    }

    pub fn is_optional(&self) -> bool {
        matches!(self, CachedDataItemKey::CellData { .. })
    }

    pub fn category(&self) -> TaskDataCategory {
        match self {
            Self::Collectible { .. }
            | Self::Child { .. }
            | Self::ChildrenCount { .. }
            | Self::CellData { .. }
            | Self::CellTypeMaxIndex { .. }
            | Self::OutputDependency { .. }
            | Self::CellDependency { .. }
            | Self::CollectiblesDependency { .. }
            | Self::OutputDependent { .. }
            | Self::CellDependent { .. }
            | Self::CollectiblesDependent { .. } => TaskDataCategory::Data,

            Self::Output { .. }
            | Self::AggregationNumber { .. }
            | Self::Dirty { .. }
            | Self::Follower { .. }
            | Self::Upper { .. }
            | Self::PersistentUpperCount { .. }
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::OutdatedChild { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Error { .. }
            | Self::AggregateRoot { .. } => TaskDataCategory::All,
        }
    }
}

/// Used by the [`get_mut`][crate::backend::storage::get_mut] macro to restrict mutable access to a
/// subset of types. No mutable access should be allowed for persisted data, since that would break
/// persisting.
#[allow(non_upper_case_globals, dead_code)]
pub mod allow_mut_access {
    pub const InProgress: () = ();
    pub const AggregateRoot: () = ();
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CachedDataItemIndex {
    Children,
    Collectibles,
    Follower,
    Upper,
    AggregatedDirtyContainer,
    AggregatedCollectible,
    CellData,
    CellTypeMaxIndex,
    CellDependent,
    OutputDependent,
    CollectiblesDependent,
    Dependencies,
    InProgressCell,
}

#[allow(non_upper_case_globals, dead_code)]
pub mod indicies {
    use super::CachedDataItemIndex;

    pub const Child: CachedDataItemIndex = CachedDataItemIndex::Children;
    pub const OutdatedChild: CachedDataItemIndex = CachedDataItemIndex::Children;
    pub const Collectible: CachedDataItemIndex = CachedDataItemIndex::Collectibles;
    pub const OutdatedCollectible: CachedDataItemIndex = CachedDataItemIndex::Collectibles;
    pub const Follower: CachedDataItemIndex = CachedDataItemIndex::Follower;
    pub const Upper: CachedDataItemIndex = CachedDataItemIndex::Upper;
    pub const AggregatedDirtyContainer: CachedDataItemIndex =
        CachedDataItemIndex::AggregatedDirtyContainer;
    pub const AggregatedCollectible: CachedDataItemIndex =
        CachedDataItemIndex::AggregatedCollectible;
    pub const CellData: CachedDataItemIndex = CachedDataItemIndex::CellData;
    pub const CellTypeMaxIndex: CachedDataItemIndex = CachedDataItemIndex::CellTypeMaxIndex;
    pub const CellDependent: CachedDataItemIndex = CachedDataItemIndex::CellDependent;
    pub const OutputDependent: CachedDataItemIndex = CachedDataItemIndex::OutputDependent;
    pub const CollectiblesDependent: CachedDataItemIndex =
        CachedDataItemIndex::CollectiblesDependent;
    pub const OutputDependency: CachedDataItemIndex = CachedDataItemIndex::Dependencies;
    pub const CellDependency: CachedDataItemIndex = CachedDataItemIndex::Dependencies;
    pub const CollectibleDependency: CachedDataItemIndex = CachedDataItemIndex::Dependencies;
    pub const OutdatedOutputDependency: CachedDataItemIndex = CachedDataItemIndex::Dependencies;
    pub const OutdatedCellDependency: CachedDataItemIndex = CachedDataItemIndex::Dependencies;
    pub const OutdatedCollectiblesDependency: CachedDataItemIndex =
        CachedDataItemIndex::Dependencies;
    pub const OutdatedCollectibleDependency: CachedDataItemIndex =
        CachedDataItemIndex::Dependencies;
    pub const InProgressCell: CachedDataItemIndex = CachedDataItemIndex::InProgressCell;
}

impl Indexed for CachedDataItemKey {
    type Index = Option<CachedDataItemIndex>;

    fn index(&self) -> Option<CachedDataItemIndex> {
        match self {
            CachedDataItemKey::Child { .. } => Some(CachedDataItemIndex::Children),
            CachedDataItemKey::OutdatedChild { .. } => Some(CachedDataItemIndex::Children),
            CachedDataItemKey::Collectible { .. } => Some(CachedDataItemIndex::Collectibles),
            CachedDataItemKey::OutdatedCollectible { .. } => {
                Some(CachedDataItemIndex::Collectibles)
            }
            CachedDataItemKey::Follower { .. } => Some(CachedDataItemIndex::Follower),
            CachedDataItemKey::Upper { .. } => Some(CachedDataItemIndex::Upper),
            CachedDataItemKey::AggregatedDirtyContainer { .. } => {
                Some(CachedDataItemIndex::AggregatedDirtyContainer)
            }
            CachedDataItemKey::AggregatedCollectible { .. } => {
                Some(CachedDataItemIndex::AggregatedCollectible)
            }
            CachedDataItemKey::CellData { .. } => Some(CachedDataItemIndex::CellData),
            CachedDataItemKey::CellTypeMaxIndex { .. } => {
                Some(CachedDataItemIndex::CellTypeMaxIndex)
            }
            CachedDataItemKey::CellDependent { .. } => Some(CachedDataItemIndex::CellDependent),
            CachedDataItemKey::OutputDependent { .. } => Some(CachedDataItemIndex::OutputDependent),
            CachedDataItemKey::OutputDependency { .. } => Some(CachedDataItemIndex::Dependencies),
            CachedDataItemKey::CellDependency { .. } => Some(CachedDataItemIndex::Dependencies),
            CachedDataItemKey::CollectiblesDependency { .. } => {
                Some(CachedDataItemIndex::Dependencies)
            }
            CachedDataItemKey::OutdatedOutputDependency { .. } => {
                Some(CachedDataItemIndex::Dependencies)
            }
            CachedDataItemKey::OutdatedCellDependency { .. } => {
                Some(CachedDataItemIndex::Dependencies)
            }
            CachedDataItemKey::OutdatedCollectiblesDependency { .. } => {
                Some(CachedDataItemIndex::Dependencies)
            }
            CachedDataItemKey::InProgressCell { .. } => Some(CachedDataItemIndex::InProgressCell),
            _ => None,
        }
    }
}

impl CachedDataItemValue {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItemValue::Output { value } => !value.is_transient(),
            CachedDataItemValue::CellData { value } => {
                registry::get_value_type(value.0).is_serializable()
            }
            _ => true,
        }
    }
}

#[derive(Debug)]
pub enum CachedDataUpdate {
    /// Sets the current task id.
    Task { task: TaskId },
    /// An item was added. There was no old value.
    New { item: CachedDataItem },
    /// An item was removed.
    Removed { old_item: CachedDataItem },
    /// An item was replaced. This is step 1 and tells about the key and the old value
    Replace1 { old_item: CachedDataItem },
    /// An item was replaced. This is step 2 and tells about the new value.
    Replace2 { value: CachedDataItemValue },
}
