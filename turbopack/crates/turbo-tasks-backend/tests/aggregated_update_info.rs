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
    time::Duration,
};

use futures::FutureExt;

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
