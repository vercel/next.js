//! Benchmarks invalidation fan-out: one cell that is read by many dependent tasks changes, so all
//! of them are made dirty and scheduled at once (`update_cell` → `invalidate_cell_dependents`).
//!
//! The graph is built once per size. Each iteration changes a `State`, which recomputes the
//! `source` task and updates its cell, which invalidates all `width` `dependent` tasks. The timing
//! covers invalidation, scheduling and re-execution of all dependents until a strongly consistent
//! read of the root returns.
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- cell_fan_out
//! ```

use std::{
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[turbo_tasks::value(transparent)]
struct Input(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input(State::new(0)).cell()
}

/// The task whose cell fans out to all dependents.
#[turbo_tasks::function]
async fn source(input: ResolvedVc<Input>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.get()))
}

#[turbo_tasks::function]
async fn dependent(input: ResolvedVc<Input>, index: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(source(*input).await?.wrapping_add(index)))
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

async fn change_and_read(input_op: OperationVc<Input>, width: u32, value: u32) -> Result<Duration> {
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

pub fn cell_fan_out(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_cell_fan_out");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(10));

    for width in [1_000u32, 10_000, 100_000] {
        group.throughput(Throughput::Elements(width as u64));
        group.bench_with_input(BenchmarkId::new("width", width), &width, |b, &width| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            // `TurboTasks::new` builds a `PriorityRunner` that calls `Handle::current()`, so the
            // backend must be constructed inside the runtime context.
            let tt = rt.block_on(async {
                TurboTasks::new(TurboTasksBackend::new(
                    BackendOptions {
                        storage_mode: None,
                        ..Default::default()
                    },
                    noop_backing_storage(),
                ))
            });
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

            let next_value = Arc::new(AtomicU32::new(1));
            b.to_async(&rt).iter_custom(|iters| {
                let tt = tt.clone();
                let next_value = next_value.clone();
                async move {
                    tt.run_once(async move {
                        let mut total = Duration::ZERO;
                        for _ in 0..iters {
                            let value = next_value.fetch_add(1, Ordering::Relaxed);
                            total += change_and_read(input_op, width, value).await?;
                        }
                        Ok(total)
                    })
                    .await
                    .unwrap()
                }
            });
            rt.block_on(async { tt.stop_and_wait().await });
        });
    }

    group.finish();
}
