#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod gc_fixture;
mod util;

use std::sync::Arc;

use anyhow::Result;
use turbo_tasks::{
    ResolvedVc, TaskId, Vc, prevent_gc, unmark_top_level_task_may_leak_eventually_consistent_state,
};

use crate::{
    gc_fixture::{Selector, create_selector},
    util::create_tt,
};

/// The `TaskId` backing a resolved `Vc` (its `TaskOutput` node).
fn task_id_of<T>(vc: Vc<T>) -> TaskId {
    Vc::into_raw(vc)
        .try_get_task_id()
        .expect("a resolved Vc should be backed by a task")
}

#[turbo_tasks::function]
fn leaf(n: u32) -> Vc<u32> {
    Vc::cell(n)
}

/// Resolves `leaf(n)` and returns the raw `TaskId` backing it, as a `u32`. Runs inside a tracked
/// task so the eventually-consistent `.resolve()` read is ordered by the task graph.
#[turbo_tasks::function(operation, root)]
async fn leaf_task_id(n: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(*task_id_of(leaf(n).resolve().await?)))
}

#[turbo_tasks::function]
async fn branch_a() -> Result<Vc<u32>> {
    Ok(Vc::cell(1 + *leaf(10).await?))
}

#[turbo_tasks::function]
async fn branch_b() -> Result<Vc<u32>> {
    Ok(Vc::cell(2 + *leaf(20).await?))
}

/// Pins itself against GC while executing.
#[turbo_tasks::function]
async fn pinned_branch() -> Result<Vc<u32>> {
    prevent_gc();
    Ok(Vc::cell(99))
}

/// Reads one branch depending on the selector; flipping it disconnects the other branch's subtree.
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

/// [`select`] with `pinned_branch` in place of `branch_a`.
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

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_collects_disconnected_subtree() {
    let (tt, _persistence_dir) = create_tt("gc_collects_disconnected_subtree");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 11);

        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // branch_a and its cascaded child leaf(10).
    assert_eq!(tt2.backend().gc_for_testing(&tt2), 2);
    assert_eq!(tt2.backend().gc_for_testing(&tt2), 0);

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

/// A task pinned via `prevent_gc()` must survive collection after it is disconnected.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn gc_does_not_collect_pinned_task() {
    let (tt, _persistence_dir) = create_tt("gc_does_not_collect_pinned_task");
    let tt2 = tt.clone();

    let result = turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        let selector = selector_op.read_strongly_consistent().await?;

        let output = select_pinned(selector_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 99);

        selector.set(true);
        assert_eq!(*output.read_strongly_consistent().await?, 22);

        anyhow::Ok(())
    })
    .await;
    result.unwrap();

    // The run has released activeness, so pinned_branch is disconnected and otherwise collectible.
    assert_eq!(tt2.backend().gc_for_testing(&tt2), 0);

    // Eviction may drop a pinned task's Meta/Data, but the session-only `transient_ref_count` is
    // retained as residue, so the task stays uncollectible.
    tt2.backend().snapshot_and_evict_for_testing(&tt2);
    assert_eq!(tt2.backend().gc_for_testing(&tt2), 0);

    tt.stop_and_wait().await;
}

/// Disposing a root task (as `RootTask::Drop` does when JS stops listening to a subscription) must
/// release the anchor its child edges placed on the tasks it read. Disposal is also idempotent and
/// safe after the backend has stopped, which `RootTask::Drop` relies on.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dispose_root_task_releases_anchored_subgraph() {
    let (tt, _persistence_dir) = create_tt("dispose_root_task_releases_anchored_subgraph");

    // The root sends the leaf's id out via a oneshot rather than a `run_once` probe: a probe is its
    // own transient `Once` task that would also connect the leaf, and `Once` tasks are never
    // disposed, so the leaf's count would never drop to 0.
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
    let root_id = tt.spawn_root_task(move || {
        let tx = tx.lock().unwrap().take();
        Box::pin(async move {
            // The root body runs as a top-level task, as `subscribe`'s HMR handler does.
            unmark_top_level_task_may_leak_eventually_consistent_state();
            let leaf_vc = leaf(88);
            let value = *leaf_vc.await?;
            if let Some(tx) = tx {
                let _ = tx.send(task_id_of(leaf_vc.resolve().await?));
            }
            anyhow::Ok(Vc::<u32>::cell(value))
        })
    });

    let leaf_id = rx.await.unwrap();
    for _ in 0..100 {
        if tt.backend().transient_ref_count_for_testing(leaf_id) > 0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    assert_eq!(tt.backend().parent_count_for_testing(leaf_id), 0);
    assert_eq!(tt.backend().transient_ref_count_for_testing(leaf_id), 1);
    assert_eq!(tt.backend().gc_for_testing(&tt), 0);

    // Disposing twice must not panic or underflow the child's count: JS may dispose explicitly and
    // then drop.
    tt.dispose_root_task(root_id);
    tt.dispose_root_task(root_id);
    assert_eq!(tt.backend().transient_ref_count_for_testing(leaf_id), 0);

    // A `run_once` keeps touched tasks active until it returns, so GC has to run after it.
    turbo_tasks::run_once(tt.clone(), async move { anyhow::Ok(()) })
        .await
        .unwrap();
    assert_eq!(tt.backend().gc_for_testing(&tt), 1);

    // Disposal after the backend has stopped (the whole task map is dropped by `stop`), as a
    // `RootTask` finalized during Node worker teardown would be.
    tt.stop_and_wait().await;
    tt.dispose_root_task(root_id);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unpin_after_stop_does_not_panic() {
    let (tt, _persistence_dir) = create_tt("unpin_after_stop_does_not_panic");

    let tt2 = tt.clone();
    let leaf_id = turbo_tasks::run_once(tt.clone(), async move {
        let id = TaskId::try_from(*leaf_task_id(7).read_strongly_consistent().await?)?;
        tt2.pin_task_for_gc(id);
        anyhow::Ok(id)
    })
    .await
    .unwrap();

    // Stopping drops the in-memory task map, so the pinned task is no longer resident, exactly as
    // at `next build` shutdown.
    tt.stop_and_wait().await;

    tt.unpin_task_for_gc(leaf_id);
}
