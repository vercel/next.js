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
/// elements into a [`Vec`] and calling [`FrozenMap::from_unique_vec`] or
/// [`FrozenMap::from_overlapping_vec`]. It is typically cheaper to collect into a [`Vec`] and sort
/// the entries once at the end than it is to maintain a temporary map data structure.
///
/// If you already have a map, or you have many overlapping keys that you don't want to temporarily
/// hold onto, you can use the [`From`] or [`Into`] traits to create a [`FrozenMap`] from one of
/// many common collections. You should prefer using a [`BTreeMap`], as it matches the sorted
/// semantics of [`FrozenMap`] and avoids a sort operation during conversion.
///
/// [`FromIterator`] and `From<Vec<(K, V)>>` trait implementations are intentionally not provided,
/// because the desired behavior around overlapping keys is potentially ambiguous.
///
/// There are a variety of constructors provided that can be more efficient if you know that your
/// data is sorted and/or unique.
#[derive(
    Clone, Default, PartialEq, Eq, Hash, PartialOrd, Ord, Encode, Decode, Serialize, Deserialize,
)]
#[rustfmt::skip] // rustfmt breaks bincode's proc macro string processing
#[bincode(
    decode_bounds = "K: Decode<__Context> + 'static, V: Decode<__Context> + 'static",
    borrow_decode_bounds = "K: BorrowDecode<'__de, __Context> + '__de, V: BorrowDecode<'__de, __Context> + '__de"
)]
pub struct FrozenMap<K, V> {
    /// Invariant: entries are sorted by key in ascending order with no overlapping keys.
    entries: Box<[(K, V)]>,
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

