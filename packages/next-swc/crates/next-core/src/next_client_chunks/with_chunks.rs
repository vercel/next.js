use anyhow::{bail, Result};
use indoc::formatdoc;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExports, EcmascriptExportsVc,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkGroupReferenceVc, ChunkGroupVc, ChunkItem,
        ChunkItemVc, ChunkListReferenceVc, ChunkVc, ChunkableAsset, ChunkableAssetVc,
        ChunkingContextVc,
    },
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::{chunk::EcmascriptChunkingContextVc, utils::StringifyJs};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("chunks".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunksAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub server_root: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl Asset for WithChunksAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        unimplemented!()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: WithChunksAssetVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let chunk_group = self_vc.chunk_group();
        Ok(AssetReferencesVc::cell(vec![
            ChunkGroupReferenceVc::new(chunk_group).into(),
            ChunkListReferenceVc::new(this.server_root, chunk_group).into(),
        ]))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for WithChunksAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: WithChunksAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunksAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: WithChunksAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        Ok(WithChunksChunkItem {
            context,
            inner: self_vc,
        }
        .cell()
        .into())
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        // TODO This should be EsmExports
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl WithChunksAssetVc {
    #[turbo_tasks::function]
    async fn chunk_group(self) -> Result<ChunkGroupVc> {
        let this = self.await?;
        Ok(ChunkGroupVc::from_asset(
            this.asset.into(),
            this.chunking_context,
            Value::new(AvailabilityInfo::Root {
                current_availability_root: this.asset.into(),
            }),
        ))
    }
}

#[turbo_tasks::value]
struct WithChunksChunkItem {
    context: EcmascriptChunkingContextVc,
    inner: WithChunksAssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let inner = self.inner.await?;
        let Some(inner_chunking_context) = EcmascriptChunkingContextVc::resolve_from(inner.chunking_context).await? else {
            bail!("the chunking context is not an EcmascriptChunkingContextVc");
        };

        let group = self.inner.chunk_group();
        let chunks = group.chunks().await?;
        let server_root = inner.server_root.await?;
        let mut client_chunks = Vec::new();

        let chunk_list_path = group.chunk_list_path().await?;
        let chunk_list_path = if let Some(path) = server_root.get_path_to(&chunk_list_path) {
            path
        } else {
            bail!("could not get path to chunk list");
        };

        for chunk_path in chunks.iter().map(|c| c.path()).try_join().await? {
            if let Some(path) = server_root.get_path_to(&chunk_path) {
                client_chunks.push(serde_json::Value::String(path.to_string()));
            }
        }
        let module_id = &*inner
            .asset
            .as_chunk_item(inner_chunking_context)
            .id()
            .await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: formatdoc! {
                r#"
                __turbopack_esm__({{
                    default: () => {},
                    chunks: () => chunks,
                    chunkListPath: () => {},
                }});
                const chunks = {:#};
                "#,
                StringifyJs(&module_id),
                StringifyJs(&chunk_list_path),
                StringifyJs(&client_chunks),
            }
            .into(),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for WithChunksChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.inner.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.inner.references()
    }
}
