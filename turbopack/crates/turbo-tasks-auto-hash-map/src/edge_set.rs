//! A set for a task's dependency edges: a flat array of exactly its elements, inflated to a hash
//! table while it is being changed.
//!
//! A flat set stores exactly its elements: no empty buckets, control bytes or power-of-two rounding
//! as in a hash table. Lookups scan it.
//!
//! * Inflating is implicit: [`EdgeSet::insert`] and [`EdgeSet::remove`] switch an array of more
//!   than 32 elements to a hash table first, as more changes usually follow. [`EdgeSet::contains`]
//!   never changes the representation.
//! * Flattening is explicit: [`EdgeSet::shrink_to_fit`] turns a hash table back into an exactly
//!   sized array. The callers know when a batch of changes is done, e.g. when the owning task
//!   completes.
//! * [`EdgeSet::push`] adds an element the caller guarantees is new, without looking it up or
//!   inflating. A task's reverse edges are only added when the forward edge is new, so they are
//!   pushed.
//!
//! # Representation
//! * A [`TinyVec`] with a `u32` length: up to `INLINE` elements inline, then a heap array.
//! * Or, while inflated, a boxed hash table. The `TinyVec`'s non-zero length leaves room for the
//!   enum's discriminant, so this costs no space.
//!
//! The encoded form (the length, then the elements) is the same as an [`AutoSet`]'s.
//!
//! [`AutoSet`]: crate::AutoSet

use std::{
    fmt::{self, Debug},
    hash::{BuildHasherDefault, Hash},
    iter::FusedIterator,
    slice,
};

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use hashbrown::HashMap;
use rustc_hash::FxHasher;
use shrink_to_fit::ShrinkToFit;

use crate::{TinyVec, tiny_vec};

/// The hash table form. A map, as only hashbrown's maps report their allocation size.
type Table<T> = HashMap<T, (), BuildHasherDefault<FxHasher>>;

/// The largest number of elements a set can hold.
const MAX_LEN: usize = u32::MAX as usize - 1;
/// An array of at most this many elements is scanned rather than inflated.
const MAX_SCANNED_LEN: usize = 32;

/// The flat form.
type Array<T, const INLINE: usize> = TinyVec<T, INLINE, MAX_LEN, u32>;

/// A set of `Copy` values for a task's dependency edges, see the module docs.
pub struct EdgeSet<T, const INLINE: usize = 0>(Repr<T, INLINE>);

enum Repr<T, const INLINE: usize> {
    Flat(Array<T, INLINE>),
    Hashed(Box<Table<T>>),
}

impl<T, const INLINE: usize> Default for EdgeSet<T, INLINE> {
    fn default() -> Self {
        Self::new()
    }
}

/// An iterator over an [`EdgeSet`]'s elements, in no particular order.
pub enum Iter<'a, T> {
    Slice(slice::Iter<'a, T>),
    Table(hashbrown::hash_map::Keys<'a, T, ()>),
}

impl<'a, T> Iterator for Iter<'a, T> {
    type Item = &'a T;

    #[inline]
    fn next(&mut self) -> Option<&'a T> {
        match self {
            Iter::Slice(iter) => iter.next(),
            Iter::Table(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Iter::Slice(iter) => iter.size_hint(),
            Iter::Table(iter) => iter.size_hint(),
        }
    }
}

impl<T> ExactSizeIterator for Iter<'_, T> {}

// Both inner iterators are fused.
impl<T> FusedIterator for Iter<'_, T> {}

impl<T> Clone for Iter<'_, T> {
    fn clone(&self) -> Self {
        match self {
            Iter::Slice(iter) => Iter::Slice(iter.clone()),
            Iter::Table(iter) => Iter::Table(iter.clone()),
        }
    }
}

impl<T, const INLINE: usize> EdgeSet<T, INLINE> {
    pub const fn new() -> Self {
        Self(Repr::Flat(TinyVec::new()))
    }

    #[inline]
    fn is_hashed(&self) -> bool {
        matches!(self.0, Repr::Hashed(_))
    }

    /// Whether the elements are in a hash table, i.e. the set is inflated.
    pub fn is_hash_table(&self) -> bool {
        self.is_hashed()
    }

