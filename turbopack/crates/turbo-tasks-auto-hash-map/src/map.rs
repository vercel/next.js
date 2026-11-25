use std::{
    fmt::{Debug, Formatter},
    hash::{BuildHasher, BuildHasherDefault, Hash},
    iter::FusedIterator,
    marker::PhantomData,
};

use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
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
    storage::{
        BackingListStorage, BackingMapIter, BackingMapStorage, Equivalent,
        IndexedBackingMapStorage, ListPredicate, MapEntry,
    },
};

/// A map that stores small numbers of entries in a linear list `L` and switches to a real map `M`
/// when it grows beyond `MAX_USEFUL_LINEAR_SCAN` entries.
///
/// The map storage `M` decides whether the map is ordered (see [`BackingMapStorage::UNORDERED`]).
/// Use the [`AutoMap`] (hash map based, unordered) or [`OrderedAutoMap`] (index map based,
/// insertion ordered) aliases instead of naming this type directly.
#[derive(Clone)]
pub enum RawAutoMap<K, V, M, L> {
    List(L, PhantomData<(K, V)>),
    Map(Box<M>),
}

// The aliases are defined in the crate root. Re-exported here to keep the `map::` paths working.
pub use crate::{AutoMap, OrderedAutoMap};

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

/// The constructors with the default [`FxHasher`] based hasher and the default list storage, for
/// any map storage.
///
/// The list storage is fixed here, so that e.g. `AutoMap::new()` infers the alias' default inline
/// capacity. Use [`Default`], [`Self::with_hasher`] or [`Self::with_capacity_and_hasher`] for
/// other list storages.
impl<K, V, M> RawAutoMap<K, V, M, TinyVec<(K, V), 0, MAX_USEFUL_LINEAR_SCAN>>
where
    M: BackingMapStorage<K, V, Hasher = BuildHasherDefault<FxHasher>>,
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
            RawAutoMap::Map(Box::new(M::with_capacity_and_hasher(
                capacity,
                Default::default(),
            )))
        }
    }
}

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
    /// Converts the list variant into the map variant (no-op for the map variant).
    ///
    /// The map is allocated for `additional_reserve` more entries than the list holds, but at
    /// least for `MAX_USEFUL_LINEAR_SCAN * 2` entries, so that it doesn't need to grow right away.
    fn convert_to_map(&mut self, additional_reserve: usize) -> &mut M {
        if let RawAutoMap::List(list, _) = self {
            let capacity = (MAX_USEFUL_LINEAR_SCAN * 2).max(list.len() + additional_reserve);
            let mut map = M::with_capacity_and_hasher(capacity, Default::default());
            map.extend(list.drain());
            *self = RawAutoMap::Map(Box::new(map));
        }
        if let RawAutoMap::Map(map) = self {
            map
        } else {
            unreachable!()
        }
    }

    /// Converts the map variant into a list allocated for exactly its entries (no-op for the list
    /// variant). The map must hold at most `MAX_USEFUL_LINEAR_SCAN` entries.
    fn convert_to_exact_list(&mut self) {
        if let RawAutoMap::Map(map) = self {
            *self = Self::map_to_exact_list(map);
        }
    }

    /// Drains `map` into a list variant allocated for exactly its entries.
    fn map_to_exact_list(map: &mut M) -> Self {
        let mut list = L::with_capacity(map.len());
        for entry in map.drain() {
            list.push(entry);
        }
        RawAutoMap::List(list, PhantomData)
    }

    /// Wraps a whole backing map. Maps that fit into the list variant become a list (in iteration
    /// order), larger maps are moved in as they are.
    fn from_backing_map(mut map: M) -> Self {
        if map.len() <= MAX_USEFUL_LINEAR_SCAN {
            Self::map_to_exact_list(&mut map)
        } else {
            RawAutoMap::Map(Box::new(map))
        }
    }

    /// Creates a map from entries whose keys are unique, e.g. the entries of another map.
    ///
    /// Unlike [`FromIterator`] it doesn't compare keys while the entries fit into the list
    /// variant. Like [`FromIterator`], it builds the map variant right away when the lower bound of
    /// the size hint doesn't fit into the list. Ordered storages keep the order of the iterator.
    ///
    /// The caller must ensure that the keys are unique. Duplicate keys are a logic error: the
    /// content of the map is unspecified then (but it stays memory safe). Debug builds check for
    /// duplicates in the list variant.
    pub fn from_unique_iterator(iter: impl IntoIterator<Item = (K, V)>) -> Self {
        let mut iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        if lower > MAX_USEFUL_LINEAR_SCAN {
            let mut map = M::with_capacity_and_hasher(lower, Default::default());
            map.extend(iter);
            return RawAutoMap::Map(Box::new(map));
        }
        let mut list = L::with_capacity(lower);
        while list.len() < MAX_USEFUL_LINEAR_SCAN {
            let Some((key, value)) = iter.next() else {
                return RawAutoMap::List(list, PhantomData);
            };
            debug_assert!(
                list.iter().all(|(k, _)| *k != key),
                "from_unique_iterator: duplicate key"
            );
            list.push((key, value));
        }
        // The list is full. Any further entry (the size hint was understated) needs the map.
        let Some((key, value)) = iter.next() else {
            return RawAutoMap::List(list, PhantomData);
        };
        let mut this: Self = RawAutoMap::List(list, PhantomData);
        let map: &mut M = this.convert_to_map(iter.size_hint().0 + 1);
        map.insert(key, value);
        map.extend(iter);
        this
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
        self.convert_to_map(1).insert(key, value);
    }

    /// The rare list -> map conversion of the vacant entries' `insert`, kept out of line like
    /// [`Self::convert_to_map_and_insert`]. A vacant raw entry can be inserted with a different
    /// key than it was looked up with, so the key may already be in the map.
    #[cold]
    #[inline(never)]
    fn convert_to_map_and_insert_entry(&mut self, key: K, value: V) -> &mut V {
        match self.convert_to_map(1).entry(key) {
            MapEntry::Occupied(entry) => M::occupied_into_mut(entry),
            MapEntry::Vacant(entry) => M::vacant_insert(entry, value),
        }
    }

    /// The list -> map conversion of [`Self::extend`] for inputs that (by their size hint) don't
    /// fit into the list, kept out of line like [`Self::convert_to_map_and_insert`].
    /// `additional_reserve` is the lower bound of the iterator's size hint.
    #[cold]
    #[inline(never)]
    fn convert_to_map_and_extend(
        &mut self,
        iter: impl Iterator<Item = (K, V)>,
        additional_reserve: usize,
    ) {
        self.convert_to_map(additional_reserve).extend(iter);
    }

    /// see [HashMap::remove](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.remove)
    ///
    /// Ordered storages preserve the order of the remaining entries.
    #[inline]
    pub fn remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => {
                for i in 0..list.len() {
                    if key.equivalent(&list[i].0) {
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
    pub fn swap_remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => {
                for i in 0..list.len() {
                    if key.equivalent(&list[i].0) {
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
                    self.convert_to_map_and_extend(iter, lower);
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
        Q: Hash + Equivalent<K> + ?Sized,
    {
        // Look up the list position first, so that the vacant entry can borrow the whole map.
        let list_position = match self {
            RawAutoMap::List(list, _) => Some(list.iter().position(|(k, _)| key.equivalent(k))),
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
                if M::UNORDERED {
                    // Swap-removing is cheaper than keeping the order.
                    list.swap_retain(|(key, value)| f(key, value));
                } else {
                    list.retain(|(key, value)| f(key, value));
                }
            }
            RawAutoMap::Map(map) => {
                map.retain(f);
            }
        }
    }

    /// Removes and yields the entries for which `f` returns `true`, like
    /// [HashMap::extract_if](https://docs.rs/hashbrown/latest/hashbrown/struct.HashMap.html#method.extract_if).
    /// Entries that aren't yielded because the iterator is dropped early stay in the map. Ordered
    /// storages preserve the order of the remaining entries.
    #[allow(clippy::type_complexity)]
    pub fn extract_if<'l, F>(
        &'l mut self,
        f: F,
    ) -> ExtractIfIter<L::ExtractIf<'l, EntryPredicate<F>>, M::ExtractIf<'l, F>>
    where
        F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
    {
        match self {
            RawAutoMap::List(list, _) => ExtractIfIter::List(list.extract_if(EntryPredicate(f))),
            RawAutoMap::Map(map) => ExtractIfIter::Map(map.extract_if(f)),
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

    /// Cheaper alternative to [`Self::shrink_to_fit`], suitable to call after every removal: it
    /// only reallocates once the collection is much smaller than its allocation. A list shrinks
    /// once less than a third of its capacity is used, a map with fewer than 16 entries converts
    /// back into an exactly sized list, and a larger map shrinks once less than a third of its
    /// capacity is used.
    pub fn shrink_amortized(&mut self) {
        match self {
            RawAutoMap::List(list, _) => list.shrink_amortized(),
            RawAutoMap::Map(map) => {
                if map.len() < MIN_HASH_SIZE {
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
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => list
                .iter()
                .find_map(|(k, v)| if key.equivalent(k) { Some(v) } else { None }),
            RawAutoMap::Map(map) => map.get(key),
        }
    }

    /// see [HashMap::get_key_value](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get_key_value)
    pub fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => list
                .iter()
                .find(|(k, _)| key.equivalent(k))
                .map(|(k, v)| (k, v)),
            RawAutoMap::Map(map) => map.get_key_value(key),
        }
    }

    /// see [HashMap::get_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get_mut)
    pub fn get_mut<Q>(&mut self, key: &Q) -> Option<&mut V>
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => list
                .iter_mut()
                .find_map(|(k, v)| if key.equivalent(k) { Some(v) } else { None }),
            RawAutoMap::Map(map) => map.get_mut(key),
        }
    }

    /// see [HashMap::contains_key](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.contains_key)
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        Q: Hash + Equivalent<K> + ?Sized,
    {
        match self {
            RawAutoMap::List(list, _) => list.iter().any(|(k, _)| key.equivalent(k)),
            RawAutoMap::Map(map) => map.contains_key(key),
        }
    }
}

/// Positional access for insertion ordered maps, like [`IndexMap`]'s. The index of an entry is its
/// position in iteration order. In the list variant these are a slice index and a linear scan.
impl<K, V, M, L> RawAutoMap<K, V, M, L>
where
    M: IndexedBackingMapStorage<K, V>,
    L: BackingListStorage<(K, V)>,
{
    /// see [IndexMap::get_index](https://docs.rs/indexmap/latest/indexmap/map/struct.IndexMap.html#method.get_index)
    pub fn get_index(&self, index: usize) -> Option<(&K, &V)> {
        match self {
            RawAutoMap::List(list, _) => list.get(index).map(|(k, v)| (k, v)),
            RawAutoMap::Map(map) => map.get_index(index),
        }
    }

    /// see [IndexMap::get_index_of](https://docs.rs/indexmap/latest/indexmap/map/struct.IndexMap.html#method.get_index_of)
    pub fn get_index_of<Q>(&self, key: &Q) -> Option<usize>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        M::Hasher: BuildHasher,
    {
        match self {
            RawAutoMap::List(list, _) => list.iter().position(|(k, _)| key.equivalent(k)),
            RawAutoMap::Map(map) => map.get_index_of(key),
        }
    }
}

/// Converts an [`IndexMap`] keeping its order. Maps that fit into the list variant become a list,
/// larger maps are moved in as they are.
impl<K, V, H, L> From<IndexMap<K, V, H>> for RawAutoMap<K, V, IndexMap<K, V, H>, L>
where
    K: Eq + Hash,
    H: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn from(map: IndexMap<K, V, H>) -> Self {
        Self::from_backing_map(map)
    }
}

/// Converts a [`hashbrown::HashMap`]. Maps that fit into the list variant become a list, larger
/// maps are moved in as they are.
impl<K, V, H, L> From<hashbrown::HashMap<K, V, H>>
    for RawAutoMap<K, V, hashbrown::HashMap<K, V, H>, L>
where
    K: Eq + Hash,
    H: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn from(map: hashbrown::HashMap<K, V, H>) -> Self {
        Self::from_backing_map(map)
    }
}

/// Converts a [`BTreeMap`](std::collections::BTreeMap). Ordered storages keep its key order.
impl<K, V, M, L> From<std::collections::BTreeMap<K, V>> for RawAutoMap<K, V, M, L>
where
    K: Eq + Hash,
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher + Default,
    L: BackingListStorage<(K, V)>,
{
    fn from(map: std::collections::BTreeMap<K, V>) -> Self {
        Self::from_unique_iterator(map)
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

    /// see [HashMap::keys](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.keys)
    pub fn keys(&self) -> Keys<Iter<M::Iter<'_>>> {
        Keys(self.iter())
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

/// Iterator returned by [`RawAutoMap::keys`]: the keys of the `(key, value)` items of `I`.
///
/// Like [`Iter`], the trait impls avoid where clauses relating lifetimes (see [`BackingMapIter`]).
#[derive(Clone)]
pub struct Keys<I>(I);

impl<A, B, I: Iterator<Item = (A, B)>> Iterator for Keys<I> {
    type Item = A;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(key, _)| key)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }

    fn fold<Acc, F: FnMut(Acc, Self::Item) -> Acc>(self, init: Acc, mut f: F) -> Acc {
        self.0.fold(init, |acc, (key, _)| f(acc, key))
    }
}

impl<A, B, I: ExactSizeIterator<Item = (A, B)>> ExactSizeIterator for Keys<I> {}

impl<A, B, I: FusedIterator<Item = (A, B)>> FusedIterator for Keys<I> {}

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

// Like the `Iterator` impl, these only bound `MI` and its `List` (see `BackingMapIter`).
impl<MI: BackingMapIter<List: ExactSizeIterator> + ExactSizeIterator> ExactSizeIterator
    for Iter<MI>
{
}

impl<MI: BackingMapIter<List: FusedIterator> + FusedIterator> FusedIterator for Iter<MI> {}

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

impl<K, V> ExactSizeIterator for ListIter<'_, K, V> {}

impl<K, V> FusedIterator for ListIter<'_, K, V> {}

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

impl<K, V> ExactSizeIterator for ListIterMut<'_, K, V> {}

impl<K, V> FusedIterator for ListIterMut<'_, K, V> {}

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

impl<K, V> ExactSizeIterator for ListValues<'_, K, V> {}

impl<K, V> FusedIterator for ListValues<'_, K, V> {}

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

impl<K, V> ExactSizeIterator for ListValuesMut<'_, K, V> {}

impl<K, V> FusedIterator for ListValuesMut<'_, K, V> {}

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

impl<LI: ExactSizeIterator, MI: ExactSizeIterator<Item = LI::Item>> ExactSizeIterator
    for IntoIter<LI, MI>
{
}

impl<LI: FusedIterator, MI: FusedIterator<Item = LI::Item>> FusedIterator for IntoIter<LI, MI> {}

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

impl<K, V, LI: ExactSizeIterator<Item = (K, V)>, MI: ExactSizeIterator<Item = V>> ExactSizeIterator
    for IntoValues<LI, MI>
{
}

impl<K, V, LI: FusedIterator<Item = (K, V)>, MI: FusedIterator<Item = V>> FusedIterator
    for IntoValues<LI, MI>
{
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
                    // Take the entry out with `swap_remove`, which moves the last item into
                    // `index`. Until the entry is put back, the guard would move that item back
                    // to the end (shifting the following items back), which restores the order
                    // of the other entries also when `func` panics.
                    let (key, value) = list.swap_remove(index);
                    let mut guard = MoveToEndOnDrop {
                        list: Some(&mut *list),
                        index,
                        _item: PhantomData,
                    };
                    if let Some(value) = func(&key, value) {
                        // Put the entry back at the end and swap it with the moved item, which
                        // returns both to their original positions.
                        let list = guard.list.take().unwrap();
                        list.push((key, value));
                        let last = list.len() - 1;
                        list.swap(index, last);
                    }
                }
            }
            OccupiedEntry::Map(entry) => {
                M::occupied_replace_entry_with(entry, func);
            }
        }
    }
}

