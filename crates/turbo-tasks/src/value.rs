use std::{fmt::Debug, marker::PhantomData, ops::Deref};

use crate::SharedReference;

/// Pass a value by value (`Value<Xxx>`) instead of by reference (`Vc<Xxx>`).
///
/// Persistent, requires serialization.
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

impl<T: Copy> Copy for Value<T> {}

impl<T: Default> Default for Value<T> {
    fn default() -> Self {
        Value::new(Default::default())
    }
}

/// Pass a value by value (`Value<Xxx>`) instead of by reference (`Vc<Xxx>`).
///
/// Doesn't require serialization, and won't be stored in the persistent cache
/// in the future.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone, Hash)]
pub struct TransientValue<T> {
    inner: T,
}

impl<T> TransientValue<T> {
    pub fn new(value: T) -> Self {
        Self { inner: value }
    }

    pub fn into_value(self) -> T {
        self.inner
    }
}

impl<T> Deref for TransientValue<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

/// Pass a reference to an instance to a turbo-tasks function.
///
/// Equality and hash is implemented as pointer comparison.
///
/// Doesn't require serialization, and won't be stored in the persistent cache
/// in the future.
#[derive(Debug)]
pub struct TransientInstance<T> {
    inner: SharedReference,
    phantom: PhantomData<T>,
}

impl<T> Clone for TransientInstance<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            phantom: self.phantom,
        }
    }
}

impl<T> Eq for TransientInstance<T> {}

impl<T> PartialEq for TransientInstance<T> {
    fn eq(&self, other: &Self) -> bool {
        self.inner == other.inner
    }
}

impl<T> std::hash::Hash for TransientInstance<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.inner.hash(state);
    }
}

impl<T> PartialOrd for TransientInstance<T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<T> Ord for TransientInstance<T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.inner.cmp(&other.inner)
    }
}

impl<T: Send + Sync + 'static> From<TransientInstance<T>> for triomphe::Arc<T> {
    fn from(instance: TransientInstance<T>) -> Self {
        // we know this downcast must work because we have type T
        instance.inner.downcast().unwrap()
    }
}

impl<T: Send + Sync + 'static> From<TransientInstance<T>> for SharedReference {
    fn from(instance: TransientInstance<T>) -> Self {
        instance.inner
    }
}

impl<T: Send + Sync + 'static> From<triomphe::Arc<T>> for TransientInstance<T> {
    fn from(arc: triomphe::Arc<T>) -> Self {
        Self {
            inner: SharedReference::new(None, arc),
            phantom: PhantomData,
        }
    }
}

impl<T: Send + Sync + 'static> TryFrom<SharedReference> for TransientInstance<T> {
    type Error = ();

    fn try_from(inner: SharedReference) -> Result<Self, Self::Error> {
        if inner.1.downcast_ref::<T>().is_some() {
            Ok(Self {
                inner,
                phantom: PhantomData,
            })
        } else {
            Err(())
        }
    }
}

impl<T: Send + Sync + 'static> TransientInstance<T> {
    pub fn new(value: T) -> Self {
        Self {
            inner: SharedReference::new(None, triomphe::Arc::new(value)),
            phantom: PhantomData,
        }
    }
}

impl<T: 'static> Deref for TransientInstance<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        self.inner.1.downcast_ref().unwrap()
    }
}
