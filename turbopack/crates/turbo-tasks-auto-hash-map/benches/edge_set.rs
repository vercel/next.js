//! `EdgeSet` vs `AutoSet` on how a task's forward edge sets are used: built by inserting one
//! edge at a time during an execution, shrunk when it completes, then iterated.
//!
//! Keys are `u32`s (like `TaskId`) and 16 byte pairs (like `(CellRef, CellKey)`), inserted in
//! random order (dependencies on existing tasks) or ascending order (freshly created children).
//! Lookups compare a completed (flat) set, as other tasks see it, and an inflated one.

use std::{hash::BuildHasherDefault, hint::black_box};

use auto_hash_map::{AutoSet, EdgeSet};
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use rustc_hash::FxHasher;

type Fx = BuildHasherDefault<FxHasher>;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

const SIZES: [usize; 5] = [8, 64, 512, 4096, 32768];

fn keys(n: usize, random: bool) -> Vec<u32> {
    let mut state = 0x9E37_79B9_7F4A_7C15u64;
    (0..n as u32)
        .map(|i| {
            if random {
                state = state
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                (state >> 33) as u32
            } else {
                i + 1
            }
        })
        .collect()
}

fn wide(key: u32) -> (u64, u64) {
    (key as u64, (key as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
}

fn bench_build(c: &mut Criterion) {
    for random in [true, false] {
        let order = if random { "random" } else { "ascending" };
        let mut group = c.benchmark_group(format!("build_shrink_iter/u32/{order}"));
        for n in SIZES {
            let keys = keys(n, random);
            group.bench_with_input(BenchmarkId::new("AutoSet", n), &keys, |b, keys| {
                b.iter(|| {
                    let mut set = AutoSet::<u32, Fx, 6>::default();
                    for &k in keys {
                        set.insert(k);
                    }
                    set.shrink_to_fit();
                    black_box(set.iter().fold(0u32, |a, &k| a ^ k));
                    set
                })
            });
            group.bench_with_input(BenchmarkId::new("EdgeSet", n), &keys, |b, keys| {
                b.iter(|| {
                    let mut set = EdgeSet::<u32, 6>::new();
                    for &k in keys {
                        set.insert(k);
                    }
                    set.shrink_to_fit();
                    black_box(set.iter().fold(0u32, |a, &k| a ^ k));
                    set
                })
            });
        }
        group.finish();

        let mut group = c.benchmark_group(format!("build_shrink_iter/16B/{order}"));
        for n in SIZES {
            let keys: Vec<_> = keys(n, random).into_iter().map(wide).collect();
            group.bench_with_input(BenchmarkId::new("AutoSet", n), &keys, |b, keys| {
                b.iter(|| {
                    let mut set = AutoSet::<(u64, u64), Fx, 1>::default();
                    for &k in keys {
                        set.insert(k);
                    }
                    set.shrink_to_fit();
                    black_box(set.iter().fold(0u64, |a, k| a ^ k.0));
                    set
                })
            });
            group.bench_with_input(BenchmarkId::new("EdgeSet", n), &keys, |b, keys| {
                b.iter(|| {
                    let mut set = EdgeSet::<(u64, u64), 1>::new();
                    for &k in keys {
                        set.insert(k);
                    }
                    set.shrink_to_fit();
                    black_box(set.iter().fold(0u64, |a, k| a ^ k.0));
                    set
                })
            });
        }
        group.finish();
    }
}

fn bench_contains(c: &mut Criterion) {
    let mut group = c.benchmark_group("contains/u32/random");
    for n in SIZES {
        let keys = keys(n, true);
        // Half hits, half misses.
        let lookups: Vec<u32> = keys
            .iter()
            .take(128)
            .flat_map(|&k| [k, k ^ 0x8000_0000])
            .collect();
        let auto: AutoSet<u32, Fx, 6> = keys.iter().copied().collect();
        // A completed set, as other tasks look it up: a flat array, scanned.
        let flat: EdgeSet<u32, 6> = keys.iter().copied().collect();
        let mut inflated = flat.clone();
        inflated.inflate();
        group.bench_with_input(BenchmarkId::new("AutoSet", n), &lookups, |b, lookups| {
            b.iter(|| lookups.iter().filter(|&k| auto.contains(k)).count())
        });
        group.bench_with_input(
            BenchmarkId::new("EdgeSet/flat", n),
            &lookups,
            |b, lookups| b.iter(|| lookups.iter().filter(|k| flat.contains(k)).count()),
        );
        group.bench_with_input(
            BenchmarkId::new("EdgeSet/inflated", n),
            &lookups,
            |b, lookups| b.iter(|| lookups.iter().filter(|k| inflated.contains(k)).count()),
        );
    }
    group.finish();
}

criterion_group!(benches, bench_build, bench_contains);
criterion_main!(benches);
