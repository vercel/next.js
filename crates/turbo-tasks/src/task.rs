use crate::{
    id::{FunctionId, TraitTypeId},
    output::Output,
    raw_vc::RawVc,
    registry,
    slot::Slot,
    stats,
    task_input::TaskInput,
    TaskId, TurboTasks,
};
use any_key::AnyHash;
use anyhow::{anyhow, Result};
use async_std::task_local;
use event_listener::{Event, EventListener};
#[cfg(feature = "report_expensive")]
use std::time::Instant;
use std::{
    any::{Any, TypeId},
    cell::{Cell, RefCell},
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::Hash,
    mem::{swap, take},
    pin::Pin,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex, RwLock, Weak,
    },
};
pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Result<RawVc>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

/// Stores previous slot locations for keys or types.
#[derive(Default)]
struct PreviousSlotsMap {
    by_key: HashMap<Box<dyn AnyHash + Sync + Send>, usize>,
    by_type: HashMap<TypeId, (usize, Vec<usize>)>,
}

task_local! {
    static CURRENT_TASK_ID: Cell<Option<TaskId>> = Cell::new(None);
    static PREVIOUS_SLOTS: Cell<PreviousSlotsMap> = Cell::new(Default::default());

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
    previous_nodes: PreviousSlotsMap,
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

    pub(crate) fn remove(&self, turbo_tasks: &Arc<TurboTasks>) {
        if self.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.deactivate(1, &turbo_tasks);
        }
    }

    #[cfg(not(feature = "report_expensive"))]
    pub(crate) fn deactivate_tasks(tasks: Vec<TaskId>, turbo_tasks: &Arc<TurboTasks>) {
        for child in tasks.into_iter() {
            turbo_tasks.with_task_and_tt(child, |child| child.deactivate(1, &turbo_tasks));
        }
    }

    #[cfg(feature = "report_expensive")]
    pub(crate) fn deactivate_tasks(tasks: Vec<TaskId>, turbo_tasks: &Arc<TurboTasks>) {
        let start = Instant::now();
        let mut count = 0;
        let mut len = 0;
        for child in tasks.into_iter() {
            count += turbo_tasks.with_task_and_tt(child, |child| child.deactivate(1, &turbo_tasks));
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

    #[cfg(not(feature = "report_expensive"))]
    fn clear_dependencies(&self, turbo_tasks: &TurboTasks) {
        let mut execution_data = self.execution_data.lock().unwrap();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

        for dep in dependencies.into_iter() {
            dep.remove_dependent_task(self.id, turbo_tasks);
        }
    }

    #[cfg(feature = "report_expensive")]
    fn clear_dependencies(&self) {
        let start = Instant::now();
        let mut execution_data = self.execution_data.lock().unwrap();
        let dependencies = take(&mut execution_data.dependencies);
        drop(execution_data);

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            dep.remove_dependent_task(self);
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

    pub(crate) fn execution_started(self: &Task, turbo_tasks: &Arc<TurboTasks>) -> bool {
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
                    turbo_tasks.schedule_remove_tasks(set);
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

    pub(crate) fn execution_completed(&self, turbo_tasks: Arc<TurboTasks>) {
        DEPENDENCIES_TO_TRACK.with(|deps| {
            PREVIOUS_SLOTS.with(|cell| {
                let mut execution_data = self.execution_data.lock().unwrap();
                execution_data.previous_nodes = cell.take();
                execution_data.dependencies = deps.take();
            });
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
            self.clear_dependencies(&turbo_tasks)
        }
        if schedule_task {
            turbo_tasks.schedule(self.id);
        }
    }

    /// This method should be called after adding the first parent
    fn activate(&self, turbo_tasks: &TurboTasks) -> usize {
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
            turbo_tasks.with_task_and_tt(*child, |child| {
                if child.active_parents.fetch_add(1, Ordering::AcqRel) == 0 {
                    count += child.activate(turbo_tasks);
                }
            })
        }
        match state.state_type {
            Dirty => {
                state.state_type = Scheduled;
                drop(state);
                TurboTasks::current().unwrap().schedule(self.id);
            }
            Done | Scheduled | InProgress | InProgressDirty => {
                drop(state);
            }
        }
        count
    }

    /// This method should be called after removing the last parent
    fn deactivate(&self, depth: u8, turbo_tasks: &Arc<TurboTasks>) -> usize {
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
                turbo_tasks.with_task_and_tt(*child, |child| {
                    if child.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
                        count += child.deactivate(depth + 1, turbo_tasks);
                    }
                })
            }
            drop(state);
            count
        } else {
            let mut scheduled = Vec::new();
            for child_id in state.children.iter() {
                turbo_tasks.with_task_and_tt(*child_id, |child| {
                    if child.active_parents.fetch_sub(1, Ordering::AcqRel) == 1 {
                        scheduled.push(*child_id);
                    }
                })
            }
            drop(state);
            turbo_tasks.schedule_deactivate_tasks(scheduled);
            count
        }
    }

    pub(crate) fn dependent_slot_updated(&self, turbo_tasks: &Arc<TurboTasks>) {
        self.make_dirty(turbo_tasks);
    }

    fn make_dirty(&self, turbo_tasks: &Arc<TurboTasks>) {
        if let TaskType::Once(_) = self.ty {
            // once task won't become dirty
            return;
        }
        self.clear_dependencies(turbo_tasks);

        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty | Scheduled | InProgressDirty => {
                // already dirty
            }
            Done => {
                if state.active {
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.clone().schedule(self.id);
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

    pub(crate) fn set_current(task: &Task, id: TaskId) {
        PREVIOUS_SLOTS.with(|cell| {
            let mut execution_data = task.execution_data.lock().unwrap();
            let previous_nodes = &mut execution_data.previous_nodes;
            for list in previous_nodes.by_type.values_mut() {
                list.0 = 0;
            }
            Cell::from_mut(previous_nodes).swap(cell);
        });
        CURRENT_TASK_ID.with(|c| c.set(Some(id)));
    }

    pub(crate) fn current() -> Option<TaskId> {
        CURRENT_TASK_ID.with(|c| c.get())
    }

    pub(crate) fn with_current<T>(func: impl FnOnce(&Task, TaskId) -> T) -> T {
        CURRENT_TASK_ID.with(|c| {
            if let Some(id) = c.get() {
                TurboTasks::with_task(id, |task| func(task, id))
            } else {
                panic!("Outside of a Task");
            }
        })
    }

    pub(crate) fn add_dependency_to_current(dep: RawVc) {
        DEPENDENCIES_TO_TRACK.with(|list| {
            let mut list = list.borrow_mut();
            list.insert(dep);
        })
    }

    pub(crate) fn execute(&self, tt: Arc<TurboTasks>) -> NativeTaskFuture {
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
        Invalidator {
            task: Task::current()
                .ok_or_else(|| {
                    anyhow!("Task::get_invalidator() can only be used in the context of a Task")
                })
                .unwrap(),
            turbo_tasks: TurboTasks::with_current(|tt| Arc::downgrade(tt)),
        }
    }

    /// Called by the [Invalidator]. Invalidate the [Task]. When the task is
    /// active it will be scheduled for execution.
    fn invaldate(&self, turbo_tasks: &Arc<TurboTasks>) {
        self.make_dirty(turbo_tasks)
    }

    /// Access to the output slot.
    pub(crate) fn with_output_mut<T>(&self, func: impl FnOnce(&mut Output) -> T) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.output)
    }

    /// Access to a slot.
    pub(crate) fn with_created_slot_mut<T>(
        &self,
        index: usize,
        func: impl FnOnce(&mut Slot) -> T,
    ) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.created_slots[index])
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

    pub(crate) fn connect_child(&self, child_id: TaskId, turbo_tasks: &TurboTasks) {
        let mut state = self.state.write().unwrap();
        if state.children.insert(child_id) {
            let active = state.active;
            drop(state);

            if active {
                turbo_tasks.with_task_and_tt(child_id, |child| {
                    if child.active_parents.fetch_add(1, Ordering::AcqRel) == 0 {
                        #[cfg(not(feature = "report_expensive"))]
                        child.activate(turbo_tasks);
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

    pub(crate) async fn with_done_output<T>(
        id: TaskId,
        turbo_tasks: &TurboTasks,
        mut func: impl FnOnce(&Task, &mut Output) -> T,
    ) -> T {
        fn get_or_wait<T, F: FnOnce(&Task, &mut Output) -> T>(
            id: TaskId,
            turbo_tasks: &TurboTasks,
            func: F,
        ) -> Result<T, (F, EventListener)> {
            {
                turbo_tasks.with_task_and_tt(id, |task| {
                    let mut state = task.state.write().unwrap();
                    match state.state_type {
                        Done => {
                            let result = func(task, &mut state.output);
                            drop(state);

                            Ok(result)
                        }
                        Dirty | Scheduled | InProgress | InProgressDirty => {
                            let listener = state.event.listen();
                            drop(state);
                            Err((func, listener))
                        }
                    }
                })
            }
        }
        loop {
            match get_or_wait(id, turbo_tasks, func) {
                Ok(result) => return result,
                Err((func_back, listener)) => {
                    func = func_back;
                    listener.await;
                }
            }
        }
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

pub struct Invalidator {
    task: TaskId,
    turbo_tasks: Weak<TurboTasks>,
}

impl Invalidator {
    pub fn invalidate(self) {
        let Invalidator { task, turbo_tasks } = self;
        if let Some(turbo_tasks) = turbo_tasks.upgrade() {
            turbo_tasks.with_task_and_tt(task, |task| task.invaldate(&turbo_tasks));
        }
    }
}

pub(crate) fn match_previous_node_by_key<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce(&mut Slot),
>(
    key: K,
    functor: F,
) -> RawVc {
    Task::with_current(|task, id| {
        PREVIOUS_SLOTS.with(|cell| {
            let mut map = PreviousSlotsMap::default();
            cell.swap(Cell::from_mut(&mut map));
            let entry =
                map.by_key
                    .entry(Box::new((TypeId::of::<T>(), key))
                        as Box<dyn AnyHash + Sync + Send + 'static>);
            let mut state = task.state.write().unwrap();
            let index = entry.or_insert_with(|| {
                let index = state.created_slots.len();
                state.created_slots.push(Slot::new());
                index
            });
            functor(&mut state.created_slots[*index]);
            drop(state);
            let result = RawVc::TaskCreated(id, *index);
            cell.swap(Cell::from_mut(&mut map));
            result
        })
    })
}

pub(crate) fn match_previous_node_by_type<T: Any + ?Sized, F: FnOnce(&mut Slot)>(
    functor: F,
) -> RawVc {
    Task::with_current(|task, id| {
        PREVIOUS_SLOTS.with(|cell| {
            let mut map = PreviousSlotsMap::default();
            cell.swap(Cell::from_mut(&mut map));
            let list = map
                .by_type
                .entry(TypeId::of::<T>())
                .or_insert_with(Default::default);
            let (ref mut index, ref mut list) = list;
            let mut state = task.state.write().unwrap();
            let slot_index = match list.get_mut(*index) {
                Some(slot_index) => *slot_index,
                None => {
                    let index = state.created_slots.len();
                    state.created_slots.push(Slot::new());
                    list.push(index);
                    index
                }
            };
            functor(&mut state.created_slots[slot_index]);
            drop(state);
            *index += 1;
            let result = RawVc::TaskCreated(id, slot_index);
            cell.swap(Cell::from_mut(&mut map));
            result
        })
    })
}

pub enum TaskArgumentOptions {
    Unresolved,
    Resolved,
}
