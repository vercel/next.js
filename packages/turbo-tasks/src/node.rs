use anyhow::anyhow;
use std::{
    any::Any,
    fmt::{self, Debug, Formatter},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, RwLock, Weak,
    },
};

use crate::Task;

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
    // content can change, but must not change it type
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

        task.add_dependency(Arc::downgrade(self));

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
