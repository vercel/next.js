#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, State, TaskId, TurboTasks, Vc,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackendOptions, GitVersionInfo, TurboTasksBackend};

/// Creates a fresh per-call persistence directory rooted under `CARGO_TARGET_TMPDIR/.cache/`.
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
            evict_after_snapshot: true,
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
