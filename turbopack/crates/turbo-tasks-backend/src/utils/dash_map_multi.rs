use std::{
    hash::{BuildHasher, Hash},
    ops::Deref,
    ptr::NonNull,
    sync::Arc,
};

use dashmap::{DashMap, RawRwLock};
use hashbrown::HashTable;
use parking_lot::lock_api::{RwLockReadGuard, RwLockWriteGuard};

type ReadTableGuard<'a, K, V> = RwLockReadGuard<'a, RawRwLock, HashTable<(K, V)>>;

/// A read reference to one DashMap entry.
///
/// The shared variant lets two disjoint entries in the same shard share one read guard. This
/// avoids recursively acquiring a writer-preferring shard lock while retaining stable entry
/// addresses for each task's intrusive lock.
pub enum Ref<'a, K, V> {
    Base(dashmap::mapref::one::Ref<'a, K, V>),
    Simple {
        _guard: ReadTableGuard<'a, K, V>,
        entry: NonNull<(K, V)>,
    },
    Shared {
        _guard: Arc<ReadTableGuard<'a, K, V>>,
        entry: NonNull<(K, V)>,
    },
}

// SAFETY: Each entry pointer remains valid under its shard read guard. Shared references never
// mutate the HashTable entry; payload mutation is independently synchronized by its intrusive
// lock. `K: Sync + V: Sync` makes shared references safe across threads.
unsafe impl<K: Eq + Hash + Sync, V: Sync> Sync for Ref<'_, K, V> {}

impl<K: Eq + Hash, V> Ref<'_, K, V> {
    pub fn key(&self) -> &K {
        self.pair().0
    }

    pub fn value(&self) -> &V {
        self.pair().1
    }

    fn pair(&self) -> (&K, &V) {
        match self {
            Self::Base(reference) => reference.pair(),
            Self::Simple { entry, .. } | Self::Shared { entry, .. } => {
                // SAFETY: The entry remains valid while the corresponding shard read guard lives.
                let entry = unsafe { entry.as_ref() };
                (&entry.0, &entry.1)
            }
        }
    }
}

impl<K: Eq + Hash, V> Deref for Ref<'_, K, V> {
    type Target = V;

    fn deref(&self) -> &Self::Target {
        self.value()
    }
}

impl<'a, K, V> From<dashmap::mapref::one::Ref<'a, K, V>> for Ref<'a, K, V>
where
    K: Hash + Eq,
{
    fn from(reference: dashmap::mapref::one::Ref<'a, K, V>) -> Self {
        Self::Base(reference)
    }
}

/// Get two disjoint read references, inserting missing values under shard write locks.
///
/// The caller must order calls to this function consistently when composing it with other locks.
pub fn get_disjoint<K, V>(
    map: &DashMap<K, V, impl BuildHasher + Clone>,
    key1: K,
    key2: K,
    insert_with: impl Fn() -> V,
) -> (Ref<'_, K, V>, Ref<'_, K, V>)
where
    K: Hash + Eq + Clone,
{
    assert!(
        key1 != key2,
        "`get_disjoint` was called with equal keys, which cannot produce disjoint task guards"
    );

    let hasher = map.hasher();
    let hash_entry = |entry: &(K, _)| hasher.hash_one(&entry.0);
    let hash1 = hasher.hash_one(&key1);
    let hash2 = hasher.hash_one(&key2);
    let shard1 = map.determine_shard(hash1 as usize);
    let shard2 = map.determine_shard(hash2 as usize);
    let shards = map.shards();

    let find1 = |entry: &(K, _)| key1.eq(&entry.0);
    let find2 = |entry: &(K, _)| key2.eq(&entry.0);

    if shard1 == shard2 {
        let guard = shards[shard1].read();
        let entry1 = guard.find(hash1, find1).map(NonNull::from);
        let entry2 = guard.find(hash2, find2).map(NonNull::from);
        if let (Some(entry1), Some(entry2)) = (entry1, entry2) {
            return shared_pair(guard, entry1, entry2);
        }
        drop(guard);

        let mut guard = shards[shard1].write();
        if guard.find(hash1, find1).is_none() {
            guard.insert_unique(hash1, (key1.clone(), insert_with()), hash_entry);
        }
        if guard.find(hash2, find2).is_none() {
            guard.insert_unique(hash2, (key2.clone(), insert_with()), hash_entry);
        }
        let entry1 = NonNull::from(guard.find(hash1, find1).expect("first entry was inserted"));
        let entry2 = NonNull::from(guard.find(hash2, find2).expect("second entry was inserted"));
        return shared_pair(RwLockWriteGuard::downgrade(guard), entry1, entry2);
    }

    let (first_shard, second_shard, first_is_key1) = if shard1 < shard2 {
        (shard1, shard2, true)
    } else {
        (shard2, shard1, false)
    };
    let first_guard = shards[first_shard].read();
    let second_guard = shards[second_shard].read();
    let (guard1, guard2) = if first_is_key1 {
        (first_guard, second_guard)
    } else {
        (second_guard, first_guard)
    };
    let entry1 = guard1.find(hash1, find1).map(NonNull::from);
    let entry2 = guard2.find(hash2, find2).map(NonNull::from);
    if let (Some(entry1), Some(entry2)) = (entry1, entry2) {
        return (
            Ref::Simple {
                _guard: guard1,
                entry: entry1,
            },
            Ref::Simple {
                _guard: guard2,
                entry: entry2,
            },
        );
    }
    drop(guard2);
    drop(guard1);

    let (mut guard1, mut guard2) = loop {
        {
            let guard1 = shards[shard1].write();
            if let Some(guard2) = shards[shard2].try_write() {
                break (guard1, guard2);
            }
        }
        {
            let guard2 = shards[shard2].write();
            if let Some(guard1) = shards[shard1].try_write() {
                break (guard1, guard2);
            }
        }
    };
    if guard1.find(hash1, find1).is_none() {
        guard1.insert_unique(hash1, (key1.clone(), insert_with()), hash_entry);
    }
    if guard2.find(hash2, find2).is_none() {
        guard2.insert_unique(hash2, (key2.clone(), insert_with()), hash_entry);
    }
    let entry1 = NonNull::from(guard1.find(hash1, find1).expect("first entry was inserted"));
    let entry2 = NonNull::from(
        guard2
            .find(hash2, find2)
            .expect("second entry was inserted"),
    );
    (
        Ref::Simple {
            _guard: RwLockWriteGuard::downgrade(guard1),
            entry: entry1,
        },
        Ref::Simple {
            _guard: RwLockWriteGuard::downgrade(guard2),
            entry: entry2,
        },
    )
}

fn shared_pair<'a, K, V>(
    guard: ReadTableGuard<'a, K, V>,
    entry1: NonNull<(K, V)>,
    entry2: NonNull<(K, V)>,
) -> (Ref<'a, K, V>, Ref<'a, K, V>) {
    let guard = Arc::new(guard);
    (
        Ref::Shared {
            _guard: guard.clone(),
            entry: entry1,
        },
        Ref::Shared {
            _guard: guard,
            entry: entry2,
        },
    )
}
