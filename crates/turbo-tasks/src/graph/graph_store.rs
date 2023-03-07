use std::collections::HashSet;

/// A graph store is a data structure that will be built up during a graph
/// traversal. It is used to store the results of the traversal.
pub trait GraphStore<Node>: Default {
    type Handle: Clone;

    // TODO(alexkirsz) An `entry(from_handle) -> Entry` API would be more
    // efficient, as right now we're getting the same key multiple times.
    /// Inserts a node into the graph store, and returns a handle to it.
    ///
    /// If this method returns `None`, the node edges will not be visited.
    fn insert(
        &mut self,
        from_handle: Option<Self::Handle>,
        node: Node,
    ) -> Option<(Self::Handle, &Node)>;
}

/// A [`GraphStore`] wrapper that skips nodes that have already been
/// visited. This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a node can have more than one incoming edge).
#[derive(Debug)]
pub struct SkipDuplicates<StoreImpl, Node>
where
    StoreImpl: GraphStore<Node>,
{
    store: StoreImpl,
    visited: HashSet<Node>,
}

impl<StoreImpl, Node> Default for SkipDuplicates<StoreImpl, Node>
where
    StoreImpl: GraphStore<Node>,
{
    fn default() -> Self {
        Self {
            store: Default::default(),
            visited: Default::default(),
        }
    }
}

impl<StoreImpl, Node> GraphStore<Node> for SkipDuplicates<StoreImpl, Node>
where
    StoreImpl: GraphStore<Node>,
    Node: Eq + std::hash::Hash + Clone,
{
    type Handle = StoreImpl::Handle;

    fn insert(
        &mut self,
        from_handle: Option<Self::Handle>,
        node: Node,
    ) -> Option<(Self::Handle, &Node)> {
        if !self.visited.contains(&node) {
            self.visited.insert(node.clone());
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

impl<StoreImpl, Node> SkipDuplicates<StoreImpl, Node>
where
    StoreImpl: GraphStore<Node>,
{
    /// Consumes the wrapper and returns the underlying store.
    pub fn into_inner(self) -> StoreImpl {
        self.store
    }
}
