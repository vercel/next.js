use std::{
    borrow::Borrow,
    collections::{BTreeSet, HashSet},
    fmt::{self, Debug},
    hash::BuildHasher,
    iter::FusedIterator,
    ops::RangeBounds,
};

use bincode::{BorrowDecode, Decode, Encode};
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};

use crate::map::{self, FrozenMap};

/// A compact frozen (immutable) ordered set backed by a [`FrozenMap<T, ()>`].
///
/// This is a read-only set that stores elements in a contiguous, sorted array. It provides
/// efficient binary search lookups and iteration, but cannot be modified after construction.
///
/// # Construction
///
/// If you're building a new set, and you don't expect many overlapping items, consider pushing
/// items into a [`Vec`] and calling [`FrozenSet::from`] or using the [`FromIterator`]
/// implementation via [`Iterator::collect`]. It is typically cheaper to collect into a [`Vec`] and
/// sort the items once at the end than it is to maintain a temporary set data structure.
///
/// If you already have a set, or you have many overlapping items that you don't want to temporarily
/// hold onto, you can use the [`From`] or [`Into`] traits to create a [`FrozenSet`] from one of
/// many common collections. You should prefer using a [`BTreeSet`], as it matches the sorted
/// semantics of [`FrozenSet`] and avoids a sort operation during conversion.
///
/// Overlapping items encountered during construction preserve the last overlapping item, matching
/// similar behavior for other sets in the standard library.
///
/// Similar to the API of [`BTreeSet`], there are no convenience methods for constructing from a
/// [`Vec`] or boxed slice. Because of limitations of the internal representation and Rust's memory
/// layout rules, the most efficient way to convert from these data structures is via an
/// [`Iterator`].
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Encode, Decode, Serialize, Deserialize)]
#[bincode(
    decode_bounds = "T: Decode<__Context> + 'static",
    borrow_decode_bounds = "T: BorrowDecode<'__de, __Context> + '__de"
)]
pub struct FrozenSet<T> {
    map: FrozenMap<T, ()>,
}

impl<T> FrozenSet<T> {
    /// Creates an empty [`FrozenSet`]. Does not perform any heap allocations.
    pub fn new() -> Self {
        FrozenSet {
            map: FrozenMap::new(),
        }
    }
}

impl<T> FrozenSet<T>
where
    T: Ord,
{
    /// Creates a [`FrozenSet`] from a pre-sorted iterator with unique items.
    ///
    /// This is more efficient than [`Iterator::collect`] or [`FromIterator::from_iter`] if you know
    /// that the iterator is sorted and has no overlapping items.
    ///
    /// Panics if the `items` are not unique and sorted.
    pub fn from_unique_sorted_iter(items: impl IntoIterator<Item = T>) -> Self {
        FrozenSet {
            map: FrozenMap::from_unique_sorted_box(items.into_iter().map(|t| (t, ())).collect()),
        }
    }

    /// Creates a [`FrozenSet`] from a pre-sorted iterator with unique items.
    ///
    /// This is more efficient than [`Iterator::collect`] or [`FromIterator::from_iter`] if you know
    /// that the iterator is sorted and has no overlapping items.
    ///
    /// # Correctness
    ///
    /// The caller must ensure that:
    /// - The iterator yields items in ascending order according to [`T: Ord`][Ord]
    /// - There are no overlapping items
    ///
    /// If these invariants are not upheld, the set will behave incorrectly (e.g.,
    /// [`FrozenSet::contains`] may fail to find items that are present), but no memory unsafety
    /// will occur.
    ///
    /// When `debug_assertions` is enabled, this will panic if an invariant is not upheld.
    pub fn from_unique_sorted_iter_unchecked(items: impl IntoIterator<Item = T>) -> Self {
        FrozenSet {
            map: FrozenMap::from_unique_sorted_box_unchecked(
                items.into_iter().map(|t| (t, ())).collect(),
            ),
        }
    }
}

impl<T: Ord> FromIterator<T> for FrozenSet<T> {
    /// Creates a [`FrozenSet`] from an iterator of items. If there are overlapping items, only the
    /// last copy is kept.
    fn from_iter<I: IntoIterator<Item = T>>(items: I) -> Self {
        FrozenSet {
            map: FrozenMap::from_iter(items.into_iter().map(|t| (t, ()))),
        }
    }
}

impl<T> From<BTreeSet<T>> for FrozenSet<T> {
    /// Creates a [`FrozenSet`] from a [`BTreeSet`].
    ///
    /// This is more efficient than `From<HashSet<T>>` because [`BTreeSet`] already iterates in
    /// sorted order, so no re-sorting is needed.
    fn from(set: BTreeSet<T>) -> Self {
        if set.is_empty() {
            return Self::new();
        }
        FrozenSet {
            map: FrozenMap {
                entries: set.into_iter().map(|t| (t, ())).collect(),
            },
        }
    }
}

