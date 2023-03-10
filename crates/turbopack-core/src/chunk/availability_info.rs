use super::available_assets::AvailableAssetsVc;
use crate::asset::AssetVc;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    Untracked,
    Root {
        current_availability_root: AssetVc,
    },
    Inner {
        available_assets: AvailableAssetsVc,
        current_availability_root: AssetVc,
    },
}

impl AvailabilityInfo {
    pub fn current_availability_root(&self) -> Option<AssetVc> {
        match self {
            Self::Untracked => None,
            Self::Root {
                current_availability_root,
            } => Some(*current_availability_root),
            Self::Inner {
                current_availability_root,
                ..
            } => Some(*current_availability_root),
        }
    }

    pub fn available_assets(&self) -> Option<AvailableAssetsVc> {
        match self {
            Self::Untracked => None,
            Self::Root { .. } => None,
            Self::Inner {
                available_assets, ..
            } => Some(*available_assets),
        }
    }
}
