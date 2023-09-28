use std::{
    cmp::Reverse,
    collections::HashMap,
    time::{Duration, Instant},
};

use concurrent_queue::ConcurrentQueue;
use nohash_hasher::BuildNoHashHasher;
use turbo_tasks::{small_duration::SmallDuration, TaskId, TurboTasksBackendApi};

use crate::{concurrent_priority_queue::ConcurrentPriorityQueue, MemoryBackend};

/// The priority of a task for garbage collection.
/// Any action will shrink the internal memory structures of the task in a
/// transparent way.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Copy, Clone)]
pub enum GcPriority {
    // The order influences priority. Put the highest priority first.
    /// Unload cells that are currently not read by any task. This might cause
    /// the task to recompute when these cells are read.
    InactiveEmptyUnusedCells {
        compute_duration: SmallDuration<10_000>,
    },
    /// Unload the whole task. Only available for inactive tasks.
    InactiveUnload {
        /// The age of the task. Stored as 2^x seconds to
        /// bucket tasks and avoid frequent revalidation.
        age: Reverse<u8>,
        /// Aggregated recompute time. Stored as 2^x milliseconds to bucket
        /// tasks and avoid frequent revalidation.
        total_compute_duration: u8,
    },
    /// Unload cells that are currently not read by any task. This might cause
    /// the task to recompute when these cells are read.
    EmptyUnusedCells {
        compute_duration: SmallDuration<10_000>,
    },
    /// Unload all cells, and continue tracking them valueless. This might cause
    /// the task and dependent tasks to recompute when these cells are read.
    EmptyCells {
        /// Aggregated recompute time. Stored as 2^x milliseconds to bucket
        /// tasks and avoid frequent revalidation.
        total_compute_duration: u8,
        /// The age of the task. Stored as 2^x seconds to
        /// bucket tasks and avoid frequent revalidation.
        age: Reverse<u8>,
    },
    Placeholder,
}

/// Statistics about actions performed during garbage collection.
#[derive(Default, Debug)]
pub struct GcStats {
    /// How many tasks were unloaded.
    pub unloaded: usize,
    /// How many unused cells were emptied.
    pub empty_unused: usize,
    /// How many unused cells were emptied (on the fast path).
    pub empty_unused_fast: usize,
    /// How many used cells were emptied.
    pub empty_cells: usize,
    /// How often the priority of a task was updated.
    pub priority_updated: usize,
    /// How often the priority of a task was updated (on the fast path).
    pub priority_updated_fast: usize,
    /// How many tasks were checked but did not need to have any action taken.
    pub no_gc_needed: usize,
    /// How many tasks were checked but were in a state where no action could be
    /// taken.
    pub no_gc_possible: usize,
}

/// State about garbage collection for a task.
#[derive(Debug, Default)]
pub struct GcTaskState {
    pub inactive: bool,
}

/// The queue of actions that garbage collection should perform.
pub struct GcQueue {
    /// Tasks that should be checked for inactive propagation.
    inactive_propagate_queue: ConcurrentQueue<TaskId>,
    /// Tasks ordered by gc priority.
    queue: ConcurrentPriorityQueue<TaskId, Reverse<GcPriority>>,
}

impl GcQueue {
    pub fn new() -> Self {
        Self {
            inactive_propagate_queue: ConcurrentQueue::unbounded(),
            queue: ConcurrentPriorityQueue::new(),
        }
    }

    /// Notify the GC queue that a task has been executed.
    pub fn task_executed(&self, task: TaskId, duration: Duration) {
        // A freshly executed task will start on EmptyUnusedCells, even while we are not
        // sure if there are unused cells.
        let compute_duration = duration.into();
        let value = Reverse(GcPriority::EmptyUnusedCells { compute_duration });
        self.queue.insert(task, value);
    }

