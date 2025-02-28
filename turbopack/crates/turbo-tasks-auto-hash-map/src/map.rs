use std::{
    borrow::Borrow,
    fmt::{Debug, Formatter},
    hash::{BuildHasher, BuildHasherDefault, Hash},
    marker::PhantomData,
};

use hashbrown::hash_map::HashMap;
use rustc_hash::FxHasher;
use serde::{
    de::{MapAccess, Visitor},
    ser::SerializeMap,
    Deserialize, Deserializer, Serialize, Serializer,
};
use smallvec::SmallVec;

use crate::{MAX_LIST_SIZE, MIN_HASH_SIZE};

#[derive(Clone)]
pub enum AutoMap<K, V, H = BuildHasherDefault<FxHasher>, const I: usize = 0> {
    List(SmallVec<[(K, V); I]>),
    Map(Box<HashMap<K, V, H>>),
}

impl<K, V, H, const I: usize> Default for AutoMap<K, V, H, I> {
    fn default() -> Self {
        Self::List(Default::default())
    }
}

impl<K: Debug, V: Debug, H, const I: usize> Debug for AutoMap<K, V, H, I> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_map().entries(self.iter()).finish()
    }
}

impl<K, V> AutoMap<K, V, BuildHasherDefault<FxHasher>, 0> {
    /// see [HashMap::new](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.new)
    pub const fn new() -> Self {
        AutoMap::List(SmallVec::new_const())
    }

    /// see [HashMap::with_capacity](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.with_capacity)
    pub fn with_capacity(capacity: usize) -> Self {
        if capacity < MAX_LIST_SIZE {
            AutoMap::List(SmallVec::with_capacity(capacity))
        } else {
            AutoMap::Map(Box::new(HashMap::with_capacity_and_hasher(
                capacity,
                Default::default(),
            )))
        }
    }
}

impl<K, V, H: BuildHasher, const I: usize> AutoMap<K, V, H, I> {
    /// see [HashMap::with_hasher](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.with_hasher)
    pub const fn with_hasher() -> Self {
        AutoMap::List(SmallVec::new_const())
    }

    /// see [HashMap::with_capacity_and_hasher](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.with_capacity_and_hasher)
    pub fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        if capacity <= MAX_LIST_SIZE {
            AutoMap::List(SmallVec::with_capacity(capacity))
        } else {
            AutoMap::Map(Box::new(HashMap::with_capacity_and_hasher(
                capacity, hasher,
            )))
        }
    }

    /// see [HashMap::clear](https://doc.rust-lang.org/std/collections/hash_map/struct.HashMap.html#method.clear)
    pub fn clear(&mut self) {
        match self {
            AutoMap::List(list) => list.clear(),
            AutoMap::Map(map) => map.clear(),
        }
    }
}

impl<K: Eq + Hash, V, H: BuildHasher + Default, const I: usize> AutoMap<K, V, H, I> {
    fn convert_to_map(&mut self) -> &mut HashMap<K, V, H> {
        if let AutoMap::List(list) = self {
            let mut map = HashMap::with_capacity_and_hasher(MAX_LIST_SIZE * 2, Default::default());
            map.extend(list.drain(..));
            *self = AutoMap::Map(Box::new(map));
        }
        if let AutoMap::Map(map) = self {
            map
        } else {
            unreachable!()
        }
    }

    fn convert_to_list(&mut self) -> &mut SmallVec<[(K, V); I]> {
        if let AutoMap::Map(map) = self {
            let mut list = SmallVec::with_capacity(MAX_LIST_SIZE);
            list.extend(map.drain());
            *self = AutoMap::List(list);
        }
        if let AutoMap::List(list) = self {
            list
        } else {
            unreachable!()
        }
    }

