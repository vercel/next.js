use std::{future::Future, iter::Map};

use anyhow::Result;
use tracing::Span;

use super::VisitControlFlow;

/// A trait that allows a graph traversal to visit the edges of a node
/// transitively.
pub trait Visit<Node, Edge = (), Impl = ()> {
    type EdgesIntoIter: IntoIterator<Item = (Node, Edge)>;
    type EdgesFuture: Future<Output = Result<Self::EdgesIntoIter>> + Send;

    /// Visits an edge. Should return a
    /// [`VisitControlFlow`] that indicates whether to:
    /// * continue visiting the neighbor node edges;
    /// * skip visiting the neighbor node's edges;
    /// * abort the traversal entirely.
    fn visit(&mut self, node: &Node, edge: Option<&Edge>) -> VisitControlFlow {
        let _ = node;
        let _ = edge;
        VisitControlFlow::Continue
    }

    /// Returns a future that resolves to the outgoing edges of the given `node`.
    ///
    /// Lifetimes:
    /// - The returned future's lifetime cannot depend on the reference to self because there are
    ///   multiple `edges` futures created and awaited concurrently.
    /// - The returned future's lifetime cannot depend on `node` because `GraphStore::insert`
    ///   returns a node reference that's only valid for the lifetime of its `&mut self` reference.
    fn edges(&mut self, node: &Node) -> Self::EdgesFuture;

    /// Returns a [Span] for the given `node`, under which all edges are processed.
    fn span(&mut self, _node: &Node, _edge: Option<&Edge>) -> Span {
        Span::none()
    }
}

// The different `Impl*` here are necessary in order to avoid the `Conflicting
// implementations of trait` error when implementing `Visit` on different
// kinds of `FnMut`.
// See https://users.rust-lang.org/t/conflicting-implementation-when-implementing-traits-for-fn/53359/3

pub struct ImplWithEdgeRef;

impl<Node, Edge, VisitFn, NeighFut, NeighIt> Visit<Node, Edge, ImplWithEdgeRef> for VisitFn
where
    VisitFn: FnMut(&Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = (Node, Edge)>,
{
    type EdgesIntoIter = NeighIt;
    type EdgesFuture = NeighFut;

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        (self)(node)
    }
}

pub struct ImplWithEdgeValue;

impl<Node, Edge, VisitFn, NeighFut, NeighIt> Visit<Node, Edge, ImplWithEdgeValue> for VisitFn
where
    Node: Clone,
    VisitFn: FnMut(Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = (Node, Edge)>,
{
    type EdgesIntoIter = NeighIt;
    type EdgesFuture = NeighFut;

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        (self)(node.clone())
    }
}

pub struct ImplRef;

impl<Node, VisitFn, NeighFut, NeighIt> Visit<Node, (), ImplRef> for VisitFn
where
    VisitFn: FnMut(&Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = Node>,
{
    type EdgesIntoIter = Map<NeighIt::IntoIter, fn(Node) -> (Node, ())>;
    type EdgesFuture = NoEdgeFuture<NeighFut>;

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        NoEdgeFuture((self)(node))
    }
}

pub struct ImplValue;

impl<Node, VisitFn, NeighFut, NeighIt> Visit<Node, (), ImplValue> for VisitFn
where
    Node: Clone,
    VisitFn: FnMut(Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = Node>,
{
    type EdgesIntoIter = Map<NeighIt::IntoIter, fn(Node) -> (Node, ())>;
    type EdgesFuture = NoEdgeFuture<NeighFut>;

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        NoEdgeFuture((self)(node.clone()))
    }
}

pub struct NoEdgeFuture<F>(F);

impl<F, Node, NeighIt> Future for NoEdgeFuture<F>
where
    F: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = Node>,
{
    type Output = Result<Map<NeighIt::IntoIter, fn(Node) -> (Node, ())>>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let future = unsafe { self.map_unchecked_mut(|s| &mut s.0) };
        future.poll(cx).map(|res| {
            res.map(|it| {
                fn map_fn<Node>(node: Node) -> (Node, ()) {
                    (node, ())
                }
                let f: fn(Node) -> (Node, ()) = map_fn;
                it.into_iter().map(f)
            })
        })
    }
}
