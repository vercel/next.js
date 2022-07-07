use std::{
    borrow::Cow,
    cell::RefCell,
    collections::HashSet,
    fmt::{self, Debug, Display, Formatter, Write},
    future::Future,
    hash::Hash,
    mem::take,
    pin::Pin,
    sync::{Mutex, RwLock, RwLockWriteGuard},
    time::Duration,
};

use anyhow::Result;
use event_listener::{Event, EventListener};
use tokio::task_local;
use turbo_tasks::{
    backend::{CellMappings, PersistentTaskType},
    get_invalidator, registry, FunctionId, Invalidator, RawVc, TaskId, TaskInput, TraitTypeId,
    TurboTasksBackendApi,
};
pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

const OPTIMIZE_ROOT_SCOPE_INNER_COUNT: usize = 10000;

task_local! {
    /// Vc that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    pub(crate) static DEPENDENCIES_TO_TRACK: RefCell<HashSet<RawVc>>;
}

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
    Once(Mutex<Option<Pin<Box<dyn Future<Output = Result<RawVc>> + Send + 'static>>>>),

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
    /// Cells that the task has read during execution.
    /// The Task will keep these tasks alive as invalidations that happen there
    /// might affect this task.
    ///
    /// This back-edge is [Cell] `dependent_tasks`, which is a weak edge.
    dependencies: HashSet<RawVc>,

    /// Mappings from key or data type to cell index, to store the data in the
    /// same cell again.
    cell_mappings: CellMappings,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut result = f.debug_struct("Task");
        result.field("type", &self.ty);
        if let Ok(state) = self.state.try_read() {
            result.field("scopes", &state.scopes.iter().collect::<Vec<_>>());
            result.field("state", &state.state_type);
        }
        result.finish()
    }
}

/// The state of a [Task]
#[derive(Default)]
struct TaskState {
    scopes: TaskScopeList,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// children are only modified from execution
    children: HashSet<TaskId>,

    output: Output,
    created_cells: Vec<Cell>,
    event: Event,
    executions: u32,
    total_duration: Duration,
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
    memory_backend::Job,
    output::Output,
    scope::{RemoveResult, SetRootResult, TaskScopeId, TaskScopeList},
    stats, MemoryBackend,
};

