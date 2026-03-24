use std::{borrow::Cow, ops::Deref};

use anyhow::Result;
use smallvec::SmallVec;

use crate::database::key_value_database::KeySpace;

pub enum WriteBuffer<'a> {
    Borrowed(&'a [u8]),
    Vec(Vec<u8>),
    SmallVec(smallvec::SmallVec<[u8; 16]>),
}

impl WriteBuffer<'_> {
    pub fn into_static(self) -> WriteBuffer<'static> {
        match self {
            WriteBuffer::Borrowed(b) => WriteBuffer::SmallVec(SmallVec::from_slice(b)),
            WriteBuffer::Vec(v) => WriteBuffer::Vec(v),
            WriteBuffer::SmallVec(sv) => WriteBuffer::Vec(sv.into_vec()),
        }
    }
}

impl Deref for WriteBuffer<'_> {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        match self {
            WriteBuffer::Borrowed(b) => b,
            WriteBuffer::Vec(v) => v,
            WriteBuffer::SmallVec(sv) => sv,
        }
    }
}

impl<'l> From<Cow<'l, [u8]>> for WriteBuffer<'l> {
    fn from(c: Cow<'l, [u8]>) -> Self {
        match c {
            Cow::Borrowed(b) => WriteBuffer::Borrowed(b),
            Cow::Owned(o) => WriteBuffer::Vec(o),
        }
    }
}

pub trait ConcurrentWriteBatch<'a>: Sync + Send {
    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l;
    fn commit(self) -> Result<()>;
    fn put(&self, key_space: KeySpace, key: WriteBuffer<'_>, value: WriteBuffer<'_>) -> Result<()>;
    fn delete(&self, key_space: KeySpace, key: WriteBuffer<'_>) -> Result<()>;
    /// Flushes a key space of the write batch, reducing the amount of buffered memory used.
    /// Does not commit any data persistently.
    ///
    /// Safety: Caller must ensure that no concurrent put or delete operation is happening on the
    /// flushed key space.
    unsafe fn flush(&self, key_space: KeySpace) -> Result<()>;
}
