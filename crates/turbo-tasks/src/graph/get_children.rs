use std::{collections::HashSet, future::Future};

use anyhow::Result;

/// A trait that allows a graph traversal to get the children of a node.
pub trait GetChildren<T, A = ()> {
    type Children: IntoIterator<Item = T>;
    type Future: Future<Output = Result<Self::Children>>;

    fn get_children(&mut self, item: &T) -> Option<Self::Future>;
}

// The different `Impl*` here are necessary in order to avoid the `Conflicting
// implementations of trait` error when implementing `GetChildren` on different
// kinds of `FnMut`.
// See https://users.rust-lang.org/t/conflicting-implementation-when-implementing-traits-for-fn/53359/3

pub struct ImplRef;

impl<T, C, F, CI> GetChildren<T, ImplRef> for C
where
    C: FnMut(&T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type Future = F;

    fn get_children(&mut self, item: &T) -> Option<Self::Future> {
        Some((self)(item))
    }
}

pub struct ImplRefOption;

impl<T, C, F, CI> GetChildren<T, ImplRefOption> for C
where
    C: FnMut(&T) -> Option<F>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type Future = F;

    fn get_children(&mut self, item: &T) -> Option<Self::Future> {
        (self)(item)
    }
}

pub struct ImplValue;

impl<T, C, F, CI> GetChildren<T, ImplValue> for C
where
    T: Copy,
    C: FnMut(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type Future = F;

    fn get_children(&mut self, item: &T) -> Option<Self::Future> {
        Some((self)(*item))
    }
}

pub struct ImplValueOption;

impl<T, C, F, CI> GetChildren<T, ImplValueOption> for C
where
    T: Copy,
    C: FnMut(T) -> Option<F>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type Future = F;

    fn get_children(&mut self, item: &T) -> Option<Self::Future> {
        (self)(*item)
    }
}

/// A [`GetChildren`] implementation that skips nodes that have already been
/// visited. This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a child can have more than one parent).
#[derive(Debug)]
pub struct SkipDuplicates<T, C, A> {
    get_children: C,
    visited: HashSet<T>,
    _phantom: std::marker::PhantomData<A>,
}

impl<T, C, A> SkipDuplicates<T, C, A> {
    /// Create a new [`SkipDuplicates`] that wraps the given [`GetChildren`].
    pub fn new(get_children: C) -> Self {
        Self {
            get_children,
            visited: HashSet::new(),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<T, C, A> GetChildren<T> for SkipDuplicates<T, C, A>
where
    T: Eq + std::hash::Hash + Clone,
    C: GetChildren<T, A>,
{
    type Children = C::Children;
    type Future = C::Future;

    fn get_children(&mut self, item: &T) -> Option<Self::Future> {
        if !self.visited.contains(item) {
            self.visited.insert(item.clone());
            self.get_children.get_children(item)
        } else {
            None
        }
    }
}