impl Task {
    pub(crate) fn new_native(id: TaskId, inputs: Vec<TaskInput>, native_fn: FunctionId) -> Self {
        let bound_fn = registry::get_function(native_fn).bind(&inputs);
        Self {
            id,
            inputs,
            ty: TaskType::Native(native_fn, bound_fn),
            state: Default::default(),
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
            state: Default::default(),
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
            state: Default::default(),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_root(
        id: TaskId,
        functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static,
    ) -> Self {
        Self {
            id,
            inputs: Vec::new(),
            ty: TaskType::Root(Box::new(functor)),
            state: RwLock::new(TaskState {
                state_type: Scheduled,
                ..Default::default()
            }),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn new_once(
        id: TaskId,
        functor: impl Future<Output = Result<RawVc>> + Send + 'static,
    ) -> Self {
        Self {
            id,
            inputs: Vec::new(),
            ty: TaskType::Once(Mutex::new(Some(Box::pin(functor)))),
            state: RwLock::new(TaskState {
                state_type: Scheduled,
                ..Default::default()
            }),
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

    pub(crate) fn remove_dependent_task(dep: RawVc, reader: TaskId, backend: &MemoryBackend) {
        match dep {
            RawVc::TaskOutput(task) => {
                backend.with_task(task, |task| {
                    task.with_output_mut(|output| {
                        output.dependent_tasks.remove(&reader);
                    });
                });
            }
            RawVc::TaskCell(task, index) => {
                backend.with_task(task, |task| {
                    task.with_cell_mut(index, |cell| {
                        cell.dependent_tasks.remove(&reader);
                    });
                });
            }
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(&self, backend: &MemoryBackend) {
        let mut execution_data = self.execution_data.lock().unwrap();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

        for dep in dependencies.into_iter() {
            Task::remove_dependent_task(dep, self.id, backend);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(&self, backend: &MemoryBackend) {
        use std::time::Instant;
        let start = Instant::now();
        let mut execution_data = self.execution_data.lock().unwrap();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            Task::remove_dependent_task(dep, self.id, backend);
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 100 {
            println!(
                "clear_dependencies({}) took {} ms: {:?}",
                count,
                elapsed.as_millis(),
                self
            );
        } else if elapsed.as_millis() >= 10 || count > 10000 {
            println!(
                "clear_dependencies({}) took {} µs: {:?}",
                count,
                elapsed.as_micros(),
                self
            );
        }
    }

    pub(crate) fn execution_started(
        self: &Task,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> bool {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Done | InProgress | InProgressDirty => {
                // should not start in this state
                return false;
            }
            Scheduled => {
                state.state_type = InProgress;
                state.executions += 1;
                if !state.children.is_empty() {
                    let set = take(&mut state.children);
                    let scopes = state.scopes.iter().collect::<Vec<_>>();
                    // TODO potentially convert something to a root scope to make it more efficient
                    let debug_info = format!("execution_started {}, scopes: {scopes:?}", self.id);
                    turbo_tasks.schedule_backend_background_job(
                        backend.create_backend_job(Job::RemoveFromScopes(
                            set, scopes, false, debug_info,
                        )),
                    );
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
        result: Result<RawVc>,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            InProgress => match result {
                Ok(result) => state.output.link(result, turbo_tasks),
                Err(err) => state.output.error(err, turbo_tasks),
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
            let mut execution_data = self.execution_data.lock().unwrap();
            if let Some(cell_mappings) = cell_mappings {
                execution_data.cell_mappings = cell_mappings;
            }
            execution_data.dependencies = deps.take();
        });
        let mut schedule_task = false;
        let mut clear_dependencies = false;
        {
            let mut state = self.state.write().unwrap();
            state.total_duration += duration;
            match state.state_type {
                InProgress => {
                    state.state_type = Done;
                    for scope in state.scopes.iter() {
                        backend.with_scope(scope, |scope| {
                            scope.decrement_unfinished_tasks();
                        })
                    }
                    state.event.notify(usize::MAX);
                }
                InProgressDirty => {
                    clear_dependencies = true;
                    let mut active = false;
                    for scope in state.scopes.iter() {
                        if backend
                            .with_scope(scope, |scope| scope.state.lock().unwrap().is_active())
                        {
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

        // TODO enabled these lines once "Once" tasks correctly bring values up to date
        // on reading eventually consistent doesn't work for them...

        if let TaskType::Once(_) = self.ty {
            turbo_tasks.schedule_backend_background_job(
                backend.create_backend_job(Job::RemoveRootScope(self.id)),
            );
        }
        schedule_task
    }

    fn make_dirty(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksBackendApi) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }
        self.clear_dependencies(backend);

        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty | Scheduled | InProgressDirty => {
                // already dirty
            }
            Done => {
                // add to dirty lists and potentially schedule
                let mut active = false;
                for scope in state.scopes.iter() {
                    backend.with_scope(scope, |scope| {
                        scope.increment_unfinished_tasks();
                        let mut scope = scope.state.lock().unwrap();
                        if scope.is_active() {
                            active = true;
                        } else {
                            scope.dirty_tasks.insert(self.id);
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

    pub(crate) fn set_root_scope(&self, id: TaskScopeId) -> SetRootResult {
        let mut state = self.state.write().unwrap();
        state.scopes.set_root(id)
    }

    pub(crate) fn schedule_when_dirty(&self, turbo_tasks: &dyn TurboTasksBackendApi) {
        let mut state = self.state.write().unwrap();
        if state.state_type == TaskStateType::Dirty {
            state.state_type = Scheduled;
            drop(state);
            turbo_tasks.schedule(self.id);
        }
    }

    pub(crate) fn add_to_scope(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        self.add_to_scope_internal(id, false, backend, turbo_tasks);
    }

    pub(crate) fn add_to_scope_internal_shallow(
        &self,
        id: TaskScopeId,
        mut will_be_optimized: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<(Vec<TaskId>, bool)> {
        let mut state = self.state.write().unwrap();
        if let Some(root) = state.scopes.root {
            if backend.with_scope(id, |scope| scope.state.lock().unwrap().add_child(root)) {
                drop(state);
                backend.increase_scope_active(root, turbo_tasks);
            }
        } else {
            if state.scopes.add(id) {
                if !will_be_optimized && state.scopes.len() == 100 {
                    turbo_tasks.schedule_backend_background_job(
                        backend.create_backend_job(Job::MakeRootScoped(self.id)),
                    );
                    will_be_optimized = true;
                }
                let children = state.children.iter().copied().collect::<Vec<_>>();

                drop(self.add_self_to_new_scope(state, id, backend, turbo_tasks));

                if !children.is_empty() {
                    return Some((children, will_be_optimized));
                }
            }
        }
        None
    }

    pub(crate) fn add_to_scope_internal(
        &self,
        id: TaskScopeId,
        will_be_optimized: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> usize {
        let mut count = 0;
        if let Some((children, will_be_optimized)) =
            self.add_to_scope_internal_shallow(id, will_be_optimized, backend, turbo_tasks)
        {
            count += 1;
            let mut queue = vec![(children, will_be_optimized)];

            while let Some((children, will_be_optimized)) = queue.pop() {
                for child in children {
                    backend.with_task(child, |child| {
                        if let Some(r) = child.add_to_scope_internal_shallow(
                            id,
                            will_be_optimized,
                            backend,
                            turbo_tasks,
                        ) {
                            count += 1;
                            queue.push(r);
                        }
                    })
                }
            }
        }
        count
    }

    fn add_self_to_new_scope<'a>(
        &self,
        mut state: RwLockWriteGuard<'a, TaskState>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<RwLockWriteGuard<'a, TaskState>> {
        // add to dirty list of the scope (potentially schedule)
        backend.with_scope(id, move |scope| {
            scope.increment_tasks();
            if !matches!(state.state_type, TaskStateType::Done) {
                scope.increment_unfinished_tasks();
                if state.state_type == TaskStateType::Dirty {
                    let mut scope = scope.state.lock().unwrap();
                    if scope.is_active() {
                        drop(scope);
                        state.state_type = Scheduled;
                        drop(state);
                        turbo_tasks.schedule(self.id);
                        None
                    } else {
                        scope.dirty_tasks.insert(self.id);
                        Some(state)
                    }
                } else {
                    Some(state)
                }
            } else {
                Some(state)
            }
        })
    }

    fn remove_from_scope_internal(
        &self,
        state: &mut RwLockWriteGuard<TaskState>,
        id: TaskScopeId,
        will_be_optimized: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
        debug_info: &str,
    ) -> usize {
        match state.scopes.remove(id) {
            RemoveResult::NoEntry => {
                if let Some(root) = state.scopes.root {
                    if backend
                        .with_scope(id, |scope| scope.state.lock().unwrap().remove_child(root))
                    {
                        drop(state);
                        backend.decrease_scope_active(root, turbo_tasks);
                    }
                } else {
                    panic!(
                        "Tried to remove from scope it's not part of {} {id}: {debug_info}",
                        self.id
                    )
                }
            }
            RemoveResult::Decreased => {
                // nothing to do, we can stop propagating
            }
            RemoveResult::Removed => {
                backend.with_scope(id, |scope| {
                    if !matches!(state.state_type, Done) {
                        scope.decrement_unfinished_tasks();
                    }
                    scope.decrement_tasks();
                });
                let mut count = 1;
                for child in state.children.iter() {
                    backend.with_task(*child, |child| {
                        let mut state = child.state.write().unwrap();
                        count += child.remove_from_scope_internal(
                            &mut state,
                            id,
                            true,
                            backend,
                            turbo_tasks,
                            debug_info,
                        );
                    })
                }
                if !will_be_optimized && count > OPTIMIZE_ROOT_SCOPE_INNER_COUNT {
                    turbo_tasks.schedule_backend_background_job(
                        backend.create_backend_job(Job::MakeRootScoped(self.id)),
                    );
                }
                return count;
            }
        }
        0
    }

    pub(crate) fn remove_from_scope(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> usize {
        let mut state = self.state.write().unwrap();
        self.remove_from_scope_internal(&mut state, id, false, backend, turbo_tasks, "")
    }

    pub(crate) fn remove_from_scopes(
        &self,
        scopes: impl Iterator<Item = TaskScopeId>,
        will_be_optimized: bool,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
        debug_info: &str,
    ) -> usize {
        let mut state = self.state.write().unwrap();
        let mut count = 0;
        for id in scopes {
            count += self.remove_from_scope_internal(
                &mut state,
                id,
                will_be_optimized,
                backend,
                turbo_tasks,
                debug_info,
            )
        }
        count
    }

    pub(crate) fn remove_root_scope(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write().unwrap();
        if let Some(root) = state.scopes.root {
            #[cfg(feature = "print_scope_updates")]
            println!("removing root scope {root}");
            state.scopes.root = None;
            turbo_tasks.schedule_backend_background_job(backend.create_backend_job(
                Job::RemoveFromScope(state.children.iter().copied().collect(), root),
            ));
        }
    }

    pub(crate) fn make_root_scoped(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let state = self.state.write().unwrap();
        #[cfg(not(feature = "report_expensive"))]
        self.make_root_scoped_internal(state, backend, turbo_tasks);
        #[cfg(feature = "report_expensive")]
        {
            use std::time::Instant;
            let start = Instant::now();
            drop(self.make_root_scoped_internal(state, backend, turbo_tasks));
            let elapsed = start.elapsed();
            if elapsed.as_millis() >= 100 {
                println!(
                    "make_root_scoped took {} ms: {:?}",
                    elapsed.as_millis(),
                    self
                );
            } else if elapsed.as_millis() >= 10 {
                println!(
                    "make_root_scoped took {} µs: {:?}",
                    elapsed.as_micros(),
                    self
                );
            }
        };
    }

    fn make_root_scoped_internal<'a>(
        &self,
        mut state: RwLockWriteGuard<'a, TaskState>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Option<RwLockWriteGuard<'a, TaskState>> {
        if matches!(state.scopes.root, None) {
            let root_scope = backend.create_new_scope();
            let scopes = state.scopes.take_scopes();
            #[cfg(feature = "print_scope_updates")]
            println!(
                "new {root_scope} for {:?} as internal root scope (replacing {scopes:?})",
                self.ty
            );
            let active_counter = scopes
                .iter()
                .filter(|(scope, count)| {
                    backend.with_scope(*scope, |scope| {
                        if !matches!(state.state_type, Done) {
                            scope.decrement_unfinished_tasks();
                        }
                        scope.decrement_tasks();
                        scope
                            .state
                            .lock()
                            .unwrap()
                            .add_child_count(root_scope, *count)
                    })
                })
                .count();
            if active_counter > 0 {
                backend.increase_scope_active_by(root_scope, active_counter, turbo_tasks);
            }

            // Set the root scope of the current task
            state.scopes.root = Some(root_scope);
            let children = state.children.clone();

            let state = self.add_self_to_new_scope(state, root_scope, backend, turbo_tasks);

            if children.is_empty() {
                return state;
            } else {
                drop(state);
            }

            // Add children to new root scope
            for child in children.iter() {
                // TODO this could deadlock, when there are cycles
                backend.with_task(*child, |child| {
                    child.add_to_scope_internal(root_scope, true, backend, turbo_tasks);
                })
            }

            turbo_tasks.schedule_backend_background_job(backend.create_backend_job(
                Job::RemoveFromScopes(
                    children,
                    scopes.into_iter().map(|(id, _)| id).collect(),
                    true,
                    format!("make_root_scoped {} {root_scope}", self.id),
                ),
            ));
            None
        } else {
            Some(state)
        }
    }

    pub(crate) fn take_cell_mappings(&self) -> CellMappings {
        let mut execution_data = self.execution_data.lock().unwrap();
        let mut cell_mappings = take(&mut execution_data.cell_mappings);
        for list in cell_mappings.by_type.values_mut() {
            list.0 = 0;
        }
        cell_mappings
    }

    pub(crate) fn add_dependency_to_current(dep: RawVc) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
    }

    pub(crate) fn execute(&self, tt: &dyn TurboTasksBackendApi) -> NativeTaskFuture {
        match &self.ty {
            TaskType::Root(bound_fn) => bound_fn(),
            TaskType::Once(mutex) => {
                let future = mutex
                    .lock()
                    .unwrap()
                    .take()
                    .expect("Task can only be executed once");
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
        let mut state = self.state.write().unwrap();
        func(&mut state.output)
    }

    /// Access to a cell.
    pub(crate) fn with_cell_mut<T>(&self, index: usize, func: impl FnOnce(&mut Cell) -> T) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.created_cells[index])
    }

    /// Access to a cell.
    pub(crate) fn with_cell<T>(&self, index: usize, func: impl FnOnce(&Cell) -> T) -> T {
        let state = self.state.read().unwrap();
        func(&state.created_cells[index])
    }

    /// For testing purposes
    pub fn reset_executions(&self) {
        let mut state = self.state.write().unwrap();
        if state.executions > 1 {
            state.executions = 1;
        }
    }

    pub fn is_pending(&self) -> bool {
        let state = self.state.read().unwrap();
        state.state_type != TaskStateType::Done
    }

    pub fn get_stats_info(&self) -> (Duration, u32, bool, usize) {
        let state = self.state.read().unwrap();
        (
            state.total_duration,
            state.executions,
            state.scopes.root.is_some(),
            state.scopes.len(),
        )
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

    pub fn get_stats_references(&self) -> Vec<(stats::ReferenceType, TaskId)> {
        let mut refs = Vec::new();
        {
            let state = self.state.read().unwrap();
            for child in state.children.iter() {
                refs.push((stats::ReferenceType::Child, *child));
            }
        }
        {
            let execution_data = self.execution_data.lock().unwrap();
            for dep in execution_data.dependencies.iter() {
                refs.push((stats::ReferenceType::Dependency, dep.get_task_id()));
            }
        }
        {
            for input in self.inputs.iter() {
                if let Some(task) = input.get_task_id() {
                    refs.push((stats::ReferenceType::Input, task));
                }
            }
        }
        refs
    }

    fn state_string(state: &TaskState) -> String {
        let mut state_str = match state.state_type {
            Scheduled => "scheduled".to_string(),
            InProgress => "in progress".to_string(),
            InProgressDirty => "in progress (dirty)".to_string(),
            Done => "done".to_string(),
            Dirty => "dirty".to_string(),
        };
        if let Some(root) = state.scopes.root {
            write!(state_str, " (root scope {})", *root).unwrap();
        }
        let mut has_scopes = false;
        for scope in state.scopes.iter_non_root() {
            if !has_scopes {
                write!(state_str, " (scopes").unwrap();
                has_scopes = true;
            }
            write!(state_str, " {}", *scope).unwrap();
        }
        if has_scopes {
            write!(state_str, ")").unwrap();
        }
        state_str
    }

    pub(crate) fn connect_child(
        &self,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write().unwrap();
        if state.children.insert(child_id) {
            let scopes = state.scopes.clone();
            drop(state);

            let mut count = 0;
            backend.with_task(child_id, |child| {
                for scope in scopes.iter() {
                    #[cfg(not(feature = "report_expensive"))]
                    {
                        count += child.add_to_scope_internal(scope, true, backend, turbo_tasks);
                    }
                    #[cfg(feature = "report_expensive")]
                    {
                        use std::time::Instant;
                        let start = Instant::now();
                        count += child.add_to_scope_internal(scope, true, backend, turbo_tasks);
                        let elapsed = start.elapsed();
                        if elapsed.as_millis() >= 100 {
                            println!(
                                "add_to_scope {scope} took {} ms: {:?}",
                                elapsed.as_millis(),
                                child
                            );
                        } else if elapsed.as_millis() >= 10 {
                            println!(
                                "add_to_scope {scope} took {} µs: {:?}",
                                elapsed.as_micros(),
                                child
                            );
                        }
                    }
                }
            });
            if count > OPTIMIZE_ROOT_SCOPE_INNER_COUNT {
                turbo_tasks.schedule_backend_background_job(
                    backend.create_backend_job(Job::MakeRootScoped(self.id)),
                );
            }
        }
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        strongly_consistent: bool,
        func: F,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) -> Result<Result<T, EventListener>> {
        let mut state = self.state.write().unwrap();
        if strongly_consistent {
            while state.scopes.root.is_none() {
                #[cfg(not(feature = "report_expensive"))]
                let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
                #[cfg(feature = "report_expensive")]
                let result = {
                    use std::time::Instant;
                    let start = Instant::now();
                    let result = self.make_root_scoped_internal(state, backend, turbo_tasks);
                    let elapsed = start.elapsed();
                    if elapsed.as_millis() >= 100 {
                        println!(
                            "make_root_scoped took {} ms: {:?}",
                            elapsed.as_millis(),
                            self
                        );
                    } else if elapsed.as_millis() >= 10 {
                        println!(
                            "make_root_scoped took {} µs: {:?}",
                            elapsed.as_micros(),
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
                    state = self.state.write().unwrap();
                    continue;
                }
            }
            let root = state.scopes.root.unwrap();
            if let Some(listener) = backend.with_scope(root, |scope| {
                if let Some(listener) = scope.has_unfinished_tasks(root, backend) {
                    return Some(listener);
                }
                if let Some(listener) = scope.has_unfinished_tasks(root, backend) {
                    println!(
                        "First has_unfinished_tasks call lied to us (race condition?): {:?}",
                        self.ty
                    );
                    return Some(listener);
                }
                None
            }) {
                return Ok(Err(listener));
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

    pub(crate) fn get_fresh_cell(&self) -> usize {
        let mut state = self.state.write().unwrap();
        let index = state.created_cells.len();
        state.created_cells.push(Cell::new());
        index
    }
}

impl Display for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let state = self.state.read().unwrap();
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
        self as *const Task == other as *const Task
    }
}

impl Eq for Task {}