    /// Creates a [`FrozenMap`] from a pre-sorted boxed slice with unique keys.
    ///
    /// Panics if the keys in `entries` are not unique and sorted.
    pub fn from_unique_sorted_box(entries: Box<[(K, V)]>) -> Self
    where
        K: Ord,
    {
        assert_unique_sorted(&entries);
        Self::from_unique_sorted_box_unchecked(entries)
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
    pub const fn from_unique_sorted_box_unchecked(entries: Box<[(K, V)]>) -> Self {
        FrozenMap { entries }
    }

    /// Creates a [`FrozenMap`] from a pre-sorted slice with unique keys.
    ///
    /// This may be more efficient than [`FrozenMap::from_unique_sorted_iter`] because it
    /// may be reduced to a simple `memmove` for types implementing [`Copy`], plus an ordering
    /// check.
    ///
    /// Panics if the keys in `entries` are not unique and sorted.
    pub fn from_unique_sorted_slice(entries: &[(K, V)]) -> Self
    where
        K: Clone + Ord,
        V: Clone,
    {
        assert_unique_sorted(entries);
        Self::from_unique_sorted_slice_unchecked(entries)
    }

    /// Creates a [`FrozenMap`] from a pre-sorted slice with unique keys.
    ///
    /// This may be more efficient than [`FrozenMap::from_unique_sorted_iter_unchecked`] because it
    /// may be reduced to a simple `memmove` for types implementing [`Copy`].
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
    pub fn from_unique_sorted_slice_unchecked(entries: &[(K, V)]) -> Self
    where
        K: Clone,
        V: Clone,
    {
        Self::from_unique_sorted_box_unchecked(Box::from(entries))
    }

    /// Creates a [`FrozenMap`] from an iterator that yields sorted unique keys.
    ///
    /// Panics if the keys in `entries` are not unique and sorted.
    pub fn from_unique_sorted_iter(entries: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Ord,
    {
        let this = Self::from_unique_sorted_iter_unchecked(entries);
        assert_unique_sorted(&this.entries);
        this
    }

    /// Creates a [`FrozenMap`] from a pre-sorted iterator with unique keys.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The iterator yields elements sorted by key in ascending order according to [`K: Ord`][Ord]
    /// - There are no overlapping keys
    ///
    /// If these invariants are not upheld, the map will behave incorrectly (e.g.,
    /// [`FrozenMap::get`] may fail to find keys that are present), but no memory unsafety will
    /// occur.
    pub fn from_unique_sorted_iter_unchecked(iter: impl IntoIterator<Item = (K, V)>) -> Self {
        Self::from_unique_sorted_box_unchecked(iter.into_iter().collect())
    }

    /// Creates a [`FrozenMap`] from an unsorted iterator of unique keys. Entries are sorted by key.
    ///
    /// This is more efficient than [`FrozenMap::from_overlapping_iter`] if you know the keys are
    /// unique.
    ///
    /// Panics if any of the keys in `entries` are overlapping.
    pub fn from_unique_iter(entries: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Ord,
    {
        let this = Self::from_unique_iter_unchecked(entries);
        assert_unique(&this.entries);
        this
    }

    /// Creates a [`FrozenMap`] from an unsorted iterator of unique keys. Entries are sorted by key.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that there are no overlapping keys.
    ///
    /// If this invariant is not upheld, the map will behave incorrectly (e.g., [`FrozenMap::get`]
    /// may fail to find keys that are present), but no memory unsafety will occur.
    pub fn from_unique_iter_unchecked(entries: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Ord,
    {
        let entries: Box<[(K, V)]> = entries.into_iter().collect();
        if entries.is_empty() {
            return Self::new();
        }
        Self::from_unique_box_unchecked(entries)
    }

    /// Creates a [`FrozenMap`] from a boxed slice with unique keys.
    ///
    /// Panics if any of the keys in `entries` are overlapping.
    pub fn from_unique_box(entries: Box<[(K, V)]>) -> Self
    where
        K: Ord,
    {
        let this = Self::from_unique_box_unchecked(entries);
        assert_unique(&this.entries);
        this
    }

    /// Creates a [`FrozenMap`] from a boxed slice with unique keys.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that there are no overlapping keys.
    ///
    /// If this invariant is not upheld, the map will behave incorrectly (e.g., [`FrozenMap::get`]
    /// may fail to find keys that are present), but no memory unsafety will occur.
    pub fn from_unique_box_unchecked(mut entries: Box<[(K, V)]>) -> Self
    where
        K: Ord,
    {
        entries.sort_unstable_by(|a, b| a.0.cmp(&b.0));
        Self::from_unique_sorted_box_unchecked(entries)
    }

    /// Creates a [`FrozenMap`] from a [`Vec`] with unique keys.
    ///
    /// Panics if any of the keys in `entries` are overlapping.
    pub fn from_unique_vec(entries: Vec<(K, V)>) -> Self
    where
        K: Ord,
    {
        Self::from_unique_box(entries.into_boxed_slice())
    }

    /// Creates a [`FrozenMap`] from a [`Vec`] with unique keys.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that there are no overlapping keys.
    ///
    /// If this invariant is not upheld, the map will behave incorrectly (e.g., [`FrozenMap::get`]
    /// may fail to find keys that are present), but no memory unsafety will occur.
    pub fn from_unique_vec_unchecked(entries: Vec<(K, V)>) -> Self
    where
        K: Ord,
    {
        Self::from_unique_box_unchecked(entries.into_boxed_slice())
    }

    /// Creates a [`FrozenMap`] from a sorted [`Vec`] with potentially-overlapping keys.
    ///
    /// In the case of overlapping keys, only the last overlapping entry is preserved.
    ///
    /// Panics if the keys in `entries` are not in sorted order.
    pub fn from_overlapping_sorted_vec(mut entries: Vec<(K, V)>) -> Self
    where
        K: Ord,
    {
        // Remove overlapping keys, keeping the last value for each key.
        // dedup_by removes the first argument when returning true, so we swap
        // to keep the later (last) value in the earlier slot.
        entries.dedup_by(|later, earlier| {
            if later.0 == earlier.0 {
                std::mem::swap(later, earlier);
                true
            } else {
                // doing the assertion here avoids an extra loop over the entries
                assert!(later.0 > earlier.0, "FrozenMap entries must be sorted");
                false
            }
        });

        // `into_boxed_slice` discards excess capacity (calls `shrink_to_fit`) before boxing
        Self::from_unique_sorted_box(entries.into_boxed_slice())
    }

    /// Creates a [`FrozenMap`] from a sorted [`Vec`] with potentially-overlapping keys.
    ///
    /// In the case of overlapping keys, only the last overlapping entry is preserved.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that the entries are sorted by their key.
    pub fn from_overlapping_sorted_vec_unchecked(mut entries: Vec<(K, V)>) -> Self
    where
        K: Eq,
    {
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

    /// Creates a [`FrozenMap`] from a [`Vec`] with unsorted and potentially-overlapping keys.
    ///
    /// In the case of overlapping keys, only the last overlapping entry is preserved.
    pub fn from_overlapping_vec(mut entries: Vec<(K, V)>) -> Self
    where
        K: Ord,
    {
        // stable sort preserves insertion order for overlapping keys
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        Self::from_overlapping_sorted_vec_unchecked(entries)
    }

    /// Creates a [`FrozenMap`] from a type implementing [`IntoIterator`] with unsorted and
    /// potentially-overlapping keys.
    ///
    /// In the case of overlapping keys, only the last overlapping entry is preserved.
    ///
    /// This is a thin convenience wrapper around [`FrozenMap::from_overlapping_vec`].
    pub fn from_overlapping_iter(entries: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Ord,
    {
        Self::from_overlapping_vec(entries.into_iter().collect())
    }
}

#[track_caller]
fn assert_unique_sorted<K: Ord, V>(entries: &[(K, V)]) {
    assert!(
        entries.is_sorted_by(|a, b| a.0 < b.0),
        "FrozenMap entries must be sorted and unique",
    )
}

#[track_caller]
fn assert_unique<K: Eq, V>(entries: &[(K, V)]) {
    assert!(
        entries.is_sorted_by(|a, b| a.0 != b.0),
        "FrozenMap entries must be unique",
    )
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
        Self::from_unique_sorted_iter_unchecked(map)
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
        Self::from_unique_box_unchecked(map.into_iter().collect())
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
        Self::from_unique_box_unchecked(map.into_iter().collect())
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
    fn test_from_unique_vec() {
        let frozen = FrozenMap::from_unique_vec(vec![(3, "c"), (1, "a"), (2, "b")]);
        assert_eq!(frozen.len(), 3);
        assert_eq!(frozen.get(&1), Some(&"a"));

        let keys: Vec<_> = frozen.keys().copied().collect();
        assert_eq!(keys, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_overlapping_vec() {
        let frozen = FrozenMap::from_overlapping_vec(vec![(1, "a"), (1, "b"), (2, "c")]);
        assert_eq!(frozen.len(), 2);
        // Last value wins for overlapping keys
        assert_eq!(frozen.get(&1), Some(&"b"));
        assert_eq!(frozen.get(&2), Some(&"c"));
    }

    #[test]
    fn test_range() {
        let frozen =
            FrozenMap::from_unique_vec(vec![(1, "a"), (2, "b"), (3, "c"), (4, "d"), (5, "e")]);

        let range: Vec<_> = frozen.range(2..4).collect();
        assert_eq!(range, vec![(&2, &"b"), (&3, &"c")]);

        let range: Vec<_> = frozen.range(2..=4).collect();
        assert_eq!(range, vec![(&2, &"b"), (&3, &"c"), (&4, &"d")]);

        let range: Vec<_> = frozen.range(..3).collect();
        assert_eq!(range, vec![(&1, &"a"), (&2, &"b")]);
    }

    #[test]
    fn test_index() {
        let frozen = FrozenMap::from_unique_vec(vec![(1, "a"), (2, "b")]);
        assert_eq!(frozen[&1], "a");
        assert_eq!(frozen[&2], "b");
    }

    #[test]
    #[should_panic(expected = "no entry found for key")]
    fn test_index_missing() {
        let frozen = FrozenMap::from_unique_vec(vec![(1, "a")]);
        let _ = frozen[&2];
    }

    #[test]
    fn test_first_last() {
        let frozen = FrozenMap::from_unique_vec(vec![(2, "b"), (1, "a"), (3, "c")]);
        assert_eq!(frozen.first_key_value(), Some((&1, &"a")));
        assert_eq!(frozen.last_key_value(), Some((&3, &"c")));

        let empty = FrozenMap::<i32, i32>::new();
        assert_eq!(empty.first_key_value(), None);
        assert_eq!(empty.last_key_value(), None);
    }

    #[test]
    fn test_as_ref() {
        let frozen = FrozenMap::from_unique_vec(vec![(2, "b"), (1, "a"), (3, "c")]);
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
    #[should_panic(expected = "FrozenMap entries must be unique")]
    fn test_from_unique_vec_duplicates_panics() {
        let _ = FrozenMap::from_unique_vec(vec![(1, "a"), (1, "b")]);
    }

    #[test]
    fn test_from_overlapping_sorted_vec() {
        let frozen =
            FrozenMap::from_overlapping_sorted_vec(vec![(1, "a"), (1, "b"), (2, "c"), (2, "d")]);
        assert_eq!(frozen.len(), 2);
        assert_eq!(frozen.get(&1), Some(&"b")); // last value wins
        assert_eq!(frozen.get(&2), Some(&"d"));
    }
}
