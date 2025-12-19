use std::hash::Hash;

use rustc_hash::FxHashSet;

use super::graph_store::GraphStore;

/// A graph traversal that does not guarantee any particular order, and may not
/// return the same order every time it is run.
pub struct NonDeterministic<T, E> {
    output: Vec<T>,
    visited: FxHashSet<T>,
    phantom: std::marker::PhantomData<E>,
}

impl<T, E> Default for NonDeterministic<T, E> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, E> NonDeterministic<T, E> {
    pub fn new() -> Self {
        Self {
            output: Vec::new(),
            visited: FxHashSet::default(),
            phantom: std::marker::PhantomData,
        }
    }
}

impl<T, E> GraphStore for NonDeterministic<T, E>
where
    T: Send + Hash + Eq + Clone,
    E: Send,
{
    type Node = T;
    type Edge = E;
    type Handle = ();

    fn insert(&mut self, _from: Option<(&(), E)>, node: T) {
        self.output.push(node);
    }

    fn try_enter(&mut self, node: &T) -> Option<()> {
        if self.visited.insert(node.clone()) {
            Some(())
        } else {
            None
        }
    }
}

impl<T, E> IntoIterator for NonDeterministic<T, E> {
    type Item = T;
    type IntoIter = <Vec<T> as IntoIterator>::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.output.into_iter()
    }
}