impl<T, S> From<HashSet<T, S>> for FrozenSet<T>
where
    T: Ord,
    S: BuildHasher,
{
    /// Creates a [`FrozenSet`] from a [`HashSet`].
    ///
    /// The items are sorted during construction.
    fn from(set: HashSet<T, S>) -> Self {
        if set.is_empty() {
            return Self::new();
        }
        FrozenSet {
            map: FrozenMap::from_unique_box_inner(set.into_iter().map(|t| (t, ())).collect()),
        }
    }
}

impl<T, S> From<IndexSet<T, S>> for FrozenSet<T>
where
    T: Ord,
    S: BuildHasher,
{
    /// Creates a [`FrozenSet`] from an [`IndexSet`].
    ///
    /// The items are sorted during construction.
    fn from(set: IndexSet<T, S>) -> Self {
        if set.is_empty() {
            return Self::new();
        }
        FrozenSet {
            map: FrozenMap::from_unique_box_inner(set.into_iter().map(|t| (t, ())).collect()),
        }
    }
}

impl<T: Ord, const N: usize> From<[T; N]> for FrozenSet<T> {
    /// Creates a [`FrozenSet`] from an array of items. If there are overlapping items, the last
    /// copy is kept.
    ///
    /// The items are sorted during construction.
    fn from(items: [T; N]) -> Self {
        Self::from_iter(items)
    }
}

impl<T> FrozenSet<T> {
    /// Returns the number of elements in the set.
    pub const fn len(&self) -> usize {
        self.map.len()
    }

    /// Returns `true` if the set contains no elements.
    pub const fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// Returns `true` if the set contains an element equal to the value.
    pub fn contains<Q>(&self, value: &Q) -> bool
    where
        T: Borrow<Q> + Ord,
        Q: Ord + ?Sized,
    {
        self.map.contains_key(value)
    }

    /// Returns a reference to the element in the set, if any, that is equal to the value.
    pub fn get<Q>(&self, value: &Q) -> Option<&T>
    where
        T: Borrow<Q> + Ord,
        Q: Ord + ?Sized,
    {
        self.map.get_key_value(value).map(|(t, _)| t)
    }

    /// Returns a reference to the first element in the set, if any. This element is always the
    /// minimum of all elements in the set.
    pub fn first(&self) -> Option<&T> {
        self.map.first_key_value().map(|(t, _)| t)
    }

    /// Returns a reference to the last element in the set, if any. This element is always the
    /// maximum of all elements in the set.
    pub fn last(&self) -> Option<&T> {
        self.map.last_key_value().map(|(t, _)| t)
    }

    /// Gets an iterator that visits the elements in the [`FrozenSet`] in ascending order.
    pub fn iter(&self) -> Iter<'_, T> {
        self.map.keys()
    }

    /// Constructs a double-ended iterator over a sub-range of elements in the set.
    pub fn range<Q, R>(&self, range: R) -> Range<'_, T>
    where
        Q: Ord + ?Sized,
        T: Borrow<Q> + Ord,
        R: RangeBounds<Q>,
    {
        Range {
            inner: self.map.range(range),
        }
    }

    /// Returns `true` if `self` has no elements in common with `other`. This is equivalent to
    /// checking for an empty intersection.
    pub fn is_disjoint(&self, other: &Self) -> bool
    where
        T: Ord,
    {
        if self.len() <= other.len() {
            self.iter().all(|v| !other.contains(v))
        } else {
            other.iter().all(|v| !self.contains(v))
        }
    }

    /// Returns `true` if the set is a subset of another, i.e., `other` contains at least all the
    /// elements in `self`.
    pub fn is_subset(&self, other: &Self) -> bool
    where
        T: Ord,
    {
        if self.len() > other.len() {
            return false;
        }
        self.iter().all(|v| other.contains(v))
    }

    /// Returns `true` if the set is a superset of another, i.e., `self` contains at least all the
    /// elements in `other`.
    pub fn is_superset(&self, other: &Self) -> bool
    where
        T: Ord,
    {
        other.is_subset(self)
    }
}

// Manual implementation because the derive would add unnecessary `T: Default` bounds.
impl<T> Default for FrozenSet<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: Debug> Debug for FrozenSet<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<'a, T> IntoIterator for &'a FrozenSet<T> {
    type Item = &'a T;
    type IntoIter = Iter<'a, T>;

    fn into_iter(self) -> Iter<'a, T> {
        self.iter()
    }
}

impl<T> IntoIterator for FrozenSet<T> {
    type Item = T;
    type IntoIter = IntoIter<T>;

    fn into_iter(self) -> IntoIter<T> {
        self.map.into_keys()
    }
}

// These could be newtype wrappers (BTreeSet does this), but type aliases are simpler to implement.
pub type Iter<'a, T> = map::Keys<'a, T, ()>;
pub type IntoIter<T> = map::IntoKeys<T, ()>;

