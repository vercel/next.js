use std::{
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
    sync::Arc,
};

use dashmap::{DashMap, RwLockWriteGuard, SharedValue};
use hashbrown::raw::{Bucket, RawTable};

type RwLockWriteTableGuard<'a, K, V> = RwLockWriteGuard<'a, RawTable<(K, SharedValue<V>)>>;

pub enum RefMut<'a, K, V> {
    Base(dashmap::mapref::one::RefMut<'a, K, V>),
    Simple {
        _guard: RwLockWriteTableGuard<'a, K, V>,
        bucket: Bucket<(K, SharedValue<V>)>,
    },
    Shared {
        _guard: Arc<RwLockWriteTableGuard<'a, K, V>>,
        bucket: Bucket<(K, SharedValue<V>)>,
    },
}

unsafe impl<K: Eq + Hash + Sync, V: Sync> Send for RefMut<'_, K, V> {}
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
            RefMut::Simple { bucket, .. } | RefMut::Shared { bucket, .. } => {
                // SAFETY:
                // - The bucket is still valid, as we're holding a write guard on the shard
                // - These bucket pointers are convertible to references
                //
                // https://doc.rust-lang.org/std/ptr/index.html#pointer-to-reference-conversion
                let entry = unsafe { bucket.as_ref() };
                (&entry.0, entry.1.get())
            }
        }
    }

    pub fn pair_mut(&mut self) -> (&K, &mut V) {
        match self {
            RefMut::Base(r) => r.pair_mut(),
            RefMut::Simple { bucket, .. } | RefMut::Shared { bucket, .. } => {
                // SAFETY: Same as above in `pair`, plus aliasing is prevented via:
                // 1. The lifetime of `&mut self`.
                // 2. `Simple` values come from separate shards (no aliasing possible)
                // 3. `Shared` values are asserted in `get_multiple_mut` to have unique pointers
                let entry = unsafe { bucket.as_mut() };
                (&entry.0, entry.1.get_mut())
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

pub fn get_multiple_mut<K, V>(
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
        let mut guard = shards[s1].write();

        // we need to call `find_or_find_insert_slot` to avoid overwriting existing entries, but we
        // can't use the returned bucket until after we get `bucket2` (below)
        let _ = guard
            .find_or_find_insert_slot(h1, eq1, hash_entry)
            .unwrap_or_else(|slot| unsafe {
                // SAFETY: This slot was previously returned by `find_or_find_insert_slot`, and no
                // mutation of the table has occurred since that call.
                guard.insert_in_slot(h1, slot, (key1.clone(), SharedValue::new(insert_with())))
            });

        let bucket2 = guard
            .find_or_find_insert_slot(h2, eq2, hash_entry)
            .unwrap_or_else(|slot| unsafe {
                // SAFETY: See previous call above
                guard.insert_in_slot(h2, slot, (key2.clone(), SharedValue::new(insert_with())))
            });

        // Getting `bucket2` might invalidate the bucket pointer of the first entry, *even if no
        // insert happens* as `RawTable::find_or_find_insert_slot` will *sometimes* resize the
        // table, as it unconditionally reserves space for a potential insertion.
        let bucket1 = guard.find(h1, eq1).expect(
            "failed to find bucket of previously inserted item, is the hash or eq implementation \
             incorrect?",
        );

        // this assertion is needed for memory safety reasons
        assert!(
            !std::ptr::eq(bucket1.as_ptr(), bucket2.as_ptr()),
            "`get_multiple_mut` was called with equal keys, which breaks mutable referencing rules"
        );

        let guard = Arc::new(guard);
        (
            RefMut::Shared {
                _guard: guard.clone(),
                bucket: bucket1,
            },
            RefMut::Shared {
                _guard: guard,
                bucket: bucket2,
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

        let bucket1 = guard1
            .find_or_find_insert_slot(h1, eq1, hash_entry)
            .unwrap_or_else(|slot| unsafe {
                // SAFETY: See first insert_in_slot call
                guard1.insert_in_slot(h1, slot, (key1.clone(), SharedValue::new(insert_with())))
            });
        let bucket2 = guard2
            .find_or_find_insert_slot(h2, eq2, hash_entry)
            .unwrap_or_else(|slot| unsafe {
                // SAFETY: See first insert_in_slot call
                guard2.insert_in_slot(h2, slot, (key2.clone(), SharedValue::new(insert_with())))
            });

        (
            RefMut::Simple {
                _guard: guard1,
                bucket: bucket1,
            },
            RefMut::Simple {
                _guard: guard2,
                bucket: bucket2,
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
                        let (mut a, mut b) = get_multiple_mut(map, i, i + 1, || 0);
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
