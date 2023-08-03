use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{compile_time_info::CompileTimeInfo, module::Module},
    turbopack::{
        ecmascript::chunk::EcmascriptChunkPlaceable, module_options::ModuleOptionsContext,
        resolve_options_context::ResolveOptionsContext, transition::Transition, ModuleAssetContext,
    },
};

use super::with_chunking_context_scope_asset::WithChunkingContextScopeAsset;

#[turbo_tasks::value(shared)]
pub struct NextSSRClientModuleTransition {
    pub ssr_environment: Vc<CompileTimeInfo>,
    pub ssr_module_options_context: Vc<ModuleOptionsContext>,
    pub ssr_resolve_options_context: Vc<ResolveOptionsContext>,
}

#[turbo_tasks::value_impl]
impl Transition for NextSSRClientModuleTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.ssr_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        self.ssr_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.ssr_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: Vc<Box<dyn Module>>,
        _context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        Ok(
            if let Some(placeable) =
                Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(asset).await?
            {
                Vc::upcast(
                    WithChunkingContextScopeAsset {
                        asset: placeable,
                        layer: "ssr".to_string(),
                    }
                    .cell(),
                )
            } else {
                asset
            },
        )
    }
}
