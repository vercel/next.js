use super::graph_store::{GraphNode, GraphStore};

/// A graph traversal that does not guarantee any particular order, and may not
/// return the same order every time it is run.
pub struct NonDeterministic<T> {
    output: Vec<T>,
}

impl<T> Default for NonDeterministic<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> NonDeterministic<T> {
    pub fn new() -> Self {
        Self { output: Vec::new() }
    }
}

impl<T> GraphStore for NonDeterministic<T>
where
    T: Send,
{
    type Node = T;
    type Handle = ();

    fn insert(
        &mut self,
        _from_handle: Option<Self::Handle>,
        node: GraphNode<T>,
    ) -> Option<(Self::Handle, &T)> {
        self.output.push(node.into_node());
        Some(((), self.output.last().unwrap()))
    }
}

impl<T> IntoIterator for NonDeterministic<T> {
    type Item = T;
    type IntoIter = <Vec<T> as IntoIterator>::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.output.into_iter()
    }
}
