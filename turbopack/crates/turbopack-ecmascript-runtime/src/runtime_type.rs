use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

#[derive(
    Serialize, Deserialize, Debug, Clone, Copy, Hash, PartialEq, Eq, TraceRawVcs, NonLocalValue,
)]
pub enum RuntimeType {
    Development,
    Production,
    #[cfg(feature = "test")]
    /// Dummy runtime for snapshot tests.
    Dummy,
}
