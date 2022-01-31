use crate::{node::Node, viz::Visualizable, NativeFunction, NodeRef, TurboTasks, WeakNodeRef};
use anyhow::{anyhow, Result};
use async_std::task_local;
use event_listener::{Event, EventListener};
use std::{
    cell::Cell,
    fmt::{self, Debug, Formatter},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex, RwLock, Weak},
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = Option<NodeRef>> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

task_local! {
  static CURRENT_TASK: Cell<Option<Arc<Task>>> = Cell::new(None);
}

pub struct Task {
    inputs: Vec<NodeRef>,
    native_fn: Option<&'static NativeFunction>,
    bound_fn: NativeTaskFn,
    state: Mutex<TaskState>,
    // TODO use a concurrent set instead
    dependencies: RwLock<Vec<WeakNodeRef>>,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let deps: Vec<NodeRef> = self
            .dependencies
            .read()
            .unwrap()
            .iter()
            .filter_map(|i| i.upgrade())
            .collect();
        let state = self.state.lock().unwrap();
        let mut result = f.debug_struct("Task");
        result.field("state", &state.state_type);
        if let Some(ref node) = &state.output {
            result.field("output", &node);
        }
        if state.children.len() > 0 {
            result.field("children", &state.children);
        }
        if deps.len() > 0 {
            result.field("dependencies", &deps);
        }
        result.finish()
    }
}

struct TaskState {
    // TODO using a Atomic might be possible here
    state_type: TaskStateType,
    dirty_children_count: usize,
    // TODO do we want to keep that or solve it in a different way?
    has_side_effect: bool,
    // TODO use a concurrent set
    parents: Vec<Weak<Task>>,
    // TODO use a concurrent set
    children: Vec<Arc<Task>>,
    output: Option<NodeRef>,
    event: Event,
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

use TaskStateType::*;

impl Task {
    pub(crate) fn new_native(
        inputs: Vec<NodeRef>,
        native_fn: &'static NativeFunction,
    ) -> Result<Self> {
        let bound_fn = native_fn.bind(inputs.clone())?;
        Ok(Self {
            inputs,
            native_fn: Some(native_fn),
            bound_fn,
            state: Mutex::new(TaskState {
                state_type: TaskStateType::Scheduled,
                dirty_children_count: 0,
                has_side_effect: false,
                parents: Vec::new(),
                children: Vec::new(),
                output: None,
                event: Event::new(),
            }),
            dependencies: RwLock::new(Vec::new()),
        })
    }

    pub(crate) fn new_root(functor: impl Fn() -> NativeTaskFuture + Sync + Send + 'static) -> Self {
        Self {
            inputs: Vec::new(),
            native_fn: None,
            bound_fn: Box::new(functor),
            state: Mutex::new(TaskState {
                state_type: TaskStateType::Scheduled,
                dirty_children_count: 0,
                has_side_effect: false,
                parents: Vec::new(),
                children: Vec::new(),
                output: None,
                event: Event::new(),
            }),
            dependencies: RwLock::new(Vec::new()),
        }
    }

