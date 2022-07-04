#[cfg(feature = "report_expensive")]
use std::time::Instant;
use std::{
    cell::RefCell,
    collections::HashSet,
    fmt::{self, Debug, Display, Formatter, Write},
    future::Future,
    hash::Hash,
    mem::take,
    pin::Pin,
    sync::{Mutex, RwLock, RwLockWriteGuard},
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
    ResolveTrait(TraitTypeId, String),
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
        let state = self.state.read().unwrap();
        let mut result = f.debug_struct("Task");
        result.field("type", &self.ty);
        result.field("scopes", &state.scopes.iter().collect::<Vec<_>>());
        result.field("state", &state.state_type);
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
    memory_backend::BackgroundJob,
    output::Output,
    scope::{AddResult, RemoveResult, TaskScopeId, TaskScopeList},
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
        trait_fn_name: String,
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
                &**self
            );
        } else if elapsed.as_millis() >= 10 || count > 10000 {
            println!(
                "clear_dependencies({}) took {} µs: {:?}",
                count,
                elapsed.as_micros(),
                &**self
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
                    turbo_tasks.schedule_backend_background_job(
                        backend.create_background_job(BackgroundJob::RemoveFromScopes(set, scopes)),
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
        backend: &MemoryBackend,
        _turbo_tasks: &dyn TurboTasksBackendApi,
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
            match state.state_type {
                InProgress => {
                    state.state_type = Done;
                    state.event.notify(usize::MAX);
                }
                InProgressDirty => {
                    clear_dependencies = true;
                    let mut active = false;
                    for scope in state.scopes.iter() {
                        if backend.with_scope(scope, |scope| scope.is_active()) {
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

        // if let TaskType::Once(_) = self.ty {
        //     let job =
        // backend.create_background_job(BackgroundJob::RemoveTask(self.id));
        //     turbo_tasks.schedule_backend_background_job(job);
        // }
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
        let mut state = self.state.write().unwrap();
        if let Some(root) = state.scopes.root {
            if backend.with_scope(id, |scope| scope.add_child(root)) {
                drop(state);
                backend.increase_scope_active(root, turbo_tasks);
            }
        } else {
            match state.scopes.try_add(id) {
                AddResult::Root => {
                    // root doesn't have to be added
                    // this is called when it is circular
                }
                AddResult::Existing => {
                    // nothing to do, we can stop propagating as this task is
                    // already part of that scope
                }
                AddResult::New => {
                    for child in state.children.iter() {
                        // TODO this could deadlock, when there are cycles
                        backend.with_task(*child, |child| {
                            child.add_to_scope(id, backend, turbo_tasks);
                        })
                    }
                    // add to dirty list of the scope (potentially schedule)
                    if state.state_type == TaskStateType::Dirty {
                        backend.with_scope(id, move |scope| {
                            if scope.is_active() {
                                state.state_type = Scheduled;
                                drop(state);
                                turbo_tasks.schedule(self.id);
                            } else {
                                scope.dirty_tasks.insert(self.id);
                            }
                        })
                    }
                }
                AddResult::Full => {
                    todo!("create new root scope here and add as child of existing scopes")
                }
            }
        }
    }

    fn remove_from_scope_interal(
        &self,
        state: &mut RwLockWriteGuard<TaskState>,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        match state.scopes.remove(id) {
            RemoveResult::Root => {
                // root doesn't have to be removed
                // this is called when it is circular
            }
            RemoveResult::NoEntry => {
                if let Some(root) = state.scopes.root {
                    if backend.with_scope(id, |scope| scope.remove_child(root)) {
                        drop(state);
                        backend.decrease_scope_active(root, turbo_tasks);
                    }
                } else {
                    panic!("Tried to remove from scope it's not part of")
                }
            }
            RemoveResult::Decreased => {
                // nothing to do, we can stop propagating
            }
            RemoveResult::Removed => {
                for child in state.children.iter() {
                    backend.with_task(*child, |child| {
                        child.add_to_scope(id, backend, turbo_tasks);
                    })
                }
            }
        }
    }

    pub(crate) fn remove_from_scope(
        &self,
        id: TaskScopeId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write().unwrap();
        self.remove_from_scope_interal(&mut state, id, backend, turbo_tasks)
    }

    pub(crate) fn remove_from_scopes(
        &self,
        scopes: impl Iterator<Item = TaskScopeId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi,
    ) {
        let mut state = self.state.write().unwrap();
        for id in scopes {
            self.remove_from_scope_interal(&mut state, id, backend, turbo_tasks)
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

            backend.with_task(child_id, |child| {
                for scope in scopes.iter() {
                    #[cfg(not(feature = "report_expensive"))]
                    child.add_to_scope(scope, backend, turbo_tasks);
                    #[cfg(feature = "report_expensive")]
                    {
                        let start = Instant::now();
                        child.add_to_scope(scope, backend, turbo_tasks);
                        let elapsed = start.elapsed();
                        if elapsed.as_millis() >= 100 {
                            println!(
                                "add_to_scope took {} ms: {:?}",
                                elapsed.as_millis(),
                                &**child
                            );
                        } else if elapsed.as_millis() >= 10 || count > 10000 {
                            println!(
                                "add_to_scope took {} µs: {:?}",
                                elapsed.as_micros(),
                                &**child
                            );
                        }
                    }
                }
            });
        }
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> Result<T>>(
        &self,
        func: F,
    ) -> Result<Result<T, EventListener>> {
        let mut state = self.state.write().unwrap();
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
