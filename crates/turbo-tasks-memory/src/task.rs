mod meta_state;
mod stats;

use std::{
    borrow::Cow,
    cell::RefCell,
    cmp::{max, Ordering},
    collections::VecDeque,
    fmt::{self, Debug, Display, Formatter, Write},
    future::Future,
    hash::Hash,
    mem::{replace, take},
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use auto_hash_map::{AutoMap, AutoSet};
use parking_lot::{Mutex, RwLock};
use stats::TaskStats;
use tokio::task_local;
use turbo_tasks::{
    backend::{PersistentTaskType, TaskExecutionSpec},
    event::{Event, EventListener},
    get_invalidator, registry, CellId, Invalidator, RawVc, StatsType, TaskId, TraitTypeId,
    TurboTasksBackendApi, ValueTypeId,
};

use crate::{
    cell::Cell,
    count_hash_set::CountHashSet,
    memory_backend::Job,
    output::Output,
    scope::{ScopeChildChangeEffect, TaskScopeId, TaskScopes},
    stats::{ReferenceType, StatsReferences, StatsTaskType},
    MemoryBackend,
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

macro_rules! log_scope_update {
    ($($args:expr),+) => {
        #[cfg(feature = "print_scope_updates")]
        println!($($args),+);
    };
}

#[derive(Hash, Copy, Clone, PartialEq, Eq)]
pub enum TaskDependency {
    TaskOutput(TaskId),
    TaskCell(TaskId, CellId),
    ScopeChildren(TaskScopeId),
    ScopeCollectibles(TaskScopeId, TraitTypeId),
}

task_local! {
    /// Vc/Scopes that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<AutoSet<TaskDependency>>;
}

type OnceTaskFn = Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>;

/// Different Task types
enum TaskType {
    /// A root task that will track dependencies and re-execute when
    /// dependencies change. Task will eventually settle to the correct
    /// execution.
    Root(NativeTaskFn),

    // TODO implement these strongly consistency
    /// A single root task execution. It won't track dependencies.
    /// Task will definitely include all invalidations that happened before the
    /// start of the task. It may or may not include invalidations that
    /// happened after that. It may see these invalidations partially
    /// applied.
    Once(OnceTaskFn),

    /// A normal persistent task
    Persistent(Arc<PersistentTaskType>),
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Persistent(ty) => ty.fmt(f),
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
        result.field("type", &self.ty);
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
    scopes: TaskScopes,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// Children are only modified from execution
    children: AutoSet<TaskId>,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,

    /// Preparations done for the task type with the bound arguments, e. g.
    /// argument validation
    prepared_type: PrepareTaskType,

    output: Output,
    cells: AutoMap<ValueTypeId, Vec<Cell>>,

    // Stats:
    stats: TaskStats,
}

impl TaskState {
    fn new(id: TaskId, stats_type: StatsType) -> Self {
        Self {
            scopes: Default::default(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({id})::event")),
            },
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_scheduled_in_scope(id: TaskId, scope: TaskScopeId, stats_type: StatsType) -> Self {
        Self {
            scopes: TaskScopes::Inner(CountHashSet::from([scope]), 0),
            state_type: Scheduled {
                event: Event::new(move || format!("TaskState({id})::event")),
            },
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            prepared_type: PrepareTaskType::None,
            cells: Default::default(),
            stats: TaskStats::new(stats_type),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }
}

/// The partial task state. It's equal to a full TaskState with state = Dirty
/// and all other fields empty. It looks like a dirty task that has not been
/// executed yet. The task might still be in some task scopes.
/// A Task can get into this state when it is unloaded by garbage collection,
/// but is still attached to scopes.
struct PartialTaskState {
    stats_type: StatsType,
    scopes: TaskScopes,
}

impl PartialTaskState {
    fn into_full(self, id: TaskId) -> TaskState {
        TaskState {
            scopes: self.scopes,
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({id})::event")),
            },
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }
}

/// A fully unloaded task state. It's equal to a partial task state without
/// being attached to any scopes. This state is stored inlined instead of in a
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
    fn into_full(self, id: TaskId) -> TaskState {
        TaskState {
            scopes: Default::default(),
            state_type: Dirty {
                event: Event::new(move || format!("TaskState({id})::event")),
            },
            children: Default::default(),
            collectibles: Default::default(),
            prepared_type: PrepareTaskType::None,
            output: Default::default(),
            cells: Default::default(),
            stats: TaskStats::new(self.stats_type),
        }
    }

    fn into_partial(self) -> PartialTaskState {
        PartialTaskState {
            scopes: TaskScopes::Inner(CountHashSet::new(), 0),
            stats_type: self.stats_type,
        }
    }
}

/// Keeps track of emitted and unemitted collectibles. Defaults to None to avoid
/// allocating memory for two empty hashsets when no collectibles are emitted.
#[derive(Default)]
struct MaybeCollectibles {
    inner: Option<Box<Collectibles>>,
}

/// The collectibles of a task.
#[derive(Default)]
struct Collectibles {
    emitted: AutoSet<(TraitTypeId, RawVc)>,
    unemitted: AutoSet<(TraitTypeId, RawVc)>,
}

impl MaybeCollectibles {
    /// Consumes the collectibles (if any) and return them.
    fn take(&mut self) -> Option<Box<Collectibles>> {
        self.inner.take()
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
    fn emit(&mut self, trait_type: TraitTypeId, value: RawVc) -> bool {
        self.inner
            .get_or_insert_default()
            .emitted
            .insert((trait_type, value))
    }

    /// Unemits a collectible.
    fn unemit(&mut self, trait_type: TraitTypeId, value: RawVc) -> bool {
        self.inner
            .get_or_insert_default()
            .unemitted
            .insert((trait_type, value))
    }
}

enum TaskStateType {
    /// Ready
    ///
    /// on invalidation this will move to Dirty or Scheduled depending on active
    /// flag
    Done {
        /// Cells/Scopes that the task has read during execution.
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
    InProgress { event: Event },

    /// Invalid execution is happening
    ///
    /// on finish this will move to Dirty or Scheduled depending on active flag
    InProgressDirty { event: Event },
}

use TaskStateType::*;

use self::meta_state::{
    FullTaskWriteGuard, TaskMetaState, TaskMetaStateReadGuard, TaskMetaStateWriteGuard,
};

impl Task {
    pub(crate) fn new_persistent(
        id: TaskId,
        task_type: Arc<PersistentTaskType>,
        stats_type: StatsType,
    ) -> Self {
        Self {
            id,
            ty: TaskType::Persistent(task_type),
            state: RwLock::new(TaskMetaState::Full(box TaskState::new(id, stats_type))),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        Self {
            id,
            ty: TaskType::Root(Box::new(functor)),
            state: RwLock::new(TaskMetaState::Full(box TaskState::new_scheduled_in_scope(
                id, scope, stats_type,
            ))),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
        stats_type: StatsType,
    ) -> Self {
        Self {
            id,
            ty: TaskType::Once(Mutex::new(Some(Box::pin(functor)))),
            state: RwLock::new(TaskMetaState::Full(box TaskState::new_scheduled_in_scope(
                id, scope, stats_type,
            ))),
        }
    }

    pub(crate) fn get_description(&self) -> String {
        match &self.ty {
            TaskType::Root(..) => format!("[{}] root", self.id),
            TaskType::Once(..) => format!("[{}] once", self.id),
            TaskType::Persistent(ty) => match &**ty {
                PersistentTaskType::Native(native_fn, _) => {
                    format!("[{}] {}", self.id, registry::get_function(*native_fn).name)
                }
                PersistentTaskType::ResolveNative(native_fn, _) => {
                    format!(
                        "[{}] [resolve] {}",
                        self.id,
                        registry::get_function(*native_fn).name
                    )
                }
                PersistentTaskType::ResolveTrait(trait_type, fn_name, _) => {
                    format!(
                        "[{}] [resolve trait] {} in trait {}",
                        self.id,
                        fn_name,
                        registry::get_trait(*trait_type).name
                    )
                }
            },
        }
    }

    pub(crate) fn remove_dependency(dep: TaskDependency, reader: TaskId, backend: &MemoryBackend) {
        match dep {
            TaskDependency::TaskOutput(task) => {
                backend.with_task(task, |task| {
                    task.with_output_mut_if_available(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            TaskDependency::TaskCell(task, index) => {
                backend.with_task(task, |task| {
                    task.with_cell_mut_if_available(index, |cell| {
                        cell.remove_dependent_task(reader);
                    });
                });
            }
            TaskDependency::ScopeChildren(scope) => backend.with_scope(scope, |scope| {
                scope.remove_dependent_task(reader);
            }),
            TaskDependency::ScopeCollectibles(scope, trait_type) => {
                backend.with_scope(scope, |scope| {
                    scope.remove_collectible_dependent_task(trait_type, reader);
                })
            }
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(&self, dependencies: AutoSet<TaskDependency>, backend: &MemoryBackend) {
        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(&self, dependencies: AutoSet<TaskDependency>, backend: &MemoryBackend) {
        use std::time::Instant;

        use turbo_tasks::util::FormatDuration;
        let start = Instant::now();

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend);
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<TaskExecutionSpec> {
        let mut state = self.full_state_mut();
        if !self.try_start_execution(&mut state, turbo_tasks, backend) {
            return None;
        }
        let future = self.make_execution_future(&mut state, turbo_tasks);
        Some(TaskExecutionSpec { future })
    }

    /// Tries to change the state to InProgress and returns true if it was
    /// possible.
    fn try_start_execution(
        &self,
        state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
        backend: &MemoryBackend,
    ) -> bool {
        match state.state_type {
            Done { .. } | InProgress { .. } | InProgressDirty { .. } => {
                // should not start in this state
                return false;
            }
            Scheduled { ref mut event } => {
                state.state_type = InProgress {
                    event: event.take(),
                };
                state.stats.increment_executions();
                // TODO we need to reconsider the approach of doing scope changes in background
                // since they affect collectibles and need to be computed eagerly to allow
                // strongly_consistent to work properly.
                // We could move this operation to the point when the task execution is
                // finished.
                if !state.children.is_empty() {
                    let set = take(&mut state.children);
                    remove_from_scopes(set, &state.scopes, backend, turbo_tasks);
                }
                if let Some(collectibles) = state.collectibles.take() {
                    remove_collectible_from_scopes(
                        collectibles.emitted,
                        collectibles.unemitted,
                        &state.scopes,
                        backend,
                        turbo_tasks,
                    );
                }
            }
            Dirty { .. } => {
                let state_type = Task::state_string(&*state);
                panic!(
                    "{:?} execution started in unexpected state {}",
                    self, state_type
                )
            }
        };
        true
    }

    /// Prepares task execution and returns a future that will execute the task.
    fn make_execution_future(
        self: &Task,
        mut state: &mut TaskState,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Pin<Box<dyn Future<Output = Result<RawVc>> + Send>> {
        match &self.ty {
            TaskType::Root(bound_fn) => bound_fn(),
            TaskType::Once(mutex) => mutex.lock().take().expect("Task can only be executed once"),
            TaskType::Persistent(ty) => match &**ty {
                PersistentTaskType::Native(native_fn, inputs) => {
                    if let PrepareTaskType::Native(bound_fn) = &state.prepared_type {
                        bound_fn()
                    } else {
                        let bound_fn = registry::get_function(*native_fn).bind(inputs);
                        let future = bound_fn();
                        state.prepared_type = PrepareTaskType::Native(bound_fn);
                        future
                    }
                }
                PersistentTaskType::ResolveNative(ref native_fn, inputs) => {
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

    pub(crate) fn execution_result(
        &self,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        match state.state_type {
            InProgress { .. } => match result {
                Ok(Ok(result)) => state.output.link(result, turbo_tasks),
                Ok(Err(err)) => state.output.error(err, turbo_tasks),
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
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        let mut schedule_task = false;
        let mut dependencies = DEPENDENCIES_TO_TRACK.with(|deps| deps.take());
        {
            let mut state = self.full_state_mut();

            state
                .stats
                .register_execution(duration, turbo_tasks.program_duration_until(instant));
            match state.state_type {
                InProgress { ref mut event } => {
                    let event = event.take();
                    let mut dependencies = take(&mut dependencies);
                    // This will stay here for longer, so make sure to not consume too much memory
                    dependencies.shrink_to_fit();
                    for cells in state.cells.values_mut() {
                        cells.shrink_to_fit();
                    }
                    state.cells.shrink_to_fit();
                    state.state_type = Done { dependencies };
                    for scope in state.scopes.iter() {
                        backend.with_scope(scope, |scope| {
                            scope.decrement_unfinished_tasks(backend);
                        })
                    }
                    event.notify(usize::MAX);
                }
                InProgressDirty { ref mut event } => {
                    let event = event.take();
                    let active = self.scopes_dirty_or_active(false, &state.scopes, backend);
                    if active {
                        state.state_type = Scheduled { event };
                        schedule_task = true;
                    } else {
                        state.state_type = Dirty { event };
                    }
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
            self.clear_dependencies(dependencies, backend);
        }

        if let TaskType::Once(_) = self.ty {
            self.remove_root_or_initial_scope(backend, turbo_tasks);
        }

        schedule_task
    }

    /// When any scope is active it returns true. When no scope is active it
    /// returns false and adds the tasks to all scopes as dirty task.
    /// When `increment_unfinished` is true it will also increment the
    /// unfinished tasks for all scopes, independent of activeness.
    fn scopes_dirty_or_active(
        &self,
        increment_unfinished: bool,
        scopes: &TaskScopes,
        backend: &MemoryBackend,
    ) -> bool {
        if increment_unfinished {
            // We need to walk all scopes at least once to increment unfinished tasks.
            // While doing that we check if any scope is active.
            let mut active = false;
            for scope in scopes.iter() {
                backend.with_scope(scope, |scope| {
                    scope.increment_unfinished_tasks(backend);
                    active = active || scope.state.lock().is_active();
                })
            }
            if active {
                return true;
            }
        } else {
            // Without the need to increment unfinished for all scopes we can exit early
            if scopes
                .iter()
                .any(|scope| backend.with_scope(scope, |scope| scope.state.lock().is_active()))
            {
                return true;
            }
        }
        for (i, scope) in scopes.iter().enumerate() {
            let any_scope_was_active = backend.with_scope(scope, |scope| {
                let mut state = scope.state.lock();
                let is_active = state.is_active();
                if !is_active {
                    state.add_dirty_task(self.id);
                }
                is_active
            });
            if any_scope_was_active {
                // A scope is active, revert dirty task changes and return true
                for scope in scopes.iter().take(i + 1) {
                    backend.with_scope(scope, |scope| {
                        let mut state = scope.state.lock();
                        state.remove_dirty_task(self.id);
                    })
                }
                return true;
            }
        }
        // No scope is active. Task has been added as dirty task to all scopes
        false
    }

    fn make_dirty(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }

        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            let id = self.id;
            let mut clear_dependencies = AutoSet::new();

            match state.state_type {
                Dirty { .. } | Scheduled { .. } | InProgressDirty { .. } => {
                    // already dirty
                    drop(state);
                }
                Done {
                    ref mut dependencies,
                } => {
                    clear_dependencies = take(dependencies);
                    // add to dirty lists and potentially schedule
                    let active = self.scopes_dirty_or_active(true, &state.scopes, backend);
                    if active {
                        state.state_type = Scheduled {
                            event: Event::new(move || format!("TaskState({id})::event")),
                        };
                        drop(state);
                        turbo_tasks.schedule(self.id);
                    } else {
                        state.state_type = Dirty {
                            event: Event::new(move || format!("TaskState({id})::event")),
                        };
                        drop(state);
                    }
                }
                InProgress { ref mut event } => {
                    state.state_type = InProgressDirty {
                        event: event.take(),
                    };
                    drop(state);
                }
            }

            if !clear_dependencies.is_empty() {
                self.clear_dependencies(clear_dependencies, backend);
            }
        }
    }

    pub(crate) fn schedule_when_dirty_from_scope(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        if let TaskStateType::Dirty { ref mut event } = state.state_type {
            state.state_type = Scheduled {
                event: event.take(),
            };
            for scope in state.scopes.iter() {
                backend.with_scope(scope, |scope| {
                    scope.state.lock().remove_dirty_task(self.id);
                })
            }
            drop(state);
            turbo_tasks.schedule(self.id);
        }
    }

    pub(crate) fn add_to_scope_internal_shallow(
        &self,
        id: TaskScopeId,
        is_optimization_scope: bool,
        depth: usize,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
        queue: &mut VecDeque<(TaskId, usize)>,
    ) {
        let mut state = self.full_state_mut();
        let TaskState {
            ref mut scopes,
            ref children,
            ..
        } = *state;
        match *scopes {
            TaskScopes::Root(root) => {
                if root == id {
                    // The task is already in the root scope we're trying to add it to.
                    return;
                }

                if let Some(ScopeChildChangeEffect {
                    notify,
                    active,
                    parent,
                }) = backend.with_scope(id, |scope| scope.state.lock().add_child(root))
                {
                    drop(state);
                    if !notify.is_empty() {
                        turbo_tasks.schedule_notify_tasks_set(&notify);
                    }
                    if active {
                        backend.increase_scope_active(root, turbo_tasks);
                    }
                    if parent {
                        backend.with_scope(root, |child| {
                            child.add_parent(id, backend);
                        })
                    }
                }
            }
            TaskScopes::Inner(ref mut list, ref mut optimization_counter) => {
                if !list.add(id) {
                    // The task is already in the scope we're trying to add it to.
                    return;
                }

                if depth < usize::BITS as usize {
                    if is_optimization_scope {
                        *optimization_counter =
                            optimization_counter.saturating_sub(children.len() >> depth)
                    } else {
                        *optimization_counter += children.len() >> depth;
                        if *optimization_counter >= 0x10000 {
                            list.remove(id);
                            drop(self.make_root_scoped_internal(state, backend, turbo_tasks));
                            return self.add_to_scope_internal_shallow(
                                id,
                                is_optimization_scope,
                                depth,
                                backend,
                                turbo_tasks,
                                queue,
                            );
                        }
                    }
                }

                if queue.capacity() == 0 {
                    queue.reserve(max(children.len(), SPLIT_OFF_QUEUE_AT * 2));
                }
                queue.extend(children.iter().copied().map(|child| (child, depth + 1)));

                // add to dirty list of the scope (potentially schedule)
                let schedule_self =
                    self.add_self_to_new_scope(&mut state, id, backend, turbo_tasks);
                drop(state);

                if schedule_self {
                    turbo_tasks.schedule(self.id);
                }
            }
        }
    }

    pub(crate) fn add_to_scope_internal(
        &self,
        id: TaskScopeId,
        is_optimization_scope: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        // VecDeque::new() would allocate with 7 items capacity. We don't want that.
        let mut queue = VecDeque::with_capacity(0);
        self.add_to_scope_internal_shallow(
            id,
            is_optimization_scope,
            0,
            backend,
            turbo_tasks,
            &mut queue,
        );

        run_add_to_scope_queue(queue, id, is_optimization_scope, backend, turbo_tasks);
    }

    fn add_self_to_new_scope(
        &self,
        state: &mut FullTaskWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        let mut schedule_self = false;
        backend.with_scope(id, |scope| {
            scope.increment_tasks();
            if !matches!(state.state_type, TaskStateType::Done { .. }) {
                scope.increment_unfinished_tasks(backend);
                log_scope_update!("add unfinished task (added): {} -> {}", *scope.id, *self.id);
                if let TaskStateType::Dirty { ref mut event } = state.state_type {
                    let mut scope = scope.state.lock();
                    if scope.is_active() {
                        state.state_type = Scheduled {
                            event: event.take(),
                        };
                        schedule_self = true;
                    } else {
                        scope.add_dirty_task(self.id);
                    }
                }
            }

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = AutoSet::new();
                {
                    let mut scope_state = scope.state.lock();
                    collectibles
                        .emitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.add_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                    collectibles
                        .unemitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.remove_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                };
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
        });
        schedule_self
    }

    fn remove_self_from_scope(
        &self,
        state: &mut TaskMetaStateWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        match state {
            TaskMetaStateWriteGuard::Full(state) => {
                self.remove_self_from_scope_full(state, id, backend, turbo_tasks);
            }
            TaskMetaStateWriteGuard::Partial(_) => backend.with_scope(id, |scope| {
                scope.decrement_tasks();
                scope.decrement_unfinished_tasks(backend);
                let mut scope = scope.state.lock();
                scope.remove_dirty_task(self.id);
            }),
            TaskMetaStateWriteGuard::Unloaded(_) => {
                unreachable!("remove_self_from_scope must be called with at least a partial state");
            }
        }
    }

    fn remove_self_from_scope_full(
        &self,
        state: &mut FullTaskWriteGuard<'_>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        backend.with_scope(id, |scope| {
            match state.state_type {
                Done { .. } => {}
                Dirty { .. } => {
                    scope.decrement_unfinished_tasks(backend);
                    let mut scope = scope.state.lock();
                    scope.remove_dirty_task(self.id);
                }
                _ => {
                    scope.decrement_unfinished_tasks(backend);
                }
            }
            scope.decrement_tasks();

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = AutoSet::new();
                {
                    let mut scope_state = scope.state.lock();
                    collectibles
                        .emitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.remove_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                    collectibles
                        .unemitted
                        .iter()
                        .filter_map(|(trait_id, collectible)| {
                            scope_state.add_collectible(*trait_id, *collectible)
                        })
                        .for_each(|e| tasks.extend(e.notify));
                };
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
        });
    }

    fn remove_from_scope_internal_shallow(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
        queue: &mut VecDeque<TaskId>,
    ) {
        let mut state = self.partial_state_mut();
        let (scopes, children) = state.scopes_and_children();
        match scopes {
            &mut TaskScopes::Root(root) => {
                if root != id {
                    if let Some(ScopeChildChangeEffect {
                        notify,
                        active,
                        parent,
                    }) = backend.with_scope(id, |scope| scope.state.lock().remove_child(root))
                    {
                        drop(state);
                        if !notify.is_empty() {
                            turbo_tasks.schedule_notify_tasks_set(&notify);
                        }
                        if active {
                            backend.decrease_scope_active(root, turbo_tasks);
                        }
                        if parent {
                            backend.with_scope(root, |child| {
                                child.remove_parent(id, backend);
                            });
                        }
                    }
                }
            }
            TaskScopes::Inner(set, _) => {
                if set.remove(id) {
                    if queue.capacity() == 0 {
                        queue.reserve(max(children.len(), SPLIT_OFF_QUEUE_AT * 2));
                    }
                    queue.extend(children.iter().copied());
                    self.remove_self_from_scope(&mut state, id, backend, turbo_tasks);
                }
            }
        }
    }

    fn remove_from_scope_internal(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        // VecDeque::new() would allocate with 7 items capacity. We don't want that.
        let mut queue = VecDeque::with_capacity(0);
        self.remove_from_scope_internal_shallow(id, backend, turbo_tasks, &mut queue);
        run_remove_from_scope_queue(queue, id, backend, turbo_tasks);
    }

    pub(crate) fn remove_from_scope(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.remove_from_scope_internal(id, backend, turbo_tasks)
    }

    pub(crate) fn remove_from_scopes(
        &self,
        scopes: impl Iterator<Item = TaskScopeId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        for id in scopes {
            self.remove_from_scope_internal(id, backend, turbo_tasks)
        }
    }

    pub(crate) fn remove_root_or_initial_scope(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        match state.scopes {
            TaskScopes::Root(root) => {
                log_scope_update!("removing root scope {root}");
                state.scopes = TaskScopes::default();

                turbo_tasks.schedule_backend_foreground_job(
                    backend.create_backend_job(Job::RemoveFromScope(state.children.clone(), root)),
                );
            }
            TaskScopes::Inner(ref mut set, _) => {
                log_scope_update!("removing initial scope");
                let initial = backend.initial_scope;
                if set.remove(initial) {
                    let children = state.children.iter().copied().collect::<VecDeque<_>>();
                    self.remove_self_from_scope(
                        &mut TaskMetaStateWriteGuard::Full(state),
                        initial,
                        backend,
                        turbo_tasks,
                    );
                    // state ends here, as it was passed into `remove_self_from_scope`

                    if !children.is_empty() {
                        run_remove_from_scope_queue(children, initial, backend, turbo_tasks);
                    }
                }
            }
        }
    }

    fn make_root_scoped_internal<'a>(
        &self,
        mut state: FullTaskWriteGuard<'a>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<FullTaskWriteGuard<'a>> {
        if matches!(state.scopes, TaskScopes::Root(_)) {
            return Some(state);
        }
        let root_scope = backend.create_new_scope(0);
        // Set the root scope of the current task
        if let TaskScopes::Inner(set, _) = replace(&mut state.scopes, TaskScopes::Root(root_scope))
        {
            let scopes = set.into_counts().collect::<Vec<_>>();
            log_scope_update!(
                "new {root_scope} for {:?} as internal root scope (replacing {scopes:?})",
                self.ty
            );
            let mut active_counter = 0isize;
            let mut tasks = AutoSet::new();
            let mut scopes_to_add_as_parent = Vec::new();
            let mut scopes_to_remove_as_parent = Vec::new();
            for (scope_id, count) in scopes.iter() {
                backend.with_scope(*scope_id, |scope| {
                    // add the new root scope as child of old scopes
                    let mut state = scope.state.lock();
                    match count.cmp(&0) {
                        Ordering::Greater => {
                            if let Some(ScopeChildChangeEffect {
                                notify,
                                active,
                                parent,
                            }) = state.add_child_count(root_scope, *count as usize)
                            {
                                tasks.extend(notify);
                                if active {
                                    active_counter += 1;
                                }
                                if parent {
                                    scopes_to_add_as_parent.push(*scope_id);
                                }
                            }
                        }
                        Ordering::Less => {
                            if let Some(ScopeChildChangeEffect {
                                notify,
                                active,
                                parent,
                            }) = state.remove_child_count(root_scope, (-*count) as usize)
                            {
                                tasks.extend(notify);
                                if active {
                                    active_counter -= 1;
                                }
                                if parent {
                                    scopes_to_remove_as_parent.push(*scope_id);
                                }
                            }
                        }
                        _ => {}
                    }
                });
            }
            if !tasks.is_empty() {
                turbo_tasks.schedule_notify_tasks_set(&tasks);
            }
            backend.with_scope(root_scope, |root_scope| {
                for parent in scopes_to_add_as_parent {
                    root_scope.add_parent(parent, backend);
                }
                for parent in scopes_to_remove_as_parent {
                    root_scope.remove_parent(parent, backend);
                }
            });

            // We collected how often the new root scope is considered as active by the old
            // scopes and increase the active counter by that.
            match active_counter.cmp(&0) {
                Ordering::Greater => {
                    backend.increase_scope_active_by(
                        root_scope,
                        active_counter as usize,
                        turbo_tasks,
                    );
                }
                Ordering::Less => {
                    backend.decrease_scope_active_by(
                        root_scope,
                        (-active_counter) as usize,
                        turbo_tasks,
                    );
                }
                _ => {}
            }

            // add self to new root scope
            let schedule_self =
                self.add_self_to_new_scope(&mut state, root_scope, backend, turbo_tasks);

            // remove self from old scopes
            for (scope, count) in scopes.iter() {
                if *count > 0 {
                    self.remove_self_from_scope_full(&mut state, *scope, backend, turbo_tasks);
                }
            }

            if !state.children.is_empty() || schedule_self {
                let children = state.children.clone();

                drop(state);

                // Add children to new root scope
                for child in children.iter() {
                    backend.with_task(*child, |child| {
                        child.add_to_scope_internal(root_scope, true, backend, turbo_tasks);
                    })
                }

                // Potentially schedule itself, when root scope is active and task is dirty
                // I think that will never happen since it should already be scheduled by the
                // old scopes. Anyway let just do it to be safe:
                if schedule_self {
                    turbo_tasks.schedule(self.id);
                }

                // Remove children from old scopes
                turbo_tasks.schedule_backend_foreground_job(backend.create_backend_job(
                    Job::RemoveFromScopes(children, scopes.into_iter().map(|(id, _)| id).collect()),
                ));
                None
            } else {
                Some(state)
            }
        } else {
            unreachable!()
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
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.make_dirty(backend, turbo_tasks)
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

    pub fn reset_stats(&self) {
        if let TaskMetaStateWriteGuard::Full(mut state) = self.state_mut() {
            state.stats.reset();
        }
    }

    pub fn get_stats_info(&self, backend: &MemoryBackend) -> TaskStatsInfo {
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
                    root_scoped: matches!(state.scopes, TaskScopes::Root(_)),
                    child_scopes: match state.scopes {
                        TaskScopes::Root(_) => 1,
                        TaskScopes::Inner(ref list, _) => list.len(),
                    },
                    active: state.scopes.iter().any(|scope| {
                        backend.with_scope(scope, |scope| scope.state.lock().is_active())
                    }),
                    unloaded: false,
                }
            }
            TaskMetaStateReadGuard::Partial(state) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                root_scoped: false,
                child_scopes: if let TaskScopes::Inner(ref set, _) = state.scopes {
                    set.len()
                } else {
                    0
                },
                active: false,
                unloaded: true,
            },
            TaskMetaStateReadGuard::Unloaded(_) => TaskStatsInfo {
                total_duration: None,
                last_duration: Duration::ZERO,
                executions: None,
                root_scoped: false,
                child_scopes: 0,
                active: false,
                unloaded: true,
            },
        }
    }

    pub fn get_stats_type(self: &Task) -> StatsTaskType {
        match &self.ty {
            TaskType::Root(_) => StatsTaskType::Root(self.id),
            TaskType::Once(_) => StatsTaskType::Once(self.id),
            TaskType::Persistent(ty) => match &**ty {
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
        let mut scope_refs = Vec::new();
        if let TaskMetaStateReadGuard::Full(state) = self.state() {
            for child in state.children.iter() {
                refs.push((ReferenceType::Child, *child));
            }
            if let Done { ref dependencies } = state.state_type {
                for dep in dependencies.iter() {
                    match dep {
                        TaskDependency::TaskOutput(task) | TaskDependency::TaskCell(task, _) => {
                            refs.push((ReferenceType::Dependency, *task))
                        }
                        TaskDependency::ScopeChildren(scope)
                        | TaskDependency::ScopeCollectibles(scope, _) => {
                            scope_refs.push((ReferenceType::Dependency, *scope))
                        }
                    }
                }
            }
        }
        if let TaskType::Persistent(ty) = &self.ty {
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
        StatsReferences {
            tasks: refs,
            scopes: scope_refs,
        }
    }

    fn state_string(state: &TaskState) -> String {
        let mut state_str = match state.state_type {
            Scheduled { .. } => "scheduled".to_string(),
            InProgress { .. } => "in progress".to_string(),
            InProgressDirty { .. } => "in progress (dirty)".to_string(),
            Done { .. } => "done".to_string(),
            Dirty { .. } => "dirty".to_string(),
        };
        match state.scopes {
            TaskScopes::Root(root) => {
                write!(state_str, " (root scope {})", root).unwrap();
            }
            TaskScopes::Inner(ref list, change_counter) => {
                if !list.is_empty() || change_counter > 0 {
                    write!(state_str, " (scopes").unwrap();
                    for scope in list.iter() {
                        write!(state_str, " {}", *scope).unwrap();
                    }
                    if change_counter > 0 {
                        write!(state_str, " {change_counter} accumulated changes").unwrap();
                    }
                    write!(state_str, ")").unwrap();
                }
            }
        }
        state_str
    }

    pub(crate) fn connect_child(
        &self,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        if state.children.insert(child_id) {
            let scopes = state.scopes.clone();
            drop(state);

            backend.with_task(child_id, |child| {
                for scope in scopes.iter() {
                    #[cfg(not(feature = "report_expensive"))]
                    {
                        child.add_to_scope_internal(scope, false, backend, turbo_tasks);
                    }
                    #[cfg(feature = "report_expensive")]
                    {
                        use std::time::Instant;

                        use turbo_tasks::util::FormatDuration;

                        let start = Instant::now();
                        child.add_to_scope_internal(scope, false, backend, turbo_tasks);
                        let elapsed = start.elapsed();
                        if elapsed.as_millis() >= 10 {
                            println!(
                                "add_to_scope {scope} took {}: {:?}",
                                FormatDuration(elapsed),
                                child
                            );
                        }
                    }
                }
            });
        }
    }

    fn ensure_root_scoped<'a>(
        &'a self,
        mut state: FullTaskWriteGuard<'a>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> FullTaskWriteGuard<'a> {
        while !state.scopes.is_root() {
            #[cfg(not(feature = "report_expensive"))]
            let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
            #[cfg(feature = "report_expensive")]
            let result = {
                use std::time::Instant;

                use turbo_tasks::util::FormatDuration;

                let start = Instant::now();
                let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
                let elapsed = start.elapsed();
                if elapsed.as_millis() >= 10 {
                    println!(
                        "make_root_scoped took {}: {:?}",
                        FormatDuration(elapsed),
                        self
                    );
                }
                result
            };
            if let Some(s) = result {
                state = s;
                break;
            } else {
                // We need to acquire a new lock and everything might have changed in between
                state = self.full_state_mut();
                continue;
            }
        }
        state
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        strongly_consistent: bool,
        func: F,
        note: impl Fn() -> String + Sync + Send + 'static,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<T, EventListener>> {
        let mut state = self.full_state_mut();
        if strongly_consistent {
            state = self.ensure_root_scoped(state, backend, turbo_tasks);
            // We need to wait for all foreground jobs to be finished as there could be
            // ongoing add_to_scope jobs that need to be finished before reading
            // from scopes
            if let Err(listener) = turbo_tasks.try_foreground_done() {
                return Ok(Err(listener));
            }
            if let TaskScopes::Root(root) = state.scopes {
                if let Some(listener) = backend.with_scope(root, |scope| {
                    if let Some(listener) = scope.has_unfinished_tasks() {
                        return Some(listener);
                    }
                    None
                }) {
                    return Ok(Err(listener));
                }
            } else {
                unreachable!()
            }
        }
        match state.state_type {
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
                for scope in state.scopes.iter() {
                    backend.with_scope(scope, |scope| {
                        scope.state.lock().remove_dirty_task(self.id);
                    })
                }
                drop(state);
                Ok(Err(listener))
            }
            Scheduled { ref event } | InProgress { ref event } | InProgressDirty { ref event } => {
                let listener = event.listen_with_note(note);
                drop(state);
                Ok(Err(listener))
            }
        }
    }

    pub(crate) fn try_read_task_collectibles(
        &self,
        reader: TaskId,
        trait_id: TraitTypeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<AutoSet<RawVc>, EventListener>> {
        let mut state = self.full_state_mut();
        state = self.ensure_root_scoped(state, backend, turbo_tasks);
        // We need to wait for all foreground jobs to be finished as there could be
        // ongoing add_to_scope jobs that need to be finished before reading
        // from scopes
        if let Err(listener) = turbo_tasks.try_foreground_done() {
            return Ok(Err(listener));
        }
        if let TaskScopes::Root(scope_id) = state.scopes {
            backend.with_scope(scope_id, |scope| {
                if let Some(l) = scope.has_unfinished_tasks() {
                    return Ok(Err(l));
                }
                let set = scope.read_collectibles(scope_id, trait_id, reader, backend);
                Ok(Ok(set))
            })
        } else {
            panic!("It's not possible to read collectibles from a non-root scope")
        }
    }

    pub(crate) fn emit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        if state.collectibles.emit(trait_type, collectible) {
            let tasks = state
                .scopes
                .iter()
                .flat_map(|id| {
                    backend.with_scope(id, |scope| {
                        let mut state = scope.state.lock();
                        state.add_collectible(trait_type, collectible)
                    })
                })
                .flat_map(|e| e.notify)
                .collect::<AutoSet<_>>();
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        }
    }

    pub(crate) fn unemit_collectible(
        &self,
        trait_type: TraitTypeId,
        collectible: RawVc,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.full_state_mut();
        if state.collectibles.unemit(trait_type, collectible) {
            let mut tasks = AutoSet::new();
            state
                .scopes
                .iter()
                .flat_map(|id| {
                    backend.with_scope(id, |scope| {
                        let mut state = scope.state.lock();
                        state.remove_collectible(trait_type, collectible)
                    })
                })
                .for_each(|e| tasks.extend(e.notify));
            drop(state);
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        }
    }
}

fn remove_collectible_from_scopes(
    emitted: AutoSet<(TraitTypeId, RawVc)>,
    unemitted: AutoSet<(TraitTypeId, RawVc)>,
    task_scopes: &TaskScopes,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi,
) {
    task_scopes.iter().for_each(|id| {
        backend.with_scope(id, |scope| {
            let mut tasks = AutoSet::new();
            {
                let mut state = scope.state.lock();
                emitted
                    .iter()
                    .filter_map(|(trait_id, collectible)| {
                        state.remove_collectible(*trait_id, *collectible)
                    })
                    .for_each(|e| tasks.extend(e.notify));

                unemitted
                    .iter()
                    .filter_map(|(trait_id, collectible)| {
                        state.add_collectible(*trait_id, *collectible)
                    })
                    .for_each(|e| tasks.extend(e.notify));
            };
            turbo_tasks.schedule_notify_tasks_set(&tasks);
        })
    })
}

fn remove_from_scopes(
    tasks: AutoSet<TaskId>,
    task_scopes: &TaskScopes,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi,
) {
    match task_scopes {
        TaskScopes::Root(scope) => {
            turbo_tasks.schedule_backend_foreground_job(
                backend.create_backend_job(Job::RemoveFromScope(tasks, *scope)),
            );
        }
        TaskScopes::Inner(ref scopes, _) => {
            turbo_tasks.schedule_backend_foreground_job(backend.create_backend_job(
                Job::RemoveFromScopes(tasks, scopes.iter().copied().collect()),
            ));
        }
    }
}

/// Heuristic to decide when to split off work in `run_add_to_scope_queue` and
/// `run_remove_from_scope_queue`.
const SPLIT_OFF_QUEUE_AT: usize = 100;

/// Adds a list of tasks and their children to a scope, recursively.
pub fn run_add_to_scope_queue(
    mut queue: VecDeque<(TaskId, usize)>,
    id: TaskScopeId,
    is_optimization_scope: bool,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi,
) {
    while let Some((child, depth)) = queue.pop_front() {
        backend.with_task(child, |child| {
            child.add_to_scope_internal_shallow(
                id,
                is_optimization_scope,
                depth,
                backend,
                turbo_tasks,
                &mut queue,
            );
        });
        while queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(queue.len() - SPLIT_OFF_QUEUE_AT);
            turbo_tasks.schedule_backend_foreground_job(backend.create_backend_job(
                Job::AddToScopeQueue(split_off_queue, id, is_optimization_scope),
            ));
        }
    }
}

/// Removes a list of tasks and their children from a scope, recursively.
pub fn run_remove_from_scope_queue(
    mut queue: VecDeque<TaskId>,
    id: TaskScopeId,
    backend: &MemoryBackend,
    turbo_tasks: &dyn TurboTasksBackendApi,
) {
    while let Some(child) = queue.pop_front() {
        backend.with_task(child, |child| {
            child.remove_from_scope_internal_shallow(id, backend, turbo_tasks, &mut queue);
        });
        while queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(queue.len() - SPLIT_OFF_QUEUE_AT);

            turbo_tasks.schedule_backend_foreground_job(
                backend.create_backend_job(Job::RemoveFromScopeQueue(split_off_queue, id)),
            );
        }
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
    pub root_scoped: bool,
    pub child_scopes: usize,
    pub active: bool,
    pub unloaded: bool,
}
