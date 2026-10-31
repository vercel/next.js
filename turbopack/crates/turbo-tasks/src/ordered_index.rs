//! [`FxIndexMap`] and [`FxIndexSet`] wrappers whose equality includes the iteration order.
//!
//! `IndexMap` and `IndexSet` compare like a map and a set: the same entries in a different order
//! are equal. A cell keeps its old content when the recomputed value is equal to it, so a value
//! whose order matters keeps a stale order when a recomputation only reorders its entries. Readers
//! are not invalidated and keep using the old order.
//!
//! Use these types for fields whose order matters: positions that are stored elsewhere, first-match
//! semantics, or an order that reaches emitted output. Use `FxHashMap`/`FxHashSet` when the order
//! is never observed, so that the type says so.
//!
//! In a keyed cell (`cell = "keyed"`), a reader of a single key only sees that key's value, so a
//! reorder doesn't concern it. A reader of the whole map does see the order, and it is invalidated
//! whenever any key is reported as changed. So when only the order differs, [`KeyedEq`] reports the
//! keys whose position changed.

use std::{
    fmt,
    hash::{Hash, Hasher},
    ops::{Deref, DerefMut, Index},
};

use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use indexmap::Equivalent;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use shrink_to_fit::ShrinkToFit;
use smallvec::SmallVec;

use crate::{
    FxIndexMap, FxIndexSet,
    keyed::{KeyedAccess, KeyedEq},
};

/// An [`FxIndexMap`] whose equality and hash include the order of its entries.
///
/// `IndexMap` compares like a map, so a cell holding one keeps its old content when a recomputed
/// value only reorders the entries, and readers keep the stale order. Use this type for fields
/// whose order matters: positions stored elsewhere, first-match semantics, or an order that reaches
/// emitted output.
///
/// In a keyed cell, when only the order differs, [`KeyedEq`] reports the keys that moved: readers
/// of the whole map see the new order, readers of unmoved keys stay valid.
#[derive(Clone)]
pub struct OrderedIndexMap<K, V>(FxIndexMap<K, V>);

/// An [`FxIndexSet`] whose equality and hash include the order of its items. See
/// [`OrderedIndexMap`].
#[derive(Clone)]
pub struct OrderedIndexSet<T>(FxIndexSet<T>);

impl<K, V> OrderedIndexMap<K, V> {
    pub fn new() -> Self {
        Self(FxIndexMap::default())
    }

    pub fn into_inner(self) -> FxIndexMap<K, V> {
        self.0
    }
}

impl<T> OrderedIndexSet<T> {
    pub fn new() -> Self {
        Self(FxIndexSet::default())
    }

    pub fn into_inner(self) -> FxIndexSet<T> {
        self.0
    }
}

impl<K, V> Default for OrderedIndexMap<K, V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Default for OrderedIndexSet<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<K, V> Deref for OrderedIndexMap<K, V> {
    type Target = FxIndexMap<K, V>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<K, V> DerefMut for OrderedIndexMap<K, V> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<T> Deref for OrderedIndexSet<T> {
    type Target = FxIndexSet<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> DerefMut for OrderedIndexSet<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<K, V> Index<usize> for OrderedIndexMap<K, V> {
    type Output = V;

    fn index(&self, index: usize) -> &V {
        &self.0[index]
    }
}

impl<T> Index<usize> for OrderedIndexSet<T> {
    type Output = T;

    fn index(&self, index: usize) -> &T {
        &self.0[index]
    }
}

impl<K, V> From<FxIndexMap<K, V>> for OrderedIndexMap<K, V> {
    fn from(map: FxIndexMap<K, V>) -> Self {
        Self(map)
    }
}

impl<T> From<FxIndexSet<T>> for OrderedIndexSet<T> {
    fn from(set: FxIndexSet<T>) -> Self {
        Self(set)
    }
}

impl<K: PartialEq, V: PartialEq> PartialEq for OrderedIndexMap<K, V> {
    fn eq(&self, other: &Self) -> bool {
        self.0.len() == other.0.len() && self.0.iter().eq(other.0.iter())
    }
}

impl<K: Eq, V: Eq> Eq for OrderedIndexMap<K, V> {}

impl<T: PartialEq> PartialEq for OrderedIndexSet<T> {
    fn eq(&self, other: &Self) -> bool {
        self.0.len() == other.0.len() && self.0.iter().eq(other.0.iter())
    }
}

impl<T: Eq> Eq for OrderedIndexSet<T> {}

impl<K: Hash, V: Hash> Hash for OrderedIndexMap<K, V> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_usize(self.0.len());
        for (key, value) in &self.0 {
            key.hash(state);
            value.hash(state);
        }
    }
}

