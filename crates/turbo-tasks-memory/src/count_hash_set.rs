use std::{
    collections::{
        hash_map::{Entry, Iter},
        HashMap,
    },
    hash::Hash,
    iter::FilterMap,
};

#[derive(Clone)]
pub struct CountHashSet<T> {
    inner: HashMap<T, isize>,
}

impl<T> Default for CountHashSet<T> {
    fn default() -> Self {
        Self {
            inner: Default::default(),
        }
    }
}

impl<T> CountHashSet<T> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<T: Eq + Hash> CountHashSet<T> {
    pub fn add_count(&mut self, item: T, count: usize) -> bool {
        match self.inner.entry(item) {
            Entry::Occupied(mut e) => {
                *e.get_mut() += count as isize;
                false
            }
            Entry::Vacant(e) => {
                e.insert(count as isize);
                true
            }
        }
    }

    pub fn add(&mut self, item: T) -> bool {
        self.add_count(item, 1)
    }

    pub fn remove_count(&mut self, item: T, count: usize) -> bool {
        match self.inner.entry(item) {
            Entry::Occupied(mut e) => {
                let value = e.get_mut();
                let old = *value;
                *value -= count as isize;
                if *value <= 0 {
                    if *value == 0 {
                        e.remove();
                    }
                    old > 0
                } else {
                    false
                }
            }
            Entry::Vacant(e) => {
                e.insert(-(count as isize));
                false
            }
        }
    }

    pub fn remove(&mut self, item: T) -> bool {
        self.remove_count(item, 1)
    }

    pub fn iter(&self) -> CountHashSetIter<'_, T> {
        CountHashSetIter {
            inner: self.inner.iter().filter_map(filter),
        }
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
