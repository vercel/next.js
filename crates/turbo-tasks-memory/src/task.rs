use std::{
    borrow::Cow,
    cell::RefCell,
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::{BuildHasherDefault, Hash},
    mem::{replace, take},
    pin::Pin,
    sync::{atomic::AtomicU32, Arc},
    time::Duration,
};

use anyhow::Result;
use auto_hash_map::{AutoMap, AutoSet};
use parking_lot::{Mutex, RwLock};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use tokio::task_local;
use tracing::Span;
use turbo_prehash::PreHashed;
use turbo_tasks::{
    backend::{PersistentTaskType, TaskExecutionSpec},
    event::{Event, EventListener},
    get_invalidator, registry, CellId, Invalidator, NativeFunction, RawVc, TaskId, TaskIdSet,
    TraitType, TraitTypeId, TurboTasksBackendApi, ValueTypeId,
};

use crate::{
    aggregation::{
        aggregation_data, handle_new_edge, prepare_aggregation_data, query_root_info,
        AggregationDataGuard, PreparedOperation,
    },
    cell::Cell,
    gc::{GcQueue, GcTaskState},
    output::{Output, OutputContent},
    task::aggregation::{TaskAggregationContext, TaskChange},
    MemoryBackend,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

mod aggregation;
mod meta_state;

#[derive(Hash, Copy, Clone, PartialEq, Eq)]
pub enum TaskDependency {
    Output(TaskId),
    Cell(TaskId, CellId),
    Collectibles(TaskId, TraitTypeId),
}
pub type TaskDependencySet = AutoSet<TaskDependency, BuildHasherDefault<FxHasher>>;

task_local! {
    /// Cells/Outputs/Collectibles that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<TaskDependencySet>;
}

type OnceTaskFn = Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

/// Different Task types
enum TaskType {
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
    Persistent {
        ty: Arc<PreHashed<PersistentTaskType>>,
    },
}

enum TaskTypeForDescription {
    Root,
    Once,
    Persistent(Arc<PreHashed<PersistentTaskType>>),
}

impl TaskTypeForDescription {
    fn from(task_type: &TaskType) -> Self {
        match task_type {
            TaskType::Root(..) => Self::Root,
            TaskType::Once(..) => Self::Once,
            TaskType::Persistent { ty, .. } => Self::Persistent(ty.clone()),
        }
    }
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Persistent { ty, .. } => Debug::fmt(ty, f),
        }
    }
}

impl Display for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Persistent { ty, .. } => Display::fmt(ty, f),
        }
    }
}

