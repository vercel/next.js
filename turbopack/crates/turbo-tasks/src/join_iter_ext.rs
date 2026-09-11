use std::{
    future::{Future, IntoFuture},
    marker::PhantomData,
    pin::Pin,
    task::Poll,
};

use anyhow::Result;
use futures::{
    FutureExt,
    future::{JoinAll, join_all},
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
    /// Future for the [TryJoinIterExt::try_join_collect] method.
    #[must_use]
    pub struct TryJoinCollect<F, C>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
        _collection: PhantomData<fn() -> C>,
    }
}

impl<T, F, C> Future for TryJoinCollect<F, C>
where
    F: Future<Output = Result<T>>,
    C: FromIterator<T>,
{
    type Output = Result<C>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        match self.project().inner.poll_unpin(cx) {
            // Collecting through the `Result` keeps the first error in *list* order, and lets the
            // target collection size itself from the iterator's (exact) size hint.
            std::task::Poll::Ready(res) => std::task::Poll::Ready(res.into_iter().collect()),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
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

    /// Like [`TryJoinIterExt::try_join`], but collects into any [`FromIterator`]
    /// collection instead of always allocating a [`Vec`].
    ///
    /// ```ignore
    /// let set: FxHashSet<_> = items.iter().map(read).try_join_collect().await?;
    /// let map: FxIndexMap<_, _> = pairs.iter().map(read).try_join_collect().await?;
    /// let small: SmallVec<[_; 4]> = items.iter().map(read).try_join_collect().await?;
    /// ```
    ///
    /// The collection type is usually inferred from the binding or the return
    /// type; annotate it (`try_join_collect::<FxHashSet<_>>()`) where it is not.
    fn try_join_collect<C>(self) -> TryJoinCollect<F, C>;
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

    fn try_join_collect<C>(self) -> TryJoinCollect<F, C> {
        TryJoinCollect {
            inner: join_all(self.map(|f| f.into_future())),
            _collection: PhantomData,
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

pin_project! {
    /// Future for the [TryFlatJoinIterExt::try_flat_join_collect] method.
    #[must_use]
    pub struct TryFlatJoinCollect<F, C>
    where
        F: Future,
    {
        #[pin]
        inner: JoinAll<F>,
        _collection: PhantomData<fn() -> C>,
    }
}

impl<F, I, C> Future for TryFlatJoinCollect<F, C>
where
    F: Future<Output = Result<I>>,
    I: IntoIterator,
    C: Default + Extend<I::Item>,
{
    type Output = Result<C>;

    fn poll(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        match self.project().inner.poll_unpin(cx) {
            Poll::Ready(res) => {
                // Unlike `try_join`, the flattened length isn't known up front, so this extends
                // incrementally rather than sizing the collection from a hint.
                let mut c = C::default();
                for r in res {
                    c.extend(r?);
                }
                Poll::Ready(Ok(c))
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

    /// Like [`TryFlatJoinIterExt::try_flat_join`], but collects into any
    /// `Default + Extend` collection instead of always allocating a [`Vec`].
    ///
    /// ```ignore
    /// let set: FxIndexSet<_> = items.iter().map(read).try_flat_join_collect().await?;
    /// ```
    fn try_flat_join_collect<C>(self) -> TryFlatJoinCollect<F, C>
    where
        C: Default + Extend<U::Item>;
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

    fn try_flat_join_collect<C>(self) -> TryFlatJoinCollect<F, C>
    where
        C: Default + Extend<U::Item>,
    {
        TryFlatJoinCollect {
            inner: join_all(self.map(|f| f.into_future())),
            _collection: PhantomData,
        }
    }
}
