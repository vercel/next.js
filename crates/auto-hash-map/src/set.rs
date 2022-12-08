use std::{
    collections::hash_map::RandomState,
    fmt::Debug,
    hash::{BuildHasher, Hash},
    marker::PhantomData,
};

use serde::{Deserialize, Serialize};

use crate::AutoMap;

#[derive(Clone)]
pub struct AutoSet<K, H = RandomState> {
    map: AutoMap<K, (), H>,
}

impl<K, H> Default for AutoSet<K, H> {
    fn default() -> Self {
        Self {
            map: Default::default(),
        }
    }
}

impl<K: Debug, H> Debug for AutoSet<K, H> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<K> AutoSet<K, RandomState> {
    /// see [HashSet::new](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.new)
    pub fn new() -> Self {
        Self {
            map: AutoMap::new(),
        }
    }

    /// see [HashSet::with_capacity](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_capacity)
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            map: AutoMap::with_capacity(capacity),
        }
    }
}

impl<K, H: BuildHasher> AutoSet<K, H> {
    /// see [HashSet::with_hasher](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_hasher)
    pub fn with_hasher() -> Self {
        Self {
            map: AutoMap::with_hasher(),
        }
    }

    /// see [HashSet::with_capacity_and_hasher](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_capacity_and_hasher)
    pub fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        Self {
            map: AutoMap::with_capacity_and_hasher(capacity, hasher),
        }
    }

    /// see [HashSet::clear](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.clear)
    pub fn clear(&mut self) {
        self.map.clear();
    }
}

impl<K: Hash + Eq, H: BuildHasher + Default> AutoSet<K, H> {
    /// see [HashSet::insert](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.insert)
    pub fn insert(&mut self, key: K) -> bool {
        self.map.insert(key, ()).is_none()
    }

    /// see [HashSet::remove](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.remove)
    pub fn remove(&mut self, key: &K) -> bool {
        self.map.remove(key).is_some()
    }

    /// see [HashSet::extend](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.extend)
    pub fn extend(&mut self, iter: impl IntoIterator<Item = K>) {
        self.map.extend(iter.into_iter().map(|item| (item, ())))
    }

    /// see [HashSet::shrink_to_fit](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.shrink_to_fit)
    pub fn shrink_to_fit(&mut self) {
        self.map.shrink_to_fit();
    }

    /// see [HashSet::contains](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.contains)
    pub fn contains(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }
}

impl<K, H> AutoSet<K, H> {
    /// see [HashSet::len](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.len)
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// see [HashSet::is_empty](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.is_empty)
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// see [HashSet::iter](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.iter)
    pub fn iter(&self) -> Iter<'_, K> {
        Iter(self.map.iter())
    }
}

impl<K, H> IntoIterator for AutoSet<K, H> {
    type Item = K;
    type IntoIter = IntoIter<K>;

    fn into_iter(self) -> Self::IntoIter {
        IntoIter(self.map.into_iter())
    }
}

impl<'a, K, H> IntoIterator for &'a AutoSet<K, H> {
    type Item = &'a K;
    type IntoIter = Iter<'a, K>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub struct Iter<'a, K>(super::map::Iter<'a, K, ()>);

impl<'a, K> Iterator for Iter<'a, K> {
    type Item = &'a K;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, _)| k)
    }
}

pub struct IntoIter<K>(super::map::IntoIter<K, ()>);

impl<K> Iterator for IntoIter<K> {
    type Item = K;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, _)| k)
    }
}

impl<K, H> Serialize for AutoSet<K, H>
where
    K: Serialize,
    H: BuildHasher,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(self.iter())
    }
}

impl<'de, K, H> Deserialize<'de> for AutoSet<K, H>
where
    K: Deserialize<'de> + Hash + Eq,
    H: BuildHasher + Default,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct AutoSetVisitor<K, H>(PhantomData<AutoSet<K, H>>);

        impl<'de, K, H> serde::de::Visitor<'de> for AutoSetVisitor<K, H>
        where
            K: Deserialize<'de> + Hash + Eq,
            H: BuildHasher + Default,
        {
            type Value = AutoSet<K, H>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a set")
            }

            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> Result<Self::Value, A::Error> {
                let mut set = if let Some(size) = seq.size_hint() {
                    AutoSet::with_capacity_and_hasher(size, H::default())
                } else {
                    AutoSet::with_hasher()
                };
                while let Some(item) = seq.next_element()? {
                    set.insert(item);
                }
                Ok(set)
            }
        }

        deserializer.deserialize_seq(AutoSetVisitor(std::marker::PhantomData))
    }
}

impl<K: Eq + Hash, H: BuildHasher> PartialEq for AutoSet<K, H> {
    fn eq(&self, other: &Self) -> bool {
        self.map == other.map
    }
}

impl<K: Eq + Hash, H: BuildHasher> Eq for AutoSet<K, H> {}

impl<K, H> FromIterator<K> for AutoSet<K, H>
where
    K: Hash + Eq,
    H: BuildHasher + Default,
{
    fn from_iter<T: IntoIterator<Item = K>>(iter: T) -> Self {
        Self {
            map: AutoMap::from_iter(iter.into_iter().map(|item| (item, ()))),
        }
    }
}

impl<K, H, const N: usize> From<[K; N]> for AutoSet<K, H>
where
    K: Hash + Eq,
    H: BuildHasher + Default,
{
    fn from(array: [K; N]) -> Self {
        Self::from_iter(array)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MAX_LIST_SIZE;

    #[test]
    fn test_auto_set() {
        let mut set = AutoSet::new();
        for i in 0..MAX_LIST_SIZE * 2 {
            set.insert(i);
        }
        for i in 0..MAX_LIST_SIZE * 2 {
            assert!(set.contains(&i));
        }
        assert!(!set.contains(&(MAX_LIST_SIZE * 2)));
        for i in 0..MAX_LIST_SIZE * 2 {
            assert!(!set.remove(&(MAX_LIST_SIZE * 2)));
            assert!(set.remove(&i));
        }
        assert!(!set.remove(&(MAX_LIST_SIZE * 2)));
    }
}
