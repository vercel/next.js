use std::{
    borrow::Borrow,
    collections::{BTreeMap, HashMap},
    fmt::{self, Debug},
    hash::{BuildHasher, Hash},
    iter::FusedIterator,
    ops::{Bound, Index, RangeBounds},
};

use bincode::{BorrowDecode, Decode, Encode};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

/// A compact frozen (immutable) ordered map backed by a sorted boxed slice.
///
/// This is a read-only map that stores key-value pairs in a contiguous, sorted array. It provides
/// efficient binary search lookups and iteration, but cannot be modified after construction.
#[derive(
    Clone, Default, PartialEq, Eq, Hash, PartialOrd, Ord, Encode, Decode, Serialize, Deserialize,
)]
#[rustfmt::skip] // rustfmt breaks bincode's proc macro string processing
#[bincode(
    decode_bounds = "K: Decode<__Context> + 'static, V: Decode<__Context> + 'static",
    borrow_decode_bounds = "K: BorrowDecode<'__de, __Context> + '__de, V: BorrowDecode<'__de, __Context> + '__de"
)]
pub struct FrozenMap<K, V> {
    /// Invariant: entries are sorted by key in ascending order with no duplicates.
    entries: Box<[(K, V)]>,
}

impl<K, V> FrozenMap<K, V> {
    /// Creates an empty `FrozenMap`. Does not perform any heap allocations.
    pub fn new() -> Self {
        FrozenMap {
            // Box does not perform heap allocations for zero-sized types.
            // In theory this could even be `const` using `Unique::dangling`, but there's no way to
            // construct a `Box` from a pointer during `const`.
            entries: Box::from([]),
        }
    }

    /// Creates a `FrozenMap` from a pre-sorted boxed slice with unique keys. This is a `const`
    /// version of `From<Box<[(K, V)]>>`.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The slice is sorted by key in ascending order according to [`K: Ord`][Ord]
    /// - There are no duplicate keys
    ///
    /// If these invariants are not upheld, the map will behave incorrectly (e.g., `get` may fail to
    /// find keys that are present), but no memory unsafety will occur.
    pub const fn from_uniq_sorted_box(entries: Box<[(K, V)]>) -> Self {
        FrozenMap { entries }
    }

    /// Creates a `FrozenMap` from a pre-sorted slice with unique keys. This is equivalent to
    /// `from_uniq_sorted_iter`, but more efficient, because it can be reduced to a simple
    /// `memmove`.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The slice is sorted by key in ascending order according to [`K: Ord`][Ord]
    /// - There are no duplicate keys
    ///
    /// If these invariants are not upheld, the map will behave incorrectly (e.g.,
    /// [`FrozenMap::get`] may fail to find keys that are present), but no memory unsafety will
    /// occur.
    pub fn from_uniq_sorted_slice(slice: &[(K, V)]) -> Self
    where
        K: Clone,
        V: Clone,
    {
        Self::from_uniq_sorted_box(Box::from(slice))
    }

    /// Creates a [`FrozenMap`] from a pre-sorted iterator with unique keys.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The iterator yields elements sorted by key in ascending order according to `K: Ord`
    /// - There are no duplicate keys
    ///
    /// If these invariants are not upheld, the map will behave incorrectly (e.g.,
    /// [`FrozenMap::get`] may fail to find keys that are present), but no memory unsafety will
    /// occur.
    pub fn from_uniq_sorted_iter(iter: impl IntoIterator<Item = (K, V)>) -> Self {
        let entries: Box<[(K, V)]> = iter.into_iter().collect();
        Self::from_uniq_sorted_box(entries)
    }

