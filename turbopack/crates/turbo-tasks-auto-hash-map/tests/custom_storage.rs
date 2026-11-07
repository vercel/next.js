//! A third map storage, implemented outside of the crate through the public API only. This
//! checks that [`BackingMapStorage`] is open for other map types than the built-in
//! `hashbrown::HashMap` and `indexmap::IndexMap`.

use std::{
    borrow::Borrow,
    hash::{BuildHasher, BuildHasherDefault, Hash},
};

use auto_hash_map::{
    BackingListStorage, BackingMapIter, BackingMapStorage, MAX_USEFUL_LINEAR_SCAN, RawAutoMap,
    RawAutoSet, TinyVec,
    map::{ListIter, ListIterMut, ListValues, ListValuesMut},
    storage::MapEntry,
};
use rustc_hash::FxHasher;

/// An unordered map storage that keeps its entries in a `Vec` and finds them by linear scan.
#[derive(Clone)]
pub struct LinearMap<K, V, H> {
    entries: Vec<(K, V)>,
    /// Not needed for linear scans, only kept to show where a real map would store it.
    _hasher: H,
}

impl<K: Eq, V, H> LinearMap<K, V, H> {
    fn position<Q>(&self, key: &Q) -> Option<usize>
    where
        K: Borrow<Q>,
        Q: Eq + ?Sized,
    {
        self.entries.iter().position(|(k, _)| k.borrow() == key)
    }
}

pub struct Iter<'a, K, V>(std::slice::Iter<'a, (K, V)>);

impl<'a, K, V> Iterator for Iter<'a, K, V> {
    type Item = (&'a K, &'a V);
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, v)| (k, v))
    }
}

impl<K, V> Clone for Iter<'_, K, V> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<'a, K, V> BackingMapIter for Iter<'a, K, V> {
    type List = ListIter<'a, K, V>;
}

pub struct IterMut<'a, K, V>(std::slice::IterMut<'a, (K, V)>);

impl<'a, K, V> Iterator for IterMut<'a, K, V> {
    type Item = (&'a K, &'a mut V);
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(k, v)| (&*k, v))
    }
}

impl<'a, K, V> BackingMapIter for IterMut<'a, K, V> {
    type List = ListIterMut<'a, K, V>;
}

pub struct Values<'a, K, V>(std::slice::Iter<'a, (K, V)>);

impl<'a, K, V> Iterator for Values<'a, K, V> {
    type Item = &'a V;
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(_, v)| v)
    }
}

impl<'a, K, V> BackingMapIter for Values<'a, K, V> {
    type List = ListValues<'a, K, V>;
}

pub struct ValuesMut<'a, K, V>(std::slice::IterMut<'a, (K, V)>);

impl<'a, K, V> Iterator for ValuesMut<'a, K, V> {
    type Item = &'a mut V;
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(|(_, v)| v)
    }
}

impl<'a, K, V> BackingMapIter for ValuesMut<'a, K, V> {
    type List = ListValuesMut<'a, K, V>;
}

pub struct ExtractIf<'a, K, V, F> {
    entries: &'a mut Vec<(K, V)>,
    index: usize,
    f: F,
}

impl<K, V, F: FnMut(&K, &mut V) -> bool> Iterator for ExtractIf<'_, K, V, F> {
    type Item = (K, V);
    fn next(&mut self) -> Option<Self::Item> {
        while self.index < self.entries.len() {
            let (k, v) = &mut self.entries[self.index];
            if (self.f)(k, v) {
                return Some(self.entries.swap_remove(self.index));
            }
            self.index += 1;
        }
        None
    }
}

pub struct Occupied<'a, K, V> {
    entries: &'a mut Vec<(K, V)>,
    index: usize,
}

pub struct Vacant<'a, K, V> {
    entries: &'a mut Vec<(K, V)>,
    key: K,
}

impl<K, V, H> BackingMapStorage<K, V> for LinearMap<K, V, H> {
    type Hasher = H;

    const UNORDERED: bool = true;

    type IntoIter = std::vec::IntoIter<(K, V)>;
    type IntoValues = std::iter::Map<std::vec::IntoIter<(K, V)>, fn((K, V)) -> V>;
    type Iter<'a>
        = Iter<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type IterMut<'a>
        = IterMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Values<'a>
        = Values<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type ValuesMut<'a>
        = ValuesMut<'a, K, V>
    where
        Self: 'a,
        K: 'a,
        V: 'a;
    type Drain<'a>
        = std::vec::Drain<'a, (K, V)>
    where
        Self: 'a;
    type ExtractIf<'a, F>
        = ExtractIf<'a, K, V, F>
    where
        Self: 'a,
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool;
    type Occupied<'a>
        = Occupied<'a, K, V>
    where
        Self: 'a;
    type Vacant<'a>
        = Vacant<'a, K, V>
    where
        Self: 'a;
    type RawOccupied<'a>
        = Occupied<'a, K, V>
    where
        Self: 'a;
    type RawVacant<'a>
        = &'a mut Vec<(K, V)>
    where
        Self: 'a;

