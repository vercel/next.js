use anyhow::Result;
use either::Either;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItems},
    output::OutputAsset,
};

use crate::chunk::batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo};

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemOrBatchWithAsyncInfo>,
    pub batch_groups: Vec<ResolvedVc<EcmascriptChunkItemBatchGroup>>,
    pub referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContent {
    #[turbo_tasks::function]
    pub async fn included_chunk_items(&self) -> Result<Vc<ChunkItems>> {
        Ok(ChunkItems(
            self.chunk_items
                .iter()
                .map(async |item| match item {
                    EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                        Ok(Either::Left(item.chunk_item))
                    }
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        Ok(Either::Right(batch.await?))
                    }
                })
                .try_join()
                .await?
                .iter()
                .flat_map(|item| match item {
                    Either::Left(item) => Either::Left(std::iter::once(*item)),
                    Either::Right(batch) => {
                        Either::Right(batch.chunk_items.iter().map(|item| item.chunk_item))
                    }
                })
                .map(ResolvedVc::upcast::<Box<dyn ChunkItem>>)
                .collect(),
        )
        .cell())
    }
}
