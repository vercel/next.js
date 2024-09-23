use std::{
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
    sync::Arc,
};

use dashmap::{DashMap, RwLockWriteGuard, SharedValue};
use hashbrown::{hash_map, HashMap};

pub enum RefMut<'a, K, V, S>
where
    S: BuildHasher,
{
    Base(dashmap::mapref::one::RefMut<'a, K, V, S>),
    Simple {
        #[allow(dead_code)]
        guard: RwLockWriteGuard<'a, HashMap<K, SharedValue<V>, S>>,
        key: *const K,
        value: *mut V,
    },
    Shared {
        #[allow(dead_code)]
        guard: Arc<RwLockWriteGuard<'a, HashMap<K, SharedValue<V>, S>>>,
        key: *const K,
        value: *mut V,
    },
}

unsafe impl<'a, K: Eq + Hash + Sync, V: Sync, S: BuildHasher> Send for RefMut<'a, K, V, S> {}
unsafe impl<'a, K: Eq + Hash + Sync, V: Sync, S: BuildHasher> Sync for RefMut<'a, K, V, S> {}

impl<'a, K: Eq + Hash, V, S: BuildHasher> RefMut<'a, K, V, S> {
    pub fn key(&self) -> &K {
        self.pair().0
    }

    pub fn value(&self) -> &V {
        self.pair().1
    }

    pub fn value_mut(&mut self) -> &mut V {
        self.pair_mut().1
    }

    pub fn pair(&self) -> (&K, &V) {
        match self {
            RefMut::Base(r) => r.pair(),
            &RefMut::Simple { key, value, .. } => unsafe { (&*key, &*value) },
            &RefMut::Shared { key, value, .. } => unsafe { (&*key, &*value) },
        }
    }

    pub fn pair_mut(&mut self) -> (&K, &mut V) {
        match self {
            RefMut::Base(r) => r.pair_mut(),
            &mut RefMut::Simple { key, value, .. } => unsafe { (&*key, &mut *value) },
            &mut RefMut::Shared { key, value, .. } => unsafe { (&*key, &mut *value) },
        }
    }
}

impl<'a, K: Eq + Hash, V, S: BuildHasher> Deref for RefMut<'a, K, V, S> {
    type Target = V;

    fn deref(&self) -> &V {
        self.value()
    }
}

impl<'a, K: Eq + Hash, V, S: BuildHasher> DerefMut for RefMut<'a, K, V, S> {
    fn deref_mut(&mut self) -> &mut V {
        self.value_mut()
    }
}

impl<'a, K, V, S> From<dashmap::mapref::one::RefMut<'a, K, V, S>> for RefMut<'a, K, V, S>
where
    K: Hash + Eq,
    S: BuildHasher,
{
    fn from(r: dashmap::mapref::one::RefMut<'a, K, V, S>) -> Self {
        RefMut::Base(r)
    }
}

pub fn get_multiple_mut<K, V, S>(
    map: &DashMap<K, V, S>,
    key1: K,
    key2: K,
    insert_with: impl Fn() -> V,
) -> (RefMut<'_, K, V, S>, RefMut<'_, K, V, S>)
where
    K: Hash + Eq + Clone,
    S: BuildHasher + Clone,
{
    let s1 = map.determine_map(&key1);
    let s2 = map.determine_map(&key2);
    let shards = map.shards();
    if s1 == s2 {
        let mut guard = shards[s1].write();
        let e1 = guard
            .raw_entry_mut()
            .from_key(&key1)
            .or_insert_with(|| (key1.clone(), SharedValue::new(insert_with())));
        let mut key1_ptr = e1.0 as *const K;
        let mut value1_ptr = e1.1.get_mut() as *mut V;
        let key2_ptr;
        let value2_ptr;
        match guard.raw_entry_mut().from_key(&key2) {
            hash_map::RawEntryMut::Occupied(e) => {
                let e2 = e.into_key_value();
                key2_ptr = e2.0 as *const K;
                value2_ptr = e2.1.get_mut() as *mut V;
            }
            hash_map::RawEntryMut::Vacant(e) => {
                let e2 = e.insert(key2.clone(), SharedValue::new(insert_with()));
                key2_ptr = e2.0 as *const K;
                value2_ptr = e2.1.get_mut() as *mut V;
                // inserting a new entry might invalidate the pointers of the first entry
                let e1 = guard.get_key_value_mut(&key1).unwrap();
                key1_ptr = e1.0 as *const K;
                value1_ptr = e1.1.get_mut() as *mut V;
            }
        }
        let guard = Arc::new(guard);
        (
            RefMut::Shared {
                guard: guard.clone(),
                key: key1_ptr,
                value: value1_ptr,
            },
            RefMut::Shared {
                guard,
                key: key2_ptr,
                value: value2_ptr,
            },
        )
    } else {
        let (mut guard1, mut guard2) = loop {
            {
                let g1 = shards[s1].write();
                if let Some(g2) = shards[s2].try_write() {
                    break (g1, g2);
                }
            }
            {
                let g2 = shards[s2].write();
                if let Some(g1) = shards[s1].try_write() {
                    break (g1, g2);
                }
            }
        };
        let e1 = guard1
            .raw_entry_mut()
            .from_key(&key1)
            .or_insert_with(|| (key1, SharedValue::new(insert_with())));
        let key1 = e1.0 as *const K;
        let value1 = e1.1.get_mut() as *mut V;
        let e2 = guard2
            .raw_entry_mut()
            .from_key(&key2)
            .or_insert_with(|| (key2, SharedValue::new(insert_with())));
        let key2 = e2.0 as *const K;
        let value2 = e2.1.get_mut() as *mut V;
        (
            RefMut::Simple {
                guard: guard1,
                key: key1,
                value: value1,
            },
            RefMut::Simple {
                guard: guard2,
                key: key2,
                value: value2,
            },
        )
    }
}
