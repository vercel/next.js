#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Task ids freed by GC are handed back to the id factory, but only after a deferral window.
//!
//! The point of reuse is **density** — keeping the live id set packed so that flat, array-backed
//! storage stays viable — so these tests assert on the id watermark (`next_fresh`), not on reuse
//! counts. A watermark that keeps climbing while the live task count is flat means ids are leaking
//! out of the pipeline even if some are being recycled.

mod gc_fixture;
mod util;

use std::time::Duration;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc, unmark_top_level_task_may_leak_eventually_consistent_state};
use turbo_tasks_backend::{BackendOptions, EvictionMode};

use crate::{
    gc_fixture::{Selector, create_selector},
    util::{create_persistence_dir, create_tt_with_options, reopen_tt_with_id_reuse},
};

#[turbo_tasks::function]
fn reuse_leaf(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

/// A root op that allocates `count` distinct new leaf tasks, so a test can force the factory to
/// hand out exactly that many ids.
#[turbo_tasks::function(operation, root)]
async fn allocate_fresh(base: u32, count: u32) -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for n in base..(base + count) {
        sum = sum.wrapping_add(*reuse_leaf(n).await?);
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function]
async fn reuse_branch(generation: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *reuse_leaf(generation).await?))
}

/// Reads a branch keyed by the selector's generation. Bumping the generation disconnects the whole
/// previous branch, orphaning it for GC.
#[turbo_tasks::function(operation, root)]
async fn select_generation(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    let use_second = *selector.await?.get();
    let value = if use_second {
        *reuse_branch(2).await?
    } else {
        *reuse_branch(1).await?
    };
    Ok(Vc::cell(value))
}

/// Options with GC on and the reuse delay pinned, so a test controls the window explicitly rather
/// than depending on the default or the env var.
fn options(delay_cycles: u32) -> BackendOptions {
    BackendOptions {
        num_workers: Some(2),
        small_preallocation: true,
        storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
        eviction_mode: EvictionMode::Full,
        gc: Some(true),
        gc_root_ttl: Some(Duration::from_secs(3600)),
        id_reuse_delay_cycles: Some(delay_cycles),
        ..Default::default()
    }
}

/// With the window at zero, an id freed by GC comes back on the very next cycle and the factory
/// hands it out again instead of minting a fresh one.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn freed_ids_are_reused_after_the_window() {
    let (tt, _dir) = create_tt_with_options("gc_id_reuse_reused", options(0));
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select_generation(selector_vc);
        output.read_strongly_consistent().await?;
        // Orphan the first branch and its leaf.
        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let (pending_before, watermark_before) = tt2.backend().id_reuse_state_for_testing();
    assert_eq!(pending_before, 0, "nothing deferred before the first sweep");

    // Collect, tombstone, evict. With delay 0 the freed ids are released by this same cycle.
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert!(collected > 0, "the orphaned branch should be collected");
    tt2.backend().snapshot_and_evict_for_testing(&tt2);

    let (pending_after, watermark_after) = tt2.backend().id_reuse_state_for_testing();
    assert_eq!(
        pending_after, 0,
        "with a zero-cycle window every freed id is released immediately"
    );
    assert_eq!(
        watermark_before, watermark_after,
        "eviction must not mint ids"
    );

    // Allocate exactly as many new tasks as GC freed. If reuse works they all come from the free
    // list and the watermark — the count of ids ever *minted* — does not move.
    let freshly_needed = collected as u32;
    let tt3 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        // Distinct arguments, so these are genuinely new tasks the factory must allocate ids for.
        allocate_fresh(100, freshly_needed)
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let (_, watermark_rebuilt) = tt3.backend().id_reuse_state_for_testing();
    // `allocate_fresh` is itself a new task and its id cannot come from the free list (it is
    // created before any leaf), so the watermark may advance by at most that one. Every leaf must
    // come from the free list.
    let minted = watermark_rebuilt - watermark_after;
    assert!(
        minted <= 1,
        "allocating {freshly_needed} tasks after freeing {collected} should draw from the free \
         list; the factory minted {minted} fresh ids instead (watermark {watermark_after} -> \
         {watermark_rebuilt})"
    );

    tt.stop_and_wait().await;
}

/// With a non-zero window, a freed id is held back: it is neither reusable nor lost, and the
/// factory mints fresh ids in the meantime rather than aliasing one that may still be referenced.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn freed_ids_wait_out_the_window() {
    let (tt, _dir) = create_tt_with_options("gc_id_reuse_deferred", options(5));
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let output = select_generation(selector_vc);
        output.read_strongly_consistent().await?;
        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let collected = tt2.backend().gc_for_testing(&tt2);
    assert!(collected > 0, "the orphaned branch should be collected");
    tt2.backend().snapshot_and_evict_for_testing(&tt2);

    let (pending, _) = tt2.backend().id_reuse_state_for_testing();
    assert_eq!(
        pending, collected,
        "every collected id must be waiting out the window, neither reused nor dropped"
    );

    // Further cycles with no new garbage must not release them early.
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let (still_pending, _) = tt2.backend().id_reuse_state_for_testing();
    assert_eq!(
        still_pending, collected,
        "a 5-cycle window must not release after 2 cycles"
    );

    tt.stop_and_wait().await;
}

/// Ids freed in one session are offered to the next one: the id space does not grow just because
/// the process restarted. This is the cross-session half of reuse — the in-memory free list dies
/// with the process, so without the persisted set a restart would always mint fresh ids.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn freed_ids_survive_a_restart() {
    let dir = create_persistence_dir("gc_id_reuse_cross_session");

    // Session 1: build a subtree, orphan it, collect it, and shut down.
    let tt = reopen_tt_with_id_reuse(&dir, 0);
    let tt2 = tt.clone();
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;
        let output = select_generation(selector_vc);
        output.read_strongly_consistent().await?;
        selector.set(true);
        output.read_strongly_consistent().await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let collected = tt2.backend().gc_for_testing(&tt2);
    assert!(collected > 0, "the orphaned branch should be collected");
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    let (_, watermark_session1) = tt2.backend().id_reuse_state_for_testing();
    tt.stop_and_wait().await;

    // Session 2: the freed ids should have been seeded into the factory's free list, so the
    // allocation watermark starts where session 1 left it and new tasks draw from the free list.
    let tt = reopen_tt_with_id_reuse(&dir, 0);
    let tt2 = tt.clone();
    let (_, watermark_start) = tt2.backend().id_reuse_state_for_testing();
    assert!(
        watermark_start <= watermark_session1,
        "a restart must not advance the id watermark ({watermark_session1} -> {watermark_start})"
    );

    let needed = collected as u32;
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        allocate_fresh(500, needed)
            .read_strongly_consistent()
            .await?;
        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    let (_, watermark_after) = tt2.backend().id_reuse_state_for_testing();
    let minted = watermark_after - watermark_start;
    assert!(
        minted <= 1,
        "allocating {needed} tasks in a fresh session should draw on the ids the previous session \
         freed; the factory minted {minted} instead ({watermark_start} -> {watermark_after})"
    );

    tt.stop_and_wait().await;
}
