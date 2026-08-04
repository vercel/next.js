use std::future::IntoFuture;

use anyhow::Result;
use either::Either;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
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
        // The sync `parallel!` only fans out plain `Vc` reads, so the per-item batch
        // reads run concurrently in the async build (as before) and sequentially under
        // `sync`.
        #[cfg(not(feature = "sync"))]
        let items = self
            .chunk_items
            .iter()
            .map(async |item| match item {
                EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                    Ok(Either::Left(item.chunk_item))
                }
                EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                    Ok(Either::Right(turbo_tasks::read!(batch)?))
                }
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let items = {
            let mut items = Vec::with_capacity(self.chunk_items.len());
            for item in self.chunk_items.iter() {
                items.push(match item {
                    EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                        Either::Left(item.chunk_item)
                    }
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        Either::Right(turbo_tasks::read!(batch)?)
                    }
                });
            }
            items
        };
        Ok(ChunkItems(
            items
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
    turbo_tasks::dual_fn! {
    pub fn chunk_item_code_module_ids_and_paths(
        &self,
    ) -> Result<Vec<ReadRef<CodeModuleIdsAndPaths>>> {
        // Sync: prewarm per-top-level-item codegen concurrently so that multiple batches
        // (and non-batched items) generate in parallel; `item_code_module_ids_and_paths`
        // for a batch additionally fans out its own modules. `batch_info` below then reads
        // cached results. `sync_parallel_map` forces the fan-out (the `parallel!` gate
        // would serialize here — sibling workers are typically `managed_block`ed, not
        // sleeping). The async `batch_info` is already concurrent.
        #[cfg(feature = "sync")]
        {
            let items: Vec<_> = self.chunk_items.clone();
            turbo_tasks::sync_parallel_map(items, |item| {
                turbo_tasks::read!(item_code_module_ids_and_paths(item)).map(|_| ())
            })
            .into_iter()
            .collect::<Result<Vec<()>>>()?;
        }
        turbo_tasks::read!(batch_info(
            &self.batch_groups,
            &self.chunk_items,
            |batch| batch_group_code_module_ids_and_paths(batch).into_future(),
            |item| item_code_module_ids_and_paths(item.clone()).into_future(),
        ))
    }
    }
}
