//! Microbenchmarks: tt_parallel vs rayon vs serial on fork-join workloads.
//!
//! Run: `cargo bench -p turbo-tasks-parallel`

use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use tt_parallel::{Config, Pool, WorkerHandle};

/// A little CPU work per node so the benchmark isn't pure scheduling overhead.
fn spin(mut x: u64, n: u32) -> u64 {
    for _ in 0..n {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
    }
    x
}

// Recursive fork-join sum over a balanced binary tree of `2^depth` leaves.
fn tt_tree_sum(w: &WorkerHandle, lo: u64, hi: u64, work: u32) -> u64 {
    if hi - lo <= 1 {
        return spin(lo, work);
    }
    let mid = lo + (hi - lo) / 2;
    let (l, r) = w.join(
        |w| tt_tree_sum(w, lo, mid, work),
        move |w| tt_tree_sum(w, mid, hi, work),
    );
    l ^ r
}

fn rayon_tree_sum(lo: u64, hi: u64, work: u32) -> u64 {
    if hi - lo <= 1 {
        return spin(lo, work);
    }
    let mid = lo + (hi - lo) / 2;
    let (l, r) = rayon::join(
        || rayon_tree_sum(lo, mid, work),
        || rayon_tree_sum(mid, hi, work),
    );
    l ^ r
}

fn serial_tree_sum(lo: u64, hi: u64, work: u32) -> u64 {
    if hi - lo <= 1 {
        return spin(lo, work);
    }
    let mid = lo + (hi - lo) / 2;
    serial_tree_sum(lo, mid, work) ^ serial_tree_sum(mid, hi, work)
}

fn bench(c: &mut Criterion) {
    let pool = Pool::new(Config::default());
    let rpool = rayon::ThreadPoolBuilder::new().build().unwrap();

    for (leaves, work) in [
        (1u64 << 12, 5000u32),
        (1u64 << 14, 200u32),
        (1u64 << 18, 50),
    ] {
        let mut g = c.benchmark_group(format!("tree_sum/leaves={leaves}/work={work}"));
        g.bench_function(BenchmarkId::new("serial", ""), |b| {
            b.iter(|| black_box(serial_tree_sum(0, black_box(leaves), black_box(work))))
        });
        g.bench_function(BenchmarkId::new("rayon", ""), |b| {
            b.iter(|| {
                rpool.install(|| black_box(rayon_tree_sum(0, black_box(leaves), black_box(work))))
            })
        });
        g.bench_function(BenchmarkId::new("tt_parallel", ""), |b| {
            b.iter(|| black_box(pool.run(move |w| tt_tree_sum(w, 0, leaves, work))))
        });
        g.finish();
    }
}

criterion_group!(benches, bench);
criterion_main!(benches);
