#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    GcRoot, ResolvedVc, State, TaskId, TurboTasks, Vc, prevent_gc,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, EvictionMode, GitVersionInfo, TurboTasksBackend};

/// Creates a fresh per-call persistence directory rooted under `CARGO_TARGET_TMPDIR/.cache/`.
fn create_test_persistence_dir(name: &str) -> tempfile::TempDir {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    tempfile::Builder::new()
        .prefix(&format!("{name}-"))
        .tempdir_in(&parent)
        .unwrap()
}

/// Opens a backend rooted at `path`. Reusing the same `path` (after the previous backend has been
/// stopped) reopens the persisted database — used to verify `parent_count` survives a restart.
fn open_tt_at(path: &std::path::Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(turbo_tasks_backend::StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            // Force GC on so the stop-time snapshot runs a GC pass and persists the roots map
            // (deterministic, no dependence on the process-global TURBO_ENGINE_GC).
            gc: Some(true),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            path,
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
    ))
}

fn create_tt(name: &str) -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let dir = create_test_persistence_dir(name);
    let tt = open_tt_at(dir.path());
    (tt, dir)
}

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

/// A distinct leaf keyed by `n`, used as the child of a persisted root in the cross-session tests
/// so its collection can be observed independently of the shared `leaf`.
#[turbo_tasks::function]
fn orphan_leaf(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

/// A `(operation, root)` op that reads `orphan_leaf(n)` — a small "root -> subtree" used to test
/// cross-session orphan collection. Read at the top level of a `run` it has no persistent parent
/// (`parent_count == 0`), so it is a durable root; its child `orphan_leaf(n)` gets `parent_count
/// 1`.
#[turbo_tasks::function(operation, root)]
async fn root_with_child(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*orphan_leaf(n).await? + 1))
}

// --- Diamond fixture for the cross-session disk-only forward-dep scrub test ---
//
// A "diamond": a reader `A` (`diamond_reader`) holds a **forward cell-dependency** on a target `B`
// (`diamond_target`) that is *not* its child — `B` is called by the root and its resolved `Vc` is
// passed into `A`, so reading it records a dep edge without a child edge. Both `A` and `B` are
// children of the diamond root. This is the shape that, cross-session under GC, can require
// scrubbing a **disk-only** forward-dep target: when the orphaned root is collected, `A` and `B`
// cascade together, and `A`'s `CleanupOldEdges` may open `B` to remove the stale reverse edge while
// `B` has not yet been restored from disk this session.
//
// The target must be **mutable** to record dependents at all (an immutable constant records none),
// so it reads a long-lived `State` whose value never changes.

#[turbo_tasks::value(transparent)]
struct Constant(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_constant() -> Vc<Constant> {
    Constant(State::new(0)).cell()
}

/// The forward-dependency *target* `B`. Reading `constant`'s `State` makes it mutable so a reader
/// records a real `cell_dependents` reverse edge on it.
#[turbo_tasks::function]
async fn diamond_target(constant: ResolvedVc<Constant>, index: u32) -> Result<Vc<u32>> {
    let base = *constant.await?.get();
    Ok(Vc::cell(base.wrapping_add(index).wrapping_mul(7)))
}

/// The diamond *reader* `A`: reads the cell of a `diamond_target` (`B`) passed in as an
/// already-resolved `Vc`, so `A` forward-deps on `B` without parenting it.
#[turbo_tasks::function]
async fn diamond_reader(target: ResolvedVc<u32>) -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *target.await?))
}

const DIAMOND_FANOUT: u32 = 64;

/// The diamond root: for each index, calls `diamond_target(index)` (`B`, the root's child) and
/// `diamond_reader(B)` (`A`, the root's child that forward-deps on `B`). `FANOUT` distinct A/B
/// pairs give many chances for the racing interleaving where an `A` scrubs a not-yet-restored `B`.
#[turbo_tasks::function(operation, root)]
async fn diamond_root(constant: ResolvedVc<Constant>) -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..DIAMOND_FANOUT {
        let target = diamond_target(*constant, index).to_resolved().await?;
        sum = sum.wrapping_add(*target.await?);
        sum = sum.wrapping_add(*diamond_reader(*target).await?);
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function]
async fn branch_a() -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(10).await?))
}

