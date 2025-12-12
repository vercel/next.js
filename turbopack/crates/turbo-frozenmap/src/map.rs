use std::{
    borrow::Borrow,
    collections::{BTreeMap, HashMap},
    fmt::{self, Debug},
    hash::BuildHasher,
    iter::FusedIterator,
    ops::{Bound, Index, RangeBounds},
};

use bincode::{BorrowDecode, Decode, Encode};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

/// A compact frozen (immutable) ordered map backed by a sorted boxed slice.
///
/// This is a read-only map that stores key-value pairs in a contiguous, sorted array. It provides
/// efficient sorted iteration and binary search lookups, but cannot be modified after construction.
///
/// # Construction
///
/// If you're building a new map, and you don't expect many overlapping keys, consider pushing
/// entries into a [`Vec<(K, V)>`] and calling [`FrozenMap::from`]. It is typically cheaper to
/// collect into a [`Vec`] and sort the entries once at the end than it is to maintain a temporary
/// map data structure.
///
/// If you already have a map, need to perform lookups during construction, or you have many
/// overlapping keys that you don't want to temporarily hold onto, you can use the provided [`From`]
/// trait implementations to create a [`FrozenMap`] from one of many common collections. You should
/// prefer using a [`BTreeMap`], as it matches the sorted iteration order of [`FrozenMap`] and
/// avoids a sort operation during conversion.
///
/// If you don't have an existing collection, you can use the [`FromIterator<(K, V)>`] trait
/// implementation to [`.collect()`][Iterator::collect] tuples into a [`FrozenMap`].
///
/// Finally, if you have a list of pre-sorted tuples with unique keys, you can use the advanced
/// [`FrozenMap::from_unique_sorted_box`] or [`FrozenMap::from_unique_sorted_box_unchecked`]
/// constructors, which provide the cheapest possible construction.
///
/// Overlapping keys encountered during construction preserve the last overlapping entry, matching
/// similar behavior for other maps in the standard library.
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Encode, Decode, Serialize, Deserialize)]
#[rustfmt::skip] // rustfmt breaks bincode's proc macro string processing
#[bincode(
    decode_bounds = "K: Decode<__Context> + 'static, V: Decode<__Context> + 'static",
    borrow_decode_bounds = "K: BorrowDecode<'__de, __Context> + '__de, V: BorrowDecode<'__de, __Context> + '__de"
)]
pub struct FrozenMap<K, V> {
    /// Invariant: entries are sorted by key in ascending order with no overlapping keys.
    pub(crate) entries: Box<[(K, V)]>,
}

impl<K, V> FrozenMap<K, V> {
    /// Creates an empty [`FrozenMap`]. Does not perform any heap allocations.
    pub fn new() -> Self {
        FrozenMap {
            // Box does not perform heap allocations for zero-sized types.
            // In theory this could even be `const` using `Unique::dangling`, but there's no way to
            // construct a `Box` from a pointer during `const`.
            entries: Box::from([]),
        }
    }
}

impl<K, V> FrozenMap<K, V>
where
    K: Ord,
{
    /// Creates a [`FrozenMap`] from a pre-sorted boxed slice with unique keys.
    ///
    /// Panics if the keys in `entries` are not unique and sorted.
    pub fn from_unique_sorted_box(entries: Box<[(K, V)]>) -> Self {
        assert_unique_sorted(&entries);
        FrozenMap { entries }
    }

    /// Creates a [`FrozenMap`] from a pre-sorted boxed slice with unique keys.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The entries are sorted by key in ascending order according to [`K: Ord`][Ord]
    /// - There are no overlapping keys
    ///
    /// If these invariants are not upheld, the map will behave incorrectly (e.g.,
    /// [`FrozenMap::get`] may fail to find keys that are present), but no memory unsafety will
    /// occur.
    ///
    /// When `debug_assertions` is enabled, this will panic if an invariant is not upheld.
    pub fn from_unique_sorted_box_unchecked(entries: Box<[(K, V)]>) -> Self {
        debug_assert_unique_sorted(&entries);
        FrozenMap { entries }
    }

    /// Helper: Sorts keys before constructing. Does not perform any assertions.
    ///
    /// The caller of this helper should provide a fast-path for empty collections.
    pub(crate) fn from_unique_box_inner(mut entries: Box<[(K, V)]>) -> Self {
        entries.sort_unstable_by(|a, b| a.0.cmp(&b.0));
        Self::from_unique_sorted_box_unchecked(entries)
    }

    /// Helper: Sorts and deduplicates keys before constructing. Does not perform any assertions.
    ///
    /// The caller of this helper should provide a fast-path for empty collections.
    pub(crate) fn from_vec_inner(mut entries: Vec<(K, V)>) -> Self {
        // stable sort preserves insertion order for overlapping keys
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        // Deduplicate, keeping the last value for each key.
        // `dedup_by` removes the first argument when returning true, so we swap to keep the later
        // (last) value in the earlier slot.
        entries.dedup_by(|later, earlier| {
            if later.0 == earlier.0 {
                std::mem::swap(later, earlier);
                true
            } else {
                false
            }
        });
        Self::from_unique_sorted_box_unchecked(entries.into_boxed_slice())
    }
}

