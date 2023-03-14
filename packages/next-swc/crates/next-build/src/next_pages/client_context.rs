use anyhow::{bail, Result};
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;

use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkVc, ChunkingContextVc},
    context::{AssetContext, AssetContextVc},
    reference_type::ReferenceType,
};
use turbopack_dev::DevChunkingContextVc;
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

#[turbo_tasks::value]
pub(crate) struct PagesBuildClientContext {
    project_root: FileSystemPathVc,
    client_root: FileSystemPathVc,
    client_asset_context: AssetContextVc,
    client_runtime_entries: EcmascriptChunkPlaceablesVc,
}

#[turbo_tasks::value_impl]
impl PagesBuildClientContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_root: FileSystemPathVc,
        client_root: FileSystemPathVc,
        client_asset_context: AssetContextVc,
        client_runtime_entries: EcmascriptChunkPlaceablesVc,
    ) -> PagesBuildClientContextVc {
        PagesBuildClientContext {
            project_root,
            client_root,
            client_asset_context,
            client_runtime_entries,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn client_chunking_context(self, chunk_path: &str) -> Result<ChunkingContextVc> {
        let this = self.await?;

        Ok(DevChunkingContextVc::builder(
            this.project_root,
            this.client_root,
            this.client_root.join("static/chunks").join(chunk_path),
            this.client_root.join("static/media").join(chunk_path),
            this.client_asset_context.compile_time_info().environment(),
        )
        .build()
        .into())
    }

    #[turbo_tasks::function]
    pub async fn client_chunk(
        self,
        asset: AssetVc,
        chunk_path: &str,
        reference_type: Value<ReferenceType>,
    ) -> Result<ChunkVc> {
        let this = self.await?;

        let client_asset_page = this.client_asset_context.process(asset, reference_type);

        let Some(client_module_asset) = EcmascriptModuleAssetVc::resolve_from(client_asset_page).await? else {
            bail!("Expected an EcmaScript module asset");
        };

        Ok(client_module_asset.as_evaluated_chunk(
            self.client_chunking_context(chunk_path),
            Some(this.client_runtime_entries),
        ))
    }
}