    pub(crate) fn execution_started(&self) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Scheduled | InProgressLocallyOutdated => {
                state.state_type = InProgressLocally;
                state.has_side_effect = false;
                // TODO disconnect other sides too
                state.children.clear();
                self.dependencies.write().unwrap().clear()
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
        result: Option<NodeRef>,
        turbo_tasks: &'static TurboTasks,
    ) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            InProgressLocally => {
                state.state_type = Done;
                state.event.notify(usize::MAX);
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                if state.output == result {
                    // output hasn't changed
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_done(turbo_tasks);
                    }
                } else {
                    state.output = result;
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_output_updated(turbo_tasks);
                    }
                }
            }
            InProgressLocallyOutdated => {
                state.state_type = Scheduled;
                state.output = result;
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

    fn child_output_updated(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        self.make_dirty(turbo_tasks)
    }

    fn make_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Dirty | Scheduled => {}
            SomeChildrenDirty => {
                if state.has_side_effect {
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
                let has_side_effect = state.has_side_effect;
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

    pub(crate) fn add_dependency(&self, node: WeakNodeRef) {
        // TODO it's possible to schedule that work instead
        // maybe into a task_local dependencies list that
        // is stored that the end of the execution
        // but that won't capute changes during execution
        // which would require extra steps
        let mut deps = self.dependencies.write().unwrap();
        deps.push(node);
    }

    pub(crate) fn execute(&self) -> NativeTaskFuture {
        (self.bound_fn)()
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

    pub async fn wait_output(self: &Arc<Self>) -> Option<NodeRef> {
        loop {
            match {
                let state = self.state.lock().unwrap();
                if state.state_type == TaskStateType::Done {
                    let arc = state.output.clone();
                    Ok(arc)
                } else {
                    Err(state.event.listen())
                }
            } {
                Ok(arc) => return arc,
                Err(listener) => listener.await,
            }
        }
    }

    pub(crate) async fn into_output(
        self: Arc<Self>,
        turbo_tasks: &'static TurboTasks,
    ) -> Option<NodeRef> {
        fn get_or_schedule(
            this: &Arc<Task>,
            turbo_tasks: &'static TurboTasks,
        ) -> Result<Option<NodeRef>, EventListener> {
            {
                let mut state = this.state.lock().unwrap();
                match state.state_type {
                    Done => {
                        let parent = Task::current()
                            .ok_or_else(|| anyhow!("tried to call wait_output outside of a task"))
                            .unwrap();

                        state.parents.push(Arc::downgrade(&parent));
                        let arc = state.output.clone();
                        let has_side_effect = state.has_side_effect;
                        drop(state);

                        let mut parent_state = parent.state.lock().unwrap();
                        parent_state.children.push(this.clone());

                        // propagate side effect
                        if has_side_effect {
                            parent_state.has_side_effect = true;
                        }

                        Ok(arc)
                    }
                    InProgressLocally
                    | InProgressLocallyOutdated
                    | Scheduled
                    | SomeChildrenScheduled => {
                        let listener = state.event.listen();
                        drop(state);
                        Err(listener)
                    }
                    Dirty => {
                        state.state_type = Scheduled;
                        let listener = state.event.listen();
                        drop(state);
                        turbo_tasks.schedule(this.clone());
                        Err(listener)
                    }
                    SomeChildrenDirty => {
                        state.state_type = SomeChildrenScheduled;
                        let listener = state.event.listen();
                        let children: Vec<Arc<Task>> =
                            state.children.iter().map(|arc| arc.clone()).collect();
                        drop(state);
                        for child in children.into_iter() {
                            child.schedule_dirty_children(turbo_tasks);
                        }
                        Err(listener)
                    }
                }
            }
        }
        loop {
            match get_or_schedule(&self, turbo_tasks) {
                Ok(arc) => return arc,
                Err(listener) => listener.await,
            }
        }
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

impl Visualizable for Task {
    fn visualize(&self, visualizer: &mut impl crate::viz::Visualizer) {
        let state = self.state.lock().unwrap();
        if visualizer.task(
            self as *const Task,
            self.native_fn
                .map_or_else(|| "unnamed", |native_fn| &native_fn.name),
            match state.state_type {
                Scheduled => "scheduled",
                InProgressLocally => "in progress (locally)",
                InProgressLocallyOutdated => "in progress (locally, outdated)",
                Done => "done",
                Dirty => "dirty",
                SomeChildrenDirty => "some children dirty",
                SomeChildrenScheduled => "some children scheduled",
            },
        ) {
            let children = state.children.clone();
            let output = state.output.clone();
            drop(state);
            for input in self.inputs.iter() {
                input.visualize(visualizer);
                visualizer.input(self as *const Task, &**input as *const Node);
            }
            if !children.is_empty() {
                visualizer.children_start(self as *const Task);
                for child in children.iter() {
                    child.visualize(visualizer);
                    visualizer.child(self as *const Task, &**child as *const Task);
                }
                visualizer.children_end(self as *const Task);
            }
            if let Some(output) = output {
                output.visualize(visualizer);
                visualizer.output(self as *const Task, &*output as *const Node);
            }
            let deps = self.dependencies.read().unwrap();
            if !deps.is_empty() {
                if children.is_empty() {
                    for dependency in deps.iter() {
                        if let Some(dependency) = dependency.upgrade() {
                            dependency.visualize(visualizer);
                            visualizer.dependency(self as *const Task, &*dependency as *const Node);
                        }
                    }
                } else {
                    visualizer.children_start(self as *const Task);
                    for dependency in deps.iter() {
                        if let Some(dependency) = dependency.upgrade() {
                            dependency.visualize(visualizer);
                            visualizer.dependency(self as *const Task, &*dependency as *const Node);
                        }
                    }
                    visualizer.children_end(self as *const Task);
                }
            }
        }
    }
}
