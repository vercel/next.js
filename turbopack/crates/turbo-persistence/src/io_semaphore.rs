use std::sync::LazyLock;

use parking_lot::{Condvar, Mutex};

/// Default maximum number of concurrent SST file write operations.
///
/// We write a lot of smallish files where high concurrency will cause metadata thrashing.
/// 4 is a safe cross-platform value that balances throughput with avoiding excessive disk
/// contention.
const DEFAULT_WRITE_CONCURRENCY: usize = 4;

/// Returns the configured maximum number of concurrent SST file write operations.
///
/// This can be overridden via the `TURBO_ENGINE_WRITE_CONCURRENCY` environment variable.
/// A value of 0 in the env var is ignored (uses default).
pub fn max_concurrent_sst_writes() -> usize {
    static WRITE_CONCURRENCY: LazyLock<usize> = LazyLock::new(|| {
        std::env::var("TURBO_ENGINE_WRITE_CONCURRENCY")
            .ok()
            .and_then(|s| s.parse().ok())
            .filter(|&v| v != 0)
            .unwrap_or(DEFAULT_WRITE_CONCURRENCY)
    });
    *WRITE_CONCURRENCY
}

/// A simple counting semaphore for limiting concurrent IO operations.
pub struct IoSemaphore {
    state: Mutex<usize>,
    condvar: Condvar,
}

impl IoSemaphore {
    pub fn new(permits: usize) -> Self {
        Self {
            state: Mutex::new(permits),
            condvar: Condvar::new(),
        }
    }

    pub fn acquire(&self) -> IoPermit<'_> {
        let mut available = self.state.lock();
        while *available == 0 {
            self.condvar.wait(&mut available);
        }
        *available -= 1;
        IoPermit { semaphore: self }
    }
}

pub struct IoPermit<'a> {
    semaphore: &'a IoSemaphore,
}

impl Drop for IoPermit<'_> {
    fn drop(&mut self) {
        let mut available = self.semaphore.state.lock();
        *available += 1;
        self.semaphore.condvar.notify_one();
    }
}
