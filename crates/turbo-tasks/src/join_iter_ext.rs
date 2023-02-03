use std::{
    future::{Future, IntoFuture},
    hash::Hash,
    mem::take,
    pin::Pin,
    task::ready,
};

use anyhow::Result;
use futures::{
    future::{join_all, JoinAll},
    stream::FuturesOrdered,
    FutureExt, Stream,
};
use indexmap::IndexSet;

/// Future for the [JoinIterExt::join] method.
pub struct Join<F>
where
    F: Future,
{
    inner: JoinAll<F>,
}

impl<T, F> Future for Join<F>
where
    T: Unpin,
    F: Future<Output = T>,
{
    type Output = Vec<T>;

    fn poll(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.inner.poll_unpin(cx)
    }
}

/// Future for the [TryJoinIterExt::try_join] method.
pub struct TryJoin<F>
where
    F: Future,
{
    inner: JoinAll<F>,
}

impl<T, F> Future for TryJoin<F>
where
    T: Unpin,
    F: Future<Output = Result<T>>,
{
    type Output = Result<Vec<T>>;

    fn poll(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        match self.inner.poll_unpin(cx) {
            std::task::Poll::Ready(res) => {
                std::task::Poll::Ready(res.into_iter().collect::<Result<Vec<_>>>())
            }
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

pub struct TryFlatMapRecursiveJoin<T, C, F, CI>
where
    T: Hash + PartialEq + Eq + Clone,
    C: Fn(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    set: IndexSet<T>,
    futures: FuturesOrdered<F>,
    get_children: C,
}

impl<T, C, F, CI> Future for TryFlatMapRecursiveJoin<T, C, F, CI>
where
    T: Hash + PartialEq + Eq + Clone,
    C: Fn(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    type Output = Result<IndexSet<T>>;
    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = unsafe { self.get_unchecked_mut() };
        loop {
            let futures = unsafe { Pin::new_unchecked(&mut this.futures) };
            if let Some(result) = ready!(futures.poll_next(cx)) {
                match result {
                    Ok(children) => {
                        for item in children {
                            let (index, new) = this.set.insert_full(item);
                            if new {
                                this.futures
                                    .push_back((this.get_children)(this.set[index].clone()));
                            }
                        }
                    }
                    Err(err) => return std::task::Poll::Ready(Err(err)),
                }
            } else {
                return std::task::Poll::Ready(Ok(take(&mut this.set)));
            }
        }
    }
}

pub trait JoinIterExt<T, F>: Iterator
where
    T: Unpin,
    F: Future<Output = T>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator.
    fn join(self) -> Join<F>;
}

pub trait TryJoinIterExt<T, F>: Iterator
where
    T: Unpin,
    F: Future<Output = Result<T>>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator, or to an error if one of the futures fail.
    ///
    /// Unlike `Futures::future::try_join_all`, this returns the Error that
    /// occurs first in the list of futures, not the first to fail in time.
    fn try_join(self) -> TryJoin<F>;
}

pub trait TryFlatMapRecursiveJoinIterExt<T, C, F, CI>: Iterator
where
    T: Hash + PartialEq + Eq + Clone,
    C: Fn(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
{
    /// Applies the `get_children` function on each item in the iterator, and on
    /// each item that is returned by `get_children`. Collects all items from
    /// the iterator and all items returns by `get_children` into an index set.
    /// The order of items is equal to a breadth-first traversal of the tree,
    /// but `get_children` will execute concurrently. It will handle circular
    /// references gracefully. Returns a future that resolve to a
    /// [Result<IndexSet>]. It will resolve to the first error that occur in
    /// breadth-first order.
    fn try_flat_map_recursive_join(self, get_children: C) -> TryFlatMapRecursiveJoin<T, C, F, CI>;
}

impl<T, F, IF, It> JoinIterExt<T, F> for It
where
    T: Unpin,
    F: Future<Output = T>,
    IF: IntoFuture<Output = T, IntoFuture = F>,
    It: Iterator<Item = IF>,
{
    fn join(self) -> Join<F> {
        Join {
            inner: join_all(self.map(|f| f.into_future())),
        }
    }
}

impl<T, F, IF, It> TryJoinIterExt<T, F> for It
where
    T: Unpin,
    F: Future<Output = Result<T>>,
    IF: IntoFuture<Output = Result<T>, IntoFuture = F>,
    It: Iterator<Item = IF>,
{
    fn try_join(self) -> TryJoin<F> {
        TryJoin {
            inner: join_all(self.map(|f| f.into_future())),
        }
    }
}

impl<T, C, F, CI, It> TryFlatMapRecursiveJoinIterExt<T, C, F, CI> for It
where
    T: Hash + PartialEq + Eq + Clone,
    C: Fn(T) -> F,
    F: Future<Output = Result<CI>>,
    CI: IntoIterator<Item = T>,
    It: Iterator<Item = T>,
{
    fn try_flat_map_recursive_join(self, get_children: C) -> TryFlatMapRecursiveJoin<T, C, F, CI> {
        let mut set = IndexSet::new();
        let mut futures = FuturesOrdered::new();
        for item in self {
            let (index, new) = set.insert_full(item);
            if new {
                futures.push_back(get_children(set[index].clone()));
            }
        }
        TryFlatMapRecursiveJoin {
            set,
            futures,
            get_children,
        }
    }
}