    /// see [HashMap::insert](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.insert)
    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        match self {
            AutoMap::List(list) => {
                for (k, v) in list.iter_mut() {
                    if *k == key {
                        return Some(std::mem::replace(v, value));
                    }
                }
                if list.len() >= MAX_LIST_SIZE {
                    let map = self.convert_to_map();
                    map.insert(key, value);
                } else {
                    list.push((key, value));
                }
                None
            }
            AutoMap::Map(map) => map.insert(key, value),
        }
    }

    /// see [HashMap::remove](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.remove)
    pub fn remove(&mut self, key: &K) -> Option<V> {
        match self {
            AutoMap::List(list) => {
                for i in 0..list.len() {
                    if list[i].0 == *key {
                        return Some(list.swap_remove(i).1);
                    }
                }
                None
            }
            AutoMap::Map(map) => map.remove(key),
        }
    }

    /// see [HashMap::extend](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.extend)
    pub fn extend(&mut self, iter: impl IntoIterator<Item = (K, V)>) {
        let iter = iter.into_iter();
        match self {
            AutoMap::List(list) => {
                let (lower, _) = iter.size_hint();
                if list.len() + lower > MAX_LIST_SIZE {
                    let map = self.convert_to_map();
                    map.extend(iter);
                    // The hint is not enforced
                    if map.len() < MIN_HASH_SIZE {
                        self.convert_to_list();
                    }
                    return;
                }
                for (k, v) in iter {
                    self.insert(k, v);
                }
            }
            AutoMap::Map(map) => {
                map.extend(iter);
            }
        }
    }

    /// see [HashMap::entry](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.entry)
    pub fn entry(&mut self, key: K) -> Entry<'_, K, V, H, I> {
        let this = self as *mut Self;
        match self {
            AutoMap::List(list) => match list.iter().position(|(k, _)| *k == key) {
                Some(index) => Entry::Occupied(OccupiedEntry::List { list, index }),
                None => Entry::Vacant(VacantEntry::List { this, list, key }),
            },
            AutoMap::Map(map) => match map.entry(key) {
                hashbrown::hash_map::Entry::Occupied(entry) => {
                    Entry::Occupied(OccupiedEntry::Map { this, entry })
                }
                hashbrown::hash_map::Entry::Vacant(entry) => Entry::Vacant(VacantEntry::Map(entry)),
            },
        }
    }

    pub fn raw_entry_mut<Q>(&mut self, key: &Q) -> RawEntry<'_, K, V, H, I>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let this = self as *mut Self;
        match self {
            AutoMap::List(list) => match list.iter().position(|(k, _)| k.borrow() == key) {
                Some(index) => RawEntry::Occupied(OccupiedRawEntry::List { list, index }),
                None => RawEntry::Vacant(VacantRawEntry::List { this, list }),
            },
            AutoMap::Map(map) => match map.raw_entry_mut().from_key(key) {
                hashbrown::hash_map::RawEntryMut::Occupied(entry) => {
                    RawEntry::Occupied(OccupiedRawEntry::Map { this, entry })
                }
                hashbrown::hash_map::RawEntryMut::Vacant(entry) => {
                    RawEntry::Vacant(VacantRawEntry::Map(entry))
                }
            },
        }
    }

    /// see [HashMap::retain](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.retain)
    pub fn retain<F>(&mut self, mut f: F)
    where
        F: FnMut(&K, &mut V) -> bool,
    {
        match self {
            AutoMap::List(list) => {
                // Don't use `Vec::retain`, as that uses a slower algorithm to maintain order,
                // which we don't care about
                let mut len = list.len();
                let mut i = 0;
                while i < len {
                    let (key, value) = &mut list[i];
                    if !f(key, value) {
                        list.swap_remove(i);
                        len -= 1;
                    } else {
                        i += 1;
                    }
                }
            }
            AutoMap::Map(map) => {
                map.retain(f);
            }
        }
    }

    pub fn extract_if<'l, F>(&'l mut self, f: F) -> ExtractIfIter<'l, K, V, I, F>
    where
        F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
    {
        match self {
            AutoMap::List(list) => ExtractIfIter::List { list, index: 0, f },
            AutoMap::Map(map) => ExtractIfIter::Map(map.extract_if(f)),
        }
    }

    /// see [HashMap::shrink_to_fit](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.shrink_to_fit)
    pub fn shrink_to_fit(&mut self) {
        match self {
            AutoMap::List(list) => list.shrink_to_fit(),
            AutoMap::Map(map) => {
                if map.len() <= MAX_LIST_SIZE {
                    let mut list = SmallVec::with_capacity(map.len());
                    list.extend(map.drain());
                    *self = AutoMap::List(list);
                } else {
                    map.shrink_to_fit();
                }
            }
        }
    }

    pub fn shrink_amortized(&mut self) {
        match self {
            AutoMap::List(list) => {
                if list.capacity() > list.len() * 3 {
                    list.shrink_to_fit();
                }
            }
            AutoMap::Map(map) => {
                if map.len() <= MIN_HASH_SIZE {
                    let mut list = SmallVec::with_capacity(map.len());
                    list.extend(map.drain());
                    *self = AutoMap::List(list);
                } else if map.capacity() > map.len() * 3 {
                    map.shrink_to_fit();
                }
            }
        }
    }
}

