use std::{
    fmt::Debug,
    hash::{BuildHasher, BuildHasherDefault, Hash},
    marker::PhantomData,
};

use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use hashbrown::HashMap;
use indexmap::IndexMap;
use rustc_hash::FxHasher;
use serde::{Deserialize, Serialize};
use shrink_to_fit::ShrinkToFit;

use crate::{
    MAX_USEFUL_LINEAR_SCAN, RawAutoMap, TinyVec,
    storage::{BackingListStorage, BackingMapIter, BackingMapStorage},
};

/// A set that stores small numbers of items in a linear list `L` and switches to a real map `M`
/// when it grows. See [`RawAutoMap`].
///
/// Use the [`AutoSet`] (hash map based, unordered) or [`AutoIndexSet`] (index map based,
/// insertion ordered) aliases instead of naming this type directly.
#[derive(Clone)]
pub struct RawAutoSet<K, M, L> {
    map: RawAutoMap<K, (), M, L>,
}

// The aliases are defined in the crate root. Re-exported here to keep the `set::` paths working.
pub use crate::{AutoIndexSet, AutoSet};

impl<K, M, L: BackingListStorage<(K, ())>> Default for RawAutoSet<K, M, L> {
    fn default() -> Self {
        Self {
            map: Default::default(),
        }
    }
}

impl<K: Debug, M: BackingMapStorage<K, ()>, L: BackingListStorage<(K, ())>> Debug
    for RawAutoSet<K, M, L>
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_set().entries(self.iter()).finish()
    }
}

macro_rules! impl_new {
    ($map:ident) => {
        impl<K>
            RawAutoSet<
                K,
                $map<K, (), BuildHasherDefault<FxHasher>>,
                TinyVec<(K, ()), 0, MAX_USEFUL_LINEAR_SCAN>,
            >
        {
            /// see [HashSet::new](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.new)
            pub const fn new() -> Self {
                Self {
                    map: RawAutoMap::<K, (), $map<K, (), BuildHasherDefault<FxHasher>>, _>::new(),
                }
            }

            /// see [HashSet::with_capacity](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_capacity)
            pub fn with_capacity(capacity: usize) -> Self {
                Self {
                    map: RawAutoMap::<K, (), $map<K, (), BuildHasherDefault<FxHasher>>, _>::with_capacity(
                        capacity,
                    ),
                }
            }
        }
    };
}

impl_new!(HashMap);
impl_new!(IndexMap);

impl<K, M: BackingMapStorage<K, ()>, L: BackingListStorage<(K, ())>> RawAutoSet<K, M, L> {
    /// see [HashSet::with_hasher](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_hasher)
    pub const fn with_hasher() -> Self {
        Self {
            map: RawAutoMap::with_hasher(),
        }
    }

    /// see [HashSet::with_capacity_and_hasher](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.with_capacity_and_hasher)
    pub fn with_capacity_and_hasher(capacity: usize, hasher: M::Hasher) -> Self {
        Self {
            map: RawAutoMap::with_capacity_and_hasher(capacity, hasher),
        }
    }

    /// see [HashSet::clear](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.clear)
    pub fn clear(&mut self) {
        self.map.clear();
    }
}

impl<K: Hash + Eq, M, L> RawAutoSet<K, M, L>
where
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    /// see [HashSet::insert](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.insert)
    pub fn insert(&mut self, key: K) -> bool {
        self.map.insert(key, ()).is_none()
    }

    /// see [HashSet::remove](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.remove)
    ///
    /// Ordered storages preserve the order of the remaining items.
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

    /// see [HashSet::retain](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.retain)
    ///
    /// Ordered storages preserve the order of the retained items.
    pub fn retain<F>(&mut self, mut f: F)
    where
        F: FnMut(&K) -> bool,
    {
        self.map.retain(|k, _| f(k));
    }
}

impl<K, M: BackingMapStorage<K, ()>, L: BackingListStorage<(K, ())>> RawAutoSet<K, M, L> {
    /// see [HashSet::len](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.len)
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// see [HashSet::is_empty](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.is_empty)
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// see [HashSet::iter](https://doc.rust-lang.org/std/collections/hash_set/struct.HashSet.html#method.iter)
    pub fn iter(&self) -> Iter<M::Iter<'_>> {
        Iter(self.map.iter())
    }
}

impl<K, M: BackingMapStorage<K, ()>, L: BackingListStorage<(K, ())>> IntoIterator
    for RawAutoSet<K, M, L>
{
    type Item = K;
    type IntoIter = IntoIter<L::IntoIter, M::IntoIter>;

    fn into_iter(self) -> Self::IntoIter {
        IntoIter(self.map.into_iter())
    }
}

