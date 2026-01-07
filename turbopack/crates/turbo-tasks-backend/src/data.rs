use bincode::{Decode, Encode};
use rustc_hash::FxHashSet;
use turbo_tasks::{
    CellId, TaskExecutionReason, TaskId, TraitTypeId,
    backend::TurboTasksExecutionError,
    event::{Event, EventListener},
};

// this traits are needed for transient state types that contain Event
// transient variants are never cloned or compared
macro_rules! transient_traits {
    ($name:ident) => {
        impl Clone for $name {
            fn clone(&self) -> Self {
                // this impl is needed for transient state types
                // transient types are never cloned
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

impl Eq for ActivenessState {}

#[derive(Debug, Clone, Copy, Encode, Decode, PartialEq, Eq)]
pub enum Dirtyness {
    Dirty,
    SessionDependent,
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

impl InProgressState {
    /// Create a new scheduled state with a done event.
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
        InProgressState::Scheduled { done_event, reason }
    }

    /// Create a new scheduled state with a done event and return a listener.
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
        (InProgressState::Scheduled { done_event, reason }, listener)
    }
}

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

use std::num::NonZeroU32;

/// Aggregation number for a task in the aggregation tree.
///
/// Note: `effective` uses `NonZeroU32` to enable niche optimization in `Option<AggregationNumber>`,
/// reducing the size from 16 bytes to 12 bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Encode, Decode)]
pub struct AggregationNumber {
    pub base: u32,
    pub distance: u32,
    /// The effective aggregation number (base + distance, with adjustments).
    /// Uses NonZeroU32 for niche optimization - Option<AggregationNumber> is 12 bytes.
    /// A value of 1 is used as the default, which is semantically equivalent to 0
    /// since both are below LEAF_NUMBER (16) and thus not aggregating nodes.
    pub effective: NonZeroU32,
}

impl Default for AggregationNumber {
    fn default() -> Self {
        Self {
            base: 0,
            distance: 0,
            // Use 1 as default - semantically equivalent to 0 for aggregation purposes
            // (both are < LEAF_NUMBER, so neither is an aggregating node)
            effective: NonZeroU32::MIN,
        }
    }
}

impl AggregationNumber {
    /// Create a new AggregationNumber with the given values.
    ///
    /// # Panics
    /// Panics if `effective` is 0 (use `new_clamped` for a non-panicking version).
    #[inline]
    pub fn new(base: u32, distance: u32, effective: u32) -> Self {
        Self {
            base,
            distance,
            effective: NonZeroU32::new(effective)
                .expect("effective aggregation number cannot be 0"),
        }
    }

    /// Create a new AggregationNumber, clamping effective to at least 1.
    #[inline]
    pub fn new_clamped(base: u32, distance: u32, effective: u32) -> Self {
        Self {
            base,
            distance,
            effective: NonZeroU32::new(effective).unwrap_or(NonZeroU32::MIN),
        }
    }

    /// Get the effective aggregation number as a u32.
    #[inline]
    pub fn effective(&self) -> u32 {
        self.effective.get()
    }
}