    #[inline]
    pub fn len(&self) -> usize {
        match &self.0 {
            Repr::Flat(array) => array.len(),
            Repr::Hashed(table) => table.len(),
        }
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The capacity of the heap array, or `0` otherwise.
    fn heap_capacity(&self) -> usize {
        match &self.0 {
            Repr::Flat(array) if array.capacity() > INLINE => array.capacity(),
            _ => 0,
        }
    }

    pub fn iter(&self) -> Iter<'_, T> {
        match &self.0 {
            Repr::Flat(array) => Iter::Slice(array.iter()),
            Repr::Hashed(table) => Iter::Table(table.keys()),
        }
    }

    pub fn clear(&mut self) {
        *self = Self::new();
    }
}

impl<T: Copy + Eq + Hash, const INLINE: usize> EdgeSet<T, INLINE> {
    /// Bytes this set owns on the heap. Excludes heap memory owned by the elements.
    pub fn heap_size(&self) -> usize {
        match &self.0 {
            Repr::Flat(_) => self.heap_capacity() * size_of::<T>(),
            Repr::Hashed(table) => size_of::<Table<T>>() + table.allocation_size(),
        }
    }

    /// Entry slots in the heap allocation: the array's capacity or the hash table's buckets.
    pub fn heap_slots(&self) -> usize {
        match &self.0 {
            Repr::Flat(_) => self.heap_capacity(),
            Repr::Hashed(table) => match table.capacity() {
                0 => 0,
                capacity if capacity < 8 => capacity + 1,
                capacity => capacity / 7 * 8,
            },
        }
    }

    /// Whether `value` is in the set: a hash lookup while inflated, a scan otherwise.
    pub fn contains(&self, value: &T) -> bool {
        match &self.0 {
            Repr::Flat(array) => array.contains(value),
            Repr::Hashed(table) => table.contains_key(value),
        }
    }

    /// Switches a large array to a hash table, ahead of a run of lookups. Small arrays stay
    /// arrays: scanning them is about as fast. [`Self::insert`] and [`Self::remove`] do this
    /// themselves.
    pub fn inflate(&mut self) {
        if let Repr::Flat(array) = &self.0
            && array.len() > MAX_SCANNED_LEN
        {
            let mut table = Table::with_capacity_and_hasher(array.len(), Default::default());
            table.extend(array.iter().map(|&value| (value, ())));
            self.0 = Repr::Hashed(Box::new(table));
        }
    }

    /// Adds `value`, returning whether it was not in the set yet. Looks it up first, inflating a
    /// large array.
    pub fn insert(&mut self, value: T) -> bool {
        self.inflate();
        match &mut self.0 {
            Repr::Flat(array) => {
                if array.contains(&value) {
                    return false;
                }
                array.push(value);
                true
            }
            Repr::Hashed(table) => table.insert(value, ()).is_none(),
        }
    }

    /// Adds `value`, which the caller guarantees isn't in the set yet, without looking for it or
    /// inflating the set. Debug builds check this where it is cheap.
    pub fn push(&mut self, value: T) {
        match &mut self.0 {
            Repr::Flat(array) => {
                debug_assert!(
                    array.len() > MAX_SCANNED_LEN * 2 || !array.contains(&value),
                    "EdgeSet::push of a value that is already in the set"
                );
                array.push(value);
            }
            Repr::Hashed(table) => {
                let new = table.insert(value, ()).is_none();
                debug_assert!(new, "EdgeSet::push of a value that is already in the set");
            }
        }
    }

    /// Removes `value`, returning whether it was in the set. Inflates a large array first.
    pub fn remove(&mut self, value: &T) -> bool {
        self.inflate();
        match &mut self.0 {
            Repr::Flat(array) => {
                let Some(at) = array.iter().position(|v| v == value) else {
                    return false;
                };
                array.swap_remove(at);
                true
            }
            Repr::Hashed(table) => table.remove(value).is_some(),
        }
    }

    /// Adds each value, like [`Self::insert`].
    pub fn extend(&mut self, iter: impl IntoIterator<Item = T>) {
        for value in iter {
            self.insert(value);
        }
    }

