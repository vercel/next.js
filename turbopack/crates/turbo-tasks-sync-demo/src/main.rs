//! Configurable incremental-computation-graph demo for the dual-mode turbo-tasks engine.
//!
//! The SAME source compiles two ways:
//!   cargo run --bin tt-demo                                   # async (tokio executor +
//! work-stealing)   cargo run --bin tt-demo --no-default-features --features sync   # no-tokio
//! (inline + rayon parallel!)
//!
//! It builds a layered module dependency graph (a stand-in for a Turbopack module
//! graph), computes a value at the root, then edits some leaf "source files" each
//! iteration and recomputes — reporting how many modules actually re-ran (cache misses)
//! and the wall time. The recompute counts are identical in both engines (the cache /
//! invalidation logic is shared); only HOW the work is scheduled differs.
//!
//! Knobs (env vars), tuned to exercise Turbopack-shaped load:
//!   TT_DEMO_PRESET    named workload preset         (default none) — see below
//!   TT_DEMO_WIDTH     modules per layer            (default 40)   — graph width / parallelism
//!   TT_DEMO_LAYERS    number of layers             (default 6)    — dependency-chain depth
//!   TT_DEMO_FANOUT    deps per module              (default 3)    — fan-out per module
//!   TT_DEMO_WORK      CPU spins per module body    (default 1500) — per-module transform cost
//!   TT_DEMO_ITERS     edit/recompute iterations    (default 6)
//!   TT_DEMO_CHURN     leaf inputs changed per iter (default 2)    — "files edited" per build
//!   TT_DEMO_PARALLEL  read deps via parallel!      (default 1)    — 1 = parallel, 0 = sequential
//!
//! Presets (TT_DEMO_PRESET), for realistic "lots of tasks doing real CPU work" runs
//! without hand-tuning the knobs (individual TT_DEMO_* still override):
//!   cpu-heavy   ~6k module tasks  (256 x 24, fanout 4), work=40000  — compute-bound
//!   cpu-huge   ~25k module tasks  (512 x 48, fanout 4), work=40000  — scaling studies
//! e.g.  TT_DEMO_PRESET=cpu-heavy cargo run --bin tt-demo --release --no-default-features
//! --features sync
//!
//! Under `sync` + TT_DEMO_PARALLEL=1, `parallel!` fans out across one OS thread per
//! outermost item (not a bounded work-stealing pool); deep/wide/shared-dependency graphs
//! compute correctly and deterministically, matching the async engine. See the notes in
//! turbo-tasks/src/manager.rs (sync_parallel_read / sync_advance_or_wait) for why a
//! dedicated thread per item — plus "workers don't drain the scheduled queue" — avoids
//! both the bounded-pool deadlock and the self-wait deadlock.
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{
    env,
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};

use anyhow::Result;
use turbo_tasks::{
    ReadRef, ResolvedVc, State, TurboTasks, Vc, parallel, read,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Counts `module` body executions (i.e. cache misses) so each iteration can report how
/// many modules actually recomputed. Reset before each recompute.
static EXECUTIONS: AtomicU64 = AtomicU64::new(0);

/// A mutable leaf input — the demo's stand-in for a source file. Editing it (`set`)
/// invalidates exactly the modules that read it, and nothing else.
#[turbo_tasks::value]
struct Input {
    value: State<u64>,
}

/// A computed module output.
#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct ModuleOut {
    hash: u64,
}

/// The (immutable) graph shape: for each module, the modules it depends on. A module
/// with no deps is a leaf and reads `Input[leaf_input[id]]`.
#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Graph {
    deps: Vec<Vec<u32>>,
    leaf_input: Vec<i64>,
    work: u32,
    parallel: bool,
}

/// One leaf input per index; cached, so every reader of input `i` shares one `State`.
#[turbo_tasks::function]
fn make_input(idx: u32) -> Vc<Input> {
    Input {
        value: State::new(idx as u64),
    }
    .cell()
}