/// An iterator over a sub-range of elements in a [`FrozenSet`].
pub struct Range<'a, T> {
    inner: map::Range<'a, T, ()>,
}

impl<T: Debug> Debug for Range<'_, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_list().entries(self.clone()).finish()
    }
}

impl<'a, T> Iterator for Range<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<&'a T> {
        self.inner.next().map(|(t, _)| t)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }

    fn last(self) -> Option<&'a T> {
        self.inner.last().map(|(t, _)| t)
    }

    fn count(self) -> usize {
        self.inner.len()
    }
}

impl<'a, T> DoubleEndedIterator for Range<'a, T> {
    fn next_back(&mut self) -> Option<&'a T> {
        self.inner.next_back().map(|(t, _)| t)
    }
}

impl<T> ExactSizeIterator for Range<'_, T> {
    fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<T> FusedIterator for Range<'_, T> {}

// Manual implementation because the derive would add an unnecessary `T: Clone` type bound.
impl<T> Clone for Range<'_, T> {
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
        let set = FrozenSet::<i32>::new();
        assert!(set.is_empty());
        assert_eq!(set.len(), 0);
        assert!(!set.contains(&1));
    }

    #[test]
    fn test_from_btreeset() {
        let mut btree = BTreeSet::new();
        btree.insert(3);
        btree.insert(1);
        btree.insert(2);

        let frozen = FrozenSet::from(btree);
        assert_eq!(frozen.len(), 3);
        assert!(frozen.contains(&1));
        assert!(frozen.contains(&2));
        assert!(frozen.contains(&3));

        let elements: Vec<_> = frozen.iter().copied().collect();
        assert_eq!(elements, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_array() {
        let frozen = FrozenSet::from([3, 1, 2]);
        assert_eq!(frozen.len(), 3);
        assert!(frozen.contains(&1));

        let elements: Vec<_> = frozen.iter().copied().collect();
        assert_eq!(elements, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_iter_with_duplicates() {
        let frozen: FrozenSet<_> = [1, 1, 2].into_iter().collect();
        assert_eq!(frozen.len(), 2);
        assert!(frozen.contains(&1));
        assert!(frozen.contains(&2));
    }

    #[test]
    fn test_range() {
        let frozen = FrozenSet::from([1, 2, 3, 4, 5]);

        let range: Vec<_> = frozen.range(2..4).copied().collect();
        assert_eq!(range, vec![2, 3]);

        let range: Vec<_> = frozen.range(2..=4).copied().collect();
        assert_eq!(range, vec![2, 3, 4]);

        let range: Vec<_> = frozen.range(..3).copied().collect();
        assert_eq!(range, vec![1, 2]);
    }

    #[test]
    fn test_first_last() {
        let frozen = FrozenSet::from([2, 1, 3]);
        assert_eq!(frozen.first(), Some(&1));
        assert_eq!(frozen.last(), Some(&3));

        let empty = FrozenSet::<i32>::new();
        assert_eq!(empty.first(), None);
        assert_eq!(empty.last(), None);
    }

    #[test]
    fn test_is_disjoint() {
        let a = FrozenSet::from([1, 2, 3]);
        let b = FrozenSet::from([4, 5, 6]);
        let c = FrozenSet::from([3, 4, 5]);

        assert!(a.is_disjoint(&b));
        assert!(!a.is_disjoint(&c));
    }

    #[test]
    fn test_is_subset() {
        let a = FrozenSet::from([1, 2]);
        let b = FrozenSet::from([1, 2, 3]);
        let c = FrozenSet::from([2, 3, 4]);

        assert!(a.is_subset(&b));
        assert!(!a.is_subset(&c));
        assert!(a.is_subset(&a));
    }

    #[test]
    fn test_is_superset() {
        let a = FrozenSet::from([1, 2, 3]);
        let b = FrozenSet::from([1, 2]);
        let c = FrozenSet::from([2, 3, 4]);

        assert!(a.is_superset(&b));
        assert!(!a.is_superset(&c));
        assert!(a.is_superset(&a));
    }

    #[test]
    fn test_from_hashset() {
        let mut set = HashSet::new();
        set.insert(3);
        set.insert(1);
        set.insert(2);

        let frozen = FrozenSet::from(set);
        assert_eq!(frozen.len(), 3);
        assert!(frozen.contains(&1));
        let elements: Vec<_> = frozen.iter().copied().collect();
        assert_eq!(elements, vec![1, 2, 3]);
    }

    #[test]
    fn test_from_unique_sorted_iter() {
        let frozen = FrozenSet::from_unique_sorted_iter([1, 2]);
        assert_eq!(frozen.len(), 2);
        assert!(frozen.contains(&1));
        assert!(frozen.contains(&2));
    }

    #[test]
    #[should_panic(expected = "FrozenMap entries must be unique and sorted")]
    fn test_from_unique_sorted_iter_panics() {
        let _ = FrozenSet::from_unique_sorted_iter([1, 1, 2]);
    }
}
