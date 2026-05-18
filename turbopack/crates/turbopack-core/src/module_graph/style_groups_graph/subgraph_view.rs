//! `SubgraphView`: a borrow-only filtered view over a [`petgraph::graph::DiGraph`] driven by a
//! [`rustc_hash::FxHashSet`] of node indices.
//!
//! The PoC algorithms ([`super::algorithm`]) accept any type that implements [`ReadonlyGraph`].
//! That lets us pass either a `&DiGraph` directly or a `SubgraphView` restricted to e.g. one
//! SCC, without cloning the underlying graph.

use std::marker::PhantomData;

use petgraph::{
    Direction,
    graph::{DiGraph, NodeIndex},
};
use rustc_hash::FxHashSet;

/// Read-only view over a directed weighted graph. Implemented for `&DiGraph<N, u32>` and for
/// [`SubgraphView`].
#[allow(dead_code)] // Some methods are kept for symmetry with the JS PoC; not all are used yet.
pub(super) trait ReadonlyGraph<'a>: Copy {
    type NodesIter: Iterator<Item = NodeIndex>;
    type OutgoingIter: Iterator<Item = NodeIndex>;
    type IncomingIter: Iterator<Item = NodeIndex>;
    type OutgoingWithWeightIter: Iterator<Item = (NodeIndex, u32)>;
    type IncomingWithWeightIter: Iterator<Item = (NodeIndex, u32)>;

    fn nodes(self) -> Self::NodesIter;
    fn node_count(self) -> usize;
    /// Upper bound on `NodeIndex::index()` values returned by this view. Always equals the
    /// underlying [`DiGraph`]'s node count, regardless of any subset filtering. Useful for
    /// sizing scratch arrays keyed by node id.
    fn index_bound(self) -> usize;
    fn outgoing_edges(self, node: NodeIndex) -> Self::OutgoingIter;
    fn outgoing_edges_with_weight(self, node: NodeIndex) -> Self::OutgoingWithWeightIter;
    fn incoming_edges(self, node: NodeIndex) -> Self::IncomingIter;
    fn incoming_edges_with_weight(self, node: NodeIndex) -> Self::IncomingWithWeightIter;
}

impl<'a, N: 'a> ReadonlyGraph<'a> for &'a DiGraph<N, u32> {
    type NodesIter = petgraph::graph::NodeIndices<u32>;
    type OutgoingIter = petgraph::graph::Neighbors<'a, u32>;
    type IncomingIter = petgraph::graph::Neighbors<'a, u32>;
    type OutgoingWithWeightIter = NeighborsWithWeight<'a, N>;
    type IncomingWithWeightIter = NeighborsWithWeight<'a, N>;

    fn nodes(self) -> Self::NodesIter {
        self.node_indices()
    }
    fn node_count(self) -> usize {
        DiGraph::node_count(self)
    }
    fn index_bound(self) -> usize {
        DiGraph::node_count(self)
    }
    fn outgoing_edges(self, node: NodeIndex) -> Self::OutgoingIter {
        self.neighbors_directed(node, Direction::Outgoing)
    }
    fn outgoing_edges_with_weight(self, node: NodeIndex) -> Self::OutgoingWithWeightIter {
        NeighborsWithWeight {
            graph: self,
            iter: self.neighbors_directed(node, Direction::Outgoing).detach(),
            _n: PhantomData,
        }
    }
    fn incoming_edges(self, node: NodeIndex) -> Self::IncomingIter {
        self.neighbors_directed(node, Direction::Incoming)
    }
    fn incoming_edges_with_weight(self, node: NodeIndex) -> Self::IncomingWithWeightIter {
        NeighborsWithWeight {
            graph: self,
            iter: self.neighbors_directed(node, Direction::Incoming).detach(),
            _n: PhantomData,
        }
    }
}

/// Iterator over a node's neighbors plus the weight of each edge.
pub(super) struct NeighborsWithWeight<'a, N> {
    graph: &'a DiGraph<N, u32>,
    iter: petgraph::graph::WalkNeighbors<u32>,
    _n: PhantomData<N>,
}

impl<'a, N> Iterator for NeighborsWithWeight<'a, N> {
    type Item = (NodeIndex, u32);
    fn next(&mut self) -> Option<Self::Item> {
        let (edge, target) = self.iter.next(self.graph)?;
        Some((target, *self.graph.edge_weight(edge).unwrap()))
    }
}

