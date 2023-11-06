mod aggregation;
mod meta_state;
mod stats;

use std::{
    borrow::Cow,
    cell::RefCell,
    cmp::{max, Reverse},
    collections::{HashMap, HashSet},
    fmt::{
        Debug, Display, Formatter, {self},
    },
    future::Future,
    hash::Hash,
    mem::{replace, take},
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use auto_hash_map::{AutoMap, AutoSet};
use nohash_hasher::BuildNoHashHasher;
use parking_lot::{Mutex, RwLock};
use smallvec::SmallVec;
use stats::TaskStats;
use tokio::task_local;
use turbo_tasks::{
    backend::{PersistentTaskType, TaskExecutionSpec},
    event::{Event, EventListener},
    get_invalidator, registry, CellId, Invalidator, RawVc, StatsType, TaskId, TaskIdSet,
    TraitTypeId, TurboTasksBackendApi, ValueTypeId,
};

use crate::{
    aggregation_tree::{aggregation_info, ensure_thresholds},
    cell::Cell,
    gc::{to_exp_u8, GcPriority, GcStats, GcTaskState},
    output::{Output, OutputContent},
    stats::{ReferenceType, StatsReferences, StatsTaskType},
    task::aggregation::{TaskAggregationContext, TaskChange},
    MemoryBackend,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

#[derive(Hash, Copy, Clone, PartialEq, Eq)]
pub enum TaskDependency {
    Output(TaskId),
    Cell(TaskId, CellId),
    Collectibles(TaskId, TraitTypeId),
}

task_local! {
    /// Cells/Outputs/Collectibles that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<AutoSet<TaskDependency>>;
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
    Persistent { ty: Arc<PersistentTaskType> },
}

enum TaskTypeForDescription {
    Root,
    Once,
    Persistent(Arc<PersistentTaskType>),
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
    Native(NativeTaskFn),
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
                TaskMetaStateReadGuard::Unloaded(_) => {
                    result.field("state", &"unloaded");
                }
            }
        }
        result.finish()
    }
}

/// The full state of a [Task], it includes all information.
struct TaskState {
    aggregation_leaf: TaskAggregationTreeLeaf,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// true, when the task has state and that can't be dropped
    stateful: bool,

    /// Children are only modified from execution
    children: TaskIdSet,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,

    /// Preparations done for the task type with the bound arguments, e. g.
    /// argument validation
    prepared_type: PrepareTaskType,

    output: Output,
    cells: AutoMap<ValueTypeId, SmallVec<[Cell; 1]>, BuildNoHashHasher<ValueTypeId>>,

    // GC state:
    gc: GcTaskState,

    // Stats:
    stats: TaskStats,
}

