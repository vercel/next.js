use anyhow::{bail, Result};
use next_core::{
    create_page_loader_entry_asset,
    turbopack::core::{asset::AssetsVc, chunk::EvaluatableAssetsVc},
};
use turbopack_binding::{
    turbo::{tasks::primitives::StringVc, tasks_fs::FileSystemPathVc},
    turbopack::{
        core::{
            chunk::{ChunkableModule, ChunkingContext, ChunkingContextVc},
            context::{AssetContext, AssetContextVc},
            source::SourceVc,
        },
        dev::DevChunkingContextVc,
        ecmascript::EcmascriptModuleAssetVc,
    },
};

#[turbo_tasks::value]
pub(crate) struct PagesBuildClientContext {
    project_root: FileSystemPathVc,
    client_root: FileSystemPathVc,
    client_asset_context: AssetContextVc,
    client_runtime_entries: EvaluatableAssetsVc,
}

#[turbo_tasks::value_impl]
impl PagesBuildClientContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_root: FileSystemPathVc,
        client_root: FileSystemPathVc,
        client_asset_context: AssetContextVc,
        client_runtime_entries: EvaluatableAssetsVc,
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
    async fn client_chunking_context(self) -> Result<ChunkingContextVc> {
        let this = self.await?;

        Ok(DevChunkingContextVc::builder(
            this.project_root,
            this.client_root,
            this.client_root.join("static/chunks"),
            this.client_root.join("static/media"),
            this.client_asset_context.compile_time_info().environment(),
        )
        .build())
    }

    #[turbo_tasks::function]
    pub async fn client_chunk(self, source: SourceVc, pathname: StringVc) -> Result<AssetsVc> {
        let this = self.await?;

        let client_asset_page =
            create_page_loader_entry_asset(this.client_asset_context, source, pathname);

        let Some(client_module_asset) =
            EcmascriptModuleAssetVc::resolve_from(client_asset_page).await?
        else {
            bail!("Expected an EcmaScript module asset");
        };

        let client_chunking_context = self.client_chunking_context();

        Ok(client_chunking_context.evaluated_chunk_group(
            client_module_asset.as_root_chunk(client_chunking_context),
            this.client_runtime_entries
                .with_entry(client_module_asset.into()),
        ))
    }
}
