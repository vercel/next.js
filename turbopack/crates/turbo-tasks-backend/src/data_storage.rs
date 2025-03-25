use std::hash::{BuildHasherDefault, Hash};

use auto_hash_map::{map::Entry, AutoMap};
use rustc_hash::FxHasher;

pub trait Storage {
    type K;
    type V;
    type Iterator<'l>: Iterator<Item = (&'l Self::K, &'l Self::V)> + 'l
    where
        Self: 'l;

    fn add(&mut self, key: Self::K, value: Self::V) -> bool;
    fn insert(&mut self, key: Self::K, value: Self::V) -> Option<Self::V>;
    fn remove(&mut self, key: &Self::K) -> Option<Self::V>;
    fn contains_key(&self, key: &Self::K) -> bool;
    fn get(&self, key: &Self::K) -> Option<&Self::V>;
    fn get_mut(&mut self, key: &Self::K) -> Option<&mut Self::V>;
    fn get_mut_or_insert_with(&mut self, key: Self::K, f: impl FnOnce() -> Self::V)
        -> &mut Self::V;
    fn extract_if<'l, F>(&'l mut self, f: F) -> impl Iterator<Item = (Self::K, Self::V)>
    where
        F: for<'a, 'b> FnMut(&'a Self::K, &'b mut Self::V) -> bool + 'l;
    fn update(&mut self, key: Self::K, update: impl FnOnce(Option<Self::V>) -> Option<Self::V>);
    fn shrink_to_fit(&mut self);
    fn is_empty(&self) -> bool;
    fn len(&self) -> usize;
    fn iter(&self) -> Self::Iterator<'_>;
}

fn value_to_key_value<V>(value: &V) -> (&(), &V) {
    (&(), value)
}

#[derive(Debug)]
pub struct OptionStorage<V> {
    value: Option<V>,
}

impl<V> Default for OptionStorage<V> {
    fn default() -> Self {
        Self { value: None }
    }
}

impl<V> Storage for OptionStorage<V> {
    type K = ();
    type V = V;
    type Iterator<'l>
        = std::option::IntoIter<(&'l (), &'l V)>
    where
        Self: 'l;

    fn add(&mut self, _: (), value: V) -> bool {
        if self.value.is_none() {
            self.value = Some(value);
            true
        } else {
            false
        }
    }

    fn insert(&mut self, _: (), value: V) -> Option<V> {
        self.value.replace(value)
    }

    fn remove(&mut self, _: &()) -> Option<V> {
        self.value.take()
    }

    fn contains_key(&self, _: &()) -> bool {
        self.value.is_some()
    }

    fn get(&self, _: &()) -> Option<&V> {
        self.value.as_ref()
    }

    fn get_mut(&mut self, _: &()) -> Option<&mut V> {
        self.value.as_mut()
    }

    fn get_mut_or_insert_with(&mut self, _: (), f: impl FnOnce() -> V) -> &mut V {
        self.value.get_or_insert_with(f)
    }

    fn shrink_to_fit(&mut self) {
        // Nothing to do
    }

    fn is_empty(&self) -> bool {
        self.value.is_none()
    }

    fn len(&self) -> usize {
        if self.value.is_some() {
            1
        } else {
            0
        }
    }

    fn iter(&self) -> Self::Iterator<'_> {
        self.value.as_ref().map(value_to_key_value).into_iter()
    }

    fn extract_if<'l, F>(&'l mut self, mut f: F) -> impl Iterator<Item = (Self::K, Self::V)>
    where
        F: for<'a, 'b> FnMut(&'a Self::K, &'b mut Self::V) -> bool + 'l,
    {
        if let Some(value) = self.value.as_mut() {
            if f(&(), value) {
                return self.value.take().map(|v| ((), v)).into_iter();
            }
        }
        None.into_iter()
    }

    fn update(&mut self, _: (), update: impl FnOnce(Option<V>) -> Option<V>) {
        self.value = update(self.value.take());
    }
}

#[derive(Debug)]
pub struct AutoMapStorage<K, V> {
    map: AutoMap<K, V, BuildHasherDefault<FxHasher>, 1>,
}

impl<K, V> Default for AutoMapStorage<K, V> {
    fn default() -> Self {
        Self {
            map: AutoMap::default(),
        }
    }
}

impl<K: Hash + Eq, V> Storage for AutoMapStorage<K, V> {
    type K = K;
    type V = V;
    type Iterator<'l>
        = auto_hash_map::map::Iter<'l, K, V>
    where
        Self: 'l;

    fn add(&mut self, key: K, value: V) -> bool {
        match self.map.entry(key) {
            auto_hash_map::map::Entry::Vacant(entry) => {
                entry.insert(value);
                true
            }
            auto_hash_map::map::Entry::Occupied(_) => false,
        }
    }

    fn insert(&mut self, key: K, value: V) -> Option<V> {
        self.map.insert(key, value)
    }

    fn remove(&mut self, key: &K) -> Option<V> {
        self.map
            .remove(key)
            .inspect(|_| self.map.shrink_amortized())
    }

    fn contains_key(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }

    fn get(&self, key: &K) -> Option<&V> {
        self.map.get(key)
    }

    fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        self.map.get_mut(key)
    }

    fn get_mut_or_insert_with(&mut self, key: K, f: impl FnOnce() -> V) -> &mut V {
        self.map.entry(key).or_insert_with(f)
    }

    fn shrink_to_fit(&mut self) {
        self.map.shrink_to_fit()
    }

    fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    fn len(&self) -> usize {
        self.map.len()
    }

    fn iter(&self) -> Self::Iterator<'_> {
        self.map.iter()
    }

    fn extract_if<'l, F>(&'l mut self, f: F) -> impl Iterator<Item = (Self::K, Self::V)>
    where
        F: for<'a, 'b> FnMut(&'a Self::K, &'b mut Self::V) -> bool + 'l,
    {
        self.map.extract_if(f)
    }

    fn update(&mut self, key: K, update: impl FnOnce(Option<V>) -> Option<V>) {
        match self.map.entry(key) {
            Entry::Vacant(e) => {
                if let Some(new) = update(None) {
                    e.insert(new);
                }
            }
            Entry::Occupied(e) => e.replace_entry_with(move |_, v| update(Some(v))),
        }
    }
}
