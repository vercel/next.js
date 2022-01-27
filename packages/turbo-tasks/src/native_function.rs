use std::sync::Arc;

use anyhow::Result;
use lazy_static::lazy_static;

use crate::{node::Node, task::NativeTaskFn, NodeReuseMode, NodeType};

lazy_static! {
    static ref NATIVE_FUNCTION_NODE_TYPE: NodeType =
        NodeType::new("NativeFunction".to_string(), NodeReuseMode::None);
}

use crate as turbo_tasks;

#[turbo_tasks::value]
pub struct NativeFunction {
    bind_fn: Box<dyn (Fn(Vec<Arc<Node>>) -> Result<NativeTaskFn>) + Send + Sync + 'static>,
}

#[turbo_tasks::value_impl]
impl NativeFunction {
    #[turbo_tasks::constructor(!intern !previous)]
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
