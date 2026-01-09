use std::{
    collections::{HashMap, HashSet},
    hash::{BuildHasher, Hash},
};

use indexmap::{IndexMap, IndexSet};
use smallvec::SmallVec;

pub trait Keyed {
    type Key;
    type Value;

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]>;
    fn get(&self, key: &Self::Key) -> Option<&Self::Value>;
    fn contains_key(&self, key: &Self::Key) -> bool {
        self.get(key).is_some()
    }
}

impl<K: Eq + Hash, V: PartialEq, H: BuildHasher> Keyed for HashMap<K, V, H> {
    type Key = K;
    type Value = V;

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
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

        different_keys
    }

    fn get(&self, key: &Self::Key) -> Option<&Self::Value> {
        self.get(key)
    }

    fn contains_key(&self, key: &Self::Key) -> bool {
        self.contains_key(key)
    }
}

impl<K: Eq + Hash, V: PartialEq, H: BuildHasher> Keyed for IndexMap<K, V, H> {
    type Key = K;
    type Value = V;

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
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

        different_keys
    }

    fn get(&self, key: &Self::Key) -> Option<&Self::Value> {
        self.get(key)
    }

    fn contains_key(&self, key: &Self::Key) -> bool {
        self.contains_key(key)
    }
}

impl<K: Eq + Hash, H: BuildHasher> Keyed for HashSet<K, H> {
    type Key = K;
    type Value = ();

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
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

        different_keys
    }

    fn get(&self, key: &Self::Key) -> Option<&Self::Value> {
        if self.contains(key) { Some(&()) } else { None }
    }

    fn contains_key(&self, key: &Self::Key) -> bool {
        self.contains(key)
    }
}

impl<K: Eq + Hash, H: BuildHasher> Keyed for IndexSet<K, H> {
    type Key = K;
    type Value = ();

    fn different_keys<'l>(&'l self, other: &'l Self) -> SmallVec<[&'l Self::Key; 2]> {
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

        different_keys
    }

    fn get(&self, key: &Self::Key) -> Option<&Self::Value> {
        if self.contains(key) { Some(&()) } else { None }
    }

    fn contains_key(&self, key: &Self::Key) -> bool {
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

    fn assert_diff<T: Keyed>(a: &T, b: &T, expected: &[&T::Key])
    where
        T::Key: std::fmt::Debug + PartialEq,
    {
        let diffs = a.different_keys(b);
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
