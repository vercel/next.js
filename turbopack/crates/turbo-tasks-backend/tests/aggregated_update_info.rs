#![feature(arbitrary_self_types)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

mod util;

use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    task::Poll,
    time::{Duration, Instant},
};

use futures::FutureExt;
use turbo_tasks::{InvalidationReason, TurboTasks, run_once_with_reason};
use turbo_tasks_backend::TurboTasksBackend;

use crate::util::create_tt;

const AGGREGATION: Duration = Duration::from_millis(100);

/// A foreground job that starts within the aggregation window and outlasts it belongs to the same
/// update: the update must not end while it is still running.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn aggregation_waits_for_running_foreground_jobs() {
    let (tt, _persistence_dir) = create_tt("aggregation_waits_for_running_foreground_jobs");

    // A short job records an update. Its completion opens the aggregation window below.
    tt.run(async { Ok(()) }).await.unwrap();

    let update_info = tt.get_or_wait_aggregated_update_info(AGGREGATION);
    let long_job_done = Arc::new(AtomicBool::new(false));
    let long_job = tt.run({
        let long_job_done = long_job_done.clone();
        async move {
            tokio::time::sleep(AGGREGATION * 3).await;
            long_job_done.store(true, Ordering::SeqCst);
            Ok(())
        }
    });
    futures::pin_mut!(update_info, long_job);

    // Start the aggregation window first, then start a job that outlasts it.
    assert!(update_info.as_mut().now_or_never().is_none());
    assert!(long_job.as_mut().now_or_never().is_none());

    let mut long_job_finished = false;
    let update_info = std::future::poll_fn(|cx| {
        if !long_job_finished && let Poll::Ready(result) = long_job.as_mut().poll(cx) {
            result.unwrap();
            long_job_finished = true;
        }
        update_info.as_mut().poll(cx)
    })
    .await;
    assert!(
        long_job_done.load(Ordering::SeqCst),
        "the update ended while a foreground job was still running"
    );
    assert!(
        update_info.duration >= AGGREGATION * 3,
        "the update doesn't include the long job: {:?}",
        update_info.duration
    );

    tt.stop_and_wait().await;
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct FileChange(&'static str);

impl InvalidationReason for FileChange {}

impl std::fmt::Display for FileChange {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} changed", self.0)
    }
}

/// Simulates a file change and the compilation it causes, which takes `compile_time`.
async fn change_and_compile(
    tt: &Arc<TurboTasks<TurboTasksBackend>>,
    path: &'static str,
    compile_time: Duration,
) {
    run_once_with_reason(tt.clone(), FileChange(path), async move {
        tokio::time::sleep(compile_time).await;
        Ok(())
    })
    .await
    .unwrap();
}

/// Waits for the next aggregated update in the background. Resolves with the update and when it
/// was received.
fn next_update(
    tt: &Arc<TurboTasks<TurboTasksBackend>>,
) -> tokio::task::JoinHandle<(turbo_tasks::UpdateInfo, Instant)> {
    let tt = tt.clone();
    tokio::spawn(async move {
        let update_info = tt.get_or_wait_aggregated_update_info(AGGREGATION).await;
        (update_info, Instant::now())
    })
}

/// The aggregation window is counted from the file change, not from the end of the compilation:
/// a compilation that outlasts the window ends the update right away.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn aggregation_window_counts_from_last_invalidation() {
    let (tt, _persistence_dir) = create_tt("aggregation_window_counts_from_last_invalidation");

    let update = next_update(&tt);
    change_and_compile(&tt, "page.tsx", AGGREGATION * 2).await;
    let compiled = Instant::now();
    let (update_info, received) = update.await.unwrap();

    assert_eq!(update_info.reasons.len(), 1);
    assert!(
        received.duration_since(compiled) < AGGREGATION / 2,
        "the update waited for the aggregation window after compiling: {:?}",
        received.duration_since(compiled)
    );

    tt.stop_and_wait().await;
}

/// File changes within the aggregation window still end up in one update, which ends a full window
/// after the last change.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidations_within_window_are_aggregated() {
    let (tt, _persistence_dir) = create_tt("invalidations_within_window_are_aggregated");

    let update = next_update(&tt);
    change_and_compile(&tt, "a.tsx", Duration::ZERO).await;
    tokio::time::sleep(AGGREGATION / 2).await;
    let last_change = Instant::now();
    change_and_compile(&tt, "b.tsx", Duration::ZERO).await;
    let (update_info, received) = update.await.unwrap();

    assert_eq!(
        update_info.reasons.len(),
        2,
        "both changes belong to one update: {}",
        update_info.reasons
    );
    assert!(
        received >= last_change + AGGREGATION,
        "the update ended before the window after the last change: {:?}",
        received.duration_since(last_change)
    );

    tt.stop_and_wait().await;
}
