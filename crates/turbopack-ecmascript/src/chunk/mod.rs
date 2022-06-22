pub mod loader;

use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{Chunk, ChunkVc, ChunkingContextVc, ModuleIdVc},
    reference::AssetReferenceVc,
};

#[turbo_tasks::value(Chunk, Asset)]
pub struct EcmascriptChunk {
    entry: EcmascriptChunkPlaceableVc,
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        todo!()
    }
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkContext {
    fn id(&self, asset: AssetVc) -> ModuleIdVc;
    fn chunking_context(&self) -> ChunkingContextVc;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable {
    fn as_chunk_item(&self, context: EcmascriptChunkContextVc) -> EcmascriptChunkItemVc;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: Asset {}
