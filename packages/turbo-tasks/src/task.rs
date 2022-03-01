use crate::{
    slot::{Slot, SlotRef, WeakSlotRef},
    tasks_list::{TasksList, WeakTasksList},
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
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Display, Formatter},
    future::Future,
    hash::Hash,
    mem::swap,
    pin::Pin,
    sync::{Arc, Mutex, RwLock, RwLockWriteGuard, Weak},
    time::Instant,
};
use weak_table::WeakHashSet;

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
            Self::Root(..) => f.debug_tuple("Root").finish(),
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
    /// dependencies are only modified from execution
    ///
    /// dependencies are cleared when entering Dirty state
    ///
    ///  
    dependencies: RwLock<WeakHashSet<WeakSlotRef>>,
    previous_nodes: Mutex<PreviousNodesMap>,
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

#[derive(Default)]
struct TaskState {
    active: bool,
    // TODO using a Atomic might be possible here
    state_type: TaskStateType,
    // TODO use a concurrent set
    parents: WeakTasksList,

    /// outdated_children are set when an execution has started
    outdated_children: Option<TasksList>,

    /// children are only modified from execution
    children: TasksList,
    output_slot: Slot,
    created_slots: Vec<Slot>,
    event: Event,
    executions: u32,
}

#[derive(PartialEq, Eq, Debug)]
enum TaskStateType {
    /// Ready
    ///
    /// on dirty this will move to Dirty or Scheduled depending on active flag
    Done,

    /// Execution is invalid, but not yet scheduled
    ///
    /// on activation this will move to Scheduled
    Dirty,

    /// Execution is invalid and scheduled
    ///
    /// on start this will move to InProgress
    Scheduled,

