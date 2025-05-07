use std::{
    borrow::Cow,
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::{BuildHasherDefault, Hash},
    mem::{replace, take},
    num::NonZeroU32,
    pin::Pin,
    sync::{atomic::AtomicU32, Arc},
    time::Duration,
};

use anyhow::Result;
use auto_hash_map::AutoMap;
use either::Either;
use parking_lot::{Mutex, RwLock};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use tracing::Span;
use turbo_prehash::PreHashed;
use turbo_tasks::{
    backend::{CachedTaskType, CellContent, TaskCollectiblesMap, TaskExecutionSpec},
    event::{Event, EventListener},
    get_invalidator, registry, CellId, Invalidator, RawVc, ReadConsistency, TaskId, TaskIdSet,
    TraitTypeId, TurboTasksBackendApi, TurboTasksBackendApiExt, ValueTypeId,
};

use crate::{
    aggregation::{
        aggregation_data, handle_new_edge, query_root_info, AggregationDataGuard, PreparedOperation,
    },
    cell::{Cell, ReadContentError},
    edges_set::{TaskEdge, TaskEdgesList, TaskEdgesSet},
    gc::{GcQueue, GcTaskState},
    output::Output,
    task::aggregation::{TaskAggregationContext, TaskChange},
    MemoryBackend,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

mod aggregation;
mod meta_state;

type OnceTaskFn = Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

/// Different Task types
pub enum TaskType {
    // Note: double boxed to reduce TaskType size
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    Root(Box<NativeTaskFn>),

    // Note: double boxed to reduce TaskType size
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    Once(Box<OnceTaskFn>),

    /// A normal persistent task
    Persistent { ty: Arc<PreHashed<CachedTaskType>> },

    /// A cached transient task
    Transient { ty: Arc<PreHashed<CachedTaskType>> },
}

#[derive(Clone)]
enum TaskTypeForDescription {
    Root,
    Once,
    Persistent(Arc<PreHashed<CachedTaskType>>),
}

impl TaskTypeForDescription {
    fn from(task_type: &TaskType) -> Self {
        match task_type {
            TaskType::Root(..) => Self::Root,
            TaskType::Once(..) => Self::Once,
            TaskType::Persistent { ty, .. } => Self::Persistent(ty.clone()),
            TaskType::Transient { ty, .. } => Self::Persistent(ty.clone()),
        }
    }
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Persistent { ty, .. } => Debug::fmt(ty, f),
            Self::Transient { ty } => Debug::fmt(ty, f),
        }
    }
}

impl Display for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Persistent { ty, .. } => Display::fmt(ty, f),
            Self::Transient { ty } => Display::fmt(ty, f),
        }
    }
}

/// A Task is an instantiation of an Function with some arguments.
/// The same combinations of Function and arguments usually results in the same
/// Task instance.
pub struct Task {
    id: TaskId,
    /// The type of the task
    pub(crate) ty: TaskType,
    /// The mutable state of the task
    /// Unset state is equal to a Dirty task that has not been executed yet
    state: RwLock<TaskMetaState>,
    /// Atomic in progress counter for graph modification
    graph_modification_in_progress_counter: AtomicU32,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut result = f.debug_struct("Task");
        result.field("id", &self.id);
        result.field("ty", &self.ty);
        if let Some(state) = self.try_state() {
            match state {
                TaskMetaStateReadGuard::Full(state) => {
                    result.field("state", &Task::state_string(&state));
                }
                TaskMetaStateReadGuard::Partial(_) => {
                    result.field("state", &"partial");
                }
                TaskMetaStateReadGuard::Unloaded => {
                    result.field("state", &"unloaded");
                }
            }
        }
        result.finish()
    }
}

/// The full state of a [Task], it includes all information.
struct TaskState {
    aggregation_node: TaskAggregationNode,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,
    output: Output,
    cells: AutoMap<ValueTypeId, SmallVec<[Cell; 1]>, BuildHasherDefault<FxHasher>>,

    // GC state:
    gc: GcTaskState,
}

impl TaskState {
    fn new() -> Self {
        Self {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Dirty {
                outdated_edges: Default::default(),
            },
            collectibles: Default::default(),
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
        }
    }

    fn new_scheduled(description: impl Fn() -> String + Send + Sync + Clone + 'static) -> Self {
        let description2 = description.clone();
        Self {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Scheduled(Box::new(ScheduledState {
                start_event: Event::new(move || {
                    format!("TaskState({})::start_event", description())
                }),
                done_event: Event::new(move || {
                    format!("TaskState({})::done_event", description2())
                }),
                outdated_edges: Default::default(),
                clean: true,
            })),
            collectibles: Default::default(),
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
        }
    }
}

/// The partial task state. It's equal to a full TaskState with state = Dirty
/// and all other fields empty. It looks like a dirty task that has not been
/// executed yet. The task might still referenced by some parents tasks.
/// A Task can get into this state when it is unloaded by garbage collection,
/// but is still attached to parents and aggregated.
struct PartialTaskState {
    aggregation_node: TaskAggregationNode,
}

impl PartialTaskState {
    fn into_full(self) -> TaskState {
        TaskState {
            aggregation_node: self.aggregation_node,
            state_type: Dirty {
                outdated_edges: Default::default(),
            },
            collectibles: Default::default(),
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
        }
    }
}

/// A fully unloaded task state. It's equal to a partial task state without
/// being referenced by any parent. This state is stored inlined instead of in a
/// [Box] to reduce the memory consumption. Make sure to not add more fields
/// than the size of a [Box].
struct UnloadedTaskState {}

#[cfg(test)]
#[test]
fn test_unloaded_task_state_size() {
    assert!(std::mem::size_of::<UnloadedTaskState>() <= std::mem::size_of::<Box<()>>());
}

impl UnloadedTaskState {
    fn into_full(self) -> TaskState {
        TaskState {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Dirty {
                outdated_edges: Default::default(),
            },
            collectibles: Default::default(),
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
        }
    }

    fn into_partial(self) -> PartialTaskState {
        PartialTaskState {
            aggregation_node: TaskAggregationNode::new(),
        }
    }
}

/// The collectibles of a task.
type Collectibles = AutoMap<(TraitTypeId, RawVc), i32>;

