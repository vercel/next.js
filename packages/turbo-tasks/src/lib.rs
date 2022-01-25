use std::{
    any::Any,
    cell::Cell,
    fmt::{self, Debug, Formatter},
    future::Future,
    hash::Hash,
    ops::Deref,
    pin::Pin,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex, MutexGuard, RwLock, Weak,
    },
};

use any_key::AnyHash;
use anyhow::{anyhow, Result};
use async_std::task::Builder;
use async_std::{prelude::*, task::JoinHandle};
use chashmap::CHashMap;
use event_listener::Event;
use lazy_static::lazy_static;

pub struct TurboTasks {
    interning_map: CHashMap<Box<dyn AnyHash + Send + Sync>, Arc<Node>>,
    task_cache: CHashMap<Box<dyn AnyHash + Send + Sync>, Arc<Task>>,
}

task_local! {
  static CURRENT_TASK: Cell<Option<Arc<Task>>> = Cell::new(None);
  static TURBO_TASKS: Cell<Option<&'static TurboTasks>> = Cell::new(None);
}

type NativeTaskFuture = Pin<Box<dyn Future<Output = Arc<Node>> + Send>>;
type NativeTaskFn = Box<dyn Fn() -> NativeTaskFuture + Send + Sync>;

impl TurboTasks {
    // TODO better lifetime management for turbo tasks
    // consider using unsafe for the task_local turbo tasks
    // that should be safe as long tasks can't outlife turbo task
    // so we probably want to make sure that all tasks are joined
    // when trying to drop turbo tasks
    pub fn new() -> &'static Self {
        Box::leak(Box::new(Self {
            interning_map: CHashMap::new(),
            task_cache: CHashMap::new(),
        }))
    }

    pub fn spawn_root_task(&'static self, native_fn: NativeTaskFn) -> Arc<Task> {
        let task = Arc::new(Task::new(native_fn));
        self.schedule(task.clone());
        task
    }

    fn schedule(&'static self, task: Arc<Task>) -> JoinHandle<()> {
        Builder::new()
            .name(format!("{:?} {:?}", &*task, &*task as *const Task))
            .spawn(async move {
                CURRENT_TASK.with(|c| c.set(Some(task.clone())));
                TURBO_TASKS.with(|c| c.set(Some(self)));
                task.as_ref().execution_started();
                let result = (task.native_fn)().await;
                task.execution_completed(result, self);
            })
            .unwrap()
    }

    fn current() -> Option<&'static Self> {
        TURBO_TASKS.with(|c| c.get())
    }

    pub fn intern<T: Hash + PartialEq + Eq + Send + Sync + 'static>(
        key: T,
        fallback: impl FnOnce() -> Arc<Node>,
    ) -> Arc<Node> {
        let tt = TurboTasks::current().unwrap();
        let mut node1 = None;
        let mut node2 = None;
        tt.interning_map.upsert(
            Box::new(key) as Box<dyn AnyHash + Send + Sync>,
            || {
                let new_node = fallback();
                node1 = Some(new_node.clone());
                new_node
            },
            |existing_node| {
                node2 = Some(existing_node.clone());
            },
        );
        // TODO ugly
        if let Some(n) = node1 {
            return n;
        }
        node2.unwrap()
    }
}

pub struct Task {
    native_fn: NativeTaskFn,
    state: Mutex<TaskState>,
    // TODO use a concurrent set instead
    dependencies: RwLock<Vec<Weak<Node>>>,
}

