use std::{
    collections::{VecDeque, hash_map::Entry},
    hash::Hash,
};

use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks_macros::{TraceRawVcs, ValueDebugFormat};

use crate::{self as turbo_tasks, NonLocalValue, graph::graph_store::GraphStore};

/// A graph traversal that builds an adjacency map
#[derive(Debug, Clone, TraceRawVcs, ValueDebugFormat)]
pub struct AdjacencyMap<T, E> {
    adjacency_map: FxHashMap<T, Vec<(T, E)>>,
    roots: Vec<T>,
}

unsafe impl<T, E> NonLocalValue for AdjacencyMap<T, E>
where
    T: NonLocalValue,
    E: NonLocalValue,
{
}
impl<T, E> PartialEq for AdjacencyMap<T, E>
where
    T: Eq + Hash,
    E: Eq,
{
    fn eq(&self, other: &Self) -> bool {
        self.adjacency_map == other.adjacency_map && self.roots == other.roots
    }
}

impl<T, E> Eq for AdjacencyMap<T, E>
where
    T: Eq + Hash,
    E: Eq,
{
}

impl<T, E> Default for AdjacencyMap<T, E>
where
    T: Eq + Hash + Clone,
{
    fn default() -> Self {
        Self::new()
    }
}

impl<T, E> AdjacencyMap<T, E>
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
    pub fn get(&self, node: &T) -> Option<impl Iterator<Item = &(T, E)>> {
        self.adjacency_map.get(node).map(|vec| vec.iter())
    }

    /// Returns the number of nodes in the graph
    pub fn len(&self) -> usize {
        self.adjacency_map.len()
    }

    /// Returns true if the graph is empty
    pub fn is_empty(&self) -> bool {
        self.adjacency_map.is_empty()
    }
}

impl<T, E> GraphStore for AdjacencyMap<T, E>
where
    T: Eq + Hash + Clone + Send,
    E: Send,
{
    type Node = T;
    type Edge = E;
    type Handle = T;

    fn insert(&mut self, from: Option<(&T, E)>, node: T) {
        if let Some((from_node, edge)) = from {
            let vec = self
                .adjacency_map
                .entry(from_node.clone())
                .or_insert_with(|| Vec::with_capacity(1));
            vec.push((node, edge));
        } else {
            self.roots.push(node);
        };
    }

    fn try_enter(&mut self, node: &T) -> Option<T> {
        match self.adjacency_map.entry(node.clone()) {
            Entry::Occupied(_) => None,
            Entry::Vacant(e) => {
                e.insert(Vec::new());
                Some(node.clone())
            }
        }
    }
}

impl<T, E> AdjacencyMap<T, E>
where
    T: Eq + Hash + Clone,
{
    /// Returns an owned iterator over the nodes in postorder topological order,
    /// starting from the roots.
    pub fn into_postorder_topological(self) -> IntoPostorderTopologicalIter<T, E> {
        IntoPostorderTopologicalIter {
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
    pub fn into_breadth_first_edges(self) -> IntoBreadthFirstEdges<T, E> {
        IntoBreadthFirstEdges {
            adjacency_map: self.adjacency_map,
            queue: self.roots.into_iter().map(|root| (None, root)).collect(),
            expanded: FxHashSet::default(),
        }
    }

    /// Returns an iterator over the nodes in postorder topological order,
    /// starting from the roots.
    pub fn postorder_topological(&self) -> PostorderTopologicalIter<'_, T, E> {
        PostorderTopologicalIter {
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

    /// Returns an iterator over the nodes in postorder topological order,
    /// starting from the given node.
    pub fn postorder_topological_from_node<'graph>(
        &'graph self,
        node: &'graph T,
    ) -> PostorderTopologicalIter<'graph, T, E> {
        PostorderTopologicalIter {
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

/// An iterator over the nodes of a graph in postorder topological order, starting
/// from the roots.
pub struct IntoPostorderTopologicalIter<T, E>
where
    T: Eq + Hash + Clone,
{
    adjacency_map: FxHashMap<T, Vec<(T, E)>>,
    stack: Vec<(ReverseTopologicalPass, T)>,
    visited: FxHashSet<T>,
}

impl<T, E> Iterator for IntoPostorderTopologicalIter<T, E>
where
    T: Eq + Hash + Clone,
    E: Clone,
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
                            .map(|(neighbor, _)| (ReverseTopologicalPass::Pre, neighbor.clone())),
                    );
                }
            }
        };

        Some(current)
    }
}

pub struct IntoBreadthFirstEdges<T, E>
where
    T: Eq + std::hash::Hash + Clone,
{
    adjacency_map: FxHashMap<T, Vec<(T, E)>>,
    queue: VecDeque<(Option<(T, E)>, T)>,
    expanded: FxHashSet<T>,
}

impl<T, E> Iterator for IntoBreadthFirstEdges<T, E>
where
    T: Eq + std::hash::Hash + Clone,
    E: Clone,
{
    type Item = (Option<(T, E)>, T);

    fn next(&mut self) -> Option<Self::Item> {
        let (parent, current) = self.queue.pop_front()?;

        let Some(neighbors) = self.adjacency_map.get(&current) else {
            return Some((parent, current));
        };

        if self.expanded.insert(current.clone()) {
            self.queue.extend(
                neighbors.iter().map(|(neighbor, edge)| {
                    (Some((current.clone(), edge.clone())), neighbor.clone())
                }),
            );
        }

        Some((parent, current))
    }
}

/// An iterator over the nodes of a graph in postorder topological order, starting
/// from the roots.
pub struct PostorderTopologicalIter<'graph, T, E>
where
    T: Eq + Hash + Clone,
{
    adjacency_map: &'graph FxHashMap<T, Vec<(T, E)>>,
    stack: Vec<(ReverseTopologicalPass, &'graph T)>,
    visited: FxHashSet<&'graph T>,
}

impl<'graph, T, E> Iterator for PostorderTopologicalIter<'graph, T, E>
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
                            .map(|(neighbor, _)| (ReverseTopologicalPass::Pre, neighbor)),
                    );
                }
            }
        };

        Some(current)
    }
}
