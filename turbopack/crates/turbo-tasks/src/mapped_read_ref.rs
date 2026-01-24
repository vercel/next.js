use std::fmt::{Debug, Display};

use serde::Serialize;

use crate::{
    debug::{ValueDebugFormat, ValueDebugFormatString},
    trace::{TraceRawVcs, TraceRawVcsContext},
};

pub struct MappedReadRef<A, T> {
    value: *const T,
    arc: triomphe::Arc<A>,
}

unsafe impl<A: Send + Sync, T: Sync> Send for MappedReadRef<A, T> {}
unsafe impl<A: Send + Sync, T: Sync> Sync for MappedReadRef<A, T> {}

impl<A, T> MappedReadRef<A, T> {
    /// # Safety
    /// The caller must ensure that the `arc` keeps the value pointed to by `value` alive.
    pub unsafe fn new(arc: triomphe::Arc<A>, value: *const T) -> Self {
        Self { value, arc }
    }
}

impl<A, T> MappedReadRef<A, T> {
    pub fn ptr_eq(&self, other: &Self) -> bool {
        std::ptr::eq(self.value, other.value)
    }

    pub fn ptr(&self) -> *const T {
        self.value
    }
}

impl<A, T> Clone for MappedReadRef<A, T> {
    fn clone(&self) -> Self {
        Self {
            value: self.value,
            arc: self.arc.clone(),
        }
    }
}

impl<A, T> std::ops::Deref for MappedReadRef<A, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        unsafe { &*self.value }
    }
}

impl<A, T> Debug for MappedReadRef<A, T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        (**self).fmt(f)
    }
}

impl<A, T> Display for MappedReadRef<A, T>
where
    T: Display,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<A, T> PartialEq for MappedReadRef<A, T>
where
    T: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl<A, T> Eq for MappedReadRef<A, T> where T: Eq {}

impl<A, T> PartialOrd for MappedReadRef<A, T>
where
    T: PartialOrd,
{
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        (**self).partial_cmp(&**other)
    }
}

impl<A, T> Ord for MappedReadRef<A, T>
where
    T: Ord,
{
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        (**self).cmp(&**other)
    }
}

impl<A, T> std::hash::Hash for MappedReadRef<A, T>
where
    T: std::hash::Hash,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (**self).hash(state);
    }
}

impl<A, T> ValueDebugFormat for MappedReadRef<A, T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        let value = &**self;
        value.value_debug_format(depth)
    }
}

impl<A, T> TraceRawVcs for MappedReadRef<A, T>
where
    T: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        (**self).trace_raw_vcs(trace_context);
    }
}

impl<A, T, I, J: Iterator<Item = I>> IntoIterator for &MappedReadRef<A, T>
where
    for<'b> &'b T: IntoIterator<Item = I, IntoIter = J>,
{
    type Item = I;

    type IntoIter = J;

    fn into_iter(self) -> Self::IntoIter {
        (&**self).into_iter()
    }
}

impl<A, T> Serialize for MappedReadRef<A, T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        (**self).serialize(serializer)
    }
}
