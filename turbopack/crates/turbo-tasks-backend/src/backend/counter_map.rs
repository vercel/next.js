use std::{
    hash::{BuildHasherDefault, Hash},
    ops::{Add, AddAssign, Sub},
};

use auto_hash_map::{AutoMap, map::Entry};
use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};
use rustc_hash::FxHasher;

type InnerMap<K, V> = AutoMap<K, V, BuildHasherDefault<FxHasher>, 1>;

/// A map optimized for reference counting, backed by AutoMap.
///
/// Entries are automatically removed when their count reaches zero.
/// This provides memory-efficient storage for sparse counter data.
#[derive(Debug, Clone)]
pub struct CounterMap<K, V>(InnerMap<K, V>);

impl<K, V> Default for CounterMap<K, V> {
    fn default() -> Self {
        Self(InnerMap::default())
    }
}

impl<K: Eq + Hash, V: Eq> PartialEq for CounterMap<K, V> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl<K: Encode, V: Encode> Encode for CounterMap<K, V> {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.0.encode(encoder)
    }
}

impl<Context, K, V> Decode<Context> for CounterMap<K, V>
where
    K: Decode<Context> + Eq + Hash,
    V: Decode<Context>,
{
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self(InnerMap::decode(decoder)?))
    }
}

/// Trait for counter value types that support the required operations.
pub trait CounterValue:
    Copy + Default + PartialEq + PartialOrd + Add<Output = Self> + AddAssign + Sub<Output = Self>
{
    /// Check if this value is zero.
    fn is_zero(&self) -> bool;

    /// Check if this value is positive (> 0).
    fn is_positive(&self) -> bool;
}

impl CounterValue for u32 {
    fn is_zero(&self) -> bool {
        *self == 0
    }

    fn is_positive(&self) -> bool {
        *self > 0
    }
}

impl CounterValue for i32 {
    fn is_zero(&self) -> bool {
        *self == 0
    }

    fn is_positive(&self) -> bool {
        *self > 0
    }
}

