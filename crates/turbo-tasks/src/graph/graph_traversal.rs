use std::{future::Future, pin::Pin};

use anyhow::Result;
use futures::{stream::FuturesUnordered, Stream};

use super::{
    graph_store::{GraphNode, GraphStore},
    with_future::With,
    SkipDuplicates, Visit, VisitControlFlow,
};

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges. The
/// traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<RootEdgesIt, VisitImpl, Abort, Impl>(
        self,
        root_edges: RootEdgesIt,
        visit: VisitImpl,
    ) -> GraphTraversalFuture<Self, VisitImpl, Abort, Impl>
    where
        VisitImpl: Visit<Self::Node, Abort, Impl>,
        RootEdgesIt: IntoIterator<Item = VisitImpl::Edge>;

    fn skip_duplicates(self) -> SkipDuplicates<Self>;
}

impl<Store> GraphTraversal for Store
where
    Store: GraphStore,
{
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    fn visit<RootEdgesIt, VisitImpl, Abort, Impl>(
        mut self,
        root_edges: RootEdgesIt,
        mut visit: VisitImpl,
    ) -> GraphTraversalFuture<Self, VisitImpl, Abort, Impl>
    where
        VisitImpl: Visit<Self::Node, Abort, Impl>,
        RootEdgesIt: IntoIterator<Item = VisitImpl::Edge>,
    {
        let futures = FuturesUnordered::new();
        for edge in root_edges {
            match visit.visit(edge) {
                VisitControlFlow::Continue(node) => {
                    if let Some((parent_handle, node_ref)) = self.insert(None, GraphNode(node)) {
                        futures.push(With::new(visit.edges(node_ref), parent_handle));
                    }
                }
                VisitControlFlow::Skip(node) => {
                    self.insert(None, GraphNode(node));
                }
                VisitControlFlow::Abort(abort) => {
                    return GraphTraversalFuture {
                        state: GraphTraversalState::Aborted { abort },
                    };
                }
            }
        }
        GraphTraversalFuture {
            state: GraphTraversalState::Running(GraphTraversalRunningState {
                store: self,
                futures,
                visit,
            }),
        }
    }

    fn skip_duplicates(self) -> SkipDuplicates<Self> {
        SkipDuplicates::new(self)
    }
}

/// A future that resolves to a [`GraphStore`] containing the result of a graph
/// traversal.
pub struct GraphTraversalFuture<Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
{
    state: GraphTraversalState<Store, VisitImpl, Abort, Impl>,
}

#[derive(Default)]
enum GraphTraversalState<Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
{
    #[default]
    Completed,
    Aborted {
        abort: Abort,
    },
    Running(GraphTraversalRunningState<Store, VisitImpl, Abort, Impl>),
}

struct GraphTraversalRunningState<Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
{
    store: Store,
    futures: FuturesUnordered<With<VisitImpl::EdgesFuture, Store::Handle>>,
    visit: VisitImpl,
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

impl<Store, VisitImpl, Abort, Impl> Future for GraphTraversalFuture<Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
{
    type Output = GraphTraversalResult<Result<Store>, Abort>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };

        let result;
        (this.state, result) = match std::mem::take(&mut this.state) {
            GraphTraversalState::Completed => {
                panic!("polled after completion")
            }
            GraphTraversalState::Aborted { abort } => (
                GraphTraversalState::Completed,
                std::task::Poll::Ready(GraphTraversalResult::Aborted(abort)),
            ),
            GraphTraversalState::Running(mut running) => 'outer: loop {
                let futures_pin = unsafe { Pin::new_unchecked(&mut running.futures) };
                match futures_pin.poll_next(cx) {
                    std::task::Poll::Ready(Some((parent_handle, Ok(edges)))) => {
                        for edge in edges {
                            match running.visit.visit(edge) {
                                VisitControlFlow::Continue(node) => {
                                    if let Some((node_handle, node_ref)) = running
                                        .store
                                        .insert(Some(parent_handle.clone()), GraphNode(node))
                                    {
                                        running.futures.push(With::new(
                                            running.visit.edges(node_ref),
                                            node_handle,
                                        ));
                                    }
                                }
                                VisitControlFlow::Skip(node) => {
                                    running
                                        .store
                                        .insert(Some(parent_handle.clone()), GraphNode(node));
                                }
                                VisitControlFlow::Abort(abort) => {
                                    break 'outer (
                                        GraphTraversalState::Completed,
                                        std::task::Poll::Ready(GraphTraversalResult::Aborted(
                                            abort,
                                        )),
                                    );
                                }
                            }
                        }
                    }
                    std::task::Poll::Ready(Some((_, Err(err)))) => {
                        break (
                            GraphTraversalState::Completed,
                            std::task::Poll::Ready(GraphTraversalResult::Completed(Err(err))),
                        );
                    }
                    std::task::Poll::Ready(None) => {
                        break (
                            GraphTraversalState::Completed,
                            std::task::Poll::Ready(GraphTraversalResult::Completed(Ok(
                                running.store
                            ))),
                        );
                    }
                    std::task::Poll::Pending => {
                        break (
                            GraphTraversalState::Running(running),
                            std::task::Poll::Pending,
                        );
                    }
                }
            },
        };

        result
    }
}
