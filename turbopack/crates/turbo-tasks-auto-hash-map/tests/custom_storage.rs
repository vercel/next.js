//! A third map storage, implemented outside of the crate through the public API only. This
//! checks that [`BackingMapStorage`] is open for other map types than the built-in
//! `hashbrown::HashMap` and `indexmap::IndexMap`.

use std::{
    cell::{Cell, RefCell},
    hash::{BuildHasher, BuildHasherDefault, Hash},
    ops::{Deref, DerefMut},
    rc::Rc,
};

use auto_hash_map::{
    BackingListStorage, BackingMapIter, BackingMapStorage, Equivalent, MAX_USEFUL_LINEAR_SCAN,
    RawAutoMap, RawAutoSet, TinyVec,
    map::{ListIter, ListIterMut, ListValues, ListValuesMut},
    storage::{ListPredicate, MapEntry},
};
use rustc_hash::FxHasher;

thread_local! {
    /// The capacity of the last [`LinearMap::with_capacity_and_hasher`] call on this thread.
    static REQUESTED_CAPACITY: Cell<Option<usize>> = const { Cell::new(None) };
}

/// An unordered map storage that keeps its entries in a `Vec` and finds them by linear scan.
#[derive(Clone)]
pub struct LinearMap<K, V, H> {
    entries: Vec<(K, V)>,
    /// Not needed for linear scans, only kept to show where a real map would store it.
    _hasher: H,
}

impl<K, V, H> LinearMap<K, V, H> {
    fn position<Q>(&self, key: &Q) -> Option<usize>
    where
        Q: Equivalent<K> + ?Sized,
    {
        self.entries.iter().position(|(k, _)| key.equivalent(k))
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
        REQUESTED_CAPACITY.set(Some(capacity));
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
    fn remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        let index = self.position(key)?;
        Some(self.entries.swap_remove(index).1)
    }
    fn swap_remove<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
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
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        self.position(key).map(|index| &self.entries[index].1)
    }
    fn get_key_value<Q>(&self, key: &Q) -> Option<(&K, &V)>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        self.position(key).map(|index| {
            let (k, v) = &self.entries[index];
            (k, v)
        })
    }
    fn get_mut<Q>(&mut self, key: &Q) -> Option<&mut V>
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
        H: BuildHasher,
    {
        let index = self.position(key)?;
        Some(&mut self.entries[index].1)
    }
    fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
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
        K: Eq + Hash,
        Q: Hash + Equivalent<K> + ?Sized,
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

    fn eq(a: &Self, b: &Self) -> bool
    where
        K: Eq + Hash,
        V: PartialEq,
        H: BuildHasher,
    {
        a.len() == b.len()
            && a.entries
                .iter()
                .all(|(k, v)| b.position(k).is_some_and(|i| b.entries[i].1 == *v))
    }
}

type Fx = BuildHasherDefault<FxHasher>;
type List<T> = TinyVec<T, 0, MAX_USEFUL_LINEAR_SCAN>;
type LinearAutoMap<K, V> = RawAutoMap<K, V, LinearMap<K, V, Fx>, List<(K, V)>>;
type LinearAutoSet<K> = RawAutoSet<K, LinearMap<K, (), Fx>, List<(K, ())>>;

/// A list storage implemented outside of the crate with only the required methods, so the
/// provided ones (`retain`, `swap_retain`, `shrink_amortized`) use their default
/// implementations.
pub struct MiniList<T>(Vec<T>);

impl<T> Deref for MiniList<T> {
    type Target = [T];
    fn deref(&self) -> &[T] {
        &self.0
    }
}

impl<T> DerefMut for MiniList<T> {
    fn deref_mut(&mut self) -> &mut [T] {
        &mut self.0
    }
}

impl<T> IntoIterator for MiniList<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;
    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

/// A simple (O(n²)) extraction iterator, as an example of a list storage's own implementation.
pub struct MiniExtractIf<'a, T, P> {
    list: &'a mut Vec<T>,
    index: usize,
    pred: P,
}

impl<T, P: ListPredicate<T>> Iterator for MiniExtractIf<'_, T, P> {
    type Item = T;
    fn next(&mut self) -> Option<T> {
        while self.index < self.list.len() {
            if self.pred.test(&mut self.list[self.index]) {
                return Some(self.list.remove(self.index));
            }
            self.index += 1;
        }
        None
    }
}

impl<T> BackingListStorage<T> for MiniList<T> {
    type Drain<'a>
        = std::vec::Drain<'a, T>
    where
        Self: 'a;
    type ExtractIf<'a, P>
        = MiniExtractIf<'a, T, P>
    where
        Self: 'a,
        P: ListPredicate<T>;

    const EMPTY: Self = MiniList(Vec::new());

    fn with_capacity(capacity: usize) -> Self {
        MiniList(Vec::with_capacity(capacity))
    }
    fn capacity(&self) -> usize {
        self.0.capacity()
    }
    fn push(&mut self, value: T) {
        self.0.push(value)
    }
    fn insert(&mut self, index: usize, value: T) {
        self.0.insert(index, value)
    }
    fn swap_remove(&mut self, index: usize) -> T {
        self.0.swap_remove(index)
    }
    fn remove(&mut self, index: usize) -> T {
        self.0.remove(index)
    }
    fn clear(&mut self) {
        self.0.clear()
    }
    fn drain(&mut self) -> Self::Drain<'_> {
        self.0.drain(..)
    }
    fn extract_if<P: ListPredicate<T>>(&mut self, pred: P) -> Self::ExtractIf<'_, P> {
        MiniExtractIf {
            list: &mut self.0,
            index: 0,
            pred,
        }
    }
    fn shrink_to_fit(&mut self) {
        self.0.shrink_to_fit()
    }
}

