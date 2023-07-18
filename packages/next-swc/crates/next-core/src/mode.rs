use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, TaskInput};

/// The mode in which Next.js is running.
#[derive(
    Debug,
    Copy,
    Clone,
    TaskInput,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    ValueDebugFormat,
)]
pub enum NextMode {
    /// `next dev`
    Development,
    /// `next build`
    Build,
}

impl NextMode {
    /// Returns the NODE_ENV value for the current mode.
    pub fn node_env(&self) -> &'static str {
        match self {
            NextMode::Development => "development",
            NextMode::Build => "production",
        }
    }

    /// Returns true if the development React runtime should be used.
    pub fn is_react_development(&self) -> bool {
        match self {
            NextMode::Development => true,
            NextMode::Build => false,
        }
    }
}
