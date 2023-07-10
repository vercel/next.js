use anyhow::Result;
use turbopack_binding::turbopack::{
    core::{compile_time_info::CompileTimeInfoVc, module::ModuleVc},
    turbopack::{
        ecmascript::chunk::EcmascriptChunkPlaceableVc,
        module_options::ModuleOptionsContextVc,
        resolve_options_context::ResolveOptionsContextVc,
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};

use super::with_chunking_context_scope_asset::WithChunkingContextScopeAsset;

#[turbo_tasks::value(shared)]
pub struct NextSSRClientModuleTransition {
    pub ssr_environment: CompileTimeInfoVc,
    pub ssr_module_options_context: ModuleOptionsContextVc,
    pub ssr_resolve_options_context: ResolveOptionsContextVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextSSRClientModuleTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
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
        asset: ModuleVc,
        _context: ModuleAssetContextVc,
    ) -> Result<ModuleVc> {
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