/// Used by [`OccupiedEntry::replace_entry_with`]: when dropped, moves the item at `index` to the
/// end of the list, shifting the following items back by one.
struct MoveToEndOnDrop<'l, T, L: BackingListStorage<T>> {
    /// `None` when the move isn't needed anymore.
    list: Option<&'l mut L>,
    index: usize,
    _item: PhantomData<fn() -> T>,
}

impl<T, L: BackingListStorage<T>> Drop for MoveToEndOnDrop<'_, T, L> {
    fn drop(&mut self) {
        if let Some(list) = self.list.take()
            && self.index < list.len()
        {
            list[self.index..].rotate_left(1);
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

// `PartialEq` tracks the matched entries of a list in the bits of a `u32`.
const _: () = assert!(MAX_USEFUL_LINEAR_SCAN <= u32::BITS as usize);

impl<K: Eq + Hash, V: Eq, M, L> PartialEq for RawAutoMap<K, V, M, L>
where
    M: BackingMapStorage<K, V>,
    M::Hasher: BuildHasher,
    L: BackingListStorage<(K, V)>,
{
    /// Order insensitive for unordered storages, order sensitive for ordered ones, independent of
    /// whether the maps are in the list or the map variant.
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (RawAutoMap::Map(a), RawAutoMap::Map(b)) => M::eq(a, b),
            (RawAutoMap::List(a, _), RawAutoMap::List(b, _)) => {
                if M::UNORDERED {
                    if a.len() != b.len() {
                        return false;
                    }
                    // Keys are unique, so it's enough to find every entry of `a` in `b`. Each
                    // entry of `b` matches at most one entry of `a`, so the bits of `matched`
                    // skip the already matched entries of `b`.
                    debug_assert!(b.len() <= MAX_USEFUL_LINEAR_SCAN);
                    let mut matched = 0u32;
                    a.iter().all(|(key, value)| {
                        b.iter()
                            .enumerate()
                            .find(|(i, (k, _))| matched & (1 << i) == 0 && k == key)
                            .is_some_and(|(i, (_, v))| {
                                matched |= 1 << i;
                                v == value
                            })
                    })
                } else {
                    a[..] == b[..]
                }
            }
            (RawAutoMap::List(list, _), RawAutoMap::Map(map))
            | (RawAutoMap::Map(map), RawAutoMap::List(list, _)) => {
                if list.len() != map.len() {
                    return false;
                }
                if M::UNORDERED {
                    list.iter().all(|(key, value)| map.get(key) == Some(value))
                } else {
                    list.iter().map(|(k, v)| (k, v)).eq(map.iter())
                }
            }
        }
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
            return RawAutoMap::Map(Box::new(map));
        }
        let mut map = RawAutoMap::with_capacity_and_hasher(lower, Default::default());
        for (k, v) in iter {
            map.insert(k, v);
        }
        map
    }
}

