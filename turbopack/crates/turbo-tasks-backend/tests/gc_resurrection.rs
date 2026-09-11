#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! GC teardown of a cleanly-disconnected subtree whose tasks hold real forward-dependency edges on
//! each other.
//!
//! The central invariant: when a task `S` that is the `upper` of its children is collected, GC
//! must **rebalance the aggregation graph** — remove `S` from each child's `upper` set — so the
//! children (now both parentless and upper-less) become collectible and cascade in the same pass.
//!
//! Fixture constraints: only **mutable** tasks record dependency edges (see
//! `add_cell_dependency`), so the leaves read a long-lived `State` whose value never changes. The
//! subtree must also be disconnected *cleanly* — drop the parent's reference, don't invalidate,
//! since invalidation runs `cleanup_old_edges` and strips the outgoing deps first.

mod gc_fixture;
mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    gc_fixture::{Constant, Selector, create_constant, create_selector, diamond_root},
    util::create_tt,
};

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
        *diamond_root(*constant, FANOUT).await?
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

    // Only the three top-level `(operation, root)` tasks may be tracked as roots. A leaf that
    // reached the post-drain scan still holding a dangling `upper` edge to the deleted `reader`
    // would land in the map as `MostRecent`, which never ages out. If this fires it is a finding
    // about the aggregation graph, not a reason to narrow `gc_is_root`.
    let roots = tt2.backend().persisted_gc_roots_for_testing();
    assert_eq!(roots.len(), 3, "unexpected roots tracked: {roots:?}");

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

static IMM_LEAF_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

/// An immutable leaf: no invalidator, no dependencies, not session dependent.
#[turbo_tasks::function]
fn imm_leaf(n: u32) -> Vc<u32> {
    IMM_LEAF_EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    Vc::cell(n * 3)
}

/// Reads `imm_leaf(n)` from inside a tracked task.
///
/// The read runs here rather than at the top level of `run_once`, so the plain (eventually
/// consistent) `.await` is legal and deterministic: it is ordered by the task graph instead of
/// racing whatever the session happens to be doing.
#[turbo_tasks::function(operation, root)]
async fn read_imm_leaf(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*imm_leaf(n).await?))
}

#[turbo_tasks::function]
async fn imm_reader() -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..IMM_FANOUT {
        sum = sum.wrapping_add(*imm_leaf(index).await?);
    }
    Ok(Vc::cell(sum))
}

const IMM_FANOUT: u32 = 8;

/// Selector-gated root: reads `imm_reader` only while the selector is `false`, so flipping to
/// `true` disconnects the immutable subtree cleanly (no invalidation) and lets it reach
/// `parent_count 0`.
#[turbo_tasks::function(operation, root)]
async fn select_imm_reader(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    let use_reader = !*selector.await?.get();
    let value = if use_reader {
        *imm_reader().await?
    } else {
        0u32
    };
    Ok(Vc::cell(value))
}

/// An **immutable** task that is collected and reconnected before any snapshot must come back dirty
/// and re-execute, producing the correct value.  Normally we don't allow re-execution of immutable
/// tasks, but resurrection is special
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn gc_resurrect_immutable_recomputes() {
    let (tt, _persistence_dir) = create_tt("gc_resurrect_immutable_recomputes");
    let tt2 = tt.clone();
    let expected: u32 = (0..IMM_FANOUT).fold(0u32, |a, b| a.wrapping_add(b * 3));

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select_imm_reader(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, expected);

        // Disconnect the immutable subtree without invalidating it.
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 0);
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // Relative, not absolute: the counter is process-global and `imm_leaf` is shared with the other
    // test in this file, which may have already run against a different backend instance.
    let executions_before = IMM_LEAF_EXECUTIONS.load(Ordering::Relaxed);
    assert!(
        executions_before >= IMM_FANOUT,
        "each immutable leaf should have executed at least once during the build, got \
         {executions_before}"
    );

    // Collect the disconnected subtree. The entries stay resident (no snapshot yet), so the tasks
    // are soft-deleted rather than gone.
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected,
        IMM_FANOUT as usize + 1,
        "imm_reader and all {IMM_FANOUT} immutable leaves should be collected"
    );

    // First route back to a collected leaf: read one *directly*, not through the selector root.
    // This must recompute it rather than serve a stale value. Done before the reconnect below,
    // while the subtree is still collected — afterwards the leaves are live again and a read would
    // legitimately hit a fresh cell, proving nothing.
    let tt_direct = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        assert_eq!(*read_imm_leaf(0).read_strongly_consistent().await?, 0);
        let _ = &tt_direct;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();
    let executions_after_direct = IMM_LEAF_EXECUTIONS.load(Ordering::Relaxed);
    assert!(
        executions_after_direct > executions_before,
        "reading a collected immutable leaf directly must re-execute it, but the execution count \
         did not move past {executions_before}"
    );

    // Reconnect BEFORE any snapshot. These tasks were never persisted, so there is nothing on disk
    // to restore — the only way back to a correct value is re-execution.
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        selector.set(false);
        let output = select_imm_reader(selector_vc);
        assert_eq!(
            *output.read_strongly_consistent().await?,
            expected,
            "a resurrected immutable task must recompute the correct value"
        );
        let _ = &tt3;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    assert!(
        IMM_LEAF_EXECUTIONS.load(Ordering::Relaxed) > executions_after_direct,
        "the resurrected leaves must have re-executed, but the execution count did not move past \
         {executions_after_direct} — compared against the post-direct-read value so that read's \
         own re-execution cannot satisfy this"
    );

    // A snapshot + evict must not have tombstoned the resurrected subtree, and the restored data
    // must survive the round trip.
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let tt4 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let output = select_imm_reader(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, expected);
        let _ = &tt4;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    tt.stop_and_wait().await;
}
