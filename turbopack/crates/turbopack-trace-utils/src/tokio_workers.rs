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
        time::Duration,
    };

    use super::*;

    #[test]
    fn counts_scheduler_workers_but_not_blocking_threads() {
        set_worker_threads(2);
        let mut builder = tokio::runtime::Builder::new_multi_thread();
        builder
            .worker_threads(2)
            .on_thread_park(park)
            .on_thread_unpark(unpark);
        let rt = builder.build().unwrap();
        assert_eq!(active_worker_threads(), 2);

        let (tx, rx) = mpsc::channel();
        rt.spawn_blocking(move || tx.send(()).unwrap());
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        // All workers should park after the runtime has become idle.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while active_worker_threads() != 0 {
            assert!(std::time::Instant::now() < deadline, "workers did not park");
            std::thread::yield_now();
        }

        let barrier = Arc::new(Barrier::new(2));
        let worker_barrier = barrier.clone();
        let (started_tx, started_rx) = mpsc::channel();
        rt.spawn(async move {
            started_tx.send(()).unwrap();
            worker_barrier.wait();
        });
        started_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(active_worker_threads() > 0);
        barrier.wait();
    }
}