/// Iterator returned by [`RawAutoMap::extract_if`].
///
/// `LI` is the list storage's extraction iterator ([`BackingListStorage::ExtractIf`]) and `MI`
/// the map storage's ([`BackingMapStorage::ExtractIf`]). Like the owned iterators, this type
/// takes them as type parameters instead of naming concrete storage types, so any storages can be
/// used. That also keeps the `Iterator` impl free of where clauses relating lifetimes, which
/// would make futures holding this iterator across an `.await` fail to be `Send` (see
/// [`BackingMapIter`]).
pub enum ExtractIfIter<LI, MI> {
    List(LI),
    Map(MI),
}

impl<LI, MI> Iterator for ExtractIfIter<LI, MI>
where
    LI: Iterator,
    MI: Iterator<Item = LI::Item>,
{
    type Item = LI::Item;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ExtractIfIter::List(extract_if) => extract_if.next(),
            ExtractIfIter::Map(extract_if) => extract_if.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            ExtractIfIter::List(extract_if) => extract_if.size_hint(),
            ExtractIfIter::Map(extract_if) => extract_if.size_hint(),
        }
    }

    fn fold<B, G>(self, init: B, f: G) -> B
    where
        G: FnMut(B, Self::Item) -> B,
    {
        match self {
            ExtractIfIter::List(extract_if) => extract_if.fold(init, f),
            ExtractIfIter::Map(extract_if) => extract_if.fold(init, f),
        }
    }
}

impl<LI, MI> FusedIterator for ExtractIfIter<LI, MI>
where
    LI: FusedIterator,
    MI: FusedIterator<Item = LI::Item>,
{
}

/// Adapts an entry predicate `FnMut(&K, &mut V) -> bool` of [`RawAutoMap::extract_if`] to the
/// list storage's [`ListPredicate`] over `(K, V)` items.
pub struct EntryPredicate<F>(F);

impl<K, V, F> ListPredicate<(K, V)> for EntryPredicate<F>
where
    F: FnMut(&K, &mut V) -> bool,
{
    fn test(&mut self, (key, value): &mut (K, V)) -> bool {
        (self.0)(key, value)
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
        if let RawAutoMap::Map(map) = self
            && map.len() <= MAX_USEFUL_LINEAR_SCAN
        {
            // The list is allocated with the exact size, no need to shrink it.
            self.convert_to_exact_list();
            return;
        }

        match self {
            RawAutoMap::List(list, _) => list.shrink_to_fit(),
            RawAutoMap::Map(map) => map.shrink_to_fit(),
        }
    }
}

#[cfg(test)]
mod tests {
    use hashbrown::HashMap;
    use indexmap::IndexMap;

    use super::*;
    use crate::{AutoMap, OrderedAutoMap};

    fn exact<I: ExactSizeIterator + FusedIterator>(iter: I) -> I {
        iter
    }

    /// Checks `len()` while iterating, for all iterators of a map with `n` entries.
    macro_rules! check_exact_size {
        ($map:ty) => {
            for n in [0, 5, 50] {
                let mut map = <$map>::default();
                for i in 0..n {
                    map.insert(i, i);
                }
                assert_eq!(
                    matches!(map, RawAutoMap::List(..)),
                    n <= MAX_USEFUL_LINEAR_SCAN as u32
                );
                fn check<I: ExactSizeIterator + FusedIterator>(mut iter: I, n: u32) {
                    for remaining in (0..n as usize).rev() {
                        assert!(iter.next().is_some());
                        assert_eq!(iter.len(), remaining);
                    }
                    assert!(iter.next().is_none());
                    assert!(iter.next().is_none());
                    assert_eq!(iter.len(), 0);
                }
                check(exact(map.iter()), n);
                check(exact(map.iter_mut()), n);
                check(exact(map.values()), n);
                check(exact(map.values_mut()), n);
                check(exact(map.keys()), n);
                check(exact((&map).into_iter()), n);
                check(exact(map.clone().into_iter()), n);
                check(exact(map.clone().into_values()), n);
                fn fused<I: FusedIterator>(iter: I) -> I {
                    iter
                }
                assert_eq!(
                    fused(map.extract_if(|k, _| k % 2 == 0)).count(),
                    n.div_ceil(2) as usize
                );
            }
        };
    }

