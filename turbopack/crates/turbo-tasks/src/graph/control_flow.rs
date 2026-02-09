/// The control flow of visiting an edge during a graph traversal.
pub enum VisitControlFlow {
    /// The edge is included, and the traversal should continue on the outgoing edges of the given
    /// node.
    Continue,
    /// The edge is included, but the traversal should skip visiting the edges the given node.
    Skip,
    /// The edge is excluded, and the traversal should not continue on the outgoing edges of the
    /// given node.
    Exclude,
}
