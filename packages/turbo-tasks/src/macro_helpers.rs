use std::{any::Any, hash::Hash};

use crate::{slot::Slot, SlotRef};

pub use crate::slot::SlotRefReadResult;

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