    /// Creates a [`FrozenMap`] from an unsorted iterator, sorting by key. This is more efficient
    /// than [`FromIterator`] if you know that the iterator does not contain duplicate entries.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that there are no duplicate keys.
    ///
    /// If this invariant is not upheld, the map will behave incorrectly (e.g., [`FrozenMap::get`]
    /// may fail to find keys that are present), but no memory unsafety will occur.
    pub fn from_uniq_iter(iter: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Ord,
    {
        let entries: Box<[(K, V)]> = iter.into_iter().collect();
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_uniq_box_inner(entries)
    }

    /// Helper: skips `.is_empty` optimization, expects the caller to do that.
    fn from_uniq_box_inner(mut entries: Box<[(K, V)]>) -> Self
    where
        K: Ord,
    {
        // Sort by key (stable sort preserves insertion order for equal keys)
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        Self::from_uniq_sorted_box(entries)
    }

    /// Helper: skips `.is_empty` optimization, expects the caller to do that.
    fn from_vec_inner(mut entries: Vec<(K, V)>) -> Self
    where
        K: Ord,
    {
        // Sort by key (stable sort preserves insertion order for equal keys)
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        // Deduplicate, keeping the last value for each key.
        // dedup_by removes the first argument when returning true, so we swap
        // to keep the later (last) value in the earlier slot.
        entries.dedup_by(|later, earlier| {
            if later.0 == earlier.0 {
                std::mem::swap(later, earlier);
                true
            } else {
                false
            }
        });

        Self::from_uniq_sorted_box(entries.into_boxed_slice())
    }
}

impl<K: Ord, V> FromIterator<(K, V)> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an iterator of key-value pairs.
    ///
    /// If there are duplicate keys, the last value for each key is kept.
    fn from_iter<T: IntoIterator<Item = (K, V)>>(iter: T) -> Self {
        let mut entries: Vec<(K, V)> = iter.into_iter().collect();
        if entries.is_empty() {
            return Self::new();
        }

        // Sort by key (stable sort preserves insertion order for equal keys)
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        // Deduplicate, keeping the last value for each key.
        // dedup_by removes the first argument when returning true, so we swap
        // to keep the later (last) value in the earlier slot.
        entries.dedup_by(|later, earlier| {
            if later.0 == earlier.0 {
                std::mem::swap(later, earlier);
                true
            } else {
                false
            }
        });

        Self::from_uniq_sorted_box(entries.into_boxed_slice())
    }
}

impl<K, V> From<BTreeMap<K, V>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from a [`BTreeMap`].
    ///
    /// This is more efficient than `From<HashMap<K, V>>` because [`BTreeMap`] already iterates in
    /// sorted order, so no re-sorting is needed.
    fn from(map: BTreeMap<K, V>) -> Self {
        Self::from_uniq_sorted_iter(map)
    }
}

impl<K, V, S> From<HashMap<K, V, S>> for FrozenMap<K, V>
where
    K: Ord,
    S: BuildHasher,
{
    /// Creates a [`FrozenMap`] from a [`HashMap`].
    ///
    /// The entries are sorted by key during construction.
    fn from(map: HashMap<K, V, S>) -> Self {
        if map.is_empty() {
            return Self::new();
        }
        Self::from_uniq_box_inner(map.into_iter().collect())
    }
}

impl<K, V, S> From<IndexMap<K, V, S>> for FrozenMap<K, V>
where
    K: Ord,
    S: BuildHasher,
{
    /// Creates a [`FrozenMap`] from an [`IndexMap`].
    ///
    /// The entries are sorted by key during construction.
    fn from(map: IndexMap<K, V, S>) -> Self {
        if map.is_empty() {
            return Self::new();
        }
        Self::from_uniq_box_inner(map.into_iter().collect())
    }
}

impl<K: Ord, V> From<Vec<(K, V)>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an array of key-value pairs.
    ///
    /// If there are duplicate keys, the last value for each key is kept.
    fn from(entries: Vec<(K, V)>) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(entries)
    }
}

impl<K: Ord, V> From<Box<[(K, V)]>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an array of key-value pairs.
    ///
    /// If there are duplicate keys, the last value for each key is kept.
    fn from(entries: Box<[(K, V)]>) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(Vec::from(entries))
    }
}

impl<K, V> From<&[(K, V)]> for FrozenMap<K, V>
where
    K: Ord + Clone,
    V: Clone,
{
    /// Creates a [`FrozenMap`] from a slice of key-value pairs.
    ///
    /// If there are duplicate keys, the last value for each key is kept.
    fn from(entries: &[(K, V)]) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(Vec::from(entries))
    }
}

impl<K: Ord, V, const N: usize> From<[(K, V); N]> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an array of key-value pairs.
    ///
    /// If there are duplicate keys, the last value for each key is kept.
    fn from(entries: [(K, V); N]) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(Vec::from(entries))
    }
}

impl<K, V> FrozenMap<K, V> {
    /// Returns the number of elements in the map.
    pub const fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns `true` if the map contains no elements.
    pub const fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns a reference to the underlying sorted slice.
    pub const fn as_slice(&self) -> &[(K, V)] {
        &self.entries
    }

