use std::{hint::black_box, thread};

use criterion::{BatchSize, Criterion, Throughput};
use crossbeam_utils::CachePadded;
use dashmap::DashMap;
use papaya::HashMap;
use parking_lot::Mutex;
use rustc_hash::FxBuildHasher;

const TASKS: u32 = 4096;
const OPS: usize = 1000;

type Payload = CachePadded<Mutex<u64>>;
type Dash = DashMap<u32, Box<Payload>, FxBuildHasher>;
type Papaya = HashMap<u32, Payload, FxBuildHasher>;

fn dash() -> Dash {
    let map = DashMap::with_capacity_and_hasher_and_shard_amount(TASKS as usize, FxBuildHasher, 64);
    for id in 1..=TASKS {
        map.insert(id, Box::new(CachePadded::new(Mutex::new(id as u64))));
    }
    map
}

fn papaya() -> Papaya {
    let map = HashMap::with_capacity_and_hasher(TASKS as usize, FxBuildHasher);
    let guard = map.guard();
    for id in 1..=TASKS {
        map.insert(id, CachePadded::new(Mutex::new(id as u64)), &guard);
    }
    drop(guard);
    map
}

pub fn papaya_map(criterion: &mut Criterion) {
    let before = turbo_tasks_malloc::TurboMalloc::allocation_counters();
    let dash = dash();
    let after_dash = turbo_tasks_malloc::TurboMalloc::allocation_counters();
    eprintln!(
        "dashmap resident allocation: {} bytes in {} allocations",
        (after_dash.allocations - before.allocations)
            .saturating_sub(after_dash.deallocations - before.deallocations),
        (after_dash.allocation_count - before.allocation_count)
            .saturating_sub(after_dash.deallocation_count - before.deallocation_count),
    );
    let before = after_dash;
    let papaya = papaya();
    let after_papaya = turbo_tasks_malloc::TurboMalloc::allocation_counters();
    eprintln!(
        "papaya resident allocation: {} bytes in {} allocations",
        (after_papaya.allocations - before.allocations)
            .saturating_sub(after_papaya.deallocations - before.deallocations),
        (after_papaya.allocation_count - before.allocation_count)
            .saturating_sub(after_papaya.deallocation_count - before.deallocation_count),
    );

    let mut hit = criterion.benchmark_group("papaya_map_hit");
    hit.throughput(Throughput::Elements(1));
    hit.bench_function("dashmap_read_intrusive", |b| {
        b.iter(|| {
            let task = dash.get(black_box(&1)).unwrap();
            *task.lock() = black_box(1);
        })
    });
    hit.bench_function("papaya_guard_intrusive", |b| {
        b.iter(|| {
            let guard = papaya.guard();
            let task = papaya.get(black_box(&1), &guard).unwrap();
            *task.lock() = black_box(1);
        })
    });
    hit.finish();

    let mut insert = criterion.benchmark_group("papaya_map_insert_remove");
    insert.throughput(Throughput::Elements(1));
    insert.bench_function("dashmap", |b| {
        let map = DashMap::with_hasher(FxBuildHasher);
        let mut key = 1u32;
        b.iter(|| {
            let current = key;
            key = key.wrapping_add(1);
            map.entry(current)
                .or_insert_with(|| Box::new(CachePadded::new(Mutex::new(0))));
            black_box(map.remove(&current));
        })
    });
    insert.bench_function("papaya", |b| {
        let map = HashMap::with_hasher(FxBuildHasher);
        let mut key = 1u32;
        b.iter(|| {
            let current = key;
            key = key.wrapping_add(1);
            let guard = map.guard();
            map.get_or_insert_with(current, || CachePadded::new(Mutex::new(0)), &guard);
            black_box(map.remove(&current, &guard));
        })
    });
    insert.finish();

    let keys = [1, 65, 129, 193];
    let mut parallel = criterion.benchmark_group("papaya_map_parallel_independent");
    parallel.throughput(Throughput::Elements((keys.len() * OPS) as u64));
    parallel.bench_function("dashmap_read_intrusive", |b| {
        b.iter(|| {
            thread::scope(|scope| {
                for &key in &keys {
                    let map = &dash;
                    scope.spawn(move || {
                        for _ in 0..OPS {
                            let task = map.get(&key).unwrap();
                            *task.lock() = black_box(key as u64);
                        }
                    });
                }
            });
        })
    });
    parallel.bench_function("papaya_guard_intrusive", |b| {
        b.iter(|| {
            thread::scope(|scope| {
                for &key in &keys {
                    let map = &papaya;
                    scope.spawn(move || {
                        for _ in 0..OPS {
                            let guard = map.guard();
                            let task = map.get(&key, &guard).unwrap();
                            *task.lock() = black_box(key as u64);
                        }
                    });
                }
            });
        })
    });
    parallel.finish();

    let mut iteration = criterion.benchmark_group("papaya_map_iteration");
    iteration.throughput(Throughput::Elements(TASKS as u64));
    iteration.bench_function("dashmap_shards", |b| {
        b.iter(|| {
            let mut sum = 0u64;
            for item in dash.iter() {
                sum = sum.wrapping_add(*item.lock());
            }
            black_box(sum)
        })
    });
    iteration.bench_function("papaya_guard", |b| {
        b.iter(|| {
            let guard = papaya.guard();
            let mut sum = 0u64;
            for (_, task) in papaya.iter(&guard) {
                sum = sum.wrapping_add(*task.lock());
            }
            black_box(sum)
        })
    });
    iteration.finish();

    let mut snapshots = criterion.benchmark_group("papaya_snapshot_map_roundtrip");
    snapshots.throughput(Throughput::Elements(TASKS as u64));
    snapshots.bench_function("dashmap", |b| {
        b.iter_batched(
            || DashMap::with_hasher(FxBuildHasher),
            |map| {
                for id in 1..=TASKS {
                    map.insert(id, id as u64);
                }
                for id in 1..=TASKS {
                    black_box(map.remove(&id));
                }
            },
            BatchSize::LargeInput,
        )
    });
    snapshots.bench_function("papaya", |b| {
        b.iter_batched(
            || HashMap::with_hasher(FxBuildHasher),
            |map| {
                let guard = map.guard();
                for id in 1..=TASKS {
                    map.insert(id, id as u64, &guard);
                }
                for id in 1..=TASKS {
                    black_box(map.remove(&id, &guard));
                }
            },
            BatchSize::LargeInput,
        )
    });
    snapshots.finish();
}