impl<T: Hash> Hash for OrderedIndexSet<T> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        state.write_usize(self.0.len());
        for item in &self.0 {
            item.hash(state);
        }
    }
}

impl<K: fmt::Debug, V: fmt::Debug> fmt::Debug for OrderedIndexMap<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl<T: fmt::Debug> fmt::Debug for OrderedIndexSet<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl<K: Hash + Eq, V> FromIterator<(K, V)> for OrderedIndexMap<K, V> {
    fn from_iter<I: IntoIterator<Item = (K, V)>>(iter: I) -> Self {
        Self(FxIndexMap::from_iter(iter))
    }
}

impl<T: Hash + Eq> FromIterator<T> for OrderedIndexSet<T> {
    fn from_iter<I: IntoIterator<Item = T>>(iter: I) -> Self {
        Self(FxIndexSet::from_iter(iter))
    }
}

impl<K: Hash + Eq, V> Extend<(K, V)> for OrderedIndexMap<K, V> {
    fn extend<I: IntoIterator<Item = (K, V)>>(&mut self, iter: I) {
        self.0.extend(iter)
    }
}

impl<T: Hash + Eq> Extend<T> for OrderedIndexSet<T> {
    fn extend<I: IntoIterator<Item = T>>(&mut self, iter: I) {
        self.0.extend(iter)
    }
}

impl<K, V> IntoIterator for OrderedIndexMap<K, V> {
    type Item = (K, V);
    type IntoIter = indexmap::map::IntoIter<K, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a, K, V> IntoIterator for &'a OrderedIndexMap<K, V> {
    type Item = (&'a K, &'a V);
    type IntoIter = indexmap::map::Iter<'a, K, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl<'a, K, V> IntoIterator for &'a mut OrderedIndexMap<K, V> {
    type Item = (&'a K, &'a mut V);
    type IntoIter = indexmap::map::IterMut<'a, K, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter_mut()
    }
}

impl<T> IntoIterator for OrderedIndexSet<T> {
    type Item = T;
    type IntoIter = indexmap::set::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a, T> IntoIterator for &'a OrderedIndexSet<T> {
    type Item = &'a T;
    type IntoIter = indexmap::set::Iter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl<K, V> ShrinkToFit for OrderedIndexMap<K, V>
where
    FxIndexMap<K, V>: ShrinkToFit,
{
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit()
    }
}

impl<T> ShrinkToFit for OrderedIndexSet<T>
where
    FxIndexSet<T>: ShrinkToFit,
{
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit()
    }
}

impl<K: Serialize, V: Serialize> Serialize for OrderedIndexMap<K, V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de, K: Deserialize<'de> + Hash + Eq, V: Deserialize<'de>> Deserialize<'de>
    for OrderedIndexMap<K, V>
{
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        FxIndexMap::deserialize(deserializer).map(Self)
    }
}

impl<T: Serialize> Serialize for OrderedIndexSet<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de, T: Deserialize<'de> + Hash + Eq> Deserialize<'de> for OrderedIndexSet<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        FxIndexSet::deserialize(deserializer).map(Self)
    }
}

impl<K: Encode, V: Encode> Encode for OrderedIndexMap<K, V> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::indexmap::encode(&self.0, encoder)
    }
}

impl<Context, K: Decode<Context> + Hash + Eq, V: Decode<Context>> Decode<Context>
    for OrderedIndexMap<K, V>
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        turbo_bincode::indexmap::decode(decoder).map(Self)
    }
}

