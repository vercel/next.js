use anyhow::{Context, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContentVc, AssetVc},
        chunk::{
            availability_info::AvailabilityInfo, ChunkVc, ChunkableAsset, ChunkableAssetVc,
            ChunkingContext, ChunkingContextVc,
        },
        ident::AssetIdentVc,
        reference::AssetReferencesVc,
    },
    ecmascript::chunk::EcmascriptChunkingContextVc,
    turbopack::ecmascript::chunk::{
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExportsVc,
    },
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("with chunking context scope".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunkingContextScopeAsset {
    pub asset: ChunkableAssetVc,
    pub layer: String,
}

#[turbo_tasks::value_impl]
impl Asset for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.asset.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.asset.references()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        &self,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        Ok(self.asset.as_chunk_item(context.with_layer(&self.layer)))
    }
}
