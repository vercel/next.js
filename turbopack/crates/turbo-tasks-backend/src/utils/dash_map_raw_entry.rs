use std::hash::{BuildHasher, Hash};

use dashmap::{DashMap, RwLockWriteGuard, SharedValue};
use hashbrown::raw::{Bucket, InsertSlot, RawTable};

/// Returns the shard index for a pre-computed hash, without locking anything.
///
/// Pass the returned index to [`raw_get_shard`] and [`raw_entry_by_shard`] so
/// that the shard is only located once even when a read-lock miss is followed
/// by a write-lock retry.
pub fn shard_index<K: Eq + Hash, V, S: BuildHasher + Clone>(
    map: &DashMap<K, V, S>,
    hash: u64,
) -> usize {
    map.determine_shard(hash as usize)
}

/// Read-only heterogeneous lookup using a pre-computed shard index.
/// Returns `Some(value)` on hit, `None` on miss. Uses only a read lock.
pub fn raw_get_shard<K: Eq + Hash, V: Copy, S: BuildHasher + Clone>(
    map: &DashMap<K, V, S>,
    shard_idx: usize,
    hash: u64,
    eq: impl Fn(&K) -> bool,
) -> Option<V> {
    let shard = map.shards()[shard_idx].read();
    // Safety: We have a read lock on the shard.
    shard
        .find(hash, |(k, _v)| eq(k))
        .map(|bucket| *unsafe { bucket.as_ref() }.1.get())
}

/// Write-lock entry lookup using a pre-computed shard index and heterogeneous equality.
///
/// Takes a pre-computed `shard_idx` (from [`shard_index`]) and `hash` so the
/// shard is not located a second time on a read-miss/write-retry path.
pub fn raw_entry_by_shard<'l, K: Eq + Hash, V, S: BuildHasher + Clone>(
    map: &'l DashMap<K, V, S>,
    shard_idx: usize,
    hash: u64,
    eq: impl Fn(&K) -> bool,
) -> RawEntry<'l, K, V> {
    let hasher = map.hasher();
    let mut shard = map.shards()[shard_idx].write();
    let result =
        shard.find_or_find_insert_slot(hash, |(k, _v)| eq(k), |(k, _v)| hasher.hash_one(k));
    match result {
        Ok(bucket) => RawEntry::Occupied(OccupiedEntry { bucket, shard }),
        Err(insert_slot) => RawEntry::Vacant(VacantEntry {
            hash,
            insert_slot,
            shard,
        }),
    }
}

pub enum RawEntry<'l, K, V> {
    Occupied(OccupiedEntry<'l, K, V>),
    Vacant(VacantEntry<'l, K, V>),
}

pub struct OccupiedEntry<'l, K, V> {
    bucket: Bucket<(K, SharedValue<V>)>,
    #[allow(dead_code, reason = "kept to ensure the lock lives long enough")]
    shard: RwLockWriteGuard<'l, RawTable<(K, SharedValue<V>)>>,
}

impl<'l, K, V> OccupiedEntry<'l, K, V> {
    pub fn get(&self) -> &V {
        // Safety: We have a write lock on the shard, so no other references to the value can
        // exist.
        unsafe { self.bucket.as_ref().1.get() }
    }
}

pub struct VacantEntry<'l, K, V> {
    hash: u64,
    insert_slot: InsertSlot,
    shard: RwLockWriteGuard<'l, RawTable<(K, SharedValue<V>)>>,
}

impl<'l, K, V> VacantEntry<'l, K, V> {
    pub fn insert(mut self, key: K, value: V) {
        let shared_value = SharedValue::new(value);
        // Safety: The insert slot is valid and the map has not been modified since we obtained it
        // (we hold the write lock).
        unsafe {
            self.shard
                .insert_in_slot(self.hash, self.insert_slot, (key, shared_value));
        }
    }
}