#[turbo_tasks::function]
async fn branch_b() -> Result<Vc<u32>> {
    Ok(Vc::cell(2 + *leaf(20).await?))
}

/// A task that pins itself against GC while executing (as code handing a value across an untracked
/// boundary — e.g. a `spawn_detached` future sending a `Vc` over a channel — would). Once pinned it
/// must survive collection even after it is disconnected.
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

/// A plain leaf read at the top level of a `run_once`. The current task is `None` there, so the
/// leaf's task is created with no persistent parent — but the transient `Once` task that reads it
/// connects it as a child, anchoring it via `transient_ref_count`. That transient anchor (not a
/// persisted "root" flag) is what keeps such a top-level-read task alive.
#[turbo_tasks::function]
async fn gc_root_leaf() -> Result<Vc<u32>> {
    Ok(Vc::cell(77))
}

/// `parent_count` must track the number of persistent parents, incremented when a parent connects a
/// child and decremented when it disconnects it.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parent_count_tracks_connect_and_disconnect() {
    let (tt, _persistence_dir) = create_tt("parent_count_tracks_connect_and_disconnect");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        // Build the connected graph: select -> branch_a -> leaf(10).
        let output = select(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 11);

        // Resolve the branch task ids (calling the cached functions returns the same tasks).
        let branch_a_id = task_id_of(branch_a().resolve().await?);
        let leaf10_id = task_id_of(leaf(10).resolve().await?);
        let branch_b_id = task_id_of(branch_b().resolve().await?);

        // While connected, branch_a and leaf(10) each have exactly one persistent parent.
        assert_eq!(
            tt2.backend().parent_count_for_testing(branch_a_id),
            1,
            "branch_a has one parent (select) while connected"
        );
        assert_eq!(
            tt2.backend().parent_count_for_testing(leaf10_id),
            1,
            "leaf(10) has one parent (branch_a) while connected"
        );

        // Flip: select re-executes reading branch_b, disconnecting branch_a + leaf(10).
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        // branch_a is now disconnected from select: its parent_count drops to 0.
        assert_eq!(
            tt2.backend().parent_count_for_testing(branch_a_id),
            0,
            "branch_a lost its only parent (select) after the flip"
        );
        // leaf(10) is still listed as a child by the (now-garbage) branch_a — nothing re-executed
        // branch_a to drop that edge — so its parent_count stays 1. It only drops to 0 once
        // branch_a is torn down (the eager-teardown cascade, wired in a later stage). The
        // count accurately reflects the live `children` edges at all times.
        assert_eq!(
            tt2.backend().parent_count_for_testing(leaf10_id),
            1,
            "leaf(10)'s parent branch_a still lists it (branch_a is garbage but not yet torn down)"
        );
        // branch_b + leaf(20) are now connected.
        assert_eq!(
            tt2.backend().parent_count_for_testing(branch_b_id),
            1,
            "branch_b gained a parent (select) after the flip"
        );

        // Flip back: branch_a reconnects (recomputed), branch_b disconnects.
        selector.set(false);
        assert_eq!(*output.read_strongly_consistent().await?, 11);
        assert_eq!(
            tt2.backend().parent_count_for_testing(branch_b_id),
            0,
            "branch_b lost its parent after flipping back"
        );

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// `parent_count` is a persisted meta field: it must survive a snapshot + DB reopen. This exercises
/// the durability path — the count is written into the task's meta blob and restored on the next
/// session (and any in-flight `AdjustParentCount` job replays via the durable operation queue).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parent_count_survives_reopen() {
    let dir = create_test_persistence_dir("parent_count_survives_reopen");

    // Session 1: build select -> branch_a -> leaf(10), then stop (persists on shutdown).
    let (branch_a_id, leaf10_id) = {
        let tt = open_tt_at(dir.path());
        let tt2 = tt.clone();
        let ids = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();

            let selector_op = create_selector(false);
            let selector_vc = selector_op.resolve().strongly_consistent().await?;

            let output = select(selector_vc);
            assert_eq!(*output.read_strongly_consistent().await?, 11);

            let branch_a_id = task_id_of(branch_a().resolve().await?);
            let leaf10_id = task_id_of(leaf(10).resolve().await?);
            assert_eq!(tt2.backend().parent_count_for_testing(branch_a_id), 1);
            assert_eq!(tt2.backend().parent_count_for_testing(leaf10_id), 1);
            anyhow::Ok((branch_a_id, leaf10_id))
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
        ids
    };

    // Session 2: reopen the same DB, re-read the graph (restoring the persisted tasks), and assert
    // their parent_count was restored from disk (not reset to 0). Task ids are stable across the
    // reopen because they are persisted.
    {
        let tt = open_tt_at(dir.path());
        let tt2 = tt.clone();
        let result = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();

            // Re-read the same graph so the cached tasks are restored from disk.
            let selector_op = create_selector(false);
            let selector_vc = selector_op.resolve().strongly_consistent().await?;
            let output = select(selector_vc);
            assert_eq!(*output.read_strongly_consistent().await?, 11);

            // Force the branch tasks resident (reading them restores their meta, incl.
            // parent_count, from disk). These are cached, so they are not re-executed.
            assert_eq!(*branch_a().await?, 11);
            assert_eq!(*leaf(10).await?, 10);

            assert_eq!(
                tt2.backend().parent_count_for_testing(branch_a_id),
                1,
                "branch_a's parent_count must be restored from disk after reopen"
            );
            assert_eq!(
                tt2.backend().parent_count_for_testing(leaf10_id),
                1,
                "leaf(10)'s parent_count must be restored from disk after reopen"
            );
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}