    /// Returns a reference to the value corresponding to the key.
    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q> + Ord,
        Q: Ord + ?Sized,
    {
        self.get_key_value(key).map(|(_, v)| v)
    }

    /// Returns the key-value pair corresponding to the supplied key.
    pub fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Borrow<Q> + Ord,
        Q: Ord + ?Sized,
    {
        let idx = self
            .entries
            .binary_search_by(|(k, _)| k.borrow().cmp(key))
            .ok()?;
        let (k, v) = &self.entries[idx];
        Some((k, v))
    }

    /// Returns `true` if the map contains a value for the specified key.
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Borrow<Q> + Ord,
        Q: Ord + ?Sized,
    {
        self.entries
            .binary_search_by(|(k, _)| k.borrow().cmp(key))
            .is_ok()
    }

    /// Returns the first key-value pair in the map.
    pub fn first_key_value(&self) -> Option<(&K, &V)> {
        self.entries.first().map(|(k, v)| (k, v))
    }

    /// Returns the last key-value pair in the map.
    pub fn last_key_value(&self) -> Option<(&K, &V)> {
        self.entries.last().map(|(k, v)| (k, v))
    }

    /// Gets an iterator over the entries of the map, sorted by key.
    pub fn iter(&self) -> Iter<'_, K, V> {
        Iter {
            inner: self.entries.iter(),
        }
    }

    /// Gets an iterator over the keys of the map, in sorted order.
    pub fn keys(&self) -> Keys<'_, K, V> {
        Keys { inner: self.iter() }
    }

    /// Gets an iterator over the values of the map, in order by key.
    pub fn values(&self) -> Values<'_, K, V> {
        Values { inner: self.iter() }
    }

    /// Creates a consuming iterator visiting all the keys, in sorted order.
    pub fn into_keys(self) -> IntoKeys<K, V> {
        IntoKeys {
            inner: self.into_iter(),
        }
    }

    /// Creates a consuming iterator visiting all the values, in order by key.
    pub fn into_values(self) -> IntoValues<K, V> {
        IntoValues {
            inner: self.into_iter(),
        }
    }

    /// Constructs a double-ended iterator over a sub-range of elements in the map.
    pub fn range<T, R>(&self, range: R) -> Range<'_, K, V>
    where
        T: Ord + ?Sized,
        K: Borrow<T> + Ord,
        R: RangeBounds<T>,
    {
        let start = match range.start_bound() {
            Bound::Included(key) => self
                .entries
                .binary_search_by(|(k, _)| k.borrow().cmp(key))
                .unwrap_or_else(|i| i),
            Bound::Excluded(key) => {
                match self.entries.binary_search_by(|(k, _)| k.borrow().cmp(key)) {
                    Ok(i) => i + 1,
                    Err(i) => i,
                }
            }
            Bound::Unbounded => 0,
        };

        let end = match range.end_bound() {
            Bound::Included(key) => {
                match self.entries.binary_search_by(|(k, _)| k.borrow().cmp(key)) {
                    Ok(i) => i + 1,
                    Err(i) => i,
                }
            }
            Bound::Excluded(key) => self
                .entries
                .binary_search_by(|(k, _)| k.borrow().cmp(key))
                .unwrap_or_else(|i| i),
            Bound::Unbounded => self.entries.len(),
        };

        let slice = if start <= end && end <= self.entries.len() {
            &self.entries[start..end]
        } else {
            &[]
        };

        Range {
            inner: slice.iter(),
        }
    }
}

impl<K: Debug, V: Debug> Debug for FrozenMap<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_map().entries(self.iter()).finish()
    }
}

impl<K, Q: ?Sized, V> Index<&Q> for FrozenMap<K, V>
where
    K: Borrow<Q> + Ord,
    Q: Ord,
{
    type Output = V;

    fn index(&self, key: &Q) -> &V {
        self.get(key).expect("no entry found for key")
    }
}

impl<K, V> AsRef<[(K, V)]> for FrozenMap<K, V> {
    fn as_ref(&self) -> &[(K, V)] {
        self.as_slice()
    }
}

impl<K, V> From<FrozenMap<K, V>> for Box<[(K, V)]> {
    fn from(map: FrozenMap<K, V>) -> Self {
        map.entries
    }
}

impl<'a, K, V> IntoIterator for &'a FrozenMap<K, V> {
    type Item = (&'a K, &'a V);
    type IntoIter = Iter<'a, K, V>;