    fn with_capacity_and_hasher(capacity: usize, hasher: H) -> Self {
        Self {
            entries: Vec::with_capacity(capacity),
            _hasher: hasher,
        }
    }
    fn len(&self) -> usize {
        self.entries.len()
    }
    fn capacity(&self) -> usize {
        self.entries.capacity()
    }
    fn clear(&mut self) {
        self.entries.clear()
    }
    fn iter<'a>(&'a self) -> Self::Iter<'a> {
        Iter(self.entries.iter())
    }
    fn iter_mut<'a>(&'a mut self) -> Self::IterMut<'a> {
        IterMut(self.entries.iter_mut())
    }
    fn values<'a>(&'a self) -> Self::Values<'a> {
        Values(self.entries.iter())
    }
    fn values_mut<'a>(&'a mut self) -> Self::ValuesMut<'a> {
        ValuesMut(self.entries.iter_mut())
    }
    fn into_entries(self) -> Self::IntoIter {
        self.entries.into_iter()
    }
    fn into_values(self) -> Self::IntoValues {
        fn value<K, V>((_, v): (K, V)) -> V {
            v
        }
        self.entries.into_iter().map(value as fn((K, V)) -> V)
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        self.entries.drain(..)
    }
    fn retain<F: FnMut(&K, &mut V) -> bool>(&mut self, mut f: F) {
        self.entries.retain_mut(|(k, v)| f(k, v))
    }
    fn extract_if<'a, F>(&'a mut self, f: F) -> Self::ExtractIf<'a, F>
    where
        K: 'a,
        V: 'a,
        F: FnMut(&K, &mut V) -> bool,
    {
        ExtractIf {
            entries: &mut self.entries,
            index: 0,
            f,
        }
    }

    fn insert(&mut self, key: K, value: V) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match self.position(&key) {
            Some(index) => Some(std::mem::replace(&mut self.entries[index].1, value)),
            None => {
                self.entries.push((key, value));
                None
            }
        }
    }
    fn remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        let index = self.position(key)?;
        Some(self.entries.swap_remove(index).1)
    }
    fn swap_remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        self.remove(key)
    }
    fn extend(&mut self, iter: impl Iterator<Item = (K, V)>)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        for (k, v) in iter {
            self.insert(k, v);
        }
    }
    fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        self.position(key).map(|index| &self.entries[index].1)
    }
    fn get_mut(&mut self, key: &K) -> Option<&mut V>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        let index = self.position(key)?;
        Some(&mut self.entries[index].1)
    }
    fn contains_key(&self, key: &K) -> bool
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        self.position(key).is_some()
    }
    fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        self.entries.shrink_to_fit()
    }

    fn entry(&mut self, key: K) -> MapEntry<Self::Occupied<'_>, Self::Vacant<'_>>
    where
        K: Eq + Hash,
        H: BuildHasher,
    {
        match self.position(&key) {
            Some(index) => MapEntry::Occupied(Occupied {
                entries: &mut self.entries,
                index,
            }),
            None => MapEntry::Vacant(Vacant {
                entries: &mut self.entries,
                key,
            }),
        }
    }
    fn occupied_get_mut<'e, 'a>(entry: &'e mut Self::Occupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        &mut entry.entries[entry.index].1
    }
    fn occupied_into_mut<'a>(entry: Self::Occupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        &mut entry.entries[entry.index].1
    }
    fn occupied_remove<'a>(entry: Self::Occupied<'a>) -> V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.entries.swap_remove(entry.index).1
    }
    fn occupied_replace_entry_with<'a>(
        entry: Self::Occupied<'a>,
        func: impl FnOnce(&K, V) -> Option<V>,
    ) where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        let (key, value) = entry.entries.swap_remove(entry.index);
        if let Some(value) = func(&key, value) {
            entry.entries.push((key, value));
            let last = entry.entries.len() - 1;
            entry.entries.swap(entry.index, last);
        }
    }
    fn vacant_insert<'a>(entry: Self::Vacant<'a>, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.entries.push((entry.key, value));
        &mut entry.entries.last_mut().unwrap().1
    }

    fn raw_entry_mut<Q>(&mut self, key: &Q) -> MapEntry<Self::RawOccupied<'_>, Self::RawVacant<'_>>
    where
        K: Eq + Hash + Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        H: BuildHasher,
    {
        match self.position(key) {
            Some(index) => MapEntry::Occupied(Occupied {
                entries: &mut self.entries,
                index,
            }),
            None => MapEntry::Vacant(&mut self.entries),
        }
    }
    fn raw_occupied_get_mut<'e, 'a>(entry: &'e mut Self::RawOccupied<'a>) -> &'e mut V
    where
        Self: 'a,
    {
        &mut entry.entries[entry.index].1
    }
    fn raw_occupied_into_mut<'a>(entry: Self::RawOccupied<'a>) -> &'a mut V
    where
        Self: 'a,
    {
        &mut entry.entries[entry.index].1
    }
    fn raw_occupied_remove<'a>(entry: Self::RawOccupied<'a>) -> V
    where
        Self: 'a,
    {
        entry.entries.swap_remove(entry.index).1
    }
    fn raw_vacant_insert<'a>(entry: Self::RawVacant<'a>, key: K, value: V) -> &'a mut V
    where
        Self: 'a,
        K: Eq + Hash,
        H: BuildHasher,
    {
        entry.push((key, value));
        &mut entry.last_mut().unwrap().1
    }

    fn eq<L>(a: &RawAutoMap<K, V, Self, L>, b: &RawAutoMap<K, V, Self, L>) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
        L: BackingListStorage<(K, V)>,
    {
        a.len() == b.len() && a.iter().all(|(k, v)| b.get(k) == Some(v))
    }
}

