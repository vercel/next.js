use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;

#[derive(
    Serialize, Deserialize, Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, TraceRawVcs,
)]
pub enum RuntimeType {
    Development,
    Production,
    #[cfg(feature = "test")]
    /// Dummy runtime for snapshot tests.
    Dummy,
}
