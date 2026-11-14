//! Benchmarks read contention: many tasks reading the same Vc concurrently.
//!
//! Each timed run creates `width` fresh `reader` tasks (keyed by a per-run `seed`), and every
//! reader awaits its source Vc `reads` times. In the `shared_*` variants all readers read the
//! *same* Vc, in the `distinct_mutable` control every reader reads its own Vc, so there is no
//! contention on a single task. `immutable` sources have no dependencies and become immutable;
//! `mutable` sources depend on a `State` (which is never changed here), so tracked reads have to
//! maintain dependency edges.
//!
//! To keep the graph from growing across samples, every sample (`iter_custom` call) uses a fresh
//! `TurboTasks` instance. It is warmed up with one untimed run of the same shape (which creates
//! the source tasks), so only the readers are new in the timed runs. All results are asserted.
//!
//! The number of tokio worker threads defaults to the available parallelism and can be set to a
//! comma-separated list via `TURBO_BENCH_THREADS`:
//!
//! ```bash
//! TURBO_BENCH_THREADS=1,8,32 cargo bench -p turbo-tasks-backend --bench mod -- hot_read
//! ```

use std::time::{Duration, Instant};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[turbo_tasks::value(transparent)]
struct Input(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input(State::new(0)).cell()
}

/// Immutable source: no dependencies, so it is marked immutable after its first execution.
#[turbo_tasks::function]
fn immutable_source(key: u32) -> Vc<u32> {
    Vc::cell(key)
}

/// Mutable source: depends on a `State`, so it can be invalidated and is never immutable.
#[turbo_tasks::function]
async fn mutable_source(input: ResolvedVc<Input>, key: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*input.await?.get() + key))
}

type Mode = u8;
const SHARED_IMMUTABLE: Mode = 0;
const SHARED_MUTABLE: Mode = 1;
const DISTINCT_MUTABLE: Mode = 2;

/// The value the source of reader `index` has (the state is always 0).
fn source_value(mode: Mode, index: u32) -> u32 {
    match mode {
        DISTINCT_MUTABLE => index + 1,
        _ => 0,
    }
}

#[turbo_tasks::function]
async fn reader(
    input: ResolvedVc<Input>,
    mode: Mode,
    seed: u32,
    index: u32,
    reads: u32,
) -> Result<Vc<u32>> {
    // `seed` is only part of the task key, so every timed run creates new reader tasks.
    let _ = seed;
    let source = match mode {
        SHARED_IMMUTABLE => immutable_source(0),
        SHARED_MUTABLE => mutable_source(*input, 0),
        DISTINCT_MUTABLE => mutable_source(*input, index + 1),
        _ => unreachable!(),
    };
    let mut sum = 0u32;
    for _ in 0..reads {
        sum = sum.wrapping_add(*source.await?);
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
async fn hot_read_root(
    input: ResolvedVc<Input>,
    mode: Mode,
    seed: u32,
    width: u32,
    reads: u32,
) -> Result<Vc<u32>> {
    let values = (0..width)
        .map(|index| reader(*input, mode, seed, index, reads))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values
            .iter()
            .fold(0u32, |sum, value| sum.wrapping_add(**value)),
    ))
}

fn expected_sum(mode: Mode, width: u32, reads: u32) -> u32 {
    (0..width).fold(0u32, |sum, index| {
        sum.wrapping_add(source_value(mode, index).wrapping_mul(reads))
    })
}

fn thread_counts() -> Vec<usize> {
    std::env::var("TURBO_BENCH_THREADS")
        .ok()
        .map(|s| s.split(',').map(|v| v.trim().parse().unwrap()).collect())
        .unwrap_or_else(|| {
            vec![
                std::thread::available_parallelism()
                    .map(|v| v.get())
                    .unwrap_or(4),
            ]
        })
}

/// Creates a fresh instance, warms it up and times `iters` runs with fresh readers.
async fn run_sample(mode: Mode, width: u32, reads: u32, iters: u64) -> Duration {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));
    let expected = expected_sum(mode, width, reads);
    let total = tt
        .run_once(async move {
            let input_op = create_input();
            let input = input_op.resolve().strongly_consistent().await?;
            // Untimed warm-up run of the same shape: creates the source tasks (and makes the
            // immutable one immutable).
            let sum = *hot_read_root(input, mode, u32::MAX, width, reads)
                .read_strongly_consistent()
                .await?;
            assert_eq!(sum, expected);

            let mut total = Duration::ZERO;
            for seed in 0..iters {
                let start = Instant::now();
                let sum = *hot_read_root(input, mode, seed as u32, width, reads)
                    .read_strongly_consistent()
                    .await?;
                total += start.elapsed();
                assert_eq!(sum, expected);
            }
            Ok(total)
        })
        .await
        .unwrap();
    tt.stop_and_wait().await;
    total
}

pub fn hot_read(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_hot_read");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(5));

    let width = 20_000u32;
    for threads in thread_counts() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(threads)
            .enable_all()
            .build()
            .unwrap();
        for (mode, mode_name) in [
            (SHARED_IMMUTABLE, "shared_immutable"),
            (SHARED_MUTABLE, "shared_mutable"),
            (DISTINCT_MUTABLE, "distinct_mutable"),
        ] {
            for reads in [1u32, 16] {
                group.throughput(Throughput::Elements((width * reads) as u64));
                let id = BenchmarkId::new(
                    format!("{mode_name}/reads_{reads}"),
                    format!("threads_{threads}"),
                );
                group.bench_function(id, |b| {
                    b.to_async(&rt)
                        .iter_custom(|iters| run_sample(mode, width, reads, iters));
                });
            }
        }
    }

    group.finish();
}
