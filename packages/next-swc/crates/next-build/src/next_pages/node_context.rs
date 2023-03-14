use anyhow::{bail, Result};
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_build::BuildChunkingContextVc;
use turbopack_core::{
    asset::AssetVc,
    chunk::ChunkVc,
    context::{AssetContext, AssetContextVc},
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{parse::RequestVc, pattern::QueryMapVc},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceablesVc, EcmascriptModuleAssetVc};

#[turbo_tasks::value]
pub(crate) struct PagesBuildNodeContext {
    project_root: FileSystemPathVc,
    node_root: FileSystemPathVc,
    node_asset_context: AssetContextVc,
    node_runtime_entries: EcmascriptChunkPlaceablesVc,
}

#[turbo_tasks::value_impl]
impl PagesBuildNodeContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_root: FileSystemPathVc,
        node_root: FileSystemPathVc,
        node_asset_context: AssetContextVc,
        node_runtime_entries: EcmascriptChunkPlaceablesVc,
    ) -> PagesBuildNodeContextVc {
        PagesBuildNodeContext {
            project_root,
            node_root,
            node_asset_context,
            node_runtime_entries,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn resolve_module(
        self,
        origin: FileSystemPathVc,
        package: String,
        path: String,
    ) -> Result<AssetVc> {
        let this = self.await?;
        let Some(asset) = this
            .node_asset_context
            .resolve_asset(
                origin,
                RequestVc::module(package.clone(), Value::new(path.clone().into()), QueryMapVc::none()),
                this.node_asset_context.resolve_options(origin, Value::new(ReferenceType::Entry(EntryReferenceSubType::Page))),
                Value::new(ReferenceType::Entry(EntryReferenceSubType::Page))
            )
            .primary_assets()
            .await?
            .first()
            .copied()
        else {
            bail!("module {}/{} not found in {}", package, path, origin.await?);
        };
        Ok(asset)
    }

    #[turbo_tasks::function]
    async fn node_chunking_context(self, chunk_path: &str) -> Result<BuildChunkingContextVc> {
        let this = self.await?;

        Ok(BuildChunkingContextVc::builder(
            this.project_root,
            this.node_root,
            this.node_root.join("server/pages").join(chunk_path),
            this.node_root.join("server/assets").join(chunk_path),
            this.node_asset_context.compile_time_info().environment(),
        )
        .build())
    }

    #[turbo_tasks::function]
    pub async fn node_chunk(
        self,
        asset: AssetVc,
        chunk_path: &str,
        reference_type: Value<ReferenceType>,
    ) -> Result<ChunkVc> {
        let this = self.await?;

        let node_asset_page = this.node_asset_context.process(asset, reference_type);

        let Some(node_module_asset) = EcmascriptModuleAssetVc::resolve_from(node_asset_page).await? else {
            bail!("Expected an EcmaScript module asset");
        };

        let chunking_context = self.node_chunking_context(chunk_path);
        let exported_ecmascript_runtime =
            chunking_context.exported_ecmascript_runtime(node_module_asset.into());
        Ok(node_module_asset.as_chunk_with_runtime(
            chunking_context.into(),
            Some(this.node_runtime_entries),
            exported_ecmascript_runtime,
        ))
    }
}
