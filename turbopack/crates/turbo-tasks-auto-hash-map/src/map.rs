use std::{
    borrow::Borrow,
    fmt::{Debug, Formatter},
    hash::{BuildHasher, BuildHasherDefault, Hash},
    marker::PhantomData,
};

use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use hashbrown::hash_map::HashMap;
use indexmap::IndexMap;
use rustc_hash::FxHasher;
use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{MapAccess, Visitor},
    ser::SerializeMap,
};
use shrink_to_fit::ShrinkToFit;

use crate::{
    MAX_USEFUL_LINEAR_SCAN, MIN_HASH_SIZE, TinyVec,
    storage::{BackingListStorage, BackingMapIter, BackingMapStorage, MapEntry},
};

/// A map that stores small numbers of entries in a linear list `L` and switches to a real map `M`
/// when it grows beyond `MAX_USEFUL_LINEAR_SCAN` entries.
///
/// The map storage `M` decides whether the map is ordered (see [`BackingMapStorage::UNORDERED`]).
/// Use the [`AutoMap`] (hash map based, unordered) or [`AutoIndexMap`] (index map based,
/// insertion ordered) aliases instead of naming this type directly.
#[derive(Clone)]
pub enum RawAutoMap<K, V, M, L> {
    List(L, PhantomData<(K, V)>),
    Map(Box<M>),
}

// The aliases are defined in the crate root. Re-exported here to keep the `map::` paths working.
pub use crate::{AutoIndexMap, AutoMap};

impl<K, V, M, L: BackingListStorage<(K, V)>> Default for RawAutoMap<K, V, M, L> {
    fn default() -> Self {
        Self::List(L::EMPTY, PhantomData)
    }
}

impl<K: Debug, V: Debug, M: BackingMapStorage<K, V>, L: BackingListStorage<(K, V)>> Debug
    for RawAutoMap<K, V, M, L>
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_map().entries(self.iter()).finish()
    }
}

macro_rules! impl_new {
    ($map:ident) => {
        impl<K, V>
            RawAutoMap<
                K,
                V,
                $map<K, V, BuildHasherDefault<FxHasher>>,
                TinyVec<(K, V), 0, MAX_USEFUL_LINEAR_SCAN>,
            >
        {
            /// see [HashMap::new](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.new)
            pub const fn new() -> Self {
                RawAutoMap::List(TinyVec::new(), PhantomData)
            }

            /// see [HashMap::with_capacity](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.with_capacity)
            pub fn with_capacity(capacity: usize) -> Self {
                if capacity < MAX_USEFUL_LINEAR_SCAN {
                    RawAutoMap::List(TinyVec::with_capacity(capacity), PhantomData)
                } else {
                    RawAutoMap::Map(Box::new($map::with_capacity_and_hasher(
                        capacity,
                        Default::default(),
                    )))
                }
            }
        }
    };
}

impl_new!(HashMap);
impl_new!(IndexMap);

impl<K, V, M: BackingMapStorage<K, V>, L: BackingListStorage<(K, V)>> RawAutoMap<K, V, M, L> {
    /// see [HashMap::with_hasher](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.with_hasher)
    pub const fn with_hasher() -> Self {
        RawAutoMap::List(L::EMPTY, PhantomData)
    }

    /// see [HashMap::with_capacity_and_hasher](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.with_capacity_and_hasher)
    pub fn with_capacity_and_hasher(capacity: usize, hasher: M::Hasher) -> Self {
        if capacity <= MAX_USEFUL_LINEAR_SCAN {
            RawAutoMap::List(L::with_capacity(capacity), PhantomData)
        } else {
            RawAutoMap::Map(Box::new(M::with_capacity_and_hasher(capacity, hasher)))
        }
    }

    /// see [HashMap::clear](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.clear)
    pub fn clear(&mut self) {
        match self {
            RawAutoMap::List(list, _) => list.clear(),
            RawAutoMap::Map(map) => map.clear(),
        }
    }

    /// Removes the list item at `index`. Unordered storages swap-remove, ordered storages shift
    /// the following items to preserve the order.
    fn list_remove(list: &mut L, index: usize) -> (K, V) {
        if M::UNORDERED {
            list.swap_remove(index)
        } else {
            list.remove(index)
        }
    }
}

