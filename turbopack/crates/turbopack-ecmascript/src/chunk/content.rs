use std::future::IntoFuture;

use anyhow::Result;
use either::Either;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::chunk::{ChunkItem, ChunkItems, batch_info};

use crate::chunk::{
    CodeModuleIdsAndPaths,
    batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
    batch_group_code_module_ids_and_paths, item_code_module_ids_and_paths,
};

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemOrBatchWithAsyncInfo>,
    pub batch_groups: Vec<ResolvedVc<EcmascriptChunkItemBatchGroup>>,
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

impl EcmascriptChunkContent {
    pub async fn chunk_item_code_module_ids_and_paths(
        &self,
    ) -> Result<Vec<ReadRef<CodeModuleIdsAndPaths>>> {
        batch_info(
            &self.batch_groups,
            &self.chunk_items,
            |batch| batch_group_code_module_ids_and_paths(batch).into_future(),
            |item| item_code_module_ids_and_paths(item.clone()).into_future(),
        )
        .await
    }
}