    /// Keeps only the elements for which `keep` returns true.
    pub fn retain(&mut self, mut keep: impl FnMut(&T) -> bool) {
        match &mut self.0 {
            Repr::Flat(array) => {
                let elements = array.as_mut_slice();
                let mut kept = 0;
                for i in 0..elements.len() {
                    let value = elements[i];
                    if keep(&value) {
                        elements[kept] = value;
                        kept += 1;
                    }
                }
                // The elements are `Copy`, so dropping the tail needs no destructors.
                array.set_len(kept);
            }
            Repr::Hashed(table) => table.retain(|value, ()| keep(value)),
        }
    }

    /// Flattens a hash table into an exactly sized array, and drops an array's spare capacity,
    /// moving the elements inline if they fit.
    pub fn shrink_to_fit(&mut self) {
        match &mut self.0 {
            Repr::Flat(array) => array.shrink_to_fit(),
            Repr::Hashed(table) => {
                let mut array = Array::with_capacity(table.len());
                array.extend(table.keys().copied());
                self.0 = Repr::Flat(array);
            }
        }
    }
}

impl<T: Copy + Eq + Hash, const INLINE: usize> Clone for EdgeSet<T, INLINE> {
    /// A flat, exactly sized copy.
    fn clone(&self) -> Self {
        let mut array = Array::with_capacity(self.len());
        array.extend(self.iter().copied());
        Self(Repr::Flat(array))
    }
}

impl<T: Debug, const INLINE: usize> Debug for EdgeSet<T, INLINE> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<T: Copy + Eq + Hash, const INLINE: usize> PartialEq for EdgeSet<T, INLINE> {
    fn eq(&self, other: &Self) -> bool {
        self.len() == other.len() && self.iter().all(|value| other.contains(value))
    }
}

impl<T: Copy + Eq + Hash, const INLINE: usize> Eq for EdgeSet<T, INLINE> {}

impl<T: Copy + Eq + Hash, const INLINE: usize> FromIterator<T> for EdgeSet<T, INLINE> {
    /// Adds each value, like [`EdgeSet::insert`], and shrinks the result to fit. Presized from
    /// the iterator's lower size bound: as a hash table if inserting that many would inflate the
    /// set anyway.
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        let mut set = Self(if lower > MAX_SCANNED_LEN {
            Repr::Hashed(Box::new(Table::with_capacity_and_hasher(
                lower,
                Default::default(),
            )))
        } else {
            Repr::Flat(Array::with_capacity(lower))
        });
        set.extend(iter);
        set.shrink_to_fit();
        set
    }
}

impl<'a, T, const INLINE: usize> IntoIterator for &'a EdgeSet<T, INLINE> {
    type Item = &'a T;
    type IntoIter = Iter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<T: Copy, const INLINE: usize> IntoIterator for EdgeSet<T, INLINE> {
    type Item = T;
    type IntoIter = IntoIter<T, INLINE>;

    fn into_iter(self) -> Self::IntoIter {
        IntoIter(match self.0 {
            Repr::Flat(array) => IntoIterInner::Array(array.into_iter()),
            Repr::Hashed(table) => IntoIterInner::Table(table.into_keys()),
        })
    }
}

/// An owning iterator over an [`EdgeSet`]'s elements, in no particular order.
pub struct IntoIter<T, const INLINE: usize>(IntoIterInner<T, INLINE>);

enum IntoIterInner<T, const INLINE: usize> {
    Array(tiny_vec::IntoIter<T, INLINE, MAX_LEN, u32>),
    Table(hashbrown::hash_map::IntoKeys<T, ()>),
}

impl<T: Copy, const INLINE: usize> Iterator for IntoIter<T, INLINE> {
    type Item = T;

