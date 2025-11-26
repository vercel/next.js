use std::hash::Hash;

use rustc_hash::FxHashSet;

use super::VisitedNodes;

/// A graph store is a data structure that will be built up during a graph
/// traversal. It is used to store the results of the traversal.
pub trait GraphStore: Send {
    type Node: Send;
    type Handle: Clone + Send;

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
/// visited.
///
/// This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a node can have more than one incoming edge).
#[derive(Debug)]
pub struct SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
{
    store: StoreImpl,
    visited: FxHashSet<StoreImpl::Node>,
}

impl<StoreImpl> SkipDuplicates<StoreImpl>
where
    StoreImpl: GraphStore,
{
    pub fn new(store: StoreImpl) -> Self {
        Self {
            store,
            visited: FxHashSet::default(),
        }
    }

    pub fn new_with_visited_nodes(store: StoreImpl, visited: FxHashSet<StoreImpl::Node>) -> Self {
        Self { store, visited }
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

    /// Consumes the wrapper and returns the underlying store along with the visited nodes.
    pub fn into_inner_with_visited(self) -> (StoreImpl, VisitedNodes<StoreImpl::Node>) {
        (self.store, VisitedNodes(self.visited))
    }
}

/// A [`GraphStore`] wrapper that skips nodes that have already been
/// visited, based on a key extracted from the node.
///
/// This is necessary to avoid repeated work when traversing non-tree
/// graphs (i.e. where a node can have more than one incoming edge).
#[derive(Debug)]
pub struct SkipDuplicatesWithKey<StoreImpl, Key, KeyExtractor>
where
    StoreImpl: GraphStore,
    Key: Send + Eq + Hash,
    KeyExtractor: Send + Fn(&StoreImpl::Node) -> &Key,
{
    store: StoreImpl,
    visited: FxHashSet<Key>,
    key_extractor: KeyExtractor,
}

impl<StoreImpl, Key, KeyExtractor> SkipDuplicatesWithKey<StoreImpl, Key, KeyExtractor>
where
    StoreImpl: GraphStore,
    Key: Send + Eq + std::hash::Hash + Clone,
    KeyExtractor: Send + Fn(&StoreImpl::Node) -> &Key,
{
    pub fn new(store: StoreImpl, key_extractor: KeyExtractor) -> Self {
        Self {
            store,
            visited: FxHashSet::default(),
            key_extractor,
        }
    }
}

impl<StoreImpl, Key, KeyExtractor> GraphStore
    for SkipDuplicatesWithKey<StoreImpl, Key, KeyExtractor>
where
    StoreImpl: GraphStore,
    StoreImpl::Node: Eq + std::hash::Hash + Clone,
    Key: Send + Eq + std::hash::Hash + Clone,
    KeyExtractor: Send + Fn(&StoreImpl::Node) -> &Key,
{
    type Node = StoreImpl::Node;
    type Handle = StoreImpl::Handle;

    fn insert(
        &mut self,
        from_handle: Option<Self::Handle>,
        node: GraphNode<StoreImpl::Node>,
    ) -> Option<(Self::Handle, &StoreImpl::Node)> {
        let key = (self.key_extractor)(node.node());

        if !self.visited.contains(key) {
            self.visited.insert(key.clone());
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

impl<StoreImpl, Key, KeyExtractor> SkipDuplicatesWithKey<StoreImpl, Key, KeyExtractor>
where
    StoreImpl: GraphStore,
    Key: Send + Eq + std::hash::Hash + Clone,
    KeyExtractor: Send + Fn(&StoreImpl::Node) -> &Key,
{
    /// Consumes the wrapper and returns the underlying store.
    pub fn into_inner(self) -> StoreImpl {
        self.store
    }

    /// Consumes the wrapper and returns the underlying store along with the visited nodes.
    pub fn into_inner_with_visited(self) -> (StoreImpl, VisitedNodes<Key>) {
        (self.store, VisitedNodes(self.visited))
    }
}
