use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{compile_time_info::CompileTimeInfo, module::Module},
        ecmascript::chunk::EcmascriptChunkingContext,
        node::execution_context::ExecutionContext,
        turbopack::{
            ecmascript::chunk::EcmascriptChunkPlaceable, module_options::ModuleOptionsContext,
            resolve_options_context::ResolveOptionsContext, transition::Transition,
            ModuleAssetContext,
        },
    },
};

use super::with_chunks::WithChunksAsset;
use crate::{
    mode::NextMode,
    next_client::context::{
        get_client_module_options_context, get_client_resolve_options_context, ClientContextType,
    },
    next_config::NextConfig,
};

#[turbo_tasks::value(shared)]
pub struct NextClientChunksTransition {
    pub client_compile_time_info: Vc<CompileTimeInfo>,
    pub client_module_options_context: Vc<ModuleOptionsContext>,
    pub client_resolve_options_context: Vc<ResolveOptionsContext>,
    pub client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl NextClientChunksTransition {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        execution_context: Vc<ExecutionContext>,
        ty: Value<ClientContextType>,
        mode: NextMode,
        client_chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
        client_compile_time_info: Vc<CompileTimeInfo>,
        next_config: Vc<NextConfig>,
    ) -> Vc<NextClientChunksTransition> {
        let client_module_options_context = get_client_module_options_context(
            project_path,
            execution_context,
            client_compile_time_info.environment(),
            ty,
            mode,
            next_config,
        );
        NextClientChunksTransition {
            client_chunking_context,
            client_module_options_context,
            client_resolve_options_context: get_client_resolve_options_context(
                project_path,
                ty,
                mode,
                next_config,
                execution_context,
            ),
            client_compile_time_info,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextClientChunksTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.client_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.client_resolve_options_context
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
                Vc::upcast(WithChunksAsset::new(
                    placeable,
                    self.client_chunking_context,
                ))
            } else {
                asset
            },
        )
    }
}
