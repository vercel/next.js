use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue, TaskInput,
)]
pub enum WorkerType {
    WebWorker,
    NodeWorkerThread,
}

impl WorkerType {
    pub fn modifier_str(&self) -> RcStr {
        match self {
            WorkerType::WebWorker => rcstr!("worker loader"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread loader"),
        }
    }

    pub fn chunk_modifier_str(&self) -> RcStr {
        match self {
            WorkerType::WebWorker => rcstr!("worker"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread"),
        }
    }

    pub fn reference_str(&self) -> RcStr {
        match self {
            WorkerType::WebWorker => rcstr!("worker module"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread module"),
        }
    }
}