    #[inline]
    fn next(&mut self) -> Option<T> {
        match &mut self.0 {
            IntoIterInner::Array(iter) => iter.next(),
            IntoIterInner::Table(keys) => keys.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match &self.0 {
            IntoIterInner::Array(iter) => iter.size_hint(),
            IntoIterInner::Table(keys) => keys.size_hint(),
        }
    }
}

impl<T: Copy, const INLINE: usize> ExactSizeIterator for IntoIter<T, INLINE> {}

// Both inner iterators are fused.
impl<T: Copy, const INLINE: usize> FusedIterator for IntoIter<T, INLINE> {}

impl<T: Copy + Eq + Hash, const INLINE: usize> ShrinkToFit for EdgeSet<T, INLINE> {
    fn shrink_to_fit(&mut self) {
        EdgeSet::shrink_to_fit(self);
    }
}

impl<T: Encode, const INLINE: usize> Encode for EdgeSet<T, INLINE> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.len().encode(encoder)?;
        for value in self.iter() {
            value.encode(encoder)?;
        }
        Ok(())
    }
}

impl<Context, T: Decode<Context> + Copy + Eq + Hash, const INLINE: usize> Decode<Context>
    for EdgeSet<T, INLINE>
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let len = usize::decode(decoder)?;
        if len > MAX_LEN {
            return Err(DecodeError::Other("EdgeSet too large"));
        }
        decoder.claim_container_read::<T>(len)?;
        // An encoded set holds distinct elements, so they are appended without a lookup, into an
        // allocation of exactly their number.
        let mut array = Array::with_capacity(len);
        for _ in 0..len {
            array.push(T::decode(decoder)?);
        }
        Ok(Self(Repr::Flat(array)))
    }
}

