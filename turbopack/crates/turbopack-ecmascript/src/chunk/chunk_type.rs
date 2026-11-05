use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_core::chunk::{
    AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo,
    ChunkType, ChunkingContext, round_chunk_item_size,
};

use super::{
    ChunkMinification, EcmascriptChunk, EcmascriptChunkContent, EcmascriptChunkItem,
    minified_module_factory,
};
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
        component_chunks: Vec<ResolvedVc<Box<dyn Chunk>>>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let content = EcmascriptChunkContent {
            chunk_items: chunk_items
                .iter()
                .map(EcmascriptChunkItemOrBatchWithAsyncInfo::from_chunk_item_or_batch)
                .try_join()
                .await?,
            batch_groups: batch_groups
                .into_iter()
                .map(|batch_group| {
                    EcmascriptChunkItemBatchGroup::from_chunk_item_batch_group(*batch_group)
                        .to_resolved()
                })
                .try_join()
                .await?,
        }
        .cell();
        Ok(Vc::upcast(EcmascriptChunk::new(
            chunking_context,
            content,
            ResolvedVc::deref_vec(component_chunks),
        )))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let Some(ecmascript_chunk_item) =
            ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkItem>>(chunk_item)
        else {
            bail!("Chunk item is not an ecmascript chunk item but reporting chunk type ecmascript");
        };
        let minification = ChunkMinification::for_chunking_context(chunking_context).await?;
        let size = async {
            let content = ecmascript_chunk_item
                .into_trait_ref()
                .await?
                .content_with_async_module_info(async_module_info, true)
                .await?;
            anyhow::Ok(match minification {
                // When chunk items are minified one by one, the chunk is made of the minified
                // factories, so size them as such. This minifies every item before chunking, but
                // the result is shared with code generation (see `minified_module_factory`), so
                // the work isn't repeated.
                ChunkMinification::PerItem { mangle } => {
                    // Code generation asks for source maps per chunk. Both chunking contexts answer
                    // the same for every chunk and module; if that ever changes, this only costs a
                    // second minification, since source maps don't change the minified code.
                    let source_maps = *chunking_context
                        .reference_module_source_maps(chunk_item.module())
                        .await?;
                    let code =
                        minified_module_factory(content, source_maps, mangle.is_some()).await?;
                    code.source_code().len()
                }
                ChunkMinification::None | ChunkMinification::WholeChunk { .. } => {
                    content.await?.inner_code.len()
                }
            })
        }
        .await;
        Ok(Vc::cell(size.map_or(0, round_chunk_item_size)))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
