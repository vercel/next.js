use std::{
    collections::{
        hash_map::{Entry, IntoIter, Iter, RandomState},
        HashMap,
    },
    hash::{BuildHasher, Hash},
    iter::FilterMap,
};

#[derive(Clone, Debug)]
pub struct CountHashSet<T, H = RandomState> {
    inner: HashMap<T, isize, H>,
    negative_entries: usize,
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
    pub fn len(&self) -> usize {
        self.inner.len() - self.negative_entries
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl<T: Eq + Hash, H: BuildHasher> CountHashSet<T, H> {
    /// Returns true, when the value has become visible from outside
    pub fn add_count(&mut self, item: T, count: usize) -> bool {
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

    /// Returns true, when the value has become visible from outside
    pub fn add(&mut self, item: T) -> bool {
        self.add_count(item, 1)
    }

    /// Returns true, when the value is no longer visible from outside
    pub fn remove_count(&mut self, item: T, count: usize) -> bool {
        match self.inner.entry(item) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value -= count as isize;
                if *value > 0 {
                    // It's was and still is positive
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

    /// Returns true, when the value is no longer visible from outside
    pub fn remove(&mut self, item: T) -> bool {
        self.remove_count(item, 1)
    }

    pub fn iter(&self) -> CountHashSetIter<'_, T> {
        CountHashSetIter {
            inner: self.inner.iter().filter_map(filter),
        }
    }

    pub fn into_counts(self) -> IntoIter<T, isize> {
        self.inner.into_iter()
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
}