/// Keeps track of emitted and unemitted collectibles and the
/// read_collectibles tasks. Defaults to None to avoid allocating memory when no
/// collectibles are emitted or read.
#[derive(Default)]
struct MaybeCollectibles {
    inner: Option<Box<Collectibles>>,
}

impl MaybeCollectibles {
    /// Consumes the collectibles (if any) and return them.
    fn take_collectibles(&mut self) -> Collectibles {
        self.inner
            .as_mut()
            .map(|boxed| take(&mut **boxed))
            .unwrap_or_default()
    }

    /// Consumes the collectibles (if any) and return them.
    fn into_inner(self) -> Option<Box<Collectibles>> {
        self.inner
    }

    /// Returns a reference to the collectibles (if any).
    fn as_ref(&self) -> Option<&Collectibles> {
        if let Some(inner) = &self.inner {
            Some(&**inner)
        } else {
            None
        }
    }

    /// Emits a collectible.
    fn emit(&mut self, trait_type: TraitTypeId, value: RawVc) {
        let value = self
            .inner
            .get_or_insert_default()
            .entry((trait_type, value))
            .or_default();
        *value += 1;
    }

    /// Unemits a collectible.
    fn unemit(&mut self, trait_type: TraitTypeId, value: RawVc, count: u32) {
        let value = self
            .inner
            .get_or_insert_default()
            .entry((trait_type, value))
            .or_default();
        *value -= count as i32;
    }

    /// Removes an collectible if the count is positive.
    fn remove_emit(&mut self, trait_type: TraitTypeId, value: RawVc) -> bool {
        let Some(inner) = self.inner.as_mut() else {
            return false;
        };

        let auto_hash_map::map::Entry::Occupied(mut e) = inner.entry((trait_type, value)) else {
            return false;
        };
        let value = e.get_mut();
        *value -= 1;
        if *value == 0 {
            e.remove();
        }
        true
    }
}

struct InProgressState {
    /// Event is fired when the task is Done.
    done_event: Event,
    /// true, when the task was marked as finished.
    count_as_finished: bool,
    /// true, when the task wasn't changed since the last execution
    clean: bool,
    /// true, when the task was invalidated while executing. It will be
    /// scheduled again.
    stale: bool,
    /// Dependencies and children that need to be disconnected once entering
    /// Done.
    outdated_edges: TaskEdgesSet,
    /// Children that are connected during execution. These children are already
    /// removed from `outdated_edges`.
    new_children: TaskIdSet,
    /// Collectibles that need to be removed once leaving this state.
    outdated_collectibles: MaybeCollectibles,
}

struct ScheduledState {
    /// Event is fired when the task is IsProgress.
    start_event: Event,
    /// Event is fired when the task is Done.
    done_event: Event,
    /// Dependencies and children that need to be disconnected once entering
    /// Done.
    outdated_edges: Box<TaskEdgesSet>,
    /// true, when the task wasn't changed since the last execution
    clean: bool,
}

enum TaskStateType {
    /// Ready
    ///
    /// on invalidation this will move to Dirty or Scheduled depending on active
    /// flag
    Done {
        /// true, when the task has state and that can't be dropped
        stateful: bool,

        /// Cells/Outputs/Collectibles that the task has read during execution.
        /// And children that are connected to this task.
        /// The Task will keep these tasks alive as invalidations that happen
        /// there might affect this task.
        ///
        /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
        edges: TaskEdgesList,
    },

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty { outdated_edges: Box<TaskEdgesSet> },

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress or Dirty depending on active flag
    Scheduled(Box<ScheduledState>),

    /// Execution is happening
    ///
    /// on finish this will move to Done (!stale) or Scheduled (stale)
    ///
    /// on invalidation this will set it's stale flag
    InProgress(Box<InProgressState>),
}

impl TaskStateType {
    fn children(&self) -> impl Iterator<Item = TaskId> + '_ {
        match self {
            TaskStateType::Done { edges, .. } => Either::Left(edges.children()),
            TaskStateType::InProgress(box InProgressState {
                outdated_edges,
                new_children,
                ..
            }) => Either::Right(Either::Left(
                outdated_edges
                    .children()
                    .chain(new_children.iter().copied()),
            )),
            TaskStateType::Dirty { outdated_edges, .. } => {
                Either::Right(Either::Right(outdated_edges.children()))
            }
            TaskStateType::Scheduled(box ScheduledState { outdated_edges, .. }) => {
                Either::Right(Either::Right(outdated_edges.children()))
            }
        }
    }

    fn into_dependencies_and_children(self) -> (TaskEdgesSet, SmallVec<[TaskId; 6]>) {
        match self {
            TaskStateType::Done { edges, .. } => {
                let mut edges = edges.into_set();
                let children = edges.drain_children();
                (edges, children)
            }
            TaskStateType::InProgress(box InProgressState {
                outdated_edges,
                new_children,
                ..
            }) => {
                let mut edges = outdated_edges;
                let mut children = edges.drain_children();
                children.extend(new_children.iter().copied());
                (edges, children)
            }
            TaskStateType::Dirty { outdated_edges, .. }
            | TaskStateType::Scheduled(box ScheduledState { outdated_edges, .. }) => {
                let mut edges = *outdated_edges;
                let children = edges.drain_children();
                (edges, children)
            }
        }
    }
}

use TaskStateType::*;

use self::{
    aggregation::{ActiveQuery, RootType, TaskAggregationNode, TaskGuard},
    meta_state::{
        FullTaskWriteGuard, TaskMetaState, TaskMetaStateReadGuard, TaskMetaStateWriteGuard,
    },
};

pub enum GcResult {
    /// The task is not allowed to GC, e. g. due to it being non-pure or having
    /// state.
    NotPossible,
    /// The task was rescheduled for GC and must not be GC'ed now but at a later
    /// time.
    Stale,
    /// Dropped the content of task cells to save memory.
    ContentDropped,
    /// Unloaded the task completely to save memory. This disconnects the task
    /// from the graph and only makes sense when the task isn't currently
    /// active.
    Unloaded,
    AlreadyUnloaded,
}

pub enum ReadCellError {
    CellRemoved,
    Recomputing(EventListener),
}

