use std::{any::Any, hash::Hash};

use crate::{turbo_tasks::intern, NodeRef};

pub fn new_node_intern<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> NodeRef,
>(
    key: K,
    fallback: F,
) -> NodeRef {
    intern::<T, K, F>(key, fallback)
}

pub fn new_node_auto_intern<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> NodeRef,
>(
    key: K,
    fallback: F,
) -> NodeRef {
    // TODO implement decision if intern or not
    intern::<T, K, F>(key, fallback)
}
