use super::graph_store::GraphStore;

/// A graph traversal that does not guarantee any particular order, and may not
/// return the same order every time it is run.
pub struct NonDeterministic<T> {
    output: Vec<T>,
}

impl<T> Default for NonDeterministic<T> {
    fn default() -> Self {
        Self { output: Vec::new() }
    }
}

impl<T> GraphStore<T> for NonDeterministic<T> {
    type Handle = ();

    fn insert(&mut self, _parent_handle: Option<Self::Handle>, node: T) -> (Self::Handle, &T) {
        self.output.push(node);
        ((), self.output.last().unwrap())
    }
}

impl<T> IntoIterator for NonDeterministic<T> {
    type Item = T;
    type IntoIter = <Vec<T> as IntoIterator>::IntoIter;

    fn into_iter(self) -> Self::IntoIter {
        self.output.into_iter()
    }
}
