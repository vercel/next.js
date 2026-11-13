use std::{
    borrow::Borrow,
    collections::{HashMap, HashSet},
    hash::{BuildHasher, Hash},
};

use auto_hash_map::{OrderedAutoMap, OrderedAutoSet};
use indexmap::{Equivalent, IndexMap, IndexSet};
use smallvec::SmallVec;

/// Keyed comparison for keyed cells (`cell = "keyed"`).
pub trait KeyedEq {
    type Key;

    /// Compares two values key by key.
    ///
    /// Returns `None` when they are equal, so the cell keeps its old value. Otherwise returns
    /// `Some` with the keys that were added, removed or whose value changed: readers of these keys
    /// are invalidated, as are readers of the whole value. `Some` of no keys means that the values
    /// differ in a way no single key observes (e.g. only the order of an ordered map changed), so
    /// only readers of the whole value are invalidated.
    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>>;
}

/// `None` for no different keys, for collections whose equality is only their content.
fn non_empty<T>(keys: SmallVec<[T; 2]>) -> Option<SmallVec<[T; 2]>> {
    if keys.is_empty() { None } else { Some(keys) }
}

pub trait KeyedAccess<Q: ?Sized> {
    type Value;

    fn get(&self, key: &Q) -> Option<&Self::Value>;
    fn contains_key(&self, key: &Q) -> bool {
        self.get(key).is_some()
    }
}

impl<K: Eq + Hash, V: PartialEq, H: BuildHasher> KeyedEq for HashMap<K, V, H> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut different_keys = SmallVec::new();

        for (key, value) in self.iter() {
            if let Some(other_value) = HashMap::get(other, key) {
                if value != other_value {
                    different_keys.push(key);
                }
            } else {
                different_keys.push(key);
            }
        }

        if other.len() != self.len() || !different_keys.is_empty() {
            for key in other.keys() {
                if !self.contains_key(key) {
                    different_keys.push(key);
                }
            }
        }

        non_empty(different_keys)
    }
}

impl<K: Eq + Hash + Borrow<Q>, V, H: BuildHasher, Q: Eq + Hash + ?Sized> KeyedAccess<Q>
    for HashMap<K, V, H>
{
    type Value = V;

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        HashMap::get(self, key)
    }

    fn contains_key(&self, key: &Q) -> bool {
        HashMap::contains_key(self, key)
    }
}

impl<K: Eq + Hash, V: PartialEq, H: BuildHasher> KeyedEq for IndexMap<K, V, H> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut different_keys = SmallVec::new();

        for (key, value) in self.iter() {
            if let Some(other_value) = other.get(key) {
                if value != other_value {
                    different_keys.push(key);
                }
            } else {
                different_keys.push(key);
            }
        }

        if other.len() != self.len() || !different_keys.is_empty() {
            for key in other.keys() {
                if !self.contains_key(key) {
                    different_keys.push(key);
                }
            }
        }

        non_empty(different_keys)
    }
}

impl<K, V, H: BuildHasher, Q: Equivalent<K> + Hash + ?Sized> KeyedAccess<Q> for IndexMap<K, V, H> {
    type Value = V;

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        self.get(key)
    }

    fn contains_key(&self, key: &Q) -> bool {
        self.contains_key(key)
    }
}

impl<K: Eq + Hash, H: BuildHasher> KeyedEq for HashSet<K, H> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut different_keys = SmallVec::new();

        for key in self.iter() {
            if !other.contains(key) {
                different_keys.push(key);
            }
        }

        if other.len() != self.len() || !different_keys.is_empty() {
            for key in other.iter() {
                if !self.contains(key) {
                    different_keys.push(key);
                }
            }
        }

        non_empty(different_keys)
    }
}

impl<K: Eq + Hash + Borrow<Q>, Q: Eq + Hash + ?Sized, H: BuildHasher> KeyedAccess<Q>
    for HashSet<K, H>
{
    type Value = ();

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        if self.contains(key) { Some(&()) } else { None }
    }

    fn contains_key(&self, key: &Q) -> bool {
        self.contains(key)
    }
}

impl<K: Eq + Hash, H: BuildHasher> KeyedEq for IndexSet<K, H> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut different_keys = SmallVec::new();

        for key in self.iter() {
            if !other.contains(key) {
                different_keys.push(key);
            }
        }

        if other.len() != self.len() || !different_keys.is_empty() {
            for key in other.iter() {
                if !self.contains(key) {
                    different_keys.push(key);
                }
            }
        }

        non_empty(different_keys)
    }
}

