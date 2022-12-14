use std::time::Duration;

use turbo_tasks::{small_duration::SmallDuration, StatsType};

/// Keeps track of the number of times a task has been executed, and its
/// duration.
#[derive(Debug, Clone, Eq, PartialEq)]
pub enum TaskStats {
    Essential(TaskStatsEssential),
    Full(Box<TaskStatsFull>),
}

impl TaskStats {
    /// Creates a new [`TaskStats`].
    pub fn new(stats_type: StatsType) -> Self {
        match stats_type {
            turbo_tasks::StatsType::Essential => Self::Essential(TaskStatsEssential::default()),
            turbo_tasks::StatsType::Full => Self::Full(Box::default()),
        }
    }

    /// Resets the number of executions to 1 only if it was greater than 1.
    pub fn reset_executions(&mut self) {
        if let Self::Full(stats) = self {
            if stats.executions > 1 {
                stats.executions = 1;
            }
        }
    }

    /// Increments the number of executions by 1.
    pub fn increment_executions(&mut self) {
        if let Self::Full(stats) = self {
            stats.executions += 1;
        }
    }

    /// Registers a task duration.
    pub fn register_execution(&mut self, duration: Duration, duration_since_start: Duration) {
        match self {
            Self::Full(stats) => {
                stats.total_duration += duration;
                stats.last_duration = duration;
            }
            Self::Essential(stats) => {
                stats.last_duration = duration.into();
                stats.last_execution_relative_to_start = duration_since_start.into();
            }
        }
    }

    /// Resets stats to their default, zero-value.
    pub fn reset(&mut self) {
        match self {
            Self::Full(stats) => {
                stats.executions = 0;
                stats.total_duration = Duration::ZERO;
                stats.last_duration = Duration::ZERO;
            }
            Self::Essential(stats) => {
                stats.last_duration = SmallDuration::MIN;
                stats.last_execution_relative_to_start = SmallDuration::MIN;
            }
        }
    }
}

#[derive(Debug, Default, Clone, Eq, PartialEq)]
pub struct TaskStatsEssential {
    /// The last duration of the task, with a precision of 10 microseconds.
    last_duration: SmallDuration<10_000>,
    /// The last execution of the task relative to the start of the program,
    /// with a precision of 1 millisecond.
    last_execution_relative_to_start: SmallDuration<1_000_000>,
}

impl TaskStatsEssential {
    /// Returns the last duration of the task.
    pub fn last_duration(&self) -> Duration {
        self.last_duration.into()
    }

    /// Returns the last execution of the task relative to the start of the
    /// program.
    #[allow(dead_code)] // NOTE(alexkirsz) This will be useful for GC.
    pub fn last_execution_relative_to_start(&self) -> Duration {
        self.last_execution_relative_to_start.into()
    }
}

#[derive(Debug, Default, Clone, Eq, PartialEq)]
pub struct TaskStatsFull {
    /// The number of times the task has been executed.
    executions: u32,
    /// The last duration of the task.
    last_duration: Duration,
    /// The total duration of the task.
    total_duration: Duration,
    /// The last execution of the task relative to the start of the program,
    /// with a precision of 1 millisecond.
    last_execution_relative_to_start: SmallDuration<1_000_000>,
}

impl TaskStatsFull {
    /// Returns the number of times the task has been executed.
    pub fn executions(&self) -> u32 {
        self.executions
    }

    /// Returns the last duration of the task.
    pub fn last_duration(&self) -> Duration {
        self.last_duration
    }

    /// Returns the total duration of the task.
    pub fn total_duration(&self) -> Duration {
        self.total_duration
    }

    /// Returns the last execution of the task relative to the start of the
    /// program.
    #[allow(dead_code)] // NOTE(alexkirsz) This will be useful for GC.
    pub fn last_execution_relative_to_start(&self) -> Duration {
        self.last_execution_relative_to_start.into()
    }
}