type Fx = BuildHasherDefault<FxHasher>;
type List<T> = TinyVec<T, 0, MAX_USEFUL_LINEAR_SCAN>;
type LinearAutoMap<K, V> = RawAutoMap<K, V, LinearMap<K, V, Fx>, List<(K, V)>>;
type LinearAutoSet<K> = RawAutoSet<K, LinearMap<K, (), Fx>, List<(K, ())>>;

fn sorted<T: Ord>(mut items: Vec<T>) -> Vec<T> {
    items.sort();
    items
}

fn is_map<K, V, M, L>(map: &RawAutoMap<K, V, M, L>) -> bool {
    matches!(map, RawAutoMap::Map(..))
}

fn keys(map: &LinearAutoMap<u32, u32>) -> Vec<u32> {
    sorted(map.iter().map(|(k, _)| *k).collect())
}

#[test]
fn constructors() {
    let map = LinearAutoMap::<u32, u32>::new();
    assert!(!is_map(&map));
    assert!(map.is_empty());
    assert!(!is_map(&LinearAutoMap::<u32, u32>::with_capacity(3)));
    let map = LinearAutoMap::<u32, u32>::with_capacity(MAX_USEFUL_LINEAR_SCAN * 2);
    assert!(is_map(&map));
    assert!(map.is_empty());
    assert!(LinearAutoSet::<u32>::new().is_empty());
    assert!(LinearAutoSet::<u32>::with_capacity(MAX_USEFUL_LINEAR_SCAN * 2).is_empty());
}

#[test]
fn insert_get_remove_convert() {
    let mut map = LinearAutoMap::<u32, u32>::new();
    let n = MAX_USEFUL_LINEAR_SCAN as u32 * 2;
    for i in 0..n {
        assert_eq!(map.insert(i, i * 10), None);
        assert_eq!(is_map(&map), i as usize >= MAX_USEFUL_LINEAR_SCAN);
    }
    assert_eq!(map.insert(3, 33), Some(30));
    assert_eq!(map.get(&3), Some(&33));
    assert_eq!(map.get(&n), None);
    *map.get_mut(&4).unwrap() = 44;
    assert!(map.contains_key(&4));
    assert_eq!(map.len(), n as usize);

    assert_eq!(map.remove(&3), Some(33));
    assert_eq!(map.swap_remove(&4), Some(44));
    assert_eq!(map.remove(&3), None);
    assert_eq!(map.len(), n as usize - 2);

    // Removals don't convert back, shrinking does.
    for i in 5..n {
        map.remove(&i);
    }
    assert!(is_map(&map));
    map.shrink_to_fit();
    assert!(!is_map(&map));
    assert_eq!(keys(&map), vec![0, 1, 2]);
}