    #[test]
    fn iterators_exact_size_and_fused() {
        check_exact_size!(AutoMap<u32, u32>);
        check_exact_size!(OrderedAutoMap<u32, u32>);
    }

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
    fn test_ordered_auto_map_eq_is_order_sensitive() {
        for n in [3, MAX_USEFUL_LINEAR_SCAN * 2] {
            let a: OrderedAutoMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let a2: OrderedAutoMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let b: OrderedAutoMap<usize, usize> = (0..n).rev().map(|i| (i, i)).collect();
            assert_eq!(a, a2);
            assert_eq!(hash_of(&a), hash_of(&a2));
            assert_ne!(a, b);
        }

        // List variant vs. map variant with the same content.
        let n = MIN_HASH_SIZE + 4;
        let mut list = OrderedAutoMap::new();
        for i in 0..n {
            list.insert(i, i);
        }
        let mut map = OrderedAutoMap::new();
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
    fn test_ordered_auto_map_order() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map = OrderedAutoMap::new();
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
    fn test_ordered_auto_map_swap_remove() {
        // List mode: the last entry moves into the removed slot.
        let mut map: OrderedAutoMap<usize, usize> = (0..5).map(|i| (i, i * 10)).collect();
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
        let mut map: OrderedAutoMap<usize, usize> = (0..n).map(|i| (i, i * 10)).collect();
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
    fn test_ordered_auto_map_entry_order_across_conversion() {
        let n = MAX_USEFUL_LINEAR_SCAN * 2;
        let mut map = OrderedAutoMap::new();
        for i in (0..n).rev() {
            *map.entry(i).or_default() += i;
        }
        assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());
        let mut map = OrderedAutoMap::new();
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
    fn test_ordered_auto_map_serialization_preserves_order() {
        for n in [5, MAX_USEFUL_LINEAR_SCAN * 2] {
            let map: OrderedAutoMap<usize, usize> = (0..n).rev().map(|i| (i, i)).collect();
            let expected = (0..n).rev().collect::<Vec<_>>();

            let config = bincode::config::standard();
            let bytes = bincode::encode_to_vec(&map, config).unwrap();
            let (decoded, _): (OrderedAutoMap<usize, usize>, _) =
                bincode::decode_from_slice(&bytes, config).unwrap();
            assert_eq!(keys(&decoded), expected);
            assert_eq!(decoded, map);

            let json = serde_json::to_string(&map).unwrap();
            let decoded: OrderedAutoMap<usize, usize> = serde_json::from_str(&json).unwrap();
            assert_eq!(keys(&decoded), expected);
            assert_eq!(decoded, map);
        }
    }

    #[test]
    fn test_ordered_auto_map_entry_removal_and_replacement_order() {
        for n in [MIN_HASH_SIZE, MAX_USEFUL_LINEAR_SCAN * 2] {
            let mut map: OrderedAutoMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
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

    fn shrink_amortized_list_capacity<L: BackingListStorage<(usize, usize)>>() -> [usize; 2] {
        let mut map = RawAutoMap::<
            usize,
            usize,
            HashMap<usize, usize, BuildHasherDefault<FxHasher>>,
            L,
        >::default();
        for i in 0..MAX_USEFUL_LINEAR_SCAN {
            map.insert(i, i);
        }
        let list_capacity = |map: &RawAutoMap<_, _, _, L>| match map {
            RawAutoMap::List(list, _) => list.capacity(),
            RawAutoMap::Map(_) => panic!("expected the list variant"),
        };
        assert_eq!(list_capacity(&map), MAX_USEFUL_LINEAR_SCAN);
        // 11 items in a capacity of 32: more than a third is used, so it keeps its capacity.
        for i in 11..MAX_USEFUL_LINEAR_SCAN {
            map.remove(&i);
        }
        map.shrink_amortized();
        let kept = list_capacity(&map);
        // 10 items: at most a third is used, so it shrinks.
        map.remove(&10);
        map.shrink_amortized();
        let shrunk = list_capacity(&map);
        assert_eq!(keys(&map), (0..10).collect::<Vec<_>>());
        [kept, shrunk]
    }

    #[test]
    fn test_shrink_amortized_list_threshold() {
        assert_eq!(
            shrink_amortized_list_capacity::<TinyVec<(usize, usize), 0, MAX_USEFUL_LINEAR_SCAN>>(),
            [MAX_USEFUL_LINEAR_SCAN, 10]
        );
        // `Vec` uses the provided default.
        let [kept, shrunk] = shrink_amortized_list_capacity::<Vec<(usize, usize)>>();
        assert_eq!(kept, MAX_USEFUL_LINEAR_SCAN);
        assert!((10..MAX_USEFUL_LINEAR_SCAN).contains(&shrunk), "{shrunk}");
    }

    /// Calls `BackingListStorage::shrink_amortized` directly at exactly a third of the capacity
    /// (kept) and just below it (shrunk). Returns the capacities before, kept and shrunk.
    fn list_shrink_amortized_capacities<L: BackingListStorage<u32>>() -> [usize; 3] {
        let mut list = L::with_capacity(12);
        let before = list.capacity();
        for i in 0..4 {
            list.push(i);
        }
        list.shrink_amortized();
        let kept = list.capacity();
        list.swap_remove(0);
        list.shrink_amortized();
        assert_eq!(list.len(), 3);
        [before, kept, list.capacity()]
    }

    #[test]
    fn test_list_storage_shrink_amortized() {
        assert_eq!(
            list_shrink_amortized_capacities::<TinyVec<u32, 0, MAX_USEFUL_LINEAR_SCAN>>(),
            [12, 12, 3]
        );
        let [before, kept, shrunk] = list_shrink_amortized_capacities::<Vec<u32>>();
        assert_eq!(kept, before);
        assert!((3..before).contains(&shrunk), "{before} -> {shrunk}");
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
            mut index_maps: Vec<OrderedAutoMap<Key, Key>>,
            sets: Vec<crate::AutoSet<Key>>,
            index_sets: Vec<crate::OrderedAutoSet<Key>>,
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
            // `extract_if` isn't covered here: inside a closure it hits rust-lang/rust#100013
            // through the `F: FnMut(&K, &mut V) -> bool` bound of the backing maps' own
            // `ExtractIf` iterators (plain `hashbrown`/`indexmap` fail the same way).
            for _x in sets.iter().flat_map(|s| s.iter()) {
                yield_now().await;
            }
            for _x in index_sets.iter().flat_map(|s| s.iter()) {
                yield_now().await;
            }
        }
        async fn index_map(mut map: OrderedAutoMap<Key, Key>) {
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
            for _x in map {
                yield_now().await;
            }
        }
        async fn sets(set: crate::AutoSet<Key>, index_set: crate::OrderedAutoSet<Key>) {
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
        assert_send(index_map(OrderedAutoMap::new()));
        assert_send(nested(Vec::new(), Vec::new(), Vec::new(), Vec::new()));
        assert_send(sets(crate::AutoSet::new(), crate::OrderedAutoSet::new()));
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
        check(OrderedAutoMap::<NoClone, NoClone>::new());

        let mut set = crate::OrderedAutoSet::<NoClone>::new();
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
        check(OrderedAutoMap::<usize, usize>::new());

        // The ordered map keeps the order across the conversion.
        let mut map = OrderedAutoMap::<usize, usize>::new();
        map.extend([(5, 5), (1, 1)]);
        map.extend((10..50).rev().map(|i| (i, i)));
        assert!(matches!(map, RawAutoMap::Map(..)));
        let mut expected = vec![5, 1];
        expected.extend((10..50).rev());
        assert_eq!(keys(&map), expected);

        // A size hint that isn't kept still leaves a map (see `test_overstated_hint_keeps_map`).
        let mut map = OrderedAutoMap::<usize, usize>::new();
        map.extend([(9, 9)]);
        map.extend(Overstated {
            next: 0,
            len: 3,
            lower: MAX_USEFUL_LINEAR_SCAN * 2,
        });
        assert!(matches!(map, RawAutoMap::Map(..)));
        assert_eq!(keys(&map), vec![9, 0, 1, 2]);
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
                .collect::<OrderedAutoMap<_, _>>()
        });
        // The ordered map's `fold` keeps the insertion order.
        let map: OrderedAutoMap<usize, usize> = (0..40).rev().map(|i| (i, i)).collect();
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
        fn make(log: &Rc<RefCell<Vec<String>>>) -> OrderedAutoMap<Key, u32> {
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
        let _: crate::map::OrderedAutoMap<u32, u32> = crate::OrderedAutoMap::new();
        let _: crate::set::AutoSet<u32> = crate::AutoSet::new();
        let _: crate::set::OrderedAutoSet<u32> = crate::OrderedAutoSet::new();
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn test_sizes() {
        use std::num::NonZeroU32;
        type F = BuildHasherDefault<FxHasher>;
        // Generalizing the storage must not change the size of the existing aliases.
        assert_eq!(size_of::<AutoMap<u32, u32>>(), 16);
        assert_eq!(size_of::<AutoMap<u64, u64, F, 4>>(), 72);
        assert_eq!(size_of::<OrderedAutoMap<u32, u32>>(), 16);
        assert_eq!(size_of::<Option<AutoMap<NonZeroU32, ()>>>(), 24);
    }

    fn entries<M: BackingMapStorage<u32, u32>, L: BackingListStorage<(u32, u32)>>(
        map: &RawAutoMap<u32, u32, M, L>,
    ) -> Vec<(u32, u32)> {
        map.iter().map(|(k, v)| (*k, *v)).collect()
    }

    #[test]
    fn test_replace_entry_with_ordered_list() {
        let make = || -> OrderedAutoMap<u32, u32> { (0..5).map(|i| (i, i)).collect() };
        for index in [0, 2, 4] {
            // `Some` keeps the entry at its position.
            let mut map = make();
            assert!(matches!(map, RawAutoMap::List(..)));
            match map.entry(index) {
                Entry::Occupied(e) => e.replace_entry_with(|_, v| Some(v + 100)),
                Entry::Vacant(_) => unreachable!(),
            }
            let expected: Vec<_> = (0..5)
                .map(|i| (i, if i == index { i + 100 } else { i }))
                .collect();
            assert_eq!(entries(&map), expected);

            // `None` removes the entry and keeps the order of the others.
            let mut map = make();
            match map.entry(index) {
                Entry::Occupied(e) => e.replace_entry_with(|_, _| None),
                Entry::Vacant(_) => unreachable!(),
            }
            let expected: Vec<_> = (0..5).filter(|i| *i != index).map(|i| (i, i)).collect();
            assert_eq!(entries(&map), expected);

            // A panic removes the entry and keeps the order of the others.
            let mut map = make();
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match map.entry(index) {
                    Entry::Occupied(e) => e.replace_entry_with(|_, _| panic!("func panic")),
                    Entry::Vacant(_) => unreachable!(),
                }));
            assert!(result.is_err());
            assert_eq!(entries(&map), expected);
        }
    }

    #[test]
    fn test_replace_entry_with_panic_drops() {
        use std::{cell::RefCell, rc::Rc};
        struct Tracked(u32, Rc<RefCell<Vec<u32>>>);
        impl Drop for Tracked {
            fn drop(&mut self) {
                self.1.borrow_mut().push(self.0);
            }
        }
        let drops = Rc::new(RefCell::new(Vec::new()));
        // 5 entries stay a list; 50 entries are a map.
        for (n, index) in [(5u32, 1u32), (50, 20)] {
            RefCell::borrow_mut(&drops).clear();
            let mut map: OrderedAutoMap<u32, Tracked> =
                (0..n).map(|i| (i, Tracked(i, drops.clone()))).collect();
            assert_eq!(matches!(map, RawAutoMap::Map(..)), n == 50);
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match map.entry(index) {
                    Entry::Occupied(e) => e.replace_entry_with(|_, _| panic!("func panic")),
                    Entry::Vacant(_) => unreachable!(),
                }));
            assert!(result.is_err());
            // The value was moved into `func` and dropped while unwinding.
            assert_eq!(*RefCell::borrow(&drops), vec![index]);
            assert_eq!(
                map.iter().map(|(k, _)| *k).collect::<Vec<_>>(),
                (0..n).filter(|i| *i != index).collect::<Vec<_>>()
            );
            drop(map);
            let mut all = RefCell::borrow(&drops).clone();
            all.sort();
            assert_eq!(all, (0..n).collect::<Vec<_>>());
        }
    }