impl TaskState {
    fn new(
        description: impl Fn() -> String + Send + Sync + 'static,
        stats_type: StatsType,
    ) -> Self {
        Self {
            aggregation_leaf: TaskAggregationTreeLeaf::new(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_scheduled(
        description: impl Fn() -> String + Send + Sync + 'static,
        stats_type: StatsType,
    ) -> Self {
        Self {
            aggregation_leaf: TaskAggregationTreeLeaf::new(),
            state_type: Scheduled {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(stats_type),
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
    stats_type: StatsType,
    aggregation_leaf: TaskAggregationTreeLeaf,
}

impl PartialTaskState {
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            aggregation_leaf: self.aggregation_leaf,
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }
}

/// A fully unloaded task state. It's equal to a partial task state without
/// being referenced by any parent. This state is stored inlined instead of in a
/// [Box] to reduce the memory consumption. Make sure to not add more fields
/// than the size of a [Box].
struct UnloadedTaskState {
    stats_type: StatsType,
}

#[cfg(test)]
#[test]
fn test_unloaded_task_state_size() {
    assert!(std::mem::size_of::<UnloadedTaskState>() <= std::mem::size_of::<Box<()>>());
}

impl UnloadedTaskState {
    fn into_full(self, description: impl Fn() -> String + Send + Sync + 'static) -> TaskState {
        TaskState {
            aggregation_leaf: TaskAggregationTreeLeaf::new(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({})::event", description())),
            },
            stateful: false,
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            gc: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }

    fn into_partial(self) -> PartialTaskState {
        PartialTaskState {
            aggregation_leaf: TaskAggregationTreeLeaf::new(),
            stats_type: self.stats_type,
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
        /// Cells/Outputs/Collectibles that the task has read during execution.
        /// The Task will keep these tasks alive as invalidations that happen
        /// there might affect this task.
        ///
        /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
        dependencies: AutoSet<TaskDependency>,
    },

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty { event: Event },

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress or Dirty depending on active flag
    Scheduled { event: Event },

    /// Execution is happening
    ///
    /// on finish this will move to Done
    ///
    /// on invalidation this will move to InProgressDirty
    InProgress {
        event: Event,
        count_as_finished: bool,
        /// Collectibles that need to be disconnected once leaving this state
        outdated_collectibles: MaybeCollectibles,
    },

    /// Invalid execution is happening
    ///
    /// on finish this will move to Dirty or Scheduled depending on active flag
    InProgressDirty { event: Event },
}

use TaskStateType::*;

use self::{
    aggregation::{RootInfoType, RootType, TaskAggregationTreeLeaf, TaskGuard},
    meta_state::{
        FullTaskWriteGuard, TaskMetaState, TaskMetaStateReadGuard, TaskMetaStateWriteGuard,
    },
};

impl Task {
    pub(crate) fn new_persistent(
        id: TaskId,
        task_type: Arc<PersistentTaskType>,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Persistent { ty: task_type };
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new(
                description,
                stats_type,
            )))),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Root(Box::new(Box::new(functor)));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new_scheduled(
                description,
                stats_type,
            )))),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        let ty = TaskType::Once(Box::new(Mutex::new(Some(Box::pin(functor)))));
        let description = Self::get_event_description_static(id, &ty);
        Self {
            id,
            ty,
            state: RwLock::new(TaskMetaState::Full(Box::new(TaskState::new_scheduled(
                description,
                stats_type,
            )))),
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
            aggregation_context.aggregation_info(id).lock().root_type = Some(RootType::Root);
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
            aggregation_context.aggregation_info(id).lock().root_type = Some(RootType::Once);
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn unset_root(
        id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        {
            aggregation_context.aggregation_info(id).lock().root_type = None;
        }
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn get_function_name(&self) -> Option<Cow<'static, str>> {
        if let TaskType::Persistent { ty, .. } = &self.ty {
            match &**ty {
                PersistentTaskType::Native(native_fn, _)
                | PersistentTaskType::ResolveNative(native_fn, _) => {
                    return Some(Cow::Borrowed(&registry::get_function(*native_fn).name));
                }
                PersistentTaskType::ResolveTrait(trait_id, fn_name, _) => {
                    return Some(
                        format!("{}::{}", registry::get_trait(*trait_id).name, fn_name).into(),
                    );
                }
            }
        }
        None
    }

    pub(crate) fn get_description(&self) -> String {
        Self::format_description(&TaskTypeForDescription::from(&self.ty), self.id)
    }

    fn format_description(ty: &TaskTypeForDescription, id: TaskId) -> String {
        match ty {
            TaskTypeForDescription::Root => format!("[{}] root", id),
            TaskTypeForDescription::Once => format!("[{}] once", id),
            TaskTypeForDescription::Persistent(ty) => match &**ty {
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
                let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
                let aggregation = aggregation_context.aggregation_info(task);
                aggregation
                    .lock()
                    .remove_collectible_dependent_task(trait_type, reader);
            }
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(
        &self,
        dependencies: AutoSet<TaskDependency>,
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
        dependencies: AutoSet<TaskDependency>,
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
        let future;
        {
            let remove_job;
            let mut state = self.full_state_mut();
            match state.state_type {
                Done { .. } | InProgress { .. } | InProgressDirty { .. } => {
                    // should not start in this state
                    return None;
                }
                Scheduled { ref mut event } => {
                    let event: Event = event.take();
                    let outdated_children = take(&mut state.children);
                    remove_job = Some(
                        state
                            .aggregation_leaf
                            .remove_children_job(&aggregation_context, outdated_children),
                    );
                    let outdated_collectibles = take(&mut state.collectibles);
                    state.state_type = InProgress {
                        event,
                        count_as_finished: false,
                        outdated_collectibles,
                    };
                    state.stats.increment_executions();
                }
                Dirty { .. } => {
                    let state_type = Task::state_string(&state);
                    panic!(
                        "{:?} execution started in unexpected state {}",
                        self, state_type
                    )
                }
            };
            future = self.make_execution_future(state, backend, turbo_tasks);
            if let Some(remove_job) = remove_job {
                remove_job();
            }
        }
        aggregation_context.apply_queued_updates();
        Some(TaskExecutionSpec { future })
    }

    /// Prepares task execution and returns a future that will execute the task.
    fn make_execution_future(
        self: &Task,
        mut state: FullTaskWriteGuard<'_>,
        _backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> {
        match &self.ty {
            TaskType::Root(bound_fn) => {
                drop(state);
                bound_fn()
            }
            TaskType::Once(mutex) => {
                drop(state);
                mutex.lock().take().expect("Task can only be executed once")
            }
            TaskType::Persistent { ty, .. } => match &**ty {
                PersistentTaskType::Native(native_fn, inputs) => {
                    let future = if let PrepareTaskType::Native(bound_fn) = &state.prepared_type {
                        bound_fn()
                    } else {
                        let bound_fn = registry::get_function(*native_fn).bind(inputs);
                        let future = bound_fn();
                        state.prepared_type = PrepareTaskType::Native(bound_fn);
                        future
                    };
                    drop(state);
                    future
                }
                PersistentTaskType::ResolveNative(ref native_fn, inputs) => {
                    drop(state);
                    let native_fn = *native_fn;
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    Box::pin(PersistentTaskType::run_resolve_native(
                        native_fn,
                        inputs,
                        turbo_tasks,
                    ))
                }
                PersistentTaskType::ResolveTrait(trait_type, name, inputs) => {
                    drop(state);
                    let trait_type = *trait_type;
                    let name = name.clone();
                    let inputs = inputs.clone();
                    let turbo_tasks = turbo_tasks.pin();
                    Box::pin(PersistentTaskType::run_resolve_trait(
                        trait_type,
                        name,
                        inputs,
                        turbo_tasks,
                    ))
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
                .aggregation_leaf
                .change_job(&aggregation_context, change);
            drop(state);
            change_job();
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
        instant: Instant,
        stateful: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut schedule_task = false;
        {
            let mut change_job = None;
            let mut dependencies = DEPENDENCIES_TO_TRACK.with(|deps| deps.take());
            {
                let mut state = self.full_state_mut();

                state
                    .stats
                    .register_execution(duration, turbo_tasks.program_duration_until(instant));
                match state.state_type {
                    InProgress {
                        ref mut event,
                        count_as_finished,
                        ref mut outdated_collectibles,
                    } => {
                        let event = event.take();
                        let outdated_collectibles = outdated_collectibles.take_collectibles();
                        let mut dependencies = take(&mut dependencies);
                        // This will stay here for longer, so make sure to not consume too much
                        // memory
                        dependencies.shrink_to_fit();
                        for cells in state.cells.values_mut() {
                            cells.shrink_to_fit();
                        }
                        state.cells.shrink_to_fit();
                        state.stateful = stateful;
                        state.state_type = Done { dependencies };
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
                            change_job = Some(
                                state
                                    .aggregation_leaf
                                    .change_job(&aggregation_context, change),
                            );
                        }
                        event.notify(usize::MAX);
                    }
                    InProgressDirty { ref mut event } => {
                        let event = event.take();
                        state.state_type = Scheduled { event };
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
            if let Some(job) = change_job {
                job();
            }
        }
        if let TaskType::Once(_) = self.ty {
            // unset the root type, so tasks below are no longer active
            aggregation_context
                .aggregation_info(self.id)
                .lock()
                .root_type = None;
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

        let state = if force_schedule {
            TaskMetaStateWriteGuard::Full(self.full_state_mut())
        } else {
            self.state_mut()
        };
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        if let TaskMetaStateWriteGuard::Full(mut state) = state {
            let mut clear_dependencies = AutoSet::default();

            match state.state_type {
                Scheduled { .. } | InProgressDirty { .. } => {
                    // already dirty
                    drop(state);
                }
                Dirty { .. } => {
                    if force_schedule {
                        let description = self.get_event_description();
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        state.aggregation_leaf.change(
                            &TaskAggregationContext::new(turbo_tasks, backend),
                            &TaskChange {
                                dirty_tasks_update: vec![(self.id, -1)],
                                ..Default::default()
                            },
                        );
                        drop(state);
                        turbo_tasks.schedule(self.id);
                    } else {
                        // already dirty
                        drop(state);
                    }
                }
                Done {
                    ref mut dependencies,
                } => {
                    let mut has_set_unfinished = false;
                    clear_dependencies = take(dependencies);
                    // add to dirty lists and potentially schedule
                    let description = self.get_event_description();
                    let should_schedule = force_schedule
                        || state
                            .aggregation_leaf
                            .get_root_info(&aggregation_context, &RootInfoType::IsActive)
                        || {
                            state.aggregation_leaf.change(
                                &aggregation_context,
                                &TaskChange {
                                    unfinished: 1,
                                    #[cfg(feature = "track_unfinished")]
                                    unfinished_tasks_update: vec![(self.id, 1)],
                                    dirty_tasks_update: vec![(self.id, 1)],
                                    ..Default::default()
                                },
                            );
                            has_set_unfinished = true;
                            if aggregation_context.take_scheduled_dirty_task(self.id) {
                                state.aggregation_leaf.change(
                                    &aggregation_context,
                                    &TaskChange {
                                        dirty_tasks_update: vec![(self.id, -1)],
                                        ..Default::default()
                                    },
                                );
                                true
                            } else {
                                false
                            }
                        };
                    if !has_set_unfinished {
                        state.aggregation_leaf.change(
                            &aggregation_context,
                            &TaskChange {
                                unfinished: 1,
                                #[cfg(feature = "track_unfinished")]
                                unfinished_tasks_update: vec![(self.id, 1)],
                                ..Default::default()
                            },
                        );
                    }
                    if should_schedule {
                        state.state_type = Scheduled {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        drop(state);

                        if cfg!(feature = "print_task_invalidation") {
                            println!("invalidated Task {{ id: {}, name: {} }}", *self.id, self.ty);
                        }
                        turbo_tasks.schedule(self.id);
                    } else {
                        state.state_type = Dirty {
                            event: Event::new(move || {
                                format!("TaskState({})::event", description())
                            }),
                        };
                        drop(state);
                    }
                }
                InProgress {
                    ref mut event,
                    count_as_finished,
                    ref mut outdated_collectibles,
                } => {
                    let event = event.take();
                    let outdated_collectibles = outdated_collectibles.take_collectibles();
                    let mut change_job = None;
                    if count_as_finished {
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
                        change_job = Some(
                            state
                                .aggregation_leaf
                                .change_job(&aggregation_context, change),
                        );
                    }
                    state.state_type = InProgressDirty { event };
                    drop(state);
                    if let Some(job) = change_job {
                        job();
                    }
                }
            }

            if !clear_dependencies.is_empty() {
                self.clear_dependencies(clear_dependencies, backend, turbo_tasks);
            }
        }
    }

    pub(crate) fn schedule_when_dirty_from_aggregation(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) {
        let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        let mut state = self.full_state_mut();
        if let TaskStateType::Dirty { ref mut event } = state.state_type {
            state.state_type = Scheduled {
                event: event.take(),
            };
            let job = state.aggregation_leaf.change_job(
                &aggregation_context,
                TaskChange {
                    dirty_tasks_update: vec![(self.id, -1)],
                    ..Default::default()
                },
            );
            drop(state);
            turbo_tasks.schedule(self.id);
            job();
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
    pub(crate) fn with_cell_mut<T>(&self, index: CellId, func: impl FnOnce(&mut Cell) -> T) -> T {
        let mut state = self.full_state_mut();
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

    /// For testing purposes
    pub fn reset_executions(&self) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            state.stats.reset_executions()
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

    pub fn reset_stats(&self) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            state.stats.reset();
        }
    }

    pub fn get_stats_info(&self, _backend: &MemoryBackend) -> TaskStatsInfo {
        match self.state() {
            TaskMetaStateReadGuard::Full(state) => {
                let (total_duration, last_duration, executions) = match &state.stats {
                    TaskStats::Essential(stats) => (None, stats.last_duration(), None),
                    TaskStats::Full(stats) => (
                        Some(stats.total_duration()),
                        stats.last_duration(),
                        Some(stats.executions()),
                    ),
                };

                TaskStatsInfo {
                    total_duration,
                    last_duration,
                    executions,
                    unloaded: false,
                }
            }
            TaskMetaStateReadGuard::Partial(_) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                unloaded: true,
            },
            TaskMetaStateReadGuard::Unloaded(_) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                unloaded: true,
            },
        }
    }

    pub fn get_stats_type(self: &Task) -> StatsTaskType {
        match &self.ty {
            TaskType::Root(_) => StatsTaskType::Root(self.id),
            TaskType::Once(_) => StatsTaskType::Once(self.id),
            TaskType::Persistent { ty, .. } => match &**ty {
                PersistentTaskType::Native(f, _) => StatsTaskType::Native(*f),
                PersistentTaskType::ResolveNative(f, _) => StatsTaskType::ResolveNative(*f),
                PersistentTaskType::ResolveTrait(t, n, _) => {
                    StatsTaskType::ResolveTrait(*t, n.to_string())
                }
            },
        }
    }

    pub fn get_stats_references(&self) -> StatsReferences {
        let mut refs = Vec::new();
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            for child in state.children.iter() {
                refs.push((ReferenceType::Child, *child));
            }
            if let Done { ref dependencies } = state.state_type {
                for dep in dependencies.iter() {
                    match dep {
                        TaskDependency::Output(task)
                        | TaskDependency::Cell(task, _)
                        | TaskDependency::Collectibles(task, _) => {
                            refs.push((ReferenceType::Dependency, *task))
                        }
                    }
                }
            }
        }
        if let TaskType::Persistent { ty, .. } = &self.ty {
            match &**ty {
                PersistentTaskType::Native(_, inputs)
                | PersistentTaskType::ResolveNative(_, inputs)
                | PersistentTaskType::ResolveTrait(_, _, inputs) => {
                    for input in inputs.iter() {
                        if let Some(task) = input.get_task_id() {
                            refs.push((ReferenceType::Input, task));
                        }
                    }
                }
            }
        }
        StatsReferences { tasks: refs }
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
            let thresholds_job;
            let mut add_job = None;
            {
                let mut guard = TaskGuard {
                    id: self.id,
                    guard: self.state_mut(),
                };
                thresholds_job = ensure_thresholds(&aggregation_context, &mut guard);
                let TaskGuard { guard, .. } = guard;
                let mut state = TaskMetaStateWriteGuard::full_from(guard.into_inner(), self);
                if state.children.insert(child_id) {
                    add_job = Some(
                        state
                            .aggregation_leaf
                            .add_child_job(&aggregation_context, &child_id),
                    );
                }
            }
            thresholds_job();
            if let Some(job) = add_job {
                // To avoid bubbling up the dirty tasks into the new parent tree, we make a
                // quick check for activeness of the parent when the child is dirty. This is
                // purely an optimization and not required for correctness.
                // So it's fine to ignore the race condition existing here.
                backend.with_task(child_id, |child| {
                    if child.is_dirty() {
                        let active = self
                            .full_state_mut()
                            .aggregation_leaf
                            .get_root_info(&aggregation_context, &RootInfoType::IsActive);
                        if active {
                            child.schedule_when_dirty_from_aggregation(backend, turbo_tasks);
                        }
                    }
                });
                job();
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
        let aggregation_when_strongly_consistent =
            strongly_consistent.then(|| aggregation_info(&aggregation_context, &self.id));
        let mut state = self.full_state_mut();
        if let Some(aggregation) = aggregation_when_strongly_consistent {
            {
                let aggregation = aggregation.lock();
                if aggregation.unfinished > 0 {
                    let listener = aggregation.unfinished_event.listen_with_note(note);
                    drop(aggregation);
                    drop(state);
                    aggregation_context.apply_queued_updates();

                    return Ok(Err(listener));
                }
            }
        }
        let result = match state.state_type {
            Done { .. } => {
                let result = func(&mut state.output)?;
                drop(state);

                Ok(Ok(result))
            }
            Dirty { ref mut event } => {
                turbo_tasks.schedule(self.id);
                let event = event.take();
                let listener = event.listen_with_note(note);
                state.state_type = Scheduled { event };
                state.aggregation_leaf.change(
                    &aggregation_context,
                    &TaskChange {
                        dirty_tasks_update: vec![(self.id, -1)],
                        ..Default::default()
                    },
                );
                drop(state);
                Ok(Err(listener))
            }
            Scheduled { ref event }
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
        let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
        aggregation_context
            .aggregation_info(id)
            .lock()
            .read_collectibles(trait_type, reader)
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
        state.aggregation_leaf.change(
            &aggregation_context,
            &TaskChange {
                collectibles: vec![(trait_type, collectible, 1)],
                ..Default::default()
            },
        );
        drop(state);
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
        state.aggregation_leaf.change(
            &aggregation_context,
            &TaskChange {
                collectibles: vec![(trait_type, collectible, -(count as i32))],
                ..Default::default()
            },
        );
        drop(state);
        aggregation_context.apply_queued_updates();
    }

    pub(crate) fn gc_check_inactive(&self, backend: &MemoryBackend) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            if state.gc.inactive {
                return;
            }
            state.gc.inactive = true;
            backend.on_task_flagged_inactive(self.id, state.stats.last_duration());
            for &child in state.children.iter() {
                backend.on_task_might_become_inactive(child);
            }
        }
    }

    pub(crate) fn run_gc(
        &self,
        now_relative_to_start: Duration,
        max_priority: GcPriority,
        task_duration_cache: &mut HashMap<TaskId, Duration, BuildNoHashHasher<TaskId>>,
        stats: &mut GcStats,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<GcPriority> {
        if !self.is_pure() {
            stats.no_gc_needed += 1;
            return None;
        }
        let mut cells_to_drop = Vec::new();
        // We don't want to access other tasks under this task lock, so we aggregate
        // missing information first, gather it and then retry.
        let mut missing_durations = Vec::new();
        loop {
            // This might be slightly inaccurate as we don't hold the lock for the whole
            // duration so it might be too large when concurrent modifications
            // happen, but that's fine.
            let mut dependent_tasks_compute_duration = Duration::ZERO;
            let mut included_tasks = HashSet::with_hasher(BuildNoHashHasher::<TaskId>::default());
            // Fill up missing durations
            for task_id in missing_durations.drain(..) {
                backend.with_task(task_id, |task| {
                    let duration = task.gc_compute_duration();
                    task_duration_cache.insert(task_id, duration);
                    dependent_tasks_compute_duration += duration;
                })
            }

            if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
                if state.stateful {
                    stats.no_gc_possible += 1;
                    return None;
                }
                match &mut state.state_type {
                    TaskStateType::Done { dependencies } => {
                        dependencies.shrink_to_fit();
                    }
                    TaskStateType::Dirty { .. } => {}
                    _ => {
                        // GC can't run in this state. We will reschedule it when the execution
                        // completes.
                        stats.no_gc_needed += 1;
                        return None;
                    }
                }

                // Check if the task need to be activated again
                let active = if state.gc.inactive {
                    let active = state.aggregation_leaf.get_root_info(
                        &TaskAggregationContext::new(turbo_tasks, backend),
                        &RootInfoType::IsActive,
                    );
                    if active {
                        state.gc.inactive = false;
                        true
                    } else {
                        false
                    }
                } else {
                    true
                };

                let last_duration = state.stats.last_duration();
                let compute_duration = last_duration.into();

                let age = to_exp_u8(
                    (now_relative_to_start
                        .saturating_sub(state.stats.last_execution_relative_to_start()))
                    .as_secs(),
                );

                let min_prio_that_needs_total_duration = if active {
                    GcPriority::EmptyCells {
                        total_compute_duration: to_exp_u8(last_duration.as_millis() as u64),
                        age: Reverse(age),
                    }
                } else {
                    GcPriority::InactiveUnload {
                        total_compute_duration: to_exp_u8(last_duration.as_millis() as u64),
                        age: Reverse(age),
                    }
                };

                let need_total_duration = max_priority >= min_prio_that_needs_total_duration;
                let has_unused_cells = state.cells.values().any(|cells| {
                    cells
                        .iter()
                        .any(|cell| cell.has_value() && !cell.has_dependent_tasks())
                });

                let empty_unused_priority = if active {
                    GcPriority::EmptyUnusedCells { compute_duration }
                } else {
                    GcPriority::InactiveEmptyUnusedCells { compute_duration }
                };

                if !need_total_duration {
                    // Fast mode, no need for total duration

                    if has_unused_cells {
                        if empty_unused_priority <= max_priority {
                            // Empty unused cells
                            for cells in state.cells.values_mut() {
                                cells.shrink_to_fit();
                                for cell in cells.iter_mut() {
                                    if !cell.has_dependent_tasks() {
                                        cells_to_drop.extend(cell.gc_content());
                                    }
                                    cell.shrink_to_fit();
                                }
                            }
                            stats.empty_unused_fast += 1;
                            return Some(GcPriority::EmptyCells {
                                total_compute_duration: to_exp_u8(
                                    Duration::from(compute_duration).as_millis() as u64,
                                ),
                                age: Reverse(age),
                            });
                        } else {
                            stats.priority_updated_fast += 1;
                            return Some(empty_unused_priority);
                        }
                    } else if active {
                        stats.priority_updated += 1;
                        return Some(GcPriority::EmptyCells {
                            total_compute_duration: to_exp_u8(
                                Duration::from(compute_duration).as_millis() as u64,
                            ),
                            age: Reverse(age),
                        });
                    } else {
                        stats.priority_updated += 1;
                        return Some(GcPriority::InactiveUnload {
                            total_compute_duration: to_exp_u8(
                                Duration::from(compute_duration).as_millis() as u64,
                            ),
                            age: Reverse(age),
                        });
                    }
                } else {
                    // Slow mode, need to compute total duration

                    let mut has_used_cells = false;
                    for cells in state.cells.values_mut() {
                        for cell in cells.iter_mut() {
                            if cell.has_value() && cell.has_dependent_tasks() {
                                has_used_cells = true;
                                for &task_id in cell.dependent_tasks() {
                                    if included_tasks.insert(task_id) {
                                        if let Some(duration) = task_duration_cache.get(&task_id) {
                                            dependent_tasks_compute_duration += *duration;
                                        } else {
                                            missing_durations.push(task_id);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !active {
                        for &task_id in state.output.dependent_tasks() {
                            if included_tasks.insert(task_id) {
                                if let Some(duration) = task_duration_cache.get(&task_id) {
                                    dependent_tasks_compute_duration += *duration;
                                } else {
                                    missing_durations.push(task_id);
                                }
                            }
                        }
                    }

                    let total_compute_duration =
                        max(last_duration, dependent_tasks_compute_duration);
                    let total_compute_duration_u8 =
                        to_exp_u8(total_compute_duration.as_millis() as u64);

                    // When we have all information available, we can either run the GC or return a
                    // new GC priority.
                    if missing_durations.is_empty() {
                        let mut new_priority = GcPriority::Placeholder;
                        if !active {
                            new_priority = GcPriority::InactiveUnload {
                                age: Reverse(age),
                                total_compute_duration: total_compute_duration_u8,
                            };
                            if new_priority <= max_priority {
                                // Unload task
                                if self.unload(state, backend, turbo_tasks) {
                                    stats.unloaded += 1;
                                    return None;
                                } else {
                                    // unloading will fail if the task go active again
                                    return Some(GcPriority::EmptyCells {
                                        total_compute_duration: total_compute_duration_u8,
                                        age: Reverse(age),
                                    });
                                }
                            }
                        }

                        // always shrinking memory
                        state.output.dependent_tasks.shrink_to_fit();
                        if active && (has_unused_cells || has_used_cells) {
                            new_priority = GcPriority::EmptyCells {
                                total_compute_duration: total_compute_duration_u8,
                                age: Reverse(age),
                            };
                            if new_priority <= max_priority {
                                // Empty cells
                                let cells = take(&mut state.cells);
                                for cells in cells.into_values() {
                                    for mut cell in cells {
                                        if cell.has_value() {
                                            cells_to_drop.extend(cell.gc_content());
                                        }
                                    }
                                }
                                stats.empty_cells += 1;
                                return None;
                            }
                        }

                        // always shrinking memory
                        state.cells.shrink_to_fit();
                        if has_unused_cells && active {
                            new_priority = empty_unused_priority;
                            if new_priority <= max_priority {
                                // Empty unused cells
                                for cells in state.cells.values_mut() {
                                    cells.shrink_to_fit();
                                    for cell in cells.iter_mut() {
                                        if !cell.has_dependent_tasks() {
                                            cells_to_drop.extend(cell.gc_content());
                                        }
                                        cell.shrink_to_fit();
                                    }
                                }
                                stats.empty_unused += 1;
                                return Some(GcPriority::EmptyCells {
                                    total_compute_duration: total_compute_duration_u8,
                                    age: Reverse(age),
                                });
                            }
                        }

                        // Shrink memory
                        for cells in state.cells.values_mut() {
                            cells.shrink_to_fit();
                            for cell in cells.iter_mut() {
                                cell.shrink_to_fit();
                            }
                        }

                        // Return new gc priority if any
                        if new_priority != GcPriority::Placeholder {
                            stats.priority_updated += 1;

                            return Some(new_priority);
                        } else {
                            stats.no_gc_needed += 1;

                            return None;
                        }
                    }
                }
            } else {
                // Task is already unloaded, we are done with GC for it
                stats.no_gc_needed += 1;
                return None;
            }
        }
    }

    pub(crate) fn gc_compute_duration(&self) -> Duration {
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            state.stats.last_duration()
        } else {
            Duration::ZERO
        }
    }

    fn unload(
        &self,
        mut full_state: FullTaskWriteGuard<'_>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> bool {
        let mut clear_dependencies = None;
        let TaskState {
            ref mut aggregation_leaf,
            ref mut state_type,
            ..
        } = *full_state;
        match state_type {
            Done {
                ref mut dependencies,
            } => {
                let mut aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);
                aggregation_leaf.change(
                    &TaskAggregationContext::new(turbo_tasks, backend),
                    &TaskChange {
                        unfinished: 1,
                        dirty_tasks_update: vec![(self.id, 1)],
                        ..Default::default()
                    },
                );
                if aggregation_context.take_scheduled_dirty_task(self.id) {
                    // Unloading is only possible for inactive tasks.
                    // We need to abort the unloading, so revert changes done so far.
                    aggregation_leaf.change(
                        &TaskAggregationContext::new(turbo_tasks, backend),
                        &TaskChange {
                            unfinished: -1,
                            dirty_tasks_update: vec![(self.id, -1)],
                            ..Default::default()
                        },
                    );
                    return false;
                }
                clear_dependencies = Some(take(dependencies));
            }
            Dirty { ref event } => {
                // We want to get rid of this Event, so notify it to make sure it's empty.
                event.notify(usize::MAX);
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
            TaskMetaState::Unloaded(UnloadedTaskState {
                stats_type: StatsType::Essential,
            }),
        );
        let TaskState {
            children,
            cells,
            output,
            collectibles,
            aggregation_leaf,
            stats,
            // can be dropped as it will be recomputed on next execution
            stateful: _,
            // can be dropped as it can be recomputed
            prepared_type: _,
            // can be dropped as always Dirty, event has been notified above
            state_type: _,
            // can be dropped as only gc meta info
            gc: _,
        } = old_state.into_full().unwrap();

        let aggregation_context = TaskAggregationContext::new(turbo_tasks, backend);

        // Remove all children, as they will be added again when this task is executed
        // again
        if !children.is_empty() {
            for child in children {
                aggregation_leaf.remove_child(&aggregation_context, &child);
            }
        }

        // Remove all collectibles, as they will be added again when this task is
        // executed again.
        if let Some(collectibles) = collectibles.into_inner() {
            aggregation_leaf.change(
                &aggregation_context,
                &TaskChange {
                    collectibles: collectibles
                        .into_iter()
                        .map(|((t, r), c)| (t, r, -c))
                        .collect(),
                    ..Default::default()
                },
            );
        }

        // TODO aggregation_leaf
        let unset = !aggregation_leaf.has_upper();

        let stats_type = match stats {
            TaskStats::Essential(_) => StatsType::Essential,
            TaskStats::Full(_) => StatsType::Full,
        };
        if unset {
            *state = TaskMetaState::Unloaded(UnloadedTaskState { stats_type });
        } else {
            *state = TaskMetaState::Partial(Box::new(PartialTaskState {
                aggregation_leaf,
                stats_type,
            }));
        }
        drop(state);

        // Notify everyone that is listening on our output or cells.
        // This will mark everyone as dirty and will trigger a new execution when they
        // become active again.
        for cells in cells.into_values() {
            for cell in cells {
                cell.gc_drop(turbo_tasks);
            }
        }
        output.gc_drop(turbo_tasks);

        // We can clear the dependencies as we are already marked as dirty
        if let Some(dependencies) = clear_dependencies {
            self.clear_dependencies(dependencies, backend, turbo_tasks);
        }

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

pub struct TaskStatsInfo {
    pub total_duration: Option<Duration>,
    pub last_duration: Duration,
    pub executions: Option<u32>,
    pub unloaded: bool,
}