#[track_caller]
fn assert_unique_sorted<K: Ord, V>(entries: &[(K, V)]) {
    assert!(
        entries.is_sorted_by(|a, b| a.0 < b.0),
        "FrozenMap entries must be unique and sorted",
    )
}

#[track_caller]
fn debug_assert_unique_sorted<K: Ord, V>(entries: &[(K, V)]) {
    debug_assert!(
        entries.is_sorted_by(|a, b| a.0 < b.0),
        "FrozenMap entries must be unique and sorted",
    )
}

impl<K: Ord, V> FromIterator<(K, V)> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an iterator of key-value pairs.
    ///
    /// If there are overlapping keys, the last entry for each key is kept.
    fn from_iter<T: IntoIterator<Item = (K, V)>>(entries: T) -> Self {
        let entries: Vec<_> = entries.into_iter().collect();
        Self::from(entries)
    }
}

impl<K, V> From<BTreeMap<K, V>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from a [`BTreeMap`].
    ///
    /// This is more efficient than `From<HashMap<K, V>>` because [`BTreeMap`] already iterates in
    /// sorted order, so no re-sorting is needed.
    fn from(map: BTreeMap<K, V>) -> Self {
        if map.is_empty() {
            return Self::new();
        }
        FrozenMap {
            entries: map.into_iter().collect(),
        }
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
        Self::from_unique_box_inner(map.into_iter().collect())
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
        Self::from_unique_box_inner(map.into_iter().collect())
    }
}

impl<K: Ord, V> From<Vec<(K, V)>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from a [`Vec`] of key-value pairs.
    ///
    /// If there are overlapping keys, the last entry for each key is kept.
    fn from(entries: Vec<(K, V)>) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(entries)
    }
}

impl<K: Ord, V> From<Box<[(K, V)]>> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from a boxed slice of key-value pairs.
    ///
    /// If there are overlapping keys, the last entry for each key is kept.
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
    /// Creates a [`FrozenMap`] from a slice of key-value pairs. Keys and values are cloned.
    ///
    /// If there are overlapping keys, the last entry for each key is kept.
    fn from(entries: &[(K, V)]) -> Self {
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_vec_inner(Vec::from(entries))
    }
}

impl<K: Ord, V, const N: usize> From<[(K, V); N]> for FrozenMap<K, V> {
    /// Creates a [`FrozenMap`] from an owned array of key-value pairs.
    ///
    /// If there are overlapping keys, the last entry for each key is kept.
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

    /// Constructs a double-ended iterator over a sub-range of entries in the map.
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

    /// Extend this [`FrozenMap`] by constructing a new map with the additional entries. New entries
    /// with overlapping keys will overwrite existing ones.
    #[must_use]
    pub fn extend(&self, entries: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Clone + Ord,
        V: Clone,
    {
        self.as_slice().iter().cloned().chain(entries).collect()
    }
}

// Manual implementation because the derive would add unnecessary `K: Default, V: Default` bounds.
impl<K, V> Default for FrozenMap<K, V> {
    fn default() -> Self {
        Self::new()
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

/// An owning iterator over the entries of a [`FrozenMap`].
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

/// An iterator over the keys of a [`FrozenMap`].
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

// Manual implementation because the derive would add unnecessary `K: Clone, V: Clone` type bounds.
impl<K, V> Clone for Keys<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An iterator over the values of a [`FrozenMap`].
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

// Manual implementation because the derive would add unnecessary `K: Clone, V: Clone` type bounds.
impl<K, V> Clone for Values<'_, K, V> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An owning iterator over the keys of a [`FrozenMap`].
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

/// An owning iterator over the values of a [`FrozenMap`].
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

/// An iterator over a sub-range of entries in a [`FrozenMap`].
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
    fn test_from_overlapping_vec() {
        let frozen = FrozenMap::from(vec![(1, "a"), (1, "b"), (2, "c")]);
        assert_eq!(frozen.len(), 2);
        // Last value wins for overlapping keys
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

        let empty = FrozenMap::<i32, i32>::new();
        let empty_slice: &[(i32, i32)] = empty.as_ref();
        assert_eq!(empty_slice, &[]);
    }

    #[test]
    fn test_from_hashmap() {
        let mut map = HashMap::new();
        map.insert(3, "c");
        map.insert(1, "a");
        map.insert(2, "b");

        let frozen = FrozenMap::from(map);
        assert_eq!(frozen.len(), 3);
        assert_eq!(frozen.get(&1), Some(&"a"));
        let keys: Vec<_> = frozen.keys().copied().collect();
        assert_eq!(keys, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_unique_sorted_box() {
        let frozen = FrozenMap::from_unique_sorted_box(Box::from([(1, "a"), (2, "b")]));
        assert_eq!(frozen.len(), 2);
        assert_eq!(frozen.get(&1), Some(&"a"));
        assert_eq!(frozen.get(&2), Some(&"b"));
    }

    #[test]
    #[should_panic(expected = "FrozenMap entries must be unique and sorted")]
    fn test_from_unique_sorted_box_panics() {
        let _ = FrozenMap::from_unique_sorted_box(Box::from([(1, "a"), (1, "b")]));
    }
}