impl Task {
    pub(crate) fn new_persistent(id: TaskId, task_type: Arc<PreHashed<CachedTaskType>>) -> Self {
        let ty = TaskType::Persistent { ty: task_type };
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new()))),
            graph_modification_in_progress_counter: AtomicU32::new(0),
        }
    }

    pub(crate) fn new_transient(id: TaskId, task_type: Arc<PreHashed<CachedTaskType>>) -> Self {
        let ty = TaskType::Transient { ty: task_type };
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new()))),
            graph_modification_in_progress_counter: AtomicU32::new(0),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> Self {
        let ty = TaskType::Root(Box::new(Box::new(functor)));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new_scheduled(
                description,
            )))),
            graph_modification_in_progress_counter: AtomicU32::new(0),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
    ) -> Self {
        let ty = TaskType::Once(Box::new(Mutex::new(Some(Box::pin(functor)))));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new_scheduled(
                description,
            )))),
            graph_modification_in_progress_counter: AtomicU32::new(0),
        }
    }

    pub(crate) fn is_pure(&self) -> bool {
        match &self.ty {
            TaskType::Persistent { .. } => true,
            TaskType::Transient { .. } => true,
            TaskType::Root(_) => false,
            TaskType::Once(_) => false,
        }
    }

    pub(crate) fn is_once(&self) -> bool {
        match &self.ty {
            TaskType::Persistent { .. } => false,
            TaskType::Transient { .. } => false,
            TaskType::Root(_) => false,
            TaskType::Once(_) => true,
        }
    }

    pub(crate) fn set_root(
        id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            Self::set_root_type(
                &aggregation_context,
                &mut aggregation_context.aggregation_data(id),
                RootType::Root,
            );
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn set_once(
        id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            let mut aggregation_guard = aggregation_context.aggregation_data(id);
            Self::set_root_type(&aggregation_context, &mut aggregation_guard, RootType::Once);
        }
        aggregation_context.apply_queued_updates();
    }

    fn set_root_type(
        aggregation_context: &TaskAggregationContext,
        aggregation: &mut AggregationDataGuard<TaskGuard<'_>>,
        root_type: RootType,
    ) {
        aggregation.root_type = Some(root_type);
        let dirty_tasks = aggregation
            .dirty_tasks
            .iter()
            .filter_map(|(&id, &count)| (count > 0).then_some(id));
        let mut tasks_to_schedule = aggregation_context.dirty_tasks_to_schedule.lock();
        tasks_to_schedule
            .get_or_insert_default()
            .extend(dirty_tasks);
    }

    pub(crate) fn unset_root(
        id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            aggregation_context.aggregation_data(id).root_type = None;
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn get_function_name(&self) -> Option<&'static str> {
        if let TaskType::Persistent { ty, .. } | TaskType::Transient { ty, .. } = &self.ty {
            Some(ty.get_name())
        } else {
            None
        }
    }

    pub(crate) fn get_description(&self) -> String {
        Self::format_description(&TaskTypeForDescription::from(&self.ty), self.id)
    }

    fn format_description(ty: &TaskTypeForDescription, id: TaskId) -> String {
        match ty {
            TaskTypeForDescription::Root => format!("[{}] root", id),
            TaskTypeForDescription::Once => format!("[{}] once", id),
            TaskTypeForDescription::Persistent(ty) => format!("[{id}] {ty}"),
        }
    }

    fn get_event_description_static(
        id: TaskId,
        ty: &TaskType,
    ) -> impl Fn() -> String + Send + Sync + Clone {
        let ty = TaskTypeForDescription::from(ty);
        move || Self::format_description(&ty, id)
    }

    fn get_event_description(&self) -> impl Fn() -> String + Send + Sync + Clone {
        Self::get_event_description_static(self.id, &self.ty)
    }

    pub(crate) fn remove_dependency(
        dep: TaskEdge,
        reader: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match dep {
            TaskEdge::Output(task) => {
                backend.with_task(task, |task| {
                    task.access_output_for_removing_dependents(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            TaskEdge::Cell(task, index) => {
                backend.with_task(task, |task| {
                    task.access_cell_for_removing_dependents(index, |cell| {
                        cell.remove_dependent_task(reader);
                    });
                });
            }
            TaskEdge::Collectibles(task, trait_type) => {
                let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
                let mut aggregation = aggregation_context.aggregation_data(task);
                aggregation.remove_collectible_dependent_task(trait_type, reader);
            }
            TaskEdge::Child(_) => {
                panic!("Children should not be removed via remove_dependency")
            }
        }
    }

    fn clear_dependencies(
        &self,
        dependencies: TaskEdgesSet,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend, turbo_tasks);
        }
    }

    fn state(&self) -> TaskMetaStateReadGuard<'_> {
        self.state.read().into()
    }

    fn try_state(&self) -> Option<TaskMetaStateReadGuard<'_>> {
        self.state.try_read().map(|guard| guard.into())
    }

    fn state_mut(&self) -> TaskMetaStateWriteGuard<'_> {
        self.state.write().into()
    }

    fn try_state_mut(&self) -> Option<TaskMetaStateWriteGuard<'_>> {
        self.state.try_write().map(|guard| guard.into())
    }

    fn full_state_mut(&self) -> FullTaskWriteGuard<'_> {
        TaskMetaStateWriteGuard::full_from(self.state.write())
    }

    #[allow(dead_code, reason = "We need this in future")]
    fn partial_state_mut(&self) -> TaskMetaStateWriteGuard<'_> {
        TaskMetaStateWriteGuard::partial_from(self.state.write())
    }

    pub(crate) fn execute<'a>(
        self: &'a Task,
        backend: &'a MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskExecutionSpec<'a>> {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let (future, span) = {
            let mut state = self.full_state_mut();
            match state.state_type {
                Done { .. } | InProgress { .. } => {
                    // should not start in this state
                    return None;
                }
                Scheduled(box ScheduledState {
                    ref mut done_event,
                    ref mut start_event,
                    ref mut outdated_edges,
                    clean,
                }) => {
                    start_event.notify(usize::MAX);
                    let done_event = done_event.take();
                    let outdated_edges = *take(outdated_edges);
                    let outdated_collectibles = take(&mut state.collectibles);
                    state.state_type = InProgress(Box::new(InProgressState {
                        done_event,
                        count_as_finished: false,
                        clean,
                        stale: false,
                        outdated_edges,
                        outdated_collectibles,
                        new_children: Default::default(),
                    }));
                }
                Dirty { .. } => {
                    let state_type = Task::state_string(&state);
                    panic!(
                        "{:?} execution started in unexpected state {}",
                        self, state_type
                    )
                }
            };
            self.make_execution_future()
        };
        aggregation_context.apply_queued_updates();
        Some(TaskExecutionSpec { future, span })
    }

    /// Prepares task execution and returns a future that will execute the task.
    fn make_execution_future<'a>(
        self: &'a Task,
    ) -> (
        Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'a>>,
        Span,
    ) {
        match &self.ty {
            TaskType::Root(bound_fn) => {
                (bound_fn(), tracing::trace_span!("turbo_tasks::root_task"))
            }
            TaskType::Once(mutex) => (
                mutex.lock().take().expect("Task can only be executed once"),
                tracing::trace_span!("turbo_tasks::once_task"),
            ),
            TaskType::Persistent { ty, .. } | TaskType::Transient { ty, .. } => {
                let CachedTaskType {
                    fn_type: native_fn_id,
                    this,
                    arg,
                } = &***ty;
                let func = registry::get_function(*native_fn_id);
                let span = func.span(self.id.persistence());
                let entered = span.enter();
                let future = func.execute(*this, &**arg);
                drop(entered);
                (future, span)
            }
        }
    }

    pub(crate) fn mark_as_finished(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() else {
            return;
        };
        let TaskStateType::InProgress(box InProgressState {
            ref mut count_as_finished,
            ref mut stale,
            ref mut outdated_collectibles,
            ref mut outdated_edges,
            ..
        }) = state.state_type
        else {
            return;
        };
        if *count_as_finished || *stale {
            return;
        }
        *count_as_finished = true;
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            let outdated_children = outdated_edges.drain_children();
            let outdated_collectibles = outdated_collectibles.take_collectibles();

            let remove_job = if outdated_children.is_empty() {
                None
            } else {
                state.aggregation_node.handle_lost_edges(
                    &aggregation_context,
                    &self.id,
                    outdated_children,
                )
            };

            let mut change = TaskChange {
                unfinished: -1,
                #[cfg(feature = "track_unfinished")]
                unfinished_tasks_update: vec![(self.id, -1)],
                ..Default::default()
            };
            for ((trait_type, value), count) in outdated_collectibles.into_iter() {
                change.collectibles.push((trait_type, value, -count));
            }
            let change_job = state
                .aggregation_node
                .apply_change(&aggregation_context, change);

            drop(state);
            remove_job.apply(&aggregation_context);
            change_job.apply(&aggregation_context);
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn execution_result(
        &self,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        match state.state_type {
            InProgress(ref state) if state.stale => {
                // We don't want to assign the output cell here
                // as we want to avoid unnecessary updates
                // TODO maybe this should be controlled by a heuristic
            }
            InProgress(..) => match result {
                Ok(Ok(result)) => {
                    if state.output != result {
                        if backend.print_task_invalidation && state.output.content.is_some() {
                            println!(
                                "Task {{ id: {}, name: {} }} invalidates:",
                                *self.id, self.ty
                            );
                            for dep in state.output.dependent_tasks.iter() {
                                backend.with_task(*dep, |task| {
                                    println!("\tTask {{ id: {}, name: {} }}", *task.id, task.ty);
                                });
                            }
                        }
                        state.output.link(result, turbo_tasks)
                    }
                }
                Ok(Err(mut err)) => {
                    if let Some(name) = self.get_function_name() {
                        err = err.context(format!("Execution of {} failed", name));
                    }
                    state.output.error(err, turbo_tasks)
                }
                Err(message) => state.output.panic(message, turbo_tasks),
            },

            Dirty { .. } | Scheduled { .. } | Done { .. } => {
                panic!(
                    "Task execution completed in unexpected state {}",
                    Task::state_string(&state)
                )
            }
        };
    }

    #[must_use]
    pub(crate) fn execution_completed(
        &self,
        duration: Duration,
        memory_usage: usize,
        generation: NonZeroU32,
        cell_counters: &AutoMap<ValueTypeId, u32, BuildHasherDefault<FxHasher>, 8>,
        stateful: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut schedule_task = false;
        {
            let mut change_job = None;
            let mut remove_job = None;
            let mut drained_cells = SmallVec::<[Cell; 8]>::new();
            let dependencies = turbo_tasks
                .write_task_state(|deps| std::mem::take(&mut deps.dependencies_to_track));
            {
                let mut state = self.full_state_mut();

                state
                    .gc
                    .execution_completed(duration, memory_usage, generation);

                let TaskState {
                    ref mut cells,
                    ref mut state_type,
                    ..
                } = *state;

                let InProgress(box InProgressState {
                    ref mut done_event,
                    count_as_finished,
                    ref mut outdated_edges,
                    ref mut outdated_collectibles,
                    ref mut new_children,
                    clean,
                    stale,
                }) = *state_type
                else {
                    panic!(
                        "Task execution completed in unexpected state {}",
                        Task::state_string(&state)
                    )
                };
                for (value_type, cells) in cells.iter_mut() {
                    let counter =
                        cell_counters.get(value_type).copied().unwrap_or_default() as usize;
                    let mut is_unused = true;
                    while counter < cells.len() {
                        let last = cells.last_mut().unwrap();
                        last.empty(clean, turbo_tasks);
                        if is_unused {
                            if last.is_unused() {
                                drained_cells.push(cells.pop().unwrap());
                            } else {
                                is_unused = false;
                            }
                        }
                    }
                }
                let done_event = done_event.take();
                let outdated_collectibles = outdated_collectibles.take_collectibles();
                let mut outdated_edges = take(outdated_edges);
                let mut new_edges = dependencies;
                let new_children = take(new_children);
                if stale {
                    for dep in new_edges.into_iter() {
                        // TODO Could be more efficent
                        outdated_edges.insert(dep);
                    }
                    for child in new_children {
                        outdated_edges.insert(TaskEdge::Child(child));
                    }
                    if !outdated_collectibles.is_empty() {
                        let mut change = TaskChange::default();
                        for ((trait_type, value), count) in outdated_collectibles.into_iter() {
                            change.collectibles.push((trait_type, value, -count));
                        }
                        change_job = state
                            .aggregation_node
                            .apply_change(&aggregation_context, change);
                    }
                    let description = self.get_event_description();
                    let start_event =
                        Event::new(move || format!("TaskState({})::start_event", description()));
                    state.state_type = Scheduled(Box::new(ScheduledState {
                        start_event,
                        done_event,
                        outdated_edges: Box::new(outdated_edges),
                        clean: false,
                    }));
                    drop(state);
                    schedule_task = true;
                } else {
                    outdated_edges.remove_all(&new_edges);
                    for child in new_children {
                        new_edges.insert(TaskEdge::Child(child));
                    }
                    if !backend.has_gc() {
                        // This will stay here for longer, so make sure to not consume too
                        // much memory
                        for cells in state.cells.values_mut() {
                            cells.shrink_to_fit();
                        }
                        state.cells.shrink_to_fit();
                    }
                    state.state_type = Done {
                        stateful,
                        edges: new_edges.into_list(),
                    };
                    let outdated_children = outdated_edges.drain_children();
                    if !outdated_children.is_empty() {
                        remove_job = state.aggregation_node.handle_lost_edges(
                            &aggregation_context,
                            &self.id,
                            outdated_children,
                        );
                    }
                    if !count_as_finished {
                        let mut change = TaskChange {
                            unfinished: -1,
                            #[cfg(feature = "track_unfinished")]
                            unfinished_tasks_update: vec![(self.id, -1)],
                            ..Default::default()
                        };
                        for ((trait_type, value), count) in outdated_collectibles.into_iter() {
                            change.collectibles.push((trait_type, value, -count));
                        }
                        change_job = state
                            .aggregation_node
                            .apply_change(&aggregation_context, change);
                    } else if !outdated_collectibles.is_empty() {
                        let mut change = TaskChange::default();
                        for ((trait_type, value), count) in outdated_collectibles.into_iter() {
                            change.collectibles.push((trait_type, value, -count));
                        }
                        change_job = state
                            .aggregation_node
                            .apply_change(&aggregation_context, change);
                    }

                    done_event.notify(usize::MAX);
                    drop(state);
                    self.clear_dependencies(outdated_edges, backend, turbo_tasks);
                }
            }
            for cell in drained_cells {
                cell.gc_drop(turbo_tasks);
            }
            remove_job.apply(&aggregation_context);
            change_job.apply(&aggregation_context);
        }
        if let TaskType::Once(_) = self.ty {
            // unset the root type, so tasks below are no longer active
            aggregation_context.aggregation_data(self.id).root_type = None;
        }
        aggregation_context.apply_queued_updates();

        schedule_task
    }

    fn make_dirty(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }

        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let should_schedule =
            query_root_info(&aggregation_context, ActiveQuery::default(), self.id);

        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            match state.state_type {
                Scheduled(box ScheduledState { ref mut clean, .. }) => {
                    *clean = false;

                    // already scheduled
                    drop(state);
                }
                Dirty { .. } => {
                    // already dirty
                    drop(state);
                }
                Done { ref mut edges, .. } => {
                    let outdated_edges = take(edges).into_set();
                    // add to dirty lists and potentially schedule
                    if should_schedule {
                        let change_job = state.aggregation_node.apply_change(
                            &aggregation_context,
                            TaskChange {
                                unfinished: 1,
                                #[cfg(feature = "track_unfinished")]
                                unfinished_tasks_update: vec![(self.id, 1)],
                                ..Default::default()
                            },
                        );
                        let description = self.get_event_description();
                        let description2 = description.clone();
                        state.state_type = Scheduled(Box::new(ScheduledState {
                            done_event: Event::new(move || {
                                format!("TaskState({})::done_event", description())
                            }),
                            start_event: Event::new(move || {
                                format!("TaskState({})::start_event", description2())
                            }),
                            outdated_edges: Box::new(outdated_edges),
                            clean: false,
                        }));
                        drop(state);
                        change_job.apply(&aggregation_context);

                        if backend.print_task_invalidation {
                            println!("invalidated Task {{ id: {}, name: {} }}", *self.id, self.ty);
                        }
                        turbo_tasks.schedule(self.id);
                    } else {
                        let change_job = state.aggregation_node.apply_change(
                            &aggregation_context,
                            TaskChange {
                                unfinished: 1,
                                #[cfg(feature = "track_unfinished")]
                                unfinished_tasks_update: vec![(self.id, 1)],
                                dirty_tasks_update: vec![(self.id, 1)],
                                ..Default::default()
                            },
                        );
                        state.state_type = Dirty {
                            outdated_edges: Box::new(outdated_edges),
                        };
                        drop(state);
                        change_job.apply(&aggregation_context);
                    }
                }
                InProgress(box InProgressState {
                    ref mut count_as_finished,
                    ref mut clean,
                    ref mut stale,
                    ..
                }) => {
                    if !*stale {
                        *clean = false;
                        *stale = true;
                        let change_job = if *count_as_finished {
                            *count_as_finished = false;
                            let change = TaskChange {
                                unfinished: 1,
                                #[cfg(feature = "track_unfinished")]
                                unfinished_tasks_update: vec![(self.id, 1)],
                                ..Default::default()
                            };
                            Some(
                                state
                                    .aggregation_node
                                    .apply_change(&aggregation_context, change),
                            )
                        } else {
                            None
                        };
                        drop(state);
                        change_job.apply(&aggregation_context);
                    }
                }
            }
        }
        aggregation_context.apply_queued_updates();
    }

    /// Called when the task need to be recomputed because a gc'ed cell was
    /// read.
    pub(crate) fn recompute(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let _span = tracing::trace_span!("turbo_tasks::recompute", id = *self.id).entered();

        // Events that lead to recomputation of non-pure task must not happen
        assert!(self.is_pure());

        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut state = self.full_state_mut();
        match state.state_type {
            Scheduled { .. } => {
                // already scheduled
                drop(state);
            }
            InProgress(..) => {
                // already in progress
                drop(state);
            }
            Dirty {
                ref mut outdated_edges,
            } => {
                let description = self.get_event_description();
                let description2 = description.clone();
                state.state_type = Scheduled(Box::new(ScheduledState {
                    start_event: Event::new(move || {
                        format!("TaskState({})::start_event", description())
                    }),
                    done_event: Event::new(move || {
                        format!("TaskState({})::done_event", description2())
                    }),
                    outdated_edges: take(outdated_edges),
                    clean: false,
                }));
                let change_job = state.aggregation_node.apply_change(
                    &aggregation_context,
                    TaskChange {
                        dirty_tasks_update: vec![(self.id, -1)],
                        ..Default::default()
                    },
                );
                drop(state);
                change_job.apply(&aggregation_context);
                turbo_tasks.schedule(self.id);
            }
            Done { ref mut edges, .. } => {
                let outdated_edges = take(edges).into_set();
                // add to dirty lists and potentially schedule
                let change_job = state.aggregation_node.apply_change(
                    &aggregation_context,
                    TaskChange {
                        unfinished: 1,
                        #[cfg(feature = "track_unfinished")]
                        unfinished_tasks_update: vec![(self.id, 1)],
                        ..Default::default()
                    },
                );
                let description = self.get_event_description();
                let description2 = description.clone();
                state.state_type = Scheduled(Box::new(ScheduledState {
                    start_event: Event::new(move || {
                        format!("TaskState({})::start_event", description())
                    }),
                    done_event: Event::new(move || {
                        format!("TaskState({})::done_event", description2())
                    }),
                    outdated_edges: Box::new(outdated_edges),
                    clean: true,
                }));
                drop(state);
                change_job.apply(&aggregation_context);

                turbo_tasks.schedule(self.id);
            }
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn schedule_when_dirty_from_aggregation(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        if let TaskStateType::Dirty {
            ref mut outdated_edges,
        } = state.state_type
        {
            let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
            let description = self.get_event_description();
            let description2 = description.clone();
            state.state_type = Scheduled(Box::new(ScheduledState {
                start_event: Event::new(move || {
                    format!("TaskState({})::start_event", description())
                }),
                done_event: Event::new(move || {
                    format!("TaskState({})::done_event", description2())
                }),
                outdated_edges: take(outdated_edges),
                clean: false,
            }));
            let job = state.aggregation_node.apply_change(
                &aggregation_context,
                TaskChange {
                    dirty_tasks_update: vec![(self.id, -1)],
                    ..Default::default()
                },
            );
            drop(state);
            turbo_tasks.schedule(self.id);
            job.apply(&aggregation_context);
            aggregation_context.apply_queued_updates();
        }
    }

    pub(crate) fn add_dependency_to_current(
        dep: TaskEdge,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        turbo_tasks.write_task_state(|ts| {
            ts.dependencies_to_track.insert(dep);
        });
    }

    /// Get an [Invalidator] that can be used to invalidate the current [Task]
    /// based on external events.
    pub fn get_invalidator() -> Invalidator {
        get_invalidator()
    }

    /// Called by the [Invalidator]. Invalidate the [Task]. When the task is
    /// active it will be scheduled for execution.
    pub(crate) fn invalidate(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        self.make_dirty(backend, turbo_tasks)
    }

    /// Access to the output cell.
    pub(crate) fn access_output_for_removing_dependents<T>(
        &self,
        func: impl FnOnce(&mut Output) -> T,
    ) -> Option<T> {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            Some(func(&mut state.output))
        } else {
            None
        }
    }

    /// Read a cell.
    pub(crate) fn read_cell(
        &self,
        index: CellId,
        gc_queue: Option<&GcQueue>,
        note: impl Fn() -> String + Sync + Send + 'static,
        reader: Option<TaskId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<CellContent, ReadCellError> {
        let task_id = self.id;
        let mut state = self.full_state_mut();
        if let Some(gc_queue) = gc_queue {
            let generation = gc_queue.generation();
            if state.gc.on_read(generation) {
                let _ = gc_queue.task_accessed(self.id);
            }
        }
        match state.state_type {
            Done { .. } | InProgress(..) => {
                let is_done = matches!(state.state_type, Done { .. });
                let list = state.cells.entry(index.type_id).or_default();
                let i = index.index as usize;
                if list.len() <= i {
                    list.resize_with(i + 1, Default::default);
                }
                let cell = &mut list[i];
                let description = move || format!("{task_id} {index}");
                let read_result = if let Some(reader) = reader {
                    cell.read_content(reader, is_done, description, note)
                } else {
                    cell.read_content_untracked(is_done, description, note)
                };
                drop(state);
                match read_result {
                    Ok(content) => Ok(content),
                    Err(ReadContentError::Computing { listener, schedule }) => {
                        if schedule {
                            self.recompute(backend, turbo_tasks);
                        }
                        Err(ReadCellError::Recomputing(listener))
                    }
                    Err(ReadContentError::Unused) => Err(ReadCellError::CellRemoved),
                }
            }
            Dirty {
                ref mut outdated_edges,
            } => {
                let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
                let description = self.get_event_description();
                let description2 = description.clone();
                let start_event =
                    Event::new(move || format!("TaskState({})::start_event", description()));
                let listener = start_event.listen_with_note(note);
                state.state_type = Scheduled(Box::new(ScheduledState {
                    start_event,
                    done_event: Event::new(move || {
                        format!("TaskState({})::done_event", description2())
                    }),
                    outdated_edges: take(outdated_edges),
                    clean: false,
                }));
                let change_job = state.aggregation_node.apply_change(
                    &aggregation_context,
                    TaskChange {
                        dirty_tasks_update: vec![(self.id, -1)],
                        ..Default::default()
                    },
                );
                drop(state);
                turbo_tasks.schedule(self.id);
                change_job.apply(&aggregation_context);
                aggregation_context.apply_queued_updates();
                Err(ReadCellError::Recomputing(listener))
            }
            Scheduled(box ScheduledState {
                ref start_event, ..
            }) => Err(ReadCellError::Recomputing(
                start_event.listen_with_note(note),
            )),
        }
    }

    /// Access to a cell.
    pub(crate) fn access_cell_for_write<T>(
        &self,
        index: CellId,
        func: impl FnOnce(&mut Cell, bool) -> T,
    ) -> T {
        let mut state = self.full_state_mut();
        let clean = match state.state_type {
            InProgress(box InProgressState { clean, .. }) => clean,
            _ => false,
        };
        let list = state.cells.entry(index.type_id).or_default();
        let i = index.index as usize;
        if list.len() <= i {
            list.resize_with(i + 1, Default::default);
        }
        func(&mut list[i], clean)
    }

    /// Access to a cell.
    pub(crate) fn access_cell_for_removing_dependents<T>(
        &self,
        index: CellId,
        func: impl FnOnce(&mut Cell) -> T,
    ) -> Option<T> {
        self.state_mut()
            .as_full_mut()
            .and_then(|state| state.cells.get_mut(&index.type_id))
            .and_then(|list| list.get_mut(index.index as usize).map(func))
    }

    /// Access to a cell.
    pub(crate) fn with_cell<T>(&self, index: CellId, func: impl FnOnce(&Cell) -> T) -> T {
        if let Some(cell) = self
            .state()
            .as_full()
            .and_then(|state| state.cells.get(&index.type_id))
            .and_then(|list| list.get(index.index as usize))
        {
            func(cell)
        } else {
            func(&Default::default())
        }
    }

    /// Checks if the task is inactive. Returns false if it's still active.
    pub(crate) fn potentially_become_inactive(
        &self,
        gc_queue: &GcQueue,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let active = query_root_info(&aggregation_context, ActiveQuery::default(), self.id);
        if active {
            return false;
        }
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            if state.gc.generation.is_none() {
                let generation = gc_queue.task_inactive(self.id);
                state.gc.generation = Some(generation);
            }
            for child in state.state_type.children() {
                gc_queue.task_potentially_no_longer_active(child);
            }
        }
        true
    }

    pub fn is_pending(&self) -> bool {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            !matches!(state.state_type, TaskStateType::Done { .. })
        } else {
            true
        }
    }

    pub fn is_dirty(&self) -> bool {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            matches!(state.state_type, TaskStateType::Dirty { .. })
        } else {
            false
        }
    }

    fn state_string(state: &TaskState) -> &'static str {
        match state.state_type {
            Scheduled { .. } => "scheduled",
            InProgress(box InProgressState { stale: true, .. }) => "in progress (stale)",
            InProgress(box InProgressState { clean: true, .. }) => "in progress (clean)",
            InProgress(box InProgressState {
                count_as_finished: true,
                ..
            }) => "in progress (marked as finished)",
            InProgress(box InProgressState { .. }) => "in progress",
            Done { .. } => "done",
            Dirty { .. } => "dirty",
        }
    }

    pub(crate) fn connect_child(
        &self,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            let mut add_job = None;
            {
                let mut state = self.full_state_mut();
                match &mut state.state_type {
                    TaskStateType::InProgress(box InProgressState {
                        outdated_edges,
                        new_children,
                        ..
                    }) => {
                        if new_children.insert(child_id) {
                            if outdated_edges.remove(TaskEdge::Child(child_id)) {
                                drop(state);
                                aggregation_context.apply_queued_updates();
                                return;
                            }
                            let number_of_children = new_children.len();
                            let mut guard = TaskGuard::from_full(self.id, state);
                            add_job = Some(handle_new_edge(
                                &aggregation_context,
                                &mut guard,
                                &self.id,
                                &child_id,
                                number_of_children,
                            ));
                        }
                    }
                    _ => panic!("Unexpected task state when adding a child task"),
                }
            }
            if let Some(job) = add_job {
                // To avoid bubbling up the dirty tasks into the new parent tree, we make a
                // quick check for activeness of the parent when the child is dirty. This is
                // purely an optimization and not required for correctness.
                // So it's fine to ignore the race condition existing here.
                backend.with_task(child_id, |child| {
                    if child.is_dirty() {
                        let active =
                            query_root_info(&aggregation_context, ActiveQuery::default(), self.id);
                        if active {
                            child.schedule_when_dirty_from_aggregation(backend, turbo_tasks);
                        }
                    }
                });
                job.apply(&aggregation_context);
            }
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        consistency: ReadConsistency,
        func: F,
        note: impl Fn() -> String + Sync + Send + 'static,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<T, EventListener>> {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut state = if consistency == ReadConsistency::Strong {
            let mut aggregation = aggregation_data(&aggregation_context, &self.id);
            if aggregation.unfinished > 0 {
                if aggregation.root_type.is_none() {
                    Self::set_root_type(
                        &aggregation_context,
                        &mut aggregation,
                        RootType::ReadingStronglyConsistent,
                    );
                }
                let listener = aggregation.unfinished_event.listen_with_note(note);
                drop(aggregation);
                aggregation_context.apply_queued_updates();

                return Ok(Err(listener));
            } else if matches!(
                aggregation.root_type,
                Some(RootType::ReadingStronglyConsistent)
            ) {
                aggregation.root_type = None;
            }
            let state = aggregation.into_inner().into_inner().into_inner();
            TaskMetaStateWriteGuard::full_from(state)
        } else {
            self.full_state_mut()
        };
        let result = match state.state_type {
            Done { .. } => {
                let result = func(&mut state.output)?;
                drop(state);

                Ok(Ok(result))
            }
            Dirty {
                ref mut outdated_edges,
            } => {
                turbo_tasks.schedule(self.id);
                let description = self.get_event_description();
                let description2 = description.clone();
                let done_event =
                    Event::new(move || format!("TaskState({})::done_event", description()));
                let listener = done_event.listen_with_note(note);
                state.state_type = Scheduled(Box::new(ScheduledState {
                    start_event: Event::new(move || {
                        format!("TaskState({})::start_event", description2())
                    }),
                    done_event,
                    outdated_edges: take(outdated_edges),
                    clean: false,
                }));
                let change_job = state.aggregation_node.apply_change(
                    &aggregation_context,
                    TaskChange {
                        dirty_tasks_update: vec![(self.id, -1)],
                        ..Default::default()
                    },
                );
                drop(state);
                change_job.apply(&aggregation_context);
                Ok(Err(listener))
            }
            Scheduled(box ScheduledState { ref done_event, .. })
            | InProgress(box InProgressState { ref done_event, .. }) => {
                let listener = done_event.listen_with_note(note);
                drop(state);
                Ok(Err(listener))
            }
        };
        aggregation_context.apply_queued_updates();
        result
    }

    pub(crate) fn read_collectibles(
        id: TaskId,
        trait_type: TraitTypeId,
        reader: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> TaskCollectiblesMap {
        let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut aggregation_data = aggregation_context.aggregation_data(id);
        aggregation_data.read_collectibles(trait_type, reader)
    }

    pub(crate) fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut state = self.full_state_mut();
        state.collectibles.emit(trait_type, collectible);
        if let TaskStateType::InProgress(box InProgressState {
            outdated_collectibles,
            ..
        }) = &mut state.state_type
        {
            if outdated_collectibles.remove_emit(trait_type, collectible) {
                return;
            }
        }
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let change_job = state.aggregation_node.apply_change(
            &aggregation_context,
            TaskChange {
                collectibles: vec![(trait_type, collectible, 1)],
                ..Default::default()
            },
        );
        drop(state);
        change_job.apply(&aggregation_context);
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        count: u32,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut state = self.full_state_mut();
        state.collectibles.unemit(trait_type, collectible, count);
        let change_job = state.aggregation_node.apply_change(
            &aggregation_context,
            TaskChange {
                collectibles: vec![(trait_type, collectible, -(count as i32))],
                ..Default::default()
            },
        );
        drop(state);
        change_job.apply(&aggregation_context);
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn run_gc(
        &self,
        generation: NonZeroU32,
        gc_queue: &GcQueue,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> GcResult {
        if !self.is_pure() {
            return GcResult::NotPossible;
        }

        let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let active = query_root_info(&aggregation_context, ActiveQuery::default(), self.id);

        match self.state_mut() {
            TaskMetaStateWriteGuard::Full(mut state) => {
                if let Some(old_gen) = state.gc.generation {
                    if old_gen > generation {
                        return GcResult::Stale;
                    }
                } else {
                    return GcResult::Stale;
                }
                state.gc.generation = None;

                match &mut state.state_type {
                    TaskStateType::Done { stateful, edges: _ } => {
                        if *stateful {
                            return GcResult::NotPossible;
                        }
                    }
                    TaskStateType::Dirty { .. } => {}
                    _ => {
                        // GC can't run in this state. We will reschedule it when the execution
                        // completes.
                        return GcResult::NotPossible;
                    }
                }

                if active {
                    let mut cells_to_drop = Vec::new();

                    // shrinking memory and dropping cells
                    state.aggregation_node.shrink_to_fit();
                    state.output.dependent_tasks.shrink_to_fit();
                    state.cells.shrink_to_fit();
                    for cells in state.cells.values_mut() {
                        cells.shrink_to_fit();
                        for cell in cells.iter_mut() {
                            cells_to_drop.extend(cell.gc_content());
                            cell.shrink_to_fit();
                        }
                    }

                    drop(state);

                    gc_queue.task_gc_active(self.id);

                    // Dropping cells outside of the lock
                    drop(cells_to_drop);

                    GcResult::ContentDropped
                } else {
                    // Task is inactive, unload task
                    self.unload(state, backend, turbo_tasks);
                    GcResult::Unloaded
                }
            }
            TaskMetaStateWriteGuard::Partial(mut state) => {
                state.aggregation_node.shrink_to_fit();
                GcResult::AlreadyUnloaded
            }
            TaskMetaStateWriteGuard::Unloaded(_) => GcResult::AlreadyUnloaded,
            TaskMetaStateWriteGuard::TemporaryFiller => unreachable!(),
        }
    }

    pub(crate) fn gc_state(&self) -> Option<GcTaskState> {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            Some(state.gc)
        } else {
            None
        }
    }

    fn unload(
        &self,
        mut full_state: FullTaskWriteGuard<'_>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut change_job = None;
        let TaskState {
            ref mut aggregation_node,
            ref mut state_type,
            ..
        } = *full_state;
        match state_type {
            Done { edges: _, stateful } => {
                if *stateful {
                    return false;
                }
                change_job = aggregation_node.apply_change(
                    &aggregation_context,
                    TaskChange {
                        unfinished: 1,
                        dirty_tasks_update: vec![(self.id, 1)],
                        ..Default::default()
                    },
                );
            }
            Dirty { outdated_edges: _ } => {}
            _ => {
                // Any other state is not unloadable.
                return false;
            }
        }
        // Task is now dirty, so we can safely unload it

        let mut state = full_state.into_inner();
        let old_state = replace(
            &mut *state,
            // placeholder
            TaskMetaState::Unloaded(UnloadedTaskState {}),
        );
        let TaskState {
            cells,
            output,
            collectibles,
            mut aggregation_node,
            // can be dropped as always Dirty, event has been notified above
            state_type,
            // can be dropped as only gc meta info
            gc: _,
        } = old_state.into_full().unwrap();

        let (dependencies, children) = state_type.into_dependencies_and_children();

        // Remove all children, as they will be added again when this task is executed
        // again
        let remove_job = (!children.is_empty())
            .then(|| aggregation_node.handle_lost_edges(&aggregation_context, &self.id, children));

        // Remove all collectibles, as they will be added again when this task is
        // executed again.
        let collectibles_job = if let Some(collectibles) = collectibles.into_inner() {
            aggregation_node.apply_change(
                &aggregation_context,
                TaskChange {
                    collectibles: collectibles
                        .into_iter()
                        .map(|((t, r), c)| (t, r, -c))
                        .collect(),
                    ..Default::default()
                },
            )
        } else {
            None
        };

        aggregation_node.shrink_to_fit();

        // TODO aggregation_node
        let unset = false;

        if unset {
            *state = TaskMetaState::Unloaded(UnloadedTaskState {});
        } else {
            *state = TaskMetaState::Partial(Box::new(PartialTaskState { aggregation_node }));
        }
        drop(state);

        change_job.apply(&aggregation_context);
        remove_job.apply(&aggregation_context);
        collectibles_job.apply(&aggregation_context);

        // Notify everyone that is listening on our output or cells.
        // This will mark everyone as dirty and will trigger a new execution when they
        // become active again.
        for cells in cells.into_values() {
            for cell in cells {
                cell.gc_drop(turbo_tasks);
            }
        }
        output.gc_drop(turbo_tasks);

        // TODO This is a race condition, the task might be executed again while
        // removing dependencies.
        // We can clear the dependencies as we are already marked as dirty
        self.clear_dependencies(dependencies, backend, turbo_tasks);

        aggregation_context.apply_queued_updates();

        true
    }
}

impl Display for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            write!(
                f,
                "Task({}, {})",
                self.get_description(),
                Task::state_string(&state)
            )
        } else {
            write!(f, "Task({}, unloaded)", self.get_description())
        }
    }
}

impl Hash for Task {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(self as *const Task), state)
    }
}

impl PartialEq for Task {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}

impl Eq for Task {}
