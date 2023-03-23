use std::{future::Future, pin::Pin};

use anyhow::Result;
use futures::{stream::FuturesUnordered, Stream};

use super::{graph_store::GraphStore, with_future::With, Visit, VisitControlFlow};

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges. The
/// traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
pub struct GraphTraversal<Store> {
    _store: std::marker::PhantomData<Store>,
}

impl<Store> GraphTraversal<Store> {
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    pub fn visit<Node, RootEdgesIt, VisitImpl, Abort, Impl>(
        root_edges: RootEdgesIt,
        mut visit: VisitImpl,
    ) -> GraphTraversalFuture<Node, Store, VisitImpl, Abort, Impl>
    where
        Store: GraphStore<Node>,
        VisitImpl: Visit<Node, Abort, Impl>,
        RootEdgesIt: IntoIterator<Item = VisitImpl::Edge>,
    {
        let mut store = Store::default();
        let futures = FuturesUnordered::new();
        for edge in root_edges {
            match visit.visit(edge) {
                VisitControlFlow::Continue(node) => {
                    if let Some((parent_handle, node_ref)) = store.insert(None, node) {
                        futures.push(With::new(visit.edges(node_ref), parent_handle));
                    }
                }
                VisitControlFlow::Skip(node) => {
                    store.insert(None, node);
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
                store,
                futures,
                visit,
            }),
        }
    }
}

/// A future that resolves to a [`GraphStore`] containing the result of a graph
/// traversal.
pub struct GraphTraversalFuture<Node, Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore<Node>,
    VisitImpl: Visit<Node, Abort, Impl>,
{
    state: GraphTraversalState<Node, Store, VisitImpl, Abort, Impl>,
}

#[derive(Default)]
enum GraphTraversalState<Node, Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore<Node>,
    VisitImpl: Visit<Node, Abort, Impl>,
{
    #[default]
    Completed,
    Aborted {
        abort: Abort,
    },
    Running(GraphTraversalRunningState<Node, Store, VisitImpl, Abort, Impl>),
}

struct GraphTraversalRunningState<Node, Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore<Node>,
    VisitImpl: Visit<Node, Abort, Impl>,
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

impl<Node, Store, VisitImpl, Abort, Impl> Future
    for GraphTraversalFuture<Node, Store, VisitImpl, Abort, Impl>
where
    Store: GraphStore<Node>,
    VisitImpl: Visit<Node, Abort, Impl>,
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
                                    if let Some((node_handle, node_ref)) =
                                        running.store.insert(Some(parent_handle.clone()), node)
                                    {
                                        running.futures.push(With::new(
                                            running.visit.edges(node_ref),
                                            node_handle,
                                        ));
                                    }
                                }
                                VisitControlFlow::Skip(node) => {
                                    running.store.insert(Some(parent_handle.clone()), node);
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
