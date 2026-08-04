//! Sync-engine stress test (P5a): a **wide + deep + shared-dependency + CPU-heavy**
//! incremental graph, driven cold then re-driven after edits, checked against a pure-Rust
//! reference oracle — under a **watchdog** that aborts the process (instead of hanging the
//! suite) if the computation stalls.
//!
//! This harness verifies the execution engine against exactly the load that has historically
//! deadlocked the sync engine (a wide fan-out whose items share deep dependencies, each doing real
//! CPU work). On the current engine it passes; as the scheduler becomes the executor it must
//! keep passing. Run it with the deadlock dump enabled to diagnose a stall:
//!
//! ```text
//! cargo test -p turbo-tasks-sync-tests --features instrument --test stress -- --nocapture
//! ```
#![cfg(feature = "sync")]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicU64, Ordering},
};

use anyhow::Result;
use turbo_tasks::{
    State, TurboTasks, Vc, parallel, read,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Counts `s_module` body executions (cache misses), so each drive can assert how many
/// modules actually recomputed (cold = all; after an edit = a strict subset).
static EXEC: AtomicU64 = AtomicU64::new(0);

#[turbo_tasks::value]
struct SInput {
    value: State<u64>,
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct SOut {
    hash: u64,
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct SGraph {
    deps: Vec<Vec<u32>>,
    leaf_input: Vec<i64>,
    work: u32,
}

/// One cached leaf input per index (every reader of input `i` shares one `State`).
#[turbo_tasks::function]
fn s_make_input(idx: u32) -> Vc<SInput> {
    SInput {
        value: State::new(idx as u64),
    }
    .cell()
}

/// Simulated per-module CPU work — must match [`ref_spin`] exactly.
fn spin(mut x: u64, n: u32) -> u64 {
    for _ in 0..n {
        x = x
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
    }
    x
}

/// One module: fold its dependencies' outputs (in order) or read its leaf input, then
/// spin. Dependencies are read with `parallel!` so the fan-out exercises the scheduler.
#[turbo_tasks::function]
async fn s_module(graph: Vc<SGraph>, id: u32) -> Result<Vc<SOut>> {
    EXEC.fetch_add(1, Ordering::Relaxed);
    let g = read!(graph)?;
    let deps = &g.deps[id as usize];
    let mut acc = id as u64;
    if deps.is_empty() {
        let input = s_make_input(g.leaf_input[id as usize] as u32);
        acc = acc.wrapping_add(*read!(input)?.value.get());
    } else {
        for out in parallel!(deps.iter().map(|&d| s_module(graph, d)))? {
            acc = acc.rotate_left(7) ^ out.hash;
        }
    }
    Ok(SOut {
        hash: spin(acc, g.work),
    }
    .cell())
}

/// Strongly-consistent root entry point (a `root` task, required so the driver can force
/// recomputation of the dirty subtree after an edit). Mirrors the demo's `root`.
#[turbo_tasks::function(root)]
async fn s_root(graph: Vc<SGraph>, root_id: u32) -> Result<Vc<SOut>> {
    Ok(SOut {
        hash: read!(s_module(graph, root_id))?.hash,
    }
    .cell())
}

// --- Pure-Rust reference oracle (engine-independent) -----------------------------------

fn ref_spin(x: u64, n: u32) -> u64 {
    spin(x, n)
}

/// Compute module `id`'s hash from the graph + current input values, exactly mirroring
/// `s_module`. Memoized over a single drive (the graph is a DAG).
fn ref_module(
    deps: &[Vec<u32>],
    leaf_input: &[i64],
    inputs: &[u64],
    work: u32,
    id: u32,
    memo: &mut [Option<u64>],
) -> u64 {
    if let Some(h) = memo[id as usize] {
        return h;
    }
    let d = &deps[id as usize];
    let mut acc = id as u64;
    if d.is_empty() {
        acc = acc.wrapping_add(inputs[leaf_input[id as usize] as usize]);
    } else {
        for &dep in d {
            let h = ref_module(deps, leaf_input, inputs, work, dep, memo);
            acc = acc.rotate_left(7) ^ h;
        }
    }
    let h = ref_spin(acc, work);
    memo[id as usize] = Some(h);
    h
}

fn ref_root(deps: &[Vec<u32>], leaf_input: &[i64], inputs: &[u64], work: u32, root: u32) -> u64 {
    let mut memo = vec![None; deps.len()];
    ref_module(deps, leaf_input, inputs, work, root, &mut memo)
}

/// Build a deterministic layered DAG (mirrors the demo's `build_graph`):
/// - layer 0: `width` leaves, each reading input `i`;
/// - layers 1..L: each module depends on `fanout` modules of the layer below (shared
///   deterministically across the width — this is the shared-dependency stress);
/// - one root depending on the entire top layer (the wide fan-out / fan-in).
fn build_graph(width: u32, layers: u32, fanout: u32) -> (Vec<Vec<u32>>, Vec<i64>, u32) {
    let total = layers * width + 1;
    let root_id = layers * width;
    let mut deps = vec![Vec::new(); total as usize];
    let mut leaf_input = vec![-1i64; total as usize];
    for j in 0..width {
        leaf_input[j as usize] = j as i64;
    }
    for layer in 1..layers {
        for j in 0..width {
            let id = layer * width + j;
            let mut d = Vec::with_capacity(fanout as usize);
            for k in 0..fanout {
                d.push((layer - 1) * width + (j + k * 7 + 1) % width);
            }
            deps[id as usize] = d;
        }
    }
    deps[root_id as usize] = (0..width).map(|j| (layers - 1) * width + j).collect();
    (deps, leaf_input, root_id)
}

fn make_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

/// Arm a watchdog that aborts the whole test process (with a message) if `done` is not set
/// within `timeout`. A stall therefore fails loudly and promptly instead of hanging the
/// suite until the CI-level timeout. With `--features instrument` the `tt_parallel` pool's
/// own watchdog prints the per-worker / wait-graph dump first.
fn arm_watchdog(timeout: std::time::Duration) -> Arc<AtomicBool> {
    let done = Arc::new(AtomicBool::new(false));
    let flag = done.clone();
    std::thread::Builder::new()
        .name("stress-watchdog".into())
        .spawn(move || {
            let start = std::time::Instant::now();
            while !flag.load(Ordering::Relaxed) {
                if start.elapsed() > timeout {
                    eprintln!(
                        "\n=== STRESS WATCHDOG: sync graph did not complete within {timeout:?} — \
                         treating as a deadlock. (Run with --features instrument for the \
                         tt_parallel state dump.) ==="
                    );
                    std::process::abort();
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        })
        .expect("spawn watchdog");
    done
}

#[test]
fn wide_deep_shared_cpu_heavy_incremental() {
    // Sized to be a genuine stress (wide fan-out over a deep, shared, CPU-heavy DAG) while
    // finishing comfortably inside the watchdog on a working engine.
    const WIDTH: u32 = 48;
    const LAYERS: u32 = 8;
    const FANOUT: u32 = 4;
    const WORK: u32 = 3000;
    const ITERS: u32 = 5;
    const CHURN: u32 = 3;

    let (deps, leaf_input, root_id) = build_graph(WIDTH, LAYERS, FANOUT);
    let total_modules = deps.len();
    let n_inputs = WIDTH;

    let done = arm_watchdog(std::time::Duration::from_secs(60));
    let tt = make_tt();

    // Track the reference input values in lock-step with the in-engine `State`s.
    let mut inputs: Vec<u64> = (0..n_inputs as u64).collect();

    tt.run_sync(move || {
        // Eventually-consistent leaf reads from this driver task are intentional.
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let graph = SGraph {
            deps: deps.clone(),
            leaf_input: leaf_input.clone(),
            work: WORK,
        }
        .cell();

        // Handles to every leaf input's mutable State, so we can "edit files".
        let mut input_refs = Vec::with_capacity(n_inputs as usize);
        for i in 0..n_inputs {
            input_refs.push(read!(s_make_input(i))?);
        }

        for it in 0..ITERS {
            if it > 0 {
                for k in 0..CHURN {
                    let idx = ((it * CHURN + k) % n_inputs) as usize;
                    let new = (it as u64)
                        .wrapping_mul(2654435761)
                        .wrapping_add(idx as u64);
                    input_refs[idx].value.set(new);
                    inputs[idx] = new;
                }
            }

            EXEC.store(0, Ordering::Relaxed);
            let out = read!(s_root(graph, root_id).strongly_consistent())?;
            let computed = EXEC.load(Ordering::Relaxed);

            let expected = ref_root(&deps, &leaf_input, &inputs, WORK, root_id);
            assert_eq!(
                out.hash, expected,
                "iter {it}: engine hash {:#018x} != reference {:#018x}",
                out.hash, expected
            );

            if it == 0 {
                assert_eq!(
                    computed, total_modules as u64,
                    "cold build must compute every module"
                );
            } else {
                assert!(
                    computed > 0 && (computed as usize) < total_modules,
                    "iter {it}: incremental recompute {computed} should be a strict subset of \
                     {total_modules}"
                );
            }
        }
        anyhow::Ok(())
    })
    .unwrap();

    done.store(true, Ordering::Relaxed);
}
