use anyhow::Result;
use turbo_tasks::Value;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{asset::AssetVc, chunk::ChunkingContextVc, compile_time_info::CompileTimeInfoVc},
        node::execution_context::ExecutionContextVc,
        turbopack::{
            ecmascript::chunk::EcmascriptChunkPlaceableVc,
            module_options::ModuleOptionsContextVc,
            resolve_options_context::ResolveOptionsContextVc,
            transition::{Transition, TransitionVc},
            ModuleAssetContextVc,
        },
    },
};

use super::with_chunks::WithChunksAsset;
use crate::{
    mode::NextMode,
    next_client::context::{
        get_client_chunking_context, get_client_module_options_context,
        get_client_resolve_options_context, ClientContextType,
    },
    next_config::NextConfigVc,
};

#[turbo_tasks::value(shared)]
pub struct NextClientChunksTransition {
    pub client_compile_time_info: CompileTimeInfoVc,
    pub client_module_options_context: ModuleOptionsContextVc,
    pub client_resolve_options_context: ResolveOptionsContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub server_root: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl NextClientChunksTransitionVc {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPathVc,
        execution_context: ExecutionContextVc,
        ty: Value<ClientContextType>,
        mode: NextMode,
        server_root: FileSystemPathVc,
        client_compile_time_info: CompileTimeInfoVc,
        next_config: NextConfigVc,
    ) -> NextClientChunksTransitionVc {
        let client_chunking_context = get_client_chunking_context(
            project_path,
            server_root,
            client_compile_time_info.environment(),
        );

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
            server_root,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextClientChunksTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.client_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.client_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        _context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        Ok(
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                WithChunksAsset {
                    asset: placeable,
                    chunking_context: self.client_chunking_context,
                }
                .cell()
                .into()
            } else {
                asset
            },
        )
    }
}
