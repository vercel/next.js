use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

static ACTIVE_WORKER_THREADS: AtomicUsize = AtomicUsize::new(0);

/// Tracks the non-parked scheduler workers of one multi-thread Tokio runtime.
///
/// Tokio's thread start/stop callbacks also run for the blocking pool, so they
/// cannot be used to count scheduler workers. Register the configured number
/// of workers before building the runtime, and call `park`/`unpark` from its
/// worker-only callbacks. Keep clones in both callbacks: dropping the last
/// clone removes the runtime's remaining workers from the process-wide total.
/// This also covers workers that have not parked before the runtime shuts down.
///
/// The runtime should be built immediately after registering, since the worker
/// count assumes that its workers have started until they first park.
pub struct ActiveWorkerThreads {
    active: AtomicUsize,
}

impl ActiveWorkerThreads {
    pub fn new(worker_threads: usize) -> Arc<Self> {
        ACTIVE_WORKER_THREADS.fetch_add(worker_threads, Ordering::Relaxed);
        Arc::new(Self {
            active: AtomicUsize::new(worker_threads),
        })
    }

    pub fn park(&self) {
        self.active.fetch_sub(1, Ordering::Relaxed);
        ACTIVE_WORKER_THREADS.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn unpark(&self) {
        self.active.fetch_add(1, Ordering::Relaxed);
        ACTIVE_WORKER_THREADS.fetch_add(1, Ordering::Relaxed);
    }
}

impl Drop for ActiveWorkerThreads {
    fn drop(&mut self) {
        ACTIVE_WORKER_THREADS.fetch_sub(self.active.load(Ordering::Relaxed), Ordering::Relaxed);
    }
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
        let before = active_worker_threads();
        let workers = ActiveWorkerThreads::new(2);
        let mut builder = tokio::runtime::Builder::new_multi_thread();
        let parked = workers.clone();
        let unparked = workers.clone();
        builder
            .worker_threads(2)
            .on_thread_park(move || parked.park())
            .on_thread_unpark(move || unparked.unpark());
        let rt = builder.build().unwrap();
        drop(builder);
        assert_eq!(active_worker_threads(), before + 2);

        let (tx, rx) = mpsc::channel();
        rt.spawn_blocking(move || tx.send(()).unwrap());
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        // All workers should park after the runtime has become idle.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while active_worker_threads() != before {
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
        assert!(active_worker_threads() > before);
        let other_runtime = ActiveWorkerThreads::new(1);
        assert!(active_worker_threads() > before + 1);
        other_runtime.park();
        other_runtime.unpark();
        drop(other_runtime);
        barrier.wait();

        drop(rt);
        drop(workers);
        assert_eq!(active_worker_threads(), before);
    }
}
