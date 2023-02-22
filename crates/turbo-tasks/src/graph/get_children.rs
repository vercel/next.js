use std::{collections::HashSet, future::Future};

use anyhow::Result;

use super::GraphTraversalControlFlow;

/// A trait that allows a graph traversal to get the children of a node.
pub trait Visit<T, A = !, Impl = ()> {
    type Children: IntoIterator;
    type MapChildren: IntoIterator<Item = T>;
    type Future: Future<Output = Result<Self::Children>>;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future, A>;
    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::MapChildren, A>;
}

// The different `Impl*` here are necessary in order to avoid the `Conflicting
// implementations of trait` error when implementing `GetChildren` on different
// kinds of `FnMut`.
// See https://users.rust-lang.org/t/conflicting-implementation-when-implementing-traits-for-fn/53359/3

pub struct ImplRef;

impl<T, C, F, CI> Visit<T, !, ImplRef> for C
where
    C: FnMut(&T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future> {
        GraphTraversalControlFlow::Continue((self)(item))
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children> {
        GraphTraversalControlFlow::Continue(children)
    }
}

pub struct ImplRefOption;

impl<T, C, F, CI> Visit<T, !, ImplRefOption> for C
where
    C: FnMut(&T) -> Option<F>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future> {
        match (self)(item) {
            Some(future) => GraphTraversalControlFlow::Continue(future),
            None => GraphTraversalControlFlow::Skip,
        }
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children> {
        GraphTraversalControlFlow::Continue(children)
    }
}

pub struct ImplRefControlFlow;

impl<T, C, F, CI, A> Visit<T, A, ImplRefControlFlow> for C
where
    T: Clone,
    C: FnMut(&T) -> GraphTraversalControlFlow<F, A>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future, A> {
        (self)(item)
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children, A> {
        GraphTraversalControlFlow::Continue(children)
    }
}

pub struct ImplValue;

impl<T, C, F, CI> Visit<T, !, ImplValue> for C
where
    T: Clone,
    C: FnMut(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future> {
        GraphTraversalControlFlow::Continue((self)(item.clone()))
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children, !> {
        GraphTraversalControlFlow::Continue(children)
    }
}

pub struct ImplValueOption;

impl<T, C, F, CI> Visit<T, !, ImplValueOption> for C
where
    T: Clone,
    C: FnMut(T) -> Option<F>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future> {
        match (self)(item.clone()) {
            Some(future) => GraphTraversalControlFlow::Continue(future),
            None => GraphTraversalControlFlow::Skip,
        }
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children, !> {
        GraphTraversalControlFlow::Continue(children)
    }
}

pub struct ImplValueControlFlow;

impl<T, C, F, CI, A> Visit<T, A, ImplValueControlFlow> for C
where
    T: Clone,
    C: FnMut(T) -> GraphTraversalControlFlow<F, A>,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Children = CI;
    type MapChildren = Self::Children;
    type Future = F;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future, A> {
        (self)(item.clone())
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::Children, A> {
        GraphTraversalControlFlow::Continue(children)
    }
}

/// A [`GetChildren`] implementation that skips nodes that have already been
/// visited. This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a child can have more than one parent).
#[derive(Debug)]
pub struct SkipDuplicates<T, C, A, Impl> {
    visit: C,
    visited: HashSet<T>,
    _a: std::marker::PhantomData<A>,
    _impl: std::marker::PhantomData<Impl>,
}

impl<T, C, A, Impl> SkipDuplicates<T, C, A, Impl> {
    /// Create a new [`SkipDuplicates`] that wraps the given [`GetChildren`].
    pub fn new(visit: C) -> Self {
        Self {
            visit,
            visited: HashSet::new(),
            _a: std::marker::PhantomData,
            _impl: std::marker::PhantomData,
        }
    }
}

impl<T, C, A, Impl> Visit<T, A, Impl> for SkipDuplicates<T, C, A, Impl>
where
    T: Eq + std::hash::Hash + Clone,
    C: Visit<T, A, Impl>,
{
    type Children = C::Children;
    type MapChildren = C::MapChildren;
    type Future = C::Future;

    fn get_children(&mut self, item: &T) -> GraphTraversalControlFlow<Self::Future, A> {
        if !self.visited.contains(item) {
            self.visited.insert(item.clone());
            self.visit.get_children(item)
        } else {
            GraphTraversalControlFlow::Skip
        }
    }

    fn map_children(
        &mut self,
        children: Self::Children,
    ) -> GraphTraversalControlFlow<Self::MapChildren, A> {
        self.visit.map_children(children)
    }
}
