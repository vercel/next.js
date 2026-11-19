use std::{
    fmt::{self, Debug, Display},
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use parking_lot::Mutex;
use rustc_hash::FxHashSet;
use smallvec::SmallVec;
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::TaskDirtyCause;
use turbo_tasks::{
    CellId, RawVc, TaskExecutionReason, TaskId, TaskPriority, TraitTypeId,
    backend::TransientTaskRoot,
    event::{Event, EventDescription, EventListener},
};

use crate::error::TaskError;

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

        impl Eq for $name {}
    };
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub struct CellRef {
    pub task: TaskId,
    pub cell: CellId,
}

impl CellRef {
    /// Returns true if this cell reference points to a transient task.
    pub fn is_transient(&self) -> bool {
        self.task.is_transient()
    }
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub struct CollectibleRef {
    pub collectible_type: TraitTypeId,
    pub cell: CellRef,
}

impl CollectibleRef {
    /// Returns true if this collectible reference points to a transient task.
    pub fn is_transient(&self) -> bool {
        self.cell.is_transient()
    }
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub struct CollectiblesRef {
    pub task: TaskId,
    pub collectible_type: TraitTypeId,
}

impl CollectiblesRef {
    /// Returns true if this collectibles reference points to a transient task.
    pub fn is_transient(&self) -> bool {
        self.task.is_transient()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
pub enum OutputValue {
    Cell(CellRef),
    Output(TaskId),
    Error(Arc<TaskError>),
}

impl OutputValue {
    /// Returns true if this output value references a transient task.
    ///
    /// Transient values should not be persisted to disk since they reference
    /// tasks that will not exist after restart.
    pub fn is_transient(&self) -> bool {
        match self {
            OutputValue::Cell(cell) => cell.task.is_transient(),
            OutputValue::Output(task) => task.is_transient(),
            OutputValue::Error(_) => false,
        }
    }
}

/// The rarely needed part of a task's activeness: root and active-until-clean state, the event to
/// wait for the subgraph to become clean, and the active count while it doesn't fit the inline
/// `active_count`. Most tasks are active only through their active count, which lives inline in
/// the task storage; see `ActivenessAccessors`.
#[derive(Debug)]
pub struct ActivenessState {
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
    /// The active count while it doesn't fit the inline `active_count`, which then holds
    /// `ACTIVE_COUNT_SPILLED`.
    pub spilled_active_count: Option<i32>,
    /// An event which is notifies when the subgraph is no longer dirty. It must be combined with
    /// `active_until_clean` to avoid staling the task.
    pub all_clean_event: Event,
}

impl ActivenessState {
    pub fn new(id: TaskId) -> Self {
        Self {
            root_ty: None,
            active_until_clean: false,
            spilled_active_count: None,
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

    pub fn unset_root_type(&mut self) {
        self.root_ty = None;
    }

    pub fn unset_active_until_clean(&mut self) {
        self.active_until_clean = false;
    }

    /// Whether this holds nothing, so the task's activeness is just its inline active count.
    pub fn is_empty(&self) -> bool {
        self.root_ty.is_none() && !self.active_until_clean && self.spilled_active_count.is_none()
    }
}

transient_traits!(ActivenessState);

/// The follower edge additions that a task published while holding its lock and that haven't
/// been applied to the uppers yet, and the removals of follower edges that wait for them.
///
/// Stored on the task that published the additions (the owner): a task that connected new
/// children, a task that became inner of an upper and passes its followers on, or an upper that
/// got a new follower and passes it on to its own uppers. See "Pending additions" in the module
/// docs of `aggregation_update`.
#[derive(Debug, Default)]
pub struct PendingFollowerAdditions {
    /// Id of the next record. Ids only need to be unique while their record exists, and the field
    /// is dropped once it's empty, so they start at 0 again then.
    next_id: u64,
    records: SmallVec<[PendingFollowerAddition; 1]>,
    parked_removals: SmallVec<[ParkedFollowerRemoval; 1]>,
}

/// The additions of `follower_ids` to each of `upper_ids` that a single job applies.
#[derive(Debug)]
struct PendingFollowerAddition {
    id: u64,
    upper_ids: SmallVec<[TaskId; 4]>,
    follower_ids: SmallVec<[TaskId; 4]>,
}

/// The removal of one edge between `upper_id` and `follower_id`, which waits for the records
/// `waits_for` to be applied.
#[derive(Debug)]
struct ParkedFollowerRemoval {
    upper_id: TaskId,
    follower_id: TaskId,
    waits_for: SmallVec<[u64; 2]>,
}

/// From this number of followers, a record is converted to a set to match removals against it.
const MATCH_FOLLOWERS_WITH_SET: usize = 16;

impl PendingFollowerAdditions {
    pub fn is_empty(&self) -> bool {
        self.records.is_empty() && self.parked_removals.is_empty()
    }

    /// The number of records and parked removals, for the verification of the graph.
    #[cfg(any(test, feature = "verify_aggregation_graph"))]
    pub fn counts(&self) -> (usize, usize) {
        (self.records.len(), self.parked_removals.len())
    }

    /// Records the addition of `follower_ids` to each of `upper_ids`, which hasn't been applied
    /// yet. Returns the id of the record, which [`Self::settle`] takes once it's applied.
    pub fn add(
        &mut self,
        upper_ids: SmallVec<[TaskId; 4]>,
        follower_ids: SmallVec<[TaskId; 4]>,
    ) -> u64 {
        debug_assert!(!upper_ids.is_empty() && !follower_ids.is_empty());
        let id = self.next_id;
        self.next_id += 1;
        self.records.push(PendingFollowerAddition {
            id,
            upper_ids,
            follower_ids,
        });
        id
    }

    /// Parks the removal of one edge between each of `upper_ids` and each of `follower_ids`, when
    /// a record still adds that edge. Such a removal waits for all of these records. Returns the
    /// parked `(upper, follower)` pairs; the caller removes the other edges right away.
    pub fn park_removals(
        &mut self,
        upper_ids: &[TaskId],
        follower_ids: &[TaskId],
    ) -> SmallVec<[(TaskId, TaskId); 1]> {
        let mut parked = SmallVec::new();
        let records: SmallVec<[_; 2]> = self
            .records
            .iter()
            .filter(|record| upper_ids.iter().any(|id| record.upper_ids.contains(id)))
            .map(|record| {
                let followers =
                    (record.follower_ids.len() >= MATCH_FOLLOWERS_WITH_SET).then(|| {
                        record
                            .follower_ids
                            .iter()
                            .copied()
                            .collect::<FxHashSet<_>>()
                    });
                (record, followers)
            })
            .collect();
        if records.is_empty() {
            return parked;
        }
        for &upper_id in upper_ids {
            for &follower_id in follower_ids {
                let waits_for: SmallVec<[u64; 2]> = records
                    .iter()
                    .filter(|(record, followers)| {
                        record.upper_ids.contains(&upper_id)
                            && match followers {
                                Some(followers) => followers.contains(&follower_id),
                                None => record.follower_ids.contains(&follower_id),
                            }
                    })
                    .map(|(record, _)| record.id)
                    .collect();
                if !waits_for.is_empty() {
                    parked.push((upper_id, follower_id));
                    self.parked_removals.push(ParkedFollowerRemoval {
                        upper_id,
                        follower_id,
                        waits_for,
                    });
                }
            }
        }
        parked
    }

    /// Removes the record `id` once its additions are applied. Returns the `(upper, follower)`
    /// edges whose parked removal no longer waits for any record.
    pub fn settle(&mut self, id: u64) -> SmallVec<[(TaskId, TaskId); 1]> {
        let index = self
            .records
            .iter()
            .position(|record| record.id == id)
            .unwrap_or_else(|| panic!("pending follower addition {id} was already settled"));
        self.records.swap_remove(index);
        let mut released = SmallVec::new();
        self.parked_removals.retain(|removal| {
            removal.waits_for.retain(|waits_for| *waits_for != id);
            if removal.waits_for.is_empty() {
                released.push((removal.upper_id, removal.follower_id));
                false
            } else {
                true
            }
        });
        released
    }
}

transient_traits!(PendingFollowerAdditions);

type TransientTaskOnce =
    Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

pub enum TransientTask {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    ///
    /// Always active. Automatically scheduled.
    Root(TransientTaskRoot),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    ///
    /// Active until done. Automatically scheduled.
    Once(TransientTaskOnce),
}

impl Debug for TransientTask {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TransientTask::Root(_) => f.write_str("TransientTask::Root"),
            TransientTask::Once(_) => f.write_str("TransientTask::Once"),
        }
    }
}

impl Display for TransientTask {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TransientTask::Root(_) => f.write_str("Root Task"),
            TransientTask::Once(_) => f.write_str("Once Task"),
        }
    }
}

transient_traits!(TransientTask);

#[derive(Debug, Clone, Encode, Decode, PartialEq, Eq)]
pub enum Dirtyness {
    Dirty {
        parent_priority: TaskPriority,
        #[cfg(feature = "task_dirty_cause")]
        cause: TaskDirtyCause,
    },
    SessionDependent,
}

#[derive(Debug, Clone, Copy)]
pub enum RootType {
    RootTask,
    OnceTask,
}

impl Display for RootType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RootType::RootTask => f.write_str("Root Task"),
            RootType::OnceTask => f.write_str("Once Task"),
        }
    }
}

