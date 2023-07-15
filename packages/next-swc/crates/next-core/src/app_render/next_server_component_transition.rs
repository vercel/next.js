use anyhow::{bail, Result};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{compile_time_info::CompileTimeInfo, module::Module},
        ecmascript::chunk::EcmascriptChunkPlaceable,
        turbopack::{
            module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
            transition::Transition, ModuleAssetContext,
        },
    },
};

use crate::next_client_component::{
    with_chunking_context_scope_asset::WithChunkingContextScopeAsset,
    with_client_chunks::WithClientChunksAsset,
};

#[turbo_tasks::value(shared)]
pub struct NextServerComponentTransition {
    pub rsc_compile_time_info: Vc<CompileTimeInfo>,
    pub rsc_module_options_context: Vc<ModuleOptionsContext>,
    pub rsc_resolve_options_context: Vc<ResolveOptionsContext>,
    pub server_root: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl Transition for NextServerComponentTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.rsc_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        self.rsc_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.rsc_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        module: Vc<Box<dyn Module>>,
        _context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let Some(asset) = Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await? else {
            bail!("Not an ecmascript module");
        };

        Ok(WithChunkingContextScopeAsset {
            asset: WithClientChunksAsset {
                asset,
                // next.js code already adds _next prefix
                server_root: self.server_root.join("_next"),
            }
            .cell()
            .into(),
            layer: "rsc".to_string(),
        }
        .cell()
        .into())
    }
}
