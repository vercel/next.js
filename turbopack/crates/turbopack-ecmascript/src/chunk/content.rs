use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItems},
    output::OutputAsset,
};

use super::item::EcmascriptChunkItemWithAsyncInfo;

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemWithAsyncInfo>,
    pub referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContent {
    #[turbo_tasks::function]
    pub async fn included_chunk_items(&self) -> Result<Vc<ChunkItems>> {
        Ok(ChunkItems(
            self.chunk_items
                .iter()
                .map(|EcmascriptChunkItemWithAsyncInfo { chunk_item, .. }| chunk_item)
                .map(|item| ResolvedVc::upcast::<Box<dyn ChunkItem>>(*item))
                .collect(),
        )
        .cell())
    }
}
