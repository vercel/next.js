use std::{
    borrow::Cow,
    cell::RefCell,
    cmp::Ordering,
    collections::{HashSet, VecDeque},
    fmt::{self, Debug, Display, Formatter, Write},
    future::Future,
    hash::Hash,
    mem::{replace, take},
    pin::Pin,
    time::Duration,
};

use anyhow::Result;
use parking_lot::{Mutex, RwLock, RwLockWriteGuard};
use tokio::task_local;
use turbo_tasks::{
    backend::{CellMappings, PersistentTaskType},
    event::{Event, EventListener},
    get_invalidator, registry, FunctionId, Invalidator, RawVc, TaskId, TaskInput, TraitTypeId,
    TurboTasksBackendApi,
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
    TaskCell(TaskId, usize),
    ScopeChildren(TaskScopeId),
    ScopeCollectibles(TaskScopeId, TraitTypeId),
}

task_local! {
    /// Vc/Scopes that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<HashSet<TaskDependency>>;
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

    /// A normal task execution a native (rust) function
    Native(FunctionId, NativeTaskFn),

    /// A resolve task, which resolves arguments and calls the function with
    /// resolve arguments. The inner function call will do a cache lookup.
    ResolveNative(FunctionId),

    /// A trait method resolve task. It resolves the first (`self`) argument and
    /// looks up the trait method on that value. Then it calls that method.
    /// The method call will do a cache lookup and might resolve arguments
    /// before.
    ResolveTrait(TraitTypeId, Cow<'static, str>),
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(..) => f.debug_tuple("Root").finish(),
            Self::Once(..) => f.debug_tuple("Once").finish(),
            Self::Native(native_fn, _) => f
                .debug_tuple("Native")
                .field(&registry::get_function(*native_fn).name)
                .finish(),
            Self::ResolveNative(native_fn) => f
                .debug_tuple("ResolveNative")
                .field(&registry::get_function(*native_fn).name)
                .finish(),
            Self::ResolveTrait(trait_type, name) => f
                .debug_tuple("ResolveTrait")
                .field(&registry::get_trait(*trait_type).name)
                .field(name)
                .finish(),
        }
    }
}

/// A Task is an instantiation of an Function with some arguments.
/// The same combinations of Function and arguments usually results in the same
/// Task instance.
pub struct Task {
    id: TaskId,
    // TODO move that into TaskType where needed
    // TODO we currently only use that for visualization
    // TODO this can be removed
    /// The arguments of the Task
    inputs: Vec<TaskInput>,
    /// The type of the task
    ty: TaskType,
    /// The mutable state of the task
    state: RwLock<TaskState>,
    // TODO technically we need no lock here as it's only written
    // during execution, which doesn't happen in parallel
    /// Mutable state that is used during task execution.
    /// It will only be accessed from the task execution, which happens
    /// non-concurrently.
    execution_data: Mutex<TaskExecutionData>,
}

/// Task data that is only modified during task execution.
#[derive(Default)]
struct TaskExecutionData {
    /// Cells/Scopes that the task has read during execution.
    /// The Task will keep these tasks alive as invalidations that happen there
    /// might affect this task.
    ///
    /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
    dependencies: HashSet<TaskDependency>,

    /// Mappings from key or data type to cell index, to store the data in the
    /// same cell again.
    cell_mappings: CellMappings,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut result = f.debug_struct("Task");
        result.field("type", &self.ty);
        if let Some(state) = self.state.try_read() {
            result.field("scopes", &state.scopes);
            result.field("state", &state.state_type);
        }
        result.finish()
    }
}

/// The state of a [Task]
struct TaskState {
    scopes: TaskScopes,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// Children are only modified from execution
    children: HashSet<TaskId>,

    /// Collectibles are only modified from execution
    collectibles: MaybeCollectibles,

    output: Output,
    created_cells: Vec<Cell>,
    event: Event,

    // Stats:
    executions: u32,
    total_duration: Duration,
    last_duration: Duration,
}

