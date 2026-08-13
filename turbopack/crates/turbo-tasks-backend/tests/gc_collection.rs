#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TaskId, Vc, prevent_gc,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};

use crate::util::create_tt;

/// The `TaskId` backing a resolved `Vc` (its `TaskOutput` node).
fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a resolved Vc should be backed by a task")
}

#[turbo_tasks::value(transparent)]
struct Selector(State<bool>);

#[turbo_tasks::function(operation, root)]
fn create_selector(initial: bool) -> Vc<Selector> {
    Selector(State::new(initial)).cell()
}

#[turbo_tasks::function]
fn leaf(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

#[turbo_tasks::function]
async fn branch_a() -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(10).await?))
}

#[turbo_tasks::function]
async fn branch_b() -> Result<Vc<u32>> {
    Ok(Vc::cell(2 + *leaf(20).await?))
}

/// A task that pins itself against GC while executing. Once pinned it must survive collection even
/// after it is disconnected.
#[turbo_tasks::function]
async fn pinned_branch() -> Result<Vc<u32>> {
    prevent_gc();
    Ok(Vc::cell(99))
}

/// Reads exactly one branch depending on the selector; flipping it re-executes and disconnects the
/// previously-read branch (and its subtree), which should drop that branch's `parent_count` to 0.
#[turbo_tasks::function(operation, root)]
async fn select(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    let use_b = *selector.await?.get();
    let value = if use_b {
        *branch_b().await?
    } else {
        *branch_a().await?
    };
    Ok(Vc::cell(value))
}

/// Like `select`, but reads `pinned_branch` instead of `branch_a` when the selector is false.
#[turbo_tasks::function(operation, root)]
async fn select_pinned(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    let use_b = *selector.await?.get();
    let value = if use_b {
        *branch_b().await?
    } else {
        *pinned_branch().await?
    };
    Ok(Vc::cell(value))
}

/// A cleanly-disconnected subtree must be collected, cascading from the disconnected root to its
/// children: flipping the selector drops `branch_a` to `parent_count 0`, and collecting it zeroes
/// `leaf(10)` so that it is collected in the same pass. The live branch (branch_b + leaf(20)) is
/// untouched and the graph still computes; flipping back recomputes branch_a fresh, proving no
/// dangling references.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_collects_disconnected_subtree() {
    let (tt, _persistence_dir) = create_tt("gc_collects_disconnected_subtree");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 11);

        // Flip: select drops branch_a; branch_a (parent_count 0) becomes a candidate.
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // GC runs in a fresh `run_once` after the first completes: a `run_once` root keeps every task
    // it touched active (active_counter > 0) until it returns, so a task disconnected *within*
    // that run is not yet collectible. Once the run ends the active counts are released and the
    // disconnected branch_a (parent_count 0) becomes collectible; the cascade then drops
    // leaf(10) to 0 too.
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected, 2,
        "branch_a and its cascaded child leaf(10) should both be collected"
    );
    assert_eq!(
        tt2.backend().gc_for_testing(&tt2),
        0,
        "a second GC pass must collect nothing"
    );

    // Flipping back must recompute branch_a fresh, since it was collected.
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(true);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let output = select(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 22);
        selector.set(false);
        assert_eq!(*output.read_strongly_consistent().await?, 11);
        let _ = &tt3;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    tt.stop_and_wait().await;
}

/// A task that pins itself via `prevent_gc()` must survive collection even after it is disconnected
/// from the live graph, because the pin makes it a GC root.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_does_not_collect_pinned_task() {
    let (tt, _persistence_dir) = create_tt("gc_does_not_collect_pinned_task");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select_pinned(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 99);

        // Flip: select_pinned re-executes, reads branch_b, and disconnects pinned_branch.
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // GC runs after the run has released activeness, so pinned_branch is disconnected
    // (parent_count 0) and otherwise collectible.
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected, 0,
        "a pinned task must not be collected even when disconnected"
    );

    // A snapshot + evict must not lose the (transient) pin. A pinned task is not forced fully
    // resident — its Meta/Data may be partially evicted — but the session-only
    // `transient_ref_count` is retained as residue (the map entry is kept), so the task stays
    // uncollectible and a subsequent GC still collects nothing.
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    assert_eq!(
        tt2.backend().gc_for_testing(&tt2),
        0,
        "pinned task must survive eviction and not be collected"
    );

    tt.stop_and_wait().await;
}

/// Unpinning a task after the backend has started stopping must not panic. This mirrors the real
/// shutdown ordering: a `DetachedVc` handed to JS across NAPI is finalized (dropped, which unpins)
/// during Node worker teardown, which can run *after* `stop()` has dropped the whole task map.
/// pin/unpin are gated on the `stopping` flag (set before the map is dropped) so a late unpin is a
/// no-op rather than resurrecting a blank entry and underflowing `transient_ref_count`.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unpin_after_stop_does_not_panic() {
    let (tt, _persistence_dir) = create_tt("unpin_after_stop_does_not_panic");

    // Pin a real task inside a session (as `prevent_gc` / `DetachedVc::new` would).
    let tt2 = tt.clone();
    let leaf_id = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let id = task_id_of(leaf(7).resolve().await?);
        tt2.pin_task_for_gc(id);
        anyhow::Ok(id)
    })
    .await
    .unwrap();

    // Stop the backend — this drops the in-memory task map, so the pinned task is no longer
    // resident (exactly as at `next build` shutdown).
    tt.stop_and_wait().await;

    // Unpin after teardown, as a `DetachedVc`'s `Drop` finalized during Node worker cleanup would.
    // The task is gone from the map, so this must be a harmless no-op — not an underflow panic.
    tt.unpin_task_for_gc(leaf_id);
}
