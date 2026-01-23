use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, TaskInput, trace::TraceRawVcs};
use turbopack_core::reference_type::WorkerReferenceSubType;

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
            WorkerType::WebWorker => rcstr!("web worker loader"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread loader"),
            WorkerType::SharedWebWorker => rcstr!("shared web worker loader"),
        }
    }

    pub fn chunk_modifier_str(&self) -> RcStr {
        match self {
            WorkerType::WebWorker => rcstr!("worker"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread"),
            WorkerType::SharedWebWorker => rcstr!("shared worker"),
        }
    }

    pub fn reference_str(&self) -> RcStr {
        match self {
            WorkerType::WebWorker => rcstr!("web worker module"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread module"),
            WorkerType::SharedWebWorker => rcstr!("shared web worker module"),
        }
    }

    pub fn reference_sub_type(&self) -> WorkerReferenceSubType {
        match self {
            WorkerType::WebWorker => WorkerReferenceSubType::WebWorker,
            WorkerType::SharedWebWorker => WorkerReferenceSubType::SharedWorker,
            WorkerType::NodeWorkerThread => WorkerReferenceSubType::NodeWorker,
        }
    }
}
