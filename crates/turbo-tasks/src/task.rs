use crate::{
    backend::SlotMappings,
    id::{FunctionId, TraitTypeId},
    manager::{get_invalidator, TurboTasksApi},
    memory_backend::BackgroundJob,
    output::Output,
    raw_vc::RawVc,
    registry,
    slot::Slot,
    stats,
    task_input::TaskInput,
    Invalidator, MemoryBackend, TaskId,
};
use anyhow::{anyhow, Result};
use async_std::task_local;
use event_listener::{Event, EventListener};
#[cfg(feature = "report_expensive")]
use std::time::Instant;
use std::{
    cell::RefCell,
    collections::HashSet,
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::Hash,
    mem::{swap, take},
    pin::Pin,
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex, RwLock,
    },
};
pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

task_local! {
    /// Vc that are read during task execution
    /// These will be stored as dependencies when the execution has finished
    static DEPENDENCIES_TO_TRACK: RefCell<HashSet<RawVc>> = Default::default();
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
    /// A counter how many other active Tasks are using that task.
    /// When this counter reaches 0 the task will be marked inactive.
    /// When it becomes non-zero the task will be marked active.
    active_parents: AtomicU32,
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
    /// Slots that the task has read during execution.
    /// The Task will keep these tasks alive as invalidations that happen there
    /// might affect this task.
    ///
    /// This back-edge is [Slot] `dependent_tasks`, which is a weak edge.
    dependencies: HashSet<RawVc>,

    /// Mappings from key or data type to slot index, to store the data in the
    /// same slot again.
    slot_mappings: SlotMappings,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let state = self.state.read().unwrap();
        let mut result = f.debug_struct("Task");
        result.field("type", &self.ty);
        result.field("active", &state.active);
        result.field("state", &state.state_type);
        result.finish()
    }
}

/// The state of a [Task]
#[derive(Default)]
struct TaskState {
    /// true, when the task is transitively a child of a root task.
    ///
    /// It will be set to `false` in a background process, so it might be still
    /// `true` even if it's no longer connected.
    active: bool,

    // TODO using a Atomic might be possible here
    /// More flags of task state, where not all combinations are possible.
    /// dirty, scheduled, in progress
    state_type: TaskStateType,

    /// children are only modified from execution
    children: HashSet<TaskId>,

