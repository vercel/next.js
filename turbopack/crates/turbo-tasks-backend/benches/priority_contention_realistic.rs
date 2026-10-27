//! The `realistic_*` variants of the `priority_contention` benchmark: a graph that models the
//! invalidation contention of a warm build with some changed files more closely than the uniform
//! `warm` / `initial` stress variants.
//!
//! The graph has `depth` layers of `width` nodes. Column `index` models one module's pipeline:
//!
//! - **Partial invalidation with cutoff.** Every column has its own input `State`. A warm iteration
//!   changes 1/16 (6.25%) of the inputs, a different deterministic subset each time. A node reads
//!   its own column's node of the layer below in full (so a changed module's whole pipeline
//!   re-executes and changes), and reads its cross dependencies ("imports") only through a summary
//!   bit that rarely changes. A node that re-executes because an import changed therefore usually
//!   produces the same value, and invalidation stops there.
//! - **Irregular shape.** Every node has 0 to 5 imports from the layer below, chosen by a hash, so
//!   fan-in and fan-out vary per node.
//! - **Hierarchical fan-in.** No task reads all nodes: the columns are split into [`GROUPS`]
//!   contiguous groups of different sizes ("entry points"), each read by its own aggregating root
//!   task, and the final root reads the groups. Imports stay within a node's group, except that 1
//!   in [`SHARED_IMPORT_DIVISOR`] imports of other groups is from group 0, which models code shared
//!   by all entry points. The aggregated updates of a warm iteration are spread over the group
//!   roots and many smaller aggregating tasks instead of all going to one root: in a profiled warm
//!   build of a large app, the largest aggregating tasks each received about 5-9% of the updates.
//!   Here the largest group receives a few percent (about 3% for `32x2048` and 5% for `128x512` on
//!   a 32-vCPU machine). Larger groups get closer to the profiled shares but make building the
//!   graph much slower, because several overlapping root tasks make the aggregation bookkeeping
//!   expensive.
//! - **Per-task work.** Every node runs [`WORK_UNITS`] rounds of a hash, a fixed amount of work
//!   (about 3 µs on the 32-vCPU x86-64 machine it was calibrated on; it differs on other CPUs), so
//!   the scheduling and aggregation overhead per task is measured relative to real work. The amount
//!   is the same at every CPU count.
//!
//! The graph and the changed inputs are deterministic, and every warm iteration checks the root
//! against a reference computed without turbo-tasks (outside of the measured time). Like for the
//! stress variants, the reported element throughput is the size of the graph (`depth * width`), not
//! the number of nodes a warm iteration re-executes.
//!
//! Set `PRIORITY_CONTENTION_DIAGNOSTICS=1` to run an untimed check instead of the benchmarks: it
//! records which nodes actually execute and which values they produce in a series of warm
//! iterations, and asserts that the invalidation is partial and cut off (see [`run_diagnostics`]).
//! The recording is only active in that mode.

