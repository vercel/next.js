use anyhow::{anyhow, bail, Result};
use turbo_tasks::ValueToString;
use turbo_tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc};
use turbopack::{
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::AssetVc,
    chunk::{ChunkableAssetVc, ChunkingContextVc},
    environment::EnvironmentVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{chunk_group_files_asset::ChunkGroupFilesAsset, utils::stringify_str};

use crate::embed_js::next_js_file;

#[turbo_tasks::value(shared)]
pub struct NextEdgeTransition {
    pub edge_environment: EnvironmentVc,
    pub edge_chunking_context: ChunkingContextVc,
    pub edge_resolve_options_context: ResolveOptionsContextVc,
    pub output_path: FileSystemPathVc,
    pub base_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgeTransition {
    #[turbo_tasks::function]
    async fn process_source(&self, asset: AssetVc) -> Result<AssetVc> {
        let FileContent::Content(base) = &*next_js_file("entry/edge-bootstrap.ts").await? else {
            bail!("runtime code not found");
        };
        let mut new_content = RopeBuilder::from(
            format!(
                "const PAGE = {};\n",
                stringify_str(
                    self.base_path
                        .await?
                        .get_path_to(&*asset.path().await?)
                        .ok_or_else(|| anyhow!("asset is not in base_path"))?
                )
            )
            .into_bytes(),
        );
        new_content.concat(base.content());
        let file = File::from(new_content.build());
        Ok(VirtualAssetVc::new(
            asset.path().join("next-edge-bootstrap.ts"),
            FileContent::Content(file).cell().into(),
        )
        .into())
    }

    #[turbo_tasks::function]
    fn process_environment(&self, _environment: EnvironmentVc) -> EnvironmentVc {
        self.edge_environment
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.edge_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        _context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let chunkable_asset = match ChunkableAssetVc::resolve_from(asset).await? {
            Some(chunkable_asset) => chunkable_asset,
            None => bail!("asset {} is not chunkable", asset.path().to_string().await?),
        };

        let asset = ChunkGroupFilesAsset {
            asset: chunkable_asset,
            chunking_context: self.edge_chunking_context,
            base_path: self.output_path,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}
