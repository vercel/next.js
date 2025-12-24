//! Specialized storage types optimized for different access patterns
//!
//! These types are designed to be used as building blocks for the task storage system,
//! providing efficient implementations for common patterns like:
//! - IndexedVec: O(1) access by integer index (for CellData)
//! - AutoSet: Re-exported from auto-hash-map crate (adaptive set with SmallVec->HashMap)
//! - CounterMap: Maps with efficient increment/decrement operations

use std::{
    hash::Hash,
    marker::PhantomData,
    ops::{AddAssign, SubAssign},
};

// Re-export AutoSet from auto-hash-map crate - it's already optimized and used throughout the
// codebase
pub use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;

// ============================================================================
// IndexedVec: Direct indexing storage
// ============================================================================

/// Trait for types that can provide an integer index for direct Vec access
pub trait IndexKey {
    fn index(&self) -> u32;
}

/// Efficient storage for items with continuous integer indices.
///
/// Uses a Vec with gaps (represented as None) for sparse data. Automatically
/// grows to accommodate any index. Optimized for cases where indices are
/// relatively dense and contiguous.
///
/// # Memory Characteristics
/// - Dense data (90%+ filled): Much better than HashMap (no hash overflow)
/// - Sparse data (<30% filled): May use more memory than HashMap
/// - Sweet spot: Contiguous or nearly-contiguous indices
#[derive(Debug, Clone)]
pub struct IndexedVec<K, V> {
    items: Vec<Option<V>>,
    count: usize,
    _phantom: PhantomData<K>,
}

// Manual Encode implementation
impl<K, V: Encode> Encode for IndexedVec<K, V> {
    fn encode<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        self.items.encode(encoder)?;
        self.count.encode(encoder)
    }
}

// Manual Decode implementation
impl<Context, K, V: Decode<Context>> Decode<Context> for IndexedVec<K, V> {
    fn decode<D: bincode::de::Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            items: Vec::decode(decoder)?,
            count: usize::decode(decoder)?,
            _phantom: PhantomData,
        })
    }
}

impl<'de, Context, K, V: bincode::BorrowDecode<'de, Context>> bincode::BorrowDecode<'de, Context>
    for IndexedVec<K, V>
{
    fn borrow_decode<D: bincode::de::BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            items: Vec::borrow_decode(decoder)?,
            count: usize::borrow_decode(decoder)?,
            _phantom: PhantomData,
        })
    }
}

impl<K: IndexKey, V> Default for IndexedVec<K, V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<K, V> IndexedVec<K, V>
where
    K: IndexKey,
{
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            count: 0,
            _phantom: PhantomData,
        }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            items: Vec::with_capacity(capacity),
            count: 0,
            _phantom: PhantomData,
        }
    }

    pub fn get(&self, key: &K) -> Option<&V> {
        let index = key.index() as usize;
        self.items.get(index).and_then(|opt| opt.as_ref())
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        let index = key.index() as usize;
        self.items.get_mut(index).and_then(|opt| opt.as_mut())
    }

    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        let index = key.index() as usize;

        // Grow Vec if needed
        if index >= self.items.len() {
            self.items.resize_with(index + 1, || None);
        }

        let old = self.items[index].replace(value);
        if old.is_none() {
            self.count += 1;
        }
        old
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        let index = key.index() as usize;
        if index < self.items.len() {
            let removed = self.items[index].take();
            if removed.is_some() {
                self.count -= 1;
            }
            removed
        } else {
            None
        }
    }

    pub fn contains_key(&self, key: &K) -> bool {
        let index = key.index() as usize;
        index < self.items.len() && self.items[index].is_some()
    }

    /// Iterate over (index, value) pairs
    pub fn iter(&self) -> impl Iterator<Item = (usize, &V)> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| opt.as_ref().map(|v| (idx, v)))
    }

    /// Iterate over mutable (index, value) pairs
    pub fn iter_mut(&mut self) -> impl Iterator<Item = (usize, &mut V)> {
        self.items
            .iter_mut()
            .enumerate()
            .filter_map(|(idx, opt)| opt.as_mut().map(|v| (idx, v)))
    }

    pub fn len(&self) -> usize {
        self.count
    }

    pub fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// Returns the maximum index that has been allocated (even if now empty)
    pub fn max_allocated_index(&self) -> Option<usize> {
        if self.items.is_empty() {
            None
        } else {
            Some(self.items.len() - 1)
        }
    }

    /// Shrinks to remove trailing None entries
    pub fn shrink_to_fit(&mut self) {
        // Remove trailing Nones
        while self.items.last().map_or(false, |opt| opt.is_none()) {
            self.items.pop();
        }
        self.items.shrink_to_fit();
    }

    /// Calculate density (percentage of filled slots)
    pub fn density(&self) -> f32 {
        if self.items.is_empty() {
            1.0
        } else {
            self.count as f32 / self.items.len() as f32
        }
    }
}

// Note: SmallSet has been replaced with AutoSet (re-exported above)
// AutoSet provides the same functionality but is already used throughout the codebase

// ============================================================================

// ============================================================================
// CounterMap: Efficient map with increment/decrement operations
// ============================================================================

/// A map optimized for counter operations (increment/decrement).
///
/// Automatically removes entries that reach zero, which is important for
/// tracking reference counts, dependency counts, etc.
///
/// # Features
/// - Automatic zero removal: Entries are removed when count reaches zero
/// - State change detection: Returns true when crossing zero boundary
/// - Efficient: Uses FxHashMap (faster than std HashMap for integer keys)
#[derive(Debug, Clone)]
pub struct CounterMap<K, V> {
    map: FxHashMap<K, V>,
}

// Manual Encode implementation
impl<K: Encode + Hash + Eq, V: Encode> Encode for CounterMap<K, V> {
    fn encode<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        self.map.encode(encoder)
    }
}

