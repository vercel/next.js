use std::{future::Future, pin::Pin, task::ready};

use anyhow::Result;
use futures::{stream::FuturesUnordered, Stream};
use pin_project_lite::pin_project;

use super::{graph_store::GraphStore, GetChildren};

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
    pub fn visit<T, I, C, A>(roots: I, mut get_children: C) -> GraphTraversalFuture<T, S, C, A>
    where
        S: GraphStore<T>,
        I: IntoIterator<Item = T>,
        C: GetChildren<T, A>,
    {
        let mut store = S::default();
        let futures = FuturesUnordered::new();
        for item in roots {
            let (parent_handle, item) = store.insert(None, item);
            if let Some(future) = get_children.get_children(item) {
                futures.push(WithHandle::new(future, parent_handle));
            }
        }
        GraphTraversalFuture {
            store,
            futures,
            get_children,
        }
    }
}

/// A future that resolves to a [`GraphStore`] containing the result of a graph
/// traversal.
pub struct GraphTraversalFuture<T, S, C, A>
where
    S: GraphStore<T>,
    C: GetChildren<T, A>,
{
    store: S,
    futures: FuturesUnordered<WithHandle<C::Future, S::Handle>>,
    get_children: C,
}

impl<T, S, C, A> Future for GraphTraversalFuture<T, S, C, A>
where
    S: GraphStore<T>,
    C: GetChildren<T, A>,
{
    type Output = Result<S>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };
        loop {
            let futures = unsafe { Pin::new_unchecked(&mut this.futures) };
            if let Some((parent_handle, result)) = ready!(futures.poll_next(cx)) {
                match result {
                    Ok(children) => {
                        for item in children {
                            let (child_handle, item) =
                                this.store.insert(Some(parent_handle.clone()), item);

                            if let Some(future) = this.get_children.get_children(item) {
                                this.futures.push(WithHandle::new(future, child_handle));
                            }
                        }
                    }
                    Err(err) => return std::task::Poll::Ready(Err(err)),
                }
            } else {
                return std::task::Poll::Ready(Ok(std::mem::take(&mut this.store)));
            }
        }
    }
}

pin_project! {
    struct WithHandle<T, P>
    where
        T: Future,
    {
        #[pin]
        future: T,
        handle: Option<P>,
    }
}

impl<T, H> WithHandle<T, H>
where
    T: Future,
{
    pub fn new(future: T, handle: H) -> Self {
        Self {
            future,
            handle: Some(handle),
        }
    }
}

impl<T, H> Future for WithHandle<T, H>
where
    T: Future,
{
    type Output = (H, T::Output);

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = self.project();
        match this.future.poll(cx) {
            std::task::Poll::Ready(result) => std::task::Poll::Ready((
                this.handle.take().expect("polled after completion"),
                result,
            )),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}
