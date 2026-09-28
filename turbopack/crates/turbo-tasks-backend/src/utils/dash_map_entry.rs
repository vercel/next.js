use std::hash::{BuildHasher, Hash};

use crossbeam_utils::CachePadded;
use dashmap::{DashMap, RwLock};
use hashbrown::{HashTable, hash_table};

/// The type of a single shard inside a [`DashMap`].
///
/// `dashmap::HashMap<K, V>` is a private alias for `HashTable<(K, V)>`.
pub type Shard<K, V> = CachePadded<RwLock<HashTable<(K, V)>>>;

/// Returns a reference to the shard that owns the given pre-computed hash,
/// without locking anything.
///
/// Pass the returned reference to [`get_in_shard`] and
/// [`with_entry_in_shard`] so that the shard is only located once even when a
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
pub fn get_in_shard<K: Eq + Hash, V: Copy>(
    shard: &Shard<K, V>,
    hash: u64,
    eq: impl Fn(&K) -> bool,
) -> Option<V> {
    let guard = shard.read();
    guard.find(hash, |(k, _v)| eq(k)).map(|(_k, v)| *v)
}

/// Runs `then` with the native Hashbrown entry for a pre-located DashMap shard.
///
/// The shard write lock is held only for the duration of `then`. The caller
/// controls the precise point where the entry is consumed and the lock is
/// released by returning from the closure.
pub fn with_entry_in_shard<K: Eq + Hash, V, S: BuildHasher + Clone, Q: ?Sized, R>(
    shard: &Shard<K, V>,
    map_hasher: &S,
    hash: u64,
    query: &mut Q,
    eq: impl Fn(&K, &Q) -> bool,
    then: impl FnOnce(hash_table::Entry<'_, (K, V)>, &mut Q) -> R,
) -> R {
    let mut guard = shard.write();
    let entry = guard.entry(
        hash,
        |(k, _v)| eq(k, query),
        |(k, _v)| map_hasher.hash_one(k),
    );
    then(entry, query)
}

/// Outcome of [`try_lock_and_remove`].
pub enum TryLockAndRemove {
    /// The shard lock was acquired and a matching entry was removed.
    Removed,
    /// The shard lock was acquired but the key was absent or held another value.
    NotFound,
    /// The shard lock was contended; the caller should retry later after releasing
    /// any other locks they are holding.
    WouldBlock,
}

/// Remove `key` only if it still maps to `expected`, without blocking on shard contention.
///
/// The value check prevents an eviction of an old TaskId from removing a newer mapping for
/// the same task type. On contention the caller defers removal until releasing other locks.
pub fn try_lock_and_remove<
    K: Eq + Hash + AsRef<Q>,
    V: Copy + PartialEq,
    Q: Eq + Hash + ?Sized,
    S: BuildHasher + Clone,
>(
    map: &DashMap<K, V, S>,
    key: &Q,
    expected: V,
) -> TryLockAndRemove {
    let hasher = map.hasher();
    let hash = hasher.hash_one(key);
    let shard_idx = map.determine_shard(hash as usize);
    let Some(mut shard) = map.shards()[shard_idx].try_write() else {
        return TryLockAndRemove::WouldBlock;
    };
    match shard.find_entry(hash, |(k, _v)| k.as_ref() == key) {
        Ok(entry) if entry.get().1 == expected => {
            entry.remove();
            TryLockAndRemove::Removed
        }
        _ => TryLockAndRemove::NotFound,
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::FxDashMap;

    use super::{TryLockAndRemove, try_lock_and_remove};

    #[test]
    fn try_lock_and_remove_requires_matching_values() {
        let map = FxDashMap::<String, u32>::default();
        map.insert("task".to_string(), 2);
        assert!(matches!(
            try_lock_and_remove(&map, "task", 1),
            TryLockAndRemove::NotFound
        ));
        assert_eq!(map.get("task").map(|id| *id), Some(2));
        assert!(matches!(
            try_lock_and_remove(&map, "task", 2),
            TryLockAndRemove::Removed
        ));
        assert!(map.get("task").is_none());
    }
}
