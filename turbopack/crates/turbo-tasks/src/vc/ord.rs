use std::{
    cmp::Ordering,
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    ops::Deref,
    slice,
};

use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};

use crate::{
    ResolvedVc, Vc,
    trace::{TraceRawVcs, TraceRawVcsContext},
    vc::into_future,
};
#[cfg(debug_assertions)]
use crate::{
    UpcastStrict,
    debug::{ValueDebug, ValueDebugFormat, ValueDebugFormatString},
};

/// A thin wrapper on [`ResolvedVc`] that implements [`Ord`]. You must not depend on this to provide
/// deterministic execution (i.e. to produce externally-visible outputs, like when performing
/// chunking) as task ids are non-deterministic across cold executions.
///
/// This can be useful to provide a cache key. Given a single instance of `turbo-tasks`, this will
/// give stable results.
#[derive(Serialize, Deserialize, Encode, Decode)]
#[serde(transparent, bound = "")]
#[bincode(bounds = "T: ?Sized")]
#[repr(transparent)]
pub struct OrdResolvedVc<T>
where
    T: ?Sized,
{
    node: ResolvedVc<T>,
}

impl<T> OrdResolvedVc<T>
where
    T: ?Sized,
{
    /// Wraps a [`ResolvedVc`] so that it can be ordered. See the type-level documentation for the
    /// caveats around determinism.
    pub fn new(node: ResolvedVc<T>) -> Self {
        Self { node }
    }

    /// Cheaply converts a [`Vec`] of ordered [`ResolvedVc`]s to a [`Vec`] of [`ResolvedVc`]s.
    pub fn deref_vec(vec: Vec<OrdResolvedVc<T>>) -> Vec<ResolvedVc<T>> {
        debug_assert!(size_of::<OrdResolvedVc<T>>() == size_of::<ResolvedVc<T>>());
        let (ptr, len, capacity) = vec.into_raw_parts();
        // Safety: The memory layout of `OrdResolvedVc<T>` and `ResolvedVc<T>` is
        // the same.
        unsafe { Vec::from_raw_parts(ptr as *mut ResolvedVc<T>, len, capacity) }
    }

    /// Cheaply converts a slice of [`OrdResolvedVc`]s to a slice of
    /// [`ResolvedVc`]s.
    pub fn deref_slice(s: &[OrdResolvedVc<T>]) -> &[ResolvedVc<T>] {
        debug_assert!(size_of::<OrdResolvedVc<T>>() == size_of::<ResolvedVc<T>>());
        // Safety: The memory layout of `OrdResolvedVc<T>` and `ResolvedVc<T>` is
        // the same.
        unsafe { slice::from_raw_parts(s.as_ptr() as *const ResolvedVc<T>, s.len()) }
    }
}

impl<T> From<ResolvedVc<T>> for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn from(node: ResolvedVc<T>) -> Self {
        Self::new(node)
    }
}

impl<T> PartialEq<OrdResolvedVc<T>> for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node
    }
}

impl<T> Eq for OrdResolvedVc<T> where T: ?Sized {}

impl<T> Hash for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.node.hash(state);
    }
}

impl<T> PartialOrd for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl<T> Ord for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn cmp(&self, other: &Self) -> Ordering {
        Vc::into_raw(*self.node)
            .bits()
            .cmp(&Vc::into_raw(*other.node).bits())
    }
}

impl<T> Copy for OrdResolvedVc<T> where T: ?Sized {}

impl<T> Clone for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Debug for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("OrdResolvedVc")
            .field(&self.node.node.node)
            .finish()
    }
}

impl<T> TraceRawVcs for OrdResolvedVc<T>
where
    T: ?Sized,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(&self.node, trace_context);
    }
}

#[cfg(debug_assertions)]
impl<T> ValueDebugFormat for OrdResolvedVc<T>
where
    T: UpcastStrict<Box<dyn ValueDebug>> + Send + Sync + ?Sized,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        self.node.value_debug_format(depth)
    }
}

impl<T> Deref for OrdResolvedVc<T>
where
    T: ?Sized,
{
    type Target = ResolvedVc<T>;

    fn deref(&self) -> &Self::Target {
        &self.node
    }
}

into_future!(OrdResolvedVc<T>, |this| (*this).into_future());
into_future!(&OrdResolvedVc<T>, |this| (*this).into_future());
into_future!(&mut OrdResolvedVc<T>, |this| (*this).into_future());