/// Simulated per-module CPU work (parse/transform): a cheap LCG spin. `black_box` on the
/// running value forces a true sequential data dependency each iteration, so the loop
/// can't be vectorized or reduced to a closed form — `n` really is `n` multiply-adds of
/// honest CPU work. This is what makes the `cpu-heavy` preset a real compute benchmark
/// rather than a scheduling-overhead microbenchmark.
fn spin(mut x: u64, n: u32) -> u64 {
    for _ in 0..n {
        x = std::hint::black_box(x)
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
    }
    x
}

/// Compute one module: combine its dependencies' outputs (or read its leaf input), then
/// do `work` units of CPU. `read!`/`parallel!` are the dual-mode reads — `.await`/
/// `try_join` in the async build, inline / rayon fan-out in the sync build.
#[turbo_tasks::function]
async fn module(graph: Vc<Graph>, id: u32) -> Result<Vc<ModuleOut>> {
    EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    let g = read!(graph)?;
    let deps = &g.deps[id as usize];
    let mut acc = id as u64;
    if deps.is_empty() {
        // Leaf: read the mutable input (registers a fine-grained dependency on it).
        let input = make_input(g.leaf_input[id as usize] as u32);
        acc = acc.wrapping_add(*read!(input)?.value.get());
    } else if g.parallel {
        for out in parallel!(deps.iter().map(|&d| module(graph, d)))? {
            acc = acc.rotate_left(7) ^ out.hash;
        }
    } else {
        for &d in deps {
            acc = acc.rotate_left(7) ^ read!(module(graph, d))?.hash;
        }
    }
    Ok(ModuleOut {
        hash: spin(acc, g.work),
    }
    .cell())
}

/// Strongly-consistent root entry point (an operation, like Turbopack's final output).
/// Operation args must be `NonLocalValue`, so the graph comes in resolved.
#[turbo_tasks::function(operation, root)]
async fn root(graph: ResolvedVc<Graph>, root_id: u32) -> Result<Vc<ModuleOut>> {
    Ok(ModuleOut {
        hash: read!(module(*graph, root_id))?.hash,
    }
    .cell())
}

struct Config {
    width: u32,
    layers: u32,
    fanout: u32,
    work: u32,
    iters: u32,
    churn: u32,
    parallel: bool,
}

fn env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// Base graph shape for a named workload, selected via `TT_DEMO_PRESET`. A preset only
/// sets the *defaults*; any individual `TT_DEMO_{WIDTH,LAYERS,FANOUT,WORK}` still
/// overrides it. This lets us re-run a realistic benchmark without re-deriving the knobs.
struct Preset {
    width: u32,
    layers: u32,
    fanout: u32,
    work: u32,
}

fn preset(name: &str) -> Preset {
    match name {
        // Compute-bound: ~6k module tasks (256 wide x 24 layers), each doing real
        // per-module CPU work (`work=40000` spins ≈ tens of µs). The point is LOTS of
        // tasks that ACTUALLY do CPU work, so the benchmark measures genuine parallel
        // throughput and incremental recompute, not scheduling overhead on a toy graph.
        "cpu-heavy" => Preset {
            width: 256,
            layers: 24,
            fanout: 4,
            work: 40_000,
        },
        // Same shape, ~25k tasks (512 wide x 48 layers) for scaling studies.
        "cpu-huge" => Preset {
            width: 512,
            layers: 48,
            fanout: 4,
            work: 40_000,
        },
        // Default: the original small, scheduling-sensitive shape. Also used for any
        // unrecognized preset name.
        _ => Preset {
            width: 40,
            layers: 6,
            fanout: 3,
            work: 1500,
        },
    }
}