impl<K, V> CounterMap<K, V> {
    pub fn new() -> Self {
        Self(AutoMap::default())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn shrink_to_fit(&mut self)
    where
        K: Eq + Hash,
    {
        self.0.shrink_to_fit();
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn get(&self, key: &K) -> Option<&V>
    where
        K: Eq + Hash,
    {
        self.0.get(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&K, &V)> {
        self.0.iter()
    }

    pub fn remove(&mut self, key: &K) -> Option<V>
    where
        K: Eq + Hash,
    {
        self.0.remove(key)
    }
}

impl<K: Hash + Eq, V: CounterValue> CounterMap<K, V> {
    /// Insert a key-value pair. Panics if value is zero (invariant: zero values are not stored).
    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        debug_assert!(
            !value.is_zero(),
            "CounterMap invariant violated: cannot insert zero value"
        );
        self.0.insert(key, value)
    }

    /// Update a counter by the given delta, returning `true` if the count
    /// crossed zero (became zero or became non-zero).
    ///
    /// This is useful for tracking state transitions where crossing zero
    /// indicates a significant change (e.g., first reference added or last
    /// reference removed).
    pub fn update_count(&mut self, key: K, delta: V) -> bool {
        match self.0.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get_mut();
                // Invariant: we never store zero values, so any existing entry must be non-zero
                debug_assert!(
                    !old.is_zero(),
                    "CounterMap invariant violated: zero value stored"
                );
                let new = old + delta;
                if new.is_zero() {
                    e.remove();
                    true // crossed from non-zero to zero
                } else {
                    *e.get_mut() = new;
                    false // stayed non-zero
                }
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                    true // crossed from zero to non-zero
                } else {
                    false
                }
            }
        }
    }

    /// Update a counter by the given delta and return the new value.
    pub fn update_and_get(&mut self, key: K, delta: V) -> V {
        match self.0.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get_mut();
                // Invariant: we never store zero values, so any existing entry must be non-zero
                debug_assert!(
                    !old.is_zero(),
                    "CounterMap invariant violated: zero value stored"
                );
                let new_value = old + delta;
                if new_value.is_zero() {
                    e.remove();
                } else {
                    *e.get_mut() = new_value;
                }
                new_value
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                }
                delta
            }
        }
    }

    /// Update a counter using a closure that receives the current value
    /// (or None if not present) and returns the new value (or None to remove).
    pub fn update_with<F>(&mut self, key: K, f: F)
    where
        F: FnOnce(Option<V>) -> Option<V>,
    {
        match self.0.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get_mut();
                // Invariant: we never store zero values, so any existing entry must be non-zero
                debug_assert!(
                    !old.is_zero(),
                    "CounterMap invariant violated: zero value stored"
                );
                match f(Some(old)) {
                    Some(new) => {
                        *e.get_mut() = new;
                    }
                    None => {
                        e.remove();
                    }
                }
            }
            Entry::Vacant(e) => {
                if let Some(new) = f(None) {
                    e.insert(new);
                }
            }
        }
    }

    /// Add a new entry, panicking if the entry already exists.
    pub fn add_entry(&mut self, key: K, value: V) {
        let old = self.0.insert(key, value);
        assert!(old.is_none(), "Entry already exists");
    }

    /// Update a signed counter by the given delta, returning `true` if the count
    /// crossed the positive boundary (became positive or became non-positive).
    ///
    /// This is useful for tracking collectibles where positive counts indicate
    /// presence and non-positive counts indicate absence.
    pub fn update_positive_crossing(&mut self, key: K, delta: V) -> bool {
        match self.0.entry(key) {
            Entry::Occupied(mut e) => {
                let old = *e.get_mut();
                // Invariant: we never store zero values, so any existing entry must be non-zero
                debug_assert!(
                    !old.is_zero(),
                    "CounterMap invariant violated: zero value stored"
                );
                let new = old + delta;
                let state_change = old.is_positive() != new.is_positive();
                if new.is_zero() {
                    e.remove();
                } else {
                    *e.get_mut() = new;
                }
                state_change
            }
            Entry::Vacant(e) => {
                if !delta.is_zero() {
                    e.insert(delta);
                    delta.is_positive()
                } else {
                    false
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_count_new_entry() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        // Adding new entry crosses zero (from nothing to something)
        assert!(map.update_count(1, 5));
        assert_eq!(map.get(&1), Some(&5));
    }

    #[test]
    fn test_update_count_increment() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_count(1, 5);
        // Incrementing existing entry doesn't cross zero
        assert!(!map.update_count(1, 3));
        assert_eq!(map.get(&1), Some(&8));
    }

    #[test]
    fn test_update_count_removal_on_zero() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        map.update_count(1, 5);
        // Subtracting to zero removes entry and crosses zero
        assert!(map.update_count(1, -5));
        assert!(map.is_empty());
        assert_eq!(map.get(&1), None);
    }

    #[test]
    fn test_update_count_zero_delta_on_empty() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        // Adding zero to non-existent entry doesn't create it
        assert!(!map.update_count(1, 0));
        assert!(map.is_empty());
    }

    #[test]
    fn test_update_and_get_new_entry() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        assert_eq!(map.update_and_get(1, 5), 5);
        assert_eq!(map.get(&1), Some(&5));
    }

    #[test]
    fn test_update_and_get_increment() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_and_get(1, 5);
        assert_eq!(map.update_and_get(1, 3), 8);
        assert_eq!(map.get(&1), Some(&8));
    }

    #[test]
    fn test_update_and_get_removal() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        map.update_and_get(1, 5);
        assert_eq!(map.update_and_get(1, -5), 0);
        assert!(map.is_empty());
    }

    #[test]
    fn test_add_entry() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.add_entry(1, 10);
        assert_eq!(map.get(&1), Some(&10));
    }

    #[test]
    #[should_panic(expected = "Entry already exists")]
    fn test_add_entry_panics_on_duplicate() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.add_entry(1, 10);
        map.add_entry(1, 20); // Should panic
    }

    #[test]
    fn test_update_positive_crossing_new_positive() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        // From nothing to positive - crosses positive boundary
        assert!(map.update_positive_crossing(1, 5));
        assert_eq!(map.get(&1), Some(&5));
    }

    #[test]
    fn test_update_positive_crossing_new_negative() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        // From nothing to negative - doesn't cross positive boundary
        assert!(!map.update_positive_crossing(1, -5));
        assert_eq!(map.get(&1), Some(&-5));
    }

    #[test]
    fn test_update_positive_crossing_stay_positive() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        map.update_positive_crossing(1, 5);
        // Staying positive doesn't cross boundary
        assert!(!map.update_positive_crossing(1, 3));
        assert_eq!(map.get(&1), Some(&8));
    }

    #[test]
    fn test_update_positive_crossing_to_non_positive() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        map.update_positive_crossing(1, 5);
        // Crossing to non-positive
        assert!(map.update_positive_crossing(1, -8));
        assert_eq!(map.get(&1), Some(&-3));
    }

    #[test]
    fn test_update_positive_crossing_to_zero_removes() {
        let mut map: CounterMap<u32, i32> = CounterMap::new();
        map.update_positive_crossing(1, 5);
        // Crossing to zero removes and crosses boundary
        assert!(map.update_positive_crossing(1, -5));
        assert!(map.is_empty());
    }

    #[test]
    fn test_update_with_create() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_with(1, |_| Some(10));
        assert_eq!(map.get(&1), Some(&10));
    }

    #[test]
    fn test_update_with_modify() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_with(1, |_| Some(10));
        map.update_with(1, |v| v.map(|x| x + 5));
        assert_eq!(map.get(&1), Some(&15));
    }

    #[test]
    fn test_update_with_remove() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_with(1, |_| Some(10));
        map.update_with(1, |_| None);
        assert!(map.is_empty());
    }

    #[test]
    fn test_update_with_no_op() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_with(1, |_| None);
        assert!(map.is_empty());
    }

    #[test]
    fn test_len_and_is_empty() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        assert!(map.is_empty());
        assert_eq!(map.len(), 0);

        map.update_count(1, 5);
        assert!(!map.is_empty());
        assert_eq!(map.len(), 1);

        map.update_count(2, 10);
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn test_iter() {
        let mut map: CounterMap<u32, u32> = CounterMap::new();
        map.update_count(1, 5);
        map.update_count(2, 10);

        let entries: Vec<_> = map.iter().collect();
        assert_eq!(entries.len(), 2);
        assert!(entries.contains(&(&1, &5)));
        assert!(entries.contains(&(&2, &10)));
    }
}