impl<K: Eq + Hash, V, H: BuildHasher, const I: usize> AutoMap<K, V, H, I> {
    /// see [HashMap::get](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get)
    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        match self {
            AutoMap::List(list) => {
                list.iter()
                    .find_map(|(k, v)| if *k.borrow() == *key { Some(v) } else { None })
            }
            AutoMap::Map(map) => map.get(key),
        }
    }

    /// see [HashMap::get_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.get_mut)
    pub fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        match self {
            AutoMap::List(list) => {
                list.iter_mut()
                    .find_map(|(k, v)| if *k == *key { Some(v) } else { None })
            }
            AutoMap::Map(map) => map.get_mut(key),
        }
    }

    /// see [HashMap::contains_key](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.contains_key)
    pub fn contains_key(&self, key: &K) -> bool {
        match self {
            AutoMap::List(list) => list.iter().any(|(k, _)| *k == *key),
            AutoMap::Map(map) => map.contains_key(key),
        }
    }
}

impl<K, V, H, const I: usize> AutoMap<K, V, H, I> {
    /// see [HashMap::iter](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.iter)
    pub fn iter(&self) -> Iter<'_, K, V> {
        match self {
            AutoMap::List(list) => Iter::List(list.iter()),
            AutoMap::Map(map) => Iter::Map(map.iter()),
        }
    }
    /// see [HashMap::iter_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.iter_mut)
    pub fn iter_mut(&mut self) -> IterMut<'_, K, V> {
        match self {
            AutoMap::List(list) => IterMut::List(list.iter_mut()),
            AutoMap::Map(map) => IterMut::Map(map.iter_mut()),
        }
    }

    /// see [HashMap::is_empty](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.is_empty)
    pub fn is_empty(&self) -> bool {
        match self {
            AutoMap::List(list) => list.is_empty(),
            AutoMap::Map(map) => map.is_empty(),
        }
    }

    /// see [HashMap::len](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.len)
    pub fn len(&self) -> usize {
        match self {
            AutoMap::List(list) => list.len(),
            AutoMap::Map(map) => map.len(),
        }
    }

    /// see [HashMap::values_mut](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.values_mut)
    pub fn values_mut(&mut self) -> ValuesMut<'_, K, V> {
        match self {
            AutoMap::List(list) => ValuesMut::List(list.iter_mut()),
            AutoMap::Map(map) => ValuesMut::Map(map.values_mut()),
        }
    }

    /// see [HashMap::values](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.values)
    pub fn values(&self) -> Values<'_, K, V> {
        match self {
            AutoMap::List(list) => Values::List(list.iter()),
            AutoMap::Map(map) => Values::Map(map.values()),
        }
    }

    /// see [HashMap::into_values](https://doc.rust-lang.org/std/collections/struct.HashMap.html#method.into_values)
    pub fn into_values(self) -> IntoValues<K, V, I> {
        match self {
            AutoMap::List(list) => IntoValues::List(list.into_iter()),
            AutoMap::Map(map) => IntoValues::Map(map.into_values()),
        }
    }
}

impl<K, V, H, const I: usize> IntoIterator for AutoMap<K, V, H, I> {
    type Item = (K, V);
    type IntoIter = IntoIter<K, V, I>;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            AutoMap::List(list) => IntoIter::List(list.into_iter()),
            AutoMap::Map(map) => IntoIter::Map(map.into_iter()),
        }
    }
}

