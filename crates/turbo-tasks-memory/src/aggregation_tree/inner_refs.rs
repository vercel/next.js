use std::{
    hash::{Hash, Hasher},
    sync::Arc,
};

use nohash_hasher::IsEnabled;
use ref_cast::RefCast;

use super::{bottom_tree::BottomTree, top_tree::TopTree};

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum ChildLocation {
    // Left-most child
    Left,
    // Inner child, not left-most
    Inner,
}

/// A reference to a [TopTree].
#[derive(RefCast)]
#[repr(transparent)]
pub struct TopRef<T> {
    pub upper: Arc<TopTree<T>>,
}

impl<T> IsEnabled for TopRef<T> {}

impl<T> Hash for TopRef<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.upper).hash(state);
    }
}

impl<T> PartialEq for TopRef<T> {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.upper, &other.upper)
    }
}

impl<T> Eq for TopRef<T> {}

impl<T> Clone for TopRef<T> {
    fn clone(&self) -> Self {
        Self {
            upper: self.upper.clone(),
        }
    }
}

/// A reference to a [BottomTree].
#[derive(RefCast)]
#[repr(transparent)]
pub struct BottomRef<T, I: IsEnabled> {
    pub upper: Arc<BottomTree<T, I>>,
}

impl<T, I: IsEnabled> Hash for BottomRef<T, I> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.upper).hash(state);
    }
}

impl<T, I: IsEnabled> IsEnabled for BottomRef<T, I> {}

impl<T, I: IsEnabled> PartialEq for BottomRef<T, I> {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.upper, &other.upper)
    }
}

impl<T, I: IsEnabled> Eq for BottomRef<T, I> {}

impl<T, I: IsEnabled> Clone for BottomRef<T, I> {
    fn clone(&self) -> Self {
        Self {
            upper: self.upper.clone(),
        }
    }
}