impl_borrow_decode!(
    EdgeSet<T, INLINE>,
    T: Decode<__Context> + Copy + Eq + Hash,
    const INLINE: usize,
);

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    struct Lcg(u64);

    impl Lcg {
        fn next(&mut self, bound: u32) -> u32 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((self.0 >> 33) % bound as u64) as u32
        }
    }

    fn sorted<const INLINE: usize>(set: &EdgeSet<u32, INLINE>) -> Vec<u32> {
        let mut elements: Vec<u32> = set.iter().copied().collect();
        elements.sort_unstable();
        elements
    }

    fn random_ops<const INLINE: usize>(seed: u64, ops: usize, range: u32) {
        let mut rng = Lcg(seed);
        let mut set = EdgeSet::<u32, INLINE>::new();
        let mut model = BTreeSet::new();
        for _ in 0..ops {
            let value = rng.next(range);
            match rng.next(12) {
                0..3 => assert_eq!(set.insert(value), model.insert(value)),
                3..6 => {
                    // `push` callers only add values that aren't in the set yet.
                    if model.insert(value) {
                        set.push(value);
                    }
                }
                6..8 => assert_eq!(set.remove(&value), model.remove(&value)),
                8 => {
                    set.retain(|v| v % 7 != value % 7);
                    model.retain(|v| v % 7 != value % 7);
                }
                9 => set.inflate(),
                10 if rng.next(16) == 0 => {
                    set.clear();
                    model.clear();
                }
                _ => {
                    if rng.next(4) == 0 {
                        set.shrink_to_fit();
                    }
                }
            }
            assert_eq!(set.contains(&value), model.contains(&value));
            assert_eq!(set.len(), model.len());
            assert!(sorted(&set).iter().eq(model.iter()));
        }
        assert_eq!(set.clone(), set);
        let mut owned: Vec<_> = set.clone().into_iter().collect();
        owned.sort_unstable();
        assert!(owned.iter().eq(model.iter()));
        set.shrink_to_fit();
        assert!(!set.is_hashed());
        if set.len() > INLINE {
            assert_eq!(set.heap_slots(), set.len());
        } else {
            assert!(!(set.heap_capacity() > 0));
        }
        assert!(sorted(&set).iter().eq(model.iter()));
    }

    #[test]
    fn matches_a_btree_set() {
        let ops = if cfg!(miri) { 400 } else { 20_000 };
        for seed in 0..4 {
            random_ops::<0>(seed, ops, 300);
            random_ops::<3>(seed, ops, 40);
            random_ops::<4>(seed, ops, 2000);
            random_ops::<6>(seed, ops, 2000);
        }
    }

    #[test]
    fn inserts_inflate_and_shrinking_flattens() {
        let mut set = EdgeSet::<u32, 3>::new();
        let n = if cfg!(miri) { 300 } else { 10_000 };
        for i in (0..n).rev() {
            assert!(set.insert(i));
        }
        assert!(set.is_hashed());
        assert!(!set.insert(7));
        set.shrink_to_fit();
        assert!(!set.is_hashed());
        assert_eq!(set.heap_slots(), n as usize);
        // Lookups scan a flat set, without inflating it.
        assert!(set.contains(&7) && !set.contains(&n));
        assert!(!set.is_hashed());
        // Inserting again inflates it.
        assert!(set.insert(n));
        assert!(set.is_hashed());
    }

    #[test]
    fn pushes_append_until_a_removal_inflates() {
        let mut set = EdgeSet::<u32, 3>::new();
        let n = if cfg!(miri) { 300 } else { 10_000 };
        for i in 0..n {
            set.push(i);
        }
        assert!(!set.is_hashed());
        assert!(set.iter().copied().eq(0..n));
        assert!(set.remove(&5) && !set.contains(&5));
        assert!(set.is_hashed());
        set.push(n);
        assert_eq!(set.len(), n as usize);
    }

    #[test]
    fn owning_iteration() {
        for n in [0u32, 3, 20, 100] {
            for inflated in [false, true] {
                let build = || {
                    let mut set: EdgeSet<u32, 3> = (0..n).collect();
                    if inflated {
                        set.inflate();
                    }
                    assert_eq!(set.is_hashed(), inflated && n > 32);
                    set
                };
                let mut iter = build().into_iter();
                assert_eq!(iter.len(), n as usize);
                let mut values: Vec<u32> = iter.by_ref().collect();
                assert_eq!(iter.next(), None);
                values.sort_unstable();
                assert!(values.into_iter().eq(0..n));
                // Dropping a partly consumed iterator frees the rest.
                let mut iter = build().into_iter();
                iter.next();
            }
        }
    }

    #[test]
    fn collect_presizes_and_fits() {
        // The size hint counts every value twice: 200 presizes a hash table, 20 an array. The
        // result is flat and exactly sized either way.
        for n in [100u32, 10, 0] {
            let set: EdgeSet<u32, 3> = (0..n).chain(0..n).collect();
            assert!(!set.is_hashed());
            assert_eq!(set.len(), n as usize);
            if n > 3 {
                assert_eq!(set.heap_slots(), n as usize);
            }
            assert!(sorted(&set).into_iter().eq(0..n));
        }
    }

    #[test]
    fn small_sets_stay_arrays() {
        let mut set: EdgeSet<u32, 4> = (0..20).collect();
        set.inflate();
        assert!(set.remove(&19) && !set.is_hashed());
        set.retain(|&v| v < 3);
        set.shrink_to_fit();
        assert!(!(set.heap_capacity() > 0));
        assert_eq!(set.heap_size(), 0);
    }

    #[test]
    fn same_size_as_an_auto_set() {
        assert_eq!(size_of::<EdgeSet<u32, 6>>(), 32);
        assert_eq!(size_of::<EdgeSet<u32, 4>>(), 24);
        assert_eq!(size_of::<EdgeSet<u64, 3>>(), 32);
        assert_eq!(size_of::<EdgeSet<u32, 0>>(), 16);
    }

    #[test]
    fn encodes_like_an_auto_set() {
        let config = bincode::config::standard();
        let set: EdgeSet<u32, 2> = [5, 3, 9, 1, 7].into_iter().collect();
        let encoded = bincode::encode_to_vec(&set, config).unwrap();
        let auto: crate::AutoSet<u32> = [5, 3, 9, 1, 7].into_iter().collect();
        let (decoded_auto, _): (crate::AutoSet<u32>, _) =
            bincode::decode_from_slice(&encoded, config).unwrap();
        assert_eq!(decoded_auto, auto);
        let from_auto = bincode::encode_to_vec(&auto, config).unwrap();
        let (decoded, _): (EdgeSet<u32, 2>, _) =
            bincode::decode_from_slice(&from_auto, config).unwrap();
        assert_eq!(decoded.len(), 5);
        assert!([5, 3, 9, 1, 7].iter().all(|v| decoded.contains(v)));
    }
}