use std::{
    hint::black_box,
    sync::{
        Arc, LazyLock,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkGroup, BenchmarkId, Throughput, measurement::WallTime};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::priority_contention::{SIZES, create_tt, mix};

/// The number of groups (aggregating root tasks) the columns are split into.
pub const GROUPS: u32 = 16;

/// The relative sizes of the groups, by `group % 3`: 6 groups of weight 1 (including the shared
/// group 0), 5 of weight 2 and 5 of weight 3, so the groups get 1/31 to 3/31 of the columns.
const GROUP_WEIGHTS: [u64; 3] = [1, 2, 3];

/// A warm iteration changes the inputs of `width / CHANGED_DIVISOR` columns.
const CHANGED_DIVISOR: u32 = 16;

/// The maximum number of imports of a node.
const MAX_IMPORTS: u64 = 5;

/// The rounds of work every node does: about 3 µs on the machine this was calibrated on.
pub const WORK_UNITS: u32 = 1000;

/// The summary bit of a node value that its importers read: it changes for about 2 in 1024 value
/// changes.
fn summary(value: u64) -> u64 {
    (value & 1023 == 0) as u64
}

/// A fixed amount of deterministic work that depends on `value`.
fn work(value: u64) -> u64 {
    let mut x = value;
    for i in 0..WORK_UNITS {
        x = black_box(x)
            .wrapping_mul(0x9e37_79b9_7f4a_7c15)
            .wrapping_add(i as u64)
            .rotate_left(23);
    }
    x
}

fn hash(a: u64, b: u64, c: u64) -> u64 {
    // splitmix64 of the combined inputs
    let mut z = a
        .wrapping_mul(0x9e37_79b9_7f4a_7c15)
        .wrapping_add(b.wrapping_mul(0xbf58_476d_1ce4_e5b9))
        .wrapping_add(c.wrapping_mul(0x94d0_49bb_1331_11eb))
        .wrapping_add(0x632b_e59b_d9b4_e019);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

/// The imports (cross dependencies in the layer below) of node `layer`/`index`, without duplicates
/// and without the node's own column. Imports are from the node's own group, except that 1 in
/// [`SHARED_IMPORT_DIVISOR`] imports of groups other than 0 are from group 0, which models code
/// shared by all groups (and only imports itself).
fn imports(layer: u32, index: u32, width: u32) -> Vec<u32> {
    if layer == 0 {
        return Vec::new();
    }
    let group = group_of_column(index, width);
    let own = group_range(group, width);
    let shared = group_range(0, width);
    let count = hash(layer as u64, index as u64, 0) % (MAX_IMPORTS + 1);
    let mut imports = Vec::with_capacity(count as usize);
    for k in 0..count {
        let h = hash(layer as u64, index as u64, k + 1);
        let (start, end) = if group != 0 && (h >> 32).is_multiple_of(SHARED_IMPORT_DIVISOR) {
            shared
        } else {
            own
        };
        let import = start + (h % (end - start) as u64) as u32;
        if import != index && !imports.contains(&import) {
            imports.push(import);
        }
    }
    imports
}

/// 1 in `SHARED_IMPORT_DIVISOR` imports of groups other than 0 is from group 0.
const SHARED_IMPORT_DIVISOR: u64 = 16;

fn group_weight(group: u32) -> u64 {
    GROUP_WEIGHTS[(group % 3) as usize]
}

/// The columns `start..end` of `group`: contiguous ranges sized by [`GROUP_WEIGHTS`].
fn group_range(group: u32, width: u32) -> (u32, u32) {
    let total: u64 = (0..GROUPS).map(group_weight).sum();
    let before: u64 = (0..group).map(group_weight).sum();
    let start = (before * width as u64 / total) as u32;
    let end = ((before + group_weight(group)) * width as u64 / total) as u32;
    (start, end)
}

/// The group of column `index`.
fn group_of_column(index: u32, width: u32) -> u32 {
    (0..GROUPS)
        .find(|&group| index < group_range(group, width).1)
        .unwrap()
}

/// The columns whose inputs warm iteration `iteration` (counting from 0) changes: a different
/// `width / CHANGED_DIVISOR` slice of a fixed pseudo-random order of the columns each time.
fn changed_columns(iteration: u64, width: u32) -> Vec<u32> {
    let mut order: Vec<u32> = (0..width).collect();
    order.sort_by_key(|&index| hash(index as u64, 0xc4a9, 0));
    let count = (width / CHANGED_DIVISOR) as usize;
    let slice = (iteration % CHANGED_DIVISOR as u64) as usize;
    order[slice * count..(slice + 1) * count].to_vec()
}

/// The value of node `layer`/`index`, from its own column's value and its imports' values.
fn node_value(layer: u32, index: u32, own: u64, imports: impl Iterator<Item = u64>) -> u64 {
    let mut value = mix(own, ((layer as u64) << 32) | index as u64);
    for import in imports {
        value = mix(value, summary(import));
    }
    work(value)
}

// ---------------------------------------------------------------------------------------------
// Diagnostics

static DIAGNOSTICS: LazyLock<bool> =
    LazyLock::new(|| std::env::var_os("PRIORITY_CONTENTION_DIAGNOSTICS").is_some());

fn diagnostic_slots<T>(new: impl Fn() -> T) -> Box<[T]> {
    let max = SIZES.iter().map(|(d, w)| (d * w) as usize).max().unwrap();
    (0..max).map(|_| new()).collect()
}

/// Which nodes executed since the last reset; only written in diagnostics mode.
static EXECUTED: LazyLock<Box<[AtomicBool]>> =
    LazyLock::new(|| diagnostic_slots(|| AtomicBool::new(false)));

/// The value each node produced in its last execution; only written in diagnostics mode.
static PRODUCED: LazyLock<Box<[AtomicU64]>> =
    LazyLock::new(|| diagnostic_slots(|| AtomicU64::new(0)));

fn record_execution(layer: u32, index: u32, width: u32, value: u64) {
    if *DIAGNOSTICS {
        let slot = (layer * width + index) as usize;
        PRODUCED[slot].store(value, Ordering::Relaxed);
        EXECUTED[slot].store(true, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------------------------
// Tasks

#[turbo_tasks::value(transparent)]
struct Input(State<u64>);

#[turbo_tasks::value(transparent)]
struct Inputs(Vec<ResolvedVc<Input>>);

#[turbo_tasks::function(operation, root)]
fn create_inputs(width: u32) -> Result<Vc<Inputs>> {
    let inputs = (0..width)
        .map(|_| Input(State::new(0)).resolved_cell())
        .collect();
    Ok(Vc::cell(inputs))
}

#[turbo_tasks::function]
async fn realistic_node(
    inputs: ResolvedVc<Inputs>,
    layer: u32,
    index: u32,
    width: u32,
) -> Result<Vc<u64>> {
    let own = if layer == 0 {
        let input = inputs.await?[index as usize];
        *input.await?.get()
    } else {
        *realistic_node(*inputs, layer - 1, index, width).await?
    };
    let import_values = imports(layer, index, width)
        .into_iter()
        .map(|import| async move { Ok(*realistic_node(*inputs, layer - 1, import, width).await?) })
        .try_join()
        .await?;
    let value = node_value(layer, index, own, import_values.into_iter());
    record_execution(layer, index, width, value);
    Ok(Vc::cell(value))
}

/// An aggregating root task for the columns of one group.
#[turbo_tasks::function(root)]
async fn realistic_group(
    inputs: ResolvedVc<Inputs>,
    group: u32,
    depth: u32,
    width: u32,
) -> Result<Vc<u64>> {
    let (start, end) = group_range(group, width);
    let values = (start..end)
        .map(|index| realistic_node(*inputs, depth - 1, index, width))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values
            .iter()
            .fold(group as u64, |acc, value| mix(acc, **value)),
    ))
}

#[turbo_tasks::function(operation, root)]
async fn realistic_root(inputs: ResolvedVc<Inputs>, depth: u32, width: u32) -> Result<Vc<u64>> {
    let values = (0..GROUPS)
        .map(|group| realistic_group(*inputs, group, depth, width))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values.iter().fold(0u64, |acc, value| mix(acc, **value)),
    ))
}

// ---------------------------------------------------------------------------------------------
// Reference

/// The node values computed without turbo-tasks, updated incrementally like the task graph so
/// that checking a warm iteration costs about as much work as the iteration itself.
struct Reference {
    depth: u32,
    width: u32,
    /// The current input value of every column.
    inputs: Vec<u64>,
    /// `values[layer][index]`
    values: Vec<Vec<u64>>,
    /// `importers[layer][index]`: the nodes of layer `layer + 1` that import node `layer`/`index`.
    importers: Vec<Vec<Vec<u32>>>,
}

impl Reference {
    fn new(depth: u32, width: u32) -> Self {
        let mut importers = vec![vec![Vec::new(); width as usize]; depth as usize];
        for layer in 1..depth {
            for index in 0..width {
                for import in imports(layer, index, width) {
                    importers[(layer - 1) as usize][import as usize].push(index);
                }
            }
        }
        let mut reference = Reference {
            depth,
            width,
            inputs: vec![0; width as usize],
            values: Vec::with_capacity(depth as usize),
            importers,
        };
        reference.compute_all();
        reference
    }

    /// Computes all values from the inputs, layer by layer.
    fn compute_all(&mut self) {
        self.values.clear();
        for layer in 0..self.depth {
            let row = (0..self.width)
                .map(|index| self.compute(layer, index))
                .collect();
            self.values.push(row);
        }
    }

    /// Asserts that the incrementally updated values equal a full recomputation from the inputs.
    fn assert_consistent(&self) {
        let mut full = Reference {
            depth: self.depth,
            width: self.width,
            inputs: self.inputs.clone(),
            values: Vec::with_capacity(self.depth as usize),
            importers: Vec::new(),
        };
        full.compute_all();
        assert!(
            full.values == self.values,
            "the incremental reference differs from a full recomputation"
        );
    }

    fn compute(&self, layer: u32, index: u32) -> u64 {
        let own = if layer == 0 {
            self.inputs[index as usize]
        } else {
            self.values[(layer - 1) as usize][index as usize]
        };
        let below = layer.checked_sub(1).map(|l| &self.values[l as usize]);
        node_value(
            layer,
            index,
            own,
            imports(layer, index, self.width)
                .into_iter()
                .map(|import| below.unwrap()[import as usize]),
        )
    }

    /// Sets the inputs of `changed` columns to `value` and recomputes the nodes the change can
    /// affect (whose own column or an import changed), layer by layer.
    fn set(&mut self, changed: &[u32], value: u64) {
        let mut changed_below: Vec<u32> = Vec::new();
        for &index in changed {
            self.inputs[index as usize] = value;
        }
        for layer in 0..self.depth {
            let mut affected: Vec<u32> = if layer == 0 {
                changed.to_vec()
            } else {
                let mut affected = changed_below.clone();
                for &index in &changed_below {
                    affected.extend(&self.importers[(layer - 1) as usize][index as usize]);
                }
                affected
            };
            affected.sort_unstable();
            affected.dedup();
            changed_below.clear();
            for index in affected {
                let new = self.compute(layer, index);
                let old = std::mem::replace(&mut self.values[layer as usize][index as usize], new);
                if old != new {
                    changed_below.push(index);
                }
            }
        }
    }

    fn root(&self) -> u64 {
        let last = &self.values[(self.depth - 1) as usize];
        let groups = (0..GROUPS).map(|group| {
            let (start, end) = group_range(group, self.width);
            (start..end).fold(group as u64, |acc, index| mix(acc, last[index as usize]))
        });
        groups.fold(0u64, mix)
    }
}

// ---------------------------------------------------------------------------------------------
// Benchmark

async fn build(depth: u32, width: u32) -> Result<(OperationVc<Inputs>, u64)> {
    let inputs_op = create_inputs(width);
    let inputs = inputs_op.resolve().strongly_consistent().await?;
    let root = *realistic_root(inputs, depth, width)
        .read_strongly_consistent()
        .await?;
    Ok((inputs_op, root))
}

/// Sets the inputs of `changed` columns to `value` and reads the root. Returns the time from
/// setting the inputs to having read the root, and the root.
async fn set_and_read(
    inputs_op: OperationVc<Inputs>,
    depth: u32,
    width: u32,
    changed: Arc<Vec<u32>>,
    value: u64,
) -> Result<(Duration, u64)> {
    let inputs = inputs_op.resolve().strongly_consistent().await?;
    let input_list = inputs_op.read_strongly_consistent().await?;
    let mut states = Vec::with_capacity(changed.len());
    for &index in changed.iter() {
        states.push(input_list[index as usize].await?);
    }
    let start = Instant::now();
    for state in &states {
        state.set(value);
    }
    let root = *realistic_root(inputs, depth, width)
        .read_strongly_consistent()
        .await?;
    Ok((start.elapsed(), root))
}

/// Untimed warm iterations a warm fixture runs after building the graph.
const WARM_UP_ITERATIONS: u64 = 2;

/// A warm fixture: a built graph, its reference and the next iteration.
struct Warm {
    rt: tokio::runtime::Runtime,
    tt: Arc<TurboTasks<TurboTasksBackend>>,
    inputs_op: OperationVc<Inputs>,
    reference: Reference,
    depth: u32,
    width: u32,
    iteration: u64,
}

impl Warm {
    fn new(depth: u32, width: u32) -> Self {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        // `TurboTasks::new` needs the runtime context.
        let tt = rt.block_on(async { create_tt() });
        let (inputs_op, root) = rt
            .block_on(tt.run_once(async move { build(depth, width).await }))
            .unwrap();
        let reference = Reference::new(depth, width);
        assert_eq!(root, reference.root());
        let mut warm = Warm {
            rt,
            tt,
            inputs_op,
            reference,
            depth,
            width,
            iteration: 0,
        };
        // The first invalidations restructure the aggregation of the freshly built graph and are
        // much slower than later ones, so they are not part of the measured iterations.
        for _ in 0..WARM_UP_ITERATIONS {
            warm.iterate();
        }
        warm
    }

    /// Runs one warm iteration and checks its root. Returns the measured time.
    fn iterate(&mut self) -> Duration {
        let changed = Arc::new(changed_columns(self.iteration, self.width));
        self.iteration += 1;
        let value = self.iteration;
        let (inputs_op, depth, width) = (self.inputs_op, self.depth, self.width);
        let changed_for_task = changed.clone();
        let (elapsed, root) = self
            .rt
            .block_on(self.tt.run_once(async move {
                set_and_read(inputs_op, depth, width, changed_for_task, value).await
            }))
            .unwrap();
        // Checking is not part of the measured time.
        self.reference.set(&changed, value);
        assert_eq!(root, self.reference.root());
        elapsed
    }

    fn stop(self) {
        self.rt.block_on(async { self.tt.stop_and_wait().await });
    }
}

pub fn bench(group: &mut BenchmarkGroup<'_, WallTime>) {
    for (depth, width) in SIZES {
        let id = format!("{depth}x{width}");
        group.throughput(Throughput::Elements(depth as u64 * width as u64));

        group.bench_with_input(BenchmarkId::new("realistic_warm", &id), &(), |b, _| {
            let mut warm = Warm::new(depth, width);
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    total += warm.iterate();
                }
                total
            });
            warm.stop();
        });

        let initial_root = Reference::new(depth, width).root();
        group.bench_with_input(BenchmarkId::new("realistic_initial", &id), &(), |b, _| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    let tt = rt.block_on(async { create_tt() });
                    let start = Instant::now();
                    let (_inputs_op, root) = rt
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
}

