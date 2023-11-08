use std::{
    borrow::Borrow,
    collections::hash_map::RandomState,
    fmt::{Debug, Formatter},
    hash::{BuildHasher, Hash},
    iter::FilterMap,
};

use auto_hash_map::{
    map::{Entry, Iter, RawEntry},
    AutoMap,
};

#[derive(Clone)]
pub struct CountHashSet<T, H = RandomState> {
    inner: AutoMap<T, isize, H>,
    negative_entries: usize,
}

impl<T: Debug, H> Debug for CountHashSet<T, H> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CountHashSet")
            .field("inner", &self.inner)
            .field("negative_entries", &self.negative_entries)
            .finish()
    }
}

impl<T: Eq + Hash, H: BuildHasher + Default, const N: usize> From<[T; N]> for CountHashSet<T, H> {
    fn from(list: [T; N]) -> Self {
        let mut set = CountHashSet::default();
        for item in list {
            set.add(item);
        }
        set
    }
}

impl<T, H: Default> Default for CountHashSet<T, H> {
    fn default() -> Self {
        Self {
            inner: Default::default(),
            negative_entries: 0,
        }
    }
}

impl<T, H: Default> CountHashSet<T, H> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<T, H> CountHashSet<T, H> {
    /// Get the number of positive entries
    pub fn len(&self) -> usize {
        self.inner.len() - self.negative_entries
    }

    /// Checks if the set looks empty from outside. It might still have negative
    /// entries, but they should be treated as not existing.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum RemoveIfEntryResult {
    PartiallyRemoved,
    Removed,
    NotPresent,
}

impl<T: Eq + Hash, H: BuildHasher + Default> CountHashSet<T, H> {
    /// Returns true, when the value has become visible from outside
    pub fn add_count(&mut self, item: T, count: usize) -> bool {
        if count == 0 {
            return false;
        }
        match self.inner.entry(item) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value += count as isize;
                if old > 0 {
                    // it was positive before
                    false
                } else if *value > 0 {
                    // it was negative and has become positive
                    self.negative_entries -= 1;
                    true
                } else if *value == 0 {
                    // it was negative and has become zero
                    self.negative_entries -= 1;
                    e.remove();
                    false
                } else {
                    // it was and still is negative
                    false
                }
            }
            Entry::Vacant(e) => {
                // it was zero and is now positive
                e.insert(count as isize);
                true
            }
        }
    }

    /// Returns true when the value has become visible from outside
    pub fn add(&mut self, item: T) -> bool {
        self.add_count(item, 1)
    }

    /// Returns true, when the value has been added. Returns false, when the
    /// value was not part of the set before (positive or negative). The
    /// visibility from outside will never change due to this method.
    pub fn add_if_entry<Q>(&mut self, item: &Q) -> bool
    where
        T: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        match self.inner.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let value = e.get_mut();
                *value += 1;
                if *value == 0 {
                    // it was negative and has become zero
                    self.negative_entries -= 1;
                    e.remove();
                }
                true
            }
            RawEntry::Vacant(_) => false,
        }
    }

    /// Returns true when the value is no longer visible from outside
    pub fn remove_count(&mut self, item: T, count: usize) -> bool {
        if count == 0 {
            return false;
        }
        match self.inner.entry(item) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value -= count as isize;
                if *value > 0 {
                    // It was and still is positive
                    false
                } else if *value == 0 {
                    // It was positive and has become zero
                    e.remove();
                    true
                } else if old > 0 {
                    // It was positive and is negative now
                    self.negative_entries += 1;
                    true
                } else {
                    // It was and still is negative
                    false
                }
            }
            Entry::Vacant(e) => {
                // It was zero and is negative now
                e.insert(-(count as isize));
                self.negative_entries += 1;
                false
            }
        }
    }

    /// Removes an item if it is present.
    pub fn remove_if_entry(&mut self, item: &T) -> RemoveIfEntryResult {
        match self.inner.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let value = e.get_mut();
                if *value < 0 {
                    return RemoveIfEntryResult::NotPresent;
                }
                *value -= 1;
                if *value == 0 {
                    // It was positive and has become zero
                    e.remove();
                    RemoveIfEntryResult::Removed
                } else {
                    RemoveIfEntryResult::PartiallyRemoved
                }
            }
            RawEntry::Vacant(_) => RemoveIfEntryResult::NotPresent,
        }
    }

    pub fn iter(&self) -> CountHashSetIter<'_, T> {
        CountHashSetIter {
            inner: self.inner.iter().filter_map(filter),
        }
    }
}

