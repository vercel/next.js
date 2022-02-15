use crate::{
    slot::{Slot, SlotRef, WeakSlotRef},
    viz::TaskSnapshot,
    NativeFunction, SlotValueType, TraitType, TurboTasks,
};
use any_key::AnyHash;
use anyhow::{anyhow, Result};
use async_std::task_local;
use event_listener::Event;
use std::{
    any::{Any, TypeId},
    cell::Cell,
    collections::HashMap,
    fmt::{self, Debug, Formatter},
    future::Future,
    hash::Hash,
    pin::Pin,
    sync::{Arc, Mutex, RwLock, Weak},
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

pub struct Task {
    inputs: Vec<SlotRef>,
    ty: TaskType,
    state: Mutex<TaskState>,
    // TODO use a concurrent set instead
    dependencies: RwLock<Vec<WeakSlotRef>>,
    previous_nodes: Mutex<PreviousNodesMap>,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let deps: Vec<_> = self
            .dependencies
            .read()
            .unwrap()
            .iter()
            .filter_map(|i| i.upgrade())
            .collect();
        let state = self.state.lock().unwrap();
        let mut result = f.debug_struct("Task");
        result.field("state", &state.state_type);
        result.field("output", &state.output_slot);
        if state.children.len() > 0 {
            result.field("children", &state.children);
        }
        if deps.len() > 0 {
            result.field("dependencies", &deps);
        }
        result.finish()
    }
}

#[derive(Default)]
struct TaskState {
    // TODO using a Atomic might be possible here
    state_type: TaskStateType,
    dirty_children_count: usize,
    // TODO do we want to keep that or solve it in a different way?
    has_side_effect: bool,
    child_has_side_effect: bool,
    // TODO use a concurrent set
    parents: Vec<Weak<Task>>,
    // TODO use a concurrent set
    children: Vec<Arc<Task>>,
    output_slot: Slot,
    created_slots: Vec<Slot>,
    event: Event,
    executions: i32,
}

#[derive(PartialEq, Eq, Debug)]
enum TaskStateType {
    /// task is scheduled for execution
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
    /// on access it will move to Scheduled
    Dirty,

    /// some child tasks has been flagged as dirty
    ///
    /// the goal is to keep this task dirty until access
    ///
    /// on access it will move to SomeChildrenScheduled
    /// and schedule these dirty children
    SomeChildrenDirty,

    /// some child tasks has been flagged as dirty
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