#[test]
fn entries() {
    for n in [5, MAX_USEFUL_LINEAR_SCAN * 2] {
        let mut map: LinearAutoMap<u32, u32> = (0..n as u32).map(|i| (i, i)).collect();
        *map.entry(1).or_insert(100) += 1;
        *map.entry(1000).or_insert(100) += 1;
        assert_eq!(map.get(&1), Some(&2));
        assert_eq!(map.get(&1000), Some(&101));

        match map.raw_entry_mut(&2) {
            auto_hash_map::map::RawEntry::Occupied(entry) => {
                assert_eq!(entry.remove(), 2);
            }
            auto_hash_map::map::RawEntry::Vacant(_) => panic!("2 is present"),
        }
        match map.raw_entry_mut(&2000) {
            auto_hash_map::map::RawEntry::Occupied(_) => panic!("2000 is absent"),
            auto_hash_map::map::RawEntry::Vacant(entry) => {
                *entry.insert(2000, 7) += 1;
            }
        }
        assert_eq!(map.get(&2000), Some(&8));
        assert_eq!(map.get(&2), None);
        assert_eq!(map.len(), n + 1);
    }

    // A vacant entry insert converts the full list into a map.
    let mut map: LinearAutoMap<u32, u32> =
        (0..MAX_USEFUL_LINEAR_SCAN as u32).map(|i| (i, i)).collect();
    assert!(!is_map(&map));
    map.entry(1000).or_insert(1);
    assert!(is_map(&map));
    assert_eq!(map.len(), MAX_USEFUL_LINEAR_SCAN + 1);
}

#[test]
fn extract_if() {
    for n in [10u32, MAX_USEFUL_LINEAR_SCAN as u32 * 2] {
        let mut map: LinearAutoMap<u32, u32> = (0..n).map(|i| (i, i)).collect();
        let extracted = sorted(map.extract_if(|k, _| k % 2 == 0).collect::<Vec<_>>());
        assert_eq!(
            extracted,
            (0..n).step_by(2).map(|i| (i, i)).collect::<Vec<_>>()
        );
        assert_eq!(keys(&map), (1..n).step_by(2).collect::<Vec<_>>());
    }
}

#[test]
fn iterators_retain_eq() {
    for n in [5u32, MAX_USEFUL_LINEAR_SCAN as u32 * 2] {
        let mut map: LinearAutoMap<u32, u32> = (0..n).map(|i| (i, i)).collect();
        let expected: Vec<(u32, u32)> = (0..n).map(|i| (i, i)).collect();
        assert_eq!(
            sorted(map.iter().map(|(k, v)| (*k, *v)).collect()),
            expected
        );
        assert_eq!(
            sorted(map.iter().fold(Vec::new(), |mut items, (k, v)| {
                items.push((*k, *v));
                items
            })),
            expected
        );
        assert_eq!(map.values().sum::<u32>(), (0..n).sum::<u32>());
        for (_, v) in map.iter_mut() {
            *v += 1;
        }
        for v in map.values_mut() {
            *v += 1;
        }
        assert_eq!(map.values().sum::<u32>(), (0..n).sum::<u32>() + 2 * n);

        map.retain(|k, _| k % 3 != 0);
        assert!(keys(&map).iter().all(|k| k % 3 != 0));

        let reversed: LinearAutoMap<u32, u32> = map.iter().map(|(k, v)| (*k, *v)).rev_collect();
        assert_eq!(map, reversed);
        let mut other = reversed.clone();
        other.insert(n + 1, 0);
        assert_ne!(map, other);

        let len = map.len();
        assert_eq!(map.clone().into_iter().count(), len);
        assert_eq!(map.clone().into_values().count(), len);
    }
}

#[test]
fn set() {
    let n = MAX_USEFUL_LINEAR_SCAN as u32 * 2;
    let mut set = LinearAutoSet::<u32>::new();
    for i in 0..n {
        assert!(set.insert(i));
    }
    assert!(!set.insert(0));
    assert!(set.contains(&5));
    assert!(set.remove(&5));
    assert!(set.swap_remove(&6));
    assert_eq!(set.len(), n as usize - 2);
    let reversed: LinearAutoSet<u32> = set
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    assert_eq!(set, reversed);
    assert_eq!(
        sorted(set.into_iter().collect()),
        (0..n).filter(|i| *i != 5 && *i != 6).collect::<Vec<_>>()
    );
}

/// Collects items in reverse order, to build an equal map with a different insertion order.
trait RevCollect: Iterator + Sized {
    fn rev_collect<C: FromIterator<Self::Item>>(self) -> C {
        let mut items: Vec<_> = self.collect();
        items.reverse();
        items.into_iter().collect()
    }
}

impl<I: Iterator> RevCollect for I {}