    #[test]
    fn test_retain_list() {
        let mut map: OrderedAutoMap<u32, u32> = (0..20).map(|i| (i, i)).collect();
        assert!(matches!(map, RawAutoMap::List(..)));
        map.retain(|k, v| {
            *v += 1;
            k % 3 != 0
        });
        let expected: Vec<_> = (0..20).filter(|k| k % 3 != 0).map(|k| (k, k + 1)).collect();
        assert_eq!(entries(&map), expected);

        let mut map: AutoMap<u32, u32> = (0..20).map(|i| (i, i)).collect();
        map.retain(|k, _| k % 3 != 0);
        let mut actual = entries(&map);
        actual.sort();
        assert_eq!(
            actual,
            expected.iter().map(|(k, _)| (*k, *k)).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_extract_if_list_order() {
        let mut map: OrderedAutoMap<u32, u32> = (0..20).map(|i| (i, i)).collect();
        let extracted: Vec<_> = map.extract_if(|k, _| k % 3 == 0).collect();
        assert_eq!(
            extracted,
            (0..20)
                .filter(|k| k % 3 == 0)
                .map(|k| (k, k))
                .collect::<Vec<_>>()
        );
        assert_eq!(
            entries(&map),
            (0..20)
                .filter(|k| k % 3 != 0)
                .map(|k| (k, k))
                .collect::<Vec<_>>()
        );
        // Early drop keeps the unvisited entries in order.
        let mut iter = map.extract_if(|_, _| true);
        assert_eq!(iter.next(), Some((1, 1)));
        drop(iter);
        assert_eq!(
            entries(&map),
            (2..20)
                .filter(|k| k % 3 != 0)
                .map(|k| (k, k))
                .collect::<Vec<_>>()
        );

        let mut map: AutoMap<u32, u32> = (0..20).map(|i| (i, i)).collect();
        let mut extracted: Vec<_> = map.extract_if(|k, _| k % 3 == 0).collect();
        extracted.sort();
        assert_eq!(
            extracted,
            (0..20)
                .filter(|k| k % 3 == 0)
                .map(|k| (k, k))
                .collect::<Vec<_>>()
        );
        assert_eq!(map.len(), 13);
    }

    /// Returns the entries `keys` as a list and as a map variant.
    fn variants<M, L>(keys: &[u32]) -> [RawAutoMap<u32, u32, M, L>; 2]
    where
        M: BackingMapStorage<u32, u32>,
        M::Hasher: BuildHasher + Default,
        L: BackingListStorage<(u32, u32)>,
    {
        let mut list = RawAutoMap::with_hasher();
        for k in keys {
            list.insert(*k, *k);
        }
        assert!(matches!(list, RawAutoMap::List(..)));
        let mut map =
            RawAutoMap::with_capacity_and_hasher(MAX_USEFUL_LINEAR_SCAN * 2, Default::default());
        for k in keys {
            map.insert(*k, *k);
        }
        assert!(matches!(map, RawAutoMap::Map(..)));
        [list, map]
    }

    fn check_eq<M, L>(ordered: bool)
    where
        M: BackingMapStorage<u32, u32>,
        M::Hasher: BuildHasher + Default,
        L: BackingListStorage<(u32, u32)>,
    {
        let forward: Vec<u32> = (0..10).collect();
        let backward: Vec<u32> = (0..10).rev().collect();
        let shorter: Vec<u32> = (0..9).collect();
        for a in variants::<M, L>(&forward) {
            for b in variants::<M, L>(&forward) {
                assert!(a == b);
            }
            for b in variants::<M, L>(&backward) {
                assert_eq!(a == b, !ordered);
                assert_eq!(b == a, !ordered);
            }
            for b in variants::<M, L>(&shorter) {
                assert!(a != b);
                assert!(b != a);
            }
            for mut b in variants::<M, L>(&forward) {
                *b.get_mut(&5).unwrap() = 50;
                assert!(a != b);
                assert!(b != a);
            }
        }
    }

    #[test]
    fn test_eq_variants() {
        type List = TinyVec<(u32, u32), 0, MAX_USEFUL_LINEAR_SCAN>;
        type F = BuildHasherDefault<FxHasher>;
        check_eq::<HashMap<u32, u32, F>, List>(false);
        check_eq::<IndexMap<u32, u32, F>, List>(true);
    }

    #[test]
    fn test_shrink_to_fit_trait_threshold() {
        for (len, converts) in [
            (MAX_USEFUL_LINEAR_SCAN, true),
            (MAX_USEFUL_LINEAR_SCAN + 1, false),
        ] {
            let mut map: OrderedAutoMap<usize, usize> =
                (0..MAX_USEFUL_LINEAR_SCAN * 2).map(|i| (i, i)).collect();
            for i in len..MAX_USEFUL_LINEAR_SCAN * 2 {
                map.remove(&i);
            }
            assert!(matches!(map, RawAutoMap::Map(..)));
            ShrinkToFit::shrink_to_fit(&mut map);
            assert_eq!(
                matches!(map, RawAutoMap::List(..)),
                converts,
                "{len} entries"
            );
            assert_eq!(
                map.iter().map(|(k, _)| *k).collect::<Vec<_>>(),
                (0..len).collect::<Vec<_>>()
            );
            if converts {
                assert_eq!(list_capacity(&map), Some(len));
            }
        }
    }

    fn list_capacity<M, L>(map: &RawAutoMap<usize, usize, M, L>) -> Option<usize>
    where
        L: BackingListStorage<(usize, usize)>,
    {
        match map {
            RawAutoMap::List(list, _) => Some(list.capacity()),
            RawAutoMap::Map(_) => None,
        }
    }

    #[test]
    fn test_shrink_to_fit_trait_list() {
        // A list with spare capacity is still shrunk.
        let mut map: OrderedAutoMap<usize, usize> = OrderedAutoMap::new();
        for i in 0..20 {
            map.insert(i, i);
        }
        for i in 5..20 {
            map.remove(&i);
        }
        assert!(list_capacity(&map).unwrap() > 5);
        ShrinkToFit::shrink_to_fit(&mut map);
        assert_eq!(list_capacity(&map), Some(5));
        assert_eq!(
            map.iter().map(|(k, _)| *k).collect::<Vec<_>>(),
            (0..5).collect::<Vec<_>>()
        );
    }

    /// Yields `0..len` but claims at least `lower` items.
    struct Overstated {
        next: usize,
        len: usize,
        lower: usize,
    }

    impl Iterator for Overstated {
        type Item = (usize, usize);
        fn next(&mut self) -> Option<Self::Item> {
            (self.next < self.len).then(|| {
                self.next += 1;
                (self.next - 1, self.next - 1)
            })
        }
        fn size_hint(&self) -> (usize, Option<usize>) {
            (self.lower, None)
        }
    }

    fn check_overstated_hint_keeps_map<M>()
    where
        M: BackingMapStorage<usize, usize>,
        M::Hasher: BuildHasher + Default,
    {
        type L = TinyVec<(usize, usize), 0, MAX_USEFUL_LINEAR_SCAN>;
        let overstated = || Overstated {
            next: 0,
            len: 5,
            lower: 100,
        };
        let check = |map: &RawAutoMap<usize, usize, M, L>| {
            // No automatic conversion back into a list.
            assert!(matches!(map, RawAutoMap::Map(..)));
            let mut keys: Vec<_> = map.iter().map(|(k, _)| *k).collect();
            if M::UNORDERED {
                keys.sort();
            }
            assert_eq!(keys, (0..5).collect::<Vec<_>>());
        };

        let mut map: RawAutoMap<usize, usize, M, L> = RawAutoMap::with_hasher();
        map.extend(overstated());
        check(&map);

        let map: RawAutoMap<usize, usize, M, L> = overstated().collect();
        check(&map);
    }

    #[test]
    fn test_overstated_hint_keeps_map() {
        type F = BuildHasherDefault<FxHasher>;
        check_overstated_hint_keeps_map::<HashMap<usize, usize, F>>();
        check_overstated_hint_keeps_map::<IndexMap<usize, usize, F>>();
    }

    fn check_shrink_amortized_map_threshold<M>()
    where
        M: BackingMapStorage<usize, usize>,
        M::Hasher: BuildHasher + Default,
    {
        type L = TinyVec<(usize, usize), 0, MAX_USEFUL_LINEAR_SCAN>;
        for (len, converts) in [(MIN_HASH_SIZE - 1, true), (MIN_HASH_SIZE, false)] {
            let mut map: RawAutoMap<usize, usize, M, L> =
                (0..MAX_USEFUL_LINEAR_SCAN * 2).map(|i| (i, i)).collect();
            for i in len..MAX_USEFUL_LINEAR_SCAN * 2 {
                map.remove(&i);
            }
            assert!(matches!(map, RawAutoMap::Map(..)));
            map.shrink_amortized();
            assert_eq!(
                matches!(map, RawAutoMap::List(..)),
                converts,
                "{len} entries"
            );
            if converts {
                assert_eq!(list_capacity(&map), Some(len));
            }
            let mut keys: Vec<_> = map.iter().map(|(k, _)| *k).collect();
            if M::UNORDERED {
                keys.sort();
            }
            assert_eq!(keys, (0..len).collect::<Vec<_>>());
        }
    }

    #[test]
    fn test_shrink_amortized_map_threshold() {
        type F = BuildHasherDefault<FxHasher>;
        check_shrink_amortized_map_threshold::<HashMap<usize, usize, F>>();
        check_shrink_amortized_map_threshold::<IndexMap<usize, usize, F>>();
    }

    #[test]
    fn test_replace_entry_with_index_map() {
        const N: u32 = 100;
        let make = || -> OrderedAutoMap<u32, u32> {
            let map: OrderedAutoMap<u32, u32> = (0..N).map(|i| (i, i)).collect();
            assert!(matches!(map, RawAutoMap::Map(..)));
            map
        };
        for index in [0, N / 2, N - 1] {
            // `Some` keeps the entry at its position.
            let mut map = make();
            match map.entry(index) {
                Entry::Occupied(e) => e.replace_entry_with(|_, v| Some(v + 1000)),
                Entry::Vacant(_) => unreachable!(),
            }
            let expected: Vec<_> = (0..N)
                .map(|i| (i, if i == index { i + 1000 } else { i }))
                .collect();
            assert_eq!(entries(&map), expected);
            assert_eq!(map.get(&index), Some(&(index + 1000)));

            // `None` removes the entry and keeps the order of the others.
            let mut map = make();
            match map.entry(index) {
                Entry::Occupied(e) => e.replace_entry_with(|_, _| None),
                Entry::Vacant(_) => unreachable!(),
            }
            let expected: Vec<_> = (0..N).filter(|i| *i != index).map(|i| (i, i)).collect();
            assert_eq!(entries(&map), expected);
            assert_eq!(map.get(&index), None);

            // A panic removes the entry and keeps the order of the others.
            let mut map = make();
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| match map.entry(index) {
                    Entry::Occupied(e) => e.replace_entry_with(|_, _| panic!("func panic")),
                    Entry::Vacant(_) => unreachable!(),
                }));
            assert!(result.is_err());
            assert_eq!(entries(&map), expected);
            // Lookups still work after the reordering.
            for (k, v) in &expected {
                assert_eq!(map.get(k), Some(v));
            }
        }
    }