impl<K: Eq + Hash, V, M, L> RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn convert_to_map(&mut self) -> &mut M {
        if let RawAutoMap::List(list, _) = self {
            let mut map =
                M::with_capacity_and_hasher(MAX_USEFUL_LINEAR_SCAN * 2, Default::default());
            map.extend(list.drain());
            *self = RawAutoMap::Map(Box::new(map));
        }
        if let RawAutoMap::Map(map) = self {
            map
        } else {
            unreachable!()
        }
    }

    fn convert_to_list(&mut self) -> &mut L {
        if let RawAutoMap::Map(map) = self {
            let mut list = L::with_capacity(MAX_USEFUL_LINEAR_SCAN);
            for entry in map.drain() {
                list.push(entry);
            }
            *self = RawAutoMap::List(list, PhantomData);
        }
        if let RawAutoMap::List(list, _) = self {
            list
        } else {
            unreachable!()
        }
    }

    /// Replaces the map variant with a list holding exactly its entries.
    fn map_to_exact_list(map: &mut M) -> Self {
        let mut list = L::with_capacity(map.len());
        for entry in map.drain() {
            list.push(entry);
        }
        RawAutoMap::List(list, PhantomData)
    }

    /// see [HashMap::insert](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.insert)
    #[inline]
    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        match self {
            RawAutoMap::List(list, _) => {
                for (k, v) in list.iter_mut() {
                    if *k == key {
                        return Some(std::mem::replace(v, value));
                    }
                }
                if list.len() >= MAX_USEFUL_LINEAR_SCAN {
                    self.convert_to_map_and_insert(key, value);
                } else {
                    list.push((key, value));
                }
                None
            }
            RawAutoMap::Map(map) => map.insert(key, value),
        }
    }

    /// The rare list -> map conversion of [`Self::insert`], kept out of line so that `insert`
    /// stays small enough to be inlined into its callers.
    #[cold]
    #[inline(never)]
    fn convert_to_map_and_insert(&mut self, key: K, value: V) {
        self.convert_to_map().insert(key, value);
    }

    /// The rare list -> map conversion of the vacant entries' `insert`, kept out of line like
    /// [`Self::convert_to_map_and_insert`]. A vacant raw entry can be inserted with a different
    /// key than it was looked up with, so the key may already be in the map.
    #[cold]
    #[inline(never)]
    fn convert_to_map_and_insert_entry(&mut self, key: K, value: V) -> &mut V {
        match self.convert_to_map().entry(key) {
            MapEntry::Occupied(entry) => M::occupied_into_mut(entry),
            MapEntry::Vacant(entry) => M::vacant_insert(entry, value),
        }
    }

    /// The list -> map conversion of [`Self::extend`] for inputs that (by their size hint) don't
    /// fit into the list, kept out of line like [`Self::convert_to_map_and_insert`].
    #[cold]
    #[inline(never)]
    fn convert_to_map_and_extend(&mut self, iter: impl Iterator<Item = (K, V)>) {
        let map = self.convert_to_map();
        map.extend(iter);
        // The hint is not enforced
        if map.len() < MIN_HASH_SIZE {
            self.convert_to_list();
        }
    }

    /// see [HashMap::remove](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.remove)
    ///
    /// Ordered storages preserve the order of the remaining entries.
    #[inline]
    pub fn remove(&mut self, key: &K) -> Option<V> {
        match self {
            RawAutoMap::List(list, _) => {
                for i in 0..list.len() {
                    if list[i].0 == *key {
                        return Some(Self::list_remove(list, i).1);
                    }
                }
                None
            }
            RawAutoMap::Map(map) => map.remove(key),
        }
    }

    /// Removes `key` by swapping the last entry into its place, like
    /// [IndexMap::swap_remove](https://docs.rs/indexmap/latest/indexmap/map/struct.IndexMap.html#method.swap_remove).
    ///
    /// This always swaps, also for ordered storages, so it's O(1) there but changes the order of
    /// the remaining entries. For unordered storages it's the same as [`Self::remove`].
    #[inline]
    pub fn swap_remove(&mut self, key: &K) -> Option<V> {
        match self {
            RawAutoMap::List(list, _) => {
                for i in 0..list.len() {
                    if list[i].0 == *key {
                        return Some(list.swap_remove(i).1);
                    }
                }
                None
            }
            RawAutoMap::Map(map) => map.swap_remove(key),
        }
    }

    /// see [HashMap::extend](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.extend)
    pub fn extend(&mut self, iter: impl IntoIterator<Item = (K, V)>) {
        let iter = iter.into_iter();
        match self {
            RawAutoMap::List(list, _) => {
                let (lower, _) = iter.size_hint();
                if list.len() + lower > MAX_USEFUL_LINEAR_SCAN {
                    self.convert_to_map_and_extend(iter);
                    return;
                }
                for (k, v) in iter {
                    self.insert(k, v);
                }
            }
            RawAutoMap::Map(map) => {
                map.extend(iter);
            }
        }
    }

    /// see [HashMap::entry](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.entry)
    pub fn entry(&mut self, key: K) -> Entry<'_, K, V, M, L> {
        // Look up the list position first, so that the vacant entry can borrow the whole map.
        let list_position = match self {
            RawAutoMap::List(list, _) => Some(list.iter().position(|(k, _)| *k == key)),
            RawAutoMap::Map(_) => None,
        };
        match (list_position, self) {
            (Some(Some(index)), RawAutoMap::List(list, _)) => {
                Entry::Occupied(OccupiedEntry::List { list, index })
            }
            (Some(None), this) => Entry::Vacant(VacantEntry::List { this, key }),
            (None, RawAutoMap::Map(map)) => match map.entry(key) {
                MapEntry::Occupied(entry) => Entry::Occupied(OccupiedEntry::Map(entry)),
                MapEntry::Vacant(entry) => Entry::Vacant(VacantEntry::Map(entry)),
            },
            _ => unreachable!(),
        }
    }

    pub fn raw_entry_mut<Q>(&mut self, key: &Q) -> RawEntry<'_, K, V, M, L>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        // Look up the list position first, so that the vacant entry can borrow the whole map.
        let list_position = match self {
            RawAutoMap::List(list, _) => Some(list.iter().position(|(k, _)| k.borrow() == key)),
            RawAutoMap::Map(_) => None,
        };
        match (list_position, self) {
            (Some(Some(index)), RawAutoMap::List(list, _)) => {
                RawEntry::Occupied(OccupiedRawEntry::List { list, index })
            }
            (Some(None), this) => RawEntry::Vacant(VacantRawEntry::List { this }),
            (None, RawAutoMap::Map(map)) => match map.raw_entry_mut(key) {
                MapEntry::Occupied(entry) => RawEntry::Occupied(OccupiedRawEntry::Map(entry)),
                MapEntry::Vacant(entry) => RawEntry::Vacant(VacantRawEntry::Map(entry)),
            },
            _ => unreachable!(),
        }
    }

    /// see [HashMap::retain](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.retain)
    ///
    /// Ordered storages preserve the order of the retained entries.
    pub fn retain<F>(&mut self, mut f: F)
    where
        F: FnMut(&K, &mut V) -> bool,
    {
        match self {
            RawAutoMap::List(list, _) => {
                // For unordered storages this swap-removes, which is faster than the
                // order-preserving algorithm of `Vec::retain`.
                let mut i = 0;
                while i < list.len() {
                    let (key, value) = &mut list[i];
                    if !f(key, value) {
                        Self::list_remove(list, i);
                    } else {
                        i += 1;
                    }
                }
            }
            RawAutoMap::Map(map) => {
                map.retain(f);
            }
        }
    }

    pub fn extract_if<'l, F>(&'l mut self, f: F) -> ExtractIfIter<'l, K, V, L, F>
    where
        F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
    {
        match self {
            RawAutoMap::List(list, _) => ExtractIfIter::List {
                list,
                index: 0,
                f,
                unordered: M::UNORDERED,
            },
            RawAutoMap::Map(map) => map.extract_if(f),
        }
    }

    /// see [HashMap::shrink_to_fit](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.shrink_to_fit)
    pub fn shrink_to_fit(&mut self) {
        match self {
            RawAutoMap::List(list, _) => list.shrink_to_fit(),
            RawAutoMap::Map(map) => {
                if map.len() <= MAX_USEFUL_LINEAR_SCAN {
                    *self = Self::map_to_exact_list(map);
                } else {
                    map.shrink_to_fit();
                }
            }
        }
    }

    pub fn shrink_amortized(&mut self) {
        match self {
            RawAutoMap::List(list, _) => {
                // `shrink_to_fit` returns spilled storage to inline
                // (or a tighter heap buffer) when the occupancy warrants it.
                if list.capacity() > list.len() * 3 {
                    list.shrink_to_fit();
                }
            }
            RawAutoMap::Map(map) => {
                if map.len() <= MIN_HASH_SIZE {
                    *self = Self::map_to_exact_list(map);
                } else if map.capacity() > map.len() * 3 {
                    // HashMaps will always have a capacity that is a power of two
                    map.shrink_to_fit();
                }
            }
        }
    }
}

impl<K: Eq + Hash, V, M, L> RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::get](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get)
    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => list
                .iter()
                .find_map(|(k, v)| if *k.borrow() == *key { Some(v) } else { None }),
            RawAutoMap::Map(map) => map.get(key),
        }
    }

    /// see [HashMap::get_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get_mut)
    pub fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        match self {
            RawAutoMap::List(list, _) => list
                .iter_mut()
                .find_map(|(k, v)| if *k == *key { Some(v) } else { None }),
            RawAutoMap::Map(map) => map.get_mut(key),
        }
    }

    /// see [HashMap::contains_key](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.contains_key)
    pub fn contains_key(&self, key: &K) -> bool {
        match self {
            RawAutoMap::List(list, _) => list.iter().any(|(k, _)| *k == *key),
            RawAutoMap::Map(map) => map.contains_key(key),
        }
    }
}

impl<K, V, M: BackingMapStorage<K, V>, L: BackingListStorage<(K, V)>> RawAutoMap<K, V, M, L> {
    /// see [HashMap::iter](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.iter)
    pub fn iter(&self) -> Iter<M::Iter<'_>> {
        match self {
            RawAutoMap::List(list, _) => Iter::List(ListIter(list.iter())),
            RawAutoMap::Map(map) => Iter::Map(map.iter()),
        }
    }
    /// see [HashMap::iter_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.iter_mut)
    pub fn iter_mut(&mut self) -> IterMut<M::IterMut<'_>> {
        match self {
            RawAutoMap::List(list, _) => Iter::List(ListIterMut(list.iter_mut())),
            RawAutoMap::Map(map) => Iter::Map(map.iter_mut()),
        }
    }

    /// see [HashMap::is_empty](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.is_empty)
    pub fn is_empty(&self) -> bool {
        match self {
            RawAutoMap::List(list, _) => list.is_empty(),
            RawAutoMap::Map(map) => map.is_empty(),
        }
    }

    /// see [HashMap::len](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.len)
    pub fn len(&self) -> usize {
        match self {
            RawAutoMap::List(list, _) => list.len(),
            RawAutoMap::Map(map) => map.len(),
        }
    }

    /// see [HashMap::values_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.values_mut)
    pub fn values_mut(&mut self) -> ValuesMut<M::ValuesMut<'_>> {
        match self {
            RawAutoMap::List(list, _) => Iter::List(ListValuesMut(list.iter_mut())),
            RawAutoMap::Map(map) => Iter::Map(map.values_mut()),
        }
    }

    /// see [HashMap::values](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.values)
    pub fn values(&self) -> Values<M::Values<'_>> {
        match self {
            RawAutoMap::List(list, _) => Iter::List(ListValues(list.iter())),
            RawAutoMap::Map(map) => Iter::Map(map.values()),
        }
    }

    /// see [HashMap::into_values](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.into_values)
    pub fn into_values(self) -> IntoValues<L::IntoIter, M::IntoValues> {
        match self {
            RawAutoMap::List(list, _) => IntoValues::List(list.into_iter()),
            RawAutoMap::Map(map) => IntoValues::Map(map.into_values()),
        }
    }
}

