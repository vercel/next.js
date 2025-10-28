use std::cmp::Ordering;

use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    CellId, KeyValuePair, SessionId, TaskExecutionReason, TaskId, TraitTypeId,
    TypedSharedReference, ValueTypeId,
    backend::TurboTasksExecutionError,
    event::{Event, EventListener},
    registry,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputValue {
    Cell(CellRef),
    Output(TaskId),
    Error(TurboTasksExecutionError),
}
impl OutputValue {
    fn is_transient(&self) -> bool {
        match self {
            OutputValue::Cell(cell) => cell.task.is_transient(),
            OutputValue::Output(task) => task.is_transient(),
            OutputValue::Error(_) => false,
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
                move || format!("ActivenessState::all_clean_event {id:?}")
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

/// Represents a count of dirty containers. Since dirtiness can be session dependent, there might be
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
        if let Some((s, count)) = self.count_in_session
            && s == session
        {
            return count;
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

    /// Returns true if the count is zero and applying it would have no effect
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

#[cfg(test)]
mod dirty_container_count_tests {
    use turbo_tasks::SessionId;

    use super::*;

    const SESSION_1: SessionId = unsafe { SessionId::new_unchecked(1) };
    const SESSION_2: SessionId = unsafe { SessionId::new_unchecked(2) };
    const SESSION_3: SessionId = unsafe { SessionId::new_unchecked(3) };

    #[test]
    fn test_update() {
        let mut count = DirtyContainerCount::default();
        assert!(count.is_zero());

        let diff = count.update(1);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 1);
        assert_eq!(diff.get(SESSION_1), 1);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.update(-1);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), -1);

        let diff = count.update(2);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 2);
        assert_eq!(diff.get(SESSION_1), 1);
        assert_eq!(count.get(SESSION_2), 2);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.update(-1);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 1);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 0);

        let diff = count.update(-1);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), -1);

        let diff = count.update(-1);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), -1);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), -1);
        assert_eq!(diff.get(SESSION_2), 0);

        let diff = count.update(2);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 1);
        assert_eq!(diff.get(SESSION_1), 1);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.update(-2);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), -1);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), -1);
        assert_eq!(diff.get(SESSION_2), -1);

        let diff = count.update(1);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), 0);
    }

    #[test]
    fn test_session_dependent() {
        let mut count = DirtyContainerCount::default();
        assert!(count.is_zero());

        let diff = count.update_session_dependent(SESSION_1, 1);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.update_session_dependent(SESSION_1, -1);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), -1);

        let diff = count.update_session_dependent(SESSION_1, 2);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 2);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.update_session_dependent(SESSION_2, -2);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), 2);
        assert_eq!(diff.get(SESSION_2), 0);
        assert_eq!(count.get(SESSION_3), 0);
        assert_eq!(diff.get(SESSION_3), -1);
    }

    #[test]
    fn test_update_with_dirty_state() {
        let mut count = DirtyContainerCount::default();
        let dirty = DirtyState {
            clean_in_session: None,
        };
        let diff = count.update_with_dirty_state(&dirty);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 1);
        assert_eq!(diff.get(SESSION_1), 1);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.undo_update_with_dirty_state(&dirty);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), -1);

        let mut count = DirtyContainerCount::default();
        let dirty = DirtyState {
            clean_in_session: Some(SESSION_1),
        };
        let diff = count.update_with_dirty_state(&dirty);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 1);

        let diff = count.undo_update_with_dirty_state(&dirty);
        assert!(count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), 0);
        assert_eq!(count.get(SESSION_2), 0);
        assert_eq!(diff.get(SESSION_2), -1);
    }

    #[test]
    fn test_replace_dirty_state() {
        let mut count = DirtyContainerCount::default();
        let old = DirtyState {
            clean_in_session: None,
        };
        let new = DirtyState {
            clean_in_session: Some(SESSION_1),
        };
        count.update_with_dirty_state(&old);
        let diff = count.replace_dirty_state(&old, &new);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 0);
        assert_eq!(diff.get(SESSION_1), -1);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 0);

        let mut count = DirtyContainerCount::default();
        let old = DirtyState {
            clean_in_session: Some(SESSION_1),
        };
        let new = DirtyState {
            clean_in_session: None,
        };
        count.update_with_dirty_state(&old);
        let diff = count.replace_dirty_state(&old, &new);
        assert!(!count.is_zero());
        assert_eq!(count.get(SESSION_1), 1);
        assert_eq!(diff.get(SESSION_1), 1);
        assert_eq!(count.get(SESSION_2), 1);
        assert_eq!(diff.get(SESSION_2), 0);
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
    /// Early marking as completed. This is set before the output is available and will ignore full
    /// task completion of the task for strongly consistent reads.
    pub marked_as_completed: bool,
    /// Event that is triggered when the task output is available (completed flag set).
    /// This is used to wait for completion when reading the task output before it's available.
    pub done_event: Event,
    /// Children that should be connected to the task and have their active_count decremented
    /// once the task completes.
    pub new_children: FxHashSet<TaskId>,
}

