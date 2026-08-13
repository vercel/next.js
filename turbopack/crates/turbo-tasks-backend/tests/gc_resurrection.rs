#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! GC teardown of a cleanly-disconnected subtree whose tasks hold real forward-dependency edges on
//! each other.
//!
//! The central invariant: when a task `S` that is the `upper` of its children is collected, GC
//! must **rebalance the aggregation graph** — remove `S` from each child's `upper` set — so the
//! children (now both parentless and upper-less) become collectible and cascade in the same pass.
//! GC does this by running the same `CleanupOldEdges` operation a re-executing task uses.
//!
//! For a child to record a forward-dependency edge on / from `S` at all, the tasks involved must
//! be **mutable** (immutable/constant tasks never record dependency edges — see
//! `add_cell_dependency`), and the subtree must be disconnected *cleanly* (dropping the parent's
//! reference, not invalidating the children — invalidation runs `cleanup_old_edges`, which strips
//! the outgoing deps first). We make the leaves mutable by having them read a long-lived `State`
//! whose value never changes.

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, EvictionMode, GitVersionInfo, TurboTasksBackend};

fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

fn create_tt(name: &str) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_test_persistence_dir(name);
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "test-unversioned",
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
struct Selector(State<bool>);

#[turbo_tasks::function(operation, root)]
fn create_selector(initial: bool) -> Vc<Selector> {
    Selector(State::new(initial)).cell()
}

/// A long-lived State whose *value never changes*, read by the leaves purely to make each leaf
/// **mutable**, so a reader records a real dependency edge on it. The state task is a root and
/// stays alive; the leaves reach it via a dependency edge, not a child edge, so disconnecting the
/// leaves as children still lets them lose activeness.
#[turbo_tasks::value(transparent)]
struct Constant(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_constant() -> Vc<Constant> {
    Constant(State::new(0)).cell()
}

/// The forward-dependency *target*: mutable because it reads `constant`'s State. `FANOUT` distinct
/// leaves per reader give many chances for the racing interleaving.
#[turbo_tasks::function]
async fn sd_leaf(constant: ResolvedVc<Constant>, index: u32) -> Result<Vc<u32>> {
    let base = *constant.await?.get();
    Ok(Vc::cell(base.wrapping_add(index)))
}

const FANOUT: u32 = 400;

/// The *reader* `S`: reads every `sd_leaf`, so it (a) connects each leaf as a child and (b) records
/// an outgoing dependency on each. When `reader` is collected while still holding those deps,
/// `Collect(reader)` spawns scrub jobs referencing all leaves — and every leaf is itself
/// collectible (cascaded from `reader`'s decrement), so each is a resurrection candidate.
#[turbo_tasks::function]
async fn reader(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..FANOUT {
        sum = sum.wrapping_add(*sd_leaf(*constant, index).await?);
    }
    Ok(Vc::cell(sum))
}

/// A *sibling* forward-dependency target for the diamond fixture (`B`).
#[turbo_tasks::function]
async fn diamond_target(constant: ResolvedVc<Constant>, index: u32) -> Result<Vc<u32>> {
    let base = *constant.await?.get();
    Ok(Vc::cell(base.wrapping_add(index).wrapping_mul(7)))
}

/// A diamond *reader* (`A`): reads the cell of a `diamond_target` (`B`) that is **passed in as an
/// already-resolved `Vc`** — so `A` records a forward (cell) dependency on `B` WITHOUT connecting
/// `B` as `A`'s child (a child edge is only created by *calling* a task; here `B` was called by
/// `diamond_root`). This decoupling is the crux: `B`'s only parent is `diamond_root`, so when the
/// root is collected BOTH `A` and `B` reach `parent_count 0` at the same time and cascade-collect
/// concurrently — while `A` still holds a forward-dep on `B` to scrub.
#[turbo_tasks::function]
async fn diamond_reader(target: ResolvedVc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *target.await?))
}

/// The diamond root: parents both `A` and `B` as siblings, so collecting the root cascades a
/// `Collect` for every `A` and `B` at once — a `B` can therefore be collected before the
/// `Collect(A)` whose `CleanupOldEdges` opens it.
#[turbo_tasks::function]
async fn diamond_root(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..FANOUT {
        let target = diamond_target(*constant, index).to_resolved().await?;
        sum = sum.wrapping_add(*target.await?);
        sum = sum.wrapping_add(*diamond_reader(*target).await?);
    }
    Ok(Vc::cell(sum))
}

/// A root that reads `reader()` only while the selector is `false`. Flipping the selector to `true`
/// drops `reader` (and, transitively, all `sd_leaf`s) from the live graph **without invalidating
/// them** — so they stay clean and retain their outgoing dependency edges, then all become
/// `parent_count 0` and collectible in a single pass.
#[turbo_tasks::function(operation, root)]
async fn select_reader(
    selector: ResolvedVc<Selector>,
    constant: ResolvedVc<Constant>,
) -> Result<Vc<u32>> {
    let use_reader = !*selector.await?.get();
    let value = if use_reader {
        *reader(*constant).await?
    } else {
        0u32
    };
    Ok(Vc::cell(value))
}

