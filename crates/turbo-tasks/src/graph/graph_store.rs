use std::collections::HashSet;

/// A graph store is a data structure that will be built up during a graph
/// traversal. It is used to store the results of the traversal.
pub trait GraphStore {
    type Node;
    type Handle: Clone;

    // TODO(alexkirsz) An `entry(from_handle) -> Entry` API would be more
    // efficient, as right now we're getting the same key multiple times.
    /// Inserts a node into the graph store, and returns a handle to it.
    ///
    /// If this method returns `None`, the node edges will not be visited.
    fn insert(
        &mut self,
        from_handle: Option<Self::Handle>,
        node: GraphNode<Self::Node>,
    ) -> Option<(Self::Handle, &Self::Node)>;
}

/// Utility type to ensure that GraphStore::insert can only ever be called from
/// within this module, as a GraphNode can't be constructed outside of it.
#[derive(Clone, Copy, Eq, PartialEq, Debug, Hash, Ord, PartialOrd)]
pub struct GraphNode<Node>(pub(super) Node);

impl<Node> GraphNode<Node> {
    /// Consumes this `GraphNode` and returns the underlying node.
    pub fn into_node(self) -> Node {
        self.0
    }

    /// Returns a reference the underlying node.
    pub fn node(&self) -> &Node {
        &self.0
    }

    /// Returns a mutable reference the underlying node.
    pub fn node_mut(&mut self) -> &mut Node {
        &mut self.0
    }
}

/// A [`GraphStore`] wrapper that skips nodes that have already been
/// visited. This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a node can have more than one incoming edge).
#[derive(Debug)]
pub struct SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
{
    store: StoreImpl,
    visited: HashSet<StoreImpl::Node>,
}

impl<StoreImpl> SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
{
    pub fn new(store: StoreImpl) -> Self {
        Self {
            store: store,
            visited: Default::default(),
        }
    }
}

impl<StoreImpl> GraphStore for SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
    StoreImpl::Node: Eq + std::hash::Hash + Clone,
{
    type Node = StoreImpl::Node;
    type Handle = StoreImpl::Handle;

    fn insert(
        &mut self,
        from_handle: Option<Self::Handle>,
        node: GraphNode<StoreImpl::Node>,
    ) -> Option<(Self::Handle, &StoreImpl::Node)> {
        if !self.visited.contains(node.node()) {
            self.visited.insert(node.node().clone());
            self.store.insert(from_handle, node)
        } else {
            // Always insert the node into the store, even if we've already
            // visited it. This is necessary to ensure that the store sees all
            // edges.
            self.store.insert(from_handle, node);
            None
        }
    }
}

impl<StoreImpl> SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
{
    /// Consumes the wrapper and returns the underlying store.
    pub fn into_inner(self) -> StoreImpl {
        self.store
    }
}