#[derive(Debug)]
pub enum InProgressState {
    Scheduled {
        /// Event that is triggered when the task output is available (completed flag set).
        /// This is used to wait for completion when reading the task output before it's available.
        done_event: Event,
        /// Reason for scheduling the task.
        reason: TaskExecutionReason,
    },
    InProgress(Box<InProgressStateInner>),
    Canceled,
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
                move || format!("InProgressCellState::event ({task_id} {cell:?})")
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
        value: u32,
    },
    Upper {
        task: TaskId,
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

    // Flags
    Stateful {
        value: (),
    },
    HasInvalidator {
        value: (),
    },
    Immutable {
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
            CachedDataItem::HasInvalidator { .. } => true,
            CachedDataItem::Immutable { .. } => true,
            CachedDataItem::Activeness { .. } => false,
            CachedDataItem::InProgress { .. } => false,
            CachedDataItem::InProgressCell { .. } => false,
            CachedDataItem::OutdatedCollectible { .. } => false,
            CachedDataItem::OutdatedOutputDependency { .. } => false,
            CachedDataItem::OutdatedCellDependency { .. } => false,
            CachedDataItem::OutdatedCollectiblesDependency { .. } => false,
        }
    }

    pub fn new_scheduled<InnerFnDescription>(
        reason: TaskExecutionReason,
        description: impl FnOnce() -> InnerFnDescription,
    ) -> Self
    where
        InnerFnDescription: Fn() -> String + Sync + Send + 'static,
    {
        let done_event = Event::new(move || {
            let inner = description();
            move || format!("{} done_event", inner())
        });
        CachedDataItem::InProgress {
            value: InProgressState::Scheduled { done_event, reason },
        }
    }

    pub fn new_scheduled_with_listener<InnerFnDescription, InnerFnNote>(
        reason: TaskExecutionReason,
        description: impl FnOnce() -> InnerFnDescription,
        note: impl FnOnce() -> InnerFnNote,
    ) -> (Self, EventListener)
    where
        InnerFnDescription: Fn() -> String + Sync + Send + 'static,
        InnerFnNote: Fn() -> String + Sync + Send + 'static,
    {
        let done_event = Event::new(move || {
            let inner = description();
            move || format!("{} done_event", inner())
        });
        let listener = done_event.listen_with_note(note);
        (
            CachedDataItem::InProgress {
                value: InProgressState::Scheduled { done_event, reason },
            },
            listener,
        )
    }

    pub fn category(&self) -> TaskDataCategory {
        match self {
            Self::CellData { .. }
            | Self::CellTypeMaxIndex { .. }
            | Self::OutputDependency { .. }
            | Self::CellDependency { .. }
            | Self::CollectiblesDependency { .. }
            | Self::OutputDependent { .. }
            | Self::CellDependent { .. } => TaskDataCategory::Data,

            Self::Collectible { .. }
            | Self::Output { .. }
            | Self::AggregationNumber { .. }
            | Self::Dirty { .. }
            | Self::Follower { .. }
            | Self::Child { .. }
            | Self::Upper { .. }
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. }
            | Self::Stateful { .. }
            | Self::HasInvalidator { .. }
            | Self::Immutable { .. }
            | Self::CollectiblesDependent { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Activeness { .. } => TaskDataCategory::All,
        }
    }

    pub fn is_optional(&self) -> bool {
        matches!(self, CachedDataItem::CellData { .. })
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
            CachedDataItemKey::HasInvalidator { .. } => true,
            CachedDataItemKey::Immutable { .. } => true,
            CachedDataItemKey::Activeness { .. } => false,
            CachedDataItemKey::InProgress { .. } => false,
            CachedDataItemKey::InProgressCell { .. } => false,
            CachedDataItemKey::OutdatedCollectible { .. } => false,
            CachedDataItemKey::OutdatedOutputDependency { .. } => false,
            CachedDataItemKey::OutdatedCellDependency { .. } => false,
            CachedDataItemKey::OutdatedCollectiblesDependency { .. } => false,
        }
    }

    pub fn category(&self) -> TaskDataCategory {
        self.ty().category()
    }
}