impl<'a, K, M: BackingMapStorage<K, ()>, L: BackingListStorage<(K, ())>> IntoIterator
    for &'a RawAutoSet<K, M, L>
{
    type Item = &'a K;
    type IntoIter = Iter<M::Iter<'a>>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// A borrowed iterator of a [`RawAutoSet`]. `MI` is [`BackingMapStorage::Iter`] of the map
/// storage.
pub struct Iter<MI: BackingMapIter>(crate::map::Iter<MI>);

/// Extracts the key from a borrowed map entry. Like [`BackingMapIter`], the impl doesn't relate the
/// lifetimes of key and value, so the set iterator's trait impls are free of such where clauses.
pub trait SetEntry {
    type Key;
    fn key(self) -> Self::Key;
}

impl<'a, K> SetEntry for (&'a K, &()) {
    type Key = &'a K;
    fn key(self) -> Self::Key {
        self.0
    }
}

impl<MI: BackingMapIter<Item: SetEntry>> Iterator for Iter<MI> {
    type Item = <MI::Item as SetEntry>::Key;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(SetEntry::key)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl<MI: BackingMapIter<List: Clone> + Clone> Clone for Iter<MI> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

// Parameterized by the storages' iterator types, see `crate::map::IntoIter`.
pub struct IntoIter<LI, MI>(crate::map::IntoIter<LI, MI>);

impl<K, LI: Iterator<Item = (K, ())>, MI: Iterator<Item = (K, ())>> Iterator for IntoIter<LI, MI> {
    type Item = K;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, _)| k)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl<K, M, L> Serialize for RawAutoSet<K, M, L>
where
    K: Serialize,
    M: BackingMapStorage<K, ()>,
    L: BackingListStorage<(K, ())>,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_seq(self.iter())
    }
}

impl<'de, K, M, L> Deserialize<'de> for RawAutoSet<K, M, L>
where
    K: Deserialize<'de> + Hash + Eq,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct AutoSetVisitor<K, M, L>(PhantomData<RawAutoSet<K, M, L>>);

        impl<'de, K, M, L> serde::de::Visitor<'de> for AutoSetVisitor<K, M, L>
        where
            K: Deserialize<'de> + Hash + Eq,
            M: BackingMapStorage<K, ()>,
            M::Hasher: BuildHasher + Default,
            L: BackingListStorage<(K, ())>,
        {
            type Value = RawAutoSet<K, M, L>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a set")
            }

            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut seq: A,
            ) -> Result<Self::Value, A::Error> {
                let mut set = if let Some(size) = seq.size_hint() {
                    RawAutoSet::with_capacity_and_hasher(size, M::Hasher::default())
                } else {
                    RawAutoSet::with_hasher()
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

impl<K, M, L> Encode for RawAutoSet<K, M, L>
where
    K: Encode,
    M: BackingMapStorage<K, ()>,
    L: BackingListStorage<(K, ())>,
{
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.map.encode(encoder)
    }
}

impl<Context, K, M, L> Decode<Context> for RawAutoSet<K, M, L>
where
    K: Decode<Context> + Hash + Eq,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self {
            map: Decode::decode(decoder)?,
        })
    }
}

impl<'de, Context, K, M, L> BorrowDecode<'de, Context> for RawAutoSet<K, M, L>
where
    K: Decode<Context> + Hash + Eq,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        Decode::decode(decoder)
    }
}

impl<K: Eq + Hash, M, L> PartialEq for RawAutoSet<K, M, L>
where
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, ())>,
{
    /// Order insensitive for unordered storages, order sensitive for ordered ones (see
    /// [`BackingMapStorage::eq`]).
    fn eq(&self, other: &Self) -> bool {
        self.map == other.map
    }
}

impl<K: Eq + Hash, M, L> Eq for RawAutoSet<K, M, L>
where
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, ())>,
{
}

impl<K: Eq + Hash, M, L> Hash for RawAutoSet<K, M, L>
where
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.map.hash(state);
    }
}

impl<K, M, L> FromIterator<K> for RawAutoSet<K, M, L>
where
    K: Hash + Eq,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn from_iter<T: IntoIterator<Item = K>>(iter: T) -> Self {
        Self {
            map: RawAutoMap::from_iter(iter.into_iter().map(|item| (item, ()))),
        }
    }
}

impl<K, M, L, const N: usize> From<[K; N]> for RawAutoSet<K, M, L>
where
    K: Hash + Eq,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn from(array: [K; N]) -> Self {
        Self::from_iter(array)
    }
}

