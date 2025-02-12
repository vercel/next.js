use std::cmp::Ordering;

use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    event::{Event, EventListener},
    registry,
    util::SharedError,
    CellId, KeyValuePair, SessionId, TaskId, TraitTypeId, TypedSharedReference, ValueTypeId,
};

use crate::{
    backend::TaskDataCategory,
    data_storage::{AutoMapStorage, OptionStorage, Storage},
};

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
pub struct ActivenessState {
    /// When this counter is > 0, the task is active.
    pub active_counter: i32,
    /// The task is a root or once task and is active due to that.
    pub root_ty: Option<RootType>,
    /// The subgraph is active as long it's dirty. Once it become clean, it will unset this flag.
    ///
    /// This happens primarily when a dirty subgraph wants to be scheduled. It will set this flag
    /// to "cache" the activeness.
    ///
    /// It also happens when a task is strongly consistently read. We need the `all_clean_event` in
    /// that case and want to keep the task active to not stale the task.
    pub active_until_clean: bool,
    /// An event which is notifies when the subgraph is no longer dirty. It must be combined with
    /// `active_until_clean` to avoid staling the task.
    pub all_clean_event: Event,
}

impl ActivenessState {
    pub fn new(id: TaskId) -> Self {
        Self {
            active_counter: 0,
            root_ty: None,
            active_until_clean: false,
            all_clean_event: Event::new(move || {
                format!("ActivenessState::all_clean_event {:?}", id)
            }),
        }
    }

    pub fn new_root(root_ty: RootType, id: TaskId) -> Self {
        let mut this = Self::new(id);
        this.set_root(root_ty);
        this
    }

    pub fn set_root(&mut self, root_ty: RootType) {
        self.root_ty = Some(root_ty);
    }

    pub fn set_active_until_clean(&mut self) {
        self.active_until_clean = true;
    }

    /// Increment the active counter and return true if the counter was 0 before.
    pub fn increment_active_counter(&mut self) -> bool {
        self.active_counter += 1;
        self.active_counter == 1
    }

    /// Decrement the active counter and return true if the counter is 0 after.
    pub fn decrement_active_counter(&mut self) -> bool {
        self.active_counter -= 1;
        self.active_counter == 0
    }

    pub fn unset_root_type(&mut self) {
        self.root_ty = None;
    }

    pub fn unset_active_until_clean(&mut self) {
        self.active_until_clean = false;
    }

    pub fn is_empty(&self) -> bool {
        self.root_ty.is_none() && !self.active_until_clean && self.active_counter == 0
    }
}

transient_traits!(ActivenessState);

impl Eq for ActivenessState {}

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
pub enum RootType {
    RootTask,
    OnceTask,
}

#[derive(Debug)]
pub struct InProgressStateInner {
    pub stale: bool,
    #[allow(dead_code)]
    pub once_task: bool,
    pub session_dependent: bool,
    pub marked_as_completed: bool,
    pub done_event: Event,
    /// Children that should be connected to the task and have their active_count decremented
    /// once the task completes.
    pub new_children: FxHashSet<TaskId>,
}

#[derive(Debug)]
pub enum InProgressState {
    Scheduled { done_event: Event },
    InProgress(Box<InProgressStateInner>),
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

    // Flags
    Stateful {
        value: (),
    },

    // Transient Root Type
    #[serde(skip)]
    Activeness {
        value: ActivenessState,
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
            CachedDataItem::AggregatedDirtyContainer { task, .. } => !task.is_transient(),
            CachedDataItem::AggregatedCollectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItem::AggregatedDirtyContainerCount { .. } => true,
            CachedDataItem::Stateful { .. } => true,
            CachedDataItem::Activeness { .. } => false,
            CachedDataItem::InProgress { .. } => false,
            CachedDataItem::InProgressCell { .. } => false,
            CachedDataItem::OutdatedCollectible { .. } => false,
            CachedDataItem::OutdatedOutputDependency { .. } => false,
            CachedDataItem::OutdatedCellDependency { .. } => false,
            CachedDataItem::OutdatedCollectiblesDependency { .. } => false,
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
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. }
            | Self::Stateful { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Error { .. }
            | Self::Activeness { .. } => TaskDataCategory::All,
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
            CachedDataItemKey::AggregatedDirtyContainer { task, .. } => !task.is_transient(),
            CachedDataItemKey::AggregatedCollectible { collectible, .. } => {
                !collectible.cell.task.is_transient()
            }
            CachedDataItemKey::AggregatedDirtyContainerCount { .. } => true,
            CachedDataItemKey::Stateful { .. } => true,
            CachedDataItemKey::Activeness { .. } => false,
            CachedDataItemKey::InProgress { .. } => false,
            CachedDataItemKey::InProgressCell { .. } => false,
            CachedDataItemKey::OutdatedCollectible { .. } => false,
            CachedDataItemKey::OutdatedOutputDependency { .. } => false,
            CachedDataItemKey::OutdatedCellDependency { .. } => false,
            CachedDataItemKey::OutdatedCollectiblesDependency { .. } => false,
            CachedDataItemKey::Error { .. } => false,
        }
    }

    pub fn is_optional(&self) -> bool {
        matches!(self, CachedDataItemKey::CellData { .. })
    }

    pub fn category(&self) -> TaskDataCategory {
        self.ty().category()
    }
}

impl CachedDataItemType {
    pub fn category(&self) -> TaskDataCategory {
        match self {
            Self::Collectible { .. }
            | Self::Child { .. }
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
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. }
            | Self::Stateful { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Error { .. }
            | Self::Activeness { .. } => TaskDataCategory::All,
        }
    }
}

/// Used by the [`get_mut`][crate::backend::storage::get_mut] macro to restrict mutable access to a
/// subset of types. No mutable access should be allowed for persisted data, since that would break
/// persisting.
#[allow(non_upper_case_globals, dead_code)]
pub mod allow_mut_access {
    pub const InProgress: () = ();
    pub const Activeness: () = ();
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

#[cfg(test)]
mod tests {

    #[test]
    fn test_sizes() {
        assert_eq!(std::mem::size_of::<super::CachedDataItem>(), 40);
        assert_eq!(std::mem::size_of::<super::CachedDataItemKey>(), 20);
        assert_eq!(std::mem::size_of::<super::CachedDataItemValue>(), 32);
        assert_eq!(std::mem::size_of::<super::CachedDataItemStorage>(), 48);
        assert_eq!(std::mem::size_of::<super::CachedDataUpdate>(), 48);
    }
}
