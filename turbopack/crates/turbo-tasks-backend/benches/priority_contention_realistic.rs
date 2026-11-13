//! The `realistic_*` variants of the `priority_contention` benchmark: a graph whose scheduling
//! resembles a real build more closely than the uniform `warm` / `initial` stress variants. They
//! were shaped after the scheduler's queue in an instrumented build of a large app: a cold build
//! queues only initial-priority jobs, about 85% of which the task waiting for them claims and
//! executes inline. A warm build with many changed files queues only invalidation jobs, most
//! of them (about 84%) at the three most common priorities, about 4 priorities have live jobs
//! at a time, and about 80% of the queued jobs are claimed inline.
//!
//! The graph has `depth` layers of `width` nodes. Column `index` models one module's pipeline:
//!
//! - **Partial invalidation with cutoff.** Every column has its own input `State`. A warm iteration
//!   changes 1/16 (6.25%) of the inputs, a different deterministic subset each time. Nodes in the
//!   first [`pipeline_length`] layers of a column ([`PIPELINE_MIN`] to [`PIPELINE_MAX`], chosen by
//!   a hash) read their own column's node of the layer below in full, so a changed module's
//!   pipeline re-executes and changes. Everything else reads a node only through its
//!   [`realistic_summary`] task, a summary bit that rarely changes: the imports (cross
//!   dependencies) of a node, and the own column beyond its pipeline. So a change re-executes the
//!   summary tasks of the changed nodes, which usually keep their value, and invalidation stops
//!   there.
//! - **Pieces.** The nodes of the [`HEAVY_LAYERS`] split part of their work into [`PIECES`] piece
//!   tasks, keyed by the value the node computed from its dependencies. When that value changed,
//!   the pieces are new tasks: they are queued with the node's priority, and the node waits for
//!   them, so it usually claims and executes them itself, like a task that calls functions with new
//!   arguments after its input changed. This is where most of the queued jobs of a warm iteration
//!   are, and they share the few priorities of the heavy layers.
//! - **Irregular shape.** Every node has 0 to 5 imports from the layer below, chosen by a hash, so
//!   fan-in and fan-out vary per node.
//! - **Hierarchical fan-in.** No task reads all nodes: the columns are split into [`GROUPS`]
//!   contiguous groups of different sizes ("entry points"), each read by its own aggregating root
//!   task, and the final root reads the groups. Imports stay within a node's group, except that 1
//!   in [`SHARED_IMPORT_DIVISOR`] imports of other groups is from group 0, which models code shared
//!   by all entry points.
//! - **Per-task work.** Every node runs [`WORK_UNITS`] rounds of a hash and every piece
//!   [`PIECE_WORK_UNITS`] rounds, a fixed amount of work (about 3 µs for a node on the 32-vCPU
//!   x86-64 machine it was calibrated on; it differs on other CPUs), so the scheduling and
//!   aggregation overhead per task is measured relative to real work. The amount is the same at
//!   every CPU count.
//!
//! The graph and the changed inputs are deterministic, and every warm iteration checks the root
//! against a reference computed without turbo-tasks (outside of the measured time). Like for the
//! stress variants, the reported element throughput is the size of the graph (`depth * width`), not
//! the number of tasks a warm iteration re-executes.
//!
//! Set `PRIORITY_CONTENTION_DIAGNOSTICS=1` to run an untimed check instead of the benchmarks: it
//! records which nodes, summaries and pieces actually execute and which values they produce in a
//! series of warm iterations, and asserts the graph-level properties above (see
//! [`run_diagnostics`]). It doesn't measure the scheduler's queue. The recording is only active in
//! that mode.

