//! Benchmarks the scheduler under many concurrently queued tasks with many distinct priorities.
//!
//! The graph is a layered DAG of `depth` layers with `width` nodes each. Every node of layer 0
//! reads one shared `State`, and every node of a higher layer reads two nodes of the layer below.
//! Every node mixes its inputs, so a changed state changes every node, and the root mixes the
//! values of the last layer.
//!
//! - `warm`: the graph is built once (not timed). Each iteration sets the state, which changes and
//!   re-executes all nodes, and reads the root strongly consistently. The re-executed tasks are
//!   scheduled with invalidation priorities derived from their leaf distance. Over an iteration
//!   there are about `depth` distinct priorities, with many tasks queued per priority, like in a
//!   warm build with many changes.
//! - `initial`: each iteration builds the graph from scratch in a fresh `TurboTasks` instance, so
//!   all tasks are scheduled with the initial priority, like in an initial build.
//!
//! These two are stress variants: every warm iteration changes every node, and the bulk of the
//! aggregation updates go to one root task. The `realistic_warm` and `realistic_initial` variants
//! (see `priority_contention_realistic.rs`) use the same graph sizes with partial invalidation and
//! cutoff, an irregular shape, hierarchical fan-in, per-task work and tasks that wait for queued
//! work they claim, so that the priorities and claims of their queued jobs resemble a real warm or
//! cold build.
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- priority_contention
//! ```
//!
//! ## Fixed-work mode (for comparing peak memory)
//!
//! Criterion picks the number of iterations per sample from the measured time, so a faster
//! scheduler runs more warm iterations per fixture, and warm iterations of the realistic variants
//! keep creating new cached tasks. Peak memory of a Criterion run therefore depends on the speed.
//! To compare peak memory with the same amount of work, set `PRIORITY_CONTENTION_FIXED_WORK` to a
//! variant id (e.g. `realistic_warm/32x2048`): instead of the benchmarks, that variant runs the
//! samples of [`FIXED_WORK_SCHEDULE`] (each like one Criterion sample: a fresh fixture or runtime
//! running that many iterations) and prints one `PRIORITY_CONTENTION_FIXED_WORK ...` summary line.
//!
//! ```bash
//! PRIORITY_CONTENTION_FIXED_WORK=realistic_warm/32x2048 \
//!   cargo bench -p turbo-tasks-backend --bench mod -- priority_contention
//! ```

use std::{
    sync::{
        Arc, LazyLock,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

use crate::priority_contention_realistic;

/// `(depth, width)` of the benchmarked graphs.
pub(crate) const SIZES: [(u32, u32); 2] = [(32, 2048), (128, 512)];

#[turbo_tasks::value(transparent)]
struct Input(State<u64>);

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input(State::new(0)).cell()
}

/// The second parent of node `index`, in the layer below.
fn second_parent(index: u32, width: u32) -> u32 {
    (index.wrapping_mul(7).wrapping_add(1)) % width
}

/// Combines the values of a node's parents. Mixing (instead of e.g. adding) keeps a change of the
/// state from cancelling out in deep graphs, so every node changes whenever the state changes.
pub(crate) fn mix(a: u64, b: u64) -> u64 {
    (a ^ b.rotate_left(29)).wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ a.rotate_right(17)
}

#[turbo_tasks::function]
async fn node(input: ResolvedVc<Input>, layer: u32, index: u32, width: u32) -> Result<Vc<u64>> {
    if layer == 0 {
        return Ok(Vc::cell(mix(*input.await?.get(), index as u64)));
    }
    let a = node(*input, layer - 1, index, width);
    let b = node(*input, layer - 1, second_parent(index, width), width);
    Ok(Vc::cell(mix(*a.await?, *b.await?)))
}

#[turbo_tasks::function(operation, root)]
async fn graph_root(input: ResolvedVc<Input>, depth: u32, width: u32) -> Result<Vc<u64>> {
    let values = (0..width)
        .map(|index| node(*input, depth - 1, index, width))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u64, |acc, value| mix(acc, **value)),
    ))
}

