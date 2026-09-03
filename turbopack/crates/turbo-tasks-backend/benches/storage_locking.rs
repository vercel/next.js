use std::{cell::UnsafeCell, hash::BuildHasher, hint::black_box, sync::Arc, thread};

use criterion::{BatchSize, Criterion, Throughput};
use crossbeam_utils::CachePadded;
use dashmap::DashMap;
use parking_lot::{RawMutex, lock_api::RawMutex as RawMutexTrait};
use rustc_hash::FxBuildHasher;

const SHARDS: usize = 64;
const TASKS: u32 = 4096;

struct Payload {
    lock: RawMutex,
    value: UnsafeCell<u64>,
}

impl Payload {
    fn new(value: u64) -> Self {
        Self {
            lock: <RawMutex as RawMutexTrait>::INIT,
            value: UnsafeCell::new(value),
        }
    }

    fn with_mut<R>(&self, f: impl FnOnce(&mut u64) -> R) -> R {
        self.lock.lock();
        let guard = PayloadGuard(self);
        // SAFETY: `guard` owns this payload's lock for the closure's lifetime.
        let result = f(unsafe { &mut *self.value.get() });
        drop(guard);
        result
    }
}

// SAFETY: `value` is accessed only while `lock` is held.
unsafe impl Sync for Payload {}

struct PayloadGuard<'a>(&'a Payload);

impl Drop for PayloadGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: This guard is created only after acquiring this payload's lock.
        unsafe { self.0.lock.unlock() };
    }
}

// Keep independently locked tasks on separate cache lines without hand-written layout padding.
type Map = DashMap<u32, Box<CachePadded<Payload>>, FxBuildHasher>;

fn empty_map() -> Map {
    DashMap::with_capacity_and_hasher_and_shard_amount(TASKS as usize, FxBuildHasher, SHARDS)
}

fn populated_map() -> Map {
    let map = empty_map();
    for id in 1..=TASKS {
        map.insert(id, Box::new(CachePadded::new(Payload::new(id as u64))));
    }
    map
}

fn same_shard_keys(map: &Map, count: usize) -> Vec<u32> {
    let mut keys = Vec::with_capacity(count);
    let target = map.determine_shard(map.hash_usize(&1));
    for key in 1.. {
        if map.determine_shard(map.hash_usize(&key)) == target {
            keys.push(key);
            if keys.len() == count {
                return keys;
            }
        }
    }
    unreachable!()
}