    #[test]
    fn test_eq_unordered_full_lists() {
        let n = MAX_USEFUL_LINEAR_SCAN as u32;
        let make = |keys: &mut dyn Iterator<Item = u32>| -> AutoMap<u32, u32> {
            let mut map = AutoMap::new();
            for k in keys {
                map.insert(k, k * 10);
            }
            assert!(matches!(map, RawAutoMap::List(..)));
            map
        };
        let a = make(&mut (0..n));
        // A permutation interleaving both ends.
        let b = make(&mut (0..n / 2).flat_map(|i| [n - 1 - i, i]));
        assert!(a == b);
        assert!(b == a);

        // One different value after many matches.
        let mut c = make(&mut (0..n).rev());
        *c.get_mut(&3).unwrap() = 7;
        assert!(a != c);
        assert!(c != a);

        // Same length, one different key.
        let d = make(&mut (1..=n));
        assert!(a != d);
        assert!(d != a);
    }

    fn check_extract_if_fold<M>(n: usize)
    where
        M: BackingMapStorage<usize, usize>,
        M::Hasher: BuildHasher + Default,
    {
        type L = TinyVec<(usize, usize), 0, MAX_USEFUL_LINEAR_SCAN>;
        let make = || {
            let mut map: RawAutoMap<usize, usize, M, L> = RawAutoMap::with_hasher();
            for i in 0..n {
                map.insert(i, i);
            }
            assert_eq!(
                matches!(map, RawAutoMap::Map(..)),
                n > MAX_USEFUL_LINEAR_SCAN
            );
            map
        };
        let entries = |map: &RawAutoMap<usize, usize, M, L>| -> Vec<(usize, usize)> {
            map.iter().map(|(k, v)| (*k, *v)).collect()
        };
        let pred = |k: &usize, v: &mut usize| {
            *v += 1;
            k % 3 == 0
        };

        let mut a = make();
        let mut b = make();
        let collected: Vec<_> = a.extract_if(pred).collect();
        let folded = b.extract_if(pred).fold(Vec::new(), |mut acc, item| {
            acc.push(item);
            acc
        });
        assert_eq!(folded, collected);
        assert_eq!(entries(&b), entries(&a));

        // Partially consumed with `next()` first.
        let mut a = make();
        let mut b = make();
        let collected: Vec<_> = a.extract_if(pred).collect();
        let mut iter = b.extract_if(pred);
        let first = iter.next();
        let folded = iter.fold(first.into_iter().collect::<Vec<_>>(), |mut acc, item| {
            acc.push(item);
            acc
        });
        assert_eq!(folded, collected);
        assert_eq!(entries(&b), entries(&a));
    }

