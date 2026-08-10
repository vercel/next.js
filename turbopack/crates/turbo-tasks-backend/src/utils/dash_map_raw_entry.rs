use std::hash::{BuildHasher, Hash};

use crossbeam_utils::CachePadded;
use dashmap::{DashMap, RwLock, RwLockWriteGuard, SharedValue};
use hashbrown::raw::{Bucket, InsertSlot, RawTable};

/// The type of a single shard inside a [`DashMap`].
///
/// `dashmap::HashMap<K, V>` is a private alias for `RawTable<(K, SharedValue<V>)>`.
pub type Shard<K, V> = CachePadded<RwLock<RawTable<(K, SharedValue<V>)>>>;

/// Returns a reference to the shard that owns the given pre-computed hash,
/// without locking anything.
///
/// Pass the returned reference to [`raw_get_in_shard`] and
/// [`raw_entry_in_shard`] so that the shard is only located once even when a
/// read-lock miss is followed by a write-lock retry.
pub fn get_shard<K: Eq + Hash, V, S: BuildHasher + Clone>(
    map: &DashMap<K, V, S>,
    hash: u64,
) -> &Shard<K, V> {
    let idx = map.determine_shard(hash as usize);
    &map.shards()[idx]
}

/// Read-only heterogeneous lookup using a pre-located shard reference.
/// Returns `Some(value)` on hit, `None` on miss. Uses only a read lock.
pub fn raw_get_in_shard<K: Eq + Hash, V: Copy>(
    shard: &Shard<K, V>,
    hash: u64,
    eq: impl Fn(&K) -> bool,
) -> Option<V> {
    let guard = shard.read();
    // Safety: We have a read lock on the shard.
    guard
        .find(hash, |(k, _v)| eq(k))
        .map(|bucket| *unsafe { bucket.as_ref() }.1.get())
}

/// Write-lock entry lookup using a pre-located shard reference and
/// heterogeneous equality.
///
/// Takes a pre-located `shard` (from [`get_shard`]) and `hash` so the shard is
/// not located a second time on a read-miss / write-retry path.
pub fn raw_entry_in_shard<'l, K: Eq + Hash, V, S: BuildHasher + Clone>(
    shard: &'l Shard<K, V>,
    map_hasher: &S,
    hash: u64,
    eq: impl Fn(&K) -> bool,
) -> RawEntry<'l, K, V> {
    let mut guard = shard.write();
    let result =
        guard.find_or_find_insert_slot(hash, |(k, _v)| eq(k), |(k, _v)| map_hasher.hash_one(k));
    match result {
        Ok(bucket) => RawEntry::Occupied(OccupiedEntry {
            bucket,
            shard: guard,
        }),
        Err(insert_slot) => RawEntry::Vacant(VacantEntry {
            hash,
            insert_slot,
            shard: guard,
        }),
    }
}

/// Outcome of [`try_lock_and_remove`].
pub enum TryLockAndRemove {
    /// The shard lock was acquired and a matching entry was removed.
    Removed,
    /// The shard lock was acquired but no matching entry was present.
    NotFound,
    /// The shard lock was contended; the caller should retry later after releasing
    /// any other locks they are holding.
    WouldBlock,
}

/// Remove `key` from `map` without blocking on shard contention.
///
/// Intended for call sites that already hold another lock and want to avoid a
/// cyclic wait. On contention (`WouldBlock`), the caller is expected to defer the
/// removal and retry after dropping the other lock.
pub fn try_lock_and_remove<
    K: Eq + Hash + AsRef<Q>,
    V,
    Q: Eq + Hash + ?Sized,
    S: BuildHasher + Clone,
>(
    map: &DashMap<K, V, S>,
    key: &Q,
) -> TryLockAndRemove {
    let hasher = map.hasher();
    let hash = hasher.hash_one(key);
    let shard_idx = map.determine_shard(hash as usize);
    let Some(mut shard) = map.shards()[shard_idx].try_write() else {
        return TryLockAndRemove::WouldBlock;
    };
    // SAFETY: we hold the write lock for the duration of the find/erase.
    match shard.find(hash, |(k, _v)| k.as_ref() == key) {
        Some(bucket) => {
            unsafe { shard.erase(bucket) };
            TryLockAndRemove::Removed
        }
        None => TryLockAndRemove::NotFound,
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
