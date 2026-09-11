//! Benchmarks for the `parent_count` garbage-collection pass ([`TurboTasksBackend::gc_collect`],
//! driven here via the `gc_for_testing` hook).
//!
//! Gated behind `TURBOPACK_BENCH_GC` because the per-iteration setup is expensive. Run with:
//!
//! ```bash
//! TURBOPACK_BENCH_GC=1 cargo bench -p turbo-tasks-backend --bench mod -- gc
//! ```

use std::{sync::Arc, time::Duration};

use anyhow::Result;
use criterion::{BatchSize, BenchmarkId, Criterion, Throughput};
use tokio::runtime::Runtime;
use turbo_tasks::{ResolvedVc, State, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, StorageMode,
    TurboTasksBackend,
};

fn enabled() -> bool {
    !matches!(
        std::env::var("TURBOPACK_BENCH_GC").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    )
}

/// A persistent backend with GC-relevant options
fn create_tt() -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    let dir = tempfile::Builder::new()
        .prefix("gc-bench-")
        .tempdir_in(&parent)
        .unwrap();
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: None,
            small_preallocation: false,
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            gc: Some(true),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "bench-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_ci: false,
                is_short_session: true,
                skip_compaction: true,
            },
        )
        .unwrap()
        .0,
    ));
    (tt, dir)
}

#[turbo_tasks::value(transparent)]
struct Generation(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_generation() -> Vc<Generation> {
    Generation(State::new(0)).cell()
}

// TREE shape: a `BRANCHING`-ary tree of `subtree` nodes over `width` leaves. Bumping the
// generation disconnects the whole previous tree.
//
// The depth matters. A node's `distance` is `children.ilog2() * 2` and, while a parent is still a
// leaf, its children start at `parent_effective + 3` — so `effective` climbs down the levels and
// crosses `LEAF_NUMBER` (16), which is the transition that turns a node's children into
// `followers`. The previous flat root -> intermediate -> leaf shape never crossed it and so
// produced *no follower edges at all*, leaving the aggregation-rebalance half of a collect
// completely unmeasured.

const BRANCHING: u32 = 4;

#[turbo_tasks::function]
fn wide_leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1_000_003).wrapping_add(index))
}

#[turbo_tasks::function]
async fn subtree(generation: u32, index: u32, span: u32) -> Result<Vc<u32>> {
    if span <= 1 {
        return Ok(Vc::cell(1 + *wide_leaf(generation, index).await?));
    }
    let child_span = span.div_ceil(BRANCHING);
    let mut sum = 0u32;
    let mut start = index;
    while start < index + span {
        let this_span = child_span.min(index + span - start);
        sum = sum.wrapping_add(*subtree(generation, start, this_span).await?);
        start += this_span;
    }
    Ok(Vc::cell(sum))
}

/// A *retained* interior node: keyed on `index`/`span` only, so the same task survives every
/// generation bump and re-executes with new children. This reproduces the common real shape —
/// a live parent whose children are collected out from under it — where sibling children go
/// garbage together, are found independently by the shard scan, and are collected concurrently
/// while both mutate this parent's aggregation state.
#[turbo_tasks::function]
async fn live_parent(generation: ResolvedVc<Generation>, index: u32, span: u32) -> Result<Vc<u32>> {
    let generation_value = *generation.await?.get();
    Ok(Vc::cell(*subtree(generation_value, index, span).await?))
}

#[turbo_tasks::function(operation, root)]
async fn wide_root(generation: ResolvedVc<Generation>, width: u32) -> Result<Vc<u32>> {
    let child_span = width.div_ceil(BRANCHING);
    let mut sum = 0u32;
    let mut start = 0;
    while start < width {
        let this_span = child_span.min(width - start);
        sum = sum.wrapping_add(*live_parent(*generation, start, this_span).await?);
        start += this_span;
    }
    Ok(Vc::cell(sum))
}

/// Tasks in one generation: every `subtree` node plus every leaf. Mirrors `subtree`'s recursion.
fn generation_task_count(width: u32) -> u64 {
    fn count(span: u32) -> u64 {
        if span <= 1 {
            return 2;
        }
        let child_span = span.div_ceil(BRANCHING);
        let mut total = 1;
        let mut start = 0;
        while start < span {
            let this_span = child_span.min(span - start);
            total += count(this_span);
            start += this_span;
        }
        total
    }
    let child_span = width.max(1).div_ceil(BRANCHING);
    let mut total = 0;
    let mut start = 0;
    while start < width.max(1) {
        let this_span = child_span.min(width.max(1) - start);
        total += count(this_span);
        start += this_span;
    }
    total
}

/// Build generation 0 of the WIDE graph then bump to generation 1, leaving generation 0 fully
/// disconnected (garbage) and resident. Returns the backend ready for a timed collect.
fn setup_wide_garbage(
    rt: &Runtime,
    width: u32,
) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    rt.block_on(async move {
        // `TurboTasks::new` builds a `PriorityRunner` that calls `Handle::current()`, so the
        // backend must be constructed inside the runtime context.
        let (tt, dir) = create_tt();
        turbo_tasks::run_once(tt.clone(), async move {
            let generation_op = create_generation();
            let generation_vc = generation_op.resolve().strongly_consistent().await?;
            let generation = generation_op.read_strongly_consistent().await?;
            wide_root(generation_vc, width)
                .read_strongly_consistent()
                .await?;
            generation.set(1);
            wide_root(generation_vc, width)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        (tt, dir)
    })
}

pub fn gc(c: &mut Criterion) {
    if !enabled() {
        return;
    }

    let mut group = c.benchmark_group("turbo_tasks_backend_gc");
    group.measurement_time(Duration::from_secs(20));
    group.sample_size(10);

    for width in [5_000u32, 25_000, 100_000] {
        // Every `subtree` node plus every leaf becomes garbage.
        let garbage = generation_task_count(width);
        group.throughput(Throughput::Elements(garbage));
        group.bench_with_input(BenchmarkId::new("wide", garbage), &width, |b, &width| {
            // Must match `create_tt`'s `num_workers`.
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .worker_threads(std::thread::available_parallelism().map_or(4, |n| n.get()))
                .build()
                .unwrap();
            // Each collect consumes its garbage, so every iteration needs a freshly
            // built+disconnected graph. Setup is not timed.
            b.iter_batched(
                || setup_wide_garbage(&rt, width),
                |(tt, _dir)| {
                    let collected = rt.block_on(async { tt.backend().gc_for_testing(&tt) });
                    (collected, tt, _dir)
                },
                BatchSize::PerIteration,
            );
        });
    }

    group.finish();
}
