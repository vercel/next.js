use anyhow::Result;
use turbopack::{
    ecmascript::chunk::EcmascriptChunkPlaceableVc,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{asset::AssetVc, environment::EnvironmentVc};

use super::in_chunking_context_asset::WithChunkingContextScopeAsset;

#[turbo_tasks::value(shared)]
pub struct NextSSRClientModuleTransition {
    pub ssr_environment: EnvironmentVc,
    pub ssr_module_options_context: ModuleOptionsContextVc,
    pub ssr_resolve_options_context: ResolveOptionsContextVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextSSRClientModuleTransition {
    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.ssr_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.ssr_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.ssr_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        _context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        Ok(
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                WithChunkingContextScopeAsset {
                    asset: placeable,
                    layer: "ssr".to_string(),
                }
                .cell()
                .into()
            } else {
                asset
            },
        )
    }
}
