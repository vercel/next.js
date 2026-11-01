use crate::{ReadConsistency, ReadTracking, event::EventListener, manager::ReadCellTracking};

/// What a read of a task's output or cell found.
///
/// The two "not available yet" cases are distinguished because the reader can act on them
/// differently: a task that is only *scheduled* can be taken over and executed by the reader, while
/// one that some worker is already executing can only be waited for — and finding that out without
/// taking the scheduler's queue lock is the point of telling them apart.
///
/// The state is a **hint**: it is a snapshot, and a task can be picked up by a worker right after
/// the read looked (a worker even pops a task off the queue before it marks it as started). Acting
/// on a stale hint costs at most a failed claim, never correctness.
pub enum ReadOutcome<T> {
    /// The value is available.
    Value(T),
    /// The task is queued but no worker has started it, so the reader may take it out of the queue
    /// and execute it itself. The listener fires when the task is done.
    Scheduled(EventListener),
    /// A worker is already executing the task; there is nothing to take over. The listener fires
    /// when the task is done.
    InProgress(EventListener),
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadCellOptions {
    pub tracking: ReadCellTracking,
    pub final_read_hint: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReadOutputOptions {
    pub tracking: ReadTracking,
    pub consistency: ReadConsistency,
}
