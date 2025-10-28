use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};

use super::available_modules::{AvailableModules, AvailableModulesSet};

#[derive(
    Eq,
    PartialEq,
    Hash,
    Clone,
    Copy,
    Debug,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
    Serialize,
    Deserialize,
)]
pub enum AvailabilityInfo {
    /// Availability of modules is not tracked
    Untracked,
    /// Availability of modules is tracked, but no modules are available
    Root,
    /// There are modules already available.
    Complete {
        available_modules: ResolvedVc<AvailableModules>,
    },
}

impl AvailabilityInfo {
    pub fn available_modules(&self) -> Option<ResolvedVc<AvailableModules>> {
        match self {
            Self::Untracked => None,
            Self::Root => None,
            Self::Complete {
                available_modules, ..
            } => Some(*available_modules),
        }
    }

    pub async fn with_modules(self, modules: Vc<AvailableModulesSet>) -> Result<Self> {
        Ok(match self {
            AvailabilityInfo::Untracked => AvailabilityInfo::Untracked,
            AvailabilityInfo::Root => AvailabilityInfo::Complete {
                available_modules: AvailableModules::new(modules).to_resolved().await?,
            },
            AvailabilityInfo::Complete { available_modules } => AvailabilityInfo::Complete {
                available_modules: available_modules
                    .with_modules(modules)
                    .to_resolved()
                    .await?,
            },
        })
    }
}