impl<'de, Context, K: BorrowDecode<'de, Context> + Hash + Eq, V: BorrowDecode<'de, Context>>
    BorrowDecode<'de, Context> for OrderedIndexMap<K, V>
{
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        turbo_bincode::indexmap::borrow_decode(decoder).map(Self)
    }
}

impl<T: Encode> Encode for OrderedIndexSet<T> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        turbo_bincode::indexset::encode(&self.0, encoder)
    }
}

impl<Context, T: Decode<Context> + Hash + Eq> Decode<Context> for OrderedIndexSet<T> {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        turbo_bincode::indexset::decode(decoder).map(Self)
    }
}

impl<'de, Context, T: BorrowDecode<'de, Context> + Hash + Eq> BorrowDecode<'de, Context>
    for OrderedIndexSet<T>
{
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        turbo_bincode::indexset::borrow_decode(decoder).map(Self)
    }
}

impl<K: Eq + Hash, V: PartialEq> KeyedEq for OrderedIndexMap<K, V> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
        let mut different_keys = self.0.different_keys(&other.0);
        if different_keys.is_empty() {
            // Same entries, so the same keys: report the ones that moved.
            different_keys.extend(
                self.0
                    .keys()
                    .zip(other.0.keys())
                    .filter(|(key, other_key)| key != other_key)
                    .map(|(key, _)| key),
            );
        }
        different_keys
    }
}

impl<K, V, Q: Equivalent<K> + Hash + ?Sized> KeyedAccess<Q> for OrderedIndexMap<K, V> {
    type Value = V;

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        self.0.get(key)
    }

    fn contains_key(&self, key: &Q) -> bool {
        self.0.contains_key(key)
    }
}

impl<T: Eq + Hash> KeyedEq for OrderedIndexSet<T> {
    type Key = T;

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
        let mut different_keys = self.0.different_keys(&other.0);
        if different_keys.is_empty() {
            // Same items: report the ones that moved.
            different_keys.extend(
                self.0
                    .iter()
                    .zip(other.0.iter())
                    .filter(|(item, other_item)| item != other_item)
                    .map(|(item, _)| item),
            );
        }
        different_keys
    }
}

impl<T, Q: Equivalent<T> + Hash + ?Sized> KeyedAccess<Q> for OrderedIndexSet<T> {
    type Value = ();

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        if self.0.contains(key) {
            Some(&())
        } else {
            None
        }
    }

    fn contains_key(&self, key: &Q) -> bool {
        self.0.contains(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_equality_includes_order() {
        let a: OrderedIndexMap<u32, u32> = [(1, 10), (2, 20)].into_iter().collect();
        let b: OrderedIndexMap<u32, u32> = [(2, 20), (1, 10)].into_iter().collect();
        // The wrapped maps are equal as maps...
        assert_eq!(*a, *b);
        // ...but not as ordered maps.
        assert_ne!(a, b);
        assert_eq!(a, a.clone());
    }

    #[test]
    fn set_equality_includes_order() {
        let a: OrderedIndexSet<u32> = [1, 2].into_iter().collect();
        let b: OrderedIndexSet<u32> = [2, 1].into_iter().collect();
        assert_eq!(*a, *b);
        assert_ne!(a, b);
        assert_eq!(a, a.clone());
    }

    #[test]
    fn keyed_eq_reports_moved_keys() {
        let a: OrderedIndexMap<u32, u32> = [(1, 10), (2, 20), (3, 30)].into_iter().collect();
        let reordered: OrderedIndexMap<u32, u32> =
            [(1, 10), (3, 30), (2, 20)].into_iter().collect();
        let changed: OrderedIndexMap<u32, u32> = [(1, 10), (2, 21), (3, 30)].into_iter().collect();
        assert!(a.different_keys(&a.clone()).is_empty());
        assert_eq!(*a.different_keys(&reordered), [&2, &3]);
        assert_eq!(*a.different_keys(&changed), [&2]);

        let set: OrderedIndexSet<u32> = [1, 2, 3].into_iter().collect();
        let reordered_set: OrderedIndexSet<u32> = [3, 2, 1].into_iter().collect();
        assert!(set.different_keys(&set.clone()).is_empty());
        assert_eq!(*set.different_keys(&reordered_set), [&1, &3]);
    }
}