use std::{
    collections::HashSet,
    hint::black_box,
    sync::{
        Arc, LazyLock, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkGroup, BenchmarkId, Throughput, measurement::WallTime};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::priority_contention::{SIZES, create_tt, mix, runtime};

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

/// The shortest and longest pipeline of a column (see [`pipeline_length`]).
const PIPELINE_MIN: u32 = 3;
const PIPELINE_MAX: u32 = 8;

/// The layers whose nodes split their work into [`PIECES`] piece tasks (see [`is_heavy`]).
const HEAVY_LAYERS: [u32; 2] = [1, 2];

/// The number of piece tasks of a heavy node.
const PIECES: u64 = 40;

/// The rounds of work every piece task does.
const PIECE_WORK_UNITS: u32 = WORK_UNITS / 4;

/// The number of layers through which a change of column `index`'s input propagates in full: the
/// nodes of layers `0..pipeline_length(index)` read their own column's node of the layer below in
/// full, deeper nodes only read its summary. Between [`PIPELINE_MIN`] and [`PIPELINE_MAX`], chosen
/// by a hash.
fn pipeline_length(index: u32) -> u32 {
    PIPELINE_MIN + (hash(index as u64, 0x91e1, 0) % (PIPELINE_MAX - PIPELINE_MIN + 1) as u64) as u32
}

/// Whether node `layer`/`index` splits its work into piece tasks: the nodes of the
/// [`HEAVY_LAYERS`], which are always within the column's pipeline.
fn is_heavy(layer: u32, index: u32) -> bool {
    HEAVY_LAYERS.contains(&layer) && layer < pipeline_length(index)
}

/// The summary bit of a node value that its importers read: it changes for about 2 in 65536 value
/// changes, so a change almost never propagates past a column's pipeline.
fn summary(value: u64) -> u64 {
    (value & 0xffff == 0) as u64
}

/// A fixed amount of deterministic work that depends on `value`.
fn work(value: u64) -> u64 {
    work_rounds(value, WORK_UNITS)
}

fn work_rounds(value: u64, rounds: u32) -> u64 {
    let mut x = value;
    for i in 0..rounds {
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

/// The value a node computes before its pieces, from what it read of its own column below (the
/// full value or the summary, see [`pipeline_length`]) and its imports' summaries.
fn node_pre_value(
    layer: u32,
    index: u32,
    own: u64,
    import_summaries: impl Iterator<Item = u64>,
) -> u64 {
    let mut value = mix(own, ((layer as u64) << 32) | index as u64);
    for import in import_summaries {
        value = mix(value, import);
    }
    value
}

/// The value of piece `piece` of a heavy node whose pre-value is `pre`.
fn piece_value(pre: u64, piece: u64) -> u64 {
    work_rounds(mix(pre, piece), PIECE_WORK_UNITS)
}

/// The value of a node, from its pre-value and its pieces' values (none for a node that isn't
/// heavy).
fn node_value(pre: u64, pieces: impl Iterator<Item = u64>) -> u64 {
    work(pieces.fold(pre, mix))
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

/// Which summary tasks executed since the last reset; only written in diagnostics mode.
static SUMMARY_EXECUTED: LazyLock<Box<[AtomicBool]>> =
    LazyLock::new(|| diagnostic_slots(|| AtomicBool::new(false)));

/// Which summary tasks executed at least once since the graph of the current size was created;
/// only written in diagnostics mode.
static SUMMARY_EVER_EXECUTED: LazyLock<Box<[AtomicBool]>> =
    LazyLock::new(|| diagnostic_slots(|| AtomicBool::new(false)));

/// The value each summary task produced in its last execution; only written in diagnostics mode.
static SUMMARY_PRODUCED: LazyLock<Box<[AtomicU64]>> =
    LazyLock::new(|| diagnostic_slots(|| AtomicU64::new(0)));

/// The `(pre-value, piece)` arguments of the piece tasks that executed since the last reset; only
/// written in diagnostics mode.
static PIECES_EXECUTED: LazyLock<Mutex<HashSet<(u64, u64)>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

fn record_summary_execution(layer: u32, index: u32, width: u32, value: u64) {
    if *DIAGNOSTICS {
        let slot = (layer * width + index) as usize;
        SUMMARY_PRODUCED[slot].store(value, Ordering::Relaxed);
        SUMMARY_EXECUTED[slot].store(true, Ordering::Relaxed);
        SUMMARY_EVER_EXECUTED[slot].store(true, Ordering::Relaxed);
    }
}

fn record_piece_execution(pre: u64, piece: u64) {
    if *DIAGNOSTICS {
        PIECES_EXECUTED.lock().unwrap().insert((pre, piece));
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
    } else if layer < pipeline_length(index) {
        *realistic_node(*inputs, layer - 1, index, width).await?
    } else {
        *realistic_summary(*inputs, layer - 1, index, width).await?
    };
    let import_summaries =
        imports(layer, index, width)
            .into_iter()
            .map(|import| async move {
                Ok(*realistic_summary(*inputs, layer - 1, import, width).await?)
            })
            .try_join()
            .await?;
    let pre = node_pre_value(layer, index, own, import_summaries.into_iter());
    // A heavy node calls its pieces only now, with the pre-value it just computed. When that
    // changed, the pieces are new tasks: they are queued with this node's priority, and this node
    // waits for them, so it usually executes them itself instead of a worker.
    let pieces = if is_heavy(layer, index) {
        (0..PIECES)
            .map(|piece| async move { Ok(*realistic_piece(pre, piece).await?) })
            .try_join()
            .await?
    } else {
        Vec::new()
    };
    let value = node_value(pre, pieces.into_iter());
    record_execution(layer, index, width, value);
    Ok(Vc::cell(value))
}

/// The summary of node `layer`/`index`, which is all its importers (and, beyond its column's
/// pipeline, its own column's next node) read. It rarely changes, so most invalidations stop here.
#[turbo_tasks::function]
async fn realistic_summary(
    inputs: ResolvedVc<Inputs>,
    layer: u32,
    index: u32,
    width: u32,
) -> Result<Vc<u64>> {
    let value = summary(*realistic_node(*inputs, layer, index, width).await?);
    record_summary_execution(layer, index, width, value);
    Ok(Vc::cell(value))
}

/// A piece of the work of a heavy node, see [`is_heavy`].
#[turbo_tasks::function]
fn realistic_piece(pre: u64, piece: u64) -> Vc<u64> {
    record_piece_execution(pre, piece);
    Vc::cell(piece_value(pre, piece))
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
        let pre = self.pre(layer, index);
        let pieces = if is_heavy(layer, index) { PIECES } else { 0 };
        node_value(pre, (0..pieces).map(|piece| piece_value(pre, piece)))
    }

    /// The pre-value of node `layer`/`index` (see [`node_pre_value`]) from the values of the layer
    /// below.
    fn pre(&self, layer: u32, index: u32) -> u64 {
        let own = if layer == 0 {
            self.inputs[index as usize]
        } else if layer < pipeline_length(index) {
            self.values[(layer - 1) as usize][index as usize]
        } else {
            summary(self.values[(layer - 1) as usize][index as usize])
        };
        let below = layer.checked_sub(1).map(|l| &self.values[l as usize]);
        node_pre_value(
            layer,
            index,
            own,
            imports(layer, index, self.width)
                .into_iter()
                .map(|import| summary(below.unwrap()[import as usize])),
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
        let rt = runtime();
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

/// One `realistic_warm` sample: a fresh warm fixture (built and warmed up, not timed) running
/// `iterations` warm iterations. Returns their total measured time.
pub(crate) fn warm_sample(depth: u32, width: u32, iterations: u64) -> Duration {
    let mut warm = Warm::new(depth, width);
    let mut total = Duration::ZERO;
    for _ in 0..iterations {
        total += warm.iterate();
    }
    warm.stop();
    total
}

/// One `realistic_initial` sample: builds the graph `iterations` times, each in a fresh
/// `TurboTasks` instance on one fresh runtime. Returns the total time of the builds.
pub(crate) fn initial_sample(depth: u32, width: u32, iterations: u64) -> Duration {
    let initial_root = Reference::new(depth, width).root();
    let rt = runtime();
    let mut total = Duration::ZERO;
    for _ in 0..iterations {
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
}

pub fn bench(group: &mut BenchmarkGroup<'_, WallTime>) {
    for (depth, width) in SIZES {
        let id = format!("{depth}x{width}");
        group.throughput(Throughput::Elements(depth as u64 * width as u64));

        // Criterion calls each routine once per sample, so every sample gets a fresh fixture.
        group.bench_with_input(BenchmarkId::new("realistic_warm", &id), &(), |b, _| {
            b.iter_custom(|iters| warm_sample(depth, width, iters));
        });

        group.bench_with_input(BenchmarkId::new("realistic_initial", &id), &(), |b, _| {
            b.iter_custom(|iters| initial_sample(depth, width, iters));
        });
    }
}

/// Whether to run [`run_diagnostics`] instead of the benchmarks.
pub fn diagnostics_enabled() -> bool {
    *DIAGNOSTICS
}

/// The number of warm iterations [`run_diagnostics`] checks per size.
const DIAGNOSTIC_ITERATIONS: u64 = 16;

/// Runs [`DIAGNOSTIC_ITERATIONS`] warm iterations per size (untimed), records which nodes, summary
/// and piece tasks actually execute and which values they produce, and asserts that in every
/// iteration:
///
/// - every node's last produced value, and the last produced value of every summary task that
///   executed at least once for this graph, equals the reference (so every task whose value changed
///   re-executed), and the incrementally updated reference equals a full recomputation,
/// - 5-10% of the inputs change,
/// - every changed column re-executes its node in each layer of its pipeline (see
///   [`pipeline_length`]), and fewer than half of all nodes re-execute (partial invalidation),
/// - more than half of the re-executed summary tasks produce the same value as before (cutoff), and
/// - for every heavy node whose value changed, all [`PIECES`] piece tasks of its new pre-value
///   executed.
pub fn run_diagnostics() {
    for (depth, width) in SIZES {
        let nodes = (depth * width) as usize;
        for executed in SUMMARY_EVER_EXECUTED.iter() {
            executed.store(false, Ordering::Relaxed);
        }
        let mut warm = Warm::new(depth, width);
        for _ in 0..DIAGNOSTIC_ITERATIONS {
            let previous: Vec<u64> = PRODUCED[..nodes]
                .iter()
                .map(|value| value.load(Ordering::Relaxed))
                .collect();
            let previous_summaries: Vec<u64> = SUMMARY_PRODUCED[..nodes]
                .iter()
                .map(|value| value.load(Ordering::Relaxed))
                .collect();
            for executed in EXECUTED.iter().chain(SUMMARY_EXECUTED.iter()) {
                executed.store(false, Ordering::Relaxed);
            }
            PIECES_EXECUTED.lock().unwrap().clear();
            let iteration = warm.iteration;
            let changed = changed_columns(iteration, width);
            let changed_inputs = changed.len();
            let elapsed = warm.iterate();
            warm.reference.assert_consistent();
            let pieces_executed = std::mem::take(&mut *PIECES_EXECUTED.lock().unwrap());

            let slot = |layer: u32, index: u32| (layer * width + index) as usize;
            let mut re_executed = 0usize;
            let mut changed_values = 0usize;
            let mut changed_heavy = 0u64;
            let mut summaries_re_executed = 0usize;
            let mut summaries_kept = 0usize;
            for layer in 0..depth {
                for index in 0..width {
                    let s = slot(layer, index);
                    let reference = warm.reference.values[layer as usize][index as usize];
                    assert_eq!(
                        PRODUCED[s].load(Ordering::Relaxed),
                        reference,
                        "node {layer}/{index} produced a value that differs from the reference"
                    );
                    if EXECUTED[s].load(Ordering::Relaxed) {
                        re_executed += 1;
                        if PRODUCED[s].load(Ordering::Relaxed) != previous[s] {
                            changed_values += 1;
                            if is_heavy(layer, index) {
                                changed_heavy += 1;
                                let pre = warm.reference.pre(layer, index);
                                for piece in 0..PIECES {
                                    assert!(
                                        pieces_executed.contains(&(pre, piece)),
                                        "piece {piece} of changed heavy node {layer}/{index} \
                                         didn't execute"
                                    );
                                }
                            }
                        }
                    }
                    if SUMMARY_EXECUTED[s].load(Ordering::Relaxed) {
                        summaries_re_executed += 1;
                        if SUMMARY_PRODUCED[s].load(Ordering::Relaxed) == previous_summaries[s] {
                            summaries_kept += 1;
                        }
                    }
                    if SUMMARY_EVER_EXECUTED[s].load(Ordering::Relaxed) {
                        assert_eq!(
                            SUMMARY_PRODUCED[s].load(Ordering::Relaxed),
                            summary(reference),
                            "summary {layer}/{index} differs from the reference"
                        );
                    }
                }
            }
            for &index in &changed {
                for layer in 0..pipeline_length(index).min(depth) {
                    assert!(
                        EXECUTED[slot(layer, index)].load(Ordering::Relaxed),
                        "node {layer}/{index} of a changed column's pipeline didn't re-execute"
                    );
                }
            }
            let piece_executions = pieces_executed.len();
            let changed_share = changed_inputs as f64 / width as f64;
            let re_executed_share = re_executed as f64 / nodes as f64;
            let kept_share = summaries_kept as f64 / summaries_re_executed.max(1) as f64;
            println!(
                "realistic {depth}x{width} iteration {iteration}: {:.1} ms, changed inputs \
                 {changed_inputs} ({:.2}%), re-executed nodes {re_executed} ({:.2}% of {nodes}), \
                 changed values {changed_values}, re-executed summaries {summaries_re_executed} \
                 (kept value {:.1}%), distinct piece executions {piece_executions} (changed heavy \
                 nodes {changed_heavy})",
                elapsed.as_secs_f64() * 1000.0,
                changed_share * 100.0,
                re_executed_share * 100.0,
                kept_share * 100.0,
            );
            assert!((0.05..=0.10).contains(&changed_share));
            assert!(re_executed_share < 0.5);
            assert!(summaries_kept >= 1 && kept_share > 0.5);
        }
        warm.stop();
    }
    println!("realistic diagnostics passed");
}
