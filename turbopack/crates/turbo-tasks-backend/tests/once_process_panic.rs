#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::time::Duration;

use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// A once-process whose future panics must not corrupt the foreground-job
/// counter: `start_once_process` finishes the job before awaiting the future
/// and re-begins it after; without a drop-safe guard, a panic skips the
/// re-begin and underflows the counter (wrapping to `usize::MAX`), so
/// `stop_and_wait` would never return and the manager never reports idle.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_once_process_panic_balances_foreground_jobs() {
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ));

    // A normal once-process completes fine...
    tt.start_once_process(Box::pin(async {}));
    // ...and one whose future panics.
    tt.start_once_process(Box::pin(async {
        panic!("intentional once-process panic");
    }));

    // Let the once processes run.
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Pre-fix, the counter underflowed and this never returned.
    tokio::time::timeout(Duration::from_secs(30), tt.stop_and_wait())
        .await
        .expect("stop_and_wait hung: foreground job counter underflowed");
}
