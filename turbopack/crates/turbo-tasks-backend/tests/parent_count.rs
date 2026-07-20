#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TaskId, TurboTasks, Vc, prevent_gc,
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

/// A plain leaf used to test the "spawned with no parent → GC root" rule. When called at the top
/// level of a `run` (where the current task is `None`), its task is created with `parent == None`
/// and marked a GC root, so it must never be collected even once disconnected.
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

/// A task spawned with **no parent** — called at the top level of a `run`, where the current task
/// is `None` — is marked a GC root at creation and must never be collected, even with
/// `parent_count == 0`. This is what keeps externally-spawned root operations (project container,
/// endpoints, per-request source-map ops) alive: their handles live outside the tracked graph, so
/// nothing else anchors them.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_does_not_collect_parentless_root_task() {
    let (tt, _persistence_dir) = create_tt("gc_does_not_collect_parentless_root_task");
    let tt2 = tt.clone();
    let tt3 = tt.clone();

    let root_id = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();

        // Called directly in the `run` future: the current task is `None`, so gc_root_leaf's task
        // is created with `parent == None` and marked a GC root. It has NO persistent parent edge.
        assert_eq!(*gc_root_leaf().await?, 77);

        let root_id = task_id_of(gc_root_leaf().resolve().await?);
        // No parent connected it, so its parent_count is 0 from the start — yet it is a GC root.
        assert_eq!(
            tt3.backend().parent_count_for_testing(root_id),
            0,
            "a parentless root has no persistent parent edge"
        );

        anyhow::Ok(root_id)
    })
    .await
    .unwrap();

    // parent_count is 0 and it is disconnected, but the gc_root flag must keep it uncollectible.
    assert_eq!(
        tt2.backend().parent_count_for_testing(root_id),
        0,
        "still parent_count 0 after the run"
    );
    let collected = tt2.backend().gc_for_testing(&tt2);
    assert_eq!(
        collected, 0,
        "a parentless (gc_root) task must not be collected even with parent_count 0"
    );

    // Survives snapshot + eviction too (the gc_root flag is persisted meta).
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    assert_eq!(
        tt2.backend().gc_for_testing(&tt2),
        0,
        "gc_root task must survive eviction and not be collected"
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