    #[test]
    fn test_extract_if_fold() {
        type F = BuildHasherDefault<FxHasher>;
        for n in [10, MAX_USEFUL_LINEAR_SCAN * 3] {
            check_extract_if_fold::<HashMap<usize, usize, F>>(n);
            check_extract_if_fold::<IndexMap<usize, usize, F>>(n);
        }
    }

    #[test]
    fn test_ordered_auto_map_get_index() {
        // 5 entries stay a list, 50 entries are a map.
        for n in [5usize, MAX_USEFUL_LINEAR_SCAN + 18] {
            let mut map: OrderedAutoMap<usize, usize> = (0..n).rev().map(|i| (i, i * 10)).collect();
            assert_eq!(
                matches!(map, RawAutoMap::Map(..)),
                n > MAX_USEFUL_LINEAR_SCAN
            );
            for (index, key) in (0..n).rev().enumerate() {
                assert_eq!(map.get_index(index), Some((&key, &(key * 10))));
                assert_eq!(map.get_index_of(&key), Some(index));
            }
            assert_eq!(map.get_index(n), None);
            assert_eq!(map.get_index_of(&n), None);

            // An order preserving removal shifts the later entries.
            map.remove(&(n - 2));
            assert_eq!(map.get_index(1), Some((&(n - 3), &((n - 3) * 10))));
            assert_eq!(map.get_index_of(&(n - 3)), Some(1));
            assert_eq!(map.get_index_of(&(n - 2)), None);
            // A new entry goes to the end.
            map.insert(n + 1, 0);
            assert_eq!(map.get_index_of(&(n + 1)), Some(n - 1));
            assert_eq!(map.get_index(n - 1), Some((&(n + 1), &0)));
        }

        // The index stays the same across the list -> map conversion.
        let mut map = OrderedAutoMap::new();
        for i in (0..MAX_USEFUL_LINEAR_SCAN + 1).rev() {
            map.insert(i, ());
        }
        assert!(matches!(map, RawAutoMap::Map(..)));
        assert_eq!(map.get_index_of(&MAX_USEFUL_LINEAR_SCAN), Some(0));
        assert_eq!(map.get_index_of(&0), Some(MAX_USEFUL_LINEAR_SCAN));
    }

    #[test]
    fn test_ordered_auto_map_from_index_map() {
        type F = BuildHasherDefault<FxHasher>;
        for n in [
            0usize,
            5,
            MAX_USEFUL_LINEAR_SCAN,
            MAX_USEFUL_LINEAR_SCAN + 1,
            100,
        ] {
            let index_map: IndexMap<usize, usize, F> = (0..n).rev().map(|i| (i, i * 2)).collect();
            let map: OrderedAutoMap<usize, usize> = index_map.clone().into();
            assert_eq!(map.len(), n);
            assert_eq!(
                matches!(map, RawAutoMap::Map(..)),
                n > MAX_USEFUL_LINEAR_SCAN
            );
            assert_eq!(keys(&map), (0..n).rev().collect::<Vec<_>>());
            let collected: OrderedAutoMap<usize, usize> = index_map.into_iter().collect();
            assert_eq!(map, collected);
        }
    }