impl<K, M, L> ShrinkToFit for RawAutoSet<K, M, L>
where
    K: Eq + Hash,
    M: BackingMapStorage<K, ()>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, ())>,
{
    fn shrink_to_fit(&mut self) {
        self.map.shrink_to_fit();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_set() {
        let mut set = AutoSet::new();
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            set.insert(i);
        }
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            assert!(set.contains(&i));
        }
        assert!(!set.contains(&(MAX_USEFUL_LINEAR_SCAN * 2)));
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            assert!(!set.remove(&(MAX_USEFUL_LINEAR_SCAN * 2)));
            assert!(set.remove(&i));
        }
        assert!(!set.remove(&(MAX_USEFUL_LINEAR_SCAN * 2)));
    }

    fn hash_of<T: Hash>(value: &T) -> u64 {
        BuildHasherDefault::<FxHasher>::default().hash_one(value)
    }

    #[test]
    fn test_auto_set_eq_is_order_insensitive() {
        let a = AutoSet::<_>::from(["a", "b"]);
        let b = AutoSet::<_>::from(["b", "a"]);
        assert_eq!(a, b);
        assert_eq!(hash_of(&a), hash_of(&b));
        let a: AutoSet<usize> = (0..MAX_USEFUL_LINEAR_SCAN * 2).collect();
        let b: AutoSet<usize> = (0..MAX_USEFUL_LINEAR_SCAN * 2).rev().collect();
        assert_eq!(a, b);
        assert_eq!(hash_of(&a), hash_of(&b));
    }

    #[test]
    fn test_auto_index_set_eq_is_order_sensitive() {
        let a = AutoIndexSet::<_>::from(["a", "b"]);
        let a2 = AutoIndexSet::<_>::from(["a", "b"]);
        let b = AutoIndexSet::<_>::from(["b", "a"]);
        assert_eq!(a, a2);
        assert_eq!(hash_of(&a), hash_of(&a2));
        assert_ne!(a, b);

        let a: AutoIndexSet<usize> = (0..MAX_USEFUL_LINEAR_SCAN * 2).collect();
        let a2: AutoIndexSet<usize> = (0..MAX_USEFUL_LINEAR_SCAN * 2).collect();
        let b: AutoIndexSet<usize> = (0..MAX_USEFUL_LINEAR_SCAN * 2).rev().collect();
        assert_eq!(a, a2);
        assert_ne!(a, b);
    }

    #[test]
    fn test_auto_index_set_order() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut set = AutoIndexSet::new();
        for i in (0..n).rev() {
            assert!(set.insert(i));
        }
        assert!(!set.insert(0));
        assert_eq!(
            set.iter().copied().collect::<Vec<_>>(),
            (0..n).rev().collect::<Vec<_>>()
        );
        set.remove(&(n - 1));
        set.retain(|k| k % 2 == 0 && *k < 30);
        set.shrink_to_fit();
        let expected: Vec<usize> = (0..30).rev().filter(|k| k % 2 == 0).collect();
        assert_eq!(set.iter().copied().collect::<Vec<_>>(), expected);
        set.remove(&expected[0]);
        assert_eq!(set.into_iter().collect::<Vec<_>>(), expected[1..]);
    }

    #[test]
    fn test_auto_index_set_serialization_preserves_order() {
        for n in [5, MAX_USEFUL_LINEAR_SCAN * 2] {
            let set: AutoIndexSet<usize> = (0..n).rev().collect();
            let expected = (0..n).rev().collect::<Vec<_>>();

            let config = bincode::config::standard();
            let bytes = bincode::encode_to_vec(&set, config).unwrap();
            let (decoded, _): (AutoIndexSet<usize>, _) =
                bincode::decode_from_slice(&bytes, config).unwrap();
            assert_eq!(decoded, set);
            assert_eq!(decoded.iter().copied().collect::<Vec<_>>(), expected);

            let json = serde_json::to_string(&set).unwrap();
            let decoded: AutoIndexSet<usize> = serde_json::from_str(&json).unwrap();
            assert_eq!(decoded, set);
            assert_eq!(decoded.iter().copied().collect::<Vec<_>>(), expected);
        }
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_sizes() {
        use std::num::NonZeroU32;
        type F = BuildHasherDefault<FxHasher>;
        // Generalizing the storage must not change the size of the existing aliases.
        assert_eq!(size_of::<AutoSet<NonZeroU32>>(), 16);
        assert_eq!(size_of::<AutoSet<(NonZeroU32, u32), F, 3>>(), 32);
        assert_eq!(size_of::<Option<AutoSet<NonZeroU32>>>(), 24);
        assert_eq!(size_of::<AutoIndexSet<NonZeroU32>>(), 16);
    }
}
