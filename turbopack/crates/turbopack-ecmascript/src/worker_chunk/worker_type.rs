use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};
use turbopack_core::reference_type::{ReferenceType, WorkerReferenceSubType};

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue, TaskInput,
)]
pub enum WorkerType {
    WebWorker,
    SharedWebWorker,
    NodeWorkerThread,
}

impl WorkerType {
    pub fn modifier_str(&self) -> RcStr {
        match self {
            WorkerType::SharedWebWorker | WorkerType::WebWorker => rcstr!("worker loader"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread loader"),
        }
    }

    pub fn chunk_modifier_str(&self) -> RcStr {
        match self {
            WorkerType::SharedWebWorker | WorkerType::WebWorker => rcstr!("worker"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread"),
        }
    }

    pub fn reference_type(&self) -> ReferenceType {
        ReferenceType::Worker(match self {
            WorkerType::WebWorker => WorkerReferenceSubType::WebWorker,
            WorkerType::SharedWebWorker => WorkerReferenceSubType::SharedWorker,
            WorkerType::NodeWorkerThread => WorkerReferenceSubType::NodeWorker,
        })
    }
}
