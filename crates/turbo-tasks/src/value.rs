use std::{fmt::Debug, marker::PhantomData, ops::Deref, sync::Arc};

use crate::{SharedReference, Typed};

/// Pass a value by value (`Value<Xxx>`) instead of by reference (`XxxVc`).
///
/// Persistent, requires serialization.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone, Hash)]
pub struct Value<T: Typed> {
    inner: T,
}

impl<T: Typed> Value<T> {
    pub fn new(value: T) -> Self {
        Self { inner: value }
    }

    pub fn into_value(self) -> T {
        self.inner
    }
}

impl<T: Typed> From<T> for Value<T> {
    fn from(value: T) -> Self {
        Value::new(value)
    }
}

impl<T: Typed> Deref for Value<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<T: Typed + Copy> Copy for Value<T> {}

impl<T: Typed + Default> Default for Value<T> {
    fn default() -> Self {
        Value::new(Default::default())
    }
}

/// Pass a value by value (`Value<Xxx>`) instead of by reference (`XxxVc`).
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
        self.inner.partial_cmp(&other.inner)
    }
}

impl<T> Ord for TransientInstance<T> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.inner.cmp(&other.inner)
    }
}

impl<T: Send + Sync + 'static> From<TransientInstance<T>> for Arc<T> {
    fn from(instance: TransientInstance<T>) -> Self {
        Arc::downcast(instance.inner.1.clone()).unwrap()
    }
}

impl<T: Send + Sync + 'static> From<TransientInstance<T>> for SharedReference {
    fn from(instance: TransientInstance<T>) -> Self {
        instance.inner
    }
}

impl<T: Send + Sync + 'static> From<Arc<T>> for TransientInstance<T> {
    fn from(arc: Arc<T>) -> Self {
        Self {
            inner: SharedReference(None, arc),
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
            inner: SharedReference(None, Arc::new(value)),
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