#[derive(Debug)]
pub struct InProgressStateInner {
    pub stale: bool,
    #[allow(dead_code)]
    pub once_task: bool,
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

#[derive(Debug)]
pub struct InProgressCellState {
    pub event: Event,
}

transient_traits!(InProgressCellState);

impl InProgressCellState {
    pub fn new(task_id: TaskId, cell: CellId) -> Self {
        InProgressCellState {
            event: Event::new(move || {
                move || format!("InProgressCellState::event ({task_id} {cell:?})")
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Encode, Decode)]
pub struct AggregationNumber {
    pub base: u32,
    pub distance: u32,
    pub effective: u32,
}

/// Monotonic increasing distance range to leaf nodes when following "dependencies" edges.
/// It is a range and ranges might overlap. There is a strictly monotonic increasing `distance`
/// value. `max_distance_in_buffer` value might not be monotonic. The `max_distance_in_buffer` value
/// is used as buffer zone to avoid too many updates to dependent nodes when the leaf distance
/// increases slightly. When the leaf distance is increased it tries to keep the
/// `max_distance_in_buffer` value equal. When increasing there are three cases:
/// - `distance` >= `distance` of the dependency + 1: no change.
/// - `distance` <= `max_distance_in_buffer`: only `distance` is increased to the smallest possible
///   value.
/// - `distance` > `max_distance_in_buffer`: `distance` is increased to the `max_distance_in_buffer`
///   value of the dependency + 1 and `max_distance_in_buffer` is increased to `distance` + buffer
///   zone.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Encode, Decode)]
pub struct LeafDistance {
    /// This is the strictly monotonic increasing minimum leaf distance.
    pub distance: u32,
    /// A buffer zone value in which is usually safe to increase the leaf distance without causing
    /// too many updates to dependent nodes.
    /// Newly added dependents might be added within this buffer zone to avoid propagating updates,
    /// therefore one can't rely on this being safe. It's only "often safe".
    pub max_distance_in_buffer: u32,
}

impl InProgressState {
    /// Create a new scheduled state with a done event.
    pub fn new_scheduled(reason: TaskExecutionReason, description: EventDescription) -> Self {
        let done_event = Event::new(move || move || format!("{description} done_event"));
        InProgressState::Scheduled { done_event, reason }
    }

    pub fn new_scheduled_with_listener(
        reason: TaskExecutionReason,
        description: EventDescription,
        note: EventDescription,
    ) -> (Self, EventListener) {
        let done_event = Event::new(move || move || format!("{description} done_event"));
        let listener = done_event.listen_with_note(note);
        (InProgressState::Scheduled { done_event, reason }, listener)
    }
}
/// Used by the `get_mut` macro to restrict mutable access to a
/// subset of types. No mutable access should be allowed for persisted data, since that would break
/// persisting.
#[allow(non_upper_case_globals, dead_code)]
pub mod allow_mut_access {
    pub const InProgress: () = ();
    pub const Activeness: () = ();
}