impl<'a, K, V, H, const I: usize> IntoIterator for &'a AutoMap<K, V, H, I> {
    type Item = (&'a K, &'a V);
    type IntoIter = Iter<'a, K, V>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

pub enum Iter<'a, K, V> {
    List(std::slice::Iter<'a, (K, V)>),
    Map(hashbrown::hash_map::Iter<'a, K, V>),
}

impl<'a, K, V> Iterator for Iter<'a, K, V> {
    type Item = (&'a K, &'a V);

    // This clippy lint doesn't account for lifetimes
    #[allow(clippy::map_identity)]
    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Iter::List(iter) => iter.next().map(|(k, v)| (k, v)),
            Iter::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Iter::List(iter) => iter.size_hint(),
            Iter::Map(iter) => iter.size_hint(),
        }
    }
}

impl<K, V> Clone for Iter<'_, K, V> {
    fn clone(&self) -> Self {
        match self {
            Iter::List(iter) => Iter::List(iter.clone()),
            Iter::Map(iter) => Iter::Map(iter.clone()),
        }
    }
}

pub enum IterMut<'a, K, V> {
    List(std::slice::IterMut<'a, (K, V)>),
    Map(hashbrown::hash_map::IterMut<'a, K, V>),
}

impl<'a, K, V> Iterator for IterMut<'a, K, V> {
    type Item = (&'a K, &'a mut V);

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            IterMut::List(iter) => iter.next().map(|(k, v)| (&*k, v)),
            IterMut::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            IterMut::List(iter) => iter.size_hint(),
            IterMut::Map(iter) => iter.size_hint(),
        }
    }
}

pub enum IntoIter<K, V, const I: usize> {
    List(smallvec::IntoIter<[(K, V); I]>),
    Map(hashbrown::hash_map::IntoIter<K, V>),
}

impl<K, V, const I: usize> Iterator for IntoIter<K, V, I> {
    type Item = (K, V);

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
}

pub enum Values<'a, K, V> {
    List(std::slice::Iter<'a, (K, V)>),
    Map(hashbrown::hash_map::Values<'a, K, V>),
}

impl<'a, K, V> Iterator for Values<'a, K, V> {
    type Item = &'a V;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Values::List(iter) => iter.next().map(|(_, v)| v),
            Values::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Values::List(iter) => iter.size_hint(),
            Values::Map(iter) => iter.size_hint(),
        }
    }
}

pub enum ValuesMut<'a, K, V> {
    List(std::slice::IterMut<'a, (K, V)>),
    Map(hashbrown::hash_map::ValuesMut<'a, K, V>),
}

impl<'a, K, V> Iterator for ValuesMut<'a, K, V> {
    type Item = &'a mut V;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ValuesMut::List(iter) => iter.next().map(|(_, v)| v),
            ValuesMut::Map(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            ValuesMut::List(iter) => iter.size_hint(),
            ValuesMut::Map(iter) => iter.size_hint(),
        }
    }
}

pub enum IntoValues<K, V, const I: usize> {
    List(smallvec::IntoIter<[(K, V); I]>),
    Map(hashbrown::hash_map::IntoValues<K, V>),
}

impl<K, V, const I: usize> Iterator for IntoValues<K, V, I> {
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
}

pub enum Entry<'a, K, V, H, const I: usize> {
    Occupied(OccupiedEntry<'a, K, V, H, I>),
    Vacant(VacantEntry<'a, K, V, H, I>),
}

impl<'a, K: Eq + Hash, V, H: BuildHasher + Default + 'a, const I: usize> Entry<'a, K, V, H, I> {
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

impl<'a, K: Eq + Hash, V: Default, H: BuildHasher + Default + 'a, const I: usize>
    Entry<'a, K, V, H, I>
{
    /// see [HashMap::Entry::or_default](https://doc.rust-lang.org/std/collections/hash_map/enum.Entry.html#method.or_default)
    pub fn or_default(self) -> &'a mut V {
        match self {
            Entry::Occupied(entry) => entry.into_mut(),
            Entry::Vacant(entry) => entry.insert(Default::default()),
        }
    }
}

