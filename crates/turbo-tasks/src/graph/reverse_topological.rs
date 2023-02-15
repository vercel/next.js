use std::collections::{HashMap, HashSet};

use super::graph_store::GraphStore;

/// A graph traversal that returns nodes in reverse topological order.
pub struct ReverseTopological<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    adjacency_map: HashMap<T, Vec<T>>,
    roots: Vec<T>,
}

impl<T> Default for ReverseTopological<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    fn default() -> Self {
        Self {
            adjacency_map: HashMap::new(),
            roots: Vec::new(),
        }
    }
}

impl<T> GraphStore<T> for ReverseTopological<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    type Handle = T;

    fn insert(&mut self, parent: Option<T>, node: T) -> (Self::Handle, &T) {
        let vec = if let Some(parent) = parent {
            self.adjacency_map
                .entry(parent)
                .or_insert_with(|| Vec::with_capacity(1))
        } else {
            &mut self.roots
        };

        vec.push(node.clone());
        (node, vec.last().unwrap())
    }
}

#[derive(Debug)]
enum ReverseTopologicalPass {
    Pre,
    Post,
}

impl<T> IntoIterator for ReverseTopological<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    type Item = T;
    type IntoIter = ReverseTopologicalIntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        ReverseTopologicalIntoIter {
            adjacency_map: self.adjacency_map,
            stack: self
                .roots
                .into_iter()
                .map(|root| (ReverseTopologicalPass::Pre, root))
                .collect(),
            visited: HashSet::new(),
        }
    }
}

pub struct ReverseTopologicalIntoIter<T>
where
    T: Eq + std::hash::Hash + Clone,
{
    adjacency_map: HashMap<T, Vec<T>>,
    stack: Vec<(ReverseTopologicalPass, T)>,
    visited: HashSet<T>,
}

impl<T> Iterator for ReverseTopologicalIntoIter<T>
where
    T: Eq + std::hash::Hash + Clone,
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

                    let Some(children) = self.adjacency_map.get(&current) else {
                        break current;
                    };

                    self.stack.push((ReverseTopologicalPass::Post, current));
                    self.stack.extend(
                        children
                            .iter()
                            .map(|child| (ReverseTopologicalPass::Pre, child.clone())),
                    );
                }
            }
        };

        Some(current)
    }
}