/// A decrement (disconnect) must survive a snapshot + eviction and stay correct when the affected
/// tasks are restored from disk — exercising the `-1` `AdjustParentCount` path through the durable
/// queue within a single session (so task identity is stable). After the flip, branch_b has 1
/// persistent parent and branch_a has 0; those counts must be intact after a snapshot/evict cycle
/// pushes them to disk and a subsequent read restores them.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parent_count_decrement_survives_snapshot_evict() {
    let (tt, _persistence_dir) = create_tt("parent_count_decrement_survives_snapshot_evict");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 11);

        // Flip so select drops branch_a (-1) and connects branch_b (+1).
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        let branch_a_id = task_id_of(branch_a().resolve().await?);
        let branch_b_id = task_id_of(branch_b().resolve().await?);
        assert_eq!(tt2.backend().parent_count_for_testing(branch_a_id), 0);
        assert_eq!(tt2.backend().parent_count_for_testing(branch_b_id), 1);

        // Snapshot + evict: pushes quiescent tasks (with their parent_count) to disk.
        tt2.backend().snapshot_and_evict_for_testing(&tt2);

        // Re-read the live output, restoring branch_b from disk; its parent_count must still be 1
        // (the persisted, decrement-consistent value — not doubled, not lost).
        assert_eq!(*output.read_strongly_consistent().await?, 22);
        assert_eq!(*branch_b().await?, 22);
        assert_eq!(
            tt2.backend().parent_count_for_testing(branch_b_id),
            1,
            "branch_b's parent_count must round-trip through snapshot/evict as 1"
        );

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// A GC pass collects a disconnected subtree via the parent_count cascade: disconnecting branch_a
/// drops its count to 0 (branch_a is collected), which decrements its child leaf(10) to 0 (leaf(10)
/// is then collected too). The live branch (branch_b + leaf(20)) is untouched and the graph still
/// computes; flipping back recomputes branch_a fresh, proving no dangling references.
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
        "nothing left to collect"
    );

    // The live graph still computes, and flipping back recomputes branch_a fresh (it was collected)
    // — proving collection left no dangling references.
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
/// from the live graph — covering values that escape the tracked task graph (e.g. `spawn_detached`
/// sending a `Vc` across a channel). Unlike `branch_a`, `pinned_branch` is not collected once
/// disconnected, because the pin makes it a GC root.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_does_not_collect_pinned_task() {
    let (tt, _persistence_dir) = create_tt("gc_does_not_collect_pinned_task");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        // select_pinned reads pinned_branch, which pins itself during execution.
        let output = select_pinned(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 99);

        // Flip: select_pinned re-executes, reads branch_b, and disconnects pinned_branch.
        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // GC (after the run releases activeness) must NOT collect pinned_branch even though it is now
    // disconnected (parent_count 0), because it pinned itself. Its child leaf from branch_b is
    // live.
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected, 0,
        "a pinned task must not be collected even when disconnected"
    );

    // A snapshot + evict must not lose the (transient) pin. A pinned task is no longer forced fully
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

