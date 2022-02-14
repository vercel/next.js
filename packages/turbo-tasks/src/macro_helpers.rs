use std::{any::Any, hash::Hash, sync::Arc};

use crate::{slot::Slot, turbo_tasks::intern, SlotRef, SlotValueType};

pub use crate::slot::SlotReadResult;

pub fn new_node_intern<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> (&'static SlotValueType, Arc<dyn Any + Send + Sync>),
>(
    key: K,
    fallback: F,
) -> SlotRef {
    intern::<T, K, F>(key, fallback)
}

pub fn new_node_auto_intern<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce() -> (&'static SlotValueType, Arc<dyn Any + Send + Sync>),
>(
    key: K,
    fallback: F,
) -> SlotRef {
    // TODO implement decision if intern or not
    intern::<T, K, F>(key, fallback)
}

pub fn match_previous_node_by_key<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce(&mut Slot),
>(
    key: K,
    functor: F,
) -> SlotRef {
    crate::task::match_previous_node_by_key::<T, K, F>(key, functor)
}

pub fn match_previous_node_by_type<T: Any + ?Sized, F: FnOnce(&mut Slot)>(functor: F) -> SlotRef {
    crate::task::match_previous_node_by_type::<T, F>(functor)
}
