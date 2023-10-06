use std::ops::{BitOr, BitOrAssign};

use turbo_tasks::Vc;

use super::available_modules::AvailableAssets;
use crate::module::Module;

/// This specifies which information is needed from an AvailabilityInfo
#[turbo_tasks::value(shared)]
#[derive(Copy, Clone, Debug)]
pub struct AvailabilityInfoNeeds {
    pub current_availability_root: bool,
    pub available_modules: bool,
}

impl AvailabilityInfoNeeds {
    pub fn all() -> Self {
        Self {
            current_availability_root: true,
            available_modules: true,
        }
    }

    pub fn none() -> Self {
        Self {
            current_availability_root: false,
            available_modules: false,
        }
    }

    pub fn is_complete(self) -> bool {
        let Self {
            current_availability_root,
            available_modules,
        } = self;
        current_availability_root && available_modules
    }
}

impl BitOr for AvailabilityInfoNeeds {
    type Output = AvailabilityInfoNeeds;

    fn bitor(mut self, rhs: Self) -> Self::Output {
        let Self {
            available_modules,
            current_availability_root,
        } = rhs;
        self.current_availability_root |= current_availability_root;
        self.available_modules |= available_modules;
        self
    }
}

impl BitOrAssign for AvailabilityInfoNeeds {
    fn bitor_assign(&mut self, rhs: Self) {
        *self = *self | rhs;
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Clone, Copy, Debug)]
pub enum AvailabilityInfo {
    /// Available modules are not tracked or the information is not available
    /// due to specified needs.
    Untracked,
    /// There are no modules available (or the information is not available due
    /// to specified needs), but it's tracked for nested chunk groups
    /// and the current chunk group root is defined.
    Root {
        current_availability_root: Vc<Box<dyn Module>>,
    },
    /// There are modules already available and the current chunk group root is
    /// defined.
    Complete {
        available_modules: Vc<AvailableAssets>,
        current_availability_root: Vc<Box<dyn Module>>,
    },
    /// Only partial information is available, about the available modules.
    OnlyAvailableModules {
        available_modules: Vc<AvailableAssets>,
    },
}

impl AvailabilityInfo {
    pub fn current_availability_root(&self) -> Option<Vc<Box<dyn Module>>> {
        match self {
            Self::Untracked => None,
            Self::Root {
                current_availability_root,
            } => Some(*current_availability_root),
            Self::Complete {
                current_availability_root,
                ..
            } => Some(*current_availability_root),
            Self::OnlyAvailableModules { .. } => None,
        }
    }

    pub fn available_modules(&self) -> Option<Vc<AvailableAssets>> {
        match self {
            Self::Untracked => None,
            Self::Root { .. } => None,
            Self::Complete {
                available_modules, ..
            } => Some(*available_modules),
            Self::OnlyAvailableModules {
                available_modules, ..
            } => Some(*available_modules),
        }
    }

    /// Returns AvailabilityInfo, but only with the information that is needed
    pub fn reduce_to_needs(self, needs: AvailabilityInfoNeeds) -> Self {
        let AvailabilityInfoNeeds {
            available_modules,
            current_availability_root,
        } = needs;
        match (current_availability_root, available_modules, self) {
            (false, false, _) => Self::Untracked,
            (true, true, _) => self,
            (
                true,
                false,
                Self::Root {
                    current_availability_root,
                }
                | Self::Complete {
                    current_availability_root,
                    ..
                },
            ) => Self::Root {
                current_availability_root,
            },
            (true, false, _) => Self::Untracked,
            (
                false,
                true,
                Self::Complete {
                    available_modules, ..
                }
                | Self::OnlyAvailableModules { available_modules },
            ) => Self::OnlyAvailableModules { available_modules },
            (false, true, _) => Self::Untracked,
        }
    }
}
