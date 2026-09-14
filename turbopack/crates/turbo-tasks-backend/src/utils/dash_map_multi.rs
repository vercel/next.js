use std::{
    hash::{BuildHasher, Hash},
    marker::PhantomData,
    ops::{Deref, DerefMut},
    ptr::NonNull,
    sync::Arc,
};

use dashmap::{DashMap, RawRwLock};
use hashbrown::HashTable;
use parking_lot::lock_api::RwLockWriteGuard;

type RwLockWriteTableGuard<'a, K, V> = RwLockWriteGuard<'a, RawRwLock, HashTable<(K, V)>>;

pub enum RefMut<'a, K, V> {
    Base(dashmap::mapref::one::RefMut<'a, K, V>),
    Simple {
        _guard: RwLockWriteTableGuard<'a, K, V>,
        entry: NonNull<(K, V)>,
    },
    Shared {
        _guard: Arc<RwLockWriteTableGuard<'a, K, V>>,
        entry: NonNull<(K, V)>,
        // Ensures that RefMut is !Send, preventing holding RefMut across .await points in async
        // code, which can cause deadlocks. See safety comment on `unsafe impl Sync for RefMut`
        // below.
        phantom: std::marker::PhantomData<*const ()>,
    },
}

// `RefMut` is intentionally **not** `Send`. While sending the guard across threads would be sound
// under the same reasoning that justifies `Sync` below, allowing `Send` makes it possible to hold
// a `RefMut` (and therefore a `StorageWriteGuard`) across an `.await` in async code, since the
// compiler will then accept the resulting future as `Send`. That pattern causes hard async
// deadlocks: the guard parks together with the suspended future and pins the shard's write lock,
// while every other tokio worker piles up trying to take the same lock — leaving no thread free
// to poll the parked future. Marking the type `!Send` makes the borrow checker reject those call
// sites at compile time.
// SAFETY (Sync): `RefMut` contains a non-null pointer into a `DashMap` shard's `HashTable`.
// Sharing `&RefMut` is safe because:
// - `Simple` variant: The entry is accessed under an exclusive `RwLockWriteGuard` on a single
//   shard. The guard provides exclusive access to all data in that shard.
// - `Shared` variant: The entry is accessed under an `Arc<RwLockWriteGuard>`. The
//   `get_disjoint_mut` function validates that the keys differ before obtaining both references
//   through `HashTable::get_many_unchecked_mut`.
// - `K: Sync + V: Sync` bounds ensure the key and value types are safe to share across threads.
unsafe impl<K: Eq + Hash + Sync, V: Sync> Sync for RefMut<'_, K, V> {}

impl<K: Eq + Hash, V> RefMut<'_, K, V> {
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
            RefMut::Simple { entry, .. } | RefMut::Shared { entry, .. } => {
                // SAFETY: The entry remains valid while the shard write guard is held.
                let entry = unsafe { entry.as_ref() };
                (&entry.0, &entry.1)
            }
        }
    }

    pub fn pair_mut(&mut self) -> (&K, &mut V) {
        match self {
            RefMut::Base(r) => r.pair_mut(),
            RefMut::Simple { entry, .. } | RefMut::Shared { entry, .. } => {
                // SAFETY: Same as above in `pair`, plus aliasing is prevented via:
                // 1. The lifetime of `&mut self`.
                // 2. `Simple` values come from separate shards (no aliasing possible).
                // 3. `Shared` values were validated as disjoint before the pointers were created.
                let entry = unsafe { entry.as_mut() };
                (&entry.0, &mut entry.1)
            }
        }
    }
}

impl<K: Eq + Hash, V> Deref for RefMut<'_, K, V> {
    type Target = V;

    fn deref(&self) -> &V {
        self.value()
    }
}

impl<K: Eq + Hash, V> DerefMut for RefMut<'_, K, V> {
    fn deref_mut(&mut self) -> &mut V {
        self.value_mut()
    }
}

impl<'a, K, V> From<dashmap::mapref::one::RefMut<'a, K, V>> for RefMut<'a, K, V>
where
    K: Hash + Eq,
{
    fn from(r: dashmap::mapref::one::RefMut<'a, K, V>) -> Self {
        RefMut::Base(r)
    }
}

