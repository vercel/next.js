use std::{fmt::Debug, ops::Deref};

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone, Hash)]
pub struct Value<T> {
    inner: T,
}

impl<T> Value<T> {
    pub fn new(value: T) -> Self {
        Self { inner: value }
    }

    pub fn into_value(self) -> T {
        self.inner
    }
}

impl<T> Deref for Value<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}
