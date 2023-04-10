use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_binding::{
    turbo::tasks::TryJoinIterExt,
    turbopack::{
        core::{
            asset::{Asset, AssetContentVc, AssetVc},
            chunk::{
                availability_info::AvailabilityInfo, ChunkGroupReferenceVc, ChunkGroupVc,
                ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContext,
                ChunkingContextVc,
            },
            ident::AssetIdentVc,
            reference::AssetReferencesVc,
        },
        dev::{ChunkListReferenceVc, DevChunkingContextVc},
        ecmascript::{
            chunk::{
                EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
                EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
                EcmascriptChunkVc, EcmascriptChunkingContextVc, EcmascriptExports,
                EcmascriptExportsVc,
            },
            utils::StringifyJs,
        },
    },
};
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::rope::RopeBuilder;

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("chunks".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunksAsset {
    pub asset: EcmascriptChunkPlaceableVc,
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

        let mut references = vec![ChunkGroupReferenceVc::new(chunk_group).into()];

        if let Some(context) = DevChunkingContextVc::resolve_from(this.chunking_context).await? {
            references.push(
                ChunkListReferenceVc::new(context, chunk_group.entry(), chunk_group.chunks())
                    .into(),
            );
        }

        Ok(AssetReferencesVc::cell(references))
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
        let server_root = inner_chunking_context.output_root().await?;
        let mut client_chunks = Vec::new();

        for chunk_path in chunks
            .iter()
            .map(|chunk| chunk.ident().path())
            .try_join()
            .await?
        {
            if let Some(path) = server_root.get_path_to(&chunk_path) {
                client_chunks.push(serde_json::Value::String(path.to_string()));
            }
        }
        let module_id = &*inner
            .asset
            .as_chunk_item(inner_chunking_context)
            .id()
            .await?;

        let mut code = RopeBuilder::default();

        writedoc!(
            code,
            r#"
            __turbopack_esm__({{
                default: () => {},
                chunks: () => chunks,
            "#,
            StringifyJs(&module_id),
        )?;

        if let Some(dev_chunking_context) =
            DevChunkingContextVc::resolve_from(inner.chunking_context).await?
        {
            let chunk_list_path = dev_chunking_context
                .chunk_list_path(group.entry().ident())
                .await?;
            if let Some(path) = server_root.get_path_to(&chunk_list_path) {
                writeln!(code, "    chunkListPath: () => {}", StringifyJs(&path))?;
            } else {
                bail!("could not get path to chunk list");
            }
        }

        writedoc!(
            code,
            r#"
            }});
            const chunks = {:#};
            "#,
            StringifyJs(&client_chunks),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.build(),
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
