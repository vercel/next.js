use std::future::Future;

use anyhow::Result;
use tracing::Span;

use super::VisitControlFlow;

/// A trait that allows a graph traversal to visit the edges of a node
/// transitively.
pub trait Visit<Node, Abort = !, Impl = ()> {
    type Edge;
    type EdgesIntoIter: IntoIterator<Item = Self::Edge>;
    type EdgesFuture: Future<Output = Result<Self::EdgesIntoIter>> + Send;

    /// Visits an edge to get to the neighbor node. Should return a
    /// [`VisitControlFlow`] that indicates whether to:
    /// * continue visiting the neighbor node edges;
    /// * skip visiting the neighbor node's edges;
    /// * abort the traversal entirely.
    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<Node, Abort>;

    /// Returns a future that resolves to the outgoing edges of the given `node`.
    ///
    /// Lifetimes:
    /// - The returned future's lifetime cannot depend on the reference to self because there are
    ///   multiple `edges` futures created and awaited concurrently.
    /// - The returned future's lifetime cannot depend on `node` because `GraphStore::insert`
    ///   returns a node reference that's only valid for the lifetime of its `&mut self` reference.
    fn edges(&mut self, node: &Node) -> Self::EdgesFuture;

    /// Returns a [Span] for the given `node`, under which all edges are
    /// processed.
    fn span(&mut self, node: &Node) -> Span {
        let _ = node;
        Span::current()
    }
}

// The different `Impl*` here are necessary in order to avoid the `Conflicting
// implementations of trait` error when implementing `Visit` on different
// kinds of `FnMut`.
// See https://users.rust-lang.org/t/conflicting-implementation-when-implementing-traits-for-fn/53359/3

pub struct ImplRef;

impl<Node, VisitFn, NeighFut, NeighIt> Visit<Node, !, ImplRef> for VisitFn
where
    VisitFn: FnMut(&Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = Node>,
{
    type Edge = Node;
    type EdgesIntoIter = NeighIt;
    type EdgesFuture = NeighFut;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<Node> {
        VisitControlFlow::Continue(edge)
    }

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        (self)(node)
    }
}

pub struct ImplValue;

impl<Node, VisitFn, NeighFut, NeighIt> Visit<Node, !, ImplValue> for VisitFn
where
    Node: Clone,
    VisitFn: FnMut(Node) -> NeighFut,
    NeighFut: Future<Output = Result<NeighIt>> + Send,
    NeighIt: IntoIterator<Item = Node>,
{
    type Edge = Node;
    type EdgesIntoIter = NeighIt;
    type EdgesFuture = NeighFut;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<Node> {
        VisitControlFlow::Continue(edge)
    }

    fn edges(&mut self, node: &Node) -> Self::EdgesFuture {
        (self)(node.clone())
    }
}
