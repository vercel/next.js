use anyhow::anyhow;
use std::{
    any::{Any, TypeId},
    collections::{HashMap, HashSet},
    fmt::{self, Debug, Formatter},
    hash::Hash,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, RwLock, Weak,
    },
};

use crate::{viz::Visualizable, NativeFunction, Task};

static NEXT_NODE_TYPE_ID: AtomicU32 = AtomicU32::new(1);

pub struct NodeType {
    pub name: String,
    id: u32,
    traits: HashSet<&'static TraitType>,
    trait_methods: HashMap<TypeId, (&'static NativeFunction, &'static str)>,
}

impl Hash for NodeType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Eq for NodeType {}

impl PartialEq for NodeType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Debug for NodeType {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let mut d = f.debug_struct("NodeType");
        d.field("name", &self.name);
        d.field("id", &self.id);
        for (_key, (_value, name)) in self.trait_methods.iter() {
            d.field(name, &"(trait fn)");
        }
        d.finish()
    }
}

impl NodeType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_NODE_TYPE_ID.fetch_add(1, Ordering::Relaxed),
            traits: HashSet::new(),
            trait_methods: HashMap::new(),
        }
    }

    pub fn register_trait_method(
        &mut self,
        (id, name): (TypeId, &'static str),
        native_fn: &'static NativeFunction,
    ) {
        self.trait_methods.insert(id, (native_fn, name));
    }

    pub fn register_trait(&mut self, trait_type: &'static TraitType) {
        self.traits.insert(trait_type);
    }
}

static NEXT_TRAIT_TYPE_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Debug)]
pub struct TraitType {
    pub name: String,
    id: u32,
}

impl Hash for TraitType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state);
    }
}

impl Eq for TraitType {}

impl PartialEq for TraitType {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl TraitType {
    pub fn new(name: String) -> Self {
        Self {
            name,
            id: NEXT_TRAIT_TYPE_ID.fetch_add(1, Ordering::Relaxed),
        }
    }
}

pub trait TraitMethod: Any {}

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

#[repr(transparent)]
#[derive(Clone)]
pub struct NodeRef {
    node: Arc<Node>,
}

impl NodeRef {
    pub fn new<T: Any + Send + Sync>(node_type: &'static NodeType, content: Arc<T>) -> Self {
        Self {
            node: Arc::new(Node {
                node_type,
                state: RwLock::new(NodeState {
                    content: content as Arc<dyn Any + Send + Sync>,
                    dependent_tasks: Vec::new(),
                }),
            }),
        }
    }

    pub fn read_content(&self) -> Arc<dyn Any + Send + Sync> {
        let task = Task::current()
            .ok_or_else(|| anyhow!("tried to call read_content outside of a task"))
            .unwrap();

        task.add_dependency(self.downgrade());

        let mut state = self.state.write().unwrap();
        state.dependent_tasks.push(Arc::downgrade(&task));
        return state.content.clone();
    }

    pub fn read<T: Any + Send + Sync>(&self) -> Option<Arc<T>> {
        // TODO support traits here too
        Arc::downcast(self.read_content()).ok()
    }

    pub fn is_node_type(&self, node_type: &'static NodeType) -> bool {
        node_type == self.node_type
    }

    pub fn get_node_type(&self) -> &NodeType {
        self.node_type
    }

    pub fn downgrade(&self) -> WeakNodeRef {
        WeakNodeRef {
            node: Arc::downgrade(&self.node),
        }
    }

    pub fn has_trait_type(&self, trait_type: &'static TraitType) -> bool {
        self.node_type.traits.contains(trait_type)
    }

    pub fn get_trait_method(&self, (id, name): (TypeId, &'static str)) -> &'static NativeFunction {
        self.node_type
            .trait_methods
            .get(&id)
            .ok_or_else(|| {
                anyhow!(
                    "Trait method {} not found in node of type {}",
                    name,
                    self.node_type.name
                )
            })
            .unwrap()
            .0
    }
}

impl std::ops::Deref for NodeRef {
    type Target = Node;
    fn deref(&self) -> &Self::Target {
        self.node.deref()
    }
}

impl Eq for NodeRef {}

impl PartialEq for NodeRef {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.node, &other.node)
    }
}

impl Hash for NodeRef {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&Arc::as_ptr(&self.node), state);
    }
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

impl fmt::Debug for NodeRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_fmt(format_args!(
            "Node {} {:?}",
            &self.node.node_type.name,
            Arc::as_ptr(&self.node)
        ))
    }
}

#[repr(transparent)]
#[derive(Clone)]
pub struct WeakNodeRef {
    node: Weak<Node>,
}

impl WeakNodeRef {
    pub fn upgrade(&self) -> Option<NodeRef> {
        self.node.upgrade().map(|node| NodeRef { node })
    }
}

impl fmt::Debug for WeakNodeRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.upgrade() {
            None => {
                write!(f, "(dropped)")
            }
            Some(node) => {
                write!(f, "(Weak) ")?;
                fmt::Debug::fmt(&node, f)
            }
        }
    }
}

impl Visualizable for NodeRef {
    fn visualize(&self, visualizer: &mut impl crate::viz::Visualizer) {
        visualizer.node(&**self as *const Node, &self.node_type.name);
    }
}
