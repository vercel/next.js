#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Cross-session collection of GC roots.

mod gc_fixture;
mod util;

use std::{
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use turbo_tasks::{
    GcRoot, TurboTasks, Vc, unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{create_constant, diamond_root_op},
    util::{create_persistence_dir, reopen_tt_with_gc, reopen_tt_with_gc_ttl},
};

/// Counts executions of [`orphan_leaf`], keyed by its argument. A collected task re-executes when
/// next requested; a merely evicted one restores from disk without executing.
static LEAF_EXECUTIONS: [AtomicU32; 3] = [AtomicU32::new(0), AtomicU32::new(0), AtomicU32::new(0)];

fn leaf_executions(n: u32) -> u32 {
    LEAF_EXECUTIONS[n as usize].load(Ordering::Relaxed)
}

/// A leaf keyed by `n`, so each root gets a distinct child.
#[turbo_tasks::function]
fn orphan_leaf(n: u32) -> Vc<u32> {
    LEAF_EXECUTIONS[n as usize].fetch_add(1, Ordering::Relaxed);
    Vc::cell(n)
}

/// A two-task "root -> subtree": read at the top level of a session this op has no persistent
/// parent, so it is a durable GC root and its leaf gets `parent_count 1`.
#[turbo_tasks::function(operation, root)]
async fn root_with_child(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*orphan_leaf(n).await? + 1))
}

/// Runs GC until at least `want` tasks have been collected, or gives up after 20 passes.
///
/// A loop rather than a fixed pass count because age-out needs `elapsed > TTL` strictly, so a pass
/// sharing a millisecond with the demotion collects nothing.
async fn gc_until_collected(tt: &Arc<TurboTasks<TurboTasksBackend>>, want: usize) -> usize {
    let mut collected = 0usize;
    for _ in 0..20 {
        collected += tt.backend().gc_for_testing(tt);
        if collected >= want {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    collected
}

/// Width of the diamond: the fanout gives many chances for the interleaving where an `A` scrubs a
/// not-yet-restored `B`.
const DIAMOND_FANOUT: u32 = 64;

/// A root is kept alive by being used and reclaimed by not being used, across process restarts.
///
/// Both roots have `parent_count == 0` forever, so only the cross-session roots map distinguishes
/// the one that keeps being requested from the one that is abandoned. The TTL is forced to 0 so the
/// age-out lands inside the test rather than days later.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reused_root_survives_sessions_that_abandon_its_sibling() {
    let dir = create_persistence_dir("reused_root_survives_sessions_that_abandon_its_sibling");

    // Session 1: build both subtrees and pin each root, the way an embedder holds a live handle to
    // a route. The pin makes it a durable root, recorded in the persisted roots map on shutdown.
    let kept_root = {
        let tt = reopen_tt_with_gc(&dir);
        let ids = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let kept = root_with_child(1);
            let dropped = root_with_child(2);
            assert_eq!(*kept.read_strongly_consistent().await?, 2);
            assert_eq!(*dropped.read_strongly_consistent().await?, 3);
            anyhow::Ok((kept.task_id(), dropped.task_id()))
        })
        .await
        .unwrap();

        let kept_pin = GcRoot::pin(tt.clone(), ids.0);
        let dropped_pin = GcRoot::pin(tt.clone(), ids.1);
        tt.backend().snapshot_and_evict_for_testing(&tt);
        drop(kept_pin);
        drop(dropped_pin);

        tt.stop_and_wait().await;
        ids.0
    };

    // Sessions 2 and 3: only root 1 is ever requested again. Session 2's first pass demotes root 2
    // and a later pass ages it out; session 3 proves the collection stuck.
    let mut total_collected = 0usize;
    for session in 2..=3 {
        let tt = reopen_tt_with_gc_ttl(&dir, Duration::ZERO);
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            // Re-request root 1 only, so it has a resident entry to pin.
            assert_eq!(
                *root_with_child(1).read_strongly_consistent().await?,
                2,
                "the reused root must still compute in session {session}"
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();

        let kept_pin = GcRoot::pin(tt.clone(), kept_root);
        total_collected += gc_until_collected(&tt, 2).await;
        drop(kept_pin);

        tt.stop_and_wait().await;
    }

    // Exactly the abandoned root and its leaf: root 1 is re-pinned every session and its leaf has
    // a parent, so nothing else here is collectible.
    assert_eq!(total_collected, 2);

    // Session 4: the survivor must still be cached, the collected one must rebuild.
    {
        let tt = reopen_tt_with_gc(&dir);
        let kept_before = leaf_executions(1);
        let dropped_before = leaf_executions(2);
        let result = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();

            // A dangling edge left by the collection, or a resurrected half-deleted task, would
            // surface as a wrong value or a panic here.
            assert_eq!(*root_with_child(1).read_strongly_consistent().await?, 2);
            assert_eq!(*root_with_child(2).read_strongly_consistent().await?, 3);

            // The survivor's leaf comes from the persisted cache; the collected one re-executes.
            assert_eq!(leaf_executions(1), kept_before);
            assert_eq!(leaf_executions(2), dropped_before + 1);
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}

/// Collecting an orphaned root whose subtree holds a forward cell-dependency on a **disk-only**
/// target (never restored this session) must scrub that stale reverse edge by restoring the live
/// target.
///
/// Session 2 ages the root out and cascades its `A`/`B` children concurrently, so an `A`'s
/// `CleanupOldEdges` can open its target `B` before `B` has been restored from disk. Unlike
/// `gc_resurrection::gc_diamond_forward_dep_no_resurrection`, where every target is resident, only
/// a restart can reach the disk-only case.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_collect_scrubs_disk_only_forward_dep_target() {
    let dir = create_persistence_dir("gc_collect_scrubs_disk_only_forward_dep_target");

    // Session 1: build the diamond and persist it. Without the pin the root is never a tracked
    // root, so nothing is collected and the cascade under test never runs.
    {
        let tt = reopen_tt_with_gc(&dir);
        let root_id = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;
            let root_op = diamond_root_op(constant_vc, DIAMOND_FANOUT);
            root_op.read_strongly_consistent().await?;
            anyhow::Ok(root_op.task_id())
        })
        .await
        .unwrap();

        let root_pin = GcRoot::pin(tt.clone(), root_id);
        // A GC pass is what admits a live root to the persisted map; the snapshot alone leaves
        // nothing for session 2 to age out.
        tt.backend().gc_for_testing(&tt);
        tt.backend().snapshot_and_evict_for_testing(&tt);
        drop(root_pin);

        tt.stop_and_wait().await;
    }

    // Session 2: the root is never re-requested, so it ages out and cascades to every A/B pair.
    {
        let tt = reopen_tt_with_gc_ttl(&dir, Duration::ZERO);
        let tt2 = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            // No panic in these passes is the real assertion. The diamond is a root plus
            // DIAMOND_FANOUT A/B pairs; the cascade may also reach the constant op above it.
            let collected = gc_until_collected(&tt2, 2 * DIAMOND_FANOUT as usize + 1).await;
            assert!(
                collected > 2 * DIAMOND_FANOUT as usize,
                "the orphaned diamond subtree should be collected (got {collected})"
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }

    // Session 3: a clean recompute, proving no dangling reverse edge survived.
    {
        let tt = reopen_tt_with_gc(&dir);
        let result = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;
            diamond_root_op(constant_vc, DIAMOND_FANOUT)
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}
