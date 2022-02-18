use crate::{
    slot::{Slot, SlotRef, WeakSlotRef},
    viz::TaskSnapshot,
    NativeFunction, SlotValueType, TraitType, TurboTasks,
};
use any_key::AnyHash;
use anyhow::Result;
use async_std::task_local;
use event_listener::{Event, EventListener};
use std::{
    any::{Any, TypeId},
    cell::Cell,
    collections::HashMap,
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::{Arc, Mutex, RwLock, RwLockWriteGuard, Weak},
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = SlotRef> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

#[derive(Default)]
struct PreviousNodesMap {
    by_key: HashMap<Box<dyn AnyHash + Sync + Send>, usize>,
    by_type: HashMap<TypeId, (usize, Vec<usize>)>,
}

task_local! {
  static CURRENT_TASK: Cell<Option<Arc<Task>>> = Cell::new(None);
  static PREVIOUS_NODES: Cell<PreviousNodesMap> = Cell::new(Default::default());
}

enum TaskType {
    Root(NativeTaskFn),
    Native(&'static NativeFunction, NativeTaskFn),
    ResolveNative(&'static NativeFunction),
    ResolveTrait(&'static TraitType, String),
}

impl Debug for TaskType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(_) => f.debug_tuple("Root").finish(),
            Self::Native(native_fn, _) => f.debug_tuple("Native").field(&native_fn.name).finish(),
            Self::ResolveNative(native_fn) => f
                .debug_tuple("ResolveNative")
                .field(&native_fn.name)
                .finish(),
            Self::ResolveTrait(trait_type, name) => f
                .debug_tuple("ResolveTrait")
                .field(&trait_type.name)
                .field(name)
                .finish(),
        }
    }
}

pub struct Task {
    inputs: Vec<SlotRef>,
    ty: TaskType,
    state: RwLock<TaskState>,
    // TODO use a concurrent set instead
    dependencies: RwLock<Vec<WeakSlotRef>>,
    previous_nodes: Mutex<PreviousNodesMap>,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let state = self.state.read().unwrap();
        let mut result = f.debug_struct("Task");
        result.field("type", &self.ty);
        result.field("state", &state.state_type);
        result.finish()
    }
}

#[derive(Default)]
struct TaskState {
    // TODO using a Atomic might be possible here
    state_type: TaskStateType,
    dirty_children_count: usize,
    // TODO use a concurrent set
    parents: Vec<Weak<Task>>,
    // TODO use a concurrent set
    children: Vec<Arc<Task>>,
    output_slot: Slot,
    created_slots: Vec<Slot>,
    event: Event,
    executions: u32,
}

#[derive(PartialEq, Eq, Debug)]
enum TaskStateType {
    /// task is scheduled for execution
    ///
    /// In this state the task shouldn't have children
    ///
    /// it will soon move to InProgressLocally
    Scheduled,

    /// task started executing
    ///
    /// it will soon move to Done
    ///
    /// but it may move to Dirty when invalidated
    ///
    /// Children must not be Dirty or SomeChildrenDirty.
    /// This node would move to InProgressLocallyOutdated if that would happen
    InProgressLocally,

    /// task started executing
    /// but it was invalidated during that
    ///
    /// it will soon reexecute and move to Scheduled
    InProgressLocallyOutdated,

    /// task has executed and outputs are valid
    ///
    /// it may move to Dirty when invalidated
    ///
    /// it may move to SomeChildrenDirty when a child is invalidated
    ///
    /// Children must be in Done state too.
    /// We want to make sure to
    /// - notify all parents when child move out of Done
    /// - attach only children that are Done
    ///
    /// This is handled by make_dirty and into_output
    Done,

    /// the task has been invalidated for some reason
    ///
    /// the goal is to keep this task dirty until access
    ///
    /// In this state the task shouldn't have children
    ///
    /// on access it will move to Scheduled
    Dirty,

    /// some child tasks has been flagged as not done
    ///
    /// the goal is to keep this task dirty until access
    ///
    /// on access it will move to SomeChildrenScheduled
    /// and schedule these not done children
    SomeChildrenDirty,

