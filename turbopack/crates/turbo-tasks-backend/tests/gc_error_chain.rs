#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A task that failed because a task it awaited failed doesn't copy that error into its output.
//! It stores the chain of tasks the error passed through, and the last task's output is read again
//! when the error is reconstructed. Those task ids are not references GC knows about.
//!
//! When the task at the end of the chain is dropped by its parent, GC collects it, while the
//! failed task can keep its stale error output: a dirty task isn't recomputed until something
//! needs it. An eventually consistent read of that output must not panic on the collected task.

mod gc_fixture;
mod util;

use std::sync::atomic::{AtomicU32, Ordering};

use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc, unmark_top_level_task_may_leak_eventually_consistent_state};

use crate::{
    gc_fixture::{Selector, create_selector},
    util::{create_persistence_dir, reopen_tt_with_gc},
};

/// The end of the chain: the task whose output holds the actual error.
#[turbo_tasks::function]
async fn inner(n: u32) -> Result<Vc<u32>> {
    bail!("inner {n} failed")
}

/// Calls (and propagates the error of) `inner` only while the selector is `false`.
#[turbo_tasks::function]
async fn middle(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    if *selector.await?.get() {
        return Ok(Vc::cell(0));
    }
    Ok(Vc::cell(*inner(1).await? + 1))
}

static OUTER_EXECUTIONS: AtomicU32 = AtomicU32::new(0);

/// Fails with the chain `[middle, inner]` while the selector is `false`.
#[turbo_tasks::function]
async fn outer(selector: ResolvedVc<Selector>) -> Result<Vc<u32>> {
    OUTER_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    Ok(Vc::cell(*middle(*selector).await? + 1))
}

#[turbo_tasks::function(operation, root)]
fn outer_operation(selector: ResolvedVc<Selector>) -> Vc<u32> {
    outer(*selector)
}

/// Recomputes only `middle`, so `outer` stays dirty with its old error.
#[turbo_tasks::function(operation, root)]
fn middle_operation(selector: ResolvedVc<Selector>) -> Vc<u32> {
    middle(*selector)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reading_an_error_chain_into_a_collected_task_does_not_panic() {
    let dir = create_persistence_dir("reading_an_error_chain_into_a_collected_task_does_not_panic");

    // Session 1: `outer` fails with the chain `[middle, inner]`.
    let tt = reopen_tt_with_gc(&dir);
    let outer_vc = turbo_tasks::run_once(tt.clone(), async {
        let selector_vc = create_selector(false)
            .resolve()
            .strongly_consistent()
            .await?;
        let error = outer_operation(selector_vc)
            .read_strongly_consistent()
            .await
            .expect_err("outer should fail");
        assert!(format!("{error:?}").contains("inner 1 failed"), "{error:?}");
        anyhow::Ok(outer(*selector_vc))
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;

    // Session 2: nothing connects `outer`, so it isn't active. `middle` stops calling `inner`,
    // which loses its only parent; `outer` becomes dirty and keeps its old error output.
    let tt = reopen_tt_with_gc(&dir);
    let executions = OUTER_EXECUTIONS.load(Ordering::SeqCst);
    turbo_tasks::run_once(tt.clone(), async move {
        let selector_op = create_selector(false);
        let selector_vc = selector_op.resolve().strongly_consistent().await?;
        selector_op.read_strongly_consistent().await?.set(true);
        assert_eq!(
            *middle_operation(selector_vc)
                .read_strongly_consistent()
                .await?,
            0
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();

    // Collect `inner` and drop it from memory.
    let outcome = tt.backend().snapshot_and_evict_for_testing(&tt);
    assert!(
        outcome.gc.expect("GC is enabled").0.collected >= 1,
        "inner should be collected"
    );
    assert_eq!(
        OUTER_EXECUTIONS.load(Ordering::SeqCst),
        executions,
        "outer must keep its stale error output"
    );

    // Read `outer`'s stale output without recomputing it. Reconstructing its error used to panic
    // on the collected `inner`.
    let result = turbo_tasks::run_once(tt.clone(), async move {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        Ok(outer_vc.await.map(|value| *value))
    })
    .await
    .expect("reading the stale output should not panic");
    // The chain's source error is gone with the collected task, like when a recomputation of it
    // no longer fails.
    let message = format!(
        "{:?}",
        result.expect_err("outer's stale output is an error")
    );
    assert!(message.contains("Error no longer available"), "{message}");
    tt.stop_and_wait().await;
}
