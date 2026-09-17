#![cfg(feature = "gc_stress")]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Are our suspend points actually safepoints?
//!
//! Backend operations cooperate with snapshotting and GC by calling `operation_suspend_point` at
//! points they believe are safe: the operation drops out of the in-flight count, registers itself
//! for replay, and parks so the exclusion phase can proceed. The correctness of the whole scheme
//! rests on that belief, and nothing checked it.
//!
//! A *snapshot* taken at an unsafe point is nearly undetectable — it just writes a subtly
//! inconsistent image. A *GC pass* at an unsafe point is loud: it hard-collects a task that
//! something was about to reference, and the next `MustExist` open panics with
//! "task exists in neither memory nor persistent storage". So GC is the sharp instrument for
//! testing this, and this test forces a full GC pass at *every* suspend point a workload reaches,
//! one per iteration.
//!
//! Run with:
//!
//! ```text
//! cargo test -p turbo-tasks-backend --features gc_stress --test gc_suspend_point_stress -- --nocapture
//! ```
//!
//! Debug assertions must be on: `assert_not_deleted` is a `debug_assert!`.
//!
//! # Why one worker thread
//!
//! `worker_threads = 1` (with `flavor = "multi_thread"`, which is required because the coordinator
//! calls `block_in_place`) makes the sequence of suspend points reproducible: the `PriorityRunner`
//! target worker count is 1, so a task scheduled from inside another task's execution is queued
//! rather than immediately spawned, and execution serializes. `tests/inline_read_execution.rs`
//! relies on the same property. It also makes GC itself serial, since `scope_unbounded_with`
//! derives `max_workers = num_workers - 1 = 0`.
//!
//! The iteration index is still a *coverage knob*, not a site selector — the trigger fires at the
//! first suspend point at or after the armed index, so the sweep stays meaningful even if the
//! count drifts. Each iteration prints the operation it caught.

mod gc_fixture;
mod util;

use std::sync::Arc;

use turbo_tasks::TurboTasks;
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{create_generation, expected_value, wide_root},
    util::create_tt_with_workers,
};

/// Small: the whole workload runs once per suspend point found.
const WIDTH: u32 = 8;

/// Generations for the first [`workload`] call of an iteration (build, then invalidate).
const FIRST: (u32, u32) = (0, 1);
/// Generations for the second call, which re-exercises the graph after the forced GC. Distinct
/// from [`FIRST`] so the values genuinely change and the recompute path runs again.
const SECOND: (u32, u32) = (2, 3);

/// One deterministic pass of work.
///
/// `nonce` is folded into the `width` argument of [`wide_root`], which is
/// `#[turbo_tasks::function(operation, root)]`. That matters: the known
/// `get_or_create_task` hazard lives in a window that only opens for `is_root` (or
/// `is_session_dependent`) functions, because only those run
/// `AggregationUpdateQueue::run(UpdateAggregationNumber)` — and it is *that* queue's suspend point
/// that can let GC collect the brand-new, not-yet-connected task. A plain
/// `#[turbo_tasks::function]` skips the block entirely, so a workload built only from those would
/// pass this test vacuously.
///
/// `generation` is set explicitly on both rounds rather than left at its initial value, because
/// the `create_generation` `State` is a cached root that survives across calls within one backend
/// — the second `workload` call in an iteration would otherwise start from the previous call's
/// generation. Passing both values in keeps each call's expectation self-contained.
///
/// Returns both rounds' computed values so the caller can assert the forced GC did not corrupt
/// them.
async fn workload(
    tt: &Arc<TurboTasks<TurboTasksBackend>>,
    nonce: u32,
    generations: (u32, u32),
) -> (u32, u32) {
    let width = WIDTH + nonce;
    let (first, second) = generations;
    turbo_tasks::run_once(tt.clone(), async move {
        let generation_op = create_generation();
        let generation_vc = generation_op.resolve().strongly_consistent().await?;

        // Round 1: build. Creates fresh root + interior + leaf tasks.
        generation_op.read_strongly_consistent().await?.set(first);
        let built = *wide_root(generation_vc, width)
            .read_strongly_consistent()
            .await?;

        // Round 2: invalidate and recompute, to reach the invalidate / update_cell /
        // cleanup_old_edges suspend points rather than only the aggregation ones.
        generation_op.read_strongly_consistent().await?.set(second);
        let rebuilt = *wide_root(generation_vc, width)
            .read_strongly_consistent()
            .await?;

        anyhow::Ok((built, rebuilt))
    })
    .await
    .unwrap()
}

/// What [`workload`] must return, if nothing was corrupted.
fn expected(nonce: u32, generations: (u32, u32)) -> (u32, u32) {
    let width = WIDTH + nonce;
    (
        expected_value(generations.0, width),
        expected_value(generations.1, width),
    )
}

/// Forcing a full GC pass at any single suspend point must leave the graph correct and usable.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn gc_at_every_suspend_point_is_safe() {
    // Pass 0: disarmed, purely to count how many suspend points this workload reaches.
    let total = {
        let (tt, _dir) = create_tt_with_workers("gc_sp_count", 1);
        tt.backend().arm_gc_at_suspend_point(0, &tt);
        let value = workload(&tt, 0, FIRST).await;
        assert_eq!(
            value,
            expected(0, FIRST),
            "baseline workload is wrong before any GC"
        );
        let total = tt.backend().suspend_points_seen_for_testing();
        tt.stop_and_wait().await;
        total
    };
    assert!(
        total > 0,
        "the workload reached no suspend points, so this test would cover nothing"
    );
    println!("workload reaches {total} suspend points");

    // Passes 1..=total: fire at each index in turn, on a fresh backend and a fresh persistence
    // directory each time so iterations cannot contaminate each other.
    let mut caught: std::collections::BTreeMap<&'static str, usize> = Default::default();
    for n in 1..=total {
        let (tt, _dir) = create_tt_with_workers(&format!("gc_sp_{n}"), 1);
        tt.backend().arm_gc_at_suspend_point(n, &tt);

        let value = workload(&tt, 0, FIRST).await;
        let fired = tt.backend().gc_stress_fired_for_testing();
        let site = fired.unwrap_or("<never fired>");
        assert_eq!(
            value,
            expected(0, FIRST),
            "suspend point {n} ({site}): forced GC produced a wrong value"
        );
        assert!(
            fired.is_some(),
            "suspend point {n}: the trigger never fired (only {} suspend points reached this run, \
             vs {total} in the counting pass)",
            tt.backend().suspend_points_seen_for_testing()
        );
        *caught.entry(site).or_default() += 1;

        // The graph must still be *usable* after the forced GC, not merely have returned the right
        // value once. This is what catches corruption the first read happened to miss: a new
        // nonce mints new root/interior tasks that have to connect into the collected-over graph.
        tt.backend().arm_gc_at_suspend_point(0, &tt);
        assert_eq!(
            workload(&tt, 1, SECOND).await,
            expected(1, SECOND),
            "suspend point {n} ({site}): graph unusable after the forced GC"
        );

        // And an ordinary pass must still run cleanly over the result.
        tt.backend().gc_for_testing(&tt);
        assert!(
            tt.backend().resident_persistent_task_count_for_testing() > 0,
            "suspend point {n} ({site}): everything was collected"
        );

        tt.stop_and_wait().await;
    }

    println!("covered suspend points by operation: {caught:?}");
}
