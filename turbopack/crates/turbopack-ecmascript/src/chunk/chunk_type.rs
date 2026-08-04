use anyhow::{Result, bail};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, ValueDefault, ValueToString, Vc};
use turbopack_core::chunk::{
    AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo,
    ChunkType, ChunkingContext, round_chunk_item_size,
};

use super::{EcmascriptChunk, EcmascriptChunkContent, EcmascriptChunkItem};
use crate::chunk::batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo};

#[turbo_tasks::value]
#[derive(Default, ValueToString)]
#[value_to_string("ecmascript")]
pub struct EcmascriptChunkType {}

#[turbo_tasks::value_impl]
impl ChunkType for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn is_style(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(false)
    }

    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
        batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        // The sync `parallel!` only fans out plain `Vc` reads, so the per-item work
        // runs concurrently in the async build (as before) and sequentially under
        // `sync`.
        #[cfg(not(feature = "sync"))]
        let (chunk_items, batch_groups) = (
            chunk_items
                .iter()
                .map(EcmascriptChunkItemOrBatchWithAsyncInfo::from_chunk_item_or_batch)
                .try_join()
                .await?,
            batch_groups
                .into_iter()
                .map(|batch_group| {
                    EcmascriptChunkItemBatchGroup::from_chunk_item_batch_group(*batch_group)
                        .to_resolved()
                })
                .try_join()
                .await?,
        );
        #[cfg(feature = "sync")]
        let (chunk_items, batch_groups) = {
            let mut items = Vec::with_capacity(chunk_items.len());
            for item in chunk_items.iter() {
                items
                    .push(EcmascriptChunkItemOrBatchWithAsyncInfo::from_chunk_item_or_batch(item)?);
            }
            let mut groups = Vec::with_capacity(batch_groups.len());
            for batch_group in batch_groups.into_iter() {
                groups.push(turbo_tasks::read!(
                    EcmascriptChunkItemBatchGroup::from_chunk_item_batch_group(*batch_group)
                        .to_resolved()
                )?);
            }
            (items, groups)
        };
        let content = EcmascriptChunkContent {
            chunk_items,
            batch_groups,
        }
        .cell();
        Ok(Vc::upcast(EcmascriptChunk::new(chunking_context, content)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let Some(chunk_item) = ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkItem>>(chunk_item)
        else {
            bail!("Chunk item is not an ecmascript chunk item but reporting chunk type ecmascript");
        };
        let chunk_item = turbo_tasks::read!(chunk_item.into_trait_ref())?;
        let size = match turbo_tasks::read!(
            chunk_item.content_with_async_module_info(async_module_info, true)
        ) {
            Ok(content) => {
                let content = turbo_tasks::read!(content)?;
                round_chunk_item_size(content.inner_code.len())
            }
            Err(_) => 0,
        };
        Ok(Vc::cell(size))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
