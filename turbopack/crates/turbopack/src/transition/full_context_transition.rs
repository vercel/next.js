use turbo_tasks::{ResolvedVc, Vc};

use crate::{transition::Transition, ModuleAssetContext};

/// A transition that only affects the asset context.
#[turbo_tasks::value(shared)]
pub struct ContextOriginalTransition {
    module_context: ResolvedVc<ModuleAssetContext>,
}

#[turbo_tasks::value_impl]
impl ContextOriginalTransition {
    #[turbo_tasks::function]
    pub fn new(module_context: ResolvedVc<ModuleAssetContext>) -> Vc<ContextOriginalTransition> {
        ContextOriginalTransition { module_context }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for ContextOriginalTransition {
    #[turbo_tasks::function]
    fn process_context(
        &self,
        _module_asset_context: Vc<ModuleAssetContext>,
    ) -> Vc<ModuleAssetContext> {
        *self.module_context
    }
}