    /// Execution is happening
    ///
    /// on finish this will move to Done
    ///
    /// on dirty this will move to InProgressDirty
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
            state: RwLock::new(TaskState {
                active: true,
                state_type: Scheduled,
                ..Default::default()
            }),
            dependencies: Default::default(),
            previous_nodes: Default::default(),
        }
    }

    fn remove_children(self: &Arc<Self>, children: TasksList) {
        let start = Instant::now();
        let mut count = 0;
        for child in children.into_iter() {
            let mut state = child.state.write().unwrap();
            state.parents.remove(self.clone());
            if state.parents.is_empty() {
                count += child.deactivate(state);
            } else {
                drop(state);
            }
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 100 {
            println!(
                "remove_children({}) took {} ms: {:?}",
                count,
                elapsed.as_millis(),
                &**self
            );
        } else if elapsed.as_millis() >= 1 {
            println!(
                "remove_children({}) took {} µs: {:?}",
                count,
                elapsed.as_micros(),
                &**self
            );
        }
    }

    fn clear_dependencies(self: &Arc<Self>) {
        let start = Instant::now();
        let mut deps_guard = self.dependencies.write().unwrap();
        let dependencies = deps_guard.iter().map(|d| d.clone()).collect::<Vec<_>>();
        deps_guard.clear();
        drop(deps_guard);

        let count = dependencies.len();

        for dep in dependencies.into_iter() {
            dep.remove_dependent_task(self.clone());
        }
        let elapsed = start.elapsed();
        if elapsed.as_millis() >= 100 {
            println!(
                "clear_dependencies({}) took {} ms: {:?}",
                count,
                elapsed.as_millis(),
                &**self
            );
        } else if elapsed.as_millis() >= 1 {
            println!(
                "clear_dependencies({}) took {} µs: {:?}",
                count,
                elapsed.as_micros(),
                &**self
            );
        }
    }

    fn outdate_children(&self, state: &mut RwLockWriteGuard<TaskState>) {
        let outdated_children = state.outdated_children.take();
        match outdated_children {
            Some(mut children) => {
                for child in state.children.drain() {
                    children.add(child);
                }
                state.outdated_children = Some(children);
            }
            None => {
                let mut new_children = TasksList::default();
                swap(&mut new_children, &mut state.children);
                state.outdated_children = Some(new_children);
            }
        }
    }

    pub(crate) fn execution_started(self: &Arc<Task>) -> bool {
        self.assert_parents_state();
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
                self.outdate_children(&mut state);
                state.executions += 1;
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

    pub(crate) fn execution_result(self: &Arc<Self>, result: SlotRef) {
        self.assert_parents_state();
        let mut state = self.state.write().unwrap();
        match state.state_type {
            InProgress => {
                state.output_slot.link(result);
            }
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

    pub(crate) fn execution_completed(self: Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.assert_parents_state();
        PREVIOUS_NODES.with(|cell| {
            let mut previous_nodes = self.previous_nodes.lock().unwrap();
            Cell::from_mut(&mut *previous_nodes).swap(cell);
        });
        let outdated_children;
        let mut schedule_task = false;
        {
            let mut state = self.state.write().unwrap();
            match state.state_type {
                InProgress => {
                    state.state_type = Done;
                    state.event.notify(usize::MAX);
                    outdated_children = state.outdated_children.take();
                }
                InProgressDirty => {
                    if state.active {
                        state.state_type = Scheduled;
                        schedule_task = true;
                    } else {
                        state.state_type = Dirty;
                    }
                    outdated_children = state.outdated_children.take();
                }
                Dirty | Scheduled | Done => {
                    panic!(
                        "Task execution completed in unexpected state {:?}",
                        state.state_type
                    )
                }
            };
        }
        if let Some(outdated_children) = outdated_children {
            self.remove_children(outdated_children);
        }
        if schedule_task {
            turbo_tasks.schedule(self);
        }
    }

    /// This method should be called after adding the first parent
    fn activate(self: &Arc<Self>, mut state: RwLockWriteGuard<TaskState>) -> usize {
        if state.active {
            return 0;
        }

        state.active = true;

        let mut count = 1;

        // This locks the whole tree, but avoids cloning children

        for child in state.children.iter() {
            let mut state = child.state.write().unwrap();
            if state.parents.is_empty() {
                state.parents.add(self.clone());
                count += child.activate(state);
            } else {
                state.parents.add(self.clone());
            }
        }
        match state.state_type {
            Dirty => {
                state.state_type = Scheduled;
                drop(state);
                TurboTasks::current().unwrap().schedule(self.clone());
            }
            Done | Scheduled | InProgress | InProgressDirty => {
                drop(state);
            }
        }
        count
    }

    /// This method should be called after removing the last parent
    fn deactivate(self: &Arc<Self>, mut state: RwLockWriteGuard<TaskState>) -> usize {
        if !state.active {
            return 0;
        }

        state.active = false;

        let mut count = 1;

        // This locks the whole tree, but avoids cloning children

        for child in state.children.iter() {
            let mut state = child.state.write().unwrap();
            state.parents.remove(self.clone());
            if state.parents.is_empty() {
                count += child.deactivate(state);
            } else {
                drop(state);
            }
        }
        drop(state);
        count
    }

    // #[must_use]
    // pub(crate) fn child_dirty(
    //     self: &Arc<Self>,
    //     turbo_tasks: &'static TurboTasks,
    //     inc_count: bool,
    // ) -> bool {
    //     // println!(
    //     //     "child_dirty {:?} {} {:?} {} from {}",
    //     //     &**self as *const Task, inc_count, cycle, self, from
    //     // );
    //     fn determine_undetermined(
    //         this: &Arc<Task>,
    //         state: RwLockWriteGuard<TaskState>,
    //         turbo_tasks: &'static TurboTasks,
    //         inc_parents_count: bool,
    //     ) -> bool {
    //         let parents: TasksList =
    //             state.parents.iter().filter_map(|p| p.upgrade()).collect();
    //         drop(state);
    //         let mut schedule = false;
    //         // TODO there is a race condition here
    //         // when parents have been changed in the meantime
    //         // we make the parent dirty but it will never receive the
    //         // child_done event again...
    //         // e. g. this can happen when parent was invalidated
    //         // during this comment
    //         for parent in parents.iter() {
    //             if parent.child_dirty(turbo_tasks, inc_parents_count) {
    //                 schedule = true
    //             }
    //         }
    //         if schedule {
    //             // switch to SomeChildrenScheduled as at least one parent asked for scheduling
    //             let mut state = this.state.write().unwrap();
    //             if state.state_type == SomeChildrenDirtyUndetermined {
    //                 state.state_type = SomeChildrenScheduled;
    //             }
    //             drop(state);
    //             this.assert_parents_state();
    //             true
    //         } else {
    //             // revert back to SomeChildrenDirty when no parent asked for scheduling
    //             let mut state = this.state.write().unwrap();
    //             if state.state_type == SomeChildrenDirtyUndetermined {
    //                 state.state_type = SomeChildrenDirty;
    //             }
    //             drop(state);
    //             this.assert_parents_state();
    //             false
    //         }
    //     }
    //     let mut state = self.state.write().unwrap();
    //     match state.state_type {
    //         Dirty | Scheduled => {
    //             // In these states the task shouldn't have children
    //             // but there is a short moment where is might happen
    //             // and we want to ignore events from children there
    //             false
    //         }
    //         InProgressLocallyOutdated => {
    //             // The children are subject of clearing soon
    //             // so we don't have to track the count
    //             false
    //         }
    //         InProgressLocally => {
    //             if inc_count {
    //                 state.dirty_children_count += 1;
    //             }
    //             true
    //         }
    //         SomeChildrenDirty => {
    //             if inc_count {
    //                 state.dirty_children_count += 1;
    //             }
    //             false
    //         }
    //         SomeChildrenScheduled => {
    //             if inc_count {
    //                 state.dirty_children_count += 1;
    //             }
    //             true
    //         }
    //         SomeChildrenDirtyUndetermined => {
    //             if inc_count {
    //                 state.dirty_children_count += 1;
    //             }
    //             determine_undetermined(self, state, turbo_tasks, false)
    //         }
    //         Done => {
    //             debug_assert!(inc_count);
    //             state.dirty_children_count = 1;
    //             if let TaskType::Root(_, event) = &self.ty {
    //                 event.notify(usize::MAX);
    //                 state.state_type = SomeChildrenScheduled;
    //                 debug_assert!(state.parents.len() == 0);
    //                 drop(state);
    //                 true
    //             } else {
    //                 // there is a race condition here
    //                 // during the process of determining the scheduled status
    //                 // we keep the SomeChildrenDirtyUndetermined state

    //                 // Also see the constraint on SomeChildrenScheduled
    //                 // we can't use SomeChildrenDirty since we do not know
    //                 // if there are parents that are in SomeChildrenScheduled state
    //                 state.state_type = SomeChildrenDirtyUndetermined;
    //                 determine_undetermined(self, state, turbo_tasks, true)
    //             }
    //         }
    //     }
    // }

    // pub(crate) fn child_done(&self, turbo_tasks: &'static TurboTasks) {
    //     // println!("child_done {:?} {}", self as *const Task, self);
    //     let mut state = self.state.write().unwrap();
    //     match &state.state_type {
    //         Dirty | Scheduled => {
    //             // In these states the task shouldn't have children
    //             // but there is a short moment where is might happen
    //             // and we want to ignore events from children there
    //             drop(state);
    //         }
    //         InProgressLocallyOutdated => {
    //             // The children are subject of clearing soon
    //             // so we don't have to track the count
    //             drop(state);
    //         }
    //         SomeChildrenDirty | SomeChildrenScheduled | SomeChildrenDirtyUndetermined => {
    //             state.dirty_children_count -= 1;
    //             if state.dirty_children_count == 0 {
    //                 state.state_type = Done;
    //                 state.event.notify(usize::MAX);
    //                 let parents: TasksList =
    //                     state.parents.iter().filter_map(|p| p.upgrade()).collect();
    //                 drop(state);
    //                 for parent in parents.iter() {
    //                     parent.child_done(turbo_tasks);
    //                 }
    //             } else {
    //                 drop(state);
    //             }
    //         }
    //         InProgressLocally => {
    //             // we track the count but don't move to Done when it's 0
    //             // TODO investigate when it can happen that dirty_children_count is already 0
    //             if state.dirty_children_count > 0 {
    //                 state.dirty_children_count -= 1;
    //             }
    //             drop(state);
    //         }
    //         Done => {
    //             // TODO investigate if this is a real problem
    //             // panic!("Task child has become done while parent task was already done")
    //         }
    //     }
    //     self.assert_state();
    // }

    // fn schedule_dirty_children(self: Arc<Self>, turbo_tasks: &'static TurboTasks) {
    //     let mut state = self.state.write().unwrap();
    //     match state.state_type {
    //         Dirty => {
    //             state.state_type = Scheduled;
    //             self.clear_children_and_dependencies(state);
    //             turbo_tasks.schedule(self);
    //         }
    //         Done | InProgressLocally | InProgressLocallyOutdated => {}
    //         Scheduled => {}
    //         SomeChildrenScheduled => {}
    //         SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
    //             state.state_type = SomeChildrenScheduled;
    //             let children: TasksList =
    //                 state.children.iter().map(|arc| arc.clone()).collect();
    //             drop(state);
    //             for child in children.into_iter() {
    //                 child.schedule_dirty_children(turbo_tasks);
    //             }
    //         }
    //     }
    // }

    #[cfg(not(feature = "assert_task_state"))]
    fn assert_parents_state(&self) {}

    #[cfg(feature = "assert_task_state")]
    fn assert_parents_state(&self) {
        self.assert_state();
        let state = self.state.read().unwrap();
        let parents: TasksList = state.parents.iter().filter_map(|p| p.upgrade()).collect();
        drop(state);
        for parent in parents.iter() {
            parent.assert_state();
        }
    }

    #[cfg(not(feature = "assert_task_state"))]
    fn assert_state(&self) {}

    #[cfg(feature = "assert_task_state")]
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
                    if child_state.state_type != Done
                        && child_state.state_type != SomeChildrenDirtyUndetermined
                    {
                        panic!(
                            "Child is in {:?} state while parent is Done",
                            child_state.state_type
                        );
                    }
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
        self.make_dirty(turbo_tasks);
    }

    fn make_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.clear_dependencies();

        let mut state = self.state.write().unwrap();
        match state.state_type {
            Dirty | Scheduled | InProgressDirty => {
                // already dirty
            }
            Done => {
                if state.active {
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.schedule(self.clone());
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

    pub(crate) fn add_dependency(&self, node: SlotRef) {
        // TODO it's possible to schedule that work instead
        // maybe into a task_local dependencies list that
        // is stored that the end of the execution
        // but that won't capute changes during execution
        // which would require extra steps
        let mut deps = self.dependencies.write().unwrap();
        deps.insert(node);
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

    // pub(crate) fn ensure_scheduled(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
    //     let mut state = self.state.write().unwrap();
    //     match state.state_type {
    //         Done
    //         | InProgressLocally
    //         | InProgressLocallyOutdated
    //         | Scheduled
    //         | SomeChildrenScheduled => {
    //             // already scheduled
    //         }
    //         Dirty => {
    //             state.state_type = Scheduled;
    //             drop(state);
    //             turbo_tasks.schedule(self.clone());
    //         }
    //         SomeChildrenDirty | SomeChildrenDirtyUndetermined => {
    //             state.state_type = SomeChildrenScheduled;
    //             let children: TasksList =
    //                 state.children.iter().map(|arc| arc.clone()).collect();
    //             drop(state);
    //             for child in children.into_iter() {
    //                 child.schedule_dirty_children(turbo_tasks);
    //             }
    //         }
    //     }
    // }

    pub fn reset_executions(&self) {
        let mut state = self.state.write().unwrap();
        if state.executions > 1 {
            state.executions = 1;
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
            children: state.children.iter().map(|c| c.clone()).collect(),
            dependencies: self
                .dependencies
                .read()
                .unwrap()
                .iter()
                .map(|d| d.clone())
                .collect(),
            name: match &self.ty {
                TaskType::Root(..) => "root".to_string(),
                TaskType::Native(native_fn, _) => native_fn.name.clone(),
                TaskType::ResolveNative(native_fn) => format!("[resolve] {}", native_fn.name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!("[resolve trait] {} in trait {}", fn_name, trait_type.name)
                }
            },
            state: Task::state_string(&state),
            output_slot: SlotRef::TaskOutput(self.clone()),
            slots,
            executions: state.executions,
        }
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

    pub(crate) fn connect_parent(self: &Arc<Self>, parent: &Arc<Self>) {
        // println!(
        //     "connect_parent child: {:?} {} parent: {:?} {}",
        //     &**self as *const Task, self, &**parent as *const Task, parent,
        // );
        self.assert_state();
        {
            let mut parent_state = parent.state.write().unwrap();
            #[cfg(feature = "assert_task_state")]
            assert!(parent_state.state_type != Dirty && parent_state.state_type != Scheduled);
            parent_state.children.add(self.clone());
            let active = parent_state.active;

            if active {
                let mut state = self.state.write().unwrap();
                if state.parents.is_empty() {
                    state.parents.add(parent.clone());
                    let start = Instant::now();
                    let count = self.activate(state);
                    let elapsed = start.elapsed();
                    if elapsed.as_millis() >= 100 {
                        println!(
                            "activate({}) took {} ms: {:?}",
                            count,
                            elapsed.as_millis(),
                            &**self
                        );
                    } else if elapsed.as_millis() >= 1 {
                        println!(
                            "activate({}) took {} µs: {:?}",
                            count,
                            elapsed.as_micros(),
                            &**self
                        );
                    }
                } else {
                    state.parents.add(parent.clone());
                    drop(state);
                }
            }
        }
        self.assert_state();
        // println!(
        //     "connected_parent child: {:?} {} parent: {:?} {}",
        //     &**self as *const Task, self, &**parent as *const Task, parent,
        // );
    }

    pub(crate) async fn with_done_output_slot<T>(
        self: &Arc<Self>,
        mut func: impl FnOnce(&mut Slot) -> T,
    ) -> T {
        fn get_or_wait<T, F: FnOnce(&mut Slot) -> T>(
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
                    Dirty | Scheduled | InProgress | InProgressDirty => {
                        let listener = state.event.listen();
                        drop(state);
                        Err((func, listener))
                    }
                }
            }
        }
        loop {
            match get_or_wait(&self, func) {
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
                TaskType::Native(native_fn, _) => native_fn.name.clone(),
                TaskType::ResolveNative(native_fn) => format!("[resolve] {}", native_fn.name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!("[resolve trait] {} in trait {}", fn_name, trait_type.name)
                }
            },
            Task::state_string(&state)
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
            let start = Instant::now();
            task.invaldate(self.turbo_tasks);
            let elapsed = start.elapsed();
            if elapsed.as_millis() >= 100 {
                println!("invalidate took {} ms", elapsed.as_millis());
            } else {
                println!("invalidate took {} µs", elapsed.as_micros());
            }
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