/// A live view over `graph` restricted to the nodes in `subset`. Edges whose source or target
/// is outside the subset are filtered out on iteration.
pub(super) struct SubgraphView<'a, N> {
    graph: &'a DiGraph<N, u32>,
    subset: &'a FxHashSet<NodeIndex>,
}

impl<'a, N> SubgraphView<'a, N> {
    pub(super) fn new(graph: &'a DiGraph<N, u32>, subset: &'a FxHashSet<NodeIndex>) -> Self {
        Self { graph, subset }
    }
}

impl<'a, N> Clone for SubgraphView<'a, N> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<'a, N> Copy for SubgraphView<'a, N> {}

impl<'a, N: 'a> ReadonlyGraph<'a> for SubgraphView<'a, N> {
    type NodesIter = SubgraphNodes<'a>;
    type OutgoingIter = SubgraphNeighbors<'a, N>;
    type IncomingIter = SubgraphNeighbors<'a, N>;
    type OutgoingWithWeightIter = SubgraphNeighborsWithWeight<'a, N>;
    type IncomingWithWeightIter = SubgraphNeighborsWithWeight<'a, N>;

    fn nodes(self) -> Self::NodesIter {
        SubgraphNodes {
            iter: self.subset.iter(),
        }
    }
    fn node_count(self) -> usize {
        // Nodes are never removed from the graph, so every subset element is valid.
        self.subset.len()
    }
    fn index_bound(self) -> usize {
        self.graph.node_count()
    }
    fn outgoing_edges(self, node: NodeIndex) -> Self::OutgoingIter {
        SubgraphNeighbors {
            iter: if self.subset.contains(&node) {
                Some(self.graph.neighbors_directed(node, Direction::Outgoing))
            } else {
                None
            },
            subset: self.subset,
            _n: PhantomData,
        }
    }
    fn outgoing_edges_with_weight(self, node: NodeIndex) -> Self::OutgoingWithWeightIter {
        SubgraphNeighborsWithWeight {
            graph: self.graph,
            iter: if self.subset.contains(&node) {
                Some(
                    self.graph
                        .neighbors_directed(node, Direction::Outgoing)
                        .detach(),
                )
            } else {
                None
            },
            subset: self.subset,
            _n: PhantomData,
        }
    }
    fn incoming_edges(self, node: NodeIndex) -> Self::IncomingIter {
        SubgraphNeighbors {
            iter: if self.subset.contains(&node) {
                Some(self.graph.neighbors_directed(node, Direction::Incoming))
            } else {
                None
            },
            subset: self.subset,
            _n: PhantomData,
        }
    }
    fn incoming_edges_with_weight(self, node: NodeIndex) -> Self::IncomingWithWeightIter {
        SubgraphNeighborsWithWeight {
            graph: self.graph,
            iter: if self.subset.contains(&node) {
                Some(
                    self.graph
                        .neighbors_directed(node, Direction::Incoming)
                        .detach(),
                )
            } else {
                None
            },
            subset: self.subset,
            _n: PhantomData,
        }
    }
}

pub(super) struct SubgraphNodes<'a> {
    iter: std::collections::hash_set::Iter<'a, NodeIndex>,
}

impl<'a> Iterator for SubgraphNodes<'a> {
    type Item = NodeIndex;
    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next().copied()
    }
}

pub(super) struct SubgraphNeighbors<'a, N> {
    iter: Option<petgraph::graph::Neighbors<'a, u32>>,
    subset: &'a FxHashSet<NodeIndex>,
    _n: PhantomData<N>,
}

impl<'a, N> Iterator for SubgraphNeighbors<'a, N> {
    type Item = NodeIndex;
    fn next(&mut self) -> Option<Self::Item> {
        let it = self.iter.as_mut()?;
        it.by_ref().find(|n| self.subset.contains(n))
    }
}

pub(super) struct SubgraphNeighborsWithWeight<'a, N> {
    graph: &'a DiGraph<N, u32>,
    iter: Option<petgraph::graph::WalkNeighbors<u32>>,
    subset: &'a FxHashSet<NodeIndex>,
    _n: PhantomData<N>,
}

impl<'a, N> Iterator for SubgraphNeighborsWithWeight<'a, N> {
    type Item = (NodeIndex, u32);
    fn next(&mut self) -> Option<Self::Item> {
        let it = self.iter.as_mut()?;
        while let Some((edge, target)) = it.next(self.graph) {
            if self.subset.contains(&target) {
                return Some((target, *self.graph.edge_weight(edge).unwrap()));
            }
        }
        None
    }
}
