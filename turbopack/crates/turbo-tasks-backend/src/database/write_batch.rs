use std::{borrow::Cow, ops::Deref};

pub enum WriteBuffer<'a> {
    Borrowed(&'a [u8]),
    Owned(Box<[u8]>),
}

impl WriteBuffer<'_> {
    pub fn into_static(self) -> WriteBuffer<'static> {
        match self {
            WriteBuffer::Borrowed(b) => WriteBuffer::Owned(b.into()),
            WriteBuffer::Owned(b) => WriteBuffer::Owned(b),
        }
    }
}

impl Deref for WriteBuffer<'_> {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        match self {
            WriteBuffer::Borrowed(b) => b,
            WriteBuffer::Owned(b) => b,
        }
    }
}

impl<'l> From<Cow<'l, [u8]>> for WriteBuffer<'l> {
    fn from(c: Cow<'l, [u8]>) -> Self {
        match c {
            Cow::Borrowed(b) => WriteBuffer::Borrowed(b),
            Cow::Owned(o) => WriteBuffer::Owned(o.into_boxed_slice()),
        }
    }
}
