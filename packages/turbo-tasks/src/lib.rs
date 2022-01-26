use std::{cell::Cell, future::Future, hash::Hash, ops::Deref, sync::Arc};

use any_key::AnyHash;
use anyhow::{anyhow, Result};
use async_std::task::Builder;
use async_std::{prelude::*, task::JoinHandle};
use chashmap::CHashMap;
use lazy_static::lazy_static;

mod node;
mod task;

pub use node::{Node, NodeReuseMode, NodeType};
use task::NativeTaskFn;
pub use task::{Invalidator, Task};

pub struct TurboTasks {
    interning_map: CHashMap<Box<dyn AnyHash + Send + Sync>, Arc<Node>>,
    task_cache: CHashMap<Box<dyn AnyHash + Send + Sync>, Arc<Task>>,
}

task_local! {
  static TURBO_TASKS: Cell<Option<&'static TurboTasks>> = Cell::new(None);
}

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
                Task::set_current(task.clone());
                TURBO_TASKS.with(|c| c.set(Some(self)));
                task.as_ref().execution_started();
                let result = task.execute().await;
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
