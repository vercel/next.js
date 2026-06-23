use std::{
    cmp::Ordering,
    fmt::{self, Debug, Display},
    hash::{Hash, Hasher},
    marker::PhantomData,
    ops::Deref,
};

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode_with_context,
};
use serde::{Deserialize, Serialize};
use turbo_tasks_hash::DeterministicHash;

#[cfg(debug_assertions)]
use crate::debug::{ValueDebugFormat, ValueDebugFormatString};
use crate::{
    ResolvedVc, SharedReference, Vc, VcRead, VcValueType,
    trace::{TraceRawVcs, TraceRawVcsContext},
    vc::VcCellMode,
};

type VcReadTarget<T> = <<T as VcValueType>::Read as VcRead<T>>::Target;

/// The read value of a value cell. The read value is immutable, while the cell
/// itself might change over time. It's basically a snapshot of a value at a
/// certain point in time.
///
/// Internally it stores a reference counted reference to a value on the heap.
pub struct ReadRef<T>(pub(crate) triomphe::Arc<T>);

impl<T> Clone for ReadRef<T> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<T> Deref for ReadRef<T>
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
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl<T> Debug for ReadRef<T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Self::as_raw_ref(self).fmt(f)
    }
}

impl<T> TraceRawVcs for ReadRef<T>
where
    T: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        Self::as_raw_ref(self).trace_raw_vcs(trace_context);
    }
}

#[cfg(debug_assertions)]
impl<T> ValueDebugFormat for ReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: ValueDebugFormat + 'static,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString<'_> {
        let value = &**self;
        value.value_debug_format(depth)
    }
}

impl<T> PartialEq for ReadRef<T>
where
    T: Eq,
{
    fn eq(&self, other: &Self) -> bool {
        // Fast path: if both point to the same allocation, they're equal.
        Self::ptr_eq(self, other) || Self::as_raw_ref(self).eq(Self::as_raw_ref(other))
    }
}

impl<T> Eq for ReadRef<T> where T: Eq {}

impl<T> PartialOrd for ReadRef<T>
where
    T: PartialOrd + Eq,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Self::as_raw_ref(self).partial_cmp(Self::as_raw_ref(other))
    }
}

impl<T> Ord for ReadRef<T>
where
    T: Ord + Eq,
{
    fn cmp(&self, other: &Self) -> Ordering {
        Self::as_raw_ref(self).cmp(Self::as_raw_ref(other))
    }
}

impl<T> Hash for ReadRef<T>
where
    T: Hash,
{
    fn hash<H: Hasher>(&self, state: &mut H) {
        Self::as_raw_ref(self).hash(state)
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

/// Iterate by reference over a [`ReadRef`].
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

impl<T, I, J> IntoIterator for ReadRef<T>
where
    T: VcValueType,
    I: Copy + 'static,
    J: Iterator<Item = &'static I> + 'static,
    &'static VcReadTarget<T>: IntoIterator<Item = &'static I, IntoIter = J>,
{
    type Item = I;
    type IntoIter = ReadRefIter<T, I, J>;

    fn into_iter(self) -> Self::IntoIter {
        let r: &VcReadTarget<T> = &self;
        // SAFETY: The `&'static` reference fabricated here is only stored in
        // `iter`, which lives inside the returned `ReadRefIter` alongside the
        // `ReadRef` that owns the data. The public `Iterator::next` only
        // returns `Copy`-ed-out values — no reference (with the fake `'static`
        // lifetime or otherwise) ever leaves the iterator. Struct-field drop
        // order (`iter` then `_read_ref`) drops any references still held by
        // `iter` before the backing storage.
        let r = unsafe { std::mem::transmute::<&VcReadTarget<T>, &'static VcReadTarget<T>>(r) };
        ReadRefIter {
            iter: r.into_iter(),
            _read_ref: self,
        }
    }
}

/// Consuming iteration over a [`ReadRef`], yielding items by **copy**.
///
/// `Iterator::Item` is a fixed associated type — it cannot borrow from
/// `&mut self`.
///
/// The iterator owns the original [`ReadRef`], borrows into the underlying value, and
/// `Iterator::next` simply copies each element out of that borrow. This restricts the impl to
/// element types that are [`Copy`] — typically `ResolvedVc<_>`, integer ids, etc. For
/// non-`Copy` element types (or if you want zero-copy iteration over
/// borrows), iterate by reference instead: `for item in &read_ref { ... }`.
pub struct ReadRefIter<T, I, J>
where
    T: VcValueType,
    I: Copy + 'static,
    J: Iterator<Item = &'static I>,
{
    iter: J,
    _read_ref: ReadRef<T>,
}

impl<T, I, J> Iterator for ReadRefIter<T, I, J>
where
    T: VcValueType,
    I: Copy + 'static,
    J: Iterator<Item = &'static I>,
{
    type Item = I;

    fn next(&mut self) -> Option<I> {
        self.iter.next().copied()
    }
}

impl<T> Serialize for ReadRef<T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Self::as_raw_ref(self).serialize(serializer)
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

impl<T> Encode for ReadRef<T>
where
    T: Encode,
{
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        Self::as_raw_ref(self).encode(encoder)
    }
}

impl<Context, T> Decode<Context> for ReadRef<T>
where
    T: Decode<Context>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let value = T::decode(decoder)?;
        Ok(Self(triomphe::Arc::new(value)))
    }
}

impl_borrow_decode_with_context!(ReadRef<T>, Context, Context, T: Decode<Context>);

impl<T> ReadRef<T> {
    pub fn new_owned(value: T) -> Self {
        Self(triomphe::Arc::new(value))
    }

    pub fn new_arc(arc: triomphe::Arc<T>) -> Self {
        Self(arc)
    }

    /// Returns the reference to `&T`, rather than `<<T as VcValueType>::Read as VcRead<T>>::Target`
    /// (the behavior of [`Deref`]).
    pub fn as_raw_ref(this: &ReadRef<T>) -> &T {
        &this.0
    }

    /// Returns the inner `Arc<T>`.
    pub fn into_raw_arc(self) -> triomphe::Arc<T> {
        self.0
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
    /// Returns a new [`Vc`] that points to the same value as the given reference.
    pub fn cell(read_ref: ReadRef<T>) -> Vc<T> {
        let type_id = T::get_value_type_id();
        Vc {
            node: <T::CellMode as VcCellMode<T>>::raw_cell(
                SharedReference::new(read_ref.0).into_typed(type_id),
            ),
            _t: PhantomData,
        }
    }

    /// Returns a new [`ResolvedVc`] that points to the same value as the given reference.
    pub fn resolved_cell(read_ref: ReadRef<T>) -> ResolvedVc<T> {
        ResolvedVc {
            node: ReadRef::cell(read_ref),
        }
    }
}

impl<T> ReadRef<T>
where
    T: VcValueType,
{
    /// Returns the inner value, if this [`ReadRef`] has exactly one strong reference.
    ///
    /// Otherwise, an [`Err`] is returned with the same [`ReadRef`] that was passed in.
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
