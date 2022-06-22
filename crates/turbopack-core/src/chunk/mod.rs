use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
};

#[turbo_tasks::value]
pub enum ModuleId {
    Number(i32),
    String(String),
}

#[turbo_tasks::value_trait]
pub trait ChunkingContext {
    fn as_chunk_group(&self, asset: ChunkableAssetVc) -> ChunkGroupVc;
}

#[turbo_tasks::value_trait]
pub trait ChunkableAsset: Asset {
    fn as_chunk(&self, context: ChunkingContextVc) -> ChunkVc;
}

#[turbo_tasks::value]
pub struct ChunkGroup {
    entry: ChunkVc,
}

#[turbo_tasks::value(transparent)]
pub struct Chunks(Vec<ChunkVc>);

#[turbo_tasks::value_impl]
impl ChunkGroupVc {
    #[turbo_tasks::function]
    pub fn chunks(self) -> ChunksVc {
        let chunks = Vec::new();

        ChunksVc::slot(chunks)
    }
}

#[turbo_tasks::value_trait]
pub trait Chunk: Asset {}

#[turbo_tasks::value_trait]
pub trait ChunkReference: AssetReference {
    fn resolve_chunks(&self) -> ChunksVc;
}
