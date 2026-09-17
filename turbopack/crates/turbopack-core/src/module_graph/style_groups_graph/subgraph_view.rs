//! Read-only graph views used by the pure algorithms in [`super::algorithm`].
//!
//! Those algorithms accept any type implementing [`ReadonlyGraph`], so they can run against a
//! `&DiGraph` directly, against a filtered view restricted to e.g. one SCC, or against a compact
//! adjacency snapshot — without cloning the underlying graph.
//!
//! - [`SubgraphView`] filters a [`petgraph::graph::DiGraph`] through a [`rustc_hash::FxHashSet`] of
//!   node indices, reading edges from the graph on every traversal.
//! - [`CsrGraph`] copies one component's adjacency into contiguous arrays up front. Repeated
//!   searches over a dense component are dominated by petgraph's linked-list edge traversal, so the
//!   flat layout is substantially faster; edges cut during the search are tombstoned rather than
//!   rebuilt.

use std::marker::PhantomData;

use petgraph::{
    Direction,
    graph::{DiGraph, NodeIndex},
};
use rustc_hash::FxHashSet;

/// Read-only view over a directed weighted graph. Implemented for `&DiGraph<N, u32>`,
/// [`SubgraphView`] and `&`[`CsrGraph`].
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
    #[cfg(test)]
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

/// A compact adjacency snapshot for one strongly connected component. Petgraph stores each
/// node's edges as a linked list; repeated shortest-path searches over a dense component spend
/// most of their time pointer-chasing through that list. This representation preserves the
/// iterator order while laying each node's neighbours out contiguously.
pub(super) struct CsrGraph {
    nodes: Vec<NodeIndex>,
    index_bound: usize,
    outgoing_offsets: Vec<usize>,
    outgoing: Vec<CsrEdge>,
    incoming_offsets: Vec<usize>,
    incoming: Vec<CsrEdge>,
    active: Vec<bool>,
}

#[derive(Clone, Copy)]
struct CsrEdge {
    node: NodeIndex,
    weight: u32,
    active_index: usize,
}

impl CsrGraph {
    pub(super) fn new<N>(graph: &DiGraph<N, u32>, subset: &FxHashSet<NodeIndex>) -> Self {
        let index_bound = graph.node_count();
        let nodes: Vec<_> = subset.iter().copied().collect();
        let mut membership = vec![false; index_bound];
        for &node in &nodes {
            membership[node.index()] = true;
        }

        let mut outgoing_offsets = vec![0; index_bound + 1];
        let mut outgoing = Vec::new();
        let mut edge_to_active = vec![usize::MAX; graph.edge_count()];
        for source_index in 0..index_bound {
            outgoing_offsets[source_index] = outgoing.len();
            if !membership[source_index] {
                continue;
            }
            let source = NodeIndex::new(source_index);
            let mut iter = graph
                .neighbors_directed(source, Direction::Outgoing)
                .detach();
            while let Some((edge, target)) = iter.next(graph) {
                if membership[target.index()] {
                    let active_index = outgoing.len();
                    edge_to_active[edge.index()] = active_index;
                    outgoing.push(CsrEdge {
                        node: target,
                        weight: graph[edge],
                        active_index,
                    });
                }
            }
        }
        outgoing_offsets[index_bound] = outgoing.len();

        let mut incoming_offsets = vec![0; index_bound + 1];
        let mut incoming = Vec::with_capacity(outgoing.len());
        for target_index in 0..index_bound {
            incoming_offsets[target_index] = incoming.len();
            if !membership[target_index] {
                continue;
            }
            let target = NodeIndex::new(target_index);
            let mut iter = graph
                .neighbors_directed(target, Direction::Incoming)
                .detach();
            while let Some((edge, source)) = iter.next(graph) {
                if membership[source.index()] {
                    incoming.push(CsrEdge {
                        node: source,
                        weight: graph[edge],
                        active_index: edge_to_active[edge.index()],
                    });
                }
            }
        }
        incoming_offsets[index_bound] = incoming.len();

        Self {
            nodes,
            index_bound,
            outgoing_offsets,
            incoming_offsets,
            active: vec![true; outgoing.len()],
            outgoing,
            incoming,
        }
    }

    /// Hide the first live edge matching `from → to`, mirroring `DiGraph::find_edge` followed by
    /// `remove_edge`. Incoming and outgoing views share the same activity bit.
    pub(super) fn remove_edge(&mut self, from: NodeIndex, to: NodeIndex) {
        let range = self.outgoing_offsets[from.index()]..self.outgoing_offsets[from.index() + 1];
        let edge = self.outgoing[range]
            .iter()
            .find(|edge| edge.node == to && self.active[edge.active_index])
            .expect("removed graph edge must exist in the adjacency snapshot");
        self.active[edge.active_index] = false;
    }

    fn outgoing_slice(&self, node: NodeIndex) -> &[CsrEdge] {
        &self.outgoing[self.outgoing_offsets[node.index()]..self.outgoing_offsets[node.index() + 1]]
    }

    fn incoming_slice(&self, node: NodeIndex) -> &[CsrEdge] {
        &self.incoming[self.incoming_offsets[node.index()]..self.incoming_offsets[node.index() + 1]]
    }
}

impl<'a> ReadonlyGraph<'a> for &'a CsrGraph {
    type NodesIter = std::iter::Copied<std::slice::Iter<'a, NodeIndex>>;
    type OutgoingIter = CsrNodes<'a>;
    type IncomingIter = CsrNodes<'a>;
    type OutgoingWithWeightIter = CsrEdges<'a>;
    type IncomingWithWeightIter = CsrEdges<'a>;

    fn nodes(self) -> Self::NodesIter {
        self.nodes.iter().copied()
    }
    fn node_count(self) -> usize {
        self.nodes.len()
    }
    fn index_bound(self) -> usize {
        self.index_bound
    }
    fn outgoing_edges(self, node: NodeIndex) -> Self::OutgoingIter {
        CsrNodes::new(self.outgoing_slice(node), &self.active)
    }
    fn outgoing_edges_with_weight(self, node: NodeIndex) -> Self::OutgoingWithWeightIter {
        CsrEdges::new(self.outgoing_slice(node), &self.active)
    }
    fn incoming_edges(self, node: NodeIndex) -> Self::IncomingIter {
        CsrNodes::new(self.incoming_slice(node), &self.active)
    }
    fn incoming_edges_with_weight(self, node: NodeIndex) -> Self::IncomingWithWeightIter {
        CsrEdges::new(self.incoming_slice(node), &self.active)
    }
}

pub(super) struct CsrEdges<'a> {
    edges: std::slice::Iter<'a, CsrEdge>,
    active: &'a [bool],
}

impl<'a> CsrEdges<'a> {
    fn new(edges: &'a [CsrEdge], active: &'a [bool]) -> Self {
        Self {
            edges: edges.iter(),
            active,
        }
    }
}

impl Iterator for CsrEdges<'_> {
    type Item = (NodeIndex, u32);
    fn next(&mut self) -> Option<Self::Item> {
        self.edges
            .find(|edge| self.active[edge.active_index])
            .map(|edge| (edge.node, edge.weight))
    }
}

pub(super) struct CsrNodes<'a>(CsrEdges<'a>);

impl<'a> CsrNodes<'a> {
    fn new(edges: &'a [CsrEdge], active: &'a [bool]) -> Self {
        Self(CsrEdges::new(edges, active))
    }
}

impl Iterator for CsrNodes<'_> {
    type Item = NodeIndex;
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(node, _)| node)
    }
}
