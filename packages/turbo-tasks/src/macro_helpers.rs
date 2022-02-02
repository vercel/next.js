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

pub fn match_previous_node_by_key<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce(Option<NodeRef>) -> NodeRef,
>(
    key: K,
    functor: F,
) -> NodeRef {
    crate::task::match_previous_node_by_key::<T, K, F>(key, functor)
}

pub fn match_previous_node_by_type<T: Any + ?Sized, F: FnOnce(Option<NodeRef>) -> NodeRef>(
    functor: F,
) -> NodeRef {
    crate::task::match_previous_node_by_type::<T, F>(functor)
}