/// A [`GcRoot`] guard pins a task for its lifetime and unpins it on drop. This is the anchor a
/// permanent root uses (e.g. the `ProjectContainer` operation held by a NAPI `ProjectInstance`):
/// while the guard lives the task is uncollectible even at `parent_count == 0`; dropping the guard
/// releases the pin so it becomes collectible. The guard owns exactly one pin and is not `Clone`,
/// so it can't double-unpin (which would underflow `transient_ref_count`).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_root_guard_pins_until_dropped() {
    let (tt, _persistence_dir) = create_tt("gc_root_guard_pins_until_dropped");
    let tt2 = tt.clone();

    // A parentless leaf read inside a `run`, then guarded by a `GcRoot` created *outside* the run
    // (as `project_new` does for the container — `run` returns the task id; the guard is built
    // after). `run` (unlike `run_once`) creates no lingering transient root anchoring it, so
    // the guard is its only anchor.
    let leaf_id = tt
        .run(async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let leaf_vc = leaf(55);
            let _ = *leaf_vc.await?;
            Ok(task_id_of(leaf_vc.resolve().await?))
        })
        .await
        .unwrap();
    let guard = GcRoot::pin(tt2.clone(), leaf_id);

    assert_eq!(guard.task_id(), leaf_id);
    assert_eq!(
        tt.backend().transient_ref_count_for_testing(leaf_id),
        1,
        "the GcRoot guard pins the task (transient_ref_count 1)"
    );
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        0,
        "a task pinned by a live GcRoot must not be collected"
    );

    // Drop the guard: it unpins, so the now-unanchored parentless leaf becomes collectible.
    drop(guard);
    assert_eq!(
        tt.backend().transient_ref_count_for_testing(leaf_id),
        0,
        "dropping the GcRoot released the pin"
    );
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        1,
        "the task is collectible once its GcRoot is dropped"
    );

    tt.stop_and_wait().await;
}

/// A parentless task read at the top level of a `run_once` is no longer force-kept as a persisted
/// topology "root" (we removed that blanket flagging). It is instead kept alive only by a real
/// anchor: here, the never-disposed transient `Once` task of the `run_once` that read it keeps it
/// reachable/active, so it is not collected while that anchor exists. (This is the same "a
/// `run_once` root keeps everything it touched active until — and here, because it is never
/// disposed, beyond — it returns" behavior that `gc_re_rooting_stays_flat` accounts for by
/// measuring the *persistent* resident set. The leak fix for disposable ops is covered by
/// `gc_collects_disconnected_subtree` and `dispose_root_task_releases_anchored_subgraph`.)
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parentless_top_level_task_kept_by_transient_root_not_a_topology_flag() {
    let (tt, _persistence_dir) =
        create_tt("parentless_top_level_task_kept_by_transient_root_not_a_topology_flag");
    let tt2 = tt.clone();
    let tt3 = tt.clone();

    let root_id = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        assert_eq!(*gc_root_leaf().await?, 77);

        let root_id = task_id_of(gc_root_leaf().resolve().await?);
        // No persistent parent connected it, so parent_count is 0 — it is not a persistent-graph
        // child of anything.
        assert_eq!(
            tt3.backend().parent_count_for_testing(root_id),
            0,
            "a parentless top-level task has no persistent parent edge"
        );

        anyhow::Ok(root_id)
    })
    .await
    .unwrap();

    // Its `run_once`'s `Once` task is never disposed and keeps it anchored, so GC does not collect
    // it — but note this is an in-session transient anchor, NOT the removed persisted topology
    // flag.
    assert_eq!(
        tt2.backend().parent_count_for_testing(root_id),
        0,
        "still parent_count 0 after the run"
    );
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected, 0,
        "kept alive by its (undisposed) transient Once root, not by a topology flag"
    );

    tt.stop_and_wait().await;
}

