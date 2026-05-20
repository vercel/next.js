//! Direct comparison between `TinyVec<T>` and the standard `Vec<T>` on the
//! operations that `TaskStorage::lazy` actually exercises:
//!
//!   * `push` — appending one element at a time, growing through capacity boundaries.
//!   * `iter` — linear scan (this is how `find_lazy(id)` works under the hood).
//!
//! These are micro-benchmarks: the values pushed are small `(u8, u64)` pairs to
//! mimic `LazyField`'s ~48 B size without dragging in the entire schema. The
//! goal is to validate that switching `lazy` from `Vec` to `TinyVec` doesn't
//! cost throughput at the API level, since `Vec::push` is heavily optimized
//! and our hand-rolled `TinyVec::push` is not.

use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use turbo_tasks::TinyVec;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

/// A stand-in for `LazyField`: 16 B payload so the per-element work mirrors the
/// real storage layout (without needing the whole schema).
#[derive(Clone, Copy)]
#[allow(dead_code)]
struct Item {
    tag: u64,
    payload: u64,
}

fn make_item(i: u64) -> Item {
    Item {
        tag: i,
        payload: i.wrapping_mul(0x9E37_79B9_7F4A_7C15),
    }
}

/// Push N items into a fresh `Vec`. Returns the populated container so the
/// allocator drop cost is included in the measurement.
fn push_vec(n: usize) -> Vec<Item> {
    let mut v: Vec<Item> = Vec::new();
    for i in 0..n {
        v.push(make_item(i as u64));
    }
    v
}

fn push_tinyvec(n: usize) -> TinyVec<Item> {
    let mut v: TinyVec<Item> = TinyVec::default();
    for i in 0..n {
        v.push(make_item(i as u64));
    }
    v
}

/// Sum all items via iter — the linear scan pattern.
#[allow(clippy::ptr_arg)] // for clarity
fn iter_vec(v: &Vec<Item>) -> u64 {
    let mut acc: u64 = 0;
    for it in v.iter() {
        acc = acc.wrapping_add(it.tag).wrapping_add(it.payload);
    }
    acc
}

fn iter_tinyvec(v: &TinyVec<Item>) -> u64 {
    let mut acc: u64 = 0;
    for it in v.iter() {
        acc = acc.wrapping_add(it.tag).wrapping_add(it.payload);
    }
    acc
}

pub fn bench(c: &mut Criterion) {
    // Sizes chosen to cover the realistic `TaskStorage::lazy` range:
    //   0   — empty (steady state for many tasks)
    //   1   — single field set (very common)
    //   4   — Vec's first grow boundary (1 -> 2 -> 4 -> 8 ...)
    //   8   — past the first few grows, full cache line worth of items
    //   16  — fits in our `u8` cap with headroom
    //   24  — close to the realistic max (~25 lazy fields in the schema)
    let sizes = [0usize, 1, 4, 8, 16, 24];

    // --- push -----------------------------------------------------------------

    let mut group = c.benchmark_group("tiny_vec/push");
    group.sample_size(200);
    for &n in &sizes {
        group.bench_with_input(BenchmarkId::new("Vec", n), &n, |b, &n| {
            b.iter(|| {
                let v = push_vec(black_box(n));
                black_box(v);
            });
        });
        group.bench_with_input(BenchmarkId::new("TinyVec", n), &n, |b, &n| {
            b.iter(|| {
                let v = push_tinyvec(black_box(n));
                black_box(v);
            });
        });
    }
    group.finish();

    // --- iter -----------------------------------------------------------------

    let mut group = c.benchmark_group("tiny_vec/iter");
    group.sample_size(200);
    for &n in &sizes {
        // Pre-fill once outside the timed region.
        let v: Vec<Item> = push_vec(n);
        let tv: TinyVec<Item> = push_tinyvec(n);
        group.bench_with_input(BenchmarkId::new("Vec", n), &n, |b, _| {
            b.iter(|| black_box(iter_vec(black_box(&v))));
        });
        group.bench_with_input(BenchmarkId::new("TinyVec", n), &n, |b, _| {
            b.iter(|| black_box(iter_tinyvec(black_box(&tv))));
        });
    }
    group.finish();
}

criterion_group!(tiny_vec_benches, bench);
criterion_main!(tiny_vec_benches);
