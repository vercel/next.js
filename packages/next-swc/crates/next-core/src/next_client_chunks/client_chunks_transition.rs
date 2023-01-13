use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    ecmascript::chunk::EcmascriptChunkPlaceableVc,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{asset::AssetVc, chunk::ChunkingContextVc, environment::EnvironmentVc};
use turbopack_node::execution_context::ExecutionContextVc;

use super::with_chunks::WithChunksAsset;
use crate::{
    next_client::context::{
        get_client_chunking_context, get_client_environment, get_client_module_options_context,
        get_client_resolve_options_context, ClientContextType,
    },
    next_config::NextConfigVc,
};

#[turbo_tasks::value(shared)]
pub struct NextClientChunksTransition {
    pub client_environment: EnvironmentVc,
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
        server_root: FileSystemPathVc,
        browserslist_query: &str,
        next_config: NextConfigVc,
    ) -> NextClientChunksTransitionVc {
        let client_environment = get_client_environment(browserslist_query);
        let client_chunking_context =
            get_client_chunking_context(project_path, server_root, client_environment, ty);

        let client_module_options_context = get_client_module_options_context(
            project_path,
            execution_context,
            client_environment,
            ty,
            next_config,
        );
        NextClientChunksTransition {
            client_chunking_context,
            client_module_options_context,
            client_resolve_options_context: get_client_resolve_options_context(
                project_path,
                ty,
                next_config,
            ),
            client_environment,
            server_root,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextClientChunksTransition {
    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.client_environment
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
                    server_root: self.server_root,
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
