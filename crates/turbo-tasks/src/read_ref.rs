use std::{
    borrow::Borrow,
    cmp::Ordering,
    fmt::{Debug, Display},
    hash::Hash,
    marker::PhantomData,
    sync::Arc,
};

use serde::{Deserialize, Serialize};
use turbo_tasks_hash::DeterministicHash;

use crate::{
    debug::{ValueDebugFormat, ValueDebugFormatString},
    trace::{TraceRawVcs, TraceRawVcsContext},
};

/// The read value of a value cell. The read value is immutable, while the cell
/// itself might change over time. It's basically a snapshot of a value at a
/// certain point in time.
///
/// Internally it stores a reference counted reference to a value on the heap.
///
/// Invariant: T and U are binary identical (#[repr(transparent)])
#[derive(Clone)]
pub struct ReadRef<T, U = T>(Arc<T>, PhantomData<Arc<U>>);

impl<T, U> std::ops::Deref for ReadRef<T, U> {
    type Target = U;

    fn deref(&self) -> &Self::Target {
        let inner: &T = &self.0;
        unsafe { std::mem::transmute(inner) }
    }
}

impl<T, U: Display> Display for ReadRef<T, U> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T, U: Debug> Debug for ReadRef<T, U> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl<T, U: TraceRawVcs> TraceRawVcs for ReadRef<T, U> {
    fn trace_raw_vcs(&self, context: &mut TraceRawVcsContext) {
        (**self).trace_raw_vcs(context);
    }
}

impl<T, U: ValueDebugFormat + 'static> ValueDebugFormat for ReadRef<T, U> {
    fn value_debug_format(&self) -> ValueDebugFormatString {
        let value = &**self;
        value.value_debug_format()
    }
}

impl<T, U: PartialEq> PartialEq for ReadRef<T, U> {
    fn eq(&self, other: &Self) -> bool {
        PartialEq::eq(&**self, &**other)
    }
}

impl<T, U: Eq> Eq for ReadRef<T, U> {}

impl<T, U: PartialOrd> PartialOrd for ReadRef<T, U> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        PartialOrd::partial_cmp(&**self, &**other)
    }
}

impl<T, U: Ord> Ord for ReadRef<T, U> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(&**self, &**other)
    }
}

impl<T, U: Hash> Hash for ReadRef<T, U> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&**self, state)
    }
}

impl<T, U: DeterministicHash> DeterministicHash for ReadRef<T, U> {
    fn deterministic_hash<H: turbo_tasks_hash::DeterministicHasher>(&self, state: &mut H) {
        let p = &**self;
        p.deterministic_hash(state);
    }
}

impl<T, U> Borrow<U> for ReadRef<T, U> {
    fn borrow(&self) -> &U {
        self
    }
}

impl<'a, T, U, I, J: Iterator<Item = I>> IntoIterator for &'a ReadRef<T, U>
where
    &'a U: IntoIterator<Item = I, IntoIter = J>,
{
    type Item = I;

    type IntoIter = J;

    fn into_iter(self) -> Self::IntoIter {
        (&**self).into_iter()
    }
}

impl<T, U: Serialize> Serialize for ReadRef<T, U> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        (**self).serialize(serializer)
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for ReadRef<T, T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = T::deserialize(deserializer)?;
        Ok(Self(Arc::new(value), PhantomData))
    }
}

impl<T> ReadRef<T, T> {
    pub fn new(arc: Arc<T>) -> Self {
        Self(arc, PhantomData)
    }
}

impl<T, U> ReadRef<T, U> {
    /// # Safety
    ///
    /// T and U must be binary identical (#[repr(transparent)])
    pub unsafe fn new_transparent(arc: Arc<T>) -> Self {
        Self(arc, PhantomData)
    }

    pub fn ptr_eq(&self, other: &ReadRef<T, U>) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }

    pub fn ptr_cmp(&self, other: &ReadRef<T, U>) -> Ordering {
        Arc::as_ptr(&self.0).cmp(&Arc::as_ptr(&other.0))
    }
}

impl<T, U: Clone> ReadRef<T, U> {
    /// This will clone the contained value instead of cloning the ReadRef.
    /// This clone is more expensive, but allows to get an mutable owned value.
    pub fn clone_value(&self) -> U {
        (**self).clone()
    }
}
