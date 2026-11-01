//! Benchmarks invalidating many tasks from outside: one `State` is read directly by `width`
//! dependent tasks, so `State::set` invalidates all of them through their invalidators
//! (`Invalidator` → `TurboTasksApi` → `Backend`).
//!
//! The graph is built once per configuration. Each iteration sets the state and reads the root
//! strongly consistently; the timing covers invalidation, scheduling and re-execution of all
//! dependents. In the `evicted` variant all tasks are snapshotted and evicted before each
//! iteration (not timed), so the invalidation also has to restore the dependents from disk.
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- state_fan_out
//! ```

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, StorageMode,
    TurboTasksBackend,
};

#[turbo_tasks::value(transparent)]
struct Input(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input(State::new(0)).cell()
}

/// Reads the state directly, so it is one of the state's invalidators.
#[turbo_tasks::function]
async fn dependent(input: ResolvedVc<Input>, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(input.await?.get().wrapping_add(index)))
}

#[turbo_tasks::function(operation, root)]
async fn fan_out_root(input: ResolvedVc<Input>, width: u32) -> Result<Vc<u32>> {
    let values = (0..width)
        .map(|index| dependent(*input, index))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values
            .iter()
            .fold(0u32, |sum, value| sum.wrapping_add(**value)),
    ))
}

/// The sum `fan_out_root` computes when the state is `value`.
fn expected_sum(value: u32, width: u32) -> u32 {
    (0..width).fold(0u32, |sum, index| {
        sum.wrapping_add(value.wrapping_add(index))
    })
}

fn create_tt() -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    let dir = tempfile::Builder::new()
        .prefix("state-fan-out-bench-")
        .tempdir_in(&parent)
        .unwrap();
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            // Snapshots are only taken explicitly (`snapshot_and_evict_for_testing`).
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
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

async fn set_and_read(input_op: OperationVc<Input>, width: u32, value: u32) -> Result<Duration> {
    let input = input_op.resolve().strongly_consistent().await?;
    let state = input_op.read_strongly_consistent().await?;
    let start = Instant::now();
    state.set(value);
    let sum = *fan_out_root(input, width)
        .read_strongly_consistent()
        .await?;
    let elapsed = start.elapsed();
    assert_eq!(sum, expected_sum(value, width));
    Ok(elapsed)
}

pub fn state_fan_out(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_state_fan_out");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(10));

    for evict in [false, true] {
        let variant = if evict { "evicted" } else { "resident" };
        for width in [1u32, 1_000, 10_000] {
            group.throughput(Throughput::Elements(width as u64));
            group.bench_with_input(BenchmarkId::new(variant, width), &width, |b, &width| {
                let rt = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                // `TurboTasks::new` needs the runtime context.
                let (tt, _dir) = rt.block_on(async { create_tt() });
                // Build the graph once (not timed).
                let input_op = rt
                    .block_on(tt.run_once(async move {
                        let input_op = create_input();
                        let input = input_op.resolve().strongly_consistent().await?;
                        let sum = *fan_out_root(input, width)
                            .read_strongly_consistent()
                            .await?;
                        assert_eq!(sum, expected_sum(0, width));
                        Ok(input_op)
                    }))
                    .unwrap();

                let mut next_value = 1u32;
                b.iter_custom(|iters| {
                    let mut total = Duration::ZERO;
                    for _ in 0..iters {
                        if evict {
                            let _guard = rt.enter();
                            let counts = tt
                                .backend()
                                .snapshot_and_evict_for_testing(&tt)
                                .eviction_counts;
                            // Every dependent must have been evicted, so the invalidation has to
                            // restore it.
                            let evicted = counts.full + counts.data_and_meta + counts.data_only;
                            assert!(
                                evicted >= width as usize,
                                "expected at least {width} evicted tasks, got {counts:?}"
                            );
                        }
                        let value = next_value;
                        next_value = next_value.wrapping_add(1);
                        total += rt
                            .block_on(tt.run_once(async move {
                                set_and_read(input_op, width, value).await
                            }))
                            .unwrap();
                    }
                    total
                });
                rt.block_on(async { tt.stop_and_wait().await });
            });
        }
    }

    group.finish();
}