impl Config {
    fn from_env() -> Self {
        let p = preset(&env::var("TT_DEMO_PRESET").unwrap_or_default());
        Config {
            width: env_u32("TT_DEMO_WIDTH", p.width).max(1),
            layers: env_u32("TT_DEMO_LAYERS", p.layers).max(1),
            fanout: env_u32("TT_DEMO_FANOUT", p.fanout).max(1),
            work: env_u32("TT_DEMO_WORK", p.work),
            iters: env_u32("TT_DEMO_ITERS", 6).max(1),
            churn: env_u32("TT_DEMO_CHURN", 2).max(1),
            parallel: env_u32("TT_DEMO_PARALLEL", 1) != 0,
        }
    }
}

/// Build a deterministic layered DAG:
/// - layer 0: `width` leaf modules, each reading input `i`.
/// - layers 1..L: `width` modules, each depending on `fanout` modules of the layer below (spread
///   deterministically across the width).
/// - one root module depending on the whole top layer (fan-in).
///
/// Returns (deps, leaf_input, root_id, n_inputs).
fn build_graph(cfg: &Config) -> (Vec<Vec<u32>>, Vec<i64>, u32, u32) {
    let width = cfg.width;
    let layers = cfg.layers;
    let total = layers * width + 1;
    let root_id = layers * width;
    let mut deps = vec![Vec::new(); total as usize];
    let mut leaf_input = vec![-1i64; total as usize];

    // Layer 0: leaves.
    for j in 0..width {
        leaf_input[j as usize] = j as i64;
    }
    // Layers 1..layers: fan-out into the previous layer.
    for layer in 1..layers {
        for j in 0..width {
            let id = layer * width + j;
            let mut d = Vec::with_capacity(cfg.fanout as usize);
            for k in 0..cfg.fanout {
                let prev = (layer - 1) * width + (j + k * 7 + 1) % width;
                d.push(prev);
            }
            deps[id as usize] = d;
        }
    }
    // Root: depends on the entire top layer.
    deps[root_id as usize] = (0..width).map(|j| (layers - 1) * width + j).collect();

    (deps, leaf_input, root_id, width)
}

fn make_tt() -> std::sync::Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

const ENGINE: &str = if cfg!(feature = "sync") {
    "SYNC  (no-tokio; inline compute, rayon parallel!)"
} else {
    "ASYNC (tokio executor, work-stealing)"
};

fn print_plan(cfg: &Config, total_modules: usize) {
    println!("turbo-tasks incremental demo — engine: {ENGINE}");
    println!(
        "  graph: {} modules ({} layers x {} wide, fanout {}), work={} spins/module, parallel={}",
        total_modules, cfg.layers, cfg.width, cfg.fanout, cfg.work, cfg.parallel
    );
    println!(
        "  plan:  {} iterations, editing {} leaf input(s) per iteration\n",
        cfg.iters, cfg.churn
    );
}

// The demo driver, run inside a root task context. Its body uses only the dual-mode
// `read!` (no raw `.await`), so it is an `async fn` task body under the async engine and
// a plain synchronous `fn` under the no-async `sync` engine. Only the signature differs.
macro_rules! run_driver_body {
    ($deps:ident, $leaf_input:ident, $root_id:ident, $n_inputs:ident,
     $total_modules:ident, $work:ident, $parallel:ident, $iters:ident, $churn:ident) => {{
        // We intentionally do eventually-consistent leaf reads from this driver task.
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let graph = read!(
            Graph {
                deps: $deps,
                leaf_input: $leaf_input,
                work: $work,
                parallel: $parallel,
            }
            .cell()
            .to_resolved()
        )?;

        // Hold a handle to every leaf input's mutable State so we can "edit files".
        let mut inputs: Vec<ReadRef<Input>> = Vec::with_capacity($n_inputs as usize);
        for i in 0..$n_inputs {
            inputs.push(read!(make_input(i))?);
        }

        for it in 0..$iters {
            // Edit some leaf inputs (invalidates only the modules that read them).
            if it > 0 {
                for k in 0..$churn {
                    let idx = ((it * $churn + k) % $n_inputs) as usize;
                    let new = (it as u64)
                        .wrapping_mul(2654435761)
                        .wrapping_add(idx as u64);
                    inputs[idx].value.set(new);
                }
            }

            EXECUTIONS.store(0, Ordering::Relaxed);
            let start = Instant::now();
            let out = read!(root(graph, $root_id).read_strongly_consistent())?;
            let computed = EXECUTIONS.load(Ordering::Relaxed);

            let label = if it == 0 { "cold build" } else { "after edit" };
            println!(
                "  iter {it:>2} ({label}): {computed:>5} / {} modules computed  result={:#018x}  \
                 {:>10.2?}",
                $total_modules,
                out.hash,
                start.elapsed(),
            );
        }
        anyhow::Ok(())
    }};
}

