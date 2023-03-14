use anyhow::{bail, Result};
use next_core::{
    create_page_loader_entry_asset,
    turbopack::core::{
        asset::AssetsVc,
        chunk::{ChunkableAsset, ChunkingContext, EvaluatableAssetsVc},
    },
};
use turbo_binding::{
    turbo::{
        tasks::{primitives::StringVc, Value},
        tasks_fs::FileSystemPathVc,
    },
    turbopack::{
        core::{
            asset::AssetVc,
            chunk::{ChunkVc, ChunkingContextVc},
            context::{AssetContext, AssetContextVc},
            reference_type::ReferenceType,
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
    async fn client_chunking_context(self, pathname: StringVc) -> Result<ChunkingContextVc> {
        let this = self.await?;

        let pathname = pathname.await?;
        Ok(DevChunkingContextVc::builder(
            this.project_root,
            this.client_root,
            this.client_root.join("static/chunks").join(&*pathname),
            this.client_root.join("static/media").join(&*pathname),
            this.client_asset_context.compile_time_info().environment(),
        )
        .build()
        .into())
    }

    #[turbo_tasks::function]
    pub async fn client_chunk(
        self,
        asset: AssetVc,
        pathname: StringVc,
        reference_type: Value<ReferenceType>,
    ) -> Result<AssetsVc> {
        let this = self.await?;

        let client_asset_page = this.client_asset_context.process(asset, reference_type);
        let client_asset_page =
            create_page_loader_entry_asset(this.client_asset_context, client_asset_page, pathname);

        let Some(client_module_asset) = EcmascriptModuleAssetVc::resolve_from(client_asset_page).await? else {
            bail!("Expected an EcmaScript module asset");
        };

        let client_chunking_context = self.client_chunking_context(pathname);

        Ok(client_chunking_context.evaluated_chunk_group(
            client_module_asset.as_root_chunk(client_chunking_context),
            this.client_runtime_entries
                .with_entry(client_module_asset.into()),
        ))
    }
}
