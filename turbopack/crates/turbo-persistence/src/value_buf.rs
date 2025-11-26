use std::{borrow::Cow, ops::Deref};

use smallvec::SmallVec;

pub enum ValueBuffer<'l> {
    Borrowed(&'l [u8]),
    Vec(Vec<u8>),
    SmallVec(SmallVec<[u8; 16]>),
}

impl ValueBuffer<'_> {
    pub fn into_vec(self) -> Vec<u8> {
        match self {
            ValueBuffer::Borrowed(b) => b.to_vec(),
            ValueBuffer::Vec(v) => v,
            ValueBuffer::SmallVec(sv) => sv.into_vec(),
        }
    }

    pub fn into_small_vec(self) -> SmallVec<[u8; 16]> {
        match self {
            ValueBuffer::Borrowed(b) => SmallVec::from_slice(b),
            ValueBuffer::Vec(v) => SmallVec::from_vec(v),
            ValueBuffer::SmallVec(sv) => sv,
        }
    }
}

impl<'l> From<&'l [u8]> for ValueBuffer<'l> {
    fn from(b: &'l [u8]) -> Self {
        ValueBuffer::Borrowed(b)
    }
}

impl From<Vec<u8>> for ValueBuffer<'_> {
    fn from(v: Vec<u8>) -> Self {
        ValueBuffer::Vec(v)
    }
}

impl From<SmallVec<[u8; 16]>> for ValueBuffer<'_> {
    fn from(sv: SmallVec<[u8; 16]>) -> Self {
        ValueBuffer::SmallVec(sv)
    }
}

impl<'l> From<Cow<'l, [u8]>> for ValueBuffer<'l> {
    fn from(c: Cow<'l, [u8]>) -> Self {
        match c {
            Cow::Borrowed(b) => ValueBuffer::Borrowed(b),
            Cow::Owned(o) => ValueBuffer::Vec(o),
        }
    }
}

impl Deref for ValueBuffer<'_> {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        match self {
            ValueBuffer::Borrowed(b) => b,
            ValueBuffer::Vec(v) => v,
            ValueBuffer::SmallVec(sv) => sv,
        }
    }
}