impl TaskState {
    fn new(id: TaskId) -> Self {
        Self {
            scopes: Default::default(),
            state_type: Default::default(),
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            created_cells: Default::default(),
            event: Event::new(move || format!("TaskState({id})::event")),
            executions: Default::default(),
            total_duration: Default::default(),
            last_duration: Default::default(),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
        }
    }

    fn new_scheduled_in_scope(id: TaskId, scope: TaskScopeId) -> Self {
        Self {
            scopes: TaskScopes::Inner(CountHashSet::from([scope]), 0),
            state_type: Scheduled,
            children: Default::default(),
            collectibles: Default::default(),
            output: Default::default(),
            created_cells: Default::default(),
            event: Event::new(move || format!("TaskState({id})::event")),
            executions: Default::default(),
            total_duration: Default::default(),
            last_duration: Default::default(),
            #[cfg(feature = "track_wait_dependencies")]
            last_waiting_task: Default::default(),
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
    emitted: HashSet<(TraitTypeId, RawVc)>,
    unemitted: HashSet<(TraitTypeId, RawVc)>,
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

#[derive(PartialEq, Eq, Debug)]
enum TaskStateType {
    /// Ready
    ///
    /// on invalidation this will move to Dirty or Scheduled depending on active
    /// flag
    Done,

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty,

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress or Dirty depending on active flag
    Scheduled,

    /// Execution is happening
    ///
    /// on finish this will move to Done
    ///
    /// on invalidation this will move to InProgressDirty
    InProgress,

    /// Invalid execution is happening
    ///
    /// on finish this will move to Dirty or Scheduled depending on active flag
    InProgressDirty,
}

impl Default for TaskStateType {
    fn default() -> Self {
        Dirty
    }
}

use TaskStateType::*;

use crate::{
    cell::Cell,
    count_hash_set::CountHashSet,
    memory_backend::Job,
    output::Output,
    scope::{ScopeChildChangeEffect, TaskScopeId, TaskScopes},
    stats, MemoryBackend,
};

impl Task {
    pub(crate) fn new_native(id: TaskId, inputs: Vec<TaskInput>, native_fn: FunctionId) -> Self {
        let bound_fn = registry::get_function(native_fn).bind(&inputs);
        Self {
            id,
            inputs,
            ty: TaskType::Native(native_fn, bound_fn),
            state: RwLock::new(TaskState::new(id)),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_resolve_native(
        id: TaskId,
        inputs: Vec<TaskInput>,
        native_fn: FunctionId,
    ) -> Self {
        Self {
            id,
            inputs,
            ty: TaskType::ResolveNative(native_fn),
            state: RwLock::new(TaskState::new(id)),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_resolve_trait(
        id: TaskId,
        trait_type: TraitTypeId,
        trait_fn_name: Cow<'static, str>,
        inputs: Vec<TaskInput>,
    ) -> Self {
        Self {
            id,
            inputs,
            ty: TaskType::ResolveTrait(trait_type, trait_fn_name),
            state: RwLock::new(TaskState::new(id)),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> Self {
        Self {
            id,
            inputs: Vec::new(),
            ty: TaskType::Root(Box::new(functor)),
            state: RwLock::new(TaskState::new_scheduled_in_scope(id, scope)),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        scope: TaskScopeId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
    ) -> Self {
        Self {
            id,
            inputs: Vec::new(),
            ty: TaskType::Once(Mutex::new(Some(Box::pin(functor)))),
            state: RwLock::new(TaskState::new_scheduled_in_scope(id, scope)),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn get_description(&self) -> String {
        match &self.ty {
            TaskType::Root(..) => format!("[{}] root", self.id),
            TaskType::Once(..) => format!("[{}] once", self.id),
            TaskType::Native(native_fn, _) => {
                format!("[{}] {}", self.id, registry::get_function(*native_fn).name)
            }
            TaskType::ResolveNative(native_fn) => {
                format!(
                    "[{}] [resolve] {}",
                    self.id,
                    registry::get_function(*native_fn).name
                )
            }
            TaskType::ResolveTrait(trait_type, fn_name) => {
                format!(
                    "[{}] [resolve trait] {} in trait {}",
                    self.id,
                    fn_name,
                    registry::get_trait(*trait_type).name
                )
            }
        }
    }

    pub(crate) fn remove_dependency(dep: TaskDependency, reader: TaskId, backend: &MemoryBackend) {
        match dep {
            TaskDependency::TaskOutput(task) => {
                backend.with_task(task, |task| {
                    task.with_output_mut(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            TaskDependency::TaskCell(task, index) => {
                backend.with_task(task, |task| {
                    task.with_cell_mut(index, |cell| {
                        cell.dependent_tasks.remove(&reader);
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
    fn clear_dependencies(&self, backend: &MemoryBackend) {
        let mut execution_data = self.execution_data.lock();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

        for dep in dependencies.into_iter() {
            Task::remove_dependency(dep, self.id, backend);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(&self, backend: &MemoryBackend) {
        use std::time::Instant;

        use turbo_tasks::util::FormatDuration;
        let start = Instant::now();
        let mut execution_data = self.execution_data.lock();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

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

    pub(crate) fn execution_started(
        self: &Task,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        let mut state = self.state.write();
        let state_type = &state.state_type;
        match state_type {
            Done | InProgress | InProgressDirty => {
                // should not start in this state
                return false;
            }
            Scheduled => {
                state.state_type = InProgress;
                state.executions += 1;
                // TODO we need to reconsider the approach of doing scope changes in background
                // since they affect collectibles and need to be computed eagerly to allow
                // strongly_consistent to work properly.
                // We could move this operation to the point when the task execution is
                // finished.
                if !state.children.is_empty() {
                    let set = take(&mut state.children);
                    let state_scopes = &state.scopes;
                    match state_scopes {
                        TaskScopes::Root(scope) => {
                            turbo_tasks.schedule_backend_foreground_job(
                                backend.create_backend_job(Job::RemoveFromScope(set, *scope)),
                            );
                        }
                        TaskScopes::Inner(ref scopes, _) => {
                            turbo_tasks.schedule_backend_foreground_job(
                                backend.create_backend_job(Job::RemoveFromScopes(
                                    set,
                                    scopes.iter().copied().collect(),
                                )),
                            );
                        }
                    }
                }
                if let Some(collectibles) = state.collectibles.take() {
                    let emitted = collectibles.emitted;
                    let unemitted = collectibles.unemitted;
                    state.scopes.iter().for_each(|id| {
                        backend.with_scope(id, |scope| {
                            let mut tasks = HashSet::new();
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
            }
            Dirty => {
                let state_type = Task::state_string(&state);
                drop(state);
                panic!(
                    "{:?} execution started in unexpected state {}",
                    self, state_type
                )
            }
        };
        true
    }

    pub(crate) fn execution_result(
        &self,
        result: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write();
        match state.state_type {
            InProgress => match result {
                Ok(Ok(result)) => state.output.link(result, turbo_tasks),
                Ok(Err(err)) => state.output.error(err, turbo_tasks),
                Err(message) => state.output.panic(message, turbo_tasks),
            },
            InProgressDirty => {
                // We don't want to assign the output cell here
                // as we want to avoid unnecessary updates
                // TODO maybe this should be controlled by a heuristic
            }
            Dirty | Scheduled | Done => {
                panic!(
                    "Task execution completed in unexpected state {:?}",
                    state.state_type
                )
            }
        };
    }

    #[must_use]
    pub(crate) fn execution_completed(
        &self,
        cell_mappings: Option<CellMappings>,
        duration: Duration,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        DEPENDENCIES_TO_TRACK.with(|deps| {
            let mut execution_data = self.execution_data.lock();
            if let Some(cell_mappings) = cell_mappings {
                execution_data.cell_mappings = cell_mappings;
            }
            execution_data.dependencies = deps.take();
        });
        let mut schedule_task = false;
        let mut clear_dependencies = false;
        {
            let mut state = self.state.write();
            state.total_duration += duration;
            state.last_duration = duration;
            match state.state_type {
                InProgress => {
                    state.state_type = Done;
                    for scope in state.scopes.iter() {
                        backend.with_scope(scope, |scope| {
                            scope.decrement_unfinished_tasks(backend);
                        })
                    }
                    state.event.notify(usize::MAX);
                }
                InProgressDirty => {
                    clear_dependencies = true;
                    let mut active = false;
                    for scope in state.scopes.iter() {
                        if backend.with_scope(scope, |scope| scope.state.lock().is_active()) {
                            active = true;
                            break;
                        }
                    }
                    if active {
                        state.state_type = Scheduled;
                        schedule_task = true;
                    } else {
                        state.state_type = Dirty;
                    }
                }
                Dirty | Scheduled | Done => {
                    panic!(
                        "Task execution completed in unexpected state {:?}",
                        state.state_type
                    )
                }
            };
        }
        if clear_dependencies {
            self.clear_dependencies(backend)
        }

        if let TaskType::Once(_) = self.ty {
            self.remove_root_or_initial_scope(backend, turbo_tasks);
        }

        schedule_task
    }

    fn make_dirty(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }
        self.clear_dependencies(backend);

        let mut state = self.state.write();
        match state.state_type {
            Dirty | Scheduled | InProgressDirty => {
                // already dirty
            }
            Done => {
                // add to dirty lists and potentially schedule
                let mut active = false;
                for scope in state.scopes.iter() {
                    backend.with_scope(scope, |scope| {
                        scope.increment_unfinished_tasks(backend);
                        log_scope_update!("add unfinished task: {} -> {}", *scope.id, *self.id);
                        let mut scope = scope.state.lock();
                        if scope.is_active() {
                            active = true;
                        } else {
                            scope.add_dirty_task(self.id);
                        }
                    });
                }
                if active {
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.schedule(self.id);
                } else {
                    state.state_type = Dirty;
                    drop(state);
                }
            }
            InProgress => {
                state.state_type = InProgressDirty;
            }
        }
    }

    pub(crate) fn schedule_when_dirty(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        let mut state = self.state.write();
        if state.state_type == TaskStateType::Dirty {
            state.state_type = Scheduled;
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
        let mut state = self.state.write();
        let TaskState {
            scopes, children, ..
        } = &mut *state;
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
                            self.make_root_scoped_internal(state, backend, turbo_tasks);
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
        let mut queue = VecDeque::new();
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
        state: &mut RwLockWriteGuard<TaskState>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        let mut schedule_self = false;
        backend.with_scope(id, |scope| {
            scope.increment_tasks();
            if !matches!(state.state_type, TaskStateType::Done) {
                scope.increment_unfinished_tasks(backend);
                log_scope_update!("add unfinished task (added): {} -> {}", *scope.id, *self.id);
                if state.state_type == TaskStateType::Dirty {
                    let mut scope = scope.state.lock();
                    if scope.is_active() {
                        state.state_type = Scheduled;
                        schedule_self = true;
                    } else {
                        scope.add_dirty_task(self.id);
                    }
                }
            }

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = HashSet::new();
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
        state: &mut RwLockWriteGuard<TaskState>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        backend.with_scope(id, |scope| {
            if !matches!(state.state_type, Done) {
                scope.decrement_unfinished_tasks(backend);
                if state.state_type == TaskStateType::Dirty {
                    let mut scope = scope.state.lock();
                    scope.remove_dirty_task(self.id);
                }
            }
            scope.decrement_tasks();

            if let Some(collectibles) = state.collectibles.as_ref() {
                let mut tasks = HashSet::new();
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
        let mut state = self.state.write();
        match state.scopes {
            TaskScopes::Root(root) => {
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
                            })
                        }
                    }
                }
            }
            TaskScopes::Inner(ref mut set, _) => {
                if set.remove(id) {
                    self.remove_self_from_scope(&mut state, id, backend, turbo_tasks);
                    queue.extend(state.children.iter().copied());
                    drop(state);
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
        let mut queue = VecDeque::new();
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
        let mut state = self.state.write();
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
                    self.remove_self_from_scope(&mut state, initial, backend, turbo_tasks);
                    let children = state.children.iter().copied().collect::<VecDeque<_>>();
                    drop(state);

                    if !children.is_empty() {
                        run_remove_from_scope_queue(children, initial, backend, turbo_tasks);
                    }
                }
            }
        }
    }

    fn make_root_scoped_internal<'a>(
        &self,
        mut state: RwLockWriteGuard<'a, TaskState>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<RwLockWriteGuard<'a, TaskState>> {
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
            let mut tasks = HashSet::new();
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
                    self.remove_self_from_scope(&mut state, *scope, backend, turbo_tasks);
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

    pub(crate) fn take_cell_mappings(&self) -> CellMappings {
        let mut execution_data = self.execution_data.lock();
        let mut cell_mappings = take(&mut execution_data.cell_mappings);
        for list in cell_mappings.by_type.values_mut() {
            list.0 = 0;
        }
        cell_mappings
    }

    pub(crate) fn add_dependency_to_current(dep: TaskDependency) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
    }

    pub(crate) fn execute(&self, tt: &dyn TurboTasksBackendApi) -> NativeTaskFuture {
        match &self.ty {
            TaskType::Root(bound_fn) => bound_fn(),
            TaskType::Once(mutex) => {
                let future = mutex.lock().take().expect("Task can only be executed once");
                // let task = self.clone();
                Box::pin(future)
            }
            TaskType::Native(_, bound_fn) => bound_fn(),
            TaskType::ResolveNative(ref native_fn) => {
                let native_fn = *native_fn;
                let inputs = self.inputs.clone();
                let tt = tt.pin();
                Box::pin(PersistentTaskType::run_resolve_native(
                    native_fn, inputs, tt,
                ))
            }
            TaskType::ResolveTrait(trait_type, name) => {
                let trait_type = *trait_type;
                let name = name.clone();
                let inputs = self.inputs.clone();
                let tt = tt.pin();
                Box::pin(PersistentTaskType::run_resolve_trait(
                    trait_type, name, inputs, tt,
                ))
            }
        }
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
    pub(crate) fn with_output_mut<T>(&self, func: impl FnOnce(&mut Output) -> T) -> T {
        let mut state = self.state.write();
        func(&mut state.output)
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut<T>(&self, index: usize, func: impl FnOnce(&mut Cell) -> T) -> T {
        let mut state = self.state.write();
        func(&mut state.created_cells[index])
    }

    /// Access to a cell.
    pub(crate) fn with_cell<T>(&self, index: usize, func: impl FnOnce(&Cell) -> T) -> T {
        let state = self.state.read();
        func(&state.created_cells[index])
    }

    /// For testing purposes
    pub fn reset_executions(&self) {
        let mut state = self.state.write();
        if state.executions > 1 {
            state.executions = 1;
        }
    }

    pub fn is_pending(&self) -> bool {
        let state = self.state.read();
        state.state_type != TaskStateType::Done
    }

    pub fn reset_stats(&self) {
        let mut state = self.state.write();
        state.executions = 0;
        state.total_duration = Duration::ZERO;
        state.last_duration = Duration::ZERO;
    }

    pub fn get_stats_info(&self, backend: &MemoryBackend) -> TaskStatsInfo {
        let state = self.state.read();
        TaskStatsInfo {
            total_duration: state.total_duration,
            last_duration: state.last_duration,
            executions: state.executions,
            root_scoped: matches!(state.scopes, TaskScopes::Root(_)),
            child_scopes: match state.scopes {
                TaskScopes::Root(_) => 1,
                TaskScopes::Inner(ref list, _) => list.len(),
            },
            active: state
                .scopes
                .iter()
                .any(|scope| backend.with_scope(scope, |scope| scope.state.lock().is_active())),
        }
    }

    pub fn get_stats_type(self: &Task) -> stats::TaskType {
        match &self.ty {
            TaskType::Root(_) => stats::TaskType::Root(self.id),
            TaskType::Once(_) => stats::TaskType::Once(self.id),
            TaskType::Native(f, _) => stats::TaskType::Native(*f),
            TaskType::ResolveNative(f) => stats::TaskType::ResolveNative(*f),
            TaskType::ResolveTrait(t, n) => stats::TaskType::ResolveTrait(*t, n.to_string()),
        }
    }

    pub fn get_stats_references(
        &self,
    ) -> (
        Vec<(stats::ReferenceType, TaskId)>,
        Vec<(stats::ReferenceType, TaskScopeId)>,
    ) {
        let mut refs = Vec::new();
        let mut scope_refs = Vec::new();
        {
            let state = self.state.read();
            for child in state.children.iter() {
                refs.push((stats::ReferenceType::Child, *child));
            }
        }
        {
            let execution_data = self.execution_data.lock();
            for dep in execution_data.dependencies.iter() {
                match dep {
                    TaskDependency::TaskOutput(task) | TaskDependency::TaskCell(task, _) => {
                        refs.push((stats::ReferenceType::Dependency, *task))
                    }
                    TaskDependency::ScopeChildren(scope)
                    | TaskDependency::ScopeCollectibles(scope, _) => {
                        scope_refs.push((stats::ReferenceType::Dependency, *scope))
                    }
                }
            }
        }
        {
            for input in self.inputs.iter() {
                if let Some(task) = input.get_task_id() {
                    refs.push((stats::ReferenceType::Input, task));
                }
            }
        }
        (refs, scope_refs)
    }

    fn state_string(state: &TaskState) -> String {
        let mut state_str = match state.state_type {
            Scheduled => "scheduled".to_string(),
            InProgress => "in progress".to_string(),
            InProgressDirty => "in progress (dirty)".to_string(),
            Done => "done".to_string(),
            Dirty => "dirty".to_string(),
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
        let mut state = self.state.write();
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
        mut state: RwLockWriteGuard<'a, TaskState>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> RwLockWriteGuard<'a, TaskState> {
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
                state = self.state.write();
                continue;
            }
        }
        state
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        strongly_consistent: bool,
        func: F,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<T, EventListener>> {
        let mut state = self.state.write();
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
            Done => {
                let result = func(&mut state.output)?;
                drop(state);

                Ok(Ok(result))
            }
            Dirty | Scheduled | InProgress | InProgressDirty => {
                let listener = state.event.listen();
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
    ) -> Result<Result<HashSet<RawVc>, EventListener>> {
        let mut state = self.state.write();
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
        let mut state = self.state.write();
        if state.collectibles.emit(trait_type, collectible) {
            let mut tasks = HashSet::new();
            state
                .scopes
                .iter()
                .flat_map(|id| {
                    backend.with_scope(id, |scope| {
                        let mut state = scope.state.lock();
                        state.add_collectible(trait_type, collectible)
                    })
                })
                .for_each(|e| tasks.extend(e.notify));
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
        let mut state = self.state.write();
        if state.collectibles.unemit(trait_type, collectible) {
            let mut tasks = HashSet::new();
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

    pub(crate) fn get_fresh_cell(&self) -> usize {
        let mut state = self.state.write();
        let index = state.created_cells.len();
        state.created_cells.push(Cell::new());
        index
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
        if queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(SPLIT_OFF_QUEUE_AT);
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
        if queue.len() > SPLIT_OFF_QUEUE_AT {
            let split_off_queue = queue.split_off(SPLIT_OFF_QUEUE_AT);

            turbo_tasks.schedule_backend_foreground_job(
                backend.create_backend_job(Job::RemoveFromScopeQueue(split_off_queue, id)),
            );
        }
    }
}

impl Display for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let state = self.state.read();
        write!(
            f,
            "Task({}, {})",
            self.get_description(),
            Task::state_string(&state)
        )
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
    pub total_duration: Duration,
    pub last_duration: Duration,
    pub executions: u32,
    pub root_scoped: bool,
    pub child_scopes: usize,
    pub active: bool,
}