    pub(crate) fn execution_started(self: &Arc<Task>) {
        let mut state = self.state.lock().unwrap();
        state.executions += 1;
        match state.state_type {
            Scheduled | InProgressLocallyOutdated => {
                state.state_type = InProgressLocally;
                state.has_side_effect = false;
                state.child_has_side_effect = false;
                // TODO disconnect other sides too
                let children = state.children.clone();
                state.children.clear();
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
                    let mut state = child.state.lock().unwrap();
                    remove_all(&mut state.parents, &weak_self);
                }

                for dep in dependencies {
                    dep.remove_dependency(&weak_self);
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
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            InProgressLocally => {
                state.state_type = Done;
                state.event.notify(usize::MAX);
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                state
                    .output_slot
                    .assign_link(SlotRef::TaskOutput(self.clone()), result);
                drop(state);
                for parent in parents.iter() {
                    parent.child_done(turbo_tasks);
                }
            }
            InProgressLocallyOutdated => {
                state.state_type = Scheduled;
                state
                    .output_slot
                    .assign_link(SlotRef::TaskOutput(self.clone()), result);
                drop(state);
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
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Dirty | Scheduled | InProgressLocallyOutdated => false,
            InProgressLocally => {
                state.state_type = InProgressLocallyOutdated;
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
            // for SomeChildrenDirtyUndetermined we would need to propagate to parents again
            Done => {
                if state.has_side_effect {
                    state.state_type = Scheduled;
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    for parent in parents.iter() {
                        let _ignored = parent.child_dirty(turbo_tasks);
                    }
                    turbo_tasks.schedule(self.clone());
                    false
                } else if state.child_has_side_effect {
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
                    // TODO there is a race condition here
                    // we better should introduce an additional state
                    // SomeChildrenDirtyUndetermined to cover that
                    // for now we use SomeChildrenScheduled
                    // that might causes a few unneeded scheduled tasks
                    // but that's better than missing to schedule some

                    // Also see the constraint on SomeChildrenScheduled
                    // we can't use SomeChildrenDirty since we do not know
                    // if there are parents that are in SomeChildrenScheduled state
                    state.state_type = SomeChildrenScheduled;
                    state.dirty_children_count = 1;
                    let parents: Vec<Arc<Task>> =
                        state.parents.iter().filter_map(|p| p.upgrade()).collect();
                    drop(state);
                    let mut schedule = false;
                    for parent in parents.iter() {
                        if parent.child_dirty(turbo_tasks) {
                            schedule = true
                        }
                    }
                    if !schedule {
                        // revert back to SomeChildrenDirty when no parent asked for scheduling
                        let mut state = self.state.lock().unwrap();
                        state.state_type = SomeChildrenDirty;
                        drop(state);
                        false
                    } else {
                        true
                    }
                }
            }
        }
    }

    pub(crate) fn child_done(&self, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            SomeChildrenDirty | SomeChildrenScheduled => {
                state.dirty_children_count -= 1;
                if state.dirty_children_count == 0 {
                    state.state_type = Done;
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
            Dirty | InProgressLocally | InProgressLocallyOutdated | Scheduled => {}
            Done => {
                panic!("Task child has become done while parent task was already done")
            }
        }
    }

    fn schedule_dirty_children(self: Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Dirty => {
                state.state_type = Scheduled;
                drop(state);
                turbo_tasks.schedule(self);
            }
            Done | InProgressLocally | InProgressLocallyOutdated => {}
            Scheduled => {}
            SomeChildrenDirty => {
                let children: Vec<Arc<Task>> =
                    state.children.iter().map(|arc| arc.clone()).collect();
                drop(state);
                for child in children.into_iter() {
                    child.schedule_dirty_children(turbo_tasks);
                }
            }
            SomeChildrenScheduled => {}
        }
    }

    pub(crate) fn dependent_slot_updated(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.make_dirty(turbo_tasks)
    }

    fn make_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Dirty | Scheduled => {}
            SomeChildrenDirty => {
                if state.has_side_effect || state.child_has_side_effect {
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.schedule(self.clone());
                } else {
                    state.state_type = Dirty;
                }
            }
            InProgressLocallyOutdated => {}
            InProgressLocally => {
                state.state_type = InProgressLocallyOutdated;
            }
            Done => {
                let has_side_effect = state.has_side_effect || state.child_has_side_effect;
                if has_side_effect {
                    state.state_type = Scheduled;
                } else {
                    state.state_type = Dirty;
                }
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                drop(state);
                let mut schedule = false;
                for parent in parents.iter() {
                    if parent.child_dirty(turbo_tasks) {
                        schedule = true
                    }
                }
                if has_side_effect {
                    turbo_tasks.schedule(self.clone());
                } else if schedule {
                    let mut state = self.state.lock().unwrap();
                    state.state_type = Scheduled;
                    drop(state);
                    turbo_tasks.schedule(self.clone());
                }
            }
            SomeChildrenScheduled => {
                state.state_type = Scheduled;
                drop(state);
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
                let task = self.clone();
                Box::pin(async move {
                    let mut resolved_inputs = Vec::new();
                    // TODO into_iter
                    for input in inputs.iter() {
                        resolved_inputs.push(input.resolve_with_reader(&task))
                    }
                    tt.native_call(native_fn, resolved_inputs).unwrap()
                })
            }
            TaskType::ResolveTrait(trait_type, name) => {
                let trait_type = *trait_type;
                let name = name.clone();
                let inputs = self.inputs.clone();
                let task = self.clone();
                Box::pin(async move {
                    let mut resolved_inputs = Vec::new();
                    let mut iter = inputs.into_iter();
                    if let Some(this) = iter.next() {
                        let this = this.resolve_with_reader(&task);
                        // TODO avoid unwrap
                        let native_fn = this.get_trait_method(trait_type, name).unwrap();
                        resolved_inputs.push(this);
                        for input in iter {
                            resolved_inputs.push(input)
                        }
                        tt.dynamic_call(native_fn, resolved_inputs).unwrap()
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

    pub fn side_effect() {
        let task = Task::current()
            .ok_or_else(|| anyhow!("tried to call Task::side_effect outside of a task"))
            .unwrap();
        let mut state = task.state.lock().unwrap();
        state.has_side_effect = true;
    }

    fn invaldate(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.make_dirty(turbo_tasks)
    }

    pub(crate) fn with_output_slot<T>(&self, func: impl FnOnce(&mut Slot) -> T) -> T {
        let mut state = self.state.lock().unwrap();
        func(&mut state.output_slot)
    }

    pub(crate) fn with_created_slot<T>(
        &self,
        index: usize,
        func: impl FnOnce(&mut Slot) -> T,
    ) -> T {
        let mut state = self.state.lock().unwrap();
        func(&mut state.created_slots[index])
    }

    pub async fn wait_output(self: &Arc<Self>) {
        loop {
            match {
                let state = self.state.lock().unwrap();
                if state.state_type == TaskStateType::Done {
                    None
                } else {
                    Some(state.event.listen())
                }
            } {
                Some(listener) => listener.await,
                None => {}
            }
        }
    }

    pub(crate) fn ensure_scheduled(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
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
            SomeChildrenDirty => {
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
        let state = self.state.lock().unwrap();
        TaskSnapshot {
            children: state.children.clone(),
            dependencies: self.dependencies.read().unwrap().clone(),
            name: match &self.ty {
                TaskType::Root(_) => "root".to_string(),
                TaskType::Native(native_fn, _) => native_fn.name.clone(),
                TaskType::ResolveNative(native_fn) => format!("resolve {}", native_fn.name),
                TaskType::ResolveTrait(trait_type, fn_name) => {
                    format!("resolve {} in trait {}", fn_name, trait_type.name)
                }
            },
            state: match state.state_type {
                Scheduled => "scheduled".to_string(),
                InProgressLocally => "in progress (locally)".to_string(),
                InProgressLocallyOutdated => "in progress (locally, outdated)".to_string(),
                Done => "done".to_string(),
                Dirty => "dirty".to_string(),
                SomeChildrenDirty => "some children dirty".to_string(),
                SomeChildrenScheduled => "some children scheduled".to_string(),
            },
            output_slot: SlotRef::TaskOutput(self.clone()),
            slots: state
                .created_slots
                .iter()
                .enumerate()
                .map(|(i, _)| SlotRef::TaskCreated(self.clone(), i))
                .collect(),
        }
    }

    // pub(crate) async fn into_output(
    //     self: Arc<Self>,
    //     turbo_tasks: &'static TurboTasks,
    // ) -> Option<NodeRef> {
    //     fn get_or_schedule(
    //         this: &Arc<Task>,
    //         turbo_tasks: &'static TurboTasks,
    //     ) -> Result<Option<NodeRef>, EventListener> {
    //         {
    //             let mut state = this.state.lock().unwrap();
    //             match state.state_type {
    //                 Done => {
    //                     let parent = Task::current()
    //                         .ok_or_else(|| anyhow!("tried to call wait_output outside of a task"))
    //                         .unwrap();

    //                     state.parents.push(Arc::downgrade(&parent));
    //                     let arc = state.output.clone();
    //                     let has_side_effect = state.has_side_effect || state.child_has_side_effect;
    //                     drop(state);

    //                     let mut parent_state = parent.state.lock().unwrap();
    //                     parent_state.children.push(this.clone());

    //                     // propagate side effect
    //                     if has_side_effect {
    //                         parent_state.child_has_side_effect = true;
    //                     }

    //                     Ok(arc)
    //                 }
    //                 InProgressLocally
    //                 | InProgressLocallyOutdated
    //                 | Scheduled
    //                 | SomeChildrenScheduled => {
    //                     let listener = state.event.listen();
    //                     drop(state);
    //                     Err(listener)
    //                 }
    //                 Dirty => {
    //                     state.state_type = Scheduled;
    //                     let listener = state.event.listen();
    //                     drop(state);
    //                     turbo_tasks.schedule(this.clone());
    //                     Err(listener)
    //                 }
    //                 SomeChildrenDirty => {
    //                     state.state_type = SomeChildrenScheduled;
    //                     let listener = state.event.listen();
    //                     let children: Vec<Arc<Task>> =
    //                         state.children.iter().map(|arc| arc.clone()).collect();
    //                     drop(state);
    //                     for child in children.into_iter() {
    //                         child.schedule_dirty_children(turbo_tasks);
    //                     }
    //                     Err(listener)
    //                 }
    //             }
    //         }
    //     }
    //     loop {
    //         match get_or_schedule(&self, turbo_tasks) {
    //             Ok(arc) => return arc,
    //             Err(listener) => listener.await,
    //         }
    //     }
    // }
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
            let mut state = task.state.lock().unwrap();
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
            let mut state = task.state.lock().unwrap();
            let slot_index = match list.get_mut(*index) {
                Some(slot_index) => *slot_index,
                None => {
                    let index = state.created_slots.len();
                    state.created_slots.push(Slot::new());
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
    Resolved(&'static SlotValueType),
    Trait(&'static TraitType),
}

// impl Visualizable for Task {
//     fn visualize(&self, visualizer: &mut impl crate::viz::Visualizer) {
//         let state = self.state.lock().unwrap();
//         let state_str = if state.state_type == Done && state.executions <= 1 {
//             "".to_string()
//         } else {
//             match state.state_type {
//                 Scheduled => "scheduled",
//                 InProgressLocally => "in progress (locally)",
//                 InProgressLocallyOutdated => "in progress (locally, outdated)",
//                 Done => "done",
//                 Dirty => "dirty",
//                 SomeChildrenDirty => "some children dirty",
//                 SomeChildrenScheduled => "some children scheduled",
//             }
//             .to_string()
//                 + &format!(" ({}x executed)", state.executions)
//         };
//         if visualizer.task(
//             self as *const Task,
//             self.native_fn
//                 .map_or_else(|| "unnamed", |native_fn| &native_fn.name),
//             &state_str,
//         ) {
//             let children = state.children.clone();
//             // let output = state.output_slot.clone();
//             drop(state);
//             // for input in self.inputs.iter() {
//             //     input.visualize(visualizer);
//             //     visualizer.input(self as *const Task, &**input as *const Node);
//             // }
//             if !children.is_empty() {
//                 visualizer.children_start(self as *const Task);
//                 for child in children.iter() {
//                     child.visualize(visualizer);
//                     visualizer.child(self as *const Task, &**child as *const Task);
//                 }
//                 visualizer.children_end(self as *const Task);
//             }
//             // if let Some(output) = output {
//             //     output.visualize(visualizer);
//             //     visualizer.output(self as *const Task, &*output as *const Node);
//             // }
//             {
//                 let previous_nodes = self.previous_nodes.lock().unwrap();
//                 for (_, nodes) in previous_nodes.by_type.values() {
//                     for node in nodes {
//                         node.visualize(visualizer);
//                         visualizer.created(self as *const Task, &**node as *const Node);
//                     }
//                 }
//                 for node in previous_nodes.by_key.values() {
//                     node.visualize(visualizer);
//                     visualizer.created(self as *const Task, &**node as *const Node);
//                 }
//             }
//             let deps = self.dependencies.read().unwrap();
//             if !deps.is_empty() {
//                 if children.is_empty() {
//                     for dependency in deps.iter() {
//                         if let Some(dependency) = dependency.upgrade() {
//                             dependency.visualize(visualizer);
//                             visualizer.dependency(self as *const Task, &*dependency as *const Node);
//                         }
//                     }
//                 } else {
//                     visualizer.children_start(self as *const Task);
//                     for dependency in deps.iter() {
//                         if let Some(dependency) = dependency.upgrade() {
//                             dependency.visualize(visualizer);
//                             visualizer.dependency(self as *const Task, &*dependency as *const Node);
//                         }
//                     }
//                     visualizer.children_end(self as *const Task);
//                 }
//             }
//         }
//     }
// }