/// Disposing a root task (as `RootTask::Drop` / `root_task_dispose` does when JS stops listening to
/// a subscription) must release the anchor its child edges placed on the persistent tasks it read,
/// so the subscription's subgraph becomes collectible. A transient root task bumps each persistent
/// child's `transient_ref_count`; `dispose_root_task` tears the (clean) root's edges down via
/// `CleanupOldEdges`, which sheds that count (and rebalances the aggregation graph). Also checks
/// the contract `RootTask::Drop` relies on: disposal is idempotent and safe after the backend
/// stopped.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dispose_root_task_releases_anchored_subgraph() {
    let (tt, _persistence_dir) = create_tt("dispose_root_task_releases_anchored_subgraph");

    // Spawn a real root task (as `subscribe` does) whose body reads a persistent leaf, connecting
    // it as a child of the transient root — bumping the leaf's transient_ref_count. The root sends
    // the leaf's id out via a oneshot so we can inspect it WITHOUT a separate `run_once` probe (a
    // probe would be its own transient `Once` task that also connects the leaf — Once tasks are
    // never disposed, so it would pollute the leaf's transient_ref_count and never drop to 0).
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
    let root_id = tt.spawn_root_task(move || {
        let tx = tx.lock().unwrap().take();
        Box::pin(async move {
            // The root body runs as a top-level task; unmark so the eventually-consistent leaf read
            // is allowed (as `subscribe`'s HMR handler does).
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let leaf_vc = leaf(88);
            let value = *leaf_vc.await?;
            if let Some(tx) = tx {
                let _ = tx.send(task_id_of(leaf_vc.resolve().await?));
            }
            anyhow::Ok(Vc::<u32>::cell(value))
        })
    });

    // The root connects the leaf as its only anchor: no persistent parent (parent_count 0), one
    // transient child edge (transient_ref_count 1).
    let leaf_id = rx.await.unwrap();
    for _ in 0..100 {
        if tt.backend().transient_ref_count_for_testing(leaf_id) > 0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    assert_eq!(
        tt.backend().parent_count_for_testing(leaf_id),
        0,
        "leaf read only by the root task has no persistent parent"
    );
    assert_eq!(
        tt.backend().transient_ref_count_for_testing(leaf_id),
        1,
        "the transient root task anchors the leaf via exactly one child edge"
    );

    // While the root task is live, the leaf is anchored and must not be collected.
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        0,
        "leaf anchored by the live root task must not be collected"
    );

    // Dispose the root task (as `RootTask::Drop` now does when JS skipped `root_task_dispose`). Its
    // `CleanupOldEdges` sheds the leaf's transient_ref_count.
    tt.dispose_root_task(root_id);
    // Idempotent: disposing again (the shape of explicit JS dispose + a later `Drop`) must not
    // panic and must not underflow the child's count (the edges were already removed).
    tt.dispose_root_task(root_id);

    assert_eq!(
        tt.backend().transient_ref_count_for_testing(leaf_id),
        0,
        "disposing the root task released its transient_ref_count anchor on the leaf"
    );

    // Collect in a fresh run (a `run_once` keeps touched tasks active until it returns, so GC runs
    // after it). The leaf is now unanchored, quiescent, and collectible.
    turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        anyhow::Ok(())
    })
    .await
    .unwrap();
    assert_eq!(
        tt.backend().gc_for_testing(&tt),
        1,
        "the leaf becomes collectible once the root task that anchored it is disposed"
    );

    // Disposal must be safe after the backend has stopped, as a `RootTask` finalized during Node
    // worker teardown would be (the whole task map is dropped by `stop`).
    tt.stop_and_wait().await;
    tt.dispose_root_task(root_id);
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

/// Reads a *stable* child (`leaf(30)`) on every execution, plus a `State` that drives
/// re-execution. Flipping the state re-executes the parent while it keeps the same child edge.
#[turbo_tasks::function(operation, root)]
async fn stable_child_parent(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    // Read the selector so we re-execute when it flips...
    let bump = if *selector.await?.get() { 100 } else { 0 };
    // ...but always connect the SAME child regardless.
    let child = *leaf(30).await?;
    Ok(Vc::cell(bump + child))
}

/// One leaf per index — distinct tasks, so a wide parent accumulates that many distinct children.
#[turbo_tasks::function]
fn wide_leaf(index: u32) -> Vc<u32> {
    Vc::cell(index)
}

/// Reads `WIDE_FANOUT` distinct children — deliberately above `connect_children`'s 10_000
/// parallelization threshold, so the child-side `parent_count` bump runs through the chunked,
/// parallel `process_new_children` path (each chunk on its own worker context) rather than the
/// serial one.
const WIDE_FANOUT: u32 = 12_000;

