use std::{
    fmt::Debug,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    marker::PhantomData,
};

use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use shrink_to_fit::ShrinkToFit;

use crate::AutoMap;

#[derive(Clone)]
pub struct AutoSet<K, H = BuildHasherDefault<FxHasher>, const I: usize = 0> {
    map: AutoMap<K, (), H, I>,
}

impl<K, H, const I: usize> Default for AutoSet<K, H, I> {
    fn default() -> Self {
        Self {
            map: Default::default(),
        }
    }
}

impl<K: Debug, H, const I: usize> Debug for AutoSet<K, H, I> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

impl<K> AutoSet<K, BuildHasherDefault<FxHasher>, 0> {
    /// see [HashSet::new](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.new)
    pub const fn new() -> Self {
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

impl<K, H: BuildHasher, const I: usize> AutoSet<K, H, I> {
    /// see [HashSet::with_hasher](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_hasher)
    pub const fn with_hasher() -> Self {
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

impl<K: Hash + Eq, H: BuildHasher + Default, const I: usize> AutoSet<K, H, I> {
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

impl<K, H, const I: usize> AutoSet<K, H, I> {
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

impl<K, H, const I: usize> IntoIterator for AutoSet<K, H, I> {
    type Item = K;
    type IntoIter = IntoIter<K, I>;

    fn into_iter(self) -> Self::IntoIter {
        IntoIter(self.map.into_iter())
    }
}

impl<'a, K, H, const I: usize> IntoIterator for &'a AutoSet<K, H, I> {
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

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl<K> Clone for Iter<'_, K> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

pub struct IntoIter<K, const I: usize>(super::map::IntoIter<K, (), I>);

impl<K, const I: usize> Iterator for IntoIter<K, I> {
    type Item = K;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, _)| k)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl<K, H, const I: usize> Serialize for AutoSet<K, H, I>
where
    K: Serialize,
    H: BuildHasher,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(self.iter())
    }
}

impl<'de, K, H, const I: usize> Deserialize<'de> for AutoSet<K, H, I>
where
    K: Deserialize<'de> + Hash + Eq,
    H: BuildHasher + Default,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct AutoSetVisitor<K, H, const I: usize>(PhantomData<AutoSet<K, H, I>>);

        impl<'de, K, H, const I: usize> serde::de::Visitor<'de> for AutoSetVisitor<K, H, I>
        where
            K: Deserialize<'de> + Hash + Eq,
            H: BuildHasher + Default,
        {
            type Value = AutoSet<K, H, I>;

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

impl<K: Eq + Hash, H: BuildHasher, const I: usize> PartialEq for AutoSet<K, H, I> {
    fn eq(&self, other: &Self) -> bool {
        self.map == other.map
    }
}

impl<K: Eq + Hash, H: BuildHasher, const I: usize> Eq for AutoSet<K, H, I> {}

impl<K: Eq + Hash, SH: BuildHasher + Default, const I: usize> Hash for AutoSet<K, SH, I> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.map.hash(state);
    }
}

impl<K, H, const I: usize> FromIterator<K> for AutoSet<K, H, I>
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

impl<K, H, const N: usize, const I: usize> From<[K; N]> for AutoSet<K, H, I>
where
    K: Hash + Eq,
    H: BuildHasher + Default,
{
    fn from(array: [K; N]) -> Self {
        Self::from_iter(array)
    }
}

impl<K, H, const I: usize> ShrinkToFit for AutoSet<K, H, I>
where
    K: Eq + Hash,
    H: BuildHasher + Default,
{
    fn shrink_to_fit(&mut self) {
        self.map.shrink_to_fit();
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
