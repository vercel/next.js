#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Regression test for a bug where shutdown would cause a strongly consistent read to hang
//! if a task in scope was cancelled.

mod util;

use std::{
    sync::{Arc, LazyLock},
    time::Duration,
};

use anyhow::Result;
use tokio::sync::Barrier;
use turbo_tasks::{TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt;

/// Rendezvous between the task and the test: the task waits here, the test joins once it is ready
/// to shut down, and both proceed. Two barriers rather than one so the test can shut down
/// *between* them, which is what puts the child's dispatch after `stopped` is set.
static PARKED: LazyLock<Barrier> = LazyLock::new(|| Barrier::new(2));
static RELEASED: LazyLock<Barrier> = LazyLock::new(|| Barrier::new(2));

/// Launched only after shutdown has started, so it is cancelled before it executes.
#[turbo_tasks::function]
fn launched_during_shutdown() -> Vc<u32> {
    Vc::cell(42)
}

#[turbo_tasks::function(operation, root)]
async fn pauses_then_launches_a_child() -> Result<Vc<u32>> {
    PARKED.wait().await;
    RELEASED.wait().await;
    // Dispatched after `stopped` is set, so this child is cancelled rather than run. Reading it
    // must surface that rather than hang.
    Ok(Vc::cell(*launched_during_shutdown().await?))
}

/// A strongly consistent read whose task launches a child during shutdown.
///
/// The read is expected to fail — the child is cancelled. What must not happen is
/// `stop_and_wait` blocking forever on the reader's foreground job.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn shutdown_unblocks_read_of_canceled_child() {
    let (tt, _persistence_dir) = create_tt("shutdown_unblocks_read_of_canceled_child");

    let tt_reader: Arc<TurboTasks<TurboTasksBackend>> = tt.clone();
    let reader = tokio::spawn(async move {
        let _ = turbo_tasks::run_once(tt_reader.clone(), async move {
            // An error is the expected outcome once the child is cancelled; returning at all is
            // the property under test.
            let _ = pauses_then_launches_a_child()
                .read_strongly_consistent()
                .await;
            anyhow::Ok(())
        })
        .await;
    });

    // Wait for the task to park, so shutdown lands between its two barriers.
    PARKED.wait().await;

    let tt_stop = tt.clone();
    let stop = tokio::spawn(async move { tt_stop.stop_and_wait().await });
    // Let shutdown set `stopped` before releasing the task, so its child is dispatched into a
    // stopping backend. The task then runs to completion — turbo-tasks does not cancel a task
    // that is already executing — and only the cancelled child can strand the reader.
    tokio::time::sleep(Duration::from_millis(50)).await;
    RELEASED.wait().await;

    tokio::time::timeout(Duration::from_secs(30), stop)
        .await
        .expect("stop_and_wait hung: a cancelled task stranded a strongly consistent reader")
        .unwrap();

    tokio::time::timeout(Duration::from_secs(30), reader)
        .await
        .expect("the strongly consistent read never returned after shutdown")
        .unwrap();
}