/// Selector-gated root for the diamond fixture: reads `diamond_root` only while the selector is
/// `false`, so flipping to `true` disconnects the whole diamond subtree cleanly.
#[turbo_tasks::function(operation, root)]
async fn select_diamond(
    selector: ResolvedVc<Selector>,
    constant: ResolvedVc<Constant>,
) -> Result<Vc<u32>> {
    let use_diamond = !*selector.await?.get();
    let value = if use_diamond {
        *diamond_root(*constant).await?
    } else {
        0u32
    };
    Ok(Vc::cell(value))
}

/// The **aggregation-graph rebalance** in GC: when the `reader` subtree is disconnected cleanly and
/// collected, GC must remove `reader` from each `sd_leaf`'s `upper` set so the leaves — now
/// parentless *and* upper-less — cascade-collect in the same pass. Without the rebalance a leaf
/// keeps a dangling `upper` edge to the deleted `reader`, fails `gc_maybe_collectible`, and leaks
/// until eviction hides it.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_rebalances_aggregation_and_cascades_in_one_pass() {
    let (tt, _persistence_dir) = create_tt("gc_rebalances_aggregation_and_cascades_in_one_pass");
    let tt2 = tt.clone();

    // Build the graph (selector=false: select_reader -> reader -> FANOUT sd_leaves).
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;

        let output = select_reader(selector_vc, constant_vc);
        output.read_strongly_consistent().await?;

        // Disconnect reader + all sd_leaves in one shot (no invalidation of the children).
        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // Baseline resident count with the reader subtree disconnected but not yet collected.
    let baseline = tt2.backend().resident_persistent_task_count_for_testing();

    let collected = tt2.backend().gc_for_testing(&tt2);
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let after = tt2.backend().resident_persistent_task_count_for_testing();

    assert_eq!(
        collected,
        FANOUT as usize + 1,
        "reader and all {FANOUT} sd_leaves should be collected in one pass"
    );
    assert_eq!(
        after,
        baseline - (FANOUT as usize + 1),
        "resident count must drop by exactly the collected subtree"
    );

    tt.stop_and_wait().await;
}

/// The **residual resurrection** race that soft-deletion exists to close. Collecting `diamond_root`
/// cascades a concurrent `Collect` for every reader `A` and target `B`; `CleanupOldEdges(A)` opens
/// `B` via `ctx.task(B, Data)` to scrub the reverse edge. If `B` had already been removed from the
/// map, `ctx.task` would restore it from disk as a zombie and memory/disk would diverge. Because a
/// collected task stays resident until the tombstoning snapshot commits, `ctx.task` always finds a
/// resident entry.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_diamond_forward_dep_no_resurrection() {
    let (tt, _persistence_dir) = create_tt("gc_diamond_forward_dep_no_resurrection");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;

        let output = select_diamond(selector_vc, constant_vc);
        output.read_strongly_consistent().await?;

        // Disconnect the whole diamond subtree cleanly (no invalidation).
        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let baseline = tt2.backend().resident_persistent_task_count_for_testing();

    let collected = tt2.backend().gc_for_testing(&tt2);
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let after = tt2.backend().resident_persistent_task_count_for_testing();

    assert_eq!(
        collected,
        2 * FANOUT as usize + 1,
        "diamond_root + {FANOUT} readers + {FANOUT} targets should all be collected in one pass"
    );
    assert_eq!(
        after,
        baseline - (2 * FANOUT as usize + 1),
        "resident count must drop by exactly the collected subtree — a higher count means a \
         CleanupOldEdges scrub resurrected an already-collected diamond_target"
    );

    tt.stop_and_wait().await;
}

/// Resurrection-on-connect: a task marked `deleted` by GC but reconnected **before** the
/// tombstoning snapshot must come back to life (marker cleared, made dirty, re-executed) rather
/// than being tombstoned/hard-deleted.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_resurrect_on_reconnect() {
    let (tt, _persistence_dir) = create_tt("gc_resurrect_on_reconnect");
    let tt2 = tt.clone();
    let expected: u32 = (0..FANOUT).fold(0u32, |a, b| a.wrapping_add(b));

    // Build (reader connected), then disconnect the reader subtree cleanly.
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;

        let output = select_reader(selector_vc, constant_vc);
        assert_eq!(*output.read_strongly_consistent().await?, expected);

        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // Mark the disconnected subtree `deleted` (still resident — no snapshot yet).
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected,
        FANOUT as usize + 1,
        "reader + {FANOUT} leaves should be marked collected"
    );

    // Reconnect the subtree (selector back to false) BEFORE any snapshot. Reading `reader` again
    // connects it, which must resurrect it (and its leaves, as it re-reads them).
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;
        selector.set(false);
        let output = select_reader(selector_vc, constant_vc);
        assert_eq!(
            *output.read_strongly_consistent().await?,
            expected,
            "resurrected reader must recompute the correct value"
        );
        let _ = &tt3;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // A snapshot+evict now must NOT have tombstoned/hard-deleted the resurrected subtree.
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let tt4 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let constant_op = create_constant();
        let constant_vc = constant_op.resolve().strongly_consistent().await?;
        let output = select_reader(selector_vc, constant_vc);
        assert_eq!(*output.read_strongly_consistent().await?, expected);
        let _ = &tt4;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    tt.stop_and_wait().await;
}
