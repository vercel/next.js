use anyhow::{bail, Result};
use next_core::{next_client::RuntimeEntriesVc, turbopack::core::chunk::EvaluatableAssetsVc};
use turbo_tasks::primitives::StringVc;
use turbopack_binding::{
    turbo::{tasks::Value, tasks_fs::FileSystemPathVc},
    turbopack::{
        build::BuildChunkingContextVc,
        core::{
            asset::AssetVc,
            context::{AssetContext, AssetContextVc},
            reference_type::{EntryReferenceSubType, ReferenceType},
            resolve::{parse::RequestVc, pattern::QueryMapVc},
        },
        ecmascript::chunk::EcmascriptChunkPlaceableVc,
    },
};

#[turbo_tasks::value]
pub(crate) struct PagesBuildNodeContext {
    project_root: FileSystemPathVc,
    node_root: FileSystemPathVc,
    node_asset_context: AssetContextVc,
    node_runtime_entries: EvaluatableAssetsVc,
}

#[turbo_tasks::value_impl]
impl PagesBuildNodeContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_root: FileSystemPathVc,
        node_root: FileSystemPathVc,
        node_asset_context: AssetContextVc,
        node_runtime_entries: RuntimeEntriesVc,
    ) -> PagesBuildNodeContextVc {
        PagesBuildNodeContext {
            project_root,
            node_root,
            node_asset_context,
            node_runtime_entries: node_runtime_entries.resolve_entries(node_asset_context),
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
    async fn node_chunking_context(self) -> Result<BuildChunkingContextVc> {
        let this = self.await?;

        Ok(BuildChunkingContextVc::builder(
            this.project_root,
            this.node_root,
            this.node_root.join("server/pages"),
            this.node_root.join("server/assets"),
            this.node_asset_context.compile_time_info().environment(),
        )
        .build())
    }

    #[turbo_tasks::function]
    pub async fn node_chunk(
        self,
        asset: AssetVc,
        pathname: StringVc,
        reference_type: Value<ReferenceType>,
    ) -> Result<AssetVc> {
        let this = self.await?;

        let node_asset_page = this.node_asset_context.process(asset, reference_type);

        let Some(node_module_asset) = EcmascriptChunkPlaceableVc::resolve_from(node_asset_page).await? else {
            bail!("Expected an EcmaScript module asset");
        };

        let pathname = pathname.await?;

        let chunking_context = self.node_chunking_context();
        Ok(chunking_context.generate_entry_chunk(
            this.node_root.join(&format!("server/pages/{pathname}.js")),
            node_module_asset,
            this.node_runtime_entries,
        ))
    }
}
