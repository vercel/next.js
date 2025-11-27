use std::future::Future;

use anyhow::Result;
use futures::{StreamExt, stream::FuturesUnordered};
use rustc_hash::FxHashSet;

use super::{
    SkipDuplicates, Visit, VisitControlFlow,
    graph_store::{GraphNode, GraphStore, SkipDuplicatesWithKey},
    with_future::With,
};

/// A list of modules that were already visited and should be skipped (including their subgraphs).
#[derive(Clone, Default, Debug)]
pub struct VisitedNodes<T>(pub FxHashSet<T>);

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges.
///
/// The traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<VisitImpl, Abort, Impl>(
        self,
        root_edges: impl IntoIterator<Item = VisitImpl::Edge>,
        visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>, Abort>> + Send
    where
        VisitImpl: Visit<Self::Node, Abort, Impl> + Send,
        Abort: Send,
        Impl: Send;

    fn skip_duplicates(self) -> SkipDuplicates<Self>;
    fn skip_duplicates_with_visited_nodes(
        self,
        visited: VisitedNodes<Self::Node>,
    ) -> SkipDuplicates<Self>;

    fn skip_duplicates_with_key<
        Key: Send + Eq + std::hash::Hash + Clone,
        KeyExtractor: Send + Fn(&Self::Node) -> &Key,
    >(
        self,
        key_extractor: KeyExtractor,
    ) -> SkipDuplicatesWithKey<Self, Key, KeyExtractor>;
}

impl<Store> GraphTraversal for Store
where
    Store: GraphStore,
{
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    fn visit<VisitImpl, Abort, Impl>(
        mut self,
        root_edges: impl IntoIterator<Item = VisitImpl::Edge>,
        mut visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>, Abort>> + Send
    where
        VisitImpl: Visit<Self::Node, Abort, Impl> + Send,
        Abort: Send,
        Impl: Send,
    {
        let mut futures = FuturesUnordered::new();
        let mut root_abort = None;

        // Populate `futures` with all the roots, `root_edges` isn't required to be `Send`, so this
        // has to happen outside of the future. We could require `root_edges` to be `Send` in the
        // future.
        for edge in root_edges {
            match visit.visit(edge) {
                VisitControlFlow::Continue(node) => {
                    if let Some((parent_handle, node_ref)) = self.insert(None, GraphNode(node)) {
                        let span = visit.span(node_ref);
                        futures.push(With::new(visit.edges(node_ref), span, parent_handle));
                    }
                }
                VisitControlFlow::Skip(node) => {
                    self.insert(None, GraphNode(node));
                }
                VisitControlFlow::Abort(abort) => {
                    // this must be returned inside the `async` block below so that it's part of the
                    // returned future
                    root_abort = Some(abort)
                }
            }
        }

        async move {
            if let Some(abort) = root_abort {
                return GraphTraversalResult::Aborted(abort);
            }
            loop {
                match futures.next().await {
                    Some((parent_handle, span, Ok(edges))) => {
                        let _guard = span.enter();
                        for edge in edges {
                            match visit.visit(edge) {
                                VisitControlFlow::Continue(node) => {
                                    if let Some((node_handle, node_ref)) =
                                        self.insert(Some(parent_handle.clone()), GraphNode(node))
                                    {
                                        let span = visit.span(node_ref);
                                        futures.push(With::new(
                                            visit.edges(node_ref),
                                            span,
                                            node_handle,
                                        ));
                                    }
                                }
                                VisitControlFlow::Skip(node) => {
                                    self.insert(Some(parent_handle.clone()), GraphNode(node));
                                }
                                VisitControlFlow::Abort(abort) => {
                                    return GraphTraversalResult::Aborted(abort);
                                }
                            }
                        }
                    }
                    Some((_, _, Err(err))) => {
                        return GraphTraversalResult::Completed(Err(err));
                    }
                    None => {
                        return GraphTraversalResult::Completed(Ok(self));
                    }
                }
            }
        }
    }

    fn skip_duplicates(self) -> SkipDuplicates<Self> {
        SkipDuplicates::new(self)
    }

    fn skip_duplicates_with_visited_nodes(
        self,
        visited: VisitedNodes<Store::Node>,
    ) -> SkipDuplicates<Self> {
        SkipDuplicates::new_with_visited_nodes(self, visited.0)
    }

    fn skip_duplicates_with_key<
        Key: Send + Eq + std::hash::Hash + Clone,
        KeyExtractor: Send + Fn(&Self::Node) -> &Key,
    >(
        self,
        key_extractor: KeyExtractor,
    ) -> SkipDuplicatesWithKey<Self, Key, KeyExtractor> {
        SkipDuplicatesWithKey::new(self, key_extractor)
    }
}

pub enum GraphTraversalResult<Completed, Aborted> {
    Completed(Completed),
    Aborted(Aborted),
}

impl<Completed> GraphTraversalResult<Completed, !> {
    pub fn completed(self) -> Completed {
        match self {
            GraphTraversalResult::Completed(completed) => completed,
            GraphTraversalResult::Aborted(_) => unreachable!("the type parameter `Aborted` is `!`"),
        }
    }
}
