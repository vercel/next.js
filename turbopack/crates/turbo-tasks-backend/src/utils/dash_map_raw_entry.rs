use std::{
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
};

use dashmap::{DashMap, RwLockWriteGuard, SharedValue};
use hashbrown::raw::{Bucket, InsertSlot, RawTable};

pub fn raw_entry<'l, K: Eq + Hash + AsRef<Q>, V, Q: Eq + Hash, S: BuildHasher + Clone>(
    map: &'l DashMap<K, V, S>,
    key: &Q,
) -> RawEntry<'l, K, V> {
    let hasher = map.hasher();
    let hash = hasher.hash_one(key);
    let shard = map.determine_shard(hash as usize);
    let mut shard = map.shards()[shard].write();
    let result = shard.find_or_find_insert_slot(
        hash,
        |(k, _v)| k.as_ref() == key,
        |(k, _v)| hasher.hash_one(k),
    );
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

impl<'l, K, V> RawEntry<'l, K, V> {
    #[allow(dead_code)]
    pub fn or_insert_with<F: FnOnce() -> (K, V)>(self, f: F) -> RefMut<'l, K, V> {
        match self {
            RawEntry::Occupied(occupied) => occupied.into_mut(),
            RawEntry::Vacant(vacant) => {
                let (key, value) = f();
                vacant.insert(key, value)
            }
        }
    }
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

    #[allow(dead_code)]
    pub fn get_mut(&mut self) -> &mut V {
        // Safety: We have a write lock on the shard, so no other references to the value can
        // exist.
        unsafe { self.bucket.as_mut().1.get_mut() }
    }

    #[allow(dead_code)]
    pub fn into_mut(self) -> RefMut<'l, K, V> {
        // Safety: We have a write lock on the shard, so no other references to the value can
        // exist.
        RefMut::from_bucket(self.bucket, self.shard)
    }
}

pub struct VacantEntry<'l, K, V> {
    hash: u64,
    insert_slot: InsertSlot,
    shard: RwLockWriteGuard<'l, RawTable<(K, SharedValue<V>)>>,
}

impl<'l, K, V> VacantEntry<'l, K, V> {
    pub fn insert(mut self, key: K, value: V) -> RefMut<'l, K, V> {
        let shared_value = SharedValue::new(value);
        // Safety: The insert slot is valid and the map has not be modified since we obtained it (we
        // hold the write lock).
        unsafe {
            let bucket =
                self.shard
                    .insert_in_slot(self.hash, self.insert_slot, (key, shared_value));
            RefMut::from_bucket(bucket, self.shard)
        }
    }
}

pub struct RefMut<'l, K, V> {
    bucket: Bucket<(K, SharedValue<V>)>,
    #[allow(dead_code, reason = "kept to ensure the lock lives long enough")]
    shard: RwLockWriteGuard<'l, RawTable<(K, SharedValue<V>)>>,
}

impl<'l, K, V> RefMut<'l, K, V> {
    fn from_bucket(
        bucket: Bucket<(K, SharedValue<V>)>,
        shard: RwLockWriteGuard<'l, RawTable<(K, SharedValue<V>)>>,
    ) -> Self {
        Self { bucket, shard }
    }
}

impl<'l, K, V> Deref for RefMut<'l, K, V> {
    type Target = V;

    fn deref(&self) -> &Self::Target {
        // Safety: We have a write lock on the shard, so no other references to the value can
        // exist.
        unsafe { self.bucket.as_ref().1.get() }
    }
}

impl<'l, K, V> DerefMut for RefMut<'l, K, V> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // Safety: We have a write lock on the shard, so no other references to the value can
        // exist.
        unsafe { self.bucket.as_mut().1.get_mut() }
    }
}
