use std::future::Future;

use anyhow::Result;
use futures::{StreamExt, stream::FuturesUnordered};
use rustc_hash::FxHashSet;

use super::{Visit, VisitControlFlow, graph_store::GraphStore, with_future::With};

/// A list of modules that were already visited and should be skipped (including their subgraphs).
#[derive(Clone, Default, Debug)]
pub struct VisitedNodes<T>(pub FxHashSet<T>);

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges.
///
/// The traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<VisitImpl, Impl>(
        self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>>> + Send
    where
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send,
        Impl: Send;
}

impl<Store> GraphTraversal for Store
where
    Store: GraphStore,
{
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    fn visit<VisitImpl, Impl>(
        mut self,
        root_nodes: impl IntoIterator<Item = Self::Node>,
        mut visit: VisitImpl,
    ) -> impl Future<Output = GraphTraversalResult<Result<Self>>> + Send
    where
        VisitImpl: Visit<Self::Node, Self::Edge, Impl> + Send,
        Impl: Send,
    {
        let mut futures = FuturesUnordered::new();
        let mut is_abort = false;

        // Populate `futures` with all the roots, `root_nodes` isn't required to be `Send`, so this
        // has to happen outside of the future. We could require `root_nodes` to be `Send` in the
        // future.
        for node in root_nodes {
            match visit.visit(&node, None) {
                VisitControlFlow::Continue => {
                    if let Some(handle) = self.try_enter(&node) {
                        let span = visit.span(&node, None);
                        futures.push(With::new(visit.edges(&node), span, handle));
                    }
                    self.insert(None, node);
                }
                VisitControlFlow::Skip => {
                    self.insert(None, node);
                }
                VisitControlFlow::Exclude => {
                    // do nothing
                }
                VisitControlFlow::Abort => {
                    // this must be returned inside the `async` block below so that it's part of the
                    // returned future
                    is_abort = true;
                }
            }
        }

        async move {
            if is_abort {
                return GraphTraversalResult::Aborted;
            }
            loop {
                match futures.next().await {
                    Some((parent_node, span, Ok(edges))) => {
                        let _guard = span.enter();
                        for (node, edge) in edges {
                            match visit.visit(&node, Some(&edge)) {
                                VisitControlFlow::Continue => {
                                    if let Some(handle) = self.try_enter(&node) {
                                        let span = visit.span(&node, Some(&edge));
                                        let edges_future = visit.edges(&node);
                                        futures.push(With::new(edges_future, span, handle));
                                    }
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Skip => {
                                    self.insert(Some((&parent_node, edge)), node);
                                }
                                VisitControlFlow::Exclude => {
                                    // do nothing
                                }
                                VisitControlFlow::Abort => {
                                    return GraphTraversalResult::Aborted;
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
}

pub enum GraphTraversalResult<Completed> {
    Completed(Completed),
    Aborted,
}

impl<Completed> GraphTraversalResult<Completed> {
    pub fn completed(self) -> Completed {
        match self {
            GraphTraversalResult::Completed(completed) => completed,
            GraphTraversalResult::Aborted => panic!("Graph traversal was aborted"),
        }
    }
}
