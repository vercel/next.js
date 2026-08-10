use std::{cmp::max, fmt::Debug, time::Duration};

use tokio::sync::OwnedSemaphorePermit;

pub enum AcquiredPermits {
    Idle {
        // This is used for drop
        _concurrency_permit: OwnedSemaphorePermit,
    },
    Fresh {
        // This is used for drop
        _concurrency_permit: OwnedSemaphorePermit,
        // This is used for drop
        _bootup_permit: OwnedSemaphorePermit,
    },
}

#[derive(Default)]
pub struct NodeJsPoolStats {
    pub total_bootup_time: Duration,
    pub bootup_count: u32,
    pub total_cold_process_time: Duration,
    pub cold_process_count: u32,
    pub total_warm_process_time: Duration,
    pub warm_process_count: u32,
    pub workers: u32,
    pub booting_workers: u32,
    pub queued_tasks: u32,
}

impl NodeJsPoolStats {
    #[allow(unused)]
    pub fn add_bootup_time(&mut self, time: Duration) {
        self.total_bootup_time += time;
        self.bootup_count += 1;
    }

    pub fn add_booting_worker(&mut self) {
        self.booting_workers += 1;
        self.workers += 1;
    }

    pub fn finished_booting_worker(&mut self) {
        self.booting_workers = self.booting_workers.saturating_sub(1);
    }

    pub fn remove_worker(&mut self) {
        self.workers = self.workers.saturating_sub(1);
    }

    #[allow(unused)]
    pub fn add_queued_task(&mut self) {
        self.queued_tasks += 1;
    }

    #[allow(unused)]
    pub fn add_cold_process_time(&mut self, time: Duration) {
        self.total_cold_process_time += time;
        self.cold_process_count += 1;
        self.queued_tasks = self.queued_tasks.saturating_sub(1);
    }

    #[allow(unused)]
    pub fn add_warm_process_time(&mut self, time: Duration) {
        self.total_warm_process_time += time;
        self.warm_process_count += 1;
        self.queued_tasks = self.queued_tasks.saturating_sub(1);
    }

    pub fn estimated_bootup_time(&self) -> Duration {
        if self.bootup_count == 0 {
            Duration::from_millis(200)
        } else {
            self.total_bootup_time / self.bootup_count
        }
    }

    pub fn estimated_warm_process_time(&self) -> Duration {
        if self.warm_process_count == 0 {
            self.estimated_cold_process_time()
        } else {
            self.total_warm_process_time / self.warm_process_count
        }
    }

    pub fn estimated_cold_process_time(&self) -> Duration {
        if self.cold_process_count == 0 {
            // We assume cold processing is half of bootup time
            self.estimated_bootup_time() / 2
        } else {
            self.total_cold_process_time / self.cold_process_count
        }
    }

    #[allow(unused)]
    pub fn wait_time_before_bootup(&self) -> Duration {
        if self.workers == 0 {
            return Duration::ZERO;
        }
        let booting_workers = self.booting_workers;
        let workers = self.workers;
        let warm_process_time = self.estimated_warm_process_time();
        let expected_completion = self.expected_completion(workers, booting_workers);

        let new_process_duration =
            self.estimated_bootup_time() + self.estimated_cold_process_time();
        if expected_completion + warm_process_time < new_process_duration {
            // Running the task with the existing warm pool is faster
            return (expected_completion + warm_process_time + new_process_duration) / 2;
        }

        let expected_completion_with_additional_worker = max(
            new_process_duration,
            self.expected_completion(workers + 1, booting_workers + 1),
        );
        if expected_completion > expected_completion_with_additional_worker {
            // Scaling up the pool would help to complete work faster
            return Duration::ZERO;
        }

        // It's expected to be faster if we queue the task
        (expected_completion + expected_completion_with_additional_worker) / 2
    }

    fn expected_completion(&self, workers: u32, booting_workers: u32) -> Duration {
        if workers == 0 {
            return Duration::MAX;
        }
        let bootup_time = self.estimated_bootup_time();
        let cold_process_time = self.estimated_cold_process_time();
        let warm_process_time = self.estimated_warm_process_time();
        let expected_full_workers_in = booting_workers * (bootup_time / 2 + cold_process_time);
        let expected_completed_task_until_full_workers = {
            let millis = max(1, warm_process_time.as_millis());
            let ready_workers = workers - booting_workers;
            (expected_full_workers_in.as_millis() / millis) as u32 * ready_workers
        };
        let remaining_tasks = self
            .queued_tasks
            .saturating_sub(expected_completed_task_until_full_workers);
        if remaining_tasks > 0 {
            expected_full_workers_in + warm_process_time * remaining_tasks / workers
        } else {
            warm_process_time * self.queued_tasks / workers
        }
    }

    pub fn snapshot(&self) -> PoolStatsSnapshot {
        PoolStatsSnapshot {
            bootup_count: self.bootup_count,
            warm_operation_count: self.warm_process_count,
            cold_operation_count: self.cold_process_count,
            workers: self.workers,
            booting_workers: self.booting_workers,
        }
    }
}

impl Debug for NodeJsPoolStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NodeJsPoolStats")
            .field("queued_tasks", &self.queued_tasks)
            .field("workers", &self.workers)
            .field("booting_workers", &self.booting_workers)
            .field(
                "expected_completion",
                &self.expected_completion(self.workers, self.booting_workers),
            )
            .field("bootup_time", &self.estimated_bootup_time())
            .field("cold_process_time", &self.estimated_cold_process_time())
            .field("warm_process_time", &self.estimated_warm_process_time())
            .field("bootup_count", &self.bootup_count)
            .field("cold_process_count", &self.cold_process_count)
            .field("warm_process_count", &self.warm_process_count)
            .finish()
    }
}

/// A snapshot of pool statistics, useful for testing and diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolStatsSnapshot {
    /// Total number of processes ever successfully booted.
    pub bootup_count: u32,
    /// Number of completed operations that reused an idle process.
    pub warm_operation_count: u32,
    /// Number of completed operations that spawned a fresh process.
    pub cold_operation_count: u32,
    /// Current number of tracked workers (booting + idle + in-use).
    pub workers: u32,
    /// Current number of workers still booting.
    pub booting_workers: u32,
}
