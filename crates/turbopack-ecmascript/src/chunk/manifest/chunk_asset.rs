use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkGroupVc, ChunkVc, ChunkableAsset, ChunkableAssetReference, ChunkableAssetReferenceVc,
        ChunkableAssetVc, ChunkingContextVc, ChunkingType, ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};

use super::chunk_item::ManifestChunkItem;
use crate::chunk::{
    item::EcmascriptChunkItemVc,
    placeable::{
        EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptExports,
        EcmascriptExportsVc,
    },
    EcmascriptChunkVc,
};

/// The manifest chunk is deferred until requested by the manifest loader
/// item when the dynamic `import()` expression is reached. Its responsibility
/// is to generate a Promise that will resolve only after all the necessary
/// chunks needed by the dynamic import are loaded by the client.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value(shared)]
pub struct ManifestChunkAsset {
    pub asset: ChunkableAssetVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ManifestChunkAssetVc {
    #[turbo_tasks::function]
    pub fn new(asset: ChunkableAssetVc, chunking_context: ChunkingContextVc) -> Self {
        Self::cell(ManifestChunkAsset {
            asset,
            chunking_context,
        })
    }

    #[turbo_tasks::function]
    pub(super) async fn chunk_group(self) -> Result<ChunkGroupVc> {
        let this = self.await?;
        Ok(ChunkGroupVc::from_asset(this.asset, this.chunking_context))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join("manifest-chunk.js")
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ManifestChunkAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ManifestChunkAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ManifestChunkItem {
            context,
            manifest: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value(shared)]
pub(super) struct ManifestChunkAssetReference {
    pub manifest: ManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ManifestChunkAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "referenced manifest {}",
            self.manifest.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ManifestChunkAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(self.manifest.into()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for ManifestChunkAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate))
    }
}
