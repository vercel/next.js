use std::{collections::VecDeque, hash::Hash};

use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use turbo_tasks_macros::{TraceRawVcs, ValueDebugFormat};

use super::graph_store::{GraphNode, GraphStore};
use crate::{self as turbo_tasks, NonLocalValue};

/// A graph traversal that builds an adjacency map
#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat)]
#[serde(bound(
    serialize = "T: Serialize + Eq + Hash",
    deserialize = "T: Deserialize<'de> + Eq + Hash"
))]
pub struct AdjacencyMap<T> {
    adjacency_map: FxHashMap<T, Vec<T>>,
    roots: Vec<T>,
}

unsafe impl<T> NonLocalValue for AdjacencyMap<T> where T: NonLocalValue {}

impl<T> PartialEq for AdjacencyMap<T>
where
    T: Eq + Hash,
{
    fn eq(&self, other: &Self) -> bool {
        self.adjacency_map == other.adjacency_map && self.roots == other.roots
    }
}

impl<T> Eq for AdjacencyMap<T> where T: Eq + Hash {}

impl<T> Default for AdjacencyMap<T>
where
    T: Eq + Hash + Clone,
{
    fn default() -> Self {
        Self::new()
    }
}

impl<T> AdjacencyMap<T>
where
    T: Eq + Hash + Clone,
{
    /// Creates a new adjacency map
    pub fn new() -> Self {
        Self {
            adjacency_map: FxHashMap::default(),
            roots: Vec::new(),
        }
    }

    /// Returns an iterator over the root nodes of the graph
    pub fn roots(&self) -> impl Iterator<Item = &T> {
        self.roots.iter()
    }

    /// Returns an iterator over the children of the given node
    pub fn get(&self, node: &T) -> Option<impl Iterator<Item = &T>> {
        self.adjacency_map.get(node).map(|vec| vec.iter())
    }
}

impl<T> GraphStore for AdjacencyMap<T>
where
    T: Eq + Hash + Clone + Send,
{
    type Node = T;
    type Handle = T;

    fn insert(&mut self, from_handle: Option<T>, node: GraphNode<T>) -> Option<(Self::Handle, &T)> {
        let vec = if let Some(from_handle) = from_handle {
            self.adjacency_map
                .entry(from_handle)
                .or_insert_with(|| Vec::with_capacity(1))
        } else {
            &mut self.roots
        };

        vec.push(node.node().clone());
        Some((node.into_node(), vec.last().unwrap()))
    }
}

impl<T> AdjacencyMap<T>
where
    T: Eq + Hash + Clone,
{
    /// Returns an owned iterator over the nodes in reverse topological order,
    /// starting from the roots.
    pub fn into_reverse_topological(self) -> IntoReverseTopologicalIter<T> {
        IntoReverseTopologicalIter {
            adjacency_map: self.adjacency_map,
            stack: self
                .roots
                .into_iter()
                .rev()
                .map(|root| (ReverseTopologicalPass::Pre, root))
                .collect(),
            visited: FxHashSet::default(),
        }
    }

    /// Returns an owned iterator over all edges (node pairs) in reverse breadth first order,
    /// starting from the roots.
    pub fn into_breadth_first_edges(self) -> IntoBreadthFirstEdges<T> {
        IntoBreadthFirstEdges {
            adjacency_map: self.adjacency_map,
            stack: self
                .roots
                .into_iter()
                .rev()
                .map(|root| (None, root))
                .collect(),
            expanded: FxHashSet::default(),
        }
    }

    /// Returns an iterator over the nodes in reverse topological order,
    /// starting from the roots.
    pub fn reverse_topological(&self) -> ReverseTopologicalIter<T> {
        ReverseTopologicalIter {
            adjacency_map: &self.adjacency_map,
            stack: self
                .roots
                .iter()
                .rev()
                .map(|root| (ReverseTopologicalPass::Pre, root))
                .collect(),
            visited: FxHashSet::default(),
        }
    }

    /// Returns an iterator over the nodes in reverse topological order,
    /// starting from the given node.
    pub fn reverse_topological_from_node<'graph>(
        &'graph self,
        node: &'graph T,
    ) -> ReverseTopologicalIter<'graph, T> {
        ReverseTopologicalIter {
            adjacency_map: &self.adjacency_map,
            stack: vec![(ReverseTopologicalPass::Pre, node)],
            visited: FxHashSet::default(),
        }
    }
}

