//! Backing storage abstractions for [`RawAutoMap`] and
//! [`RawAutoSet`](crate::RawAutoSet).
//!
//! A [`RawAutoMap`] stores its entries either in a small linear list (a
//! [`BackingListStorage`]) or, once it grows beyond
//! `MAX_USEFUL_LINEAR_SCAN` entries, in a real map (a [`BackingMapStorage`]).
//!
//! * [`BackingMapStorage`] is implemented for [`hashbrown::HashMap`] (unordered) and
//!   [`indexmap::IndexMap`] (insertion ordered). It also decides whether iteration order is
//!   meaningful ([`BackingMapStorage::UNORDERED`]) and provides the equality implementation of the
//!   whole [`RawAutoMap`].
//! * [`BackingListStorage`] is implemented for [`TinyVec`], [`Vec`] and [`ArrayVec`].

use std::{
    borrow::Borrow,
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
};

use arrayvec::ArrayVec;
use hashbrown::HashMap;
use indexmap::{IndexMap, map::RawEntryApiV1};

use crate::{
    MAX_USEFUL_LINEAR_SCAN, RawAutoMap, TinyVec,
    map::{ExtractIfIter, Iter, IterMut, Values, ValuesMut},
    tiny_vec,
};

/// The result of looking up a key in a [`BackingMapStorage`] via
/// [`BackingMapStorage::entry`] or [`BackingMapStorage::raw_entry_mut`].
pub enum MapEntry<O, V> {
    Occupied(O),
    Vacant(V),
}

/// Storage for the list variant of a [`RawAutoMap`]: a small vector holding
/// at most `MAX_USEFUL_LINEAR_SCAN` items.
pub trait BackingListStorage<T>:
    Deref<Target = [T]> + DerefMut + IntoIterator<Item = T> + Sized
{
    type Drain<'a>: Iterator<Item = T>
    where
        Self: 'a;

    /// An empty list.
    const EMPTY: Self;

    fn with_capacity(capacity: usize) -> Self;
    fn capacity(&self) -> usize;
    /// Appends `value`. The caller guarantees `len < MAX_USEFUL_LINEAR_SCAN`.
    fn push(&mut self, value: T);
    /// Inserts `value` at `index`, shifting later items. The caller
    /// guarantees `len < MAX_USEFUL_LINEAR_SCAN`.
    fn insert(&mut self, index: usize, value: T);
    /// Removes the item at `index`, replacing it with the last item.
    fn swap_remove(&mut self, index: usize) -> T;
    /// Removes the item at `index`, shifting later items (order preserving).
    fn remove(&mut self, index: usize) -> T;
    fn clear(&mut self);
    /// Removes and yields all items in order.
    fn drain(&mut self) -> Self::Drain<'_>;
    fn shrink_to_fit(&mut self);
}

impl<T, const I: usize> BackingListStorage<T> for TinyVec<T, I, MAX_USEFUL_LINEAR_SCAN> {
    type Drain<'a>
        = tiny_vec::Drain<'a, T, I, MAX_USEFUL_LINEAR_SCAN>
    where
        Self: 'a;

    const EMPTY: Self = TinyVec::new();

    fn with_capacity(capacity: usize) -> Self {
        TinyVec::with_capacity(capacity)
    }
    fn capacity(&self) -> usize {
        TinyVec::capacity(self)
    }
    fn push(&mut self, value: T) {
        TinyVec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        TinyVec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        TinyVec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        TinyVec::remove(self, index)
    }
    fn clear(&mut self) {
        TinyVec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        TinyVec::drain(self)
    }
    fn shrink_to_fit(&mut self) {
        TinyVec::shrink_to_fit(self)
    }
}

impl<T> BackingListStorage<T> for Vec<T> {
    type Drain<'a>
        = std::vec::Drain<'a, T>
    where
        Self: 'a;

    const EMPTY: Self = Vec::new();

