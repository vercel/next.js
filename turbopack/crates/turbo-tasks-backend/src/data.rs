use std::{
    fmt::{self, Debug, Display},
    pin::Pin,
    sync::Arc,
};

use anyhow::Result;
use bincode::{Decode, Encode};
use parking_lot::Mutex;
use rustc_hash::FxHashSet;
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

/// The set of children a task connected during its (in-progress) execution, staged until the
/// execution completes and they are committed to the task's persistent `children` set.
///
/// This is a linear-ish wrapper around the staged `TaskId` set that exists to make the
/// **`parent_count` hold** impossible to leak. When a genuinely-new child edge is staged, the
/// child's reference count (`parent_count` for a persistent parent, `transient_ref_count` for a
/// transient one) is optimistically incremented — exactly like the active-count hold taken at the
/// same moment (see `ConnectChildOperation::run`). That hold must be discharged in one of exactly
/// two ways, and the encapsulation here forces the caller to pick one:
///
/// - [`commit`](Self::commit): the execution completed and the edges become permanent members of
///   `children`. The holds become permanent — no count change (the +1 taken at staging simply stops
///   being "temporary"). Balanced later by the `-1` in `CleanupOldEdges` when the edge is
///   eventually removed.
/// - [`release_set`](Self::release_set): the staged edges are being **discarded** without ever
///   reaching `children` (a stale reschedule or a cancellation). The caller must decrement the
///   holds — see [`ExecuteContext::release_children_holds`](crate::backend::operation::ExecuteContext::release_children_holds),
///   the only intended consumer, which does the per-child decrement.
///
/// The inner set is private and only reachable through those two methods, so any code path that
/// ends an in-progress state has to make the commit-vs-discard decision explicitly (rather than
/// silently dropping the set and leaking every hold, which would leave the children permanently
/// uncollectible). There is deliberately no `Drop` bomb: at teardown (`drop_contents`) the whole
/// task map — including in-progress tasks — is dropped wholesale, and the counts no longer matter,
/// so an inert drop is correct there.
#[derive(Debug, Default)]
pub struct ChildrenCollector {
    /// Staged children. Private: consume via [`commit`](Self::commit) or
    /// [`release_set`](Self::release_set) so the hold decision cannot be skipped.
    new_children: FxHashSet<TaskId>,
}

impl ChildrenCollector {
    pub fn new() -> Self {
        Self::default()
    }

    /// Whether `child` is already staged.
    pub fn contains(&self, child: &TaskId) -> bool {
        self.new_children.contains(child)
    }

    /// Stage `child`. Returns `true` if it was newly added, `false` if it was already staged
    /// (mirrors [`std::collections::HashSet::insert`]). The caller decides, from this return and
    /// the parent's existing `children` set, whether a `parent_count` hold applies.
    pub fn insert(&mut self, child: TaskId) -> bool {
        self.new_children.insert(child)
    }

    /// Remove `child` from the staged set. Returns whether it was present.
    pub fn remove(&mut self, child: &TaskId) -> bool {
        self.new_children.remove(child)
    }

    /// Iterate the staged children.
    pub fn iter(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.new_children.iter().copied()
    }

    pub fn is_empty(&self) -> bool {
        self.new_children.is_empty()
    }

    pub fn len(&self) -> usize {
        self.new_children.len()
    }

    /// Consume the collector on the **success** path: the staged edges become permanent members of
    /// the task's `children` set. The optimistic `parent_count` holds become permanent (no count
    /// change here). Returns the staged set for `connect_children`'s `extend_children`.
    pub fn commit(self) -> FxHashSet<TaskId> {
        self.new_children
    }

    /// Consume the collector on a **discard** path (stale reschedule / cancellation). Yields the
    /// staged set so the caller can release the holds. This is intentionally the *only* other way
    /// to extract the set; its single intended caller is
    /// [`ExecuteContext::release_children_holds`](crate::backend::operation::ExecuteContext::release_children_holds),
    /// which decrements each genuinely-new child's reference count. Named distinctly from `commit`
    /// so a discard can never be mistaken for a commit (which would leak the holds).
    pub(crate) fn release_set(self) -> FxHashSet<TaskId> {
        self.new_children
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
    /// Children connected during this execution, staged until completion. Wrapped in
    /// [`ChildrenCollector`] so the `parent_count` hold taken when each genuinely-new child is
    /// staged is discharged exactly once — committed to `children` on success, or released on a
    /// stale/cancel discard.
    pub new_children: ChildrenCollector,
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
