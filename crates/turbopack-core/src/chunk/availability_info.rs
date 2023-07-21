use turbo_tasks::Vc;

use super::available_modules::AvailableAssets;
use crate::module::Module;

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    Untracked,
    Root {
        current_availability_root: Vc<Box<dyn Module>>,
    },
    Inner {
        available_modules: Vc<AvailableAssets>,
        current_availability_root: Vc<Box<dyn Module>>,
    },
}

impl AvailabilityInfo {
    pub fn current_availability_root(&self) -> Option<Vc<Box<dyn Module>>> {
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

    pub fn available_modules(&self) -> Option<Vc<AvailableAssets>> {
        match self {
            Self::Untracked => None,
            Self::Root { .. } => None,
            Self::Inner {
                available_modules, ..
            } => Some(*available_modules),
        }
    }
}
