use std::future::{Future, IntoFuture};

use anyhow::Result;
use futures::{
    future::{join_all, JoinAll},
    FutureExt,
};

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
