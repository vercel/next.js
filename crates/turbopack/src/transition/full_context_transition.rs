use anyhow::Result;
use turbo_tasks::Vc;

use crate::{transition::Transition, ModuleAssetContext};

/// A transition that only affects the asset context.
#[turbo_tasks::value(shared)]
pub struct FullContextTransition {
    module_context: Vc<ModuleAssetContext>,
}

#[turbo_tasks::value_impl]
impl FullContextTransition {
    #[turbo_tasks::function]
    pub async fn new(module_context: Vc<ModuleAssetContext>) -> Result<Vc<FullContextTransition>> {
        Ok(FullContextTransition { module_context }.cell())
    }
}

#[turbo_tasks::value_impl]
impl Transition for FullContextTransition {
    #[turbo_tasks::function]
    fn process_context(
        &self,
        _module_asset_context: Vc<ModuleAssetContext>,
    ) -> Vc<ModuleAssetContext> {
        self.module_context
    }
}
