/// A graph store is a data structure that will be built up during a graph
/// traversal. It is used to store the results of the traversal.
pub trait GraphStore: Send {
    type Node: Send;
    type Edge: Send;
    type Handle: Send;

    // TODO(alexkirsz) An `entry(from_handle) -> Entry` API would be more
    // efficient, as right now we're getting the same key multiple times.
    /// Inserts a node into the graph store, and returns a handle to it.
    ///
    /// If this method returns `None`, the node edges will not be visited.
    fn insert(&mut self, from: Option<(&Self::Handle, Self::Edge)>, node: Self::Node);

    /// Tries to enter a node during traversal for visiting its edges.
    /// Returns `true` if the node edges should be visited.
    /// Returns `false` if the node has already been visited and should not be explored again.
    fn try_enter(&mut self, node: &Self::Node) -> Option<Self::Handle>;
}
