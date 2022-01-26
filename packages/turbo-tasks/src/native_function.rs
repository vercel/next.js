use std::sync::Arc;

use anyhow::Result;
use lazy_static::lazy_static;

use crate::{node::Node, task::NativeTaskFn, NodeReuseMode, NodeType};

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

    pub fn bind(&self, inputs: Vec<Arc<Node>>) -> Result<NativeTaskFn> {
        (self.bind_fn)(inputs)
    }
}

// TODO autogenerate NativeFunctionRef
pub struct NativeFunctionRef {
    node: Arc<Node>,
}

impl NativeFunctionRef {
    pub fn new(
        bind_fn: impl (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static,
    ) -> Self {
        let value = Arc::new(NativeFunction::new(bind_fn));
        let new_node = Node::new(&NATIVE_FUNCTION_NODE_TYPE, value);
        Self {
            node: Arc::new(new_node),
        }
    }

    pub fn get(&self) -> Arc<NativeFunction> {
        // unwrap is safe here since we ensure that it will be the correct node type
        self.node.read::<NativeFunction>().unwrap()
    }
}

impl From<NativeFunctionRef> for Arc<Node> {
    fn from(node_ref: NativeFunctionRef) -> Self {
        node_ref.node
    }
}
