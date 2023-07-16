use turbo_tasks::Vc;

use super::available_assets::AvailableAssets;
use crate::asset::Asset;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    Untracked,
    Root {
        current_availability_root: Vc<Box<dyn Asset>>,
    },
    Inner {
        available_assets: Vc<AvailableAssets>,
        current_availability_root: Vc<Box<dyn Asset>>,
    },
}

impl AvailabilityInfo {
    pub fn current_availability_root(&self) -> Option<Vc<Box<dyn Asset>>> {
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

    pub fn available_assets(&self) -> Option<Vc<AvailableAssets>> {
        match self {
            Self::Untracked => None,
            Self::Root { .. } => None,
            Self::Inner {
                available_assets, ..
            } => Some(*available_assets),
        }
    }
}