    fn with_capacity(capacity: usize) -> Self {
        Vec::with_capacity(capacity)
    }
    fn capacity(&self) -> usize {
        Vec::capacity(self)
    }
    fn push(&mut self, value: T) {
        Vec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        Vec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        Vec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        Vec::remove(self, index)
    }
    fn clear(&mut self) {
        Vec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        Vec::drain(self, ..)
    }
    fn shrink_to_fit(&mut self) {
        Vec::shrink_to_fit(self)
    }
}

impl<T> BackingListStorage<T> for ArrayVec<T, MAX_USEFUL_LINEAR_SCAN> {
    type Drain<'a>
        = arrayvec::Drain<'a, T, MAX_USEFUL_LINEAR_SCAN>
    where
        Self: 'a;

    const EMPTY: Self = ArrayVec::new_const();

    fn with_capacity(_capacity: usize) -> Self {
        ArrayVec::new()
    }
    fn capacity(&self) -> usize {
        ArrayVec::capacity(self)
    }
    fn push(&mut self, value: T) {
        ArrayVec::push(self, value)
    }
    fn insert(&mut self, index: usize, value: T) {
        ArrayVec::insert(self, index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        ArrayVec::swap_remove(self, index)
    }
    fn remove(&mut self, index: usize) -> T {
        ArrayVec::remove(self, index)
    }
    fn clear(&mut self) {
        ArrayVec::clear(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        ArrayVec::drain(self, ..)
    }
    fn shrink_to_fit(&mut self) {
        // Inline storage, nothing to shrink.
    }
}

/// Storage for the map variant of a [`RawAutoMap`].
///
/// Methods that need hashing carry the same bounds as the underlying map type,
/// so the trait itself is implemented without bounds on `K`, `V` or the hasher.
pub trait BackingMapStorage<K, V>: Sized {
    type Hasher;

    /// When `true` the iteration order is not meaningful: removals may move other entries (e.g.
    /// swap-remove in the list variant) and equality ignores order.
    ///
    /// When `false` the storage is insertion ordered: all removals preserve the relative order of
    /// the remaining entries (in both the list and the map variant) and equality is order
    /// sensitive.
    const UNORDERED: bool;

    type IntoIter: Iterator<Item = (K, V)>;
    type IntoValues: Iterator<Item = V>;
    type Drain<'a>: Iterator<Item = (K, V)>
    where
        Self: 'a;
    type Occupied<'a>
    where
        Self: 'a;
    type Vacant<'a>
    where
        Self: 'a;
    type RawOccupied<'a>
    where
        Self: 'a;
    type RawVacant<'a>
    where
        Self: 'a;

    fn with_capacity_and_hasher(capacity: usize, hasher: Self::Hasher) -> Self;
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    fn capacity(&self) -> usize;
    fn clear(&mut self);
    // The borrowed iterators are concrete enums (instead of generic associated types), as
    // projections of generic associated types break `Send` inference for futures holding them
    // across an `.await` (rust-lang/rust#100013).
    fn iter<'a>(&'a self) -> Iter<'a, K, V>
    where
        K: 'a,
        V: 'a;
    fn iter_mut<'a>(&'a mut self) -> IterMut<'a, K, V>
    where
        K: 'a,
        V: 'a;
    fn values<'a>(&'a self) -> Values<'a, K, V>
    where
        K: 'a,
        V: 'a;
    fn values_mut<'a>(&'a mut self) -> ValuesMut<'a, K, V>
    where
        K: 'a,
        V: 'a;
    fn into_entries(self) -> Self::IntoIter;
    fn into_values(self) -> Self::IntoValues;
    /// Removes and yields all entries (in order for ordered storages).
    fn drain(&mut self) -> Self::Drain<'_>;
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, f: F);
    fn extract_if<'a, L, F: FnMut(&K, &mut V) -> bool>(
        &'a mut self,
        f: F,
    ) -> ExtractIfIter<'a, K, V, L, F>
    where
        K: 'a,
        V: 'a;

    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    /// Removes `key`. Ordered storages preserve the order of the other entries.
    fn remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        Self::Hasher: BuildHasher;
    fn get_mut(&mut self, key: &K) -> Option<&mut V>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn contains_key(&self, key: &K) -> bool
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn occupied_get_mut<'e>(entry: &'e mut Self::Occupied<'_>) -> &'e mut V;
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V;
    /// Removes the entry. Ordered storages preserve the order of the other entries.
    fn occupied_remove(entry: Self::Occupied<'_>) -> V
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    /// Replaces the entry's value with the result of `func`, or removes the entry when `func`
    /// returns `None`. Ordered storages keep the entry at its position.
    fn occupied_replace_entry_with(
        entry: Self::Occupied<'_>,
        func: impl FnOnce(&K, V) -> Option<V>,
    ) where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        Self::Hasher: BuildHasher;
    fn raw_occupied_get_mut<'e>(entry: &'e mut Self::RawOccupied<'_>) -> &'e mut V;
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V;
    /// Removes the entry. Ordered storages preserve the order of the other entries.
    fn raw_occupied_remove(entry: Self::RawOccupied<'_>) -> V;
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        Self::Hasher: BuildHasher;

    /// Equality of two [`RawAutoMap`]s using this storage. Order insensitive for unordered
    /// storages, order sensitive for ordered ones.
    fn eq<L>(a: &RawAutoMap<K, V, Self, L>, b: &RawAutoMap<K, V, Self, L>) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        Self::Hasher: BuildHasher,
        L: BackingListStorage<(K, V)>;
}

impl<K, V, H> BackingMapStorage<K, V> for HashMap<K, V, H> {
    type Hasher = H;

    const UNORDERED: bool = true;

    type IntoIter = hashbrown::hash_map::IntoIter<K, V>;
    type IntoValues = hashbrown::hash_map::IntoValues<K, V>;
    type Drain<'a>
        = hashbrown::hash_map::Drain<'a, K, V>
    where
        Self: 'a;
    type Occupied<'a>
        = hashbrown::hash_map::OccupiedEntry<'a, K, V, H>
    where
        Self: 'a;
    type Vacant<'a>
        = hashbrown::hash_map::VacantEntry<'a, K, V, H>
    where
        Self: 'a;
    type RawOccupied<'a>
        = hashbrown::hash_map::RawOccupiedEntryMut<'a, K, V, H>
    where
        Self: 'a;
    type RawVacant<'a>
        = hashbrown::hash_map::RawVacantEntryMut<'a, K, V, H>
    where
        Self: 'a;

    fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        HashMap::with_capacity_and_hasher(capacity, hasher)
    }
    fn len(&self) -> usize {
        HashMap::len(self)
    }
    fn capacity(&self) -> usize {
        HashMap::capacity(self)
    }
    fn clear(&mut self) {
        HashMap::clear(self)
    }
    fn iter<'a>(&'a self) -> Iter<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        Iter::HashMap(HashMap::iter(self))
    }
    fn iter_mut<'a>(&'a mut self) -> IterMut<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        IterMut::HashMap(HashMap::iter_mut(self))
    }
    fn values<'a>(&'a self) -> Values<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        Values::HashMap(HashMap::values(self))
    }
    fn values_mut<'a>(&'a mut self) -> ValuesMut<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        ValuesMut::HashMap(HashMap::values_mut(self))
    }
    fn into_entries(self) -> Self::IntoIter {
        IntoIterator::into_iter(self)
    }
    fn into_values(self) -> Self::IntoValues {
        HashMap::into_values(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        HashMap::drain(self)
    }
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, f: F) {
        HashMap::retain(self, f)
    }
    fn extract_if<'a, L, F: FnMut(&K, &mut V) -> bool>(
        &'a mut self,
        f: F,
    ) -> ExtractIfIter<'a, K, V, L, F>
    where
        K: 'a,
        V: 'a,
    {
        ExtractIfIter::HashMap(HashMap::extract_if(self, f))
    }

    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::insert(self, key, value)
    }
    fn remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::remove(self, key)
    }
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        Extend::extend(self, iter)
    }
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        HashMap::get(self, key)
    }
    fn get_mut(&mut self, key: &K) -> Option<&mut V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::get_mut(self, key)
    }
    fn contains_key(&self, key: &K) -> bool
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::contains_key(self, key)
    }
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        HashMap::shrink_to_fit(self)
    }

    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match HashMap::entry(self, key) {
            hashbrown::hash_map::Entry::Occupied(entry) => MapEntry::Occupied(entry),
            hashbrown::hash_map::Entry::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    fn occupied_get_mut<'e>(entry: &'e mut Self::Occupied<'_>) -> &'e mut V {
        entry.get_mut()
    }
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V {
        entry.into_mut()
    }
    fn occupied_remove(entry: Self::Occupied<'_>) -> V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.remove()
    }
    fn occupied_replace_entry_with(entry: Self::Occupied<'_>, func: impl FnOnce(&K, V) -> Option<V>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.replace_entry_with(func);
    }
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(value)
    }

    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        match HashMap::raw_entry_mut(self).from_key(key) {
            hashbrown::hash_map::RawEntryMut::Occupied(entry) => MapEntry::Occupied(entry),
            hashbrown::hash_map::RawEntryMut::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    fn raw_occupied_get_mut<'e>(entry: &'e mut Self::RawOccupied<'_>) -> &'e mut V {
        entry.get_mut()
    }
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V {
        entry.into_mut()
    }
    fn raw_occupied_remove(entry: Self::RawOccupied<'_>) -> V {
        entry.remove()
    }
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(key, value).1
    }

    fn eq<L>(a: &RawAutoMap<K, V, Self, L>, b: &RawAutoMap<K, V, Self, L>) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
        L: BackingListStorage<(K, V)>,
    {
        match (a, b) {
            (RawAutoMap::Map(a), RawAutoMap::Map(b)) => a == b,
            (RawAutoMap::List(a, _), b) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter().all(|(k, v)| b.get(k) == Some(v))
            }
            (a, RawAutoMap::List(b, _)) => {
                if a.len() != b.len() {
                    return false;
                }
                b.iter().all(|(k, v)| a.get(k) == Some(v))
            }
        }
    }
}