// Manual Decode implementation
impl<Context, K: Decode<Context> + Hash + Eq, V: Decode<Context>> Decode<Context>
    for CounterMap<K, V>
{
    fn decode<D: bincode::de::Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            map: FxHashMap::decode(decoder)?,
        })
    }
}

impl<
    'de,
    Context,
    K: bincode::BorrowDecode<'de, Context> + Hash + Eq,
    V: bincode::BorrowDecode<'de, Context>,
> bincode::BorrowDecode<'de, Context> for CounterMap<K, V>
{
    fn borrow_decode<D: bincode::de::BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            map: FxHashMap::borrow_decode(decoder)?,
        })
    }
}

impl<K: Hash + Eq + Clone, V: Default + PartialEq + PartialOrd + Copy> Default
    for CounterMap<K, V>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K, V> CounterMap<K, V>
where
    K: Hash + Eq + Clone,
    V: Default + PartialEq + PartialOrd + Copy,
{
    pub fn new() -> Self {
        Self {
            map: FxHashMap::default(),
        }
    }

    pub fn get(&self, key: &K) -> Option<V> {
        self.map.get(key).copied()
    }

    pub fn contains_key(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }

    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        if value == V::default() {
            self.map.remove(&key)
        } else {
            self.map.insert(key, value)
        }
    }

    pub fn remove(&mut self, key: &K) -> Option<V> {
        self.map.remove(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&K, V)> + '_ {
        self.map.iter().map(|(k, v)| (k, *v))
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn clear(&mut self) {
        self.map.clear()
    }

    pub fn shrink_to_fit(&mut self) {
        self.map.shrink_to_fit()
    }
}

impl<K, V> CounterMap<K, V>
where
    K: Hash + Eq + Clone,
    V: Default + PartialEq + PartialOrd + AddAssign + SubAssign + Copy,
{
    /// Update a counter by a delta value.
    ///
    /// Returns `true` if the counter crossed zero (either direction), which
    /// typically indicates a state change that needs to be handled.
    ///
    /// Automatically removes the entry if it reaches zero.
    pub fn update_count(&mut self, key: K, delta: V) -> bool {
        let entry = self.map.entry(key.clone());
        let old = entry.or_insert(V::default());
        let old_value = *old;

        if delta >= V::default() {
            *old += delta;
        } else {
            *old -= delta;
        }
        let new_value = *old;

        // Remove if reached zero
        if new_value == V::default() {
            self.map.remove(&key);
        }

        // Return true if crossed zero (state change)
        (old_value <= V::default() && new_value > V::default())
            || (old_value > V::default() && new_value <= V::default())
    }

    /// Increment a counter by one.
    ///
    /// Returns `true` if the counter crossed from zero to positive.
    pub fn increment(&mut self, key: K) -> bool
    where
        V: From<u8>,
    {
        self.update_count(key, V::from(1u8))
    }

    /// Decrement a counter by one.
    ///
    /// Returns `true` if the counter crossed from positive to zero.
    pub fn decrement(&mut self, key: K) -> bool
    where
        V: From<u8>,
    {
        let one = V::from(1u8);
        let mut delta = V::default();
        delta -= one;
        self.update_count(key, delta)
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::CellId;

    use super::*;

    impl IndexKey for u32 {
        fn index(&self) -> u32 {
            *self
        }
    }

    #[test]
    fn test_indexed_vec_basic() {
        let mut vec: IndexedVec<u32, String> = IndexedVec::new();

        assert!(vec.is_empty());
        assert_eq!(vec.len(), 0);

        vec.insert(0, "zero".to_string());
        vec.insert(2, "two".to_string());
        vec.insert(5, "five".to_string());

        assert_eq!(vec.len(), 3);
        assert_eq!(vec.get(&0), Some(&"zero".to_string()));
        assert_eq!(vec.get(&1), None);
        assert_eq!(vec.get(&2), Some(&"two".to_string()));
        assert_eq!(vec.get(&5), Some(&"five".to_string()));

        assert_eq!(vec.remove(&2), Some("two".to_string()));
        assert_eq!(vec.len(), 2);
        assert_eq!(vec.get(&2), None);
    }

    #[test]
    fn test_indexed_vec_density() {
        let mut vec: IndexedVec<u32, i32> = IndexedVec::new();

        vec.insert(0, 1);
        vec.insert(1, 2);
        vec.insert(2, 3);
        assert_eq!(vec.density(), 1.0);

        vec.insert(10, 11);
        // 4 items in 11 slots
        assert!(vec.density() < 0.5);
    }

    // Note: SmallSet tests removed - we now use AutoSet from auto-hash-map crate
    // which is already tested in its own crate

    #[test]
    fn test_counter_map_basic() {
        let mut map: CounterMap<String, i32> = CounterMap::new();

        assert!(map.is_empty());

        // First increment crosses zero
        assert!(map.update_count("a".to_string(), 1));
        assert_eq!(map.get(&"a".to_string()), Some(1));

        // Regular increment doesn't cross zero
        assert!(!map.update_count("a".to_string(), 1));
        assert_eq!(map.get(&"a".to_string()), Some(2));

        // Decrement back to zero and remove
        assert!(!map.update_count("a".to_string(), -1));
        assert!(map.update_count("a".to_string(), -1));
        assert_eq!(map.get(&"a".to_string()), None);
        assert!(map.is_empty());
    }

    #[test]
    fn test_counter_map_auto_remove() {
        let mut map: CounterMap<i32, i32> = CounterMap::new();

        map.update_count(1, 5);
        assert_eq!(map.len(), 1);

        map.update_count(1, -5);
        assert_eq!(map.len(), 0); // Auto-removed at zero
    }
}