#[turbo_tasks::function(operation, root)]
async fn wide_parent() -> Result<Vc<u32>> {
    let mut sum = 0u32;
    for index in 0..WIDE_FANOUT {
        sum = sum.wrapping_add(*wide_leaf(index).await?);
    }
    Ok(Vc::cell(sum))
}

/// The parallelized `connect_children` path (≥10_000 children, chunked across worker contexts)
/// must bump each persistent child's `parent_count` exactly once — no child dropped by a chunk
/// boundary, none double-counted. Connect >10_000 distinct children in one parent and assert a
/// spread of them (first / middle / last, covering multiple chunks) each end at exactly 1.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn parent_count_wide_fanout_parallel_path() {
    let (tt, _persistence_dir) = create_tt("parent_count_wide_fanout_parallel_path");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let output = wide_parent();
        output.read_strongly_consistent().await?;

        // Sample across the full range so at least one child from each chunk is checked.
        for index in [0, 1, WIDE_FANOUT / 2, WIDE_FANOUT - 2, WIDE_FANOUT - 1] {
            let child_id = task_id_of(wide_leaf(index).resolve().await?);
            assert_eq!(
                tt2.backend().parent_count_for_testing(child_id),
                1,
                "wide_leaf({index}) must have parent_count == 1 after the parallel connect \
                 (chunked +1 must bump every child exactly once)"
            );
        }

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Re-validation must not double-count. When a parent re-executes and connects a child it was
/// *already* connected to (the child is still in its persistent `children` set), the child must NOT
/// gain a second `parent_count`: `connect_children` only bumps the *genuinely-new* children (those
/// not already present in `children`), so the count stays at exactly 1 across arbitrarily many
/// re-executions that keep the edge.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parent_count_not_double_counted_on_revalidation() {
    let (tt, _persistence_dir) = create_tt("parent_count_not_double_counted_on_revalidation");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = stable_child_parent(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 30);

        let leaf30_id = task_id_of(leaf(30).resolve().await?);
        assert_eq!(
            tt2.backend().parent_count_for_testing(leaf30_id),
            1,
            "leaf(30) has exactly one parent after the first execution"
        );

        // Re-execute the parent several times; it keeps the same child edge each time.
        for i in 0..5 {
            selector.set(i % 2 == 0);
            output.read_strongly_consistent().await?;
            assert_eq!(
                tt2.backend().parent_count_for_testing(leaf30_id),
                1,
                "leaf(30)'s parent_count must stay 1 across re-validation (iteration {i}), not \
                 grow — the child edge already existed so no new count is taken"
            );
        }

        anyhow::Ok(())
    })
    .await;
    tt.stop_and_wait().await;
    result.unwrap();
}

/// Cross-session orphan collection (Piece B). A root persisted in session 1 that is *not*
/// re-requested in session 2 ages out of the persisted roots map and its subtree is collected — the
/// disk-only garbage the resident-scan GC can't reach. With the TTL forced to 0, the first GC pass
/// in session 2 (which never re-anchors the root) collects it.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_collects_cross_session_orphan_root() {
    let dir = create_test_persistence_dir("gc_collects_cross_session_orphan_root");

    // Session 1: create the root + child, persist on shutdown.
    let (root_id, child_id) = {
        let tt = open_tt_at(dir.path());
        let tt2 = tt.clone();
        let ids = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let output = root_with_child(42);
            assert_eq!(*output.read_strongly_consistent().await?, 43);
            // `root_with_child` is `(operation, root)` -> `OperationVc`; its task is the root op.
            let root_id = output.task_id();
            let child_id = task_id_of(orphan_leaf(42).resolve().await?);
            // The root has no persistent parent; the child hangs off it.
            assert_eq!(tt2.backend().parent_count_for_testing(root_id), 0);
            assert_eq!(tt2.backend().parent_count_for_testing(child_id), 1);
            anyhow::Ok((root_id, child_id))
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
        ids
    };

    // Session 2: reopen, but NEVER request `root_with_child(42)` — it's a cross-session orphan.
    // With TTL 0 the first GC pass ages it out of the roots map and collects it + its subtree.
    {
        let tt = open_tt_at(dir.path());
        tt.backend().set_gc_root_ttl_for_testing(0);
        let tt2 = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let collected = tt2.backend().gc_for_testing(&tt2);
            assert!(
                collected >= 2,
                "the orphaned root and its child should be collected (got {collected})"
            );
            let _ = root_id;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }

    // Session 3: reopen and confirm re-requesting recomputes cleanly (no dangling refs from the
    // cross-session collection).
    {
        let tt = open_tt_at(dir.path());
        let result = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            assert_eq!(*root_with_child(42).read_strongly_consistent().await?, 43);
            let _ = (root_id, child_id);
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}

