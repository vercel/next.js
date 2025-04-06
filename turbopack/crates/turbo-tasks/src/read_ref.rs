use std::{
    fmt::{Debug, Display},
    hash::Hash,
    marker::PhantomData,
    mem::transmute_copy,
};

use serde::{Deserialize, Serialize};
use turbo_tasks_hash::DeterministicHash;

use crate::{
    debug::{ValueDebugFormat, ValueDebugFormatString},
    trace::{TraceRawVcs, TraceRawVcsContext},
    triomphe_utils::unchecked_sidecast_triomphe_arc,
    vc::VcCellMode,
    SharedReference, Vc, VcRead, VcValueType,
};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

/// The read value of a value cell. The read value is immutable, while the cell
/// itself might change over time. It's basically a snapshot of a value at a
/// certain point in time.
///
/// Internally it stores a reference counted reference to a value on the heap.
pub struct ReadRef<T>(triomphe::Arc<T>);

impl<T> Clone for ReadRef<T> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<T> std::ops::Deref for ReadRef<T>
where
    T: VcValueType,
{
    type Target = VcReadTarget<T>;

    fn deref(&self) -> &Self::Target {
        T::Read::value_to_target_ref(&self.0)
    }
}

impl<T> Display for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Display,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T> Debug for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Debug,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl<T> TraceRawVcs for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        (**self).trace_raw_vcs(trace_context);
    }
}

impl<T> ValueDebugFormat for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: ValueDebugFormat + 'static,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString {
        let value = &**self;
        value.value_debug_format(depth)
    }
}

impl<T> PartialEq for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        PartialEq::eq(&**self, &**other)
    }
}

impl<T> Eq for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Eq,
{
}

impl<T> PartialOrd for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: PartialOrd,
{
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        PartialOrd::partial_cmp(&**self, &**other)
    }
}

impl<T> Ord for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Ord,
{
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        Ord::cmp(&**self, &**other)
    }
}

impl<T> Hash for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Hash,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Hash::hash(&**self, state)
    }
}

impl<T> DeterministicHash for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: DeterministicHash,
{
    fn deterministic_hash<H: turbo_tasks_hash::DeterministicHasher>(&self, state: &mut H) {
        let p = &**self;
        p.deterministic_hash(state);
    }
}

impl<'a, T, I, J: Iterator<Item = I>> IntoIterator for &'a ReadRef<T>
where
    T: VcValueType,
    &'a VcReadTarget<T>: IntoIterator<Item = I, IntoIter = J>,
{
    type Item = I;

    type IntoIter = J;

    fn into_iter(self) -> Self::IntoIter {
        (&**self).into_iter()
    }
}

impl<T, I: 'static, J: Iterator<Item = I>> IntoIterator for ReadRef<T>
where
    T: VcValueType,
    &'static VcReadTarget<T>: IntoIterator<Item = I, IntoIter = J>,
{
    type Item = I;

    type IntoIter = ReadRefIter<T, I, J>;

    fn into_iter(self) -> Self::IntoIter {
        let r = &*self;
        // # Safety
        // The reference will we valid as long as the ReadRef is valid.
        let r = unsafe { transmute_copy::<&'_ VcReadTarget<T>, &'static VcReadTarget<T>>(&r) };
        ReadRefIter {
            read_ref: self,
            iter: r.into_iter(),
        }
    }
}

pub struct ReadRefIter<T, I: 'static, J: Iterator<Item = I>>
where
    T: VcValueType,
{
    iter: J,
    #[allow(dead_code)]
    read_ref: ReadRef<T>,
}

impl<T, I: 'static, J: Iterator<Item = I>> Iterator for ReadRefIter<T, I, J>
where
    T: VcValueType,
{
    type Item = I;

    fn next(&mut self) -> Option<Self::Item> {
        self.iter.next()
    }
}

impl<T> Serialize for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        (**self).serialize(serializer)
    }
}

impl<'de, T> Deserialize<'de> for ReadRef<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = T::deserialize(deserializer)?;
        Ok(Self(triomphe::Arc::new(value)))
    }
}

impl<T> ReadRef<T> {
    pub fn new_owned(value: T) -> Self {
        Self(triomphe::Arc::new(value))
    }

    pub fn new_arc(arc: triomphe::Arc<T>) -> Self {
        Self(arc)
    }

    pub fn ptr_eq(&self, other: &ReadRef<T>) -> bool {
        triomphe::Arc::ptr_eq(&self.0, &other.0)
    }

    pub fn ptr(&self) -> *const T {
        &*self.0 as *const T
    }
}

impl<T> ReadRef<T>
where
    T: VcValueType,
{
    /// Returns a new cell that points to the same value as the given
    /// reference.
    pub fn cell(read_ref: ReadRef<T>) -> Vc<T> {
        let type_id = T::get_value_type_id();
        // SAFETY: `T` and `T::Read::Repr` must have equivalent memory representations,
        // guaranteed by the unsafe implementation of `VcValueType`.
        let value = unsafe {
            unchecked_sidecast_triomphe_arc::<T, <T::Read as VcRead<T>>::Repr>(read_ref.0)
        };
        Vc {
            node: <T::CellMode as VcCellMode<T>>::raw_cell(
                SharedReference::new(value).into_typed(type_id),
            ),
            _t: PhantomData,
        }
    }
}

impl<T> ReadRef<T>
where
    T: VcValueType,
{
    pub fn try_unwrap(this: Self) -> Result<VcReadTarget<T>, Self> {
        match triomphe::Arc::try_unwrap(this.0) {
            Ok(value) => Ok(T::Read::value_to_target(value)),
            Err(arc) => Err(Self(arc)),
        }
    }
}

impl<T> ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: Clone,
{
    /// This is return a owned version of the value. It potentially clones the value.
    /// The clone might be expensive. Prefer Deref to get a reference to the value.
    pub fn into_owned(this: Self) -> VcReadTarget<T> {
        Self::try_unwrap(this).unwrap_or_else(|this| (*this).clone())
    }
}
