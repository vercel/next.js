use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::{
    ecmascript::chunk::EcmascriptChunkPlaceableVc,
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{asset::AssetVc, chunk::ChunkingContextVc, environment::EnvironmentVc};

use super::with_chunks::WithChunksAsset;

#[turbo_tasks::value(shared)]
pub struct NextClientChunksTransition {
    pub client_environment: EnvironmentVc,
    pub client_module_options_context: ModuleOptionsContextVc,
    pub client_resolve_options_context: ResolveOptionsContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub server_root: FileSystemPathVc,
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
