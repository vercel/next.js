use crate::{self as turbo_tasks, task::NativeTaskFn, NodeRef, NodeReuseMode, NodeType};
use anyhow::Result;
use lazy_static::lazy_static;
use std::hash::Hash;

lazy_static! {
    static ref NATIVE_FUNCTION_NODE_TYPE: NodeType =
        NodeType::new("NativeFunction".to_string(), NodeReuseMode::None);
}

#[turbo_tasks::value]
pub struct NativeFunction {
    bind_fn: Box<dyn (Fn(Vec<NodeRef>) -> Result<NativeTaskFn>) + Send + Sync + 'static>,
}

#[turbo_tasks::value_impl]
impl NativeFunction {
    #[turbo_tasks::constructor(!intern !previous)]
    pub fn new(
        bind_fn: impl (Fn(Vec<NodeRef>) -> Result<NativeTaskFn>) + Send + Sync + 'static,
    ) -> Self {
        Self {
            bind_fn: Box::new(bind_fn),
        }
    }

    pub fn bind(&self, inputs: Vec<NodeRef>) -> Result<NativeTaskFn> {
        (self.bind_fn)(inputs)
    }
}

impl PartialEq for &'static NativeFunction {
    fn eq(&self, other: &Self) -> bool {
        (*self as *const NativeFunction) == (*other as *const NativeFunction)
    }
}

impl Hash for &'static NativeFunction {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&(*self as *const NativeFunction), state);
    }
}
