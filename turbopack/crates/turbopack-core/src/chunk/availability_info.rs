use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

use super::available_modules::{AvailableModuleInfoMap, AvailableModules};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    /// Availability of modules is not tracked
    Untracked,
    /// Availablility of modules is tracked, but no modules are available
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

    pub async fn with_modules(self, modules: Vc<AvailableModuleInfoMap>) -> Result<Self> {
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