/// [`BackingMapStorage::Occupied`] for [`IndexMap`]. Holds the map and the
/// index of the entry, so that the entry can be replaced in place.
pub struct IndexMapOccupiedEntry<'a, K, V, H> {
    map: &'a mut IndexMap<K, V, H>,
    index: usize,
}

/// [`BackingMapStorage::Vacant`] for [`IndexMap`].
pub struct IndexMapVacantEntry<'a, K, V, H> {
    map: &'a mut IndexMap<K, V, H>,
    key: K,
}

impl<K, V, H> BackingMapStorage<K, V> for IndexMap<K, V, H> {
    type Hasher = H;

    const UNORDERED: bool = false;

    type IntoIter = indexmap::map::IntoIter<K, V>;
    type IntoValues = indexmap::map::IntoValues<K, V>;
    type Drain<'a>
        = indexmap::map::Drain<'a, K, V>
    where
        Self: 'a;
    type Occupied<'a>
        = IndexMapOccupiedEntry<'a, K, V, H>
    where
        Self: 'a;
    type Vacant<'a>
        = IndexMapVacantEntry<'a, K, V, H>
    where
        Self: 'a;
    type RawOccupied<'a>
        = indexmap::map::raw_entry_v1::RawOccupiedEntryMut<'a, K, V, H>
    where
        Self: 'a;
    type RawVacant<'a>
        = indexmap::map::raw_entry_v1::RawVacantEntryMut<'a, K, V, H>
    where
        Self: 'a;

    fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        IndexMap::with_capacity_and_hasher(capacity, hasher)
    }
    fn len(&self) -> usize {
        IndexMap::len(self)
    }
    fn capacity(&self) -> usize {
        IndexMap::capacity(self)
    }
    fn clear(&mut self) {
        IndexMap::clear(self)
    }
    fn iter<'a>(&'a self) -> Iter<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        Iter::IndexMap(IndexMap::iter(self))
    }
    fn iter_mut<'a>(&'a mut self) -> IterMut<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        IterMut::IndexMap(IndexMap::iter_mut(self))
    }
    fn values<'a>(&'a self) -> Values<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        Values::IndexMap(IndexMap::values(self))
    }
    fn values_mut<'a>(&'a mut self) -> ValuesMut<'a, K, V>
    where
        K: 'a,
        V: 'a,
    {
        ValuesMut::IndexMap(IndexMap::values_mut(self))
    }
    fn into_entries(self) -> Self::IntoIter {
        IntoIterator::into_iter(self)
    }
    fn into_values(self) -> Self::IntoValues {
        IndexMap::into_values(self)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        IndexMap::drain(self, ..)
    }
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, mut f: F) {
        IndexMap::retain(self, |k, v| f(k, v))
    }
    fn extract_if<'a, L, F: FnMut(&K, &mut V) -> bool>(
        &'a mut self,
        f: F,
    ) -> ExtractIfIter<'a, K, V, L, F>
    where
        K: 'a,
        V: 'a,
    {
        ExtractIfIter::IndexMap(IndexMap::extract_if(self, .., f))
    }

    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::insert(self, key, value)
    }
    fn remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::shift_remove(self, key)
    }
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        Extend::extend(self, iter)
    }
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        IndexMap::get(self, key)
    }
    fn get_mut(&mut self, key: &K) -> Option<&mut V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::get_mut(self, key)
    }
    fn contains_key(&self, key: &K) -> bool
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::contains_key(self, key)
    }
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        IndexMap::shrink_to_fit(self)
    }

    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match IndexMap::get_index_of(self, &key) {
            Some(index) => MapEntry::Occupied(IndexMapOccupiedEntry { map: self, index }),
            None => MapEntry::Vacant(IndexMapVacantEntry { map: self, key }),
        }
    }
    fn occupied_get_mut<'e>(entry: &'e mut Self::Occupied<'_>) -> &'e mut V {
        &mut entry.map[entry.index]
    }
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V {
        &mut entry.map[entry.index]
    }
    fn occupied_remove(entry: Self::Occupied<'_>) -> V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry
            .map
            .shift_remove_index(entry.index)
            .expect("index of an occupied entry is valid")
            .1
    }
    fn occupied_replace_entry_with(entry: Self::Occupied<'_>, func: impl FnOnce(&K, V) -> Option<V>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        let IndexMapOccupiedEntry { map, index } = entry;
        let (key, value) = map
            .shift_remove_index(index)
            .expect("index of an occupied entry is valid");
        if let Some(value) = func(&key, value) {
            map.shift_insert(index, key, value);
        }
    }
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        let IndexMapVacantEntry { map, key } = entry;
        let (index, _) = map.insert_full(key, value);
        &mut map[index]
    }

    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        match self.raw_entry_mut_v1().from_key(key) {
            indexmap::map::raw_entry_v1::RawEntryMut::Occupied(entry) => MapEntry::Occupied(entry),
            indexmap::map::raw_entry_v1::RawEntryMut::Vacant(entry) => MapEntry::Vacant(entry),
        }
    }
    fn raw_occupied_get_mut<'e>(entry: &'e mut Self::RawOccupied<'_>) -> &'e mut V {
        entry.get_mut()
    }
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V {
        entry.into_mut()
    }
    fn raw_occupied_remove(entry: Self::RawOccupied<'_>) -> V {
        entry.shift_remove()
    }
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.insert(key, value).1
    }

    fn eq<L>(a: &RawAutoMap<K, V, Self, L>, b: &RawAutoMap<K, V, Self, L>) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
        L: BackingListStorage<(K, V)>,
    {
        // Ordered: same entries in the same order, independent of the variant.
        a.len() == b.len() && a.iter().eq(b.iter())
    }
}