    /// some child tasks has been flagged as not done
    ///
    /// but with the goal is to get everything up to date again
    ///
    /// Children must not be in Dirty or SomeChildrenDirty state,
    /// they must make progress. We want to make sure to
    /// - schedule all Dirty children
    /// - switch all SomeChildrenDirty children to SomeChildrenScheduled
    /// - children must not become Dirty or SomeChildrenDirty but Scheduled resp SomeChildrenScheduled instead
    ///
    /// this is handled by schedule_dirty_children
    SomeChildrenScheduled,

    /// some child tasks has been flagged as not done
    ///
    /// and we are currently in the process of determining parent states
    /// this will either change to SomeChildrenDirty or SomeChildrenScheduled after that process
    ///
    /// but when doing any parent change eagerly change this to SomeChildrenScheduled to avoid a race condition
    SomeChildrenDirtyUndetermined,
}

impl Default for TaskStateType {
    fn default() -> Self {
        Scheduled
    }
}

use TaskStateType::*;

impl Task {
    pub(crate) fn new_native(
        inputs: Vec<SlotRef>,
        native_fn: &'static NativeFunction,
    ) -> Result<Self> {
        let bound_fn = native_fn.bind(inputs.clone())?;
        Ok(Self {
            inputs,
            ty: TaskType::Native(native_fn, bound_fn),
            state: Default::default(),
            dependencies: Default::default(),
            previous_nodes: Default::default(),
        })
    }

    pub(crate) fn new_resolve_native(
        inputs: Vec<SlotRef>,
        native_fn: &'static NativeFunction,
    ) -> Self {
        Self {
            inputs,
            ty: TaskType::ResolveNative(native_fn),
            state: Default::default(),
            dependencies: Default::default(),
            previous_nodes: Default::default(),
        }
    }

    pub(crate) fn new_resolve_trait(
        trait_type: &'static TraitType,
        trait_fn_name: String,
        inputs: Vec<SlotRef>,
    ) -> Self {
        Self {
            inputs,
            ty: TaskType::ResolveTrait(trait_type, trait_fn_name),
            state: Default::default(),
            dependencies: Default::default(),
            previous_nodes: Default::default(),
        }
    }

    pub(crate) fn new_root(functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static) -> Self {
        Self {
            inputs: Vec::new(),
            ty: TaskType::Root(Box::new(functor)),
            state: Default::default(),
            dependencies: Default::default(),
            previous_nodes: Default::default(),
        }
    }

    fn clear_children_and_dependencies(self: &Arc<Self>, mut state: RwLockWriteGuard<TaskState>) {
        let children = state.children.clone();
        state.children.clear();
        state.dirty_children_count = 0;
        drop(state);

        let mut deps_guard = self.dependencies.write().unwrap();
        let dependencies = deps_guard.clone();
        deps_guard.clear();
        drop(deps_guard);

        // TODO this is inefficient
        // use HashSet instead
        fn remove_all(vec: &mut Vec<Weak<Task>>, item: &Weak<Task>) {
            for i in 0..vec.len() {
                while i < vec.len() && Weak::ptr_eq(&vec[i], item) {
                    vec.swap_remove(i);
                }
            }
        }
        let weak_self = Arc::downgrade(self);
        for child in children {
            let mut state = child.state.write().unwrap();
            remove_all(&mut state.parents, &weak_self);
        }

        for dep in dependencies {
            dep.remove_dependency(&weak_self);
        }
    }