pub fn get_disjoint_mut<K, V>(
    map: &DashMap<K, V, impl BuildHasher + Clone>,
    key1: K,
    key2: K,
    insert_with: impl Fn() -> V,
) -> (RefMut<'_, K, V>, RefMut<'_, K, V>)
where
    K: Hash + Eq + Clone,
{
    let hasher = map.hasher();
    let hash_entry = |entry: &(K, _)| hasher.hash_one(&entry.0);
    let h1 = hasher.hash_one(&key1);
    let h2 = hasher.hash_one(&key2);

    // Use `determine_shard` instead of `determine_map` to avoid extra rehashing.
    // This u64 -> usize conversion also happens internally within DashMap using `as usize`.
    // See: `DashMap::hash_usize`
    let s1 = map.determine_shard(h1 as usize);
    let s2 = map.determine_shard(h2 as usize);

    let eq1 = |other: &(K, _)| key1.eq(&other.0);
    let eq2 = |other: &(K, _)| key2.eq(&other.0);

    let shards = map.shards();
    if s1 == s2 {
        // Equal keys would resolve to a single entry below. This must be a release-mode assertion
        // because the unchecked lookup relies on it for memory safety.
        assert!(
            key1 != key2,
            "`get_disjoint_mut` was called with equal keys, which breaks mutable referencing rules"
        );

        let mut guard = shards[s1].write();

        if guard.find(h1, eq1).is_none() {
            guard.insert_unique(h1, (key1.clone(), insert_with()), hash_entry);
        }
        if guard.find(h2, eq2).is_none() {
            guard.insert_unique(h2, (key2.clone(), insert_with()), hash_entry);
        }

        // SAFETY: `key1 != key2` was asserted above. Since `K: Eq`, the two equality closures
        // cannot select the same entry, even when the hashes collide.
        let [entry1, entry2] =
            unsafe {
                guard.get_many_unchecked_mut([h1, h2], |index, entry| {
                    if index == 0 { eq1(entry) } else { eq2(entry) }
                })
            };
        let entry1 = NonNull::from(entry1.expect("the first entry was inserted above"));
        let entry2 = NonNull::from(entry2.expect("the second entry was inserted above"));

        let guard = Arc::new(guard);
        (
            RefMut::Shared {
                _guard: guard.clone(),
                entry: entry1,
                phantom: PhantomData,
            },
            RefMut::Shared {
                _guard: guard,
                entry: entry2,
                phantom: PhantomData,
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

        if guard1.find(h1, eq1).is_none() {
            guard1.insert_unique(h1, (key1.clone(), insert_with()), hash_entry);
        }
        if guard2.find(h2, eq2).is_none() {
            guard2.insert_unique(h2, (key2.clone(), insert_with()), hash_entry);
        }
        let entry1 = NonNull::from(
            guard1
                .find_mut(h1, eq1)
                .expect("the first entry was inserted"),
        );
        let entry2 = NonNull::from(
            guard2
                .find_mut(h2, eq2)
                .expect("the second entry was inserted"),
        );

        (
            RefMut::Simple {
                _guard: guard1,
                entry: entry1,
            },
            RefMut::Simple {
                _guard: guard2,
                entry: entry2,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use std::thread::scope;

    use rand::prelude::SliceRandom;
    use turbo_tasks::FxDashMap;

    use super::*;

    #[test]
    fn stress_deadlock() {
        const N: usize = 100000;
        const THREADS: usize = 20;

        let map = FxDashMap::with_hasher_and_shard_amount(Default::default(), 4);
        let indices = (0..THREADS)
            .map(|_| {
                let mut vec = (0..N).collect::<Vec<_>>();
                vec.shuffle(&mut rand::rng());
                vec
            })
            .collect::<Vec<_>>();
        let map = &map;
        scope(|s| {
            for indices in indices {
                s.spawn(|| {
                    for i in indices {
                        let (mut a, mut b) = get_disjoint_mut(map, i, i + 1, || 0);
                        *a += 1;
                        *b += 1;
                    }
                });
            }
        });
        let value = *map.get(&0).unwrap();
        assert_eq!(value, THREADS);
        for i in 1..N {
            let value = *map.get(&i).unwrap();
            assert_eq!(value, THREADS * 2);
        }
        let value = *map.get(&N).unwrap();
        assert_eq!(value, THREADS);
    }
}
