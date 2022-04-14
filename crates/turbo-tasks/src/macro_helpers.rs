use std::{any::Any, hash::Hash};

use crate::{slot::Slot, RawVc};

pub use crate::raw_vc::RawVcReadResult;

/// Internally used by turbo-tasks-macros
pub fn match_previous_node_by_key<
    T: Any + ?Sized,
    K: Hash + PartialEq + Eq + Send + Sync + 'static,
    F: FnOnce(&mut Slot),
>(
    key: K,
    functor: F,
) -> RawVc {
    crate::task::match_previous_node_by_key::<T, K, F>(key, functor)
}

/// Internally used by turbo-tasks-macros
pub fn match_previous_node_by_type<T: Any + ?Sized, F: FnOnce(&mut Slot)>(functor: F) -> RawVc {
    crate::task::match_previous_node_by_type::<T, F>(functor)
}
