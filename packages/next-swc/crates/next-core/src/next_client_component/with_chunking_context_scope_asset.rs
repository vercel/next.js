use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbopack::ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExportsVc,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContext, ChunkingContextVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};

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
    fn as_chunk(&self, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context.with_layer(&self.layer), self.asset).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc {
        self.asset.as_chunk_item(context.with_layer(&self.layer))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        self.asset.get_exports()
    }
}
