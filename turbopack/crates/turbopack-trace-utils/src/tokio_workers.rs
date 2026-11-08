use std::sync::atomic::{AtomicUsize, Ordering};

static ACTIVE_WORKER_THREADS: AtomicUsize = AtomicUsize::new(0);

/// Initialize the count of non-parked scheduler workers before building the
/// process's Tokio runtime. Tokio's thread start/stop hooks also include the
/// blocking pool, while park/unpark hooks apply only to scheduler workers.
///
/// This assumes a single traced Tokio runtime per process. We do not adjust
/// the count when the runtime shuts down.
pub fn set_worker_threads(worker_threads: usize) {
    ACTIVE_WORKER_THREADS.store(worker_threads, Ordering::Relaxed);
}

pub fn park() {
    ACTIVE_WORKER_THREADS.fetch_sub(1, Ordering::Relaxed);
}

pub fn unpark() {
    ACTIVE_WORKER_THREADS.fetch_add(1, Ordering::Relaxed);
}

pub fn active_worker_threads() -> usize {
    ACTIVE_WORKER_THREADS.load(Ordering::Relaxed)
}

/// Match Tokio's default worker count when a runtime does not set it explicitly.
pub fn default_worker_threads() -> usize {
    match std::env::var("TOKIO_WORKER_THREADS") {
        Ok(value) => {
            let count: usize = value.parse().expect("TOKIO_WORKER_THREADS must be usize");
            assert!(count > 0, "TOKIO_WORKER_THREADS cannot be set to 0");
            count
        }
        Err(std::env::VarError::NotPresent) => {
            std::thread::available_parallelism().map_or(1, |n| n.get())
        }
        Err(error) => panic!("TOKIO_WORKER_THREADS must be valid unicode: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier, mpsc},
        time::{Duration, Instant},
    };

    use super::*;

    /// Long enough to survive a busy CI machine, short enough to report a
    /// failure instead of hanging the test run.
    const TIMEOUT: Duration = Duration::from_secs(10);

    /// Tokio's workers change the count from their own threads whenever they
    /// happen to be scheduled, so anything that depends on them has to be
    /// awaited rather than asserted on right away.
    #[track_caller]
    fn wait_for_active_worker_threads(expected: usize) {
        let deadline = Instant::now() + TIMEOUT;
        loop {
            let active = active_worker_threads();
            if active == expected {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "expected {expected} active worker thread(s), found {active}"
            );
            // Sleeping rather than spinning: the worker threads we are waiting
            // for need the CPU more than this thread does.
            std::thread::sleep(Duration::from_millis(1));
        }
    }

    /// This covers the whole counting contract in one test on purpose:
    /// `ACTIVE_WORKER_THREADS` is process-global, so separate tests would race
    /// with each other when the test binary runs them in parallel threads.
    #[test]
    fn counts_scheduler_workers_but_not_blocking_threads() {
        // The seeded count is only observable while the runtime does not exist
        // yet. `Builder::build` spawns the workers before it returns and each of
        // them parks as soon as it finds no work, so the count already starts
        // dropping at a moment this thread does not control.
        set_worker_threads(2);
        assert_eq!(active_worker_threads(), 2);
        park();
        assert_eq!(active_worker_threads(), 1);
        unpark();
        assert_eq!(active_worker_threads(), 2);

        let mut builder = tokio::runtime::Builder::new_multi_thread();
        builder
            .worker_threads(2)
            .on_thread_park(park)
            .on_thread_unpark(unpark);
        let rt = builder.build().unwrap();

        // Both scheduler workers park once the runtime is idle.
        wait_for_active_worker_threads(0);

        // Blocking threads are not scheduler workers and must not be counted:
        // the count stays at zero while a blocking task occupies one of them.
        let (blocking_tx, blocking_rx) = mpsc::channel();
        rt.spawn_blocking(move || blocking_tx.send(active_worker_threads()).unwrap());
        assert_eq!(blocking_rx.recv_timeout(TIMEOUT).unwrap(), 0);

        // A spawned task unparks a scheduler worker, which is counted. The task
        // holds the worker on the barrier so that it cannot park again before
        // the count is read.
        let barrier = Arc::new(Barrier::new(2));
        let worker_barrier = barrier.clone();
        let (started_tx, started_rx) = mpsc::channel();
        rt.spawn(async move {
            started_tx.send(()).unwrap();
            worker_barrier.wait();
        });
        started_rx.recv_timeout(TIMEOUT).unwrap();
        assert!(active_worker_threads() > 0);
        barrier.wait();

        // Park and unpark stay balanced, so the count returns to zero once the
        // runtime is idle again.
        wait_for_active_worker_threads(0);
    }
}