impl<K, V, M: BackingMapStorage<K, V>, L: BackingListStorage<(K, V)>> IntoIterator
    for RawAutoMap<K, V, M, L>
{
    type Item = (K, V);
    type IntoIter = IntoIter<L::IntoIter, M::IntoIter>;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            RawAutoMap::List(list, _) => IntoIter::List(list.into_iter()),
            RawAutoMap::Map(map) => IntoIter::Map(map.into_entries()),
        }
    }
}

impl<'a, K, V, M: BackingMapStorage<K, V>, L: BackingListStorage<(K, V)>> IntoIterator
    for &'a RawAutoMap<K, V, M, L>
{
    type Item = (&'a K, &'a V);
    type IntoIter = Iter<M::Iter<'a>>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// A borrowed iterator of a [`RawAutoMap`]. `MI` is the iterator of the map storage, e.g.
/// [`BackingMapStorage::Iter`], and its [`BackingMapIter::List`] iterates the list variant.
///
/// The trait impls only require `MI: BackingMapIter` and take the `Item` type from it (see
/// [`BackingMapIter`] for why).
pub enum Iter<MI: BackingMapIter> {
    List(MI::List),
    Map(MI),
}

/// See [`Iter`], with `MI` = [`BackingMapStorage::IterMut`].
pub type IterMut<MI> = Iter<MI>;
/// See [`Iter`], with `MI` = [`BackingMapStorage::Values`].
pub type Values<MI> = Iter<MI>;
/// See [`Iter`], with `MI` = [`BackingMapStorage::ValuesMut`].
pub type ValuesMut<MI> = Iter<MI>;

impl<MI: BackingMapIter> Iterator for Iter<MI> {
    type Item = MI::Item;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Iter::List(iter) => iter.next(),
            Iter::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Iter::List(iter) => iter.size_hint(),
            Iter::Map(iter) => iter.size_hint(),
        }
    }

    // Forward to the inner iterator's `fold`, so the variant is matched once and the map's
    // specialized `fold` (e.g. hashbrown's group-wise traversal) is used.
    #[inline]
    fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        match self {
            Iter::List(iter) => iter.fold(init, f),
            Iter::Map(iter) => iter.fold(init, f),
        }
    }
}

impl<MI: BackingMapIter<List: Clone> + Clone> Clone for Iter<MI> {
    fn clone(&self) -> Self {
        match self {
            Iter::List(iter) => Iter::List(iter.clone()),
            Iter::Map(iter) => Iter::Map(iter.clone()),
        }
    }
}

/// [`BackingMapIter::List`] of [`BackingMapStorage::Iter`].
pub struct ListIter<'a, K, V>(std::slice::Iter<'a, (K, V)>);

// Not derived, as that would require `K: Clone, V: Clone`.
impl<K, V> Clone for ListIter<'_, K, V> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<'a, K, V> Iterator for ListIter<'a, K, V> {
    type Item = (&'a K, &'a V);

    // This clippy lint doesn't account for lifetimes
    #[allow(clippy::map_identity)]
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, v)| (k, v))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }

    #[inline]
    fn fold<B, F>(self, init: B, mut f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        self.0.fold(init, move |acc, (k, v)| f(acc, (k, v)))
    }
}

/// [`BackingMapIter::List`] of [`BackingMapStorage::IterMut`].
pub struct ListIterMut<'a, K, V>(std::slice::IterMut<'a, (K, V)>);

impl<'a, K, V> Iterator for ListIterMut<'a, K, V> {
    type Item = (&'a K, &'a mut V);

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, v)| (&*k, v))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }

    #[inline]
    fn fold<B, F>(self, init: B, mut f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        self.0.fold(init, move |acc, (k, v)| f(acc, (&*k, v)))
    }
}

/// [`BackingMapIter::List`] of [`BackingMapStorage::Values`].
pub struct ListValues<'a, K, V>(std::slice::Iter<'a, (K, V)>);

// Not derived, as that would require `K: Clone, V: Clone`.
impl<K, V> Clone for ListValues<'_, K, V> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<'a, K, V> Iterator for ListValues<'a, K, V> {
    type Item = &'a V;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(_, v)| v)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }

    #[inline]
    fn fold<B, F>(self, init: B, mut f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        self.0.fold(init, move |acc, (_, v)| f(acc, v))
    }
}

/// [`BackingMapIter::List`] of [`BackingMapStorage::ValuesMut`].
pub struct ListValuesMut<'a, K, V>(std::slice::IterMut<'a, (K, V)>);

impl<'a, K, V> Iterator for ListValuesMut<'a, K, V> {
    type Item = &'a mut V;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(_, v)| v)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }

    #[inline]
    fn fold<B, F>(self, init: B, mut f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        self.0.fold(init, move |acc, (_, v)| f(acc, v))
    }
}

// The owned iterator types are parameterized by the concrete iterator types of the backing
// storages (`LI` for the list, `MI` for the map) instead of naming projections like `M::IntoIter`
// in their fields, and their trait impls don't relate lifetimes (see `BackingMapIter` for why).

pub enum IntoIter<LI, MI> {
    List(LI),
    Map(MI),
}

impl<LI: Iterator, MI: Iterator<Item = LI::Item>> Iterator for IntoIter<LI, MI> {
    type Item = LI::Item;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            IntoIter::List(iter) => iter.next(),
            IntoIter::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            IntoIter::List(iter) => iter.size_hint(),
            IntoIter::Map(iter) => iter.size_hint(),
        }
    }

    // See `Iter::fold`.
    #[inline]
    fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        match self {
            IntoIter::List(iter) => iter.fold(init, f),
            IntoIter::Map(iter) => iter.fold(init, f),
        }
    }
}

pub enum IntoValues<LI, MI> {
    List(LI),
    Map(MI),
}

impl<K, V, LI: Iterator<Item = (K, V)>, MI: Iterator<Item = V>> Iterator for IntoValues<LI, MI> {
    type Item = V;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            IntoValues::List(iter) => iter.next().map(|(_, v)| v),
            IntoValues::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            IntoValues::List(iter) => iter.size_hint(),
            IntoValues::Map(iter) => iter.size_hint(),
        }
    }

    // See `Iter::fold`.
    #[inline]
    fn fold<B, F>(self, init: B, f: F) -> B
    where
        F: FnMut(B, Self::Item) -> B,
    {
        match self {
            // `map` first, so that the key is dropped before `f` runs, like in `next`.
            IntoValues::List(iter) => iter.map(|(_, v)| v).fold(init, f),
            IntoValues::Map(iter) => iter.fold(init, f),
        }
    }
}

pub enum Entry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    Occupied(OccupiedEntry<'a, K, V, M, L>),
    Vacant(VacantEntry<'a, K, V, M, L>),
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> Entry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::Entry::or_insert](https://doc.rust-lang.org/std/collections/hash_map/enum.Entry.html#method.or_insert)
    pub fn or_insert_with(self, default: impl FnOnce() -> V) -> &'a mut V {
        match self {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(default()),
        }
    }

    /// see [HashMap::Entry::or_insert](https://doc.rust-lang.org/std/collections/hash_map/enum.Entry.html#method.or_insert)
    pub fn or_insert(self, default: V) -> &'a mut V {
        match self {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(default),
        }
    }
}

impl<'a, K: Eq + Hash + 'a, V: Default + 'a, M, L> Entry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::Entry::or_default](https://doc.rust-lang.org/std/collections/hash_map/enum.Entry.html#method.or_default)
    pub fn or_default(self) -> &'a mut V {
        match self {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(Default::default()),
        }
    }
}