pub fn storage_locking(criterion: &mut Criterion) {
    let map = populated_map();
    let mut hit = criterion.benchmark_group("storage_locking_hit");
    hit.throughput(Throughput::Elements(1));
    hit.bench_function("dashmap_shard_write", |b| {
        b.iter(|| {
            let mut task = map.get_mut(black_box(&1)).unwrap();
            task.value = UnsafeCell::new(black_box(1));
        })
    });
    hit.bench_function("shard_read_intrusive", |b| {
        b.iter(|| {
            let task = map.get(black_box(&1)).unwrap();
            task.with_mut(|value| *value = black_box(1));
        })
    });
    hit.finish();

    let mut insertion = criterion.benchmark_group("storage_locking_insert_roundtrip");
    insertion.throughput(Throughput::Elements(1));
    insertion.bench_function("dashmap_shard_write", |b| {
        let map = empty_map();
        let mut key = 1_u32;
        b.iter(|| {
            let current = key;
            key = key.wrapping_add(1);
            let mut task = map
                .entry(current)
                .or_insert_with(|| Box::new(CachePadded::new(Payload::new(0))));
            *task.value.get_mut() = black_box(current as u64);
            drop(task);
            map.remove(&current);
        })
    });
    insertion.bench_function("downgrade_then_intrusive", |b| {
        let map = empty_map();
        let mut key = 1_u32;
        b.iter(|| {
            let current = key;
            key = key.wrapping_add(1);
            let task = map
                .entry(current)
                .or_insert_with(|| Box::new(CachePadded::new(Payload::new(0))))
                .downgrade();
            task.with_mut(|value| *value = black_box(current as u64));
            drop(task);
            map.remove(&current);
        })
    });
    insertion.finish();

    let mut contention = criterion.benchmark_group("storage_locking_same_shard_parallel");
    const THREADS: usize = 4;
    const OPS: usize = 1000;
    contention.throughput(Throughput::Elements((THREADS * OPS) as u64));
    let keys = same_shard_keys(&map, THREADS);
    contention.bench_function("dashmap_shard_write", |b| {
        b.iter(|| {
            thread::scope(|scope| {
                for &key in &keys {
                    let map = &map;
                    scope.spawn(move || {
                        for _ in 0..OPS {
                            let mut task = map.get_mut(&key).unwrap();
                            *task.value.get_mut() = black_box(key as u64);
                        }
                    });
                }
            });
        })
    });
    contention.bench_function("shard_read_intrusive", |b| {
        b.iter(|| {
            thread::scope(|scope| {
                for &key in &keys {
                    let map = &map;
                    scope.spawn(move || {
                        for _ in 0..OPS {
                            let task = map.get(&key).unwrap();
                            task.with_mut(|value| *value = black_box(key as u64));
                        }
                    });
                }
            });
        })
    });
    contention.finish();

    let pair_keys = same_shard_keys(&map, 2);
    let hash1 = map.hasher().hash_one(pair_keys[0]);
    let hash2 = map.hasher().hash_one(pair_keys[1]);
    let shard_index = map.determine_shard(hash1 as usize);
    let mut pair = criterion.benchmark_group("storage_locking_same_shard_pair");
    pair.throughput(Throughput::Elements(2));
    pair.bench_function("dashmap_shard_write", |b| {
        b.iter(|| {
            let mut shard = map.shards()[shard_index].write();
            let task1 = shard
                .find_mut(hash1, |(key, _)| *key == pair_keys[0])
                .unwrap();
            *task1.1.value.get_mut() = black_box(1);
            let task2 = shard
                .find_mut(hash2, |(key, _)| *key == pair_keys[1])
                .unwrap();
            *task2.1.value.get_mut() = black_box(2);
        })
    });
    pair.bench_function("shared_shard_read_intrusive", |b| {
        b.iter(|| {
            let shard = map.shards()[shard_index].read();
            let task1 = shard.find(hash1, |(key, _)| *key == pair_keys[0]).unwrap();
            let task2 = shard.find(hash2, |(key, _)| *key == pair_keys[1]).unwrap();
            task1.1.with_mut(|value| *value = black_box(1));
            task2.1.with_mut(|value| *value = black_box(2));
        })
    });
    pair.finish();

    let mut iteration = criterion.benchmark_group("storage_locking_iteration");
    iteration.throughput(Throughput::Elements(TASKS as u64));
    iteration.bench_function("shard_write", |b| {
        b.iter(|| {
            let mut sum = 0_u64;
            for shard in map.shards() {
                let shard = shard.write();
                for (_, task) in shard.iter() {
                    // SAFETY: The shard write lock excludes every map accessor in this baseline.
                    sum = sum.wrapping_add(unsafe { *task.value.get() });
                }
            }
            black_box(sum)
        })
    });
    iteration.bench_function("shard_read_intrusive", |b| {
        b.iter(|| {
            let mut sum = 0_u64;
            for shard in map.shards() {
                let shard = shard.read();
                for (_, task) in shard.iter() {
                    sum = sum.wrapping_add(task.with_mut(|value| *value));
                }
            }
            black_box(sum)
        })
    });
    iteration.finish();

    let mut removal = criterion.benchmark_group("storage_locking_structural_remove");
    removal.throughput(Throughput::Elements(TASKS as u64));
    removal.bench_function("dashmap_remove", |b| {
        b.iter_batched(
            || Arc::new(populated_map()),
            |map| {
                for key in 1..=TASKS {
                    black_box(map.remove(&key));
                }
            },
            BatchSize::LargeInput,
        )
    });
    removal.finish();
}
