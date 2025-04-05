use anyhow::Result;
use turbo_tasks::ResolvedVc;

use crate::chunk::available_chunk_groups::AvailableChunkGroups;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    /// Availability of modules is not tracked
    Untracked,
    /// Availablility of modules is tracked, but no modules are available
    Root,
    /// There are modules already available.
    Complete {
        available_modules: ResolvedVc<AvailableChunkGroups>,
    },
}

impl AvailabilityInfo {
    pub fn available_chunk_groups(&self) -> Option<ResolvedVc<AvailableChunkGroups>> {
        match self {
            Self::Untracked => None,
            Self::Root => None,
            Self::Complete {
                available_modules, ..
            } => Some(*available_modules),
        }
    }

    pub async fn with_modules(self, chunk_group: u32) -> Result<Self> {
        Ok(match self {
            AvailabilityInfo::Untracked => AvailabilityInfo::Untracked,
            AvailabilityInfo::Root => AvailabilityInfo::Complete {
                available_modules: AvailableChunkGroups::new(chunk_group).to_resolved().await?,
            },
            AvailabilityInfo::Complete { available_modules } => AvailabilityInfo::Complete {
                available_modules: available_modules
                    .with_chunk_group(chunk_group)
                    .to_resolved()
                    .await?,
            },
        })
    }
}