pub enum OccupiedEntry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    List { list: &'a mut L, index: usize },
    Map(M::Occupied<'a>),
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> OccupiedEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::OccupiedEntry::get_mut](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.get_mut)
    pub fn get_mut(&mut self) -> &mut V {
        match self {
            OccupiedEntry::List { list, index } => &mut list[*index].1,
            OccupiedEntry::Map(entry) => M::occupied_get_mut(entry),
        }
    }

    /// see [HashMap::OccupiedEntry::into_mut](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.into_mut)
    pub fn into_mut(self) -> &'a mut V {
        match self {
            OccupiedEntry::List { list, index } => &mut list[index].1,
            OccupiedEntry::Map(entry) => M::occupied_into_mut(entry),
        }
    }
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> OccupiedEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::OccupiedEntry::remove](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.remove)
    ///
    /// Ordered storages preserve the order of the remaining entries.
    pub fn remove(self) -> V {
        match self {
            OccupiedEntry::List { list, index } => {
                RawAutoMap::<K, V, M, L>::list_remove(list, index).1
            }
            OccupiedEntry::Map(entry) => M::occupied_remove(entry),
        }
    }

    /// Replaces the value with the result of `func`, or removes the entry when it returns `None`.
    ///
    /// Ordered storages keep the entry at its position.
    pub fn replace_entry_with(self, func: impl FnOnce(&K, V) -> Option<V>) {
        match self {
            OccupiedEntry::List { list, index } => {
                if M::UNORDERED {
                    let (key, value) = list.swap_remove(index);
                    if let Some(value) = func(&key, value) {
                        list.push((key, value));
                    }
                } else {
                    let (key, value) = list.remove(index);
                    if let Some(value) = func(&key, value) {
                        list.insert(index, (key, value));
                    }
                }
            }
            OccupiedEntry::Map(entry) => {
                M::occupied_replace_entry_with(entry, func);
            }
        }
    }
}

pub enum VacantEntry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    /// The map is in the list variant and doesn't contain `key`.
    List {
        this: &'a mut RawAutoMap<K, V, M, L>,
        key: K,
    },
    Map(M::Vacant<'a>),
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> VacantEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::VacantEntry::insert](https://doc.rust-lang.org/std/collections/hash_map/enum.VacantEntry.html#method.insert)
    pub fn insert(self, value: V) -> &'a mut V {
        match self {
            VacantEntry::List { this, key } => {
                if this.len() >= MAX_USEFUL_LINEAR_SCAN {
                    this.convert_to_map_and_insert_entry(key, value)
                } else {
                    let RawAutoMap::List(list, _) = this else {
                        unreachable!()
                    };
                    list.push((key, value));
                    &mut list.last_mut().unwrap().1
                }
            }
            VacantEntry::Map(entry) => M::vacant_insert(entry, value),
        }
    }
}

pub enum RawEntry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    Occupied(OccupiedRawEntry<'a, K, V, M, L>),
    Vacant(VacantRawEntry<'a, K, V, M, L>),
}

pub enum OccupiedRawEntry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    List { list: &'a mut L, index: usize },
    Map(M::RawOccupied<'a>),
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> OccupiedRawEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::RawOccupiedEntryMut::get_mut](https://doc.rust-lang.org/std/collections/hash_map/struct.RawOccupiedEntryMut.html#method.get_mut)
    pub fn get_mut(&mut self) -> &mut V {
        match self {
            OccupiedRawEntry::List { list, index } => &mut list[*index].1,
            OccupiedRawEntry::Map(entry) => M::raw_occupied_get_mut(entry),
        }
    }

    /// see [HashMap::RawOccupiedEntryMut::into_mut](https://doc.rust-lang.org/std/collections/hash_map/struct.RawOccupiedEntryMut.html#method.into_mut)
    pub fn into_mut(self) -> &'a mut V {
        match self {
            OccupiedRawEntry::List { list, index } => &mut list[index].1,
            OccupiedRawEntry::Map(entry) => M::raw_occupied_into_mut(entry),
        }
    }
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> OccupiedRawEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::OccupiedEntry::remove](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.remove)
    ///
    /// Ordered storages preserve the order of the remaining entries.
    pub fn remove(self) -> V {
        match self {
            OccupiedRawEntry::List { list, index } => {
                RawAutoMap::<K, V, M, L>::list_remove(list, index).1
            }
            OccupiedRawEntry::Map(entry) => M::raw_occupied_remove(entry),
        }
    }
}

pub enum VacantRawEntry<'a, K, V, M: BackingMapStorage<K, V> + 'a, L> {
    /// The map is in the list variant and doesn't contain the key.
    List {
        this: &'a mut RawAutoMap<K, V, M, L>,
    },
    Map(M::RawVacant<'a>),
}

impl<'a, K: Eq + Hash + 'a, V: 'a, M, L> VacantRawEntry<'a, K, V, M, L>
where
    M: BackingMapStorage<K, V> + 'a,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    /// see [HashMap::RawVacantEntryMut::insert](https://doc.rust-lang.org/std/collections/hash_map/struct.RawVacantEntryMut.html#method.insert)
    pub fn insert(self, key: K, value: V) -> &'a mut V {
        match self {
            VacantRawEntry::List { this } => {
                if this.len() >= MAX_USEFUL_LINEAR_SCAN {
                    this.convert_to_map_and_insert_entry(key, value)
                } else {
                    let RawAutoMap::List(list, _) = this else {
                        unreachable!()
                    };
                    list.push((key, value));
                    &mut list.last_mut().unwrap().1
                }
            }
            VacantRawEntry::Map(entry) => M::raw_vacant_insert(entry, key, value),
        }
    }
}

impl<K, V, M, L> Serialize for RawAutoMap<K, V, M, L>
where
    K: Serialize,
    V: Serialize,
    M: BackingMapStorage<K, V>,
    L: BackingListStorage<(K, V)>,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.len()))?;
        for (k, v) in self.iter() {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
}

impl<'de, K, V, M, L> Deserialize<'de> for RawAutoMap<K, V, M, L>
where
    K: Eq + Hash + Deserialize<'de>,
    V: Deserialize<'de>,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct AutoMapVisitor<K, V, M, L> {
            phantom: PhantomData<RawAutoMap<K, V, M, L>>,
        }

        impl<'de, K, V, M, L> Visitor<'de> for AutoMapVisitor<K, V, M, L>
        where
            K: Eq + Hash + Deserialize<'de>,
            V: Deserialize<'de>,
            M: BackingMapStorage<K, V>,
            M::Hasher: BuildHasher + Default,
            L: BackingListStorage<(K, V)>,
        {
            type Value = RawAutoMap<K, V, M, L>;

            fn expecting(&self, formatter: &mut Formatter) -> std::fmt::Result {
                formatter.write_str("a map")
            }

            fn visit_map<A>(self, mut m: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                // `size_hint` is only advisory, so use it to reserve map capacity when large, when
                // small just grow like normal
                let size = m.size_hint().unwrap_or(0);
                let mut map = if size < MAX_USEFUL_LINEAR_SCAN {
                    RawAutoMap::with_hasher()
                } else {
                    RawAutoMap::Map(Box::new(M::with_capacity_and_hasher(
                        size,
                        M::Hasher::default(),
                    )))
                };
                while let Some((k, v)) = m.next_entry()? {
                    map.insert(k, v);
                }
                Ok(map)
            }
        }

        deserializer.deserialize_map(AutoMapVisitor {
            phantom: PhantomData::<RawAutoMap<K, V, M, L>>,
        })
    }
}

impl<K, V, M, L> Encode for RawAutoMap<K, V, M, L>
where
    K: Encode,
    V: Encode,
    M: BackingMapStorage<K, V>,
    L: BackingListStorage<(K, V)>,
{
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        // Encode the length first
        self.len().encode(encoder)?;
        // Then encode each key-value tuple
        for entry in self.iter() {
            entry.encode(encoder)?;
        }
        Ok(())
    }
}

