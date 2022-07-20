use std::{fmt::Display, future::Future, sync::Arc, time::Duration};

use anyhow::Error;
use futures::{
    stream::{Collect, FuturesUnordered, TryCollect},
    StreamExt, TryStreamExt,
};

pub use super::{
    id_factory::IdFactory, infinite_vec::InfiniteVec, no_move_vec::NoMoveVec, once_map::*,
};

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

impl From<Error> for SharedError {
    fn from(e: Error) -> Self {
        Self::new(e)
    }
}

pub fn join_all<T: Unpin, F: Future<Output = T> + Unpin>(
    futures: impl Iterator<Item = F>,
) -> Collect<FuturesUnordered<F>, Vec<T>> {
    futures.collect::<FuturesUnordered<F>>().collect()
}

pub fn try_join_all<T: Unpin, E: Unpin, F: Future<Output = Result<T, E>>>(
    futures: impl Iterator<Item = F>,
) -> TryCollect<FuturesUnordered<F>, Vec<T>> {
    futures.collect::<FuturesUnordered<F>>().try_collect()
}

pub struct FormatDuration(pub Duration);

impl Display for FormatDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = self.0.as_secs();
        if s > 10 {
            return write!(f, "{}s", s);
        }
        let ms = self.0.as_millis();
        if ms > 10 {
            return write!(f, "{}ms", ms);
        }
        write!(f, "{}ms", (self.0.as_micros() as f32) / 1000.0)
    }
}