    /// Notify the GC queue that a task might become inactive.
    pub fn task_might_become_inactive(&self, task: TaskId) {
        let _ = self.inactive_propagate_queue.push(task);
    }

    /// Notify the GC queue that a task has become inactive. This means the
    /// [GcTaskState]::inactive has been set.
    pub fn task_flagged_inactive(&self, task: TaskId, compute_duration: Duration) {
        self.queue.upsert_with(
            task,
            || {
                // When there is no entry, we schedule the minimum priority.
                Reverse(GcPriority::InactiveEmptyUnusedCells {
                    compute_duration: compute_duration.into(),
                })
            },
            |value| {
                match &mut value.0 {
                    GcPriority::InactiveEmptyUnusedCells { .. }
                    | GcPriority::InactiveUnload { .. } => {
                        // already inactive
                    }
                    GcPriority::EmptyUnusedCells { compute_duration } => {
                        // Convert to the higher priority inactive version.
                        *value = Reverse(GcPriority::InactiveEmptyUnusedCells {
                            compute_duration: *compute_duration,
                        })
                    }
                    GcPriority::EmptyCells {
                        age,
                        total_compute_duration,
                    } => {
                        // Convert to the higher priority inactive version.
                        *value = Reverse(GcPriority::InactiveUnload {
                            age: *age,
                            total_compute_duration: *total_compute_duration,
                        })
                    }
                    GcPriority::Placeholder => unreachable!(),
                }
            },
        );
    }

    /// Run garbage collection on the queue. The `factor` parameter controls how
    /// much work should be done. It's a value between 0 and 255, where 255
    /// performs all the work possible.
    pub fn run_gc(
        &self,
        factor: u8,
        backend: &MemoryBackend,
        turbo_tasks: &dyn TurboTasksBackendApi<MemoryBackend>,
    ) -> Option<(GcPriority, usize, GcStats)> {
        // Process through the inactive propagation queue.
        while let Ok(task) = self.inactive_propagate_queue.pop() {
            backend.with_task(task, |task| {
                task.gc_check_inactive(backend);
            });
        }

        if factor == 0 {
            return None;
        }

        // Process through the gc queue.
        let now = turbo_tasks.program_duration_until(Instant::now());
        let mut task_duration_cache = HashMap::with_hasher(BuildNoHashHasher::default());
        let mut stats = GcStats::default();
        let result = self.select_tasks(factor, |task_id, _priority, max_priority| {
            backend.with_task(task_id, |task| {
                task.run_gc(
                    now,
                    max_priority,
                    &mut task_duration_cache,
                    &mut stats,
                    backend,
                    turbo_tasks,
                )
            })
        });
        result.map(|(p, c)| (p, c, stats))
    }

    /// Select a number of tasks to run garbage collection on and run the
    /// `execute` function on them.
    pub fn select_tasks(
        &self,
        factor: u8,
        mut execute: impl FnMut(TaskId, GcPriority, GcPriority) -> Option<GcPriority>,
    ) -> Option<(GcPriority, usize)> {
        const MAX_POP: usize = 1000000;
        let jobs = self.queue.pop_factor(factor, MAX_POP);
        if jobs.is_empty() {
            return None;
        }
        let highest_priority = jobs.iter().map(|&(_, Reverse(p))| p).max().unwrap();
        let len = jobs.len();
        for (task, Reverse(priority)) in jobs {
            if let Some(new_priority) = execute(task, priority, highest_priority) {
                self.queue.upsert_with(
                    task,
                    || Reverse(new_priority),
                    |value| {
                        if *value < Reverse(new_priority) {
                            *value = Reverse(new_priority);
                        }
                    },
                );
            }
        }
        Some((highest_priority, len))
    }
}

/// Converts a value to an logarithmic scale.
pub fn to_exp_u8(value: u64) -> u8 {
    value
        .checked_next_power_of_two()
        .unwrap_or(0x7000_0000_0000_0000)
        .trailing_zeros() as u8
}
