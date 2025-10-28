use std::{
    cell::SyncUnsafeCell,
    error::Error as StdError,
    fmt::{Debug, Display},
    future::Future,
    hash::{Hash, Hasher},
    mem::ManuallyDrop,
    ops::Deref,
    pin::Pin,
    sync::{Arc, LazyLock},
    task::{Context, Poll},
    thread::available_parallelism,
    time::Duration,
};

use anyhow::{Error, anyhow};
use pin_project_lite::pin_project;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub use super::{
    id_factory::{IdFactory, IdFactoryWithReuse},
    once_map::*,
};

/// A error struct that is backed by an Arc to allow cloning errors
#[derive(Debug, Clone)]
pub struct SharedError {
    inner: Arc<anyhow::Error>,
}

impl SharedError {
    pub fn new(err: anyhow::Error) -> Self {
        Self {
            inner: Arc::new(err),
        }
    }
}

impl AsRef<dyn StdError> for SharedError {
    fn as_ref(&self) -> &(dyn StdError + 'static) {
        let err: &anyhow::Error = &self.inner;
        err.as_ref()
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
            return write!(f, "{s}s");
        }
        let ms = self.0.as_millis();
        if ms > 10 {
            return write!(f, "{ms}ms");
        }
        write!(f, "{}ms", (self.0.as_micros() as f32) / 1000.0)
    }
}

impl Debug for FormatDuration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = self.0.as_secs();
        if s > 100 {
            return write!(f, "{s}s");
        }
        let ms = self.0.as_millis();
        if ms > 10000 {
            return write!(f, "{:.2}s", (ms as f32) / 1000.0);
        }
        if ms > 100 {
            return write!(f, "{ms}ms");
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
        write!(f, "{b}B")
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

/// Calculates a good chunk size for parallel processing based on the number of available threads.
/// This is used to ensure that the workload is evenly distributed across the threads.
pub fn good_chunk_size(len: usize) -> usize {
    static GOOD_CHUNK_COUNT: LazyLock<usize> =
        LazyLock::new(|| available_parallelism().map_or(16, |c| c.get() * 4));
    let min_chunk_count = *GOOD_CHUNK_COUNT;
    len.div_ceil(min_chunk_count)
}

/// Similar to slice::chunks but for owned data. Chunks are Send and Sync to allow to use it for
/// parallelism.
pub fn into_chunks<T>(data: Vec<T>, chunk_size: usize) -> IntoChunks<T> {
    let (ptr, length, capacity) = data.into_raw_parts();
    // SAFETY: changing a pointer from T to SyncUnsafeCell<ManuallyDrop<..>> is safe as both types
    // have repr(transparent).
    let ptr = ptr as *mut SyncUnsafeCell<ManuallyDrop<T>>;
    // SAFETY: The ptr, length and capacity were from into_raw_parts(). This is the only place where
    // we use ptr.
    let data =
        unsafe { Vec::<SyncUnsafeCell<ManuallyDrop<T>>>::from_raw_parts(ptr, length, capacity) };
    IntoChunks {
        data: Arc::new(data),
        index: 0,
        chunk_size,
    }
}

pub struct IntoChunks<T> {
    data: Arc<Vec<SyncUnsafeCell<ManuallyDrop<T>>>>,
    index: usize,
    chunk_size: usize,
}

impl<T> Iterator for IntoChunks<T> {
    type Item = Chunk<T>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index < self.data.len() {
            let end = self.data.len().min(self.index + self.chunk_size);
            let item = Chunk {
                data: Arc::clone(&self.data),
                index: self.index,
                end,
            };
            self.index = end;
            Some(item)
        } else {
            None
        }
    }
}

impl<T> IntoChunks<T> {
    fn next_item(&mut self) -> Option<T> {
        if self.index < self.data.len() {
            // SAFETY: We are the only owner of this chunk of data and we make sure that this item
            // is no longer dropped by moving the index
            let item = unsafe { ManuallyDrop::take(&mut *self.data[self.index].get()) };
            self.index += 1;
            Some(item)
        } else {
            None
        }
    }
}

impl<T> Drop for IntoChunks<T> {
    fn drop(&mut self) {
        // To avoid leaking memory we need to drop the remaining items
        while self.next_item().is_some() {}
    }
}

pub struct Chunk<T> {
    data: Arc<Vec<SyncUnsafeCell<ManuallyDrop<T>>>>,
    index: usize,
    end: usize,
}

impl<T> Iterator for Chunk<T> {
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index < self.end {
            // SAFETY: We are the only owner of this chunk of data and we make sure that this item
            // is no longer dropped by moving the index
            let item = unsafe { ManuallyDrop::take(&mut *self.data[self.index].get()) };
            self.index += 1;
            Some(item)
        } else {
            None
        }
    }
}

impl<T> Drop for Chunk<T> {
    fn drop(&mut self) {
        // To avoid leaking memory we need to drop the remaining items
        while self.next().is_some() {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_iterator() {
        let data = [(); 10]
            .into_iter()
            .enumerate()
            .map(|(i, _)| Arc::new(i))
            .collect::<Vec<_>>();
        let mut chunks = into_chunks(data.clone(), 3);
        let mut first_chunk = chunks.next().unwrap();
        let second_chunk = chunks.next().unwrap();
        drop(chunks);
        assert_eq!(
            second_chunk.into_iter().map(|a| *a).collect::<Vec<_>>(),
            vec![3, 4, 5]
        );
        assert_eq!(*first_chunk.next().unwrap(), 0);
        assert_eq!(*first_chunk.next().unwrap(), 1);
        drop(first_chunk);
        for arc in data {
            assert_eq!(Arc::strong_count(&arc), 1);
        }
    }
}
