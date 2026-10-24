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
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- priority_contention
//! ```

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// `(depth, width)` of the benchmarked graphs.
const SIZES: [(u32, u32); 2] = [(32, 2048), (128, 512)];

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
fn mix(a: u64, b: u64) -> u64 {
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

fn create_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
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

/// To capture how this benchmark scales with the number of CPUs on a machine, run
/// `priority_contention_scaling.py` next to this file; it writes the results to a CSV file.
pub fn priority_contention(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_priority_contention");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(10));

    for (depth, width) in SIZES {
        let id = format!("{depth}x{width}");
        group.throughput(Throughput::Elements(depth as u64 * width as u64));
        let initial_root = expected_root(0, depth, width);
        // Spot check that warm iterations re-execute every node (not timed).
        for value in 0..4 {
            assert_every_node_changes(value, value + 1, depth, width);
        }

        group.bench_with_input(BenchmarkId::new("warm", &id), &(), |b, _| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            // `TurboTasks::new` needs the runtime context.
            let tt = rt.block_on(async { create_tt() });
            let (input_op, root) = rt
                .block_on(tt.run_once(async move { build(depth, width).await }))
                .unwrap();
            assert_eq!(root, initial_root);
            let mut next_value = 1u64;
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    let value = next_value;
                    next_value = next_value.wrapping_add(1);
                    total += rt
                        .block_on(tt.run_once(async move {
                            set_and_read(input_op, depth, width, value).await
                        }))
                        .unwrap();
                }
                total
            });
            rt.block_on(async { tt.stop_and_wait().await });
        });

        group.bench_with_input(BenchmarkId::new("initial", &id), &(), |b, _| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
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
            });
        });
    }

    group.finish();
}
