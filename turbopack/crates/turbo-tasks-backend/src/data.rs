use std::{
    fmt::{self, Debug, Display},
    pin::Pin,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use parking_lot::Mutex;
use rustc_hash::FxHashSet;
use turbo_tasks::{
    CellId, RawVc, TaskExecutionReason, TaskId, TaskPriority, TraitTypeId,
    backend::{TransientTaskRoot, TurboTasksExecutionError},
    event::{Event, EventDescription, EventListener},
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
    Error(TurboTasksExecutionError),
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

#[derive(Debug, Clone, Copy, Encode, Decode, PartialEq, Eq)]
pub enum Dirtyness {
    Dirty(TaskPriority),
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
/// Used by the [`get_mut`][crate::backend::storage::get_mut] macro to restrict mutable access to a
/// subset of types. No mutable access should be allowed for persisted data, since that would break
/// persisting.
#[allow(non_upper_case_globals, dead_code)]
pub mod allow_mut_access {
    pub const InProgress: () = ();
    pub const Activeness: () = ();
}