type MiniAutoMap<K, V> = RawAutoMap<K, V, LinearMap<K, V, Fx>, MiniList<(K, V)>>;

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
fn conversion_reserves_capacity() {
    const MAX: usize = MAX_USEFUL_LINEAR_SCAN;
    let list = |n: u32| -> LinearAutoMap<u32, u32> {
        let mut map = LinearAutoMap::new();
        for i in 0..n {
            map.insert(i, i);
        }
        assert!(!is_map(&map));
        map
    };
    let start = 1000;

    // `extend` reserves room for the whole (exact size) iterator.
    for (len, n) in [(5, 40), (5, 28), (0, 33), (MAX as u32, 100)] {
        let mut map = list(len);
        REQUESTED_CAPACITY.set(None);
        map.extend((start..start + n).map(|i| (i, i)));
        assert!(is_map(&map));
        assert_eq!(
            REQUESTED_CAPACITY.get(),
            Some((2 * MAX).max(len as usize + n as usize)),
            "extend {n} items into a list of {len}"
        );
    }

    // Converting by a single insert keeps the default reservation.
    let mut map = list(MAX as u32);
    REQUESTED_CAPACITY.set(None);
    map.insert(start, 0);
    assert!(is_map(&map));
    assert_eq!(REQUESTED_CAPACITY.get(), Some(2 * MAX));
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

struct Tracked(u32, Rc<RefCell<Vec<u32>>>);

impl Drop for Tracked {
    fn drop(&mut self) {
        self.1.borrow_mut().push(self.0);
    }
}

fn tracked_list(n: u32, drops: &Rc<RefCell<Vec<u32>>>) -> MiniList<Tracked> {
    let mut list = MiniList::with_capacity(n as usize);
    for i in 0..n {
        list.push(Tracked(i, drops.clone()));
    }
    list
}

#[test]
fn default_retain() {
    let n = 20;
    let drops = Rc::new(RefCell::new(Vec::new()));
    let mut list = tracked_list(n, &drops);
    let mut visited = Vec::new();
    list.retain(|t| {
        visited.push(t.0);
        t.0 % 3 != 0
    });
    assert_eq!(visited, (0..n).collect::<Vec<_>>());
    let kept: Vec<u32> = (0..n).filter(|i| i % 3 != 0).collect();
    assert_eq!(list.iter().map(|t| t.0).collect::<Vec<_>>(), kept);
    assert_eq!(
        sorted(RefCell::borrow(&drops).clone()),
        (0..n).filter(|i| i % 3 == 0).collect::<Vec<_>>()
    );

    let mut visited = Vec::new();
    list.swap_retain(|t| {
        visited.push(t.0);
        t.0 % 2 != 0
    });
    assert_eq!(sorted(visited), kept);
    assert_eq!(
        sorted(list.iter().map(|t| t.0).collect()),
        kept.iter()
            .copied()
            .filter(|i| i % 2 != 0)
            .collect::<Vec<_>>()
    );
    drop(list);
    assert_eq!(
        sorted(RefCell::borrow(&drops).clone()),
        (0..n).collect::<Vec<_>>()
    );

    // Panics leave a valid list.
    for swap in [false, true] {
        let drops = Rc::new(RefCell::new(Vec::new()));
        let mut list = tracked_list(n, &drops);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let f = |t: &mut Tracked| {
                assert_ne!(t.0, n / 2, "predicate panic");
                t.0 % 2 == 0
            };
            if swap {
                list.swap_retain(f)
            } else {
                list.retain(f)
            }
        }));
        assert!(result.is_err());
        assert!(list.iter().all(|t| !RefCell::borrow(&drops).contains(&t.0)));
        drop(list);
        assert_eq!(
            sorted(RefCell::borrow(&drops).clone()),
            (0..n).collect::<Vec<_>>()
        );
    }
}

#[test]
fn map_with_external_list() {
    let n = MAX_USEFUL_LINEAR_SCAN as u32 * 2;
    let mut map: MiniAutoMap<u32, u32> = MiniAutoMap::with_hasher();
    for i in 0..n {
        map.insert(i, i);
        assert_eq!(is_map(&map), i as usize >= MAX_USEFUL_LINEAR_SCAN);
    }
    map.retain(|k, _| *k < 10);
    map.shrink_to_fit();
    assert!(!is_map(&map));
    map.retain(|k, _| k % 2 == 0);
    assert_eq!(map.len(), 5);
    let extracted: Vec<_> = map.extract_if(|k, _| *k < 4).collect();
    assert_eq!(sorted(extracted), vec![(0, 0), (2, 2)]);
    assert_eq!(sorted(map.iter().map(|(k, _)| *k).collect()), vec![4, 6, 8]);
    let other: MiniAutoMap<u32, u32> = [8, 4, 6].into_iter().map(|k| (k, k)).collect();
    assert_eq!(map, other);
}