/// Whether to run [`run_diagnostics`] instead of the benchmarks.
pub fn diagnostics_enabled() -> bool {
    *DIAGNOSTICS
}

/// The number of warm iterations [`run_diagnostics`] checks per size.
const DIAGNOSTIC_ITERATIONS: u64 = 16;

/// Runs [`DIAGNOSTIC_ITERATIONS`] warm iterations per size (untimed), records which nodes actually
/// execute and which values they produce, and asserts that in every iteration:
///
/// - every node's last produced value equals the reference (so every node whose value changed
///   re-executed), and the incrementally updated reference equals a full recomputation,
/// - 5-10% of the inputs change,
/// - at least 1% of the nodes re-execute,
/// - more than half of the re-executed nodes produce the same value as before (cutoff), and
/// - at least one node doesn't re-execute although a dependency re-executed, because every
///   re-executed dependency kept its value.
pub fn run_diagnostics() {
    for (depth, width) in SIZES {
        let nodes = (depth * width) as usize;
        let mut warm = Warm::new(depth, width);
        for _ in 0..DIAGNOSTIC_ITERATIONS {
            let previous: Vec<u64> = PRODUCED[..nodes]
                .iter()
                .map(|value| value.load(Ordering::Relaxed))
                .collect();
            for executed in EXECUTED.iter() {
                executed.store(false, Ordering::Relaxed);
            }
            let iteration = warm.iteration;
            let changed_inputs = changed_columns(iteration, width).len();
            let elapsed = warm.iterate();
            warm.reference.assert_consistent();

            let slot = |layer: u32, index: u32| (layer * width + index) as usize;
            let executed =
                |layer: u32, index: u32| EXECUTED[slot(layer, index)].load(Ordering::Relaxed);
            let produced =
                |layer: u32, index: u32| PRODUCED[slot(layer, index)].load(Ordering::Relaxed);
            let kept_value =
                |layer: u32, index: u32| produced(layer, index) == previous[slot(layer, index)];
            let mut re_executed = 0usize;
            let mut kept = 0usize;
            let mut changed_values = 0usize;
            let mut avoided = 0usize;
            for layer in 0..depth {
                for index in 0..width {
                    assert_eq!(
                        produced(layer, index),
                        warm.reference.values[layer as usize][index as usize],
                        "node {layer}/{index} produced a value that differs from the reference"
                    );
                    if executed(layer, index) {
                        re_executed += 1;
                        if kept_value(layer, index) {
                            kept += 1;
                        } else {
                            changed_values += 1;
                        }
                    } else if layer > 0 {
                        let executed_dependencies: Vec<u32> = std::iter::once(index)
                            .chain(imports(layer, index, width))
                            .filter(|&dependency| executed(layer - 1, dependency))
                            .collect();
                        if !executed_dependencies.is_empty()
                            && executed_dependencies
                                .iter()
                                .all(|&dependency| kept_value(layer - 1, dependency))
                        {
                            avoided += 1;
                        }
                    }
                }
            }
            let changed_share = changed_inputs as f64 / width as f64;
            let re_executed_share = re_executed as f64 / nodes as f64;
            let kept_share = kept as f64 / re_executed.max(1) as f64;
            println!(
                "realistic {depth}x{width} iteration {iteration}: {:.1} ms, changed inputs \
                 {changed_inputs} ({:.2}%), re-executed {re_executed} ({:.2}% of {nodes}), kept \
                 value {kept} ({:.1}% of re-executed), changed values {changed_values}, avoided \
                 re-executions {avoided}",
                elapsed.as_secs_f64() * 1000.0,
                changed_share * 100.0,
                re_executed_share * 100.0,
                kept_share * 100.0,
            );
            assert!((0.05..=0.10).contains(&changed_share));
            assert!(re_executed_share >= 0.01);
            assert!(kept_share > 0.5);
            assert!(avoided >= 1);
        }
        warm.stop();
    }
    println!("realistic diagnostics passed");
}