/// The values of all nodes, by layer, when the state is `value`, computed without turbo-tasks.
fn expected_layers(value: u64, depth: u32, width: u32) -> Vec<Vec<u64>> {
    let mut layers = vec![
        (0..width)
            .map(|index| mix(value, index as u64))
            .collect::<Vec<_>>(),
    ];
    for _ in 1..depth {
        let below = layers.last().unwrap();
        let layer = (0..width)
            .map(|index| {
                mix(
                    below[index as usize],
                    below[second_parent(index, width) as usize],
                )
            })
            .collect();
        layers.push(layer);
    }
    layers
}

/// The value `graph_root` computes when the state is `value`.
fn expected_root(value: u64, depth: u32, width: u32) -> u64 {
    expected_layers(value, depth, width)
        .last()
        .unwrap()
        .iter()
        .fold(0u64, |acc, value| mix(acc, *value))
}

/// Asserts that changing the state from `previous` to `value` changes every node, so a warm
/// iteration re-executes the whole graph.
fn assert_every_node_changes(previous: u64, value: u64, depth: u32, width: u32) {
    let before = expected_layers(previous, depth, width);
    let after = expected_layers(value, depth, width);
    for (layer, (before, after)) in before.iter().zip(&after).enumerate() {
        for (index, (before, after)) in before.iter().zip(after).enumerate() {
            assert_ne!(
                before, after,
                "node {layer}/{index} doesn't change from state {previous} to {value}"
            );
        }
    }
}

/// The worker count of the last runtime created by [`runtime`], reported by the fixed-work mode.
static RUNTIME_WORKERS: AtomicUsize = AtomicUsize::new(0);

/// Creates the multi-threaded runtime a benchmark sample runs on.
pub(crate) fn runtime() -> tokio::runtime::Runtime {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    RUNTIME_WORKERS.store(rt.metrics().num_workers(), Ordering::Relaxed);
    rt
}

pub(crate) fn create_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

/// Builds the graph with the initial state. Returns the input operation and the root value.
async fn build(depth: u32, width: u32) -> Result<(OperationVc<Input>, u64)> {
    let input_op = create_input();
    let input = input_op.resolve().strongly_consistent().await?;
    let root = *graph_root(input, depth, width)
        .read_strongly_consistent()
        .await?;
    Ok((input_op, root))
}

async fn set_and_read(
    input_op: OperationVc<Input>,
    depth: u32,
    width: u32,
    value: u64,
) -> Result<Duration> {
    let input = input_op.resolve().strongly_consistent().await?;
    let state = input_op.read_strongly_consistent().await?;
    let start = Instant::now();
    state.set(value);
    let root = *graph_root(input, depth, width)
        .read_strongly_consistent()
        .await?;
    let elapsed = start.elapsed();
    assert_eq!(root, expected_root(value, depth, width));
    Ok(elapsed)
}

/// One `warm` sample: builds the graph in a fresh runtime and `TurboTasks` instance (not timed),
/// then runs `iterations` warm iterations. Returns their total measured time.
fn warm_sample(depth: u32, width: u32, iterations: u64) -> Duration {
    let rt = runtime();
    // `TurboTasks::new` needs the runtime context.
    let tt = rt.block_on(async { create_tt() });
    let (input_op, root) = rt
        .block_on(tt.run_once(async move { build(depth, width).await }))
        .unwrap();
    assert_eq!(root, expected_root(0, depth, width));
    let mut total = Duration::ZERO;
    for value in 1..=iterations {
        total += rt
            .block_on(tt.run_once(async move { set_and_read(input_op, depth, width, value).await }))
            .unwrap();
    }
    rt.block_on(async { tt.stop_and_wait().await });
    total
}

/// One `initial` sample: builds the graph `iterations` times, each in a fresh `TurboTasks`
/// instance on one fresh runtime. Returns the total time of the builds.
fn initial_sample(depth: u32, width: u32, iterations: u64) -> Duration {
    let rt = runtime();
    let initial_root = expected_root(0, depth, width);
    let mut total = Duration::ZERO;
    for _ in 0..iterations {
        let tt = rt.block_on(async { create_tt() });
        let start = Instant::now();
        let (_input_op, root) = rt
            .block_on(tt.run_once(async move { build(depth, width).await }))
            .unwrap();
        total += start.elapsed();
        assert_eq!(root, initial_root);
        rt.block_on(async { tt.stop_and_wait().await });
        // Dropping the instance is not part of the build.
        drop(tt);
    }
    total
}

