use std::{future::Future, pin::Pin};

use anyhow::Result;
use futures::{stream::FuturesUnordered, Stream};

use super::{graph_store::GraphStore, with_future::With, Visit};

/// [`GraphTraversal`] is a utility type that can be used to traverse a graph of
/// nodes, where each node can have a variable number of children. The traversal
/// is done in parallel, and the order of the nodes in the traversal result is
/// determined by the [`GraphStore`] parameter.
pub struct GraphTraversal<S> {
    _store: std::marker::PhantomData<S>,
}

impl<S> GraphTraversal<S> {
    /// Visits the graph starting from the given `roots`, and returns a future
    /// that will resolve to the traversal result.
    pub fn visit<T, I, C, A, Impl>(roots: I, mut visit: C) -> GraphTraversalFuture<T, S, C, A, Impl>
    where
        S: GraphStore<T>,
        I: IntoIterator<Item = T>,
        C: Visit<T, A, Impl>,
    {
        let mut store = S::default();
        let futures = FuturesUnordered::new();
        for item in roots {
            let (parent_handle, item) = store.insert(None, item);
            match visit.get_children(item) {
                GraphTraversalControlFlow::Continue(future) => {
                    futures.push(With::new(future, parent_handle));
                }
                GraphTraversalControlFlow::Abort(abort) => {
                    return GraphTraversalFuture {
                        state: GraphTraversalState::Aborted { abort },
                    };
                }
                GraphTraversalControlFlow::Skip => {}
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
pub struct GraphTraversalFuture<T, S, C, A, Impl>
where
    S: GraphStore<T>,
    C: Visit<T, A, Impl>,
{
    state: GraphTraversalState<T, S, C, A, Impl>,
}

enum GraphTraversalState<T, S, C, A, Impl>
where
    S: GraphStore<T>,
    C: Visit<T, A, Impl>,
{
    Completed,
    Aborted { abort: A },
    Running(GraphTraversalRunningState<T, S, C, A, Impl>),
}

struct GraphTraversalRunningState<T, S, C, A, Impl>
where
    S: GraphStore<T>,
    C: Visit<T, A, Impl>,
{
    store: S,
    futures: FuturesUnordered<With<C::Future, S::Handle>>,
    visit: C,
}

impl<T, S, C, A, Impl> Default for GraphTraversalState<T, S, C, A, Impl>
where
    S: GraphStore<T>,
    C: Visit<T, A, Impl>,
{
    fn default() -> Self {
        GraphTraversalState::Completed
    }
}

pub enum GraphTraversalResult<R, A> {
    Completed(R),
    Aborted(A),
}

impl<R> GraphTraversalResult<R, !> {
    pub fn completed(self) -> R {
        match self {
            GraphTraversalResult::Completed(result) => result,
            GraphTraversalResult::Aborted(_) => unreachable!("the type parameter `A` is `!`"),
        }
    }
}

impl<T, S, C, A, Impl> Future for GraphTraversalFuture<T, S, C, A, Impl>
where
    S: GraphStore<T>,
    C: Visit<T, A, Impl>,
{
    type Output = GraphTraversalResult<Result<S>, A>;

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
                    std::task::Poll::Ready(Some((parent_handle, Ok(children)))) => {
                        match running.visit.map_children(children) {
                            GraphTraversalControlFlow::Continue(children) => {
                                for item in children {
                                    let (child_handle, item) =
                                        running.store.insert(Some(parent_handle.clone()), item);

                                    match running.visit.get_children(item) {
                                        GraphTraversalControlFlow::Continue(future) => {
                                            running.futures.push(With::new(future, child_handle));
                                        }
                                        GraphTraversalControlFlow::Skip => {}
                                        GraphTraversalControlFlow::Abort(abort) => {
                                            break 'outer (
                                                GraphTraversalState::Completed,
                                                std::task::Poll::Ready(
                                                    GraphTraversalResult::Aborted(abort),
                                                ),
                                            );
                                        }
                                    }
                                }
                            }
                            GraphTraversalControlFlow::Skip => {}
                            GraphTraversalControlFlow::Abort(abort) => {
                                break 'outer (
                                    GraphTraversalState::Completed,
                                    std::task::Poll::Ready(GraphTraversalResult::Aborted(abort)),
                                );
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

/// The control flow of a graph traversal.
pub enum GraphTraversalControlFlow<C, A = !> {
    /// The traversal should continue with the given future.
    Continue(C),
    /// The traversal should abort and return immediately.
    Abort(A),
    /// The traversal should skip the current node.
    Skip,
}

impl<C, A> GraphTraversalControlFlow<C, A> {
    /// Map the continue value of this control flow.
    pub fn map_continue<Map, Mapped>(self, mut map: Map) -> GraphTraversalControlFlow<Mapped, A>
    where
        Map: FnMut(C) -> Mapped,
    {
        match self {
            GraphTraversalControlFlow::Continue(future) => {
                GraphTraversalControlFlow::Continue(map(future))
            }
            GraphTraversalControlFlow::Abort(abort) => GraphTraversalControlFlow::Abort(abort),
            GraphTraversalControlFlow::Skip => GraphTraversalControlFlow::Skip,
        }
    }

    /// Map the abort value of this control flow.
    pub fn map_abort<Map, Mapped>(self, mut map: Map) -> GraphTraversalControlFlow<C, Mapped>
    where
        Map: FnMut(A) -> Mapped,
    {
        match self {
            GraphTraversalControlFlow::Continue(future) => {
                GraphTraversalControlFlow::Continue(future)
            }
            GraphTraversalControlFlow::Abort(abort) => GraphTraversalControlFlow::Abort(map(abort)),
            GraphTraversalControlFlow::Skip => GraphTraversalControlFlow::Skip,
        }
    }
}