    fn into_iter(self) -> Iter<'a, K, V> {
        self.iter()
    }
}

impl<K, V> IntoIterator for FrozenMap<K, V> {
    type Item = (K, V);
    type IntoIter = IntoIter<K, V>;

    fn into_iter(self) -> IntoIter<K, V> {
        IntoIter {
            inner: self.entries.into_vec().into_iter(),
        }
    }
}

/// An iterator over the entries of a [`FrozenMap`].
pub struct Iter<'a, K, V> {
    inner: std::slice::Iter<'a, (K, V)>,
}

impl<K: Debug, V: Debug> Debug for Iter<'_, K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list()
            .entries(self.inner.clone().map(|(k, v)| (k, v)))
            .finish()
    }
}

impl<'a, K, V> Iterator for Iter<'a, K, V> {
    type Item = (&'a K, &'a V);

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(k, v)| (k, v))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn last(mut self) -> Option<Self::Item> {
        self.next_back()
    }

    fn nth(&mut self, n: usize) -> Option<Self::Item> {
        self.inner.nth(n).map(|(k, v)| (k, v))
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for Iter<'_, K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(k, v)| (k, v))
    }

    fn nth_back(&mut self, n: usize) -> Option<Self::Item> {
        self.inner.nth_back(n).map(|(k, v)| (k, v))
    }
}

impl<K, V> ExactSizeIterator for Iter<'_, K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for Iter<'_, K, V> {}

// Manual implementation because the derive would add unnecessary `K: Clone, V: Clone` type bounds.
impl<K, V> Clone for Iter<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An owning iterator over the entries of a `FrozenMap`.
pub struct IntoIter<K, V> {
    inner: std::vec::IntoIter<(K, V)>,
}

impl<K: Debug, V: Debug> Debug for IntoIter<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.inner.as_slice()).finish()
    }
}

impl<K, V> Iterator for IntoIter<K, V> {
    type Item = (K, V);

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for IntoIter<K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back()
    }
}

impl<K, V> ExactSizeIterator for IntoIter<K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for IntoIter<K, V> {}

/// An iterator over the keys of a `FrozenMap`.
pub struct Keys<'a, K, V> {
    inner: Iter<'a, K, V>,
}

impl<K: Debug, V> Debug for Keys<'_, K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list()
            .entries(self.inner.inner.clone().map(|(k, _)| k))
            .finish()
    }
}

impl<'a, K, V> Iterator for Keys<'a, K, V> {
    type Item = &'a K;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(k, _)| k)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn last(mut self) -> Option<Self::Item> {
        self.next_back()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for Keys<'_, K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(k, _)| k)
    }
}

impl<K, V> ExactSizeIterator for Keys<'_, K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for Keys<'_, K, V> {}

// Manual implementation because the derive would add an unnecessary `K: Clone, V: Clone` type
// bounds.
impl<K, V> Clone for Keys<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An iterator over the values of a `FrozenMap`.
pub struct Values<'a, K, V> {
    inner: Iter<'a, K, V>,
}

impl<K, V: Debug> Debug for Values<'_, K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list()
            .entries(self.inner.inner.clone().map(|(_, v)| v))
            .finish()
    }
}

impl<'a, K, V> Iterator for Values<'a, K, V> {
    type Item = &'a V;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(_, v)| v)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn last(mut self) -> Option<Self::Item> {
        self.next_back()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for Values<'_, K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(_, v)| v)
    }
}

impl<K, V> ExactSizeIterator for Values<'_, K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for Values<'_, K, V> {}

// Manual implementation because the derive would add an unnecessary `K: Clone, V: Clone` type
// bounds.
impl<K, V> Clone for Values<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An owning iterator over the keys of a `FrozenMap`.
pub struct IntoKeys<K, V> {
    inner: IntoIter<K, V>,
}

impl<K: Debug, V> Debug for IntoKeys<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list()
            .entries(self.inner.inner.as_slice().iter().map(|(k, _)| k))
            .finish()
    }
}

impl<K, V> Iterator for IntoKeys<K, V> {
    type Item = K;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(k, _)| k)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for IntoKeys<K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(k, _)| k)
    }
}

impl<K, V> ExactSizeIterator for IntoKeys<K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for IntoKeys<K, V> {}

/// An owning iterator over the values of a `FrozenMap`.
pub struct IntoValues<K, V> {
    inner: IntoIter<K, V>,
}

