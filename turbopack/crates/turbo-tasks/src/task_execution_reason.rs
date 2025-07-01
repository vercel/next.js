#[derive(Debug)]
pub enum TaskExecutionReason {
    Initial,
    Local,
    OutputNotAvailable,
    CellNotAvailable,
    Invalidated,
    ActivateDirty,
    ActivateInitial,
    Connect,
    Stale,
}

impl TaskExecutionReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskExecutionReason::Initial => "initial",
            TaskExecutionReason::Local => "local",
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
