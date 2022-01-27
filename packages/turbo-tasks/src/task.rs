use crate::{NodeRef, TurboTasks, WeakNodeRef};
use anyhow::anyhow;
use async_std::task_local;
use event_listener::Event;
use std::{
    cell::Cell,
    fmt::{self, Debug, Formatter},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex, MutexGuard, RwLock, Weak},
};

pub type NativeTaskFuture = Pin<Box<dyn Future<Output = NodeRef> + Send>>;
pub type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

task_local! {
  static CURRENT_TASK: Cell<Option<Arc<Task>>> = Cell::new(None);
}

pub struct Task {
    native_fn: NativeTaskFn,
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
    // task is scheduled for execution
    // it will soon move to InProgressLocally
    Scheduled,
    // task started executing
    // it will soon move to Done
    // but it may move to Dirty when invalidated
    InProgressLocally,
    // task started executing
    // but it was invalidated during that
    // it will soon reexecute and move to Scheduled
    InProgressLocallyOutdated,
    // task has executed and outputs are valid
    // it may move to Dirty when invalidated
    // it may move to SomeChildrenDirty when a child is invalidated
    Done,
    // the task has been invalidated for some reason
    // the goal is to keep this task dirty until access
    // on access it will move to Scheduled
    Dirty,
    // some child tasks has been flagged as dirty
    // the goal is to keep this task dirty until access
    // on access it will move to SomeChildrenDirtyScheduled
    // and schedule these dirty children
    SomeChildrenDirty,
    // some child tasks has been flagged as dirty
    // but with the goal is to get everything up to date again
    SomeChildrenDirtyScheduled,
}

use TaskStateType::*;

impl Task {
    pub(crate) fn new(native_fn: NativeTaskFn) -> Self {
        Self {
            native_fn,
            state: Mutex::new(TaskState {
                state_type: TaskStateType::Scheduled,
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
        result: NodeRef,
        turbo_tasks: &'static TurboTasks,
    ) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            InProgressLocally => {
                state.state_type = Done;
                state.event.notify(usize::MAX);
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                if let Some(true) = state.output.as_ref().map(|output| *output == result) {
                    // output hasn't changed
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_done(turbo_tasks);
                    }
                } else {
                    state.output = Some(result);
                    drop(state);
                    for parent in parents.iter() {
                        parent.child_output_updated(turbo_tasks);
                    }
                }
            }
            InProgressLocallyOutdated => {
                state.state_type = Scheduled;
                state.output = Some(result);
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

    pub(crate) fn child_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            Dirty | Scheduled | InProgressLocallyOutdated => {}
            InProgressLocally => {
                state.state_type = InProgressLocallyOutdated;
            }
            SomeChildrenDirty | SomeChildrenDirtyScheduled => {}
            Done => {
                let has_side_effect = state.has_side_effect;
                if has_side_effect {
                    state.state_type = Scheduled;
                } else {
                    state.state_type = SomeChildrenDirty;
                }
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                drop(state);
                for parent in parents.iter() {
                    parent.child_dirty(turbo_tasks);
                }
                if has_side_effect {
                    turbo_tasks.schedule(self.clone());
                }
            }
        };
    }

    pub(crate) fn child_done(&self, turbo_tasks: &'static TurboTasks) {
        let state = self.state.lock().unwrap();
        if state.state_type != SomeChildrenDirtyScheduled {
            return;
        }
        let children: Vec<Arc<Task>> = state.children.iter().map(|arc| arc.clone()).collect();
        drop(state);
        for child in children.into_iter() {
            let state = child.state.lock().unwrap();
            child.clone().schedule_dirty_children(state, turbo_tasks);
        }
        // TODO: automatically progress children
    }

    fn schedule_dirty_children(
        self: Arc<Self>,
        mut state: MutexGuard<TaskState>,
        turbo_tasks: &'static TurboTasks,
    ) {
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
                    let state = child.state.lock().unwrap();
                    child.clone().schedule_dirty_children(state, turbo_tasks);
                }
            }
            SomeChildrenDirtyScheduled => {}
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
                for parent in parents.iter() {
                    parent.child_dirty(turbo_tasks);
                }
                if has_side_effect {
                    turbo_tasks.schedule(self.clone());
                }
            }
            SomeChildrenDirtyScheduled => {
                state.state_type = Scheduled;
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                drop(state);
                for parent in parents.iter() {
                    parent.child_dirty(turbo_tasks);
                }
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
        (self.native_fn)()
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

    pub async fn wait_output(self: &Arc<Self>) -> NodeRef {
        loop {
            match {
                let state = self.state.lock().unwrap();
                if state.state_type == TaskStateType::Done {
                    let arc = state.output.as_ref().unwrap().clone();
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

    pub(crate) async fn into_output(self: Arc<Self>) -> NodeRef {
        loop {
            match {
                let mut state = self.state.lock().unwrap();
                if state.state_type == TaskStateType::Done {
                    let parent = Task::current()
                        .ok_or_else(|| anyhow!("tried to call wait_output outside of a task"))
                        .unwrap();

                    state.parents.push(Arc::downgrade(&parent));
                    let arc = state.output.as_ref().unwrap().clone();
                    drop(state);

                    let mut parent_state = parent.state.lock().unwrap();
                    parent_state.children.push(self.clone());

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