impl<K, V: Debug> Debug for IntoValues<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list()
            .entries(self.inner.inner.as_slice().iter().map(|(_, v)| v))
            .finish()
    }
}

impl<K, V> Iterator for IntoValues<K, V> {
    type Item = V;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(_, v)| v)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for IntoValues<K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(_, v)| v)
    }
}

impl<K, V> ExactSizeIterator for IntoValues<K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for IntoValues<K, V> {}

/// An iterator over a sub-range of entries in a `FrozenMap`.
pub struct Range<'a, K, V> {
    inner: std::slice::Iter<'a, (K, V)>,
}

impl<K: Debug, V: Debug> Debug for Range<'_, K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.clone()).finish()
    }
}

impl<'a, K, V> Iterator for Range<'a, K, V> {
    type Item = (&'a K, &'a V);

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next().map(|(k, v)| (k, v))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn last(mut self) -> Option<Self::Item> {
        self.next_back()
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<K, V> DoubleEndedIterator for Range<'_, K, V> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.inner.next_back().map(|(k, v)| (k, v))
    }
}

impl<K, V> ExactSizeIterator for Range<'_, K, V> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<K, V> FusedIterator for Range<'_, K, V> {}

// Manual implementation because the derive would add unnecessary `K: Clone, V: Clone` type bounds.
impl<K, V> Clone for Range<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty() {
        let map = FrozenMap::<i32, i32>::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);
        assert_eq!(map.get(&1), None);
    }

    #[test]
    fn test_from_btreemap() {
        let mut btree = BTreeMap::new();
        btree.insert(3, "c");
        btree.insert(1, "a");
        btree.insert(2, "b");

        let frozen = FrozenMap::from(btree);
        assert_eq!(frozen.len(), 3);
        assert_eq!(frozen.get(&1), Some(&"a"));
        assert_eq!(frozen.get(&2), Some(&"b"));
        assert_eq!(frozen.get(&3), Some(&"c"));

        let keys: Vec<_> = frozen.keys().copied().collect();
        assert_eq!(keys, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_array() {
        let frozen = FrozenMap::from([(3, "c"), (1, "a"), (2, "b")]);
        assert_eq!(frozen.len(), 3);
        assert_eq!(frozen.get(&1), Some(&"a"));

        let keys: Vec<_> = frozen.keys().copied().collect();
        assert_eq!(keys, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_iter_with_duplicates() {
        let frozen: FrozenMap<_, _> = [(1, "a"), (1, "b"), (2, "c")].into_iter().collect();
        assert_eq!(frozen.len(), 2);
        // Last value wins for duplicates
        assert_eq!(frozen.get(&1), Some(&"b"));
        assert_eq!(frozen.get(&2), Some(&"c"));
    }

    #[test]
    fn test_range() {
        let frozen = FrozenMap::from([(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")]);

        let range: Vec<_> = frozen.range(2..4).collect();
        assert_eq!(range, vec![(&2, &"b"), (&3, &"c")]);

        let range: Vec<_> = frozen.range(2..=4).collect();
        assert_eq!(range, vec![(&2, &"b"), (&3, &"c"), (&4, &"d")]);

        let range: Vec<_> = frozen.range(..3).collect();
        assert_eq!(range, vec![(&1, &"a"), (&2, &"b")]);
    }

    #[test]
    fn test_index() {
        let frozen = FrozenMap::from([(1, "a"), (2, "b")]);
        assert_eq!(frozen[&1], "a");
        assert_eq!(frozen[&2], "b");
    }

    #[test]
    #[should_panic(expected = "no entry found for key")]
    fn test_index_missing() {
        let frozen = FrozenMap::from([(1, "a")]);
        let _ = frozen[&2];
    }

    #[test]
    fn test_first_last() {
        let frozen = FrozenMap::from([(2, "b"), (1, "a"), (3, "c")]);
        assert_eq!(frozen.first_key_value(), Some((&1, &"a")));
        assert_eq!(frozen.last_key_value(), Some((&3, &"c")));

        let empty = FrozenMap::<i32, i32>::new();
        assert_eq!(empty.first_key_value(), None);
        assert_eq!(empty.last_key_value(), None);
    }

    #[test]
    fn test_as_ref() {
        let frozen = FrozenMap::from([(2, "b"), (1, "a"), (3, "c")]);
        let slice: &[(i32, &str)] = frozen.as_ref();
        assert_eq!(slice, &[(1, "a"), (2, "b"), (3, "c")]);
    }
}
