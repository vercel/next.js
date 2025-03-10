use std::{
    fmt,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context as TaskContext, Poll},
};

use anyhow::Result;
use futures::{Stream as StreamTrait, StreamExt, TryStreamExt};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Streams allow for streaming values from source to sink.
///
/// A Stream implements both a reader (which implements the Stream trait), and a
/// writer (which can be sent to another thread). As new values are written, any
/// pending readers will be woken up to receive the new value.
#[derive(Clone, Debug)]
pub struct Stream<T: Clone + Send> {
    inner: Arc<Mutex<StreamState<T>>>,
}

/// The StreamState actually holds the data of a Stream.
struct StreamState<T> {
    source: Option<Pin<Box<dyn StreamTrait<Item = T> + Send>>>,
    pulled: Vec<T>,
}

impl<T: Clone + Send> Stream<T> {
    /// Constructs a new Stream, and immediately closes it with only the passed
    /// values.
    pub fn new_closed(pulled: Vec<T>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(StreamState {
                source: None,
                pulled,
            })),
        }
    }

    /// Creates a new Stream, which will lazily pull from the source stream.
    pub fn new_open(
        pulled: Vec<T>,
        source: Box<dyn StreamTrait<Item = T> + Send + 'static>,
    ) -> Self {
        Self {
            inner: Arc::new(Mutex::new(StreamState {
                source: Some(Box::into_pin(source)),
                pulled,
            })),
        }
    }

    /// Returns a [StreamTrait] implementation to poll values out of our Stream.
    pub fn read(&self) -> StreamRead<T> {
        StreamRead {
            source: self.clone(),
            index: 0,
        }
    }

    pub async fn into_single(&self) -> SingleValue<T> {
        let mut stream = self.read();
        let Some(first) = stream.next().await else {
            return SingleValue::None;
        };

        if stream.next().await.is_some() {
            return SingleValue::Multiple;
        }

        SingleValue::Single(first)
    }
}

impl<T: Clone + Send, E: Clone + Send> Stream<Result<T, E>> {
    /// Converts a TryStream into a single value when possible.
    pub async fn try_into_single(&self) -> Result<SingleValue<T>, E> {
        let mut stream = self.read();
        let Some(first) = stream.try_next().await? else {
            return Ok(SingleValue::None);
        };

        if stream.try_next().await?.is_some() {
            return Ok(SingleValue::Multiple);
        }

        Ok(SingleValue::Single(first))
    }
}

pub enum SingleValue<T> {
    /// The Stream did not hold a value.
    None,

    /// The Stream held multiple values.
    Multiple,

    /// The held only a single value.
    Single(T),
}

impl<T: fmt::Debug> fmt::Debug for SingleValue<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SingleValue::None => f.debug_struct("SingleValue::None").finish(),
            SingleValue::Multiple => f.debug_struct("SingleValue::Multiple").finish(),
            SingleValue::Single(v) => f.debug_tuple("SingleValue::Single").field(v).finish(),
        }
    }
}

impl<T: Clone + Send, S: StreamTrait<Item = T> + Send + Unpin + 'static> From<S> for Stream<T> {
    fn from(source: S) -> Self {
        Self::new_open(vec![], Box::new(source))
    }
}

impl<T: Clone + Send> Default for Stream<T> {
    fn default() -> Self {
        Self::new_closed(vec![])
    }
}

impl<T: Clone + PartialEq + Send> PartialEq for Stream<T> {
    // A Stream is equal if it's the same internal pointer, or both streams are
    // closed with equivalent values.
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.inner, &other.inner) || {
            let left = self.inner.lock().unwrap();
            let right = other.inner.lock().unwrap();

            match (&*left, &*right) {
                (
                    StreamState {
                        pulled: a,
                        source: None,
                    },
                    StreamState {
                        pulled: b,
                        source: None,
                    },
                ) => a == b,
                _ => false,
            }
        }
    }
}
impl<T: Clone + Eq + Send> Eq for Stream<T> {}

impl<T: Clone + Serialize + Send> Serialize for Stream<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::Error;
        let lock = self.inner.lock().map_err(Error::custom)?;
        match &*lock {
            StreamState {
                pulled,
                source: None,
            } => pulled.serialize(serializer),
            _ => Err(Error::custom("cannot serialize open stream")),
        }
    }
}

impl<'de, T: Clone + Send + Deserialize<'de>> Deserialize<'de> for Stream<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let data = <Vec<T>>::deserialize(deserializer)?;
        Ok(Stream::new_closed(data))
    }
}

impl<T: Clone + fmt::Debug> fmt::Debug for StreamState<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("StreamState")
            .field("pulled", &self.pulled)
            .finish()
    }
}

/// Implements [StreamTrait] over our Stream.
#[derive(Debug)]
pub struct StreamRead<T: Clone + Send> {
    index: usize,
    source: Stream<T>,
}

impl<T: Clone + Send> StreamTrait for StreamRead<T> {
    type Item = T;

    fn poll_next(self: Pin<&mut Self>, cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let index = this.index;
        let mut inner = this.source.inner.lock().unwrap();

        if let Some(v) = inner.pulled.get(index) {
            // If the current reader can be satisfied by a value we've already pulled, then
            // just do that.
            this.index += 1;
            return Poll::Ready(Some(v.clone()));
        };

        let Some(source) = &mut inner.source else {
            // If the source has been closed, there's nothing left to pull.
            return Poll::Ready(None);
        };

        match source.poll_next_unpin(cx) {
            // If the source stream is ready to give us a new value, we can immediately store that
            // and return it to the caller. Any other readers will be able to read the value from
            // the already-pulled data.
            Poll::Ready(Some(v)) => {
                this.index += 1;
                inner.pulled.push(v.clone());
                Poll::Ready(Some(v))
            }
            // If the source stream is finished, then we can transition to the closed state
            // to drop the source stream.
            Poll::Ready(None) => {
                inner.source.take();
                Poll::Ready(None)
            }
            // Else, we need to wait for the source stream to give us a new value. The
            // source stream will be responsible for waking the TaskContext.
            Poll::Pending => Poll::Pending,
        }
    }
}
