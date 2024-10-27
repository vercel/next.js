use std::{
    future::{Future, IntoFuture},
    pin::Pin,
    task::Poll,
};

use anyhow::Result;
use futures::{
    future::{join_all, JoinAll},
    FutureExt,
};
use pin_project_lite::pin_project;

pin_project! {
    /// Future for the [JoinIterExt::join] method.
    pub struct Join<F>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
    }
}

impl<T, F> Future for Join<F>
where
    F: Future<Output = T>,
{
    type Output = Vec<T>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.project().inner.poll(cx)
    }
}

pub trait JoinIterExt<T, F>: Iterator
where
    F: Future<Output = T>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator.
    fn join(self) -> Join<F>;
}

pin_project! {
    /// Future for the [TryJoinIterExt::try_join] method.
    #[must_use]
    pub struct TryJoin<F>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
    }
}

impl<T, F> Future for TryJoin<F>
where
    F: Future<Output = Result<T>>,
{
    type Output = Result<Vec<T>>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        match self.project().inner.poll_unpin(cx) {
            std::task::Poll::Ready(res) => {
                std::task::Poll::Ready(res.into_iter().collect::<Result<Vec<_>>>())
            }
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}

pub trait TryJoinIterExt<T, F>: Iterator
where
    F: Future<Output = Result<T>>,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator, or to an error if one of the futures fail.
    ///
    /// Unlike `Futures::future::try_join_all`, this returns the Error that
    /// occurs first in the list of futures, not the first to fail in time.
    fn try_join(self) -> TryJoin<F>;
}

impl<T, F, IF, It> JoinIterExt<T, F> for It
where
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

pin_project! {
    /// Future for the [TryFlatJoinIterExt::try_flat_join] method.
    pub struct TryFlatJoin<F>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
    }
}

impl<F, I, U> Future for TryFlatJoin<F>
where
    F: Future<Output = Result<I>>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    type Output = Result<Vec<U::Item>>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        match self.project().inner.poll_unpin(cx) {
            Poll::Ready(res) => {
                let mut v = Vec::new();
                for r in res {
                    v.extend(r?);
                }

                Poll::Ready(Ok(v))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

pub trait TryFlatJoinIterExt<F, I, U>: Iterator
where
    F: Future<Output = Result<I>>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    /// Returns a future that resolves to a vector of the outputs of the futures
    /// in the iterator, or to an error if one of the futures fail.
    ///
    /// It also flattens the result.
    ///
    /// Unlike `Futures::future::try_join_all`, this returns the Error that
    /// occurs first in the list of futures, not the first to fail in time.
    fn try_flat_join(self) -> TryFlatJoin<F>;
}

impl<F, IF, It, I, U> TryFlatJoinIterExt<F, I, U> for It
where
    F: Future<Output = Result<I>>,
    IF: IntoFuture<Output = Result<I>, IntoFuture = F>,
    It: Iterator<Item = IF>,
    I: IntoIterator<IntoIter = U, Item = U::Item>,
    U: Iterator,
{
    fn try_flat_join(self) -> TryFlatJoin<F> {
        TryFlatJoin {
            inner: join_all(self.map(|f| f.into_future())),
        }
    }
}
