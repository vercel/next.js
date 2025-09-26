use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};
use turbopack_core::reference_type::ReferenceType;

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum MatchMode {
    // Match all but internal references.
    NonInternal,
    // Only match internal references.
    Internal,
    // Match both internal and non-internal references.
    All,
}

impl MatchMode {
    pub fn matches(&self, reference_type: &ReferenceType) -> bool {
        matches!(
            (self, reference_type.is_internal()),
            (MatchMode::All, _) | (MatchMode::NonInternal, false) | (MatchMode::Internal, true)
        )
    }
}