impl<Context, K, V, M, L> Decode<Context> for RawAutoMap<K, V, M, L>
where
    K: Decode<Context> + Eq + Hash,
    V: Decode<Context>,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let len = usize::decode(decoder)?;
        if len <= MAX_USEFUL_LINEAR_SCAN {
            let mut list = L::with_capacity(len);
            for _ in 0..len {
                let entry = <(K, V)>::decode(decoder)?;
                list.push(entry);
            }
            Ok(RawAutoMap::List(list, PhantomData))
        } else {
            let mut map = M::with_capacity_and_hasher(len, M::Hasher::default());
            for _ in 0..len {
                let (key, value) = <(K, V)>::decode(decoder)?;
                map.insert(key, value);
            }
            Ok(RawAutoMap::Map(Box::new(map)))
        }
    }
}

impl<'de, Context, K, V, M, L> BorrowDecode<'de, Context> for RawAutoMap<K, V, M, L>
where
    K: Decode<Context> + Eq + Hash,
    V: Decode<Context>,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn borrow_decode<D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, DecodeError> {
        Decode::decode(decoder)
    }
}

impl<K: Eq + Hash, V: Eq, M, L> PartialEq for RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
    /// Delegates to [`BackingMapStorage::eq`]: order insensitive for unordered storages, order
    /// sensitive for ordered ones.
    fn eq(&self, other: &Self) -> bool {
        M::eq(self, other)
    }
}

impl<K: Eq + Hash, V: Eq, M, L> Eq for RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
}

impl<K: Eq + Hash, V: Eq + Hash, M, L> Hash for RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        // Hash the length first to distinguish maps of different sizes
        self.len().hash(state);

        if !M::UNORDERED {
            // Equality is order sensitive, so the hash can be too.
            for (k, v) in self.iter() {
                k.hash(state);
                v.hash(state);
            }
            return;
        }

        // Use a commutative approach to ensure equal maps have equal hashes
        // regardless of iteration order
        let mut combined_hash = 0u64;

        let hash_builder = M::Hasher::default();
        for (k, v) in self.iter() {
            use std::hash::Hasher;

            // Hash each key-value pair independently
            let mut entry_hasher = hash_builder.build_hasher();
            k.hash(&mut entry_hasher);
            v.hash(&mut entry_hasher);
            let entry_hash = entry_hasher.finish();

            // Combine using addition to make it order-independent (wrapping_add is commutative)
            combined_hash = combined_hash.wrapping_add(entry_hash);
        }

        // Hash the combined result
        combined_hash.hash(state);
    }
}

impl<K, V, M, L> FromIterator<(K, V)> for RawAutoMap<K, V, M, L>
where
    K: Eq + Hash,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn from_iter<T: IntoIterator<Item = (K, V)>>(iter: T) -> Self {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        if lower > MAX_USEFUL_LINEAR_SCAN {
            let mut map = M::with_capacity_and_hasher(lower, M::Hasher::default());
            map.extend(iter);
            // The hint is not enforced
            if map.len() < MIN_HASH_SIZE {
                return Self::map_to_exact_list(&mut map);
            }
            return RawAutoMap::Map(Box::new(map));
        }
        let mut map = RawAutoMap::with_hasher();
        for (k, v) in iter {
            map.insert(k, v);
        }
        map
    }
}

/// Iterator returned by [`RawAutoMap::extract_if`].
pub enum ExtractIfIter<'l, K, V, L, F> {
    List {
        list: &'l mut L,
        index: usize,
        f: F,
        /// [`BackingMapStorage::UNORDERED`] of the map storage.
        unordered: bool,
    },
    HashMap(hashbrown::hash_map::ExtractIf<'l, K, V, F>),
    IndexMap(indexmap::map::ExtractIf<'l, K, V, F>),
}

impl<K, V, L, F> Iterator for ExtractIfIter<'_, K, V, L, F>
where
    L: BackingListStorage<(K, V)>,
    F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
{
    type Item = (K, V);

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ExtractIfIter::List {
                list,
                index,
                f,
                unordered,
            } => {
                while *index < list.len() {
                    let (key, value) = &mut list[*index];
                    if f(key, value) {
                        let item = if *unordered {
                            list.swap_remove(*index)
                        } else {
                            list.remove(*index)
                        };
                        return Some(item);
                    } else {
                        *index += 1;
                    }
                }
                None
            }
            ExtractIfIter::HashMap(extract_if) => extract_if.next(),
            ExtractIfIter::IndexMap(extract_if) => extract_if.next(),
        }
    }
}

