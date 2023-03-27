use anyhow::{Context, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbopack::ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExportsVc,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkVc, ChunkableAsset, ChunkableAssetVc,
        ChunkingContext, ChunkingContextVc,
    },
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::EcmascriptChunkingContextVc;

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("with chunking context scope".to_string())
}

#[turbo_tasks::value(shared)]
pub struct WithChunkingContextScopeAsset {
    pub asset: EcmascriptChunkPlaceableVc,
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
    fn as_chunk(
        &self,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context.with_layer(&self.layer),
            self.asset,
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        &self,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        Ok(self.asset.as_chunk_item(
            EcmascriptChunkingContextVc::resolve_from(context.with_layer(&self.layer))
                .await?
                .context(
                    "ChunkingContextVc::with_layer should not return a different kind of chunking \
                     context",
                )?,
        ))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        self.asset.get_exports()
    }
}
