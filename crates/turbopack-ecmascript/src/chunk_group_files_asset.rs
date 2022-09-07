use anyhow::{anyhow, Result};
use json::JsonValue;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContextVc, ChunksVc,
    },
    reference::AssetReferencesVc,
};

use crate::{
    chunk::{
        EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkItemContentVc, EcmascriptChunkItemVc, EcmascriptChunkPlaceable,
        EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceablesVc, EcmascriptChunkVc,
        EcmascriptExports, EcmascriptExportsVc,
    },
    EcmascriptModuleAssetVc,
};

/// An asset that exports a list of chunk URLs by putting the [asset] into a
/// ChunkGroup with the provided ChunkingContext.
#[turbo_tasks::value(shared)]
pub struct ChunkGroupFilesAsset {
    pub asset: ChunkableAssetVc,
    pub chunking_context: ChunkingContextVc,
    pub base_path: FileSystemPathVc,
    pub runtime_references: Option<AssetReferencesVc>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupFilesAssetVc {
    #[turbo_tasks::function]
    async fn chunks(self) -> Result<ChunksVc> {
        let this = self.await?;
        let runtime_entries = if let Some(runtime_references) = this.runtime_references {
            let mut runtime_entries = Vec::new();
            for asset in runtime_references
                .await?
                .iter()
                .map(|r| r.resolve_reference().primary_assets())
                .try_join()
                .await?
                .iter()
                .flat_map(|vec| vec.iter().copied())
            {
                if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                    runtime_entries.push(placeable);
                } else {
                    return Err(anyhow!(
                        "runtime reference resolved to an asset ({}) that is not placeable into \
                         an ecmascript chunk",
                        asset.path().to_string().await?
                    ));
                }
            }
            Some(EcmascriptChunkPlaceablesVc::cell(runtime_entries))
        } else {
            None
        };
        let chunk_group =
            if let Some(ecma) = EcmascriptModuleAssetVc::resolve_from(this.asset).await? {
                ChunkGroupVc::from_chunk(
                    ecma.as_evaluated_chunk(this.chunking_context, runtime_entries),
                )
            } else {
                ChunkGroupVc::from_asset(this.asset, this.chunking_context)
            };
        Ok(chunk_group.chunks())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join("client-transition.js")
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ChunkGroupFilesAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ChunkGroupFilesAssetVc,
        _context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ChunkGroupFilesChunkItem { inner: self_vc }.cell().into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkGroupFilesAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{}/client-transition.js",
            self.asset.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value]
struct ChunkGroupFilesChunkItem {
    inner: ChunkGroupFilesAssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.inner.chunks();
        let mut data = json::Array::new();
        let base_path = self.inner.await?.base_path.await?;
        for chunk in chunks.await?.iter() {
            let path = &*chunk.path().await?;
            if let Some(p) = base_path.get_path_to(path) {
                data.push(json::from(p));
            }
        }
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({:#});\n",
                JsonValue::Array(data)
            ),
            id: chunk_context.id(self.inner.into()),
            options: Default::default(),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ChunkGroupFilesChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.inner.chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(ChunkReferenceVc::new)
                .map(Into::into)
                .collect(),
        ))
    }
}
