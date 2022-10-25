use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExportsVc,
};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value(shared)]
pub struct InChunkingContextAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl Asset for InChunkingContextAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path()
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

#[turbo_tasks::value(shared)]
pub struct WithChunkingContextScopeAsset {
    pub asset: EcmascriptChunkPlaceableVc,
    pub layer: String,
}

#[turbo_tasks::value_impl]
impl Asset for WithChunkingContextScopeAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path()
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
