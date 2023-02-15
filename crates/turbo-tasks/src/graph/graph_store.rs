/// A graph store is a data structure that will be built up during a graph
/// traversal. It is used to store the results of the traversal.
pub trait GraphStore<T>: Default {
    type Handle: Clone;

    // TODO(alexkirsz) An `entry(parent_handle) -> Entry` API would be more
    // efficient, as right now we're getting the same key multiple times.
    /// Inserts a node into the graph store, and returns a handle to it.
    fn insert(&mut self, parent_handle: Option<Self::Handle>, node: T) -> (Self::Handle, &T);
}
