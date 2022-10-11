use std::collections::HashMap;

use turbopack_core::{asset::AssetVc, environment::EnvironmentVc};

use crate::{
    module_options::ModuleOptionsContextVc, resolve_options_context::ResolveOptionsContextVc,
    ModuleAssetContextVc,
};

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
    /// Apply modifications/wrapping to the module options context
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        context
    }
    /// Apply modifications/wrapping to the resolve options context
    fn process_resolve_options_context(
        &self,
        context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        context
    }
    /// Apply modifications/wrapping to the final asset
    fn process_module(&self, asset: AssetVc, _context: ModuleAssetContextVc) -> AssetVc {
        asset
    }
}

#[turbo_tasks::value(transparent)]
pub struct TransitionsByName(HashMap<String, TransitionVc>);
