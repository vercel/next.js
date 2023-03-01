use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbopack::ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExportsVc,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("in chunking context".to_string())
}

#[turbo_tasks::value(shared)]
pub struct InChunkingContextAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl Asset for InChunkingContextAsset {
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
impl ChunkableAsset for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn as_chunk(&self, _context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(self.chunking_context, self.asset).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(&self, _context: ChunkingContextVc) -> EcmascriptChunkItemVc {
        self.asset.as_chunk_item(self.chunking_context)
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        self.asset.get_exports()
    }
}
