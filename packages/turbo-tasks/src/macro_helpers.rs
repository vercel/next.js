use std::{
    any::{Any, TypeId},
    hash::Hash,
    sync::Arc,
};

pub use crate::node::Node;
use crate::turbo_tasks::intern;

pub fn new_node_intern<
    T: Any,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> Arc<Node>,
>(
    key: K,
    fallback: F,
) -> Arc<Node> {
    intern((TypeId::of::<T>(), key), fallback)
}