/// Runs one sample of `variant` (`<kind>/<depth>x<width>`) with `iterations` iterations, like one
/// Criterion sample. Returns `None` for an unknown variant.
fn run_sample(variant: &str, iterations: u64) -> Option<Duration> {
    let (kind, size) = variant.split_once('/')?;
    let &(depth, width) = SIZES
        .iter()
        .find(|(depth, width)| format!("{depth}x{width}") == size)?;
    Some(match kind {
        "warm" => warm_sample(depth, width, iterations),
        "initial" => initial_sample(depth, width, iterations),
        "realistic_warm" => priority_contention_realistic::warm_sample(depth, width, iterations),
        "realistic_initial" => {
            priority_contention_realistic::initial_sample(depth, width, iterations)
        }
        _ => return None,
    })
}

/// The variant to run in fixed-work mode instead of the benchmarks, see the module docs.
static FIXED_WORK: LazyLock<Option<String>> =
    LazyLock::new(|| std::env::var("PRIORITY_CONTENTION_FIXED_WORK").ok());

/// The iterations of the samples the fixed-work mode runs: like Criterion's warm-up (doubling
/// sample sizes) followed by 20 linearly growing samples. Version `v1` in the summary line.
pub const FIXED_WORK_SCHEDULE: [u64; 26] = [
    1, 2, 4, 8, 16, 32, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

/// Runs `variant` with [`FIXED_WORK_SCHEDULE`] and prints the summary line.
fn run_fixed_work(variant: &str) {
    let start = Instant::now();
    for &iterations in &FIXED_WORK_SCHEDULE {
        if run_sample(variant, iterations).is_none() {
            let valid = ["warm", "initial", "realistic_warm", "realistic_initial"]
                .iter()
                .flat_map(|kind| SIZES.iter().map(move |(d, w)| format!("{kind}/{d}x{w}")))
                .collect::<Vec<_>>();
            panic!("unknown PRIORITY_CONTENTION_FIXED_WORK variant {variant:?}, valid: {valid:?}");
        }
    }
    println!(
        "PRIORITY_CONTENTION_FIXED_WORK variant={variant} schedule=v1 samples={} iterations={} \
         workers={} elapsed_ms={:.1}",
        FIXED_WORK_SCHEDULE.len(),
        FIXED_WORK_SCHEDULE.iter().sum::<u64>(),
        RUNTIME_WORKERS.load(Ordering::Relaxed),
        start.elapsed().as_secs_f64() * 1000.0,
    );
}

/// To capture how this benchmark scales with the number of CPUs on a machine, run
/// `priority_contention_scaling.py` next to this file; it writes the results to a CSV file.
pub fn priority_contention(c: &mut Criterion) {
    if priority_contention_realistic::diagnostics_enabled() {
        priority_contention_realistic::run_diagnostics();
        return;
    }
    if let Some(variant) = &*FIXED_WORK {
        run_fixed_work(variant);
        return;
    }
    let mut group = c.benchmark_group("turbo_tasks_backend_priority_contention");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(10));

    for (depth, width) in SIZES {
        let id = format!("{depth}x{width}");
        group.throughput(Throughput::Elements(depth as u64 * width as u64));
        // Spot check that warm iterations re-execute every node (not timed).
        for value in 0..4 {
            assert_every_node_changes(value, value + 1, depth, width);
        }

        // Criterion calls each routine once per sample, so every sample gets a fresh fixture.
        group.bench_with_input(BenchmarkId::new("warm", &id), &(), |b, _| {
            b.iter_custom(|iters| warm_sample(depth, width, iters));
        });

        group.bench_with_input(BenchmarkId::new("initial", &id), &(), |b, _| {
            b.iter_custom(|iters| initial_sample(depth, width, iters));
        });
    }

    priority_contention_realistic::bench(&mut group);

    group.finish();
}
