#[derive(Debug)]
pub enum TaskExecutionReason {
    /// A root task was initially scheduled and is executed
    Root,
    /// A task output was read, but the output is not available, so the task was scheduled and
    /// executed to produce the output
    OutputNotAvailable,
    /// A task cell was read, but the cell content is not available, so the task was scheduled and
    /// executed to produce the cell content
    CellNotAvailable,
    /// A task was marked as dirty and is active on it's own (maybe root or currently awaited), so
    /// it was scheduled and executed to update the task output
    Invalidated,
    /// A dirty task has been activated, so it was scheduled and executed to update the task output
    ActivateDirty,
    /// A task has been activated for the first time (no output yet), so it was scheduled and
    /// executed to produce the task output
    ActivateInitial,
    /// A task was connected as child in `active_tracking == false` mode for the first time (no
    /// output yet), so it was scheduled and executed to produce the task output.
    /// Or a task was called inside of a turbo_tasks::run closure for the first time (no output
    /// yet), so it was scheduled and executed to produce the task output.
    Connect,
    /// An in-progress task was marked as stale, so it was scheduled again after execution and is
    /// executing again to update the task output.
    Stale,
}

impl TaskExecutionReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskExecutionReason::Root => "root",
            TaskExecutionReason::OutputNotAvailable => "output_not_available",
            TaskExecutionReason::CellNotAvailable => "cell_not_available",
            TaskExecutionReason::Invalidated => "invalidated",
            TaskExecutionReason::ActivateDirty => "activate_dirty",
            TaskExecutionReason::ActivateInitial => "activate_initial",
            TaskExecutionReason::Connect => "connect",
            TaskExecutionReason::Stale => "stale",
        }
    }
}