    #[test]
    fn test_keys() {
        for n in [0usize, 5, MAX_USEFUL_LINEAR_SCAN + 18] {
            let map: OrderedAutoMap<usize, usize> = (0..n).rev().map(|i| (i, i * 2)).collect();
            assert_eq!(map.keys().size_hint(), (n, Some(n)));
            assert_eq!(map.keys().copied().collect::<Vec<_>>(), keys(&map));
            assert_eq!(
                map.keys().fold(Vec::new(), |mut acc, k| {
                    acc.push(*k);
                    acc
                }),
                (0..n).rev().collect::<Vec<_>>()
            );
            let unordered: AutoMap<usize, usize> = (0..n).map(|i| (i, i)).collect();
            let mut unordered_keys: Vec<usize> = unordered.keys().copied().collect();
            unordered_keys.sort();
            assert_eq!(unordered_keys, (0..n).collect::<Vec<_>>());
        }
    }

    #[test]
    fn test_equivalent_lookups() {
        /// A borrowed lookup key for `(String, u32)` keys, which don't borrow as it.
        #[derive(Hash)]
        struct Ref<'a>(&'a str, u32);
        impl Equivalent<(String, u32)> for Ref<'_> {
            fn equivalent(&self, key: &(String, u32)) -> bool {
                self.0 == key.0 && self.1 == key.1
            }
        }

        fn check<M, L>()
        where
            M: IndexedBackingMapStorage<(String, u32), usize>,
            M::Hasher: BuildHasher + Default,
            L: BackingListStorage<((String, u32), usize)>,
        {
            for n in [5usize, MAX_USEFUL_LINEAR_SCAN + 18] {
                let mut map: RawAutoMap<(String, u32), usize, M, L> =
                    (0..n).map(|i| ((i.to_string(), i as u32), i)).collect();
                for i in 0..n {
                    let name = i.to_string();
                    let key = Ref(&name, i as u32);
                    assert_eq!(map.get(&key), Some(&i));
                    assert_eq!(
                        map.get_key_value(&key),
                        Some((&(name.clone(), i as u32), &i))
                    );
                    assert!(map.contains_key(&key));
                    assert_eq!(map.get_index_of(&key), Some(i));
                    *map.get_mut(&key).unwrap() += 1;
                    assert!(matches!(map.raw_entry_mut(&key), RawEntry::Occupied(_)));
                }
                assert_eq!(map.get(&Ref("0", 1)), None);
                assert!(matches!(
                    map.raw_entry_mut(&Ref("0", 1)),
                    RawEntry::Vacant(_)
                ));
                assert_eq!(map.remove(&Ref("1", 1)), Some(2));
                assert_eq!(map.swap_remove(&Ref("0", 0)), Some(1));
                assert_eq!(map.len(), n - 2);
                // `Borrow` lookups keep working: `(String, u32)` is equivalent to itself.
                assert_eq!(map.get(&("2".to_string(), 2)), Some(&3));
            }
        }
        type F = BuildHasherDefault<FxHasher>;
        check::<IndexMap<(String, u32), usize, F>, TinyVec<((String, u32), usize), 0, 32>>();

        // Unordered maps and sets accept the same lookups.
        let mut map: AutoMap<(String, u32), usize> =
            (0..50).map(|i| ((i.to_string(), i as u32), i)).collect();
        assert_eq!(map.get(&Ref("7", 7)), Some(&7));
        assert_eq!(map.remove(&Ref("7", 7)), Some(7));
        assert!(!map.contains_key(&Ref("7", 7)));
        let set: crate::AutoSet<(String, u32)> = (0..5).map(|i| (i.to_string(), i)).collect();
        assert!(set.contains(&Ref("3", 3)));
        assert!(!set.contains(&Ref("3", 4)));
    }

    /// An iterator whose lower size hint claims `hint` items, regardless of how many it yields.
    struct Hinted<I> {
        iter: I,
        hint: usize,
    }

    impl<I: Iterator> Iterator for Hinted<I> {
        type Item = I::Item;

        fn next(&mut self) -> Option<Self::Item> {
            self.iter.next()
        }

        fn size_hint(&self) -> (usize, Option<usize>) {
            (self.hint, None)
        }
    }

    #[test]
    fn test_from_unique_iterator() {
        for n in [
            0usize,
            1,
            5,
            MAX_USEFUL_LINEAR_SCAN,
            MAX_USEFUL_LINEAR_SCAN + 1,
            100,
        ] {
            let expected: Vec<usize> = (0..n).rev().collect();
            // Exact size hint, an understated one (`filter` reports 0) and an overstated one.
            let exact: OrderedAutoMap<usize, usize> =
                OrderedAutoMap::from_unique_iterator((0..n).rev().map(|i| (i, i * 2)));
            let understated: OrderedAutoMap<usize, usize> = OrderedAutoMap::from_unique_iterator(
                (0..n).rev().filter(|_| true).map(|i| (i, i * 2)),
            );
            let overstated: OrderedAutoMap<usize, usize> =
                OrderedAutoMap::from_unique_iterator(Hinted {
                    iter: (0..n).rev().map(|i| (i, i * 2)),
                    hint: 100,
                });
            for map in [&exact, &understated] {
                assert_eq!(
                    matches!(map, RawAutoMap::Map(..)),
                    n > MAX_USEFUL_LINEAR_SCAN
                );
            }
            // A size hint above the list size builds a map, like `collect`.
            assert!(matches!(overstated, RawAutoMap::Map(..)));
            for map in [exact, understated, overstated] {
                assert_eq!(map.len(), n);
                assert_eq!(keys(&map), expected);
                for i in 0..n {
                    assert_eq!(map.get(&i), Some(&(i * 2)));
                }
                let collected: OrderedAutoMap<usize, usize> =
                    (0..n).rev().map(|i| (i, i * 2)).collect();
                assert_eq!(map, collected);
            }

            let unordered: AutoMap<usize, usize> =
                AutoMap::from_unique_iterator((0..n).map(|i| (i, i * 2)));
            assert_eq!(
                matches!(unordered, RawAutoMap::Map(..)),
                n > MAX_USEFUL_LINEAR_SCAN
            );
            assert_eq!(unordered, (0..n).map(|i| (i, i * 2)).collect());
        }
    }

    #[test]
    fn test_from_hash_map() {
        type F = BuildHasherDefault<FxHasher>;
        for n in [
            0usize,
            5,
            MAX_USEFUL_LINEAR_SCAN,
            MAX_USEFUL_LINEAR_SCAN + 1,
            100,
        ] {
            let hash_map: HashMap<usize, usize, F> = (0..n).map(|i| (i, i * 2)).collect();
            let map: AutoMap<usize, usize> = hash_map.clone().into();
            assert_eq!(
                matches!(map, RawAutoMap::Map(..)),
                n > MAX_USEFUL_LINEAR_SCAN
            );
            assert_eq!(map.len(), n);
            assert_eq!(map, hash_map.into_iter().collect());
        }
    }

    #[test]
    fn test_from_btree_map() {
        for n in [
            0usize,
            5,
            MAX_USEFUL_LINEAR_SCAN,
            MAX_USEFUL_LINEAR_SCAN + 1,
            100,
        ] {
            let btree_map: std::collections::BTreeMap<usize, usize> =
                (0..n).rev().map(|i| (i, i * 2)).collect();
            let ordered: OrderedAutoMap<usize, usize> = btree_map.clone().into();
            let unordered: AutoMap<usize, usize> = btree_map.into();
            for is_map in [
                matches!(ordered, RawAutoMap::Map(..)),
                matches!(unordered, RawAutoMap::Map(..)),
            ] {
                assert_eq!(is_map, n > MAX_USEFUL_LINEAR_SCAN);
            }
            // The ordered map keeps the key order of the `BTreeMap`.
            assert_eq!(keys(&ordered), (0..n).collect::<Vec<_>>());
            assert_eq!(unordered, (0..n).map(|i| (i, i * 2)).collect());
        }
    }
}