/// A root re-requested in the next session must NOT be collected: re-anchoring refreshes its
/// last-anchored timestamp, resetting the TTL clock. Same setup as the orphan test, but session 2
/// re-requests the root before GC.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_keeps_reanchored_cross_session_root() {
    let dir = create_test_persistence_dir("gc_keeps_reanchored_cross_session_root");

    {
        let tt = open_tt_at(dir.path());
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            assert_eq!(*root_with_child(7).read_strongly_consistent().await?, 8);
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }

    {
        let tt = open_tt_at(dir.path());
        tt.backend().set_gc_root_ttl_for_testing(0);
        let tt2 = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            // Re-request the root: this re-anchors it (its transient Once reader gives it a
            // transient_ref_count), so the GC pass must refresh its timestamp, not collect it.
            assert_eq!(*root_with_child(7).read_strongly_consistent().await?, 8);
            let collected = tt2.backend().gc_for_testing(&tt2);
            assert_eq!(
                collected, 0,
                "a re-requested (re-anchored) root must not be collected even at TTL 0"
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }
}

/// Regression for the cross-session cascade panic found by the gc-04 dogfood: collecting an
/// orphaned root whose subtree contains a **forward cell-dependency** to a target that is
/// **disk-only** (not restored this session) must scrub that stale reverse edge by restoring the
/// live target — not panic on a "target not resident, would resurrect a collected task" guard.
///
/// Setup (see the diamond fixture): each `diamond_reader` `A` holds a forward cell-dep on a
/// `diamond_target` `B` that is *not* its child; both are children of `diamond_root`. In session 1
/// we build and persist the whole diamond. In session 2 we reopen (nothing re-requests the root, so
/// with TTL 0 it ages out) and run one GC pass: the root is collected and its `A`/`B` children
/// cascade concurrently. When an `A`'s `CleanupOldEdges` opens its target `B` to remove the stale
/// `cell_dependents` edge, `B` may not yet have been restored from disk — the disk-only case the
/// old `gc_target_resident` debug_assert wrongly rejected. The whole pass completing without a
/// panic is the assertion; session 3 confirms a clean recompute (no dangling reverse edge
/// survived).
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn gc_collect_scrubs_disk_only_forward_dep_target() {
    let dir = create_test_persistence_dir("gc_collect_scrubs_disk_only_forward_dep_target");

    // Session 1: build the diamond and persist it.
    {
        let tt = open_tt_at(dir.path());
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;
            // Read the root so the whole diamond is built and persisted.
            diamond_root(constant_vc).read_strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }

    // Session 2: reopen, TTL 0, run one GC pass. The diamond root is never re-requested, so it ages
    // out; collecting it cascades to every A/B pair. B targets are disk-only until the cascade
    // restores them — an A that scrubs its target before that must restore it, not panic.
    {
        let tt = open_tt_at(dir.path());
        tt.backend().set_gc_root_ttl_for_testing(0);
        let tt2 = tt.clone();
        turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            // No panic in this pass is the assertion (the old guard fired inside CleanupOldEdges).
            let collected = tt2.backend().gc_for_testing(&tt2);
            assert!(
                collected >= 1,
                "the orphaned diamond root subtree should be collected (got {collected})"
            );
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    }

    // Session 3: a clean recompute must still work — no dangling reverse edge left on any target.
    {
        let tt = open_tt_at(dir.path());
        let result = turbo_tasks::run_once(tt.clone(), async move {
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let constant_op = create_constant();
            let constant_vc = constant_op.resolve().strongly_consistent().await?;
            diamond_root(constant_vc).read_strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await;
        tt.stop_and_wait().await;
        result.unwrap();
    }
}