pub enum OccupiedEntry<'a, K, V, H, const I: usize> {
    List {
        list: &'a mut SmallVec<[(K, V); I]>,
        index: usize,
    },
    Map {
        this: *mut AutoMap<K, V, H, I>,
        entry: hashbrown::hash_map::OccupiedEntry<'a, K, V, H>,
    },
}

impl<'a, K: Eq + Hash, V, H: BuildHasher, const I: usize> OccupiedEntry<'a, K, V, H, I> {
    /// see [HashMap::OccupiedEntry::get_mut](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.get_mut)
    pub fn get_mut(&mut self) -> &mut V {
        match self {
            OccupiedEntry::List { list, index } => &mut list[*index].1,
            OccupiedEntry::Map { entry, .. } => entry.get_mut(),
        }
    }

    /// see [HashMap::OccupiedEntry::into_mut](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.into_mut)
    pub fn into_mut(self) -> &'a mut V {
        match self {
            OccupiedEntry::List { list, index } => &mut list[index].1,
            OccupiedEntry::Map { entry, .. } => entry.into_mut(),
        }
    }
}

impl<K: Eq + Hash, V, H: BuildHasher + Default, const I: usize> OccupiedEntry<'_, K, V, H, I> {
    /// see [HashMap::OccupiedEntry::remove](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.remove)
    pub fn remove(self) -> V {
        match self {
            OccupiedEntry::List { list, index } => list.swap_remove(index).1,
            OccupiedEntry::Map { entry, this: _ } => entry.remove(),
        }
    }

    pub fn replace_entry_with(self, func: impl FnOnce(&K, V) -> Option<V>) {
        match self {
            OccupiedEntry::List { list, index } => {
                let (key, value) = list.swap_remove(index);
                if let Some(value) = func(&key, value) {
                    list.push((key, value));
                }
            }
            OccupiedEntry::Map { entry, .. } => {
                entry.replace_entry_with(func);
            }
        }
    }
}

pub enum VacantEntry<'a, K, V, H, const I: usize> {
    List {
        this: *mut AutoMap<K, V, H, I>,
        list: &'a mut SmallVec<[(K, V); I]>,
        key: K,
    },
    Map(hashbrown::hash_map::VacantEntry<'a, K, V, H>),
}

impl<'a, K: Eq + Hash, V, H: BuildHasher + Default + 'a, const I: usize>
    VacantEntry<'a, K, V, H, I>
{
    /// see [HashMap::VacantEntry::insert](https://doc.rust-lang.org/std/collections/hash_map/enum.VacantEntry.html#method.insert)
    pub fn insert(self, value: V) -> &'a mut V {
        match self {
            VacantEntry::List { this, list, key } => {
                if list.len() >= MAX_LIST_SIZE {
                    let this = unsafe { &mut *this };
                    this.convert_to_map().entry(key).or_insert(value)
                } else {
                    list.push((key, value));
                    &mut list.last_mut().unwrap().1
                }
            }
            VacantEntry::Map(entry) => entry.insert(value),
        }
    }
}

pub enum RawEntry<'a, K, V, H, const I: usize> {
    Occupied(OccupiedRawEntry<'a, K, V, H, I>),
    Vacant(VacantRawEntry<'a, K, V, H, I>),
}

pub enum OccupiedRawEntry<'a, K, V, H, const I: usize> {
    List {
        list: &'a mut SmallVec<[(K, V); I]>,
        index: usize,
    },
    Map {
        this: *mut AutoMap<K, V, H, I>,
        entry: hashbrown::hash_map::RawOccupiedEntryMut<'a, K, V, H>,
    },
}

impl<'a, K: Eq + Hash, V, H: BuildHasher, const I: usize> OccupiedRawEntry<'a, K, V, H, I> {
    /// see [HashMap::RawOccupiedEntryMut::get_mut](https://doc.rust-lang.org/std/collections/hash_map/struct.RawOccupiedEntryMut.html#method.get_mut)
    pub fn get_mut(&mut self) -> &mut V {
        match self {
            OccupiedRawEntry::List { list, index } => &mut list[*index].1,
            OccupiedRawEntry::Map { entry, .. } => entry.get_mut(),
        }
    }

