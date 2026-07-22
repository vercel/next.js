//! Benchmarks for the `parent_count` garbage-collection pass ([`TurboTasksBackend::gc_collect`],
//! driven here via the `gc_for_testing` hook).
//!
//! Only the collect pass is timed: each iteration's setup builds a fresh backend, materializes a
//! large graph, and disconnects it (turning it into garbage) — none of which is measured. The
//! routine then times a single GC pass over that garbage. Throughput is reported in tasks
//! collected per second, so regressions/improvements in GC scaling are directly visible.
//!
//! Gated behind `TURBOPACK_BENCH_GC` (like the other stress benches) because the per-iteration
//! setup is expensive. Enable with e.g.:
//!
//! ```bash
//! TURBOPACK_BENCH_GC=1 cargo bench -p turbo-tasks-backend --bench mod -- gc
//! ```

use std::sync::Arc;

use anyhow::Result;
use criterion::{BatchSize, BenchmarkId, Criterion, Throughput};
use tokio::runtime::Runtime;
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, EvictionMode, GitVersionInfo, TurboTasksBackend};

fn enabled() -> bool {
    !matches!(
        std::env::var("TURBOPACK_BENCH_GC").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    )
}

/// A persistent backend with GC-relevant options. Each benchmark iteration gets a fresh one (the
/// `TempDir` is returned so it lives as long as the backend). GC is invoked directly via
/// `gc_for_testing`, which does not consult the `TURBO_ENGINE_GC` env var, so nothing global needs
/// setting.
fn create_tt() -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    let dir = tempfile::Builder::new()
        .prefix("gc-bench-")
        .tempdir_in(&parent)
        .unwrap();
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(std::thread::available_parallelism().map_or(4, |n| n.get())),
            small_preallocation: false,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "bench-unversioned",
                dirty: false,
            },
            false,
            true,
            true,
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

// --- WIDE shape: root -> `width` intermediates, each -> a leaf (2 tasks per index). Bumping the
// generation disconnects the whole previous generation, so a collect tears down ~2*width tasks and
// exercises the chunked per-task fan-out plus a one-level cascade (intermediate -> its leaf). ---

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
    // Setup dominates wall time and each sample runs a full pass over a large graph; keep the
    // sample count modest.
    group.sample_size(10);

    for width in [5_000u32, 25_000, 100_000] {
        // ~2 tasks per index become garbage (intermediate + leaf).
        let garbage = (2 * width) as u64;
        group.throughput(Throughput::Elements(garbage));
        group.bench_with_input(BenchmarkId::new("wide", garbage), &width, |b, &width| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            // PerIteration: each collect consumes its garbage, so every iteration needs a freshly
            // built+disconnected graph. Setup is not timed.
            b.iter_batched(
                || setup_wide_garbage(&rt, width),
                |(tt, _dir)| {
                    // `gc_for_testing` is synchronous but internally uses `scope_unbounded`,
                    // which needs a tokio runtime context (spawns helpers / may `block_in_place`),
                    // so run it on a runtime worker via `block_on`. The block_on wrapper is a fixed
                    // few-µs overhead, negligible next to the ms-scale pass and constant across
                    // samples.
                    let collected = rt.block_on(async { tt.backend().gc_for_testing(&tt) });
                    // Return the backend so its (large) teardown happens on criterion's drop path,
                    // not inside the measured routine.
                    (collected, tt, _dir)
                },
                BatchSize::PerIteration,
            );
        });
    }

    group.finish();
}
