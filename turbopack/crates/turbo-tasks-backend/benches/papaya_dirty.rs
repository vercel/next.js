use std::{
    hint::black_box,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
};

use concurrent_queue::ConcurrentQueue;
use criterion::{BatchSize, BenchmarkId, Criterion, Throughput};
use papaya::HashMap;
use rustc_hash::FxBuildHasher;

const TASKS: u32 = 100_000;

fn map_with_dirty(dirty: u32) -> HashMap<u32, AtomicBool, FxBuildHasher> {
    let map = HashMap::with_capacity_and_hasher(TASKS as usize, FxBuildHasher);
    let guard = map.guard();
    for task_id in 0..TASKS {
        map.insert(task_id, AtomicBool::new(task_id < dirty), &guard);
    }
    drop(guard);
    map
}

pub fn papaya_dirty(criterion: &mut Criterion) {
    let mut mark = criterion.benchmark_group("papaya_dirty_mark_all");
    mark.throughput(Throughput::Elements(TASKS as u64));
    mark.bench_function("atomic_count", |b| {
        b.iter_batched(
            || AtomicU64::new(0),
            |count| {
                for _ in 0..TASKS {
                    black_box(count.fetch_add(1, Ordering::Relaxed));
                }
            },
            BatchSize::LargeInput,
        )
    });
    mark.bench_function("concurrent_queue", |b| {
        b.iter_batched(
            ConcurrentQueue::unbounded,
            |queue| {
                for task_id in 0..TASKS {
                    queue.push(black_box(task_id)).unwrap();
                }
            },
            BatchSize::LargeInput,
        )
    });
    mark.finish();

    for dirty in [1, 10, 100, 10_000, TASKS] {
        let map = map_with_dirty(dirty);
        let ids: Vec<_> = (0..dirty).collect();
        let mut process = criterion.benchmark_group("papaya_dirty_process");
        process.throughput(Throughput::Elements(dirty as u64));
        process.bench_with_input(BenchmarkId::new("full_scan", dirty), &dirty, |b, _| {
            b.iter(|| {
                let guard = map.guard();
                let count = map
                    .iter(&guard)
                    .filter(|(_, dirty)| dirty.load(Ordering::Relaxed))
                    .count();
                black_box(count)
            })
        });
        process.bench_with_input(BenchmarkId::new("queued_ids", dirty), &dirty, |b, _| {
            b.iter(|| {
                let guard = map.guard();
                let count = ids
                    .iter()
                    .filter(|task_id| {
                        map.get(*task_id, &guard)
                            .is_some_and(|dirty| dirty.load(Ordering::Relaxed))
                    })
                    .count();
                black_box(count)
            })
        });
        process.finish();
    }
}
