#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Shutdown must not strand a strongly consistent read behind a canceled task.
//!
//! Turbo-tasks does not cancel a task that is already executing; cancellation applies to a task
//! that is *dispatched* after `stopped` is set. So a task launched during shutdown is canceled
//! before it runs, and a canceled task never runs again — it can never become clean, so nothing
//! will ever fire its `all_clean_event`. A strongly consistent reader waiting on that event would
//! wait forever, and `stop_and_wait` would in turn block on the foreground job the reader holds.
//!
//! Only `next build` reaches this in production (the dev server uses a short-timeout
//! `project_on_exit`), which is why it went untested.

mod util;

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use anyhow::Result;
use tokio::sync::Semaphore;
use turbo_tasks::{TurboTasks, Vc};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt;

/// Set once the outer task is parked, so the test only begins shutting down at that point.
static PARKED: AtomicBool = AtomicBool::new(false);

/// Released by the test once shutdown has begun. The outer task then tries to launch a child,
/// which is dispatched after `stopped` is set and is therefore canceled.
static RELEASE: Semaphore = Semaphore::const_new(0);

/// Launched only after shutdown has started, so it is canceled before it executes.
#[turbo_tasks::function]
fn launched_during_shutdown() -> Vc<u32> {
    Vc::cell(42)
}

#[turbo_tasks::function(operation, root)]
async fn pauses_then_launches_a_child() -> Result<Vc<u32>> {
    PARKED.store(true, Ordering::SeqCst);
    // Wait for the test to start shutting down.
    let _permit = RELEASE.acquire().await?;
    // Dispatched post-`stopped`, so this child is canceled rather than run. Reading it must
    // surface that rather than hang.
    Ok(Vc::cell(*launched_during_shutdown().await?))
}

/// A strongly consistent read whose task launches a child during shutdown.
///
/// The read is expected to fail — the child is canceled. What must not happen is
/// `stop_and_wait` blocking forever on the reader's foreground job.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn shutdown_unblocks_read_of_canceled_child() {
    let (tt, _persistence_dir) = create_tt("shutdown_unblocks_read_of_canceled_child");

    let tt_reader: Arc<TurboTasks<TurboTasksBackend>> = tt.clone();
    let reader = tokio::spawn(async move {
        let _ = turbo_tasks::run_once(tt_reader.clone(), async move {
            // An error is the expected outcome once the child is canceled; returning at all is
            // the property under test.
            let _ = pauses_then_launches_a_child()
                .read_strongly_consistent()
                .await;
            anyhow::Ok(())
        })
        .await;
    });

    for _ in 0..500 {
        if PARKED.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(
        PARKED.load(Ordering::SeqCst),
        "the task never parked, so this test would not exercise cancellation"
    );

    // Begin shutdown, then release the task so its child is dispatched into a stopping backend.
    // The parent then runs to completion — turbo-tasks does not cancel an executing task — and
    // the only thing that can strand the reader is the canceled child.
    let tt_stop = tt.clone();
    let stop = tokio::spawn(async move { tt_stop.stop_and_wait().await });
    tokio::time::sleep(Duration::from_millis(50)).await;
    RELEASE.add_permits(1);

    tokio::time::timeout(Duration::from_secs(30), stop)
        .await
        .expect("stop_and_wait hung: a canceled task stranded a strongly consistent reader")
        .unwrap();

    tokio::time::timeout(Duration::from_secs(30), reader)
        .await
        .expect("the strongly consistent read never returned after shutdown")
        .unwrap();
}