impl<K, V, M, L> ShrinkToFit for RawAutoMap<K, V, M, L>
where
    K: Eq + Hash,
    V: Eq,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn shrink_to_fit(&mut self) {
        if self.len() < MIN_HASH_SIZE {
            self.convert_to_list();
        }

        match self {
            RawAutoMap::List(list, _) => list.shrink_to_fit(),
            RawAutoMap::Map(map) => map.shrink_to_fit(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_map() {
        let mut map = AutoMap::new();
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            map.insert(i, i);
        }
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            assert_eq!(map.get(&i), Some(&i));
        }
        assert_eq!(map.get(&(MAX_USEFUL_LINEAR_SCAN * 2)), None);
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            assert_eq!(map.remove(&(MAX_USEFUL_LINEAR_SCAN * 2)), None);
            assert_eq!(map.remove(&i), Some(i));
        }
        assert_eq!(map.remove(&(MAX_USEFUL_LINEAR_SCAN * 2)), None);
    }

    #[test]
    fn test_extract_if_map() {
        let mut map = AutoMap::new();
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            map.insert(i, i);
        }
        let iter = map.extract_if(|_, v| *v % 2 == 0);
        assert_eq!(iter.count(), MAX_USEFUL_LINEAR_SCAN);
        assert_eq!(map.len(), MAX_USEFUL_LINEAR_SCAN);
    }

    #[test]
    fn test_extract_if_list() {
        let mut map = AutoMap::new();
        for i in 0..MIN_HASH_SIZE {
            map.insert(i, i);
        }
        let iter = map.extract_if(|_, v| *v % 2 == 0);
        assert_eq!(iter.count(), MIN_HASH_SIZE / 2);
        assert_eq!(map.len(), MIN_HASH_SIZE / 2);
    }

    #[test]
    fn test_extract_if_list2() {
        let mut map = AutoMap::new();
        for i in 0..MIN_HASH_SIZE {
            map.insert(i, i);
        }
        let iter = map.extract_if(|_, v| *v < 5);
        assert_eq!(iter.count(), 5);
        assert_eq!(map.len(), MIN_HASH_SIZE - 5);
    }

    fn keys<M: BackingMapStorage<usize, usize>, L: BackingListStorage<(usize, usize)>>(
        map: &RawAutoMap<usize, usize, M, L>,
    ) -> Vec<usize> {
        map.iter().map(|(k, _)| *k).collect()
    }

    fn hash_of<T: Hash>(value: &T) -> u64 {
        BuildHasherDefault::<FxHasher>::default().hash_one(value)
    }

    #[test]
    fn test_auto_map_eq_is_order_insensitive() {
        for n in [3, MAX_USEFUL_LINEAR_SCAN * 2] {
            let a: AutoMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let b: AutoMap<usize, usize> = (0..n).rev().map(|i| (i, i)).collect();
            assert_eq!(a, b);
            assert_eq!(hash_of(&a), hash_of(&b));
        }
    }

    #[test]
    fn test_auto_index_map_eq_is_order_sensitive() {
        for n in [3, MAX_USEFUL_LINEAR_SCAN * 2] {
            let a: AutoIndexMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let a2: AutoIndexMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let b: AutoIndexMap<usize, usize> = (0..n).rev().map(|i| (i, i)).collect();
            assert_eq!(a, a2);
            assert_eq!(hash_of(&a), hash_of(&a2));
            assert_ne!(a, b);
        }

        // List variant vs. map variant with the same content.
        let n = MIN_HASH_SIZE + 4;
        let mut list = AutoIndexMap::new();
        for i in 0..n {
            list.insert(i, i);
        }
        let mut map = AutoIndexMap::new();
        for i in 0..MAX_USEFUL_LINEAR_SCAN * 2 {
            map.insert(i, i);
        }
        map.retain(|k, _| *k < n);
        assert!(matches!(list, RawAutoMap::List(..)));
        assert!(matches!(map, RawAutoMap::Map(..)));
        assert_eq!(list, map);
        assert_eq!(map, list);
        assert_eq!(hash_of(&list), hash_of(&map));
        let swapped = map.remove(&0).unwrap();
        map.insert(0, swapped);
        assert_ne!(list, map);
        assert_ne!(map, list);
    }

    #[test]
    fn test_auto_index_map_order() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map = AutoIndexMap::new();
        // Reverse insertion order so that order != key order.
        for i in (0..n).rev() {
            map.insert(i, i);
        }
        assert!(matches!(map, RawAutoMap::Map(..)));
        assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());

        // Removals in map mode preserve order.
        map.remove(&(n - 2));
        map.retain(|k, _| k % 3 != 0);
        assert_eq!(
            map.extract_if(|k, _| k % 5 == 0).count(),
            (0..n)
                .filter(|k| k % 3 != 0 && k % 5 == 0 && *k != n - 2)
                .count()
        );
        let expected: Vec<usize> = (0..n)
            .rev()
            .filter(|k| *k != n - 2 && k % 3 != 0 && k % 5 != 0)
            .collect();
        assert_eq!(keys(&map), expected);

        // Shrinking back to the list variant preserves order.
        map.retain(|k, _| *k < 20);
        map.shrink_to_fit();
        assert!(matches!(map, RawAutoMap::List(..)));
        let expected: Vec<usize> = expected.into_iter().filter(|k| *k < 20).collect();
        assert_eq!(keys(&map), expected);

        // Removals in list mode preserve order.
        let mut expected = expected;
        let first = expected.remove(0);
        map.remove(&first);
        assert_eq!(keys(&map), expected);
        match map.entry(expected[0]) {
            Entry::Occupied(e) => {
                e.remove();
            }
            Entry::Vacant(_) => panic!(),
        }
        expected.remove(0);
        assert_eq!(keys(&map), expected);
        match map.raw_entry_mut(&expected[0]) {
            RawEntry::Occupied(e) => {
                e.remove();
            }
            RawEntry::Vacant(_) => panic!(),
        }
        expected.remove(0);
        assert_eq!(keys(&map), expected);
        // `replace_entry_with` keeps the position.
        match map.entry(expected[0]) {
            Entry::Occupied(e) => e.replace_entry_with(|_, v| Some(v + 100)),
            Entry::Vacant(_) => panic!(),
        }
        assert_eq!(keys(&map), expected);
        assert_eq!(map.get(&expected[0]), Some(&(expected[0] + 100)));
        assert_eq!(
            map.extract_if(|k, _| k % 2 == 0).count(),
            expected.iter().filter(|k| *k % 2 == 0).count()
        );
        expected.retain(|k| k % 2 != 0);
        assert_eq!(keys(&map), expected);
        map.retain(|k, _| *k != expected[1]);
        expected.remove(1);
        assert_eq!(keys(&map), expected);
    }

    #[test]
    fn test_auto_index_map_swap_remove() {
        // List mode: the last entry moves into the removed slot.
        let mut map: AutoIndexMap<usize, usize> = (0..5).map(|i| (i, i * 10)).collect();
        assert!(matches!(map, RawAutoMap::List(..)));
        assert_eq!(map.swap_remove(&1), Some(10));
        assert_eq!(map.swap_remove(&1), None);
        assert_eq!(map.swap_remove(&99), None);
        assert_eq!(keys(&map), vec![0, 4, 2, 3]);
        // Removing the last entry doesn't move anything.
        assert_eq!(map.swap_remove(&3), Some(30));
        assert_eq!(keys(&map), vec![0, 4, 2]);

        // Map mode: same semantics as `IndexMap::swap_remove`.
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map: AutoIndexMap<usize, usize> = (0..n).map(|i| (i, i * 10)).collect();
        assert!(matches!(map, RawAutoMap::Map(..)));
        assert_eq!(map.swap_remove(&0), Some(0));
        assert_eq!(map.swap_remove(&0), None);
        let mut expected: Vec<usize> = (0..n).collect();
        expected.swap_remove(0);
        assert_eq!(keys(&map), expected);
        assert_eq!(map.get(&(n - 1)), Some(&((n - 1) * 10)));
    }

    #[test]
    fn test_auto_map_swap_remove_is_remove() {
        for n in [5, MAX_USEFUL_LINEAR_SCAN * 2] {
            let mut swapped: AutoMap<usize, usize> = (0..n).map(|i| (i, i * 10)).collect();
            let mut removed = swapped.clone();
            for key in [1, 3, n - 1, n + 7] {
                assert_eq!(swapped.swap_remove(&key), removed.remove(&key));
            }
            assert_eq!(keys(&swapped), keys(&removed));
            assert_eq!(swapped, removed);
        }
    }

    #[test]
    fn test_auto_index_map_entry_order_across_conversion() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map = AutoIndexMap::new();
        for i in (0..n).rev() {
            *map.entry(i).or_default() += i;
        }
        assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());
        let mut map = AutoIndexMap::new();
        for i in (0..n).rev() {
            match map.raw_entry_mut(&i) {
                RawEntry::Occupied(_) => panic!(),
                RawEntry::Vacant(e) => {
                    e.insert(i, i);
                }
            }
        }
        assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());
        // `replace_entry_with` in map mode keeps the position.
        match map.entry(n / 2) {
            Entry::Occupied(e) => e.replace_entry_with(|_, v| Some(v + 1)),
            Entry::Vacant(_) => panic!(),
        }
        assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());
        assert_eq!(map.get(&(n / 2)), Some(&(n / 2 + 1)));
    }

    #[test]
    fn test_auto_index_map_serialization_preserves_order() {
        for n in [5, MAX_USEFUL_LINEAR_SCAN * 2] {
            let map: AutoIndexMap<usize, usize> = (0..n).rev().map(|i| (i, i)).collect();
            let expected = (0..n).rev().collect::<Vec<_>>();

            let config = bincode::config::standard();
            let bytes = bincode::encode_to_vec(&map, config).unwrap();
            let (decoded, _): (AutoIndexMap<usize, usize>, _) =
                bincode::decode_from_slice(&bytes, config).unwrap();
            assert_eq!(keys(&decoded), expected);
            assert_eq!(decoded, map);

            let json = serde_json::to_string(&map).unwrap();
            let decoded: AutoIndexMap<usize, usize> = serde_json::from_str(&json).unwrap();
            assert_eq!(keys(&decoded), expected);
            assert_eq!(decoded, map);
        }
    }

    #[test]
    fn test_auto_index_map_entry_removal_and_replacement_order() {
        for n in [MIN_HASH_SIZE, MAX_USEFUL_LINEAR_SCAN * 2] {
            let mut map: AutoIndexMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let mut expected = (0..n).collect::<Vec<_>>();

            match map.entry(2) {
                Entry::Occupied(e) => e.replace_entry_with(|_, _| None),
                Entry::Vacant(_) => panic!(),
            }
            expected.remove(2);
            assert_eq!(keys(&map), expected);

            match map.entry(4) {
                Entry::Occupied(e) => {
                    assert_eq!(e.remove(), 4);
                }
                Entry::Vacant(_) => panic!(),
            }
            expected.retain(|k| *k != 4);
            assert_eq!(keys(&map), expected);

            match map.raw_entry_mut(&6) {
                RawEntry::Occupied(e) => {
                    assert_eq!(e.remove(), 6);
                }
                RawEntry::Vacant(_) => panic!(),
            }
            expected.retain(|k| *k != 6);
            assert_eq!(keys(&map), expected);

            let mut extracted = map.extract_if(|k, _| *k % 3 == 0);
            assert_eq!(extracted.next().map(|(k, _)| k), Some(0));
            drop(extracted);
            expected.remove(0);
            assert_eq!(keys(&map), expected);
        }
    }

    fn exercise_list_storage<L: BackingListStorage<(usize, usize)>>() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map = RawAutoMap::<
            usize,
            usize,
            IndexMap<usize, usize, BuildHasherDefault<FxHasher>>,
            L,
        >::default();
        for i in 0..n {
            assert_eq!(map.insert(i, i), None);
        }
        assert_eq!(keys(&map), (0..n).collect::<Vec<_>>());
        for i in 0..n {
            assert_eq!(map.get(&i), Some(&i));
        }
        map.retain(|k, _| *k < 10);
        map.shrink_to_fit();
        assert!(matches!(map, RawAutoMap::List(..)));
        assert_eq!(map.remove(&3), Some(3));
        assert_eq!(keys(&map), [0, 1, 2, 4, 5, 6, 7, 8, 9]);

        let mut map = RawAutoMap::<
            usize,
            usize,
            HashMap<usize, usize, BuildHasherDefault<FxHasher>>,
            L,
        >::default();
        for i in 0..n {
            assert_eq!(map.insert(i, i), None);
        }
        for i in 0..n {
            assert_eq!(map.remove(&i), Some(i));
        }
        assert!(map.is_empty());
    }

    #[test]
    fn test_other_list_storages() {
        exercise_list_storage::<TinyVec<(usize, usize), 2, MAX_USEFUL_LINEAR_SCAN>>();
        exercise_list_storage::<Vec<(usize, usize)>>();
        exercise_list_storage::<arrayvec::ArrayVec<(usize, usize), MAX_USEFUL_LINEAR_SCAN>>();
    }

    /// Futures holding the iterators across an `.await` must be `Send`, also for keys containing
    /// lifetimes. This is a compile-time check.
    #[test]
    fn test_iterators_held_across_await_are_send() {
        type Key = &'static str;
        async fn yield_now() {}
        fn assert_send<T: Send>(_: T) {}

        async fn hash_map(mut map: AutoMap<Key, Key>) {
            for _x in map.iter() {
                yield_now().await;
            }
            for _x in map.iter_mut() {
                yield_now().await;
            }
            for _x in map.values() {
                yield_now().await;
            }
            for _x in map.values_mut() {
                yield_now().await;
            }
            for _x in map.extract_if(|_, _| true) {
                yield_now().await;
            }
            for _x in AutoMap::<Key, Key>::new().into_values() {
                yield_now().await;
            }
            for _x in map {
                yield_now().await;
            }
        }
        // Iterators returned from closures are inferred under a higher-ranked lifetime.
        async fn nested(
            mut maps: Vec<AutoMap<Key, Key>>,
            mut index_maps: Vec<AutoIndexMap<Key, Key>>,
            sets: Vec<crate::AutoSet<Key>>,
            index_sets: Vec<crate::AutoIndexSet<Key>>,
        ) {
            for _x in maps.iter().flat_map(|m| m.iter()) {
                yield_now().await;
            }
            for _x in maps.iter().flat_map(|m| m.values()) {
                yield_now().await;
            }
            for _x in maps.iter_mut().flat_map(|m| m.iter_mut()) {
                yield_now().await;
            }
            for _x in maps.iter_mut().flat_map(|m| m.values_mut()) {
                yield_now().await;
            }
            for _x in index_maps.iter().flat_map(|m| m.iter()) {
                yield_now().await;
            }
            for _x in index_maps.iter().flat_map(|m| m.values()) {
                yield_now().await;
            }
            for _x in index_maps.iter_mut().flat_map(|m| m.iter_mut()) {
                yield_now().await;
            }
            for _x in index_maps.iter_mut().flat_map(|m| m.values_mut()) {
                yield_now().await;
            }
            for _x in sets.iter().flat_map(|s| s.iter()) {
                yield_now().await;
            }
            for _x in index_sets.iter().flat_map(|s| s.iter()) {
                yield_now().await;
            }
        }
        async fn index_map(mut map: AutoIndexMap<Key, Key>) {
            for _x in map.iter() {
                yield_now().await;
            }
            for _x in map.iter_mut() {
                yield_now().await;
            }
            for _x in map.values() {
                yield_now().await;
            }
            for _x in map.values_mut() {
                yield_now().await;
            }
            for _x in map {
                yield_now().await;
            }
        }
        async fn sets(set: crate::AutoSet<Key>, index_set: crate::AutoIndexSet<Key>) {
            for _x in set.iter() {
                yield_now().await;
            }
            for _x in index_set.iter() {
                yield_now().await;
            }
            for _x in set {
                yield_now().await;
            }
            for _x in index_set {
                yield_now().await;
            }
        }
        assert_send(hash_map(AutoMap::new()));
        assert_send(index_map(AutoIndexMap::new()));
        assert_send(nested(Vec::new(), Vec::new(), Vec::new(), Vec::new()));
        assert_send(sets(crate::AutoSet::new(), crate::AutoIndexSet::new()));
    }

    #[test]
    fn test_iterators_clone_without_clone_entries() {
        // Cloning a borrowed iterator must not require cloneable keys or values.
        #[derive(PartialEq, Eq, Hash)]
        struct NoClone(u32);
        fn check<
            M: BackingMapStorage<NoClone, NoClone>,
            L: BackingListStorage<(NoClone, NoClone)>,
        >(
            mut map: RawAutoMap<NoClone, NoClone, M, L>,
        ) where
            M::Hasher: BuildHasher + Default,
        {
            // List variant, then map variant.
            for n in [2, MAX_USEFUL_LINEAR_SCAN as u32 + 2] {
                for i in 0..n {
                    map.insert(NoClone(i), NoClone(i));
                }
                let iter = map.iter();
                assert_eq!(iter.clone().count(), map.len());
                assert_eq!(iter.count(), map.len());
            }
        }
        check(AutoMap::<NoClone, NoClone>::new());
        check(AutoIndexMap::<NoClone, NoClone>::new());

        let mut set = crate::AutoIndexSet::<NoClone>::new();
        let mut hash_set = crate::AutoSet::<NoClone>::new();
        for i in 0..MAX_USEFUL_LINEAR_SCAN as u32 + 2 {
            set.insert(NoClone(i));
            hash_set.insert(NoClone(i));
            assert_eq!(set.iter().clone().count(), set.len());
            assert_eq!(hash_set.iter().clone().count(), hash_set.len());
        }
    }

    /// Collects an iterator through `next()` only.
    fn by_next<I: Iterator>(mut iter: I) -> Vec<I::Item> {
        std::iter::from_fn(move || iter.next()).collect()
    }

    /// Collects an iterator through `fold` only.
    fn by_fold<I: Iterator>(iter: I) -> Vec<I::Item> {
        iter.fold(Vec::new(), |mut items, item| {
            items.push(item);
            items
        })
    }

    /// Collects the rest of an iterator after one `next()`, through `fold`.
    fn rest_by_fold<I: Iterator>(mut iter: I) -> Vec<I::Item> {
        iter.next();
        by_fold(iter)
    }

    /// Collects the rest of an iterator after one `next()`, through `next()`.
    fn rest_by_next<I: Iterator>(mut iter: I) -> Vec<I::Item> {
        iter.next();
        by_next(iter)
    }

    #[test]
    fn test_extend_converts_to_map() {
        // An iterator whose size hint claims more items than it yields.
        struct LyingHint(std::ops::Range<usize>);
        impl Iterator for LyingHint {
            type Item = (usize, usize);
            fn next(&mut self) -> Option<Self::Item> {
                self.0.next().map(|i| (i, i))
            }
            fn size_hint(&self) -> (usize, Option<usize>) {
                (MAX_USEFUL_LINEAR_SCAN * 2, None)
            }
        }
        fn check<M: BackingMapStorage<usize, usize>, L: BackingListStorage<(usize, usize)>>(
            mut map: RawAutoMap<usize, usize, M, L>,
        ) where
            M::Hasher: BuildHasher + Default,
        {
            // Small extension: stays a list.
            map.extend((0..3).map(|i| (i, i)));
            assert!(matches!(map, RawAutoMap::List(..)));
            // The size hint exceeds the list: converts to a map.
            map.extend((3..MAX_USEFUL_LINEAR_SCAN + 10).map(|i| (i, i)));
            assert!(matches!(map, RawAutoMap::Map(..)));
            assert_eq!(map.len(), MAX_USEFUL_LINEAR_SCAN + 10);
            for i in 0..MAX_USEFUL_LINEAR_SCAN + 10 {
                assert_eq!(map.get(&i), Some(&i));
            }
        }
        check(AutoMap::<usize, usize>::new());
        check(AutoIndexMap::<usize, usize>::new());

        // The ordered map keeps the order across the conversion.
        let mut map = AutoIndexMap::<usize, usize>::new();
        map.extend([(5, 5), (1, 1)]);
        map.extend((10..50).rev().map(|i| (i, i)));
        assert!(matches!(map, RawAutoMap::Map(..)));
        let mut expected = vec![5, 1];
        expected.extend((10..50).rev());
        assert_eq!(keys(&map), expected);

        // A size hint that isn't kept converts back to a list when the result is small.
        let mut map = AutoIndexMap::<usize, usize>::new();
        map.extend([(9, 9)]);
        map.extend(LyingHint(0..3));
        assert!(matches!(map, RawAutoMap::List(..)));
        assert_eq!(keys(&map), vec![9, 0, 1, 2]);
        let mut map = AutoMap::<usize, usize>::new();
        map.extend(LyingHint(0..3));
        assert!(matches!(map, RawAutoMap::List(..)));
        assert_eq!(map.len(), 3);
    }

    #[test]
    fn test_fold_matches_next() {
        // The iterators forward `fold` to the inner iterator; it must visit the same entries in
        // the same order as `next()`.
        fn check<M: BackingMapStorage<usize, usize>, L: BackingListStorage<(usize, usize)>>(
            make: impl Fn(usize) -> RawAutoMap<usize, usize, M, L>,
        ) where
            M::Hasher: BuildHasher + Default,
        {
            // Empty, list variant, then map variant.
            for n in [0, 5, MAX_USEFUL_LINEAR_SCAN * 2] {
                let map = make(n);
                assert_eq!(
                    matches!(map, RawAutoMap::List(..)),
                    n <= MAX_USEFUL_LINEAR_SCAN
                );
                assert_eq!(by_fold(map.iter()), by_next(map.iter()));
                assert_eq!(by_fold(map.iter()).len(), n);
                assert_eq!(by_fold(map.values()), by_next(map.values()));
                assert_eq!(by_fold(make(n).into_iter()), by_next(make(n).into_iter()));
                assert_eq!(
                    by_fold(make(n).into_values()),
                    by_next(make(n).into_values())
                );

                // Partially consumed iterators fold the rest.
                assert_eq!(rest_by_fold(map.iter()), rest_by_next(map.iter()));
                assert_eq!(rest_by_fold(map.iter()).len(), n.saturating_sub(1));
                assert_eq!(rest_by_fold(map.values()), rest_by_next(map.values()));
                assert_eq!(
                    rest_by_fold(make(n).into_iter()),
                    rest_by_next(make(n).into_iter())
                );
                assert_eq!(
                    rest_by_fold(make(n).into_values()),
                    rest_by_next(make(n).into_values())
                );
                let mut a = make(n);
                let mut b = make(n);
                assert_eq!(rest_by_fold(a.iter_mut()), rest_by_next(b.iter_mut()));
                assert_eq!(rest_by_fold(a.values_mut()), rest_by_next(b.values_mut()));

                // Mutable iterators: mutate through `fold` and through `next()`, both must see
                // the same entries in the same order and leave the same map.
                let mut a = make(n);
                let seen_a = a.iter_mut().fold(Vec::new(), |mut seen, (k, v)| {
                    *v += 1000;
                    seen.push(*k);
                    seen
                });
                let mut b = make(n);
                let seen_b: Vec<usize> = by_next(b.iter_mut())
                    .into_iter()
                    .map(|(k, v)| {
                        *v += 1000;
                        *k
                    })
                    .collect();
                assert_eq!(seen_a, seen_b);
                assert_eq!(by_next(a.iter()), by_next(b.iter()));
                assert!(a.values().all(|v| *v >= 1000));

                let mut a = make(n);
                let seen_a = a.values_mut().fold(Vec::new(), |mut seen, v| {
                    seen.push(*v);
                    *v += 1000;
                    seen
                });
                let mut b = make(n);
                let seen_b: Vec<usize> = by_next(b.values_mut())
                    .into_iter()
                    .map(|v| {
                        let old = *v;
                        *v += 1000;
                        old
                    })
                    .collect();
                assert_eq!(seen_a, seen_b);
                assert_eq!(by_next(a.iter()), by_next(b.iter()));
                assert!(a.values().all(|v| *v >= 1000));
            }
        }
        // Reverse insertion order, so that the order differs from the key order.
        check(|n| (0..n).rev().map(|i| (i, i * 10)).collect::<AutoMap<_, _>>());
        check(|n| {
            (0..n)
                .rev()
                .map(|i| (i, i * 10))
                .collect::<AutoIndexMap<_, _>>()
        });
        // The ordered map's `fold` keeps the insertion order.
        let map: AutoIndexMap<usize, usize> = (0..40).rev().map(|i| (i, i)).collect();
        assert_eq!(
            map.iter().fold(Vec::new(), |mut keys, (k, _)| {
                keys.push(*k);
                keys
            }),
            (0..40).rev().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_into_values_fold_drops_keys_like_next() {
        // `into_values` drops each key before the value is handed to the consumer, as with
        // `next()`, also when folding.
        use std::{cell::RefCell, rc::Rc};
        struct Key(u32, Rc<RefCell<Vec<String>>>);
        impl PartialEq for Key {
            fn eq(&self, other: &Self) -> bool {
                self.0 == other.0
            }
        }
        impl Eq for Key {}
        impl Hash for Key {
            fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
                self.0.hash(state)
            }
        }
        impl Drop for Key {
            fn drop(&mut self) {
                self.1.borrow_mut().push(format!("drop key {}", self.0));
            }
        }
        fn make(log: &Rc<RefCell<Vec<String>>>) -> AutoIndexMap<Key, u32> {
            (0..3).map(|i| (Key(i, log.clone()), i)).collect()
        }
        let log = Rc::new(RefCell::new(Vec::new()));
        let map = make(&log);
        assert!(matches!(map, RawAutoMap::List(..)));
        map.into_values().fold((), |(), v| {
            log.borrow_mut().push(format!("visit value {v}"));
        });
        assert_eq!(
            *RefCell::borrow(&log),
            [
                "drop key 0",
                "visit value 0",
                "drop key 1",
                "visit value 1",
                "drop key 2",
                "visit value 2"
            ]
        );
    }

    #[test]
    fn test_alias_paths() {
        // The aliases are defined in the crate root, the module paths keep working.
        let _: crate::map::AutoMap<u32, u32> = crate::AutoMap::new();
        let _: crate::map::AutoIndexMap<u32, u32> = crate::AutoIndexMap::new();
        let _: crate::set::AutoSet<u32> = crate::AutoSet::new();
        let _: crate::set::AutoIndexSet<u32> = crate::AutoIndexSet::new();
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_sizes() {
        use std::num::NonZeroU32;
        type F = BuildHasherDefault<FxHasher>;
        // Generalizing the storage must not change the size of the existing aliases.
        assert_eq!(size_of::<AutoMap<u32, u32>>(), 16);
        assert_eq!(size_of::<AutoMap<u64, u64, F, 4>>(), 72);
        assert_eq!(size_of::<AutoIndexMap<u32, u32>>(), 16);
        assert_eq!(size_of::<Option<AutoMap<NonZeroU32, ()>>>(), 24);
    }
}
