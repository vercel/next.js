use std::{
    error::Error as StdError,
    fmt::{Debug, Display},
    future::Future,
    hash::{Hash, Hasher},
    ops::Deref,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};

use anyhow::{anyhow, Error};
use pin_project_lite::pin_project;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub use super::{
    id_factory::{IdFactory, IdFactoryWithReuse},
    no_move_vec::NoMoveVec,
    once_map::*,
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

impl StdError for SharedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.inner.source()
    }

    fn provide<'a>(&'a self, req: &mut std::error::Request<'a>) {
        self.inner.provide(req);
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

impl PartialEq for SharedError {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.inner, &other.inner)
    }
}

impl Eq for SharedError {}

impl Serialize for SharedError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut v = vec![self.to_string()];
        let mut source = self.source();
        while let Some(s) = source {
            v.push(s.to_string());
            source = s.source();
        }
        Serialize::serialize(&v, serializer)
    }
}

impl<'de> Deserialize<'de> for SharedError {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let mut messages = <Vec<String>>::deserialize(deserializer)?;
        let mut e = match messages.pop() {
            Some(e) => anyhow!(e),
            None => return Err(Error::custom("expected at least 1 error message")),
        };
        while let Some(message) = messages.pop() {
            e = e.context(message);
        }
        Ok(SharedError::new(e))
    }
}

impl Deref for SharedError {
    type Target = Arc<Error>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
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

impl Debug for FormatDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = self.0.as_secs();
        if s > 100 {
            return write!(f, "{}s", s);
        }
        let ms = self.0.as_millis();
        if ms > 10000 {
            return write!(f, "{:.2}s", (ms as f32) / 1000.0);
        }
        if ms > 100 {
            return write!(f, "{}ms", ms);
        }
        write!(f, "{}ms", (self.0.as_micros() as f32) / 1000.0)
    }
}

pub struct FormatBytes(pub usize);

impl Display for FormatBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let b = self.0;
        const KB: usize = 1_024;
        const MB: usize = 1_024 * KB;
        const GB: usize = 1_024 * MB;
        if b > GB {
            return write!(f, "{:.2}GiB", ((b / MB) as f32) / 1_024.0);
        }
        if b > MB {
            return write!(f, "{:.2}MiB", ((b / KB) as f32) / 1_024.0);
        }
        if b > KB {
            return write!(f, "{:.2}KiB", (b as f32) / 1_024.0);
        }
        write!(f, "{}B", b)
    }
}

/// Smart pointer that stores data either in an [Arc] or as a static reference.
pub enum StaticOrArc<T: ?Sized + 'static> {
    Static(&'static T),
    Shared(Arc<T>),
}

impl<T: ?Sized + 'static> AsRef<T> for StaticOrArc<T> {
    fn as_ref(&self) -> &T {
        match self {
            Self::Static(s) => s,
            Self::Shared(b) => b,
        }
    }
}

impl<T: ?Sized + 'static> From<&'static T> for StaticOrArc<T> {
    fn from(s: &'static T) -> Self {
        Self::Static(s)
    }
}

impl<T: ?Sized + 'static> From<Arc<T>> for StaticOrArc<T> {
    fn from(b: Arc<T>) -> Self {
        Self::Shared(b)
    }
}

impl<T: 'static> From<T> for StaticOrArc<T> {
    fn from(b: T) -> Self {
        Self::Shared(Arc::new(b))
    }
}

impl<T: ?Sized + 'static> Deref for StaticOrArc<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        self.as_ref()
    }
}

impl<T: ?Sized + 'static> Clone for StaticOrArc<T> {
    fn clone(&self) -> Self {
        match self {
            Self::Static(s) => Self::Static(s),
            Self::Shared(b) => Self::Shared(b.clone()),
        }
    }
}

impl<T: ?Sized + PartialEq + 'static> PartialEq for StaticOrArc<T> {
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl<T: ?Sized + PartialEq + Eq + 'static> Eq for StaticOrArc<T> {}

impl<T: ?Sized + Hash + 'static> Hash for StaticOrArc<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        (**self).hash(state);
    }
}

impl<T: ?Sized + Display + 'static> Display for StaticOrArc<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        (**self).fmt(f)
    }
}

impl<T: ?Sized + Debug + 'static> Debug for StaticOrArc<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        (**self).fmt(f)
    }
}

pin_project! {
    /// A future that wraps another future and applies a function on every poll call.
    pub struct WrapFuture<F, W> {
        wrapper: W,
        #[pin]
        future: F,
    }
}

impl<F: Future, W: for<'a> Fn(Pin<&mut F>, &mut Context<'a>) -> Poll<F::Output>> WrapFuture<F, W> {
    pub fn new(future: F, wrapper: W) -> Self {
        Self { wrapper, future }
    }
}

impl<F: Future, W: for<'a> Fn(Pin<&mut F>, &mut Context<'a>) -> Poll<F::Output>> Future
    for WrapFuture<F, W>
{
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        (this.wrapper)(this.future, cx)
    }
}
