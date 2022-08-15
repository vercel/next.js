use std::collections::HashMap;

use crate::{asset::AssetVc, environment::EnvironmentVc};

/// Some kind of operation that is executed during reference processing. e. g.
/// you can transition to a different environment on a specific import
/// (reference).
#[turbo_tasks::value_trait]
pub trait Transition {
    /// Apply modifications/wrapping to the source asset
    fn process_source(&self, asset: AssetVc) -> AssetVc {
        asset
    }
    /// Apply modifications to the environment
    fn process_environment(&self, environment: EnvironmentVc) -> EnvironmentVc {
        environment
    }
    /// Apply modifications/wrapping to the final asset
    fn process_module(&self, asset: AssetVc) -> AssetVc {
        asset
    }
}

#[turbo_tasks::value(transparent)]
pub struct TransitionsByName(HashMap<String, TransitionVc>);