#[derive(Default)]
enum PrepareTaskType {
    #[default]
    None,
    Resolve(&'static NativeFunction),
    ResolveTrait(&'static TraitType),
    Native(&'static NativeFunction, NativeTaskFn),
}

/// A Task is an instantiation of an Function with some arguments.
/// The same combinations of Function and arguments usually results in the same
/// Task instance.
pub struct Task {
    id: TaskId,
    /// The type of the task
    ty: TaskType,
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

    /// Children are only modified from execution
    children: TaskIdSet,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,

    /// Preparations done for the task type with the bound arguments, e. g.
    /// argument validation
    prepared_type: PrepareTaskType,

    output: Output,
    cells: AutoMap<ValueTypeId, SmallVec<[Cell; 1]>, BuildHasherDefault<FxHasher>>,

    // GC state:
    gc: GcTaskState,
}

impl TaskState {
    fn new(description: impl Fn() -> String + Send + Sync + 'static) -> Self {
        Self {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
                outdated_dependencies: Default::default(),
            },
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_scheduled(description: impl Fn() -> String + Send + Sync + 'static) -> Self {
        Self {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Scheduled {
                event: Event::new(move || format!("TaskState({})::event", description())),
                outdated_dependencies: Default::default(),
            },
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
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
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            aggregation_node: self.aggregation_node,
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
                outdated_dependencies: Default::default(),
            },
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
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
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            aggregation_node: TaskAggregationNode::new(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
                outdated_dependencies: Default::default(),
            },
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
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
    fn take_collectibles(&mut self) -> Option<Collectibles> {
        self.inner.as_mut().map(|boxed| take(&mut **boxed))
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
        /// The Task will keep these tasks alive as invalidations that happen
        /// there might affect this task.
        ///
        /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
        dependencies: TaskDependencySet,
    },

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty {
        event: Event,
        outdated_dependencies: TaskDependencySet,
    },

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress or Dirty depending on active flag
    Scheduled {
        event: Event,
        outdated_dependencies: TaskDependencySet,
    },

    /// Execution is happening
    ///
    /// on finish this will move to Done
    ///
    /// on invalidation this will move to InProgressDirty
    InProgress {
        event: Event,
        count_as_finished: bool,
        /// Children that need to be disconnected once leaving this state
        #[cfg(feature = "lazy_remove_children")]
        outdated_children: TaskIdSet,
        outdated_collectibles: MaybeCollectibles,
    },

    /// Invalid execution is happening
    ///
    /// on finish this will move to Scheduled
    InProgressDirty { event: Event },
}

use TaskStateType::*;

use self::{
    aggregation::{ActiveQuery, RootType, TaskAggregationNode, TaskGuard},
    meta_state::{
        FullTaskWriteGuard, TaskMetaState, TaskMetaStateReadGuard, TaskMetaStateWriteGuard,
    },
};

impl Task {
    pub(crate) fn new_persistent(
        id: TaskId,
        task_type: Arc<PreHashed<PersistentTaskType>>,
    ) -> Self {
        let ty = TaskType::Persistent { ty: task_type };
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new(description)))),
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
            TaskType::Root(_) => false,
            TaskType::Once(_) => false,
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

    pub(crate) fn get_function_name(&self) -> Option<Cow<'static, str>> {
        if let TaskType::Persistent { ty, .. } = &self.ty {
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
            TaskTypeForDescription::Persistent(ty) => match &***ty {
                PersistentTaskType::Native(native_fn, _) => {
                    format!("[{}] {}", id, registry::get_function(*native_fn).name)
                }
                PersistentTaskType::ResolveNative(native_fn, _) => {
                    format!(
                        "[{}] [resolve] {}",
                        id,
                        registry::get_function(*native_fn).name
                    )
                }
                PersistentTaskType::ResolveTrait(trait_type, fn_name, _) => {
                    format!(
                        "[{}] [resolve trait] {} in trait {}",
                        id,
                        fn_name,
                        registry::get_trait(*trait_type).name
                    )
                }
            },
        }
    }

    fn get_event_description_static(
        id: TaskId,
        ty: &TaskType,
    ) -> impl Fn() -> String + Send + Sync {
        let ty = TaskTypeForDescription::from(ty);
        move || Self::format_description(&ty, id)
    }

    fn get_event_description(&self) -> impl Fn() -> String + Send + Sync {
        Self::get_event_description_static(self.id, &self.ty)
    }

    pub(crate) fn remove_dependency(
        dep: TaskDependency,
        reader: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        match dep {
            TaskDependency::Output(task) => {
                backend.with_task(task, |task| {
                    task.with_output_mut_if_available(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            TaskDependency::Cell(task, index) => {
                backend.with_task(task, |task| {
                    task.with_cell_mut_if_available(index, |cell| {
                        cell.remove_dependent_task(reader);
                    });
                });
            }
            TaskDependency::Collectibles(task, trait_type) => {
                let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
                let mut aggregation = aggregation_context.aggregation_data(task);
                aggregation.remove_collectible_dependent_task(trait_type, reader);
            }
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(
        &self,
        dependencies: TaskDependencySet,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend, turbo_tasks);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(
        &self,
        dependencies: TaskDependencySet,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        use std::time::Instant;

        use turbo_tasks::util::FormatDuration;
        let start = Instant::now();

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend, turbo_tasks);
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 10 || count > 10000 {
            println!(
                "clear_dependencies({}) took {}: {:?}",
                count,
                FormatDuration(elapsed),
                self
            );
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

    fn full_state_mut(&self) -> FullTaskWriteGuard<'_> {
        TaskMetaStateWriteGuard::full_from(self.state.write(), self)
    }

    #[allow(dead_code, reason = "We need this in future")]
    fn partial_state_mut(&self) -> TaskMetaStateWriteGuard<'_> {
        TaskMetaStateWriteGuard::partial_from(self.state.write())
    }

    pub(crate) fn execute(
        self: &Task,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<TaskExecutionSpec> {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let dependencies;
        let (future, span) = {
            let mut state = self.full_state_mut();
            #[cfg(not(feature = "lazy_remove_children"))]
            let remove_job;
            match state.state_type {
                Done { .. } | InProgress { .. } | InProgressDirty { .. } => {
                    // should not start in this state
                    return None;
                }
                Scheduled {
                    ref mut event,
                    ref mut outdated_dependencies,
                } => {
                    let event = event.take();
                    dependencies = take(outdated_dependencies);
                    let outdated_children = take(&mut state.children);
                    let outdated_collectibles = take(&mut state.collectibles);
                    #[cfg(not(feature = "lazy_remove_children"))]
                    {
                        remove_job = state
                            .aggregation_node
                            .remove_children_job(&aggregation_context, outdated_children);
                    }
                    state.state_type = InProgress {
                        event,
                        count_as_finished: false,
                        #[cfg(feature = "lazy_remove_children")]
                        outdated_children,
                        outdated_collectibles,
                    };
                }
                Dirty { .. } => {
                    let state_type = Task::state_string(&state);
                    panic!(
                        "{:?} execution started in unexpected state {}",
                        self, state_type
                    )
                }
            };
            let result = self.make_execution_future(state, backend, turbo_tasks);
            #[cfg(not(feature = "lazy_remove_children"))]
            {
                remove_job();
            }
            #[allow(clippy::let_and_return)]
            result
        };
        aggregation_context.apply_queued_updates();
        self.clear_dependencies(dependencies, backend, turbo_tasks);
        Some(TaskExecutionSpec { future, span })
    }

    /// Prepares task execution and returns a future that will execute the task.
    fn make_execution_future(
        self: &Task,
        mut state: FullTaskWriteGuard<'_>,
        _backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> (Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>, Span) {
        match &self.ty {
            TaskType::Root(bound_fn) => {
                drop(state);
                (bound_fn(), tracing::trace_span!("turbo_tasks::root_task"))
            }
            TaskType::Once(mutex) => {
                drop(state);
                (
                    mutex.lock().take().expect("Task can only be executed once"),
                    tracing::trace_span!("turbo_tasks::once_task"),
                )
            }
            TaskType::Persistent { ty, .. } => match &***ty {
                PersistentTaskType::Native(native_fn, inputs) => {
                    let result =
                        if let PrepareTaskType::Native(func, bound_fn) = &state.prepared_type {
                            let span = func.span();
                            let entered = span.enter();
                            let future = bound_fn();
                            drop(entered);
                            (future, span)
                        } else {
                            let func = registry::get_function(*native_fn);
                            let span = func.span();
                            let entered = span.enter();
                            let bound_fn = func.bind(inputs);
                            let future = bound_fn();
                            drop(entered);
                            state.prepared_type = PrepareTaskType::Native(func, bound_fn);
                            (future, span)
                        };
                    drop(state);
                    result
                }
                PersistentTaskType::ResolveNative(ref native_fn_id, inputs) => {
                    let native_fn_id = *native_fn_id;
                    let span = if let &PrepareTaskType::Resolve(func) = &state.prepared_type {
                        func.resolve_span()
                    } else {
                        let func = registry::get_function(native_fn_id);
                        state.prepared_type = PrepareTaskType::Resolve(func);
                        func.resolve_span()
                    };
                    drop(state);
                    let entered = span.enter();
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    let future = Box::pin(PersistentTaskType::run_resolve_native(
                        native_fn_id,
                        inputs,
                        turbo_tasks,
                    ));
                    drop(entered);
                    (future, span)
                }
                PersistentTaskType::ResolveTrait(trait_type_id, name, inputs) => {
                    let trait_type_id = *trait_type_id;
                    let span =
                        if let PrepareTaskType::ResolveTrait(trait_type) = &state.prepared_type {
                            trait_type.resolve_span(name)
                        } else {
                            let trait_type = registry::get_trait(trait_type_id);
                            state.prepared_type = PrepareTaskType::ResolveTrait(trait_type);
                            trait_type.resolve_span(name)
                        };
                    drop(state);
                    let entered = span.enter();
                    let name = name.clone();
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    let future = Box::pin(PersistentTaskType::run_resolve_trait(
                        trait_type_id,
                        name,
                        inputs,
                        turbo_tasks,
                    ));
                    drop(entered);
                    (future, span)
                }
            },
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
        let TaskStateType::InProgress {
            ref mut count_as_finished,
            #[cfg(feature = "lazy_remove_children")]
            ref mut outdated_children,
            ref mut outdated_collectibles,
            ..
        } = state.state_type
        else {
            return;
        };
        if *count_as_finished {
            return;
        }
        *count_as_finished = true;
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            #[cfg(feature = "lazy_remove_children")]
            let outdated_children = take(outdated_children);
            let outdated_collectibles = outdated_collectibles.take_collectibles();

            let mut change = TaskChange {
                unfinished: -1,
                #[cfg(feature = "track_unfinished")]
                unfinished_tasks_update: vec![(self.id, -1)],
                ..Default::default()
            };
            if let Some(collectibles) = outdated_collectibles {
                for ((trait_type, value), count) in collectibles.into_iter() {
                    change.collectibles.push((trait_type, value, -count));
                }
            }
            let change_job = state
                .aggregation_node
                .apply_change(&aggregation_context, change);
            #[cfg(feature = "lazy_remove_children")]
            let remove_job = if outdated_children.is_empty() {
                None
            } else {
                Some(state.aggregation_node.handle_lost_edges(
                    &aggregation_context,
                    &self.id,
                    outdated_children,
                ))
            };
            drop(state);
            change_job.apply(&aggregation_context);
            #[cfg(feature = "lazy_remove_children")]
            remove_job.apply(&aggregation_context);
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
            InProgress { .. } => match result {
                Ok(Ok(result)) => {
                    if state.output != result {
                        if cfg!(feature = "print_task_invalidation")
                            && !matches!(state.output.content, OutputContent::Empty)
                        {
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
            InProgressDirty { .. } => {
                // We don't want to assign the output cell here
                // as we want to avoid unnecessary updates
                // TODO maybe this should be controlled by a heuristic
            }
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
        generation: u32,
        stateful: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut schedule_task = false;
        {
            let mut change_job = None;
            #[cfg(feature = "lazy_remove_children")]
            let mut remove_job = None;
            let mut dependencies = DEPENDENCIES_TO_TRACK.with(|deps| deps.take());
            {
                let mut state = self.full_state_mut();

                state
                    .gc
                    .execution_completed(duration, memory_usage, generation);
                match state.state_type {
                    InProgress {
                        ref mut event,
                        count_as_finished,
                        #[cfg(feature = "lazy_remove_children")]
                        ref mut outdated_children,
                        ref mut outdated_collectibles,
                    } => {
                        let event = event.take();
                        #[cfg(feature = "lazy_remove_children")]
                        let outdated_children = take(outdated_children);
                        let outdated_collectibles = outdated_collectibles.take_collectibles();
                        let mut dependencies = take(&mut dependencies);
                        if !backend.has_gc() {
                            // This will stay here for longer, so make sure to not consume too much
                            // memory
                            dependencies.shrink_to_fit();
                            for cells in state.cells.values_mut() {
                                cells.shrink_to_fit();
                            }
                            state.cells.shrink_to_fit();
                        }
                        state.state_type = Done {
                            stateful,
                            dependencies,
                        };
                        if !count_as_finished {
                            let mut change = TaskChange {
                                unfinished: -1,
                                #[cfg(feature = "track_unfinished")]
                                unfinished_tasks_update: vec![(self.id, -1)],
                                ..Default::default()
                            };
                            if let Some(collectibles) = outdated_collectibles {
                                for ((trait_type, value), count) in collectibles.into_iter() {
                                    change.collectibles.push((trait_type, value, -count));
                                }
                            }
                            change_job = state
                                .aggregation_node
                                .apply_change(&aggregation_context, change);
                        }
                        #[cfg(feature = "lazy_remove_children")]
                        if !outdated_children.is_empty() {
                            remove_job = state.aggregation_node.handle_lost_edges(
                                &aggregation_context,
                                &self.id,
                                outdated_children,
                            );
                        }
                        event.notify(usize::MAX);
                    }
                    InProgressDirty { ref mut event } => {
                        let event = event.take();
                        state.state_type = Scheduled {
                            event,
                            outdated_dependencies: Default::default(),
                        };
                        schedule_task = true;
                    }
                    Dirty { .. } | Scheduled { .. } | Done { .. } => {
                        panic!(
                            "Task execution completed in unexpected state {}",
                            Task::state_string(&state)
                        )
                    }
                };
            }
            if !dependencies.is_empty() {
                self.clear_dependencies(dependencies, backend, turbo_tasks);
            }
            change_job.apply(&aggregation_context);
            #[cfg(feature = "lazy_remove_children")]
            remove_job.apply(&aggregation_context);
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
        self.make_dirty_internal(false, backend, turbo_tasks);
    }

    fn make_dirty_internal(
        &self,
        force_schedule: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }

        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let active = query_root_info(&aggregation_context, ActiveQuery::default(), self.id);

        let state = if force_schedule {
            TaskMetaStateWriteGuard::Full(self.full_state_mut())
        } else {
            self.state_mut()
        };
        if let TaskMetaStateWriteGuard::Full(mut state) = state {
            match state.state_type {
                Scheduled { .. } | InProgressDirty { .. } => {
                    // already dirty
                    drop(state);
                }
                Dirty {
                    ref mut outdated_dependencies,
                    ..
                } => {
                    if force_schedule {
                        let description = self.get_event_description();
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                            outdated_dependencies: take(outdated_dependencies),
                        };
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
                    } else {
                        // already dirty
                        drop(state);
                    }
                }
                Done {
                    ref mut dependencies,
                    ..
                } => {
                    let outdated_dependencies = take(dependencies);
                    // add to dirty lists and potentially schedule
                    let description = self.get_event_description();
                    let should_schedule = force_schedule || active;
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
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                            outdated_dependencies,
                        };
                        drop(state);
                        change_job.apply(&aggregation_context);

                        if cfg!(feature = "print_task_invalidation") {
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
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                            outdated_dependencies,
                        };
                        drop(state);
                        change_job.apply(&aggregation_context);
                    }
                }
                InProgress {
                    ref mut event,
                    count_as_finished,
                    #[cfg(feature = "lazy_remove_children")]
                    ref mut outdated_children,
                    ref mut outdated_collectibles,
                } => {
                    let event = event.take();
                    #[cfg(feature = "lazy_remove_children")]
                    let outdated_children = take(outdated_children);
                    let outdated_collectibles = outdated_collectibles.take_collectibles();
                    let change = if count_as_finished {
                        let mut change = TaskChange {
                            unfinished: 1,
                            #[cfg(feature = "track_unfinished")]
                            unfinished_tasks_update: vec![(self.id, 1)],
                            ..Default::default()
                        };
                        if let Some(collectibles) = outdated_collectibles {
                            for ((trait_type, value), count) in collectibles.into_iter() {
                                change.collectibles.push((trait_type, value, -count));
                            }
                        }
                        Some(change)
                    } else if let Some(collectibles) = outdated_collectibles {
                        let mut change = TaskChange::default();
                        for ((trait_type, value), count) in collectibles.into_iter() {
                            change.collectibles.push((trait_type, value, -count));
                        }
                        Some(change)
                    } else {
                        None
                    };
                    let change_job = change.and_then(|change| {
                        state
                            .aggregation_node
                            .apply_change(&aggregation_context, change)
                    });
                    #[cfg(feature = "lazy_remove_children")]
                    let remove_job = state.aggregation_node.handle_lost_edges(
                        &aggregation_context,
                        &self.id,
                        outdated_children,
                    );
                    state.state_type = InProgressDirty { event };
                    drop(state);
                    change_job.apply(&aggregation_context);
                    #[cfg(feature = "lazy_remove_children")]
                    remove_job.apply(&aggregation_context);
                }
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
            ref mut event,
            ref mut outdated_dependencies,
        } = state.state_type
        {
            let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
            state.state_type = Scheduled {
                event: event.take(),
                outdated_dependencies: take(outdated_dependencies),
            };
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

    pub(crate) fn add_dependency_to_current(dep: TaskDependency) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
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

    /// Called when the task need to be recomputed because a gc'ed cell was
    /// read.
    pub(crate) fn recompute(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let _span = tracing::trace_span!("turbo_tasks::recompute", id = *self.id).entered();
        self.make_dirty_internal(true, backend, turbo_tasks)
    }

    /// Access to the output cell.
    pub(crate) fn with_output_mut_if_available<T>(
        &self,
        func: impl FnOnce(&mut Output) -> T,
    ) -> Option<T> {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            Some(func(&mut state.output))
        } else {
            None
        }
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut<T>(
        &self,
        index: CellId,
        gc_queue: Option<&GcQueue>,
        func: impl FnOnce(&mut Cell) -> T,
    ) -> T {
        let mut state = self.full_state_mut();
        if let Some(gc_queue) = gc_queue {
            let generation = gc_queue.generation();
            if state.gc.on_read(generation) {
                gc_queue.task_accessed(self.id);
            }
        }
        let list = state.cells.entry(index.type_id).or_default();
        let i = index.index as usize;
        if list.len() <= i {
            list.resize_with(i + 1, Default::default);
        }
        func(&mut list[i])
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut_if_available<T>(
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
            InProgress {
                count_as_finished: false,
                ..
            } => "in progress",
            InProgress {
                count_as_finished: true,
                ..
            } => "in progress (marked as finished)",
            InProgressDirty { .. } => "in progress (dirty)",
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
                if state.children.insert(child_id) {
                    #[cfg(feature = "lazy_remove_children")]
                    if let TaskStateType::InProgress {
                        outdated_children, ..
                    } = &mut state.state_type
                    {
                        if outdated_children.remove(&child_id) {
                            drop(state);
                            aggregation_context.apply_queued_updates();
                            return;
                        }
                    }
                    let number_of_children = state.children.len();
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
        strongly_consistent: bool,
        func: F,
        note: impl Fn() -> String + Sync + Send + 'static,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Result<Result<T, EventListener>> {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        if strongly_consistent {
            prepare_aggregation_data(&aggregation_context, &self.id);
        }
        let mut state = if strongly_consistent {
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
            TaskMetaStateWriteGuard::full_from(state, self)
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
                ref mut event,
                ref mut outdated_dependencies,
            } => {
                turbo_tasks.schedule(self.id);
                let event = event.take();
                let listener = event.listen_with_note(note);
                state.state_type = Scheduled {
                    event,
                    outdated_dependencies: take(outdated_dependencies),
                };
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
            Scheduled { ref event, .. }
            | InProgress { ref event, .. }
            | InProgressDirty { ref event } => {
                let listener = event.listen_with_note(note);
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
    ) -> AutoMap<RawVc, i32> {
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
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut state = self.full_state_mut();
        state.collectibles.emit(trait_type, collectible);
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

    pub(crate) fn run_gc(&self, generation: u32) -> bool {
        if !self.is_pure() {
            return false;
        }

        let mut cells_to_drop = Vec::new();

        let result = if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            if state.gc.generation > generation {
                return false;
            }

            match &mut state.state_type {
                TaskStateType::Done {
                    dependencies,
                    stateful,
                    ..
                } => {
                    dependencies.shrink_to_fit();
                    if *stateful {
                        return false;
                    }
                }
                TaskStateType::Dirty { .. } => {}
                _ => {
                    // GC can't run in this state. We will reschedule it when the execution
                    // completes.
                    return false;
                }
            }

            // shrinking memory and dropping cells
            state.output.dependent_tasks.shrink_to_fit();
            state.cells.shrink_to_fit();
            for cells in state.cells.values_mut() {
                cells.shrink_to_fit();
                for cell in cells.iter_mut() {
                    if cell.has_value() {
                        cells_to_drop.extend(cell.gc_content());
                    }
                    cell.shrink_to_fit();
                }
            }
            true
        } else {
            false
        };

        drop(cells_to_drop);

        result
    }

    pub(crate) fn gc_state(&self) -> Option<GcTaskState> {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            Some(state.gc)
        } else {
            None
        }
    }

    // TODO not used yet, but planned
    #[allow(dead_code)]
    fn unload(
        &self,
        mut full_state: FullTaskWriteGuard<'_>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut clear_dependencies = None;
        let mut change_job = None;
        let TaskState {
            ref mut aggregation_node,
            ref mut state_type,
            ..
        } = *full_state;
        match state_type {
            Done {
                ref mut dependencies,
                stateful,
            } => {
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
                clear_dependencies = Some(take(dependencies));
            }
            Dirty {
                ref event,
                ref mut outdated_dependencies,
            } => {
                // We want to get rid of this Event, so notify it to make sure it's empty.
                event.notify(usize::MAX);
                if !outdated_dependencies.is_empty() {
                    clear_dependencies = Some(take(outdated_dependencies));
                }
            }
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
            children,
            cells,
            output,
            collectibles,
            mut aggregation_node,
            // can be dropped as it can be recomputed
            prepared_type: _,
            // can be dropped as always Dirty, event has been notified above
            state_type: _,
            // can be dropped as only gc meta info
            gc: _,
        } = old_state.into_full().unwrap();

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
        // removing dependencies We can clear the dependencies as we are already
        // marked as dirty
        if let Some(dependencies) = clear_dependencies {
            self.clear_dependencies(dependencies, backend, turbo_tasks);
        }

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
