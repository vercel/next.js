use std::{collections::HashSet, future::Future, pin::Pin};

use anyhow::Result;
use futures::{stream::FuturesUnordered, Stream};

use super::{
    graph_store::{GraphNode, GraphStore},
    with_future::With,
    SkipDuplicates, Visit, VisitControlFlow,
};

/// A list of modules that were already visited and should be skipped (including their subgraphs).
#[derive(Clone, Default, Debug)]
pub struct VisitedNodes<T>(pub HashSet<T>);

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of outgoing edges.
///
/// The traversal is done in parallel, and the order of the nodes in the traversal
/// result is determined by the [`GraphStore`] parameter.
pub trait GraphTraversal: GraphStore + Sized {
    fn visit<RootEdgesIt, VisitImpl, Abort, Impl>(
        self,
        root_edges: RootEdgesIt,
        visit: VisitImpl,
    ) -> GraphTraversalFuture<Self, VisitImpl, Abort, Impl, VisitImpl::EdgesFuture>
    where
        VisitImpl: Visit<Self::Node, Abort, Impl>,
        RootEdgesIt: IntoIterator<Item = VisitImpl::Edge>;

    fn skip_duplicates(self) -> SkipDuplicates<Self>;
    fn skip_duplicates_with_visited_nodes(
        self,
        visited: VisitedNodes<Self::Node>,
    ) -> SkipDuplicates<Self>;
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
    ) -> GraphTraversalFuture<Self, VisitImpl, Abort, Impl, VisitImpl::EdgesFuture>
    where
        VisitImpl: Visit<Self::Node, Abort, Impl>,
        RootEdgesIt: IntoIterator<Item = VisitImpl::Edge>,
    {
        let futures = FuturesUnordered::new();
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
                _phantom: std::marker::PhantomData,
            }),
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
}

/// A future that resolves to a [`GraphStore`] containing the result of a graph
/// traversal.
pub struct GraphTraversalFuture<Store, VisitImpl, Abort, Impl, EdgesFuture>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
    EdgesFuture: Future,
{
    state: GraphTraversalState<Store, VisitImpl, Abort, Impl, EdgesFuture>,
}

#[derive(Default)]
enum GraphTraversalState<Store, VisitImpl, Abort, Impl, EdgesFuture>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
    EdgesFuture: Future,
{
    #[default]
    Completed,
    Aborted {
        abort: Abort,
    },
    Running(GraphTraversalRunningState<Store, VisitImpl, Abort, Impl, EdgesFuture>),
}

struct GraphTraversalRunningState<Store, VisitImpl, Abort, Impl, EdgesFuture>
where
    Store: GraphStore,
    VisitImpl: Visit<Store::Node, Abort, Impl>,
    EdgesFuture: Future,
{
    store: Store,
    // This should be VisitImpl::EdgesFuture, but this causes a bug in the Rust
    // compiler (see https://github.com/rust-lang/rust/issues/102211).
    // Instead, we pass the associated type as an additional generic parameter.
    futures: FuturesUnordered<With<EdgesFuture, Store::Handle>>,
    visit: VisitImpl,
    _phantom: std::marker::PhantomData<(Abort, Impl)>,
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

impl<Store, VisitImpl, Abort, Impl, EdgesFuture> Future
    for GraphTraversalFuture<Store, VisitImpl, Abort, Impl, EdgesFuture>
where
    Store: GraphStore,
    // The EdgesFuture bound is necessary to avoid the compiler bug mentioned
    // above.
    VisitImpl: Visit<Store::Node, Abort, Impl, EdgesFuture = EdgesFuture>,
    EdgesFuture: Future<Output = Result<VisitImpl::EdgesIntoIter>>,
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
                    std::task::Poll::Ready(Some((parent_handle, span, Ok(edges)))) => {
                        let _guard = span.enter();
                        for edge in edges {
                            match running.visit.visit(edge) {
                                VisitControlFlow::Continue(node) => {
                                    if let Some((node_handle, node_ref)) = running
                                        .store
                                        .insert(Some(parent_handle.clone()), GraphNode(node))
                                    {
                                        let span = running.visit.span(node_ref);
                                        running.futures.push(With::new(
                                            running.visit.edges(node_ref),
                                            span,
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
                    std::task::Poll::Ready(Some((_, _, Err(err)))) => {
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