impl<K, Q: Equivalent<K> + Hash + ?Sized, H: BuildHasher> KeyedAccess<Q> for IndexSet<K, H> {
    type Value = ();

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        if self.contains(key) { Some(&()) } else { None }
    }

    fn contains_key(&self, key: &Q) -> bool {
        self.contains(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn abc() -> [(&'static str, i32); 3] {
        [("a", 1), ("b", 2), ("c", 3)]
    }

    fn abd() -> [(&'static str, i32); 3] {
        [("a", 1), ("b", 22), ("d", 4)]
    }

    fn ab() -> [(&'static str, i32); 2] {
        [("a", 1), ("b", 2)]
    }

    fn abcde() -> [(&'static str, i32); 5] {
        [("a", 1), ("b", 2), ("c", 3), ("d", 4), ("e", 5)]
    }

    fn edcba() -> [(&'static str, i32); 5] {
        [("e", 5), ("d", 4), ("c", 3), ("b", 2), ("a", 1)]
    }

    fn assert_diff<T: KeyedEq>(a: &T, b: &T, expected: &[&T::Key])
    where
        T::Key: std::fmt::Debug + PartialEq,
    {
        let diffs = a.different_keys(b).unwrap_or_default();
        assert_eq!(a.different_keys(b).is_none(), expected.is_empty());
        assert_eq!(diffs.len(), expected.len());
        for key in expected {
            assert!(diffs.contains(key));
        }
    }

    #[test]
    fn test_hash_map_diff() {
        let map1 = HashMap::from(abc());
        let map2 = HashMap::from(abd());
        assert_diff(&map1, &map2, &[&"b", &"c", &"d"]);
    }

    #[test]
    fn test_index_map_diff() {
        let map1 = IndexMap::from(abc());
        let map2 = IndexMap::from(abd());
        assert_diff(&map1, &map2, &[&"b", &"c", &"d"]);
    }

    #[test]
    fn test_hash_map_equal() {
        let map1 = HashMap::from(abcde());
        let map2 = HashMap::from(edcba());
        assert_diff(&map1, &map2, &[]);
    }

    #[test]
    fn test_index_map_equal() {
        let map1 = IndexMap::from(abcde());
        let map2 = IndexMap::from(edcba());
        assert_diff(&map1, &map2, &[]);
    }

    #[test]
    fn test_hash_map_add_key() {
        let map1 = HashMap::from(ab());
        let map2 = HashMap::from(abc());
        assert_diff(&map1, &map2, &[&"c"]);
    }

    #[test]
    fn test_index_map_add_key() {
        let map1 = IndexMap::from(ab());
        let map2 = IndexMap::from(abc());
        assert_diff(&map1, &map2, &[&"c"]);
    }

    #[test]
    fn test_hash_map_remove_key() {
        let map1 = HashMap::from(abc());
        let map2 = HashMap::from(ab());
        assert_diff(&map1, &map2, &[&"c"]);
    }

    #[test]
    fn test_index_map_remove_key() {
        let map1 = IndexMap::from(abc());
        let map2 = IndexMap::from(ab());
        assert_diff(&map1, &map2, &[&"c"]);
    }
}

/// Like [`IndexMap`]'s impl, but equality is order sensitive: when both maps have the same
/// entries in a different order, no key is reported (`Some` of no keys). Readers of single keys
/// don't observe the order, only readers of the whole map do.
///
/// Both maps are first compared in lockstep up to the first differing entry, so equal maps take a
/// single pass without hash lookups. Only the remaining entries are looked up by key.
impl<K: Eq + Hash, V: PartialEq, H: BuildHasher, const I: usize> KeyedEq
    for OrderedAutoMap<K, V, H, I>
{
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut self_iter = self.iter();
        let mut other_iter = other.iter();
        let (self_first, other_first) = loop {
            match (self_iter.next(), other_iter.next()) {
                (None, None) => return None,
                (Some(a), Some(b)) if a == b => {}
                firsts => break firsts,
            }
        };

        // The common prefix has the same keys in both maps, and keys are unique, so a key of the
        // remaining entries is never in the prefix of the other map.
        let mut different_keys = SmallVec::new();
        for (key, value) in self_first.into_iter().chain(self_iter) {
            if other.get(key) != Some(value) {
                different_keys.push(key);
            }
        }
        for (key, _) in other_first.into_iter().chain(other_iter) {
            if !self.contains_key(key) {
                different_keys.push(key);
            }
        }
        // Empty when only the order of the remaining entries differs.
        Some(different_keys)
    }
}

impl<K, V, H, const I: usize, Q> KeyedAccess<Q> for OrderedAutoMap<K, V, H, I>
where
    K: Eq + Hash,
    H: BuildHasher,
    Q: Equivalent<K> + Hash + ?Sized,
{
    type Value = V;

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        OrderedAutoMap::get(self, key)
    }
}

/// Like [`IndexSet`]'s impl, but equality is order sensitive: when both sets have the same items
/// in a different order, no item is reported (`Some` of no items). Readers of single items don't
/// observe the order, only readers of the whole set do.
///
/// Like the [`OrderedAutoMap`] impl, the common prefix is compared in lockstep first.
impl<K: Eq + Hash, H: BuildHasher + Default, const I: usize> KeyedEq for OrderedAutoSet<K, H, I> {
    type Key = K;

    fn different_keys<'l>(&'l self, other: &'l Self) -> Option<SmallVec<[&'l Self::Key; 2]>> {
        let mut self_iter = self.iter();
        let mut other_iter = other.iter();
        let (self_first, other_first) = loop {
            match (self_iter.next(), other_iter.next()) {
                (None, None) => return None,
                (Some(a), Some(b)) if a == b => {}
                firsts => break firsts,
            }
        };

        let mut different_keys = SmallVec::new();
        for key in self_first.into_iter().chain(self_iter) {
            if !other.contains(key) {
                different_keys.push(key);
            }
        }
        for key in other_first.into_iter().chain(other_iter) {
            if !self.contains(key) {
                different_keys.push(key);
            }
        }
        // Empty when only the order of the remaining items differs.
        Some(different_keys)
    }
}

impl<K, H, const I: usize, Q> KeyedAccess<Q> for OrderedAutoSet<K, H, I>
where
    K: Eq + Hash,
    H: BuildHasher,
    Q: Equivalent<K> + Hash + ?Sized,
{
    type Value = ();

    fn get(&self, key: &Q) -> Option<&Self::Value> {
        if self.get_index_of(key).is_some() {
            Some(&())
        } else {
            None
        }
    }
}

#[cfg(test)]
mod ordered_tests {
    use auto_hash_map::{OrderedAutoMap, OrderedAutoSet};

    use super::{KeyedAccess, KeyedEq};

    #[test]
    fn ordered_equality_includes_order() {
        let a: OrderedAutoMap<u32, u32> = [(1, 10), (2, 20)].into_iter().collect();
        let b: OrderedAutoMap<u32, u32> = [(2, 20), (1, 10)].into_iter().collect();
        assert_ne!(a, b);
        assert_eq!(a, a.clone());

        let a: OrderedAutoSet<u32> = [1, 2].into_iter().collect();
        let b: OrderedAutoSet<u32> = [2, 1].into_iter().collect();
        assert_ne!(a, b);
        assert_eq!(a, a.clone());
    }

    #[test]
    fn keyed_eq_ignores_order_for_keys() {
        let no_keys: &[&u32] = &[];
        // 3 entries are a list, 100 entries a map.
        for n in [3u32, 100] {
            let a: OrderedAutoMap<u32, u32> = (1..=n).map(|i| (i, i * 10)).collect();
            assert_eq!(a.different_keys(&a.clone()), None);

            // Swap the positions of 2 and 3: not equal, but no key changed.
            let reordered: OrderedAutoMap<u32, u32> = [1, 3, 2]
                .into_iter()
                .chain(4..=n)
                .map(|i| (i, i * 10))
                .collect();
            assert_eq!(a.different_keys(&reordered).as_deref(), Some(no_keys));

            let changed: OrderedAutoMap<u32, u32> = (1..=n)
                .map(|i| (i, if i == 2 { 21 } else { i * 10 }))
                .collect();
            assert_eq!(a.different_keys(&changed).as_deref(), Some(&[&2][..]));

            // A changed value and a reorder only report the changed key.
            let changed_and_reordered: OrderedAutoMap<u32, u32> = [1, 3, 2]
                .into_iter()
                .chain(4..=n)
                .map(|i| (i, if i == 1 { 11 } else { i * 10 }))
                .collect();
            assert_eq!(
                a.different_keys(&changed_and_reordered).as_deref(),
                Some(&[&1][..])
            );

            let removed: OrderedAutoMap<u32, u32> =
                (1..=n).filter(|i| *i != 2).map(|i| (i, i * 10)).collect();
            assert_eq!(a.different_keys(&removed).as_deref(), Some(&[&2][..]));
            assert_eq!(removed.different_keys(&a).as_deref(), Some(&[&2][..]));

            let set: OrderedAutoSet<u32> = (1..=n).collect();
            let reordered_set: OrderedAutoSet<u32> = [3, 2, 1].into_iter().chain(4..=n).collect();
            assert_eq!(set.different_keys(&set.clone()), None);
            assert_eq!(set.different_keys(&reordered_set).as_deref(), Some(no_keys));
            let removed_set: OrderedAutoSet<u32> = (2..=n).collect();
            assert_eq!(set.different_keys(&removed_set).as_deref(), Some(&[&1][..]));
            let added_set: OrderedAutoSet<u32> = (0..=n).collect();
            assert_eq!(set.different_keys(&added_set).as_deref(), Some(&[&0][..]));

            // Differences after a common prefix.
            let last_changed: OrderedAutoMap<u32, u32> = (1..=n)
                .map(|i| (i, if i == n { 0 } else { i * 10 }))
                .collect();
            assert_eq!(a.different_keys(&last_changed).as_deref(), Some(&[&n][..]));
            let appended: OrderedAutoMap<u32, u32> = (1..=n + 1).map(|i| (i, i * 10)).collect();
            assert_eq!(
                a.different_keys(&appended).as_deref(),
                Some(&[&(n + 1)][..])
            );
            assert_eq!(
                appended.different_keys(&a).as_deref(),
                Some(&[&(n + 1)][..])
            );
            let appended_set: OrderedAutoSet<u32> = (1..=n + 1).collect();
            assert_eq!(
                set.different_keys(&appended_set).as_deref(),
                Some(&[&(n + 1)][..])
            );
            assert_eq!(
                appended_set.different_keys(&set).as_deref(),
                Some(&[&(n + 1)][..])
            );
            // A replaced last item reports both the removed and the added item.
            let replaced_set: OrderedAutoSet<u32> = (1..n).chain([n + 1]).collect();
            assert_eq!(
                set.different_keys(&replaced_set).as_deref(),
                Some(&[&n, &(n + 1)][..])
            );
        }

        let empty_map = OrderedAutoMap::<u32, u32>::default();
        assert_eq!(empty_map.different_keys(&empty_map.clone()), None);
        let empty_set = OrderedAutoSet::<u32>::default();
        assert_eq!(empty_set.different_keys(&empty_set.clone()), None);
    }

    #[test]
    fn keyed_eq_equal_ordered_values_do_not_hash() {
        use std::{
            cell::Cell,
            hash::{Hash, Hasher},
        };

        thread_local! {
            static HASHES: Cell<usize> = const { Cell::new(0) };
        }

        #[derive(Clone, Debug, PartialEq, Eq)]
        struct CountedHash(u32);

        impl Hash for CountedHash {
            fn hash<H: Hasher>(&self, state: &mut H) {
                HASHES.with(|hashes| hashes.set(hashes.get() + 1));
                self.0.hash(state);
            }
        }

        for n in [3u32, 100] {
            let map: OrderedAutoMap<CountedHash, u32> =
                (0..n).map(|i| (CountedHash(i), i)).collect();
            let map_copy = map.clone();
            let set: OrderedAutoSet<CountedHash> = (0..n).map(CountedHash).collect();
            let set_copy = set.clone();

            HASHES.with(|hashes| hashes.set(0));
            assert_eq!(map.different_keys(&map_copy), None);
            assert_eq!(set.different_keys(&set_copy), None);
            assert_eq!(HASHES.with(Cell::get), 0);
        }
    }

    #[test]
    fn keyed_access() {
        let map: OrderedAutoMap<u32, u32> = [(1, 10), (2, 20)].into_iter().collect();
        assert_eq!(KeyedAccess::get(&map, &2), Some(&20));
        assert!(!KeyedAccess::contains_key(&map, &3));
        let set: OrderedAutoSet<u32> = [1, 2].into_iter().collect();
        assert_eq!(KeyedAccess::get(&set, &1), Some(&()));
        assert!(!KeyedAccess::contains_key(&set, &3));
    }
}