#[derive(Debug)]
enum ReverseTopologicalPass {
    Pre,
    Post,
}

/// An iterator over the nodes of a graph in reverse topological order, starting
/// from the roots.
pub struct IntoReverseTopologicalIter<T>
where
    T: Eq + Hash + Clone,
{
    adjacency_map: FxHashMap<T, Vec<T>>,
    stack: Vec<(ReverseTopologicalPass, T)>,
    visited: FxHashSet<T>,
}

impl<T> Iterator for IntoReverseTopologicalIter<T>
where
    T: Eq + Hash + Clone,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        let current = loop {
            let (pass, current) = self.stack.pop()?;

            match pass {
                ReverseTopologicalPass::Post => {
                    break current;
                }
                ReverseTopologicalPass::Pre => {
                    if self.visited.contains(&current) {
                        continue;
                    }

                    self.visited.insert(current.clone());

                    let Some(neighbors) = self.adjacency_map.get(&current) else {
                        break current;
                    };

                    self.stack.push((ReverseTopologicalPass::Post, current));
                    self.stack.extend(
                        neighbors
                            .iter()
                            .rev()
                            .map(|neighbor| (ReverseTopologicalPass::Pre, neighbor.clone())),
                    );
                }
            }
        };

        Some(current)
    }
}

pub struct IntoBreadthFirstEdges<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    adjacency_map: FxHashMap<T, Vec<T>>,
    stack: VecDeque<(Option<T>, T)>,
    expanded: FxHashSet<T>,
}

impl<T> Iterator for IntoBreadthFirstEdges<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    type Item = (Option<T>, T);

    fn next(&mut self) -> Option<Self::Item> {
        let (parent, current) = self.stack.pop_front()?;

        let Some(neighbors) = self.adjacency_map.get(&current) else {
            return Some((parent, current));
        };

        if self.expanded.insert(current.clone()) {
            self.stack.extend(
                neighbors
                    .iter()
                    .map(|neighbor| (Some(current.clone()), neighbor.clone())),
            );
        }

        Some((parent, current))
    }
}

/// An iterator over the nodes of a graph in reverse topological order, starting
/// from the roots.
pub struct ReverseTopologicalIter<'graph, T>
where
    T: Eq + Hash + Clone,
{
    adjacency_map: &'graph FxHashMap<T, Vec<T>>,
    stack: Vec<(ReverseTopologicalPass, &'graph T)>,
    visited: FxHashSet<&'graph T>,
}

impl<'graph, T> Iterator for ReverseTopologicalIter<'graph, T>
where
    T: Eq + Hash + Clone,
{
    type Item = &'graph T;

    fn next(&mut self) -> Option<Self::Item> {
        let current = loop {
            let (pass, current) = self.stack.pop()?;

            match pass {
                ReverseTopologicalPass::Post => {
                    break current;
                }
                ReverseTopologicalPass::Pre => {
                    if self.visited.contains(current) {
                        continue;
                    }

                    self.visited.insert(current);

                    let Some(neighbors) = self.adjacency_map.get(current) else {
                        break current;
                    };

                    self.stack.push((ReverseTopologicalPass::Post, current));
                    self.stack.extend(
                        neighbors
                            .iter()
                            .rev()
                            .map(|neighbor| (ReverseTopologicalPass::Pre, neighbor)),
                    );
                }
            }
        };

        Some(current)
    }
}