impl Debug for Task {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let deps: Vec<Arc<Node>> = self
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
    state_type: TaskStateType,
    has_side_effect: bool,
    parents: Vec<Weak<Task>>,
    children: Vec<Arc<Task>>,
    output: Option<Arc<Node>>,
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
    fn new(native_fn: NativeTaskFn) -> Self {
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

    fn execution_started(&self) {
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

    fn execution_completed(self: Arc<Self>, result: Arc<Node>, turbo_tasks: &'static TurboTasks) {
        let mut state = self.state.lock().unwrap();
        match state.state_type {
            InProgressLocally => {
                state.state_type = Done;
                state.event.notify(usize::MAX);
                let parents: Vec<Arc<Task>> =
                    state.parents.iter().filter_map(|p| p.upgrade()).collect();
                if let Some(true) = state
                    .output
                    .as_ref()
                    .map(|output| Arc::ptr_eq(&output, &result))
                {
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

    fn child_dirty(self: &Arc<Self>, turbo_tasks: &'static TurboTasks) {
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

    fn child_done(&self, turbo_tasks: &'static TurboTasks) {
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

    fn current() -> Option<Arc<Task>> {
        CURRENT_TASK.with(|c| {
            if let Some(arc) = c.take() {
                let clone = arc.clone();
                c.set(Some(arc));
                return Some(clone);
            }
            None
        })
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

    pub async fn wait_output(self: &Arc<Self>) -> Arc<Node> {
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

    pub async fn wait_output_from_task(self: &Arc<Self>) -> Arc<Node> {
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

pub fn schedule_child(
    func: &'static NativeFunctionStaticRef,
    inputs: Vec<Arc<Node>>,
) -> impl Future<Output = Arc<Node>> {
    let new_task = {
        let tt = TurboTasks::current()
            .ok_or_else(|| anyhow!("tried to call schedule_child outside of a turbo tasks"))
            .unwrap();
        let functor = (func.bind_fn())(inputs).unwrap();
        let new_task = Arc::new(Task::new(functor));
        tt.schedule(new_task.clone());
        new_task
    };
    return async move { new_task.wait_output_from_task().await };
}

static NEXT_NODE_TYPE_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Hash, Eq, PartialEq, Debug)]
pub enum NodeReuseMode {
    None,
    GlobalInterning,
    // TaskMatching,
}

#[derive(Hash, Eq, Debug)]
pub struct NodeType {
    pub name: String,
    id: u32,
    reuse_mode: NodeReuseMode,
}

impl PartialEq for NodeType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl NodeType {
    pub fn new(name: String, reuse_mode: NodeReuseMode) -> Self {
        Self {
            name,
            id: NEXT_NODE_TYPE_ID.fetch_add(1, Ordering::Relaxed),
            reuse_mode,
        }
    }
}

pub struct Node {
    node_type: &'static NodeType,
    state: RwLock<NodeState>,
}

struct NodeState {
    content: Arc<dyn Any + Send + Sync>,
    // TODO use a concurrent set instead
    dependent_tasks: Vec<Weak<Task>>,
}

impl Debug for Node {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        // let state = self.state.read().unwrap();
        f.write_fmt(format_args!(
            "Node {} {:?}",
            &self.node_type.name, self as *const Node
        ))
        // f.debug_struct(&format!("{} Node"))
        //     .field("ptr", &(self as *const Node))
        //     .finish_non_exhaustive()
    }
}

impl Node {
    pub fn new<T: Any + Send + Sync>(node_type: &'static NodeType, content: Arc<T>) -> Self {
        Self {
            node_type,
            state: RwLock::new(NodeState {
                content: content as Arc<dyn Any + Send + Sync>,
                dependent_tasks: Vec::new(),
            }),
        }
    }

    pub fn read_content(self: &Arc<Self>) -> Arc<dyn Any + Send + Sync> {
        let task = Task::current()
            .ok_or_else(|| anyhow!("tried to call read_content outside of a task"))
            .unwrap();
        // TODO it's possible to schedule that work instead
        // maybe into a task_local dependencies list that
        // is stored that the end of the execution
        let mut deps = task.dependencies.write().unwrap();
        deps.push(Arc::downgrade(self));

        let mut state = self.state.write().unwrap();
        state.dependent_tasks.push(Arc::downgrade(&task));
        return state.content.clone();
    }

    pub fn read<T: Any + Send + Sync>(self: &Arc<Self>) -> Option<Arc<T>> {
        // TODO support traits here too
        Arc::downcast(self.read_content()).ok()
    }

    pub fn is_node_type(self: &Arc<Self>, node_type: &'static NodeType) -> bool {
        node_type == self.node_type
    }

    pub fn get_node_type<'a>(self: &'a Arc<Self>) -> &'a NodeType {
        self.node_type
    }
}

lazy_static! {
    static ref NATIVE_FUNCTION_NODE_TYPE: NodeType =
        NodeType::new("NativeFunction".to_string(), NodeReuseMode::None);
}

pub struct NativeFunction {
    bind_fn: Box<dyn (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static>,
}

impl NativeFunction {
    pub fn new(
        bind_fn: impl (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static,
    ) -> Self {
        Self {
            bind_fn: Box::new(bind_fn),
        }
    }
}

// TODO autogenerate NativeFunctionStaticRef
pub struct NativeFunctionStaticRef {
    node: Arc<Node>,
    value: Arc<NativeFunction>,
}

impl NativeFunctionStaticRef {
    pub fn new(
        bind_fn: impl (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static,
    ) -> Self {
        let value = Arc::new(NativeFunction::new(bind_fn));
        let new_node = Node::new(&NATIVE_FUNCTION_NODE_TYPE, value.clone());
        Self {
            node: Arc::new(new_node),
            value,
        }
    }

    pub fn bind_fn(
        &self,
    ) -> &Box<dyn (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static> {
        &self.deref().bind_fn
    }
}

impl Deref for NativeFunctionStaticRef {
    type Target = NativeFunction;
    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

impl From<NativeFunctionStaticRef> for Arc<Node> {
    fn from(node_ref: NativeFunctionStaticRef) -> Self {
        node_ref.node
    }
}
