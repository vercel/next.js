use std::{borrow::Cow, ops::Deref};

use smallvec::SmallVec;

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