impl<T: Eq + Hash + Clone, H: BuildHasher + Default> CountHashSet<T, H> {
    /// Returns true, when the value has become visible from outside
    pub fn add_clonable_count(&mut self, item: &T, count: usize) -> bool {
        if count == 0 {
            return false;
        }
        match self.inner.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value += count as isize;
                if old > 0 {
                    // it was positive before
                    false
                } else if *value > 0 {
                    // it was negative and has become positive
                    self.negative_entries -= 1;
                    true
                } else if *value == 0 {
                    // it was negative and has become zero
                    self.negative_entries -= 1;
                    e.remove();
                    false
                } else {
                    // it was and still is negative
                    false
                }
            }
            RawEntry::Vacant(e) => {
                // it was zero and is now positive
                e.insert(item.clone(), count as isize);
                true
            }
        }
    }

    /// Returns true when the value has become visible from outside
    pub fn add_clonable(&mut self, item: &T) -> bool {
        self.add_clonable_count(item, 1)
    }

    /// Returns true when the value is no longer visible from outside
    pub fn remove_clonable_count(&mut self, item: &T, count: usize) -> bool {
        if count == 0 {
            return false;
        }
        match self.inner.raw_entry_mut(item) {
            RawEntry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value -= count as isize;
                if *value > 0 {
                    // It was and still is positive
                    false
                } else if *value == 0 {
                    // It was positive and has become zero
                    e.remove();
                    true
                } else if old > 0 {
                    // It was positive and is negative now
                    self.negative_entries += 1;
                    true
                } else {
                    // It was and still is negative
                    false
                }
            }
            RawEntry::Vacant(e) => {
                // It was zero and is negative now
                e.insert(item.clone(), -(count as isize));
                self.negative_entries += 1;
                false
            }
        }
    }

    /// Returns true, when the value is no longer visible from outside
    pub fn remove_clonable(&mut self, item: &T) -> bool {
        self.remove_clonable_count(item, 1)
    }
}

fn filter<'a, T>((k, v): (&'a T, &'a isize)) -> Option<&'a T> {
    if *v > 0 {
        Some(k)
    } else {
        None
    }
}

type InnerIter<'a, T> =
    FilterMap<Iter<'a, T, isize>, for<'b> fn((&'b T, &'b isize)) -> Option<&'b T>>;

pub struct CountHashSetIter<'a, T> {
    inner: InnerIter<'a, T>,
}

impl<'a, T> Iterator for CountHashSetIter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

#[cfg(test)]
mod tests {
    use nohash_hasher::BuildNoHashHasher;

    use super::*;

    #[test]
    fn test_add_remove() {
        let mut set: CountHashSet<i32, BuildNoHashHasher<i32>> = CountHashSet::new();
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(set.add(1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.add(1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(set.add(2));
        assert_eq!(set.len(), 2);
        assert!(!set.is_empty());

        assert!(set.remove_count(2, 2));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.remove_count(2, 1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.remove_count(1, 1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(set.remove_count(1, 1));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.add_count(2, 2));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert_eq!(
            format!("{:?}", set),
            "CountHashSet { inner: {}, negative_entries: 0 }"
        );
    }

    #[test]
    fn test_add_remove_cloneable() {
        let mut set: CountHashSet<i32, BuildNoHashHasher<i32>> = CountHashSet::new();
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(set.add_clonable(&1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.add_clonable(&1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(set.add_clonable(&2));
        assert_eq!(set.len(), 2);
        assert!(!set.is_empty());

        assert!(set.remove_clonable_count(&2, 2));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.remove_clonable_count(&2, 1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(!set.remove_clonable_count(&1, 1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert!(set.remove_clonable_count(&1, 1));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.add_clonable_count(&2, 2));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert_eq!(
            format!("{:?}", set),
            "CountHashSet { inner: {}, negative_entries: 0 }"
        );
    }

    #[test]
    fn test_add_remove_if_entry() {
        let mut set: CountHashSet<i32, BuildNoHashHasher<i32>> = CountHashSet::new();

        assert!(!set.add_if_entry(&1));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(set.add(1));

        assert!(set.add_if_entry(&1));
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert_eq!(
            set.remove_if_entry(&1),
            RemoveIfEntryResult::PartiallyRemoved
        );
        assert_eq!(set.len(), 1);
        assert!(!set.is_empty());

        assert_eq!(set.remove_if_entry(&1), RemoveIfEntryResult::Removed);
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert_eq!(set.remove_if_entry(&1), RemoveIfEntryResult::NotPresent);
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());
    }

    #[test]
    fn test_zero() {
        let mut set: CountHashSet<i32, BuildNoHashHasher<i32>> = CountHashSet::new();

        assert!(!set.add_count(1, 0));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.remove_count(1, 0));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.add_clonable_count(&1, 0));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.remove_clonable_count(&1, 0));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert!(!set.remove_count(1, 1));
        assert_eq!(set.len(), 0);
        assert!(set.is_empty());

        assert_eq!(set.remove_if_entry(&1), RemoveIfEntryResult::NotPresent);
    }
}