    pub(crate) fn execution_started(self: &Arc<Task>) {
        self.assert_state();
        {
            let state = self.state.read().unwrap();
            let parents: Vec<Arc<Task>> =
                state.parents.iter().filter_map(|p| p.upgrade()).collect();
            drop(state);
            for parent in parents.iter() {
                parent.assert_state();
            }
        }
        let mut state = self.state.write().unwrap();
        state.executions += 1;
        match state.state_type {
            Scheduled | InProgressLocallyOutdated => {
                state.state_type = InProgressLocally;
                self.clear_children_and_dependencies(state);

                self.assert_state();
                {
                    let state = self.state.read().unwrap();
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        parent.assert_state();
                    }
                }
            }
            _ => {
                panic!(
                    "Task execution started in unexpected state {:?}",
                    state.state_type
                )
            }
        };
    }

    pub(crate) fn execution_completed(
        self: Arc<Self>,
        result: SlotRef,
        turbo_tasks: &'static TurboTasks,
    ) {
        self.assert_state();
        {
            let state = self.state.read().unwrap();
            let parents: Vec<Arc<Task>> =
                state.parents.iter().filter_map(|p| p.upgrade()).collect();
            drop(state);
            for parent in parents.iter() {
                parent.assert_state();
            }
        }
        let mut state = self.state.write().unwrap();
        match state.state_type {
            InProgressLocally => {
                if state.dirty_children_count == 0 {
                    state.state_type = Done;
                    state.event.notify(usize::MAX);
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    state.output_slot.link(result);
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_done(turbo_tasks);
                    }
                } else {
                    state.state_type = SomeChildrenScheduled;
                    state.output_slot.link(result);
                    drop(state);
                }
            }
            InProgressLocallyOutdated => {
                state.state_type = Scheduled;
                // We don't want to assign the output slot here
                // as we want to avoid unnecessary updates
                // TODO maybe this should be controlled by a heuristic
                self.clear_children_and_dependencies(state);

                turbo_tasks.schedule(self);
            }
            _ => {
                panic!(
                    "Task execution completed in unexpected state {:?}",
                    state.state_type
                )
            }
        };
    }

    #[must_use]
    pub(crate) fn child_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) -> bool {
        fn determine_undetermined(
            this: &Arc<Task>,
            state: RwLockWriteGuard<TaskState>,
            turbo_tasks: &'static TurboTasks,
        ) -> bool {
            let parents: Vec<Arc<Task>> =
                state.parents.iter().filter_map(|p| p.upgrade()).collect();
            drop(state);
            let mut schedule = false;
            for parent in parents.iter() {
                if parent.child_dirty(turbo_tasks) {
                    schedule = true
                }
            }
            if schedule {
                // switch to SomeChildrenScheduled as at least one parent asked for scheduling
                let mut state = this.state.write().unwrap();
                if state.state_type == SomeChildrenDirtyUndetermined {
                    state.state_type = SomeChildrenScheduled;
                }
                drop(state);
                this.assert_state();
                {
                    let state = this.state.read().unwrap();
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        parent.assert_state();
                    }
                }
                true
            } else {
                // revert back to SomeChildrenDirty when no parent asked for scheduling
                let mut state = this.state.write().unwrap();
                if state.state_type == SomeChildrenDirtyUndetermined {
                    state.state_type = SomeChildrenDirty;
                }
                drop(state);
                this.assert_state();
                {
                    let state = this.state.read().unwrap();
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        parent.assert_state();
                    }
                }
                false
            }
        }
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty | Scheduled => {
                // In these states the task shouldn't have children
                // but there is a short moment where is might happen
                // and we want to ignore events from children there
                false
            }
            InProgressLocallyOutdated => {
                // The children are subject of clearing soon
                // so we don't have to track the count
                false
            }
            InProgressLocally => {
                state.dirty_children_count += 1;
                false
            }
            SomeChildrenDirty => {
                state.dirty_children_count += 1;
                false
            }
            SomeChildrenScheduled => {
                state.dirty_children_count += 1;
                true
            }
            SomeChildrenDirtyUndetermined => {
                state.dirty_children_count += 1;
                determine_undetermined(self, state, turbo_tasks)
            }
            // for SomeChildrenDirtyUndetermined we would need to propagate to parents again
            Done => {
                if let TaskType::Root(_) = self.ty {
                    state.state_type = SomeChildrenScheduled;
                    state.dirty_children_count = 1;
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        let _ignored = parent.child_dirty(turbo_tasks);
                    }
                    true
                } else {
                    // there is a race condition here
                    // during the process of determining the scheduled status
                    // we keep the SomeChildrenDirtyUndetermined state

                    // Also see the constraint on SomeChildrenScheduled
                    // we can't use SomeChildrenDirty since we do not know
                    // if there are parents that are in SomeChildrenScheduled state
                    state.dirty_children_count = 1;
                    state.state_type = SomeChildrenDirtyUndetermined;
                    determine_undetermined(self, state, turbo_tasks)
                }
            }
        }
    }

    pub(crate) fn child_done(&self, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.write().unwrap();
        match &state.state_type {
            Dirty | Scheduled => {
                // In these states the task shouldn't have children
                // but there is a short moment where is might happen
                // and we want to ignore events from children there
                drop(state);
            }
            InProgressLocallyOutdated => {
                // The children are subject of clearing soon
                // so we don't have to track the count
                drop(state);
            }
            SomeChildrenDirty | SomeChildrenScheduled | SomeChildrenDirtyUndetermined => {
                state.dirty_children_count -= 1;
                if state.dirty_children_count == 0 {
                    state.state_type = Done;
                    state.event.notify(usize::MAX);
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_done(turbo_tasks);
                    }
                } else {
                    drop(state);
                }
            }
            InProgressLocally => {
                // we track the count but don't move to Done when it's 0
                state.dirty_children_count -= 1;
                drop(state);
            }
            Done => {
                panic!("Task child has become done while parent task was already done")
            }
        }
        self.assert_state();
    }

    fn schedule_dirty_children(self: Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty => {
                state.state_type = Scheduled;
                self.clear_children_and_dependencies(state);
                turbo_tasks.schedule(self);
            }
            Done | InProgressLocally | InProgressLocallyOutdated => {}
            Scheduled => {}
            SomeChildrenScheduled => {}
            SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
                state.state_type = SomeChildrenScheduled;
                let children: Vec<Arc<Task>> =
                    state.children.iter().map(|arc| arc.clone()).collect();
                drop(state);
                for child in children.into_iter() {
                    child.schedule_dirty_children(turbo_tasks);
                }
            }
        }
    }

    fn assert_state(&self) {
        let state = self.state.read().unwrap();
        match state.state_type {
            Scheduled => {
                assert!(state.children.is_empty());
            }
            InProgressLocally => {}
            InProgressLocallyOutdated => {}
            Done => {
                for child in state.children.iter() {
                    let child_state = child.state.read().unwrap();
                    assert_eq!(child_state.state_type, Done);
                }
            }
            Dirty => {
                assert!(state.children.is_empty());
            }
            SomeChildrenDirty => {
                let mut count = 0;
                for child in state.children.iter() {
                    let child_state = child.state.read().unwrap();
                    match child_state.state_type {
                        Scheduled
                        | InProgressLocally
                        | InProgressLocallyOutdated
                        | Dirty
                        | SomeChildrenDirty
                        | SomeChildrenScheduled
                        | SomeChildrenDirtyUndetermined => count += 1,
                        Done => {}
                    }
                }
                assert_eq!(count, state.dirty_children_count);
            }
            SomeChildrenScheduled | SomeChildrenDirtyUndetermined => {}
        }
    }

    pub(crate) fn dependent_slot_updated(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.make_dirty(turbo_tasks)
    }

    fn make_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty | Scheduled => {}
            SomeChildrenDirty => {
                if let TaskType::Root(_) = self.ty {
                    state.state_type = Scheduled;

                    self.clear_children_and_dependencies(state);

                    turbo_tasks.schedule(self.clone());
                } else {
                    state.state_type = Dirty;

                    self.clear_children_and_dependencies(state);
                }
            }
            InProgressLocallyOutdated => {}
            InProgressLocally => {
                state.state_type = InProgressLocallyOutdated;
            }
            Done | SomeChildrenDirtyUndetermined => {
                let is_root = if let TaskType::Root(_) = self.ty {
                    true
                } else {
                    false
                };
                if is_root {
                    state.state_type = Scheduled;
                } else {
                    // This might change to Scheduled later
                    // but as the task has no children (they are remove below)
                    // it's not relavant that it's Dirty for a short while
                    state.state_type = Dirty;
                }
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();

                self.clear_children_and_dependencies(state);

                let mut schedule = false;
                for parent in parents.iter() {
                    if parent.child_dirty(turbo_tasks) {
                        schedule = true
                    }
                }
                if is_root {
                    turbo_tasks.schedule(self.clone());
                } else if schedule {
                    let mut state = self.state.write().unwrap();
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.schedule(self.clone());
                }
                self.assert_state();
                {
                    let state = self.state.read().unwrap();
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        parent.assert_state();
                    }
                }
            }
            SomeChildrenScheduled => {
                state.state_type = Scheduled;
                self.clear_children_and_dependencies(state);
                turbo_tasks.schedule(self.clone());
            }
        }
    }

    pub(crate) fn set_current(task: Arc<Task>) {
        PREVIOUS_NODES.with(|cell| {
            let mut previous_nodes_guard = task.previous_nodes.lock().unwrap();
            let previous_nodes = &mut *previous_nodes_guard;
            for list in previous_nodes.by_type.values_mut() {
                list.0 = 0;
            }
            Cell::from_mut(previous_nodes).swap(cell);
        });
        CURRENT_TASK.with(|c| c.set(Some(task)));
    }

    pub(crate) fn current() -> Option<Arc<Task>> {
        CURRENT_TASK.with(|c| {
            if let Some(arc) = c.take() {
                let clone = arc.clone();
                c.set(Some(arc));
                return Some(clone);
            }
            None
        })
    }

    pub(crate) fn with_current<T>(func: impl FnOnce(&Arc<Task>) -> T) -> T {
        CURRENT_TASK.with(|c| {
            if let Some(arc) = c.take() {
                let result = func(&arc);
                c.set(Some(arc));
                result
            } else {
                panic!("Outside of a Task");
            }
        })
    }

    pub(crate) fn finalize_execution(&self) {
        PREVIOUS_NODES.with(|cell| {
            let mut previous_nodes = self.previous_nodes.lock().unwrap();
            Cell::from_mut(&mut *previous_nodes).swap(cell);
        });
    }

    pub(crate) fn add_dependency(&self, node: WeakSlotRef) {
        // TODO it's possible to schedule that work instead
        // maybe into a task_local dependencies list that
        // is stored that the end of the execution
        // but that won't capute changes during execution
        // which would require extra steps
        let mut deps = self.dependencies.write().unwrap();
        deps.push(node);
    }

    pub(crate) fn execute(self: &Arc<Self>, tt: &'static TurboTasks) -> NativeTaskFuture {
        match &self.ty {
            TaskType::Root(bound_fn) => bound_fn(),
            TaskType::Native(_, bound_fn) => bound_fn(),
            TaskType::ResolveNative(ref native_fn) => {
                let native_fn = *native_fn;
                let inputs = self.inputs.clone();
                Box::pin(async move {
                    let mut resolved_inputs = Vec::new();
                    for input in inputs.into_iter() {
                        resolved_inputs.push(input.resolve_to_slot().await)
                    }
                    tt.native_call(native_fn, resolved_inputs).unwrap()
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
                        let this = this.resolve_to_value().await;
                        match this.get_trait_method(trait_type, name.clone()) {
                            Some(native_fn) => {
                                resolved_inputs.push(this);
                                for input in iter {
                                    resolved_inputs.push(input)
                                }
                                tt.dynamic_call(native_fn, resolved_inputs).unwrap()
                            }
                            None => {
                                if !this.has_trait(trait_type) {
                                    // TODO avoid panic
                                    let traits = this
                                        .traits()
                                        .iter()
                                        .map(|t| format!(" {}", t))
                                        .collect::<String>();
                                    panic!(
                                        "{} doesn't implement trait {} (only{})",
                                        this, trait_type, traits
                                    );
                                } else {
                                    // TODO avoid panic
                                    panic!(
                                        "{} implements trait {}, but method {} is missing",
                                        this, trait_type, name
                                    );
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

    pub fn get_invalidator() -> Invalidator {
        Invalidator {
            task: Task::current().map_or_else(|| Weak::new(), |task| Arc::downgrade(&task)),
            turbo_tasks: TurboTasks::current().unwrap(),
        }
    }

    fn invaldate(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.make_dirty(turbo_tasks)
    }

    pub(crate) fn with_output_slot<T>(&self, func: impl FnOnce(&Slot) -> T) -> T {
        let state = self.state.read().unwrap();
        func(&state.output_slot)
    }

    pub(crate) fn with_output_slot_mut<T>(&self, func: impl FnOnce(&mut Slot) -> T) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.output_slot)
    }

    pub(crate) fn with_created_slot<T>(
        &self,
        index: usize,
        func: impl FnOnce(&mut Slot) -> T,
    ) -> T {
        let mut state = self.state.write().unwrap();
        func(&mut state.created_slots[index])
    }

    pub async fn wait_done(self: &Arc<Self>) {
        loop {
            match {
                let state = self.state.read().unwrap();
                if state.state_type == TaskStateType::Done {
                    None
                } else {
                    Some(state.event.listen())
                }
            } {
                Some(listener) => listener.await,
                None => {
                    return;
                }
            }
        }
    }

    pub(crate) fn ensure_scheduled(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.write().unwrap();
        match state.state_type {
            Done
            | InProgressLocally
            | InProgressLocallyOutdated
            | Scheduled
            | SomeChildrenScheduled => {
                // already scheduled
            }
            Dirty => {
                state.state_type = Scheduled;
                drop(state);
                turbo_tasks.schedule(self.clone());
            }
            SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
                state.state_type = SomeChildrenScheduled;
                let children: Vec<Arc<Task>> =
                    state.children.iter().map(|arc| arc.clone()).collect();
                drop(state);
                for child in children.into_iter() {
                    child.schedule_dirty_children(turbo_tasks);
                }
            }
        }
    }

    pub fn get_snapshot_for_visualization(self: &Arc<Self>) -> TaskSnapshot {
        let state = self.state.read().unwrap();
        let mut slots: Vec<_> = state
            .created_slots
            .iter()
            .enumerate()
            .map(|(i, _)| SlotRef::TaskCreated(self.clone(), i))
            .collect();
        slots.push(SlotRef::TaskOutput(self.clone()));
        TaskSnapshot {
            inputs: self
                .inputs
                .iter()
                .filter(|slot_ref| slot_ref.is_task_ref())
                .map(|slot_ref| slot_ref.clone())
                .collect(),
            children: state.children.clone(),
            dependencies: self.dependencies.read().unwrap().clone(),
            name: match &self.ty {
                TaskType::Root(_) => "root".to_string(),
                TaskType::Native(native_fn, _) => native_fn.name.clone(),
                TaskType::ResolveNative(native_fn) => format!("[resolve] {}", native_fn.name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!("[resolve trait] {} in trait {}", fn_name, trait_type.name)
                }
            },
            state: match state.state_type {
                Scheduled => "scheduled".to_string(),
                InProgressLocally => "in progress (locally)".to_string(),
                InProgressLocallyOutdated => "in progress (locally, outdated)".to_string(),
                Done => "done".to_string(),
                Dirty => "dirty".to_string(),
                SomeChildrenDirty => format!("{} children dirty", state.dirty_children_count),
                SomeChildrenDirtyUndetermined => format!(
                    "{} children dirty (undetermined)",
                    state.dirty_children_count
                ),
                SomeChildrenScheduled => {
                    format!("{} children dirty (scheduled)", state.dirty_children_count)
                }
            },
            output_slot: SlotRef::TaskOutput(self.clone()),
            slots,
            executions: state.executions,
        }
    }

    pub(crate) fn connect_parent(self: &Arc<Self>, parent: &Arc<Self>) {
        self.assert_state();
        {
            let mut parent_state = parent.state.write().unwrap();
            assert!(parent_state.state_type != Dirty && parent_state.state_type != Scheduled);
            let mut state = self.state.write().unwrap();
            parent_state.children.push(self.clone());
            state.parents.push(Arc::downgrade(&parent));
            match state.state_type {
                Scheduled
                | InProgressLocally
                | InProgressLocallyOutdated
                | SomeChildrenScheduled => {
                    parent_state.dirty_children_count += 1;
                }
                Dirty => {
                    state.state_type = Scheduled;
                    self.clear_children_and_dependencies(state);
                    TurboTasks::current().unwrap().schedule(self.clone());
                }
                SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
                    parent_state.dirty_children_count += 1;
                    state.state_type = SomeChildrenScheduled;
                    let children: Vec<Arc<Task>> =
                        state.children.iter().map(|arc| arc.clone()).collect();
                    drop(state);
                    let turbo_tasks = TurboTasks::current().unwrap();
                    for child in children.into_iter() {
                        child.schedule_dirty_children(turbo_tasks);
                    }
                }
                Done => {}
            }
        }
        self.assert_state();
    }

    pub(crate) async fn with_done_output_slot<T>(
        self: &Arc<Self>,
        mut func: impl FnOnce(&mut Slot) -> T,
    ) -> T {
        fn get_or_schedule<T, F: FnOnce(&mut Slot) -> T>(
            this: &Arc<Task>,
            func: F,
        ) -> Result<T, (F, EventListener)> {
            {
                let mut state = this.state.write().unwrap();
                match state.state_type {
                    Done => {
                        let result = func(&mut state.output_slot);
                        drop(state);

                        Ok(result)
                    }
                    InProgressLocally
                    | InProgressLocallyOutdated
                    | Scheduled
                    | SomeChildrenScheduled => {
                        let listener = state.event.listen();
                        drop(state);
                        Err((func, listener))
                    }
                    Dirty => {
                        state.state_type = Scheduled;
                        let listener = state.event.listen();
                        this.clear_children_and_dependencies(state);
                        TurboTasks::current().unwrap().schedule(this.clone());
                        Err((func, listener))
                    }
                    SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
                        state.state_type = SomeChildrenScheduled;
                        let listener = state.event.listen();
                        let children: Vec<Arc<Task>> =
                            state.children.iter().map(|arc| arc.clone()).collect();
                        drop(state);
                        let turbo_tasks = TurboTasks::current().unwrap();
                        for child in children.into_iter() {
                            child.schedule_dirty_children(turbo_tasks);
                        }
                        Err((func, listener))
                    }
                }
            }
        }
        loop {
            match get_or_schedule(&self, func) {
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
                TaskType::Root(_) => "root".to_string(),
                TaskType::Native(native_fn, _) => native_fn.name.clone(),
                TaskType::ResolveNative(native_fn) => format!("[resolve] {}", native_fn.name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!("[resolve trait] {} in trait {}", fn_name, trait_type.name)
                }
            },
            match state.state_type {
                Scheduled => "scheduled".to_string(),
                InProgressLocally => "in progress (locally)".to_string(),
                InProgressLocallyOutdated => "in progress (locally, outdated)".to_string(),
                Done => "done".to_string(),
                Dirty => "dirty".to_string(),
                SomeChildrenDirty => format!("{} children dirty", state.dirty_children_count),
                SomeChildrenDirtyUndetermined => format!(
                    "{} children dirty (undetermined)",
                    state.dirty_children_count
                ),
                SomeChildrenScheduled =>
                    format!("{} children dirty (scheduled)", state.dirty_children_count),
            }
        )
    }
}

pub struct Invalidator {
    task: Weak<Task>,
    turbo_tasks: &'static TurboTasks,
}

impl Invalidator {
    pub fn invalidate(self) {
        if let Some(task) = self.task.upgrade() {
            task.invaldate(self.turbo_tasks);
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
) -> SlotRef {
    Task::with_current(|task| {
        PREVIOUS_NODES.with(|cell| {
            let mut map = PreviousNodesMap::default();
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
            let result = SlotRef::TaskCreated(task.clone(), *index);
            cell.swap(Cell::from_mut(&mut map));
            result
        })
    })
}

pub(crate) fn match_previous_node_by_type<T: Any + ?Sized, F: FnOnce(&mut Slot)>(
    functor: F,
) -> SlotRef {
    Task::with_current(|task| {
        PREVIOUS_NODES.with(|cell| {
            let mut map = PreviousNodesMap::default();
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
            let result = SlotRef::TaskCreated(task.clone(), slot_index);
            cell.swap(Cell::from_mut(&mut map));
            result
        })
    })
}

pub enum TaskArgumentOptions {
    Unresolved,
    Slot,
    Resolved(&'static SlotValueType),
    Trait(&'static TraitType),
}
