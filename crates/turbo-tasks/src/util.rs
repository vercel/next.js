use std::fmt::Display;
use std::sync::Arc;
use std::{future::Future, pin::Pin, task::Poll};

use anyhow::Error;

pub use super::id_factory::IdFactory;
pub use super::infinite_vec::InfiniteVec;
pub use super::no_move_vec::NoMoveVec;

/// A error struct that is backed by an Arc to allow cloning errors
#[derive(Debug, Clone)]
pub struct SharedError {
    inner: Arc<Error>,
}

impl SharedError {
    pub fn new(err: Error) -> Self {
        Self {
            inner: Arc::new(err),
        }
    }
}

impl std::error::Error for SharedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.inner.source()
    }

    fn backtrace(&self) -> Option<&std::backtrace::Backtrace> {
        Some(self.inner.backtrace())
    }
}

impl Display for SharedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&*self.inner, f)
    }
}

pub enum MaybeDoneFuture<T: Unpin, F: Future<Output = T> + Unpin, D: Unpin> {
    Future(F),
    Done(D),
}

pub fn join_all<T: Unpin, F: Future<Output = T> + Unpin>(
    futures: impl Iterator<Item = F>,
) -> impl Future<Output = Vec<T>> {
    JoinAll {
        futures: futures.map(MaybeDoneFuture::Future).collect(),
    }
}

struct JoinAll<T: Unpin, F: Future<Output = T> + Unpin> {
    futures: Vec<MaybeDoneFuture<T, F, T>>,
}

impl<T: Unpin, F: Future<Output = T> + Unpin> Future for JoinAll<T, F> {
    type Output = Vec<T>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let this = &mut *self;
        let mut is_pending = false;
        for future in this.futures.iter_mut() {
            match future {
                MaybeDoneFuture::Future(ref mut f) => match Pin::new(f).poll(cx) {
                    Poll::Pending => {
                        is_pending = true;
                    }
                    Poll::Ready(result) => {
                        *future = MaybeDoneFuture::Done(result);
                    }
                },
                MaybeDoneFuture::Done(_) => {}
            }
        }
        if !is_pending {
            Poll::Ready(
                this.futures
                    .drain(..)
                    .map(|future| match future {
                        MaybeDoneFuture::Future(_) => unreachable!(),
                        MaybeDoneFuture::Done(r) => r,
                    })
                    .collect(),
            )
        } else {
            Poll::Pending
        }
    }
}

pub fn try_join_all<T: Unpin, E: Unpin, F: Future<Output = Result<T, E>>>(
    futures: impl Iterator<Item = F>,
) -> impl Future<Output = Result<Vec<T>, E>> {
    TryJoinAll {
        futures: futures
            .map(|f| Box::pin(f))
            .map(MaybeDoneFuture::Future)
            .collect(),
    }
}

struct TryJoinAll<T: Unpin, E: Unpin, F: Future<Output = Result<T, E>> + Unpin> {
    futures: Vec<MaybeDoneFuture<Result<T, E>, F, T>>,
}

impl<T: Unpin, E: Unpin, F: Future<Output = Result<T, E>> + Unpin> Future for TryJoinAll<T, E, F> {
    type Output = Result<Vec<T>, E>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        let this = &mut *self;
        let mut is_pending = false;
        for future in this.futures.iter_mut() {
            match future {
                MaybeDoneFuture::Future(ref mut f) => match Pin::new(f).poll(cx) {
                    Poll::Pending => {
                        is_pending = true;
                    }
                    Poll::Ready(result) => match result {
                        Ok(result) => {
                            *future = MaybeDoneFuture::Done(result);
                        }
                        Err(err) => return Poll::Ready(Err(err)),
                    },
                },
                MaybeDoneFuture::Done(_) => {}
            }
        }
        if !is_pending {
            Poll::Ready(Ok(this
                .futures
                .drain(..)
                .map(|future| match future {
                    MaybeDoneFuture::Future(_) => unreachable!(),
                    MaybeDoneFuture::Done(r) => r,
                })
                .collect()))
        } else {
            Poll::Pending
        }
    }
}