impl CachedDataItemType {
    pub fn category(&self) -> TaskDataCategory {
        match self {
            Self::CellData { .. }
            | Self::CellTypeMaxIndex { .. }
            | Self::OutputDependency { .. }
            | Self::CellDependency { .. }
            | Self::CollectiblesDependency { .. }
            | Self::OutputDependent { .. }
            | Self::CellDependent { .. } => TaskDataCategory::Data,

            Self::Collectible { .. }
            | Self::Output { .. }
            | Self::AggregationNumber { .. }
            | Self::Dirty { .. }
            | Self::Follower { .. }
            | Self::Child { .. }
            | Self::Upper { .. }
            | Self::AggregatedDirtyContainer { .. }
            | Self::AggregatedCollectible { .. }
            | Self::AggregatedDirtyContainerCount { .. }
            | Self::Stateful { .. }
            | Self::HasInvalidator { .. }
            | Self::Immutable { .. }
            | Self::CollectiblesDependent { .. } => TaskDataCategory::Meta,

            Self::OutdatedCollectible { .. }
            | Self::OutdatedOutputDependency { .. }
            | Self::OutdatedCellDependency { .. }
            | Self::OutdatedCollectiblesDependency { .. }
            | Self::InProgressCell { .. }
            | Self::InProgress { .. }
            | Self::Activeness { .. } => TaskDataCategory::All,
        }
    }

    pub fn is_persistent(&self) -> bool {
        match self {
            Self::Output
            | Self::Collectible
            | Self::Dirty
            | Self::Child
            | Self::CellData
            | Self::CellTypeMaxIndex
            | Self::OutputDependency
            | Self::CellDependency
            | Self::CollectiblesDependency
            | Self::OutputDependent
            | Self::CellDependent
            | Self::CollectiblesDependent
            | Self::AggregationNumber
            | Self::Follower
            | Self::Upper
            | Self::AggregatedDirtyContainer
            | Self::AggregatedCollectible
            | Self::AggregatedDirtyContainerCount
            | Self::Stateful
            | Self::HasInvalidator
            | Self::Immutable => true,

            Self::Activeness
            | Self::InProgress
            | Self::InProgressCell
            | Self::OutdatedCollectible
            | Self::OutdatedOutputDependency
            | Self::OutdatedCellDependency
            | Self::OutdatedCollectiblesDependency => false,
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

impl CachedDataItemValueRef<'_> {
    pub fn is_persistent(&self) -> bool {
        match self {
            CachedDataItemValueRef::Output { value } => !value.is_transient(),
            CachedDataItemValueRef::CellData { value } => {
                registry::get_value_type(value.type_id).is_serializable()
            }
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_sizes() {
        assert_eq!(std::mem::size_of::<super::CachedDataItem>(), 40);
        assert_eq!(std::mem::size_of::<super::CachedDataItemKey>(), 20);
        assert_eq!(std::mem::size_of::<super::CachedDataItemValue>(), 32);
        assert_eq!(std::mem::size_of::<super::CachedDataItemStorage>(), 48);
    }
}
