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
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
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

// WIDE shape: root -> `width` intermediates, each -> a leaf (2 tasks per index). Bumping the
// generation disconnects the whole previous generation, so a collect tears down ~2*width tasks and
// exercises the per-task fan-out plus a one-level cascade (intermediate -> its leaf).

#[turbo_tasks::function]
fn wide_leaf(generation: u32, index: u32) -> Vc<u32> {
    Vc::cell(generation.wrapping_mul(1_000_003).wrapping_add(index))
}

#[turbo_tasks::function]
async fn wide_intermediate(generation: u32, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *wide_leaf(generation, index).await?))
}

#[turbo_tasks::function(operation, root)]
async fn wide_root(generation: ResolvedVc<Generation>, width: u32) -> Result<Vc<u32>> {
    let generation = *generation.await?.get();
    let mut sum = 0u32;
    for index in 0..width {
        sum = sum.wrapping_add(*wide_intermediate(generation, index).await?);
    }
    Ok(Vc::cell(sum))
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
            unmark_top_level_task_may_leak_eventually_consistent_state();
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
        // ~2 tasks per index become garbage (intermediate + leaf).
        let garbage = (2 * width) as u64;
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
