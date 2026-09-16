use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationValue, trace::TraceRawVcs};

/// A request for an entry module, relative to the project root or a bare module
/// specifier.
/// `#[turbo_tasks::task_input]` already provides `NonLocalValue`.
#[turbo_tasks::task_input]
#[derive(
    Clone,
    Debug,
    Hash,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    OperationValue,
    Encode,
    Decode,
)]
pub enum EntryRequest {
    Relative(RcStr),
    Module(RcStr, RcStr),
}