#[cfg(not(feature = "sync"))]
#[allow(clippy::too_many_arguments)]
async fn run_driver(
    deps: Vec<Vec<u32>>,
    leaf_input: Vec<i64>,
    root_id: u32,
    n_inputs: u32,
    total_modules: usize,
    work: u32,
    parallel: bool,
    iters: u32,
    churn: u32,
) -> Result<()> {
    run_driver_body!(
        deps,
        leaf_input,
        root_id,
        n_inputs,
        total_modules,
        work,
        parallel,
        iters,
        churn
    )
}

#[cfg(feature = "sync")]
#[allow(clippy::too_many_arguments)]
fn run_driver(
    deps: Vec<Vec<u32>>,
    leaf_input: Vec<i64>,
    root_id: u32,
    n_inputs: u32,
    total_modules: usize,
    work: u32,
    parallel: bool,
    iters: u32,
    churn: u32,
) -> Result<()> {
    run_driver_body!(
        deps,
        leaf_input,
        root_id,
        n_inputs,
        total_modules,
        work,
        parallel,
        iters,
        churn
    )
}

/// Async engine: the driver is an async task body fed to `run_once`.
#[cfg(not(feature = "sync"))]
async fn run_demo() -> Result<()> {
    let cfg = Config::from_env();
    let (deps, leaf_input, root_id, n_inputs) = build_graph(&cfg);
    let total_modules = deps.len();
    print_plan(&cfg, total_modules);

    let tt = make_tt();
    let (work, parallel, iters, churn) = (cfg.work, cfg.parallel, cfg.iters, cfg.churn);

    turbo_tasks::run_once(tt, async move {
        run_driver(
            deps,
            leaf_input,
            root_id,
            n_inputs,
            total_modules,
            work,
            parallel,
            iters,
            churn,
        )
        .await
    })
    .await?;

    println!("\ndone.");
    Ok(())
}

/// Sync engine: the driver is a plain synchronous closure fed to `run_sync`. No async
/// runtime AND no async code — the whole program is synchronous end to end.
#[cfg(feature = "sync")]
fn run_demo() -> Result<()> {
    let cfg = Config::from_env();
    let (deps, leaf_input, root_id, n_inputs) = build_graph(&cfg);
    let total_modules = deps.len();
    print_plan(&cfg, total_modules);

    let tt = make_tt();
    let (work, parallel, iters, churn) = (cfg.work, cfg.parallel, cfg.iters, cfg.churn);

    tt.run_sync(move || {
        run_driver(
            deps,
            leaf_input,
            root_id,
            n_inputs,
            total_modules,
            work,
            parallel,
            iters,
            churn,
        )
    })?;

    println!("\ndone.");
    Ok(())
}

#[cfg(not(feature = "sync"))]
#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<()> {
    run_demo().await
}

#[cfg(feature = "sync")]
fn main() -> Result<()> {
    // No async runtime, and no async code: the sync demo is a plain synchronous program
    // end to end (`run_sync` + `read!`, no `.await`, no `sync_poll`).
    run_demo()
}
