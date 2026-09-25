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
use turbo_tasks::{GcRoot, ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::{
    gc_fixture::{Constant, Selector, create_constant, create_selector, diamond_root_op},
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
    {
        let tt = reopen_tt_with_gc(&dir);
        let ops = turbo_tasks::run_once(tt.clone(), async move {
            let kept = root_with_child(1);
            let dropped = root_with_child(2);
            assert_eq!(*kept.read_strongly_consistent().await?, 2);
            assert_eq!(*dropped.read_strongly_consistent().await?, 3);
            anyhow::Ok((kept, dropped))
        })
        .await
        .unwrap();

        let kept_pin = GcRoot::pin(tt.clone(), ops.0);
        let dropped_pin = GcRoot::pin(tt.clone(), ops.1);
        tt.backend().snapshot_and_evict_for_testing(&tt);
        drop(kept_pin);
        drop(dropped_pin);

        tt.stop_and_wait().await;
    }

    // Sessions 2 and 3: only root 1 is ever requested again. Session 2's first pass demotes root 2
    // and a later pass ages it out; session 3 proves the collection stuck.
    let mut total_collected = 0usize;
    for session in 2..=3 {
        let tt = reopen_tt_with_gc_ttl(&dir, Duration::ZERO);
        let kept_op = turbo_tasks::run_once(tt.clone(), async move {
            // Re-request root 1 only, so it has a resident entry to pin.
            let kept = root_with_child(1);
            assert_eq!(
                *kept.read_strongly_consistent().await?,
                2,
                "the reused root must still compute in session {session}"
            );
            anyhow::Ok(kept)
        })
        .await
        .unwrap();

        let kept_pin = GcRoot::pin(tt.clone(), kept_op);
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
        let root_op = turbo_tasks::run_once(tt.clone(), async move {
            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;
            let root_op = diamond_root_op(constant_vc, DIAMOND_FANOUT);
            root_op.read_strongly_consistent().await?;
            anyhow::Ok(root_op)
        })
        .await
        .unwrap();

        let root_pin = GcRoot::pin(tt.clone(), root_op);
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

// Regression test for a bug where a second cell reader owned by a different root task would panic
// when the root eventually ages out.
//
// This test merely asserts that such dependencies don't cause panics.
//
// `shared_target` is *called* by the owning side only, so that side is its sole parent.
// `borrowing_root` receives the target already resolved and only reads it through `shared_reader`:
// a forward cell-dependency, no child edge. So the target's `cell_dependents` holds reader 2 while
// its `parent_count` comes entirely from the owning side.
//
// Session 1 flips a selector to drop the owning side cleanly -- no invalidation, so the target
// keeps its edges -- and collects it. The shared target cascades with it, because
// `cell_dependents` do not keep a task alive (the documented `gc_collectible` heuristic). Reader 2
// survives under the pinned borrowing root holding a forward dependency on a task that is now
// gone, and that state is persisted.
//
// Session 2 ages the borrowing root out. Tearing down reader 2 scrubs its forward dependency on
// the target collected back in session 1: a `MustExist` open of an already-collected task. The
// session does not need to execute anything -- the tasks only have to exist on disk for GC to
// reach them.

#[turbo_tasks::function]
async fn shared_target(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    Ok(Vc::cell(constant.await?.get() + 41))
}

/// Reads the shared target via an already-resolved `Vc`: a forward cell-dependency, no child edge.
#[turbo_tasks::function]
async fn shared_reader(target: ResolvedVc<u32>, n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(n + *target.await?))
}

/// Calls the shared target -- becoming its only parent -- and reads it through reader 1.
#[turbo_tasks::function]
async fn owning_subtree(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let target = shared_target(*constant).to_resolved().await?;
    assert_eq!(*shared_reader(*target, 1).await?, 42);
    // Return the target's own `Vc`, so a caller that resolves this reaches `shared_target`.
    Ok(*target)
}

/// Selector-gated root over [`owning_subtree`]: flipping the selector to `true` drops the owning
/// subtree cleanly, without invalidating it, so it keeps its edges and becomes collectible.
#[turbo_tasks::function(operation, root)]
async fn select_owning(
    selector: ResolvedVc<Selector>,
    constant: ResolvedVc<Constant>,
) -> Result<Vc<u32>> {
    // Pass the subtree's `Vc` through unchanged rather than re-celling it, so resolving this op
    // names `shared_target` itself -- that is the task the borrowing side must depend on.
    if !selector.await?.get() {
        Ok(owning_subtree(*constant))
    } else {
        Ok(Vc::cell(0))
    }
}

/// Reaches reader 2 through an **already-resolved** target, so it never calls the target and never
/// becomes its parent. Reader 2 keeps its forward cell-dependency on the target after the owning
/// subtree -- the target's only parent -- is collected.
#[turbo_tasks::function(operation, root)]
async fn borrowing_root(target: ResolvedVc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(*shared_reader(*target, 2).await?))
}

/// A surviving task must not be left holding a forward cell-dependency on a collected task.
///
/// Two readers share a cell target, but only one side *owns* it (is its parent). The owning side is
/// collected while the borrowing root is still pinned, so the target is destroyed with reader 2
/// still depending on it -- and reader 2 is only torn down in the next session.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn shared_cell_target_collected_before_its_second_reader() {
    let dir = create_persistence_dir("shared_cell_target_collected_before_its_second_reader");

    // Session 1: build both sides over one shared target, drop the owning side, and collect it.
    // That leaves reader 2 holding a dependency on the collected target, and persists it.
    {
        let tt = reopen_tt_with_gc(&dir);
        let borrowing_op = turbo_tasks::run_once(tt.clone(), async move {
            let selector_op = create_selector(false);
            let selector_vc = selector_op.resolve().strongly_consistent().await?;
            let selector = selector_op.read_strongly_consistent().await?;

            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;

            // The owning side parents the target and hands it back.
            let owning = select_owning(selector_vc, constant_vc);
            let target = owning.resolve().strongly_consistent().await?;
            assert_eq!(*target.await?, 41);

            let borrowing = borrowing_root(target);
            assert_eq!(*borrowing.read_strongly_consistent().await?, 43);

            // Drop the owning subtree cleanly: no invalidation, so the target keeps its edges.
            selector.set(true);
            assert_eq!(*owning.read_strongly_consistent().await?, 0);
            anyhow::Ok(borrowing)
        })
        .await
        .unwrap();

        // Pin the borrowing root so only the owning side is collectible.
        let borrowing_pin = GcRoot::pin(tt.clone(), borrowing_op);
        let collected = gc_until_collected(&tt, 3).await;
        assert!(
            collected >= 3,
            "the owning subtree, reader 1 and the shared target should be collected (got              {collected})"
        );

        tt.backend().snapshot_and_evict_for_testing(&tt);
        drop(borrowing_pin);

        tt.stop_and_wait().await;
    }

    // Session 2: nothing is pinned, so the borrowing root ages out. Tearing down reader 2 scrubs
    // its forward dependency on the target collected in session 1 -- the dangling half-edge.
    // Surviving these passes without a panic is the assertion.
    {
        let tt = reopen_tt_with_gc_ttl(&dir, Duration::ZERO);
        let tt2 = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            gc_until_collected(&tt2, 2).await;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }
}