    /// see [HashMap::RawOccupiedEntryMut::into_mut](https://doc.rust-lang.org/std/collections/hash_map/struct.RawOccupiedEntryMut.html#method.into_mut)
    pub fn into_mut(self) -> &'a mut V {
        match self {
            OccupiedRawEntry::List { list, index } => &mut list[index].1,
            OccupiedRawEntry::Map { entry, .. } => entry.into_mut(),
        }
    }
}

impl<K: Eq + Hash, V, H: BuildHasher + Default, const I: usize> OccupiedRawEntry<'_, K, V, H, I> {
    /// see [HashMap::OccupiedEntry::remove](https://doc.rust-lang.org/std/collections/hash_map/enum.OccupiedEntry.html#method.remove)
    pub fn remove(self) -> V {
        match self {
            OccupiedRawEntry::List { list, index } => list.swap_remove(index).1,
            OccupiedRawEntry::Map { entry, this: _ } => entry.remove(),
        }
    }
}

pub enum VacantRawEntry<'a, K, V, H, const I: usize> {
    List {
        this: *mut AutoMap<K, V, H, I>,
        list: &'a mut SmallVec<[(K, V); I]>,
    },
    Map(hashbrown::hash_map::RawVacantEntryMut<'a, K, V, H>),
}

impl<'a, K: Eq + Hash, V, H: BuildHasher + Default + 'a, const I: usize>
    VacantRawEntry<'a, K, V, H, I>
{
    /// see [HashMap::RawVacantEntryMut::insert](https://doc.rust-lang.org/std/collections/hash_map/struct.RawVacantEntryMut.html#method.insert)
    pub fn insert(self, key: K, value: V) -> &'a mut V {
        match self {
            VacantRawEntry::List { this, list } => {
                if list.len() >= MAX_LIST_SIZE {
                    let this = unsafe { &mut *this };
                    this.convert_to_map().entry(key).or_insert(value)
                } else {
                    list.push((key, value));
                    &mut list.last_mut().unwrap().1
                }
            }
            VacantRawEntry::Map(entry) => entry.insert(key, value).1,
        }
    }
}

impl<K, V, H, const I: usize> Serialize for AutoMap<K, V, H, I>
where
    K: Eq + Hash + Serialize,
    V: Serialize,
    H: BuildHasher,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            AutoMap::List(list) => {
                let mut map = serializer.serialize_map(Some(list.len()))?;
                for (k, v) in list {
                    map.serialize_entry(k, v)?;
                }
                map.end()
            }
            AutoMap::Map(map) => (**map).serialize(serializer),
        }
    }
}

impl<'de, K, V, H, const I: usize> Deserialize<'de> for AutoMap<K, V, H, I>
where
    K: Eq + Hash + Deserialize<'de>,
    V: Deserialize<'de>,
    H: BuildHasher + Default,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct AutoMapVisitor<K, V, H, const I: usize> {
            phantom: PhantomData<AutoMap<K, V, H, I>>,
        }

        impl<'de, K, V, H, const I: usize> Visitor<'de> for AutoMapVisitor<K, V, H, I>
        where
            K: Eq + Hash + Deserialize<'de>,
            V: Deserialize<'de>,
            H: BuildHasher + Default,
        {
            type Value = AutoMap<K, V, H, I>;

            fn expecting(&self, formatter: &mut Formatter) -> std::fmt::Result {
                formatter.write_str("a map")
            }

            fn visit_map<M>(self, mut m: M) -> Result<Self::Value, M::Error>
            where
                M: MapAccess<'de>,
            {
                if let Some(size) = m.size_hint() {
                    if size < MAX_LIST_SIZE {
                        let mut list = SmallVec::with_capacity(size);
                        while let Some((k, v)) = m.next_entry()? {
                            list.push((k, v));
                        }
                        return Ok(AutoMap::List(list));
                    } else {
                        let mut map =
                            Box::new(HashMap::with_capacity_and_hasher(size, H::default()));
                        while let Some((k, v)) = m.next_entry()? {
                            map.insert(k, v);
                        }
                        return Ok(AutoMap::Map(map));
                    }
                }
                let mut map = AutoMap::with_hasher();
                while let Some((k, v)) = m.next_entry()? {
                    map.insert(k, v);
                }
                Ok(map)
            }
        }

        deserializer.deserialize_map(AutoMapVisitor {
            phantom: PhantomData::<AutoMap<K, V, H, I>>,
        })
    }
}