    output: Output,
    created_slots: Vec<Slot>,
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

impl Task {
    pub(crate) fn new_native(id: TaskId, inputs: Vec<TaskInput>, native_fn: FunctionId) -> Self {
        let bound_fn = registry::get_function(native_fn).bind(&inputs);
        Self {
            id,
            inputs,
            ty: TaskType::Native(native_fn, bound_fn),
            state: Default::default(),
            active_parents: Default::default(),
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
            active_parents: Default::default(),
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
            active_parents: Default::default(),
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
                active: true,
                state_type: Scheduled,
                ..Default::default()
            }),
            active_parents: AtomicU32::new(1),
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
                active: true,
                state_type: Scheduled,
                ..Default::default()
            }),
            active_parents: AtomicU32::new(1),
            execution_data: Default::default(),
        }
    }

    pub(crate) fn remove(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksApi) {
        if self.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.deactivate(1, backend, turbo_tasks);
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    pub(crate) fn deactivate_tasks(
        tasks: Vec<TaskId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksApi,
    ) {
        for child in tasks.into_iter() {
            backend.with_task(child, |child| child.deactivate(1, backend, turbo_tasks));
        }
    }

    #[cfg(feature = "report_expensive")]
    pub(crate) fn deactivate_tasks(
        tasks: Vec<TaskId>,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksApi,
    ) {
        let start = Instant::now();
        let mut count = 0;
        let mut len = 0;
        for child in tasks.into_iter() {
            count += backend.with_task(child, |child| child.deactivate(1, turbo_tasks));
            len += 1;
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 10 {
            println!(
                "deactivate_tasks({}, {}) took {} ms",
                count,
                len,
                elapsed.as_millis(),
            );
        } else if count > 10000 {
            println!(
                "deactivate_tasks({}, {}) took {} µs",
                count,
                len,
                elapsed.as_micros(),
            );
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
            RawVc::TaskSlot(task, index) => {
                backend.with_task(task, |task| {
                    task.with_slot_mut(index, |slot| {
                        slot.dependent_tasks.remove(&reader);
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
        turbo_tasks: &dyn TurboTasksApi,
    ) -> bool {
        let mut state = self.state.write().unwrap();
        if !state.active {
            return false;
        }
        match state.state_type {
            Done | InProgress | InProgressDirty => {
                // should not start in this state
                return false;
            }
            Scheduled => {
                state.state_type = InProgress;
                state.executions += 1;
                if !state.children.is_empty() {
                    let mut set = HashSet::new();
                    swap(&mut set, &mut state.children);
                    turbo_tasks.schedule_backend_background_job(
                        backend.create_background_job(BackgroundJob::RemoveTasks(set)),
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

    pub(crate) fn execution_result(&self, result: Result<RawVc>) {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            InProgress => match result {
                Ok(result) => state.output.link(result),
                Err(err) => state.output.error(err),
            },
            InProgressDirty => {
                // We don't want to assign the output slot here
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
        slot_mappings: Option<SlotMappings>,
        backend: &MemoryBackend,
    ) -> bool {
        DEPENDENCIES_TO_TRACK.with(|deps| {
            let mut execution_data = self.execution_data.lock().unwrap();
            if let Some(slot_mappings) = slot_mappings {
                execution_data.slot_mappings = slot_mappings;
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
                    if state.active {
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
        schedule_task
    }

    /// This method should be called after adding the first parent
    fn activate(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksApi) -> usize {
        let mut state = self.state.write().unwrap();

        if self.active_parents.load(Ordering::Acquire) == 0 {
            return 0;
        }

        if state.active {
            return 0;
        }

        state.active = true;

        let mut count = 1;

        // This locks the whole tree, but avoids cloning children

        for child in state.children.iter() {
            backend.with_task(*child, |child| {
                if child.active_parents.fetch_add(1, Ordering::AcqRel) == 0 {
                    count += child.activate(backend, turbo_tasks);
                }
            })
        }
        match state.state_type {
            Dirty => {
                state.state_type = Scheduled;
                drop(state);
                turbo_tasks.schedule(self.id);
            }
            Done | Scheduled | InProgress | InProgressDirty => {
                drop(state);
            }
        }
        count
    }

    /// This method should be called after removing the last parent
    fn deactivate(
        &self,
        depth: u8,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksApi,
    ) -> usize {
        let mut state = self.state.write().unwrap();

        if self.active_parents.load(Ordering::Acquire) != 0 {
            return 0;
        }

        if !state.active {
            return 0;
        }

        state.active = false;

        let mut count = 1;

        if depth < 4 {
            // This locks the whole tree, but avoids cloning children

            for child in state.children.iter() {
                backend.with_task(*child, |child| {
                    if child.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
                        count += child.deactivate(depth + 1, backend, turbo_tasks);
                    }
                })
            }
            drop(state);
            count
        } else {
            let mut scheduled = Vec::new();
            for child_id in state.children.iter() {
                backend.with_task(*child_id, |child| {
                    if child.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
                        scheduled.push(*child_id);
                    }
                })
            }
            drop(state);
            turbo_tasks.schedule_backend_background_job(
                backend.create_background_job(BackgroundJob::DeactivateTasks(scheduled)),
            );
            count
        }
    }

    pub(crate) fn dependent_slot_updated(
        &self,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksApi,
    ) {
        self.make_dirty(backend, turbo_tasks);
    }

    fn make_dirty(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksApi) {
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
                if state.active {
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

    pub(crate) fn take_slot_mappings(&self) -> SlotMappings {
        let mut execution_data = self.execution_data.lock().unwrap();
        let mut slot_mappings = take(&mut execution_data.slot_mappings);
        for list in slot_mappings.by_type.values_mut() {
            list.0 = 0;
        }
        slot_mappings
    }

    pub(crate) fn add_dependency_to_current(dep: RawVc) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
    }

    pub(crate) fn execute(&self, tt: &dyn TurboTasksApi) -> NativeTaskFuture {
        match &self.ty {
            TaskType::Root(bound_fn) => bound_fn(),
            TaskType::Once(mutex) => {
                let future = mutex
                    .lock()
                    .unwrap()
                    .take()
                    .expect("Task can only be executed once");
                // let task = self.clone();
                Box::pin(async move {
                    let result = future.await;
                    // TODO wait for full completion
                    // if task.active_parents.fetch_sub(1, Ordering::Relaxed) == 1 {
                    //     task.deactivate(1, tt);
                    // }
                    result
                })
            }
            TaskType::Native(_, bound_fn) => bound_fn(),
            TaskType::ResolveNative(ref native_fn) => {
                let native_fn = *native_fn;
                let inputs = self.inputs.clone();
                let tt = tt.pin();
                Box::pin(async move {
                    let mut resolved_inputs = Vec::new();
                    for input in inputs.into_iter() {
                        resolved_inputs.push(input.resolve().await?)
                    }
                    Ok(tt.native_call(native_fn, resolved_inputs))
                })
            }
            TaskType::ResolveTrait(trait_type, name) => {
                let trait_type = *trait_type;
                let name = name.clone();
                let inputs = self.inputs.clone();
                let tt = tt.pin();
                Box::pin(async move {
                    let mut resolved_inputs = Vec::new();
                    let mut iter = inputs.into_iter();
                    if let Some(this) = iter.next() {
                        let this = this.resolve().await?;
                        let this_value = this.clone().resolve_to_value().await?;
                        match this_value.get_trait_method(trait_type, name.clone()) {
                            Some(native_fn) => {
                                resolved_inputs.push(this);
                                for input in iter {
                                    resolved_inputs.push(input)
                                }
                                Ok(tt.dynamic_call(native_fn, resolved_inputs))
                            }
                            None => {
                                if !this_value.has_trait(trait_type) {
                                    let traits = this_value
                                        .traits()
                                        .iter()
                                        .map(|t| format!(" {}", t))
                                        .collect::<String>();
                                    Err(anyhow!(
                                        "{} doesn't implement trait {} (only{})",
                                        this_value,
                                        trait_type,
                                        traits,
                                    ))
                                } else {
                                    Err(anyhow!(
                                        "{} implements trait {}, but method {} is missing",
                                        this_value,
                                        trait_type,
                                        name
                                    ))
                                }
                            }
                        }
                    } else {
                        panic!("No arguments for trait call");
                    }
                })
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
    pub(crate) fn invalidate(&self, backend: &MemoryBackend, turbo_tasks: &dyn TurboTasksApi) {
        self.make_dirty(backend, turbo_tasks)
    }

    /// Access to the output slot.
    pub(crate) fn with_output_mut<T>(&self, func: impl FnOnce(&mut Output) -> T) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.output)
    }

    /// Access to a slot.
    pub(crate) fn with_slot_mut<T>(&self, index: usize, func: impl FnOnce(&mut Slot) -> T) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.created_slots[index])
    }

    /// Access to a slot.
    pub(crate) fn with_slot<T>(&self, index: usize, func: impl FnOnce(&Slot) -> T) -> T {
        let state = self.state.read().unwrap();
        func(&state.created_slots[index])
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
        let state_str = match state.state_type {
            Scheduled => "scheduled".to_string(),
            InProgress => "in progress".to_string(),
            InProgressDirty => "in progress (dirty)".to_string(),
            Done => "done".to_string(),
            Dirty => "dirty".to_string(),
        };
        state_str + if state.active { "" } else { " (inactive)" }
    }

    pub(crate) fn connect_child(
        &self,
        child_id: TaskId,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksApi,
    ) {
        let mut state = self.state.write().unwrap();
        if state.children.insert(child_id) {
            let active = state.active;
            drop(state);

            if active {
                backend.with_task(child_id, |child| {
                    if child.active_parents.fetch_add(1, Ordering::AcqRel) == 0 {
                        #[cfg(not(feature = "report_expensive"))]
                        child.activate(backend, turbo_tasks);
                        #[cfg(feature = "report_expensive")]
                        {
                            let start = Instant::now();
                            let count = child.activate(turbo_tasks);
                            let elapsed = start.elapsed();
                            if elapsed.as_millis() >= 100 {
                                println!(
                                    "activate({}) took {} ms: {:?}",
                                    count,
                                    elapsed.as_millis(),
                                    &**child
                                );
                            } else if elapsed.as_millis() >= 10 || count > 10000 {
                                println!(
                                    "activate({}) took {} µs: {:?}",
                                    count,
                                    elapsed.as_micros(),
                                    &**child
                                );
                            }
                        }
                    }
                });
            }
        }
    }

    pub(crate) fn get_or_wait_output<T, F: FnOnce(&mut Output) -> T>(
        &self,
        func: F,
    ) -> Result<T, EventListener> {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Done => {
                let result = func(&mut state.output);
                drop(state);

                Ok(result)
            }
            Dirty | Scheduled | InProgress | InProgressDirty => {
                let listener = state.event.listen();
                drop(state);
                Err(listener)
            }
        }
    }

    pub(crate) fn get_fresh_slot(&self) -> usize {
        let mut state = self.state.write().unwrap();
        let index = state.created_slots.len();
        state.created_slots.push(Slot::new());
        index
    }
}

impl Display for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let state = self.state.read().unwrap();
        write!(
            f,
            "Task({}, {})",
            match &self.ty {
                TaskType::Root(..) => "root".to_string(),
                TaskType::Once(..) => "once".to_string(),
                TaskType::Native(native_fn, _) => registry::get_function(*native_fn).name.clone(),
                TaskType::ResolveNative(native_fn) =>
                    format!("[resolve] {}", registry::get_function(*native_fn).name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!(
                        "[resolve trait] {} in trait {}",
                        fn_name,
                        registry::get_trait(*trait_type).name
                    )
                }
            },
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

pub enum TaskArgumentOptions {
    Unresolved,
    Resolved,
}
