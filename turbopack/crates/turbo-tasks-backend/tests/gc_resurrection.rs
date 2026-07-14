#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Regression tests for GC teardown of a cleanly-disconnected subtree whose tasks hold real
//! forward-dependency edges on each other.
//!
//! The central invariant: when a task `S` that is the `upper` of its children is collected, GC
//! must **rebalance the aggregation graph** — remove `S` from each child's `upper` set — so the
//! children (now both parentless and upper-less) become collectible and cascade in the same pass.
//! GC does this by running the same `CleanupOldEdges` operation a re-executing task uses. Without
//! it, a collected `S`'s children were left with a dangling `upper` edge to the deleted `S` and
//! stayed stuck non-collectible (leaked until eviction).
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

/// A separate long-lived State whose *value never changes*, only read by the leaves. Reading it
/// makes each leaf **mutable** (so a reader records a real dependency edge on the leaf) WITHOUT the
/// aggregation-heavy `session_dependent` machinery that keeps a task active. The state task is a
/// root, so it stays alive; the leaves depend on it via a dependency edge (not a child edge), so
/// disconnecting the leaves as children should still let them lose activeness.
#[turbo_tasks::value(transparent)]
struct Constant(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_constant() -> Vc<Constant> {
    Constant(State::new(0)).cell()
}

/// The forward-dependency *target*. Reading `constant`'s State makes it mutable (records
/// dependents) — an immutable constant task would record none. `FANOUT` distinct leaves per reader
/// give many chances for the racing interleaving.
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

/// A *sibling* forward-dependency target for the diamond fixture (`B`). Mutable (reads the
/// constant State), so a reader records a real dependency edge on it.
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

/// The diamond root: for each index, calls `diamond_target(index)` (`B`, so `B` is the root's
/// child) and `diamond_reader(B)` (`A`, passing `B`'s resolved Vc in, so `A` is the root's child
/// and forward-deps on `B` but does NOT parent it). Disconnecting the root drops both `A` and `B`
/// as siblings; collecting the root cascades a `Collect` for every `A` and `B` at once. If a `B` is
/// collected+removed before the `Collect(A)` whose `CleanupOldEdges` opens it, the immediate-remove
/// design resurrects `B`.
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
        // A trivial branch with no dependency on `reader`/`sd_leaf`.
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

/// Regression test for the missing **aggregation-graph rebalance** in GC.
///
/// `reader` is the sole `upper` of each `sd_leaf` (it reads them, and they are mutable so the edge
/// is recorded). When the `reader` subtree is disconnected cleanly and collected, GC must remove
/// `reader` from each leaf's `upper` set (the `CleanupOldEdges` rebalance) so the leaves — now
/// parentless *and* upper-less — cascade-collect in the **same pass**. Before the fix, GC dropped
/// the leaves' `parent_count` but left a dangling `upper` edge to the deleted `reader`, so every
/// leaf failed `gc_maybe_collectible` (`upper().is_empty()` false) and only `reader` was collected
/// (`collected == 1`); the leaves leaked until eviction hid them. This asserts the whole subtree
/// (`reader` + all `FANOUT` leaves) is collected in one pass and leaves memory with nothing
/// stranded.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_shared_forward_dep_no_resurrection() {
    let (tt, _persistence_dir) = create_tt("gc_shared_forward_dep_no_resurrection");
    let tt2 = tt.clone();

    // Build the graph (selector=false: select_reader -> reader -> FANOUT sd_leaves), then flip to
    // disconnect the whole reader subtree cleanly.
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

    // A single GC pass. `reader` and all FANOUT `sd_leaf`s should be collected together: the
    // aggregation rebalance frees the leaves' `upper` edge so they cascade in the same pass.
    let collected = tt2.backend().gc_for_testing(&tt2);
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let after = tt2.backend().resident_persistent_task_count_for_testing();

    // reader + FANOUT leaves = FANOUT + 1 tasks collected in one pass.
    assert_eq!(
        collected,
        FANOUT as usize + 1,
        "reader and all {FANOUT} sd_leaves should be collected in one pass (missing aggregation \
         rebalance would strand the leaves with a dangling upper edge and collect only reader)"
    );
    // The whole subtree left memory: the resident count dropped by exactly what was collected.
    assert_eq!(
        after,
        baseline - (FANOUT as usize + 1),
        "resident count must drop by exactly the collected subtree"
    );

    tt.stop_and_wait().await;
}

/// The **residual resurrection** race (the one soft-deletion is for). In the diamond, every
/// `diamond_reader` `A` and its `diamond_target` `B` are direct children of `diamond_root`, and `A`
/// holds a forward dependency on `B`. Collecting the root cascades a `Collect` for every `A` and
/// `B` concurrently. When `A`'s teardown runs `CleanupOldEdges(A)`, its dependency arm opens `B`
/// via `ctx.task(B, Data)` to scrub the reverse edge — and if `B`'s own `Collect` already removed
/// `B` from the map, `ctx.task` restores it from disk into a zombie (memory/disk diverge).
///
/// Under the current immediate-remove `Collect`, this resurrects `B`s and leaves the resident count
/// above baseline−collected. After soft-deletion (a collected task stays resident until after the
/// tombstoning snapshot commits) `ctx.task` always finds a resident entry and the count returns to
/// exactly baseline−collected.
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

    // diamond_root + FANOUT readers (A) + FANOUT targets (B) = 2*FANOUT + 1 collected in one pass.
    let collected = tt2.backend().gc_for_testing(&tt2);
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let after = tt2.backend().resident_persistent_task_count_for_testing();

    assert_eq!(
        collected,
        2 * FANOUT as usize + 1,
        "diamond_root + {FANOUT} readers + {FANOUT} targets should all be collected in one pass"
    );
    // No `diamond_target` was resurrected by a sibling reader's CleanupOldEdges scrub: the resident
    // count dropped by exactly the collected subtree. A resurrected B leaves `after` above this.
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
/// than being tombstoned/hard-deleted. We run `gc_for_testing` (which marks the disconnected
/// `reader` subtree `deleted` but leaves it resident, and does NOT snapshot), then reconnect the
/// subtree and read it: it must recompute to the correct value, and a subsequent snapshot+evict
/// must NOT have removed it.
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
    // connects it, which must resurrect it (and its leaves, as it re-reads them) and recompute the
    // correct value — proving the deleted tasks came back rather than being read stale.
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

    // A snapshot+evict now must NOT have tombstoned/hard-deleted the resurrected subtree: reading
    // it once more still yields the correct value (it is live, not gone).
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