impl<K: Eq + Hash, V: Eq, H: BuildHasher, const I: usize> PartialEq for AutoMap<K, V, H, I> {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (AutoMap::Map(a), AutoMap::Map(b)) => a == b,
            (AutoMap::List(a), b) => {
                if a.len() != b.len() {
                    return false;
                }
                a.iter().all(|(k, v)| b.get(k) == Some(v))
            }
            (a, AutoMap::List(b)) => {
                if a.len() != b.len() {
                    return false;
                }
                b.iter().all(|(k, v)| a.get(k) == Some(v))
            }
        }
    }
}

impl<K: Eq + Hash, V: Eq, H: BuildHasher, const I: usize> Eq for AutoMap<K, V, H, I>
where
    K: Eq,
    V: Eq,
{
}

impl<K, V, H, const I: usize> FromIterator<(K, V)> for AutoMap<K, V, H, I>
where
    K: Eq + Hash,
    H: BuildHasher + Default,
{
    fn from_iter<T: IntoIterator<Item = (K, V)>>(iter: T) -> Self {
        let iter = iter.into_iter();
        let (lower, _) = iter.size_hint();
        if lower > MAX_LIST_SIZE {
            let map = iter.collect::<HashMap<K, V, H>>();
            // The hint is not enforced
            if map.len() < MIN_HASH_SIZE {
                return AutoMap::List(map.into_iter().collect());
            }
            return AutoMap::Map(Box::new(map));
        }
        let mut map = AutoMap::with_hasher();
        for (k, v) in iter {
            map.insert(k, v);
        }
        map
    }
}

pub enum ExtractIfIter<'l, K, V, const I: usize, F>
where
    F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
{
    List {
        list: &'l mut SmallVec<[(K, V); I]>,
        index: usize,
        f: F,
    },
    Map(hashbrown::hash_map::ExtractIf<'l, K, V, F>),
}

impl<K, V, const I: usize, F> Iterator for ExtractIfIter<'_, K, V, I, F>
where
    F: for<'a, 'b> FnMut(&'a K, &'b mut V) -> bool,
{
    type Item = (K, V);

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ExtractIfIter::List { list, index, f } => {
                while *index < list.len() {
                    let (key, value) = &mut list[*index];
                    if f(key, value) {
                        let item = list.swap_remove(*index);
                        return Some(item);
                    } else {
                        *index += 1;
                    }
                }
                None
            }
            ExtractIfIter::Map(extract_if) => extract_if.next(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_map() {
        let mut map = AutoMap::new();
        for i in 0..MAX_LIST_SIZE * 2 {
            map.insert(i, i);
        }
        for i in 0..MAX_LIST_SIZE * 2 {
            assert_eq!(map.get(&i), Some(&i));
        }
        assert_eq!(map.get(&(MAX_LIST_SIZE * 2)), None);
        for i in 0..MAX_LIST_SIZE * 2 {
            assert_eq!(map.remove(&(MAX_LIST_SIZE * 2)), None);
            assert_eq!(map.remove(&i), Some(i));
        }
        assert_eq!(map.remove(&(MAX_LIST_SIZE * 2)), None);
    }

    #[test]
    fn test_extract_if_map() {
        let mut map = AutoMap::new();
        for i in 0..MAX_LIST_SIZE * 2 {
            map.insert(i, i);
        }
        let iter = map.extract_if(|_, v| *v % 2 == 0);
        assert_eq!(iter.count(), MAX_LIST_SIZE);
        assert_eq!(map.len(), MAX_LIST_SIZE);
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
}
