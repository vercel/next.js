use std::{borrow::Cow, ops::Deref};

pub enum ValueBuffer<'l> {
    Borrowed(&'l [u8]),
    Owned(Box<[u8]>),
}

impl ValueBuffer<'_> {
    pub fn into_boxed_slice(self) -> Box<[u8]> {
        match self {
            ValueBuffer::Borrowed(b) => b.into(),
            ValueBuffer::Owned(b) => b,
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
        ValueBuffer::Owned(v.into_boxed_slice())
    }
}

impl From<Box<[u8]>> for ValueBuffer<'_> {
    fn from(b: Box<[u8]>) -> Self {
        ValueBuffer::Owned(b)
    }
}

impl<'l> From<Cow<'l, [u8]>> for ValueBuffer<'l> {
    fn from(c: Cow<'l, [u8]>) -> Self {
        match c {
            Cow::Borrowed(b) => ValueBuffer::Borrowed(b),
            Cow::Owned(o) => ValueBuffer::Owned(o.into_boxed_slice()),
        }
    }
}

impl Deref for ValueBuffer<'_> {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        match self {
            ValueBuffer::Borrowed(b) => b,
            ValueBuffer::Owned(b) => b,
        }
    }
}
