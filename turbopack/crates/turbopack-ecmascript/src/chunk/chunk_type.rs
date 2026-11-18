use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_core::chunk::{
    AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo,
    ChunkType, ChunkingContext, MinifyType, round_chunk_item_size,
};

use super::{ChunkMinification, EcmascriptChunk, EcmascriptChunkContent, EcmascriptChunkItem};
use crate::chunk::{
    batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
    item::{ChunkItemFactoryContent, chunk_item_factory_content},
};

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
        let minify = ChunkMinification::for_chunking_context(chunking_context)
            .await?
            .per_item();
        // Asked the same way as code generation does (see the chunk content implementations),
        // so both share one minification.
        let source_maps = match minify {
            MinifyType::Minify { .. } => match chunking_context.emitted_source_map_type().await {
                Ok(ty) => ty.is_some(),
                Err(_) => return Ok(Vc::cell(0)),
            },
            MinifyType::NoMinify => false,
        };
        Ok(Vc::cell(
            rounded_chunk_item_size(
                ecmascript_chunk_item,
                async_module_info,
                minify,
                source_maps,
            )
            .await,
        ))
    }
}

/// [`estimated_chunk_item_size`], rounded for chunking. An item whose content failed to generate
/// counts as empty, without reporting the error: code generation reports it, see
/// `chunk_item_factory_content`.
pub(crate) async fn rounded_chunk_item_size(
    chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    async_module_info: Option<Vc<AsyncModuleInfo>>,
    minify: MinifyType,
    source_maps: bool,
) -> usize {
    estimated_chunk_item_size(chunk_item, async_module_info, minify, source_maps)
        .await
        .map_or(0, round_chunk_item_size)
}

/// The size of a chunk item as it goes into a chunk (see [`chunk_item_factory_content`]), before
/// rounding: its minified factory when chunk items are minified one by one, its raw code
/// otherwise. Fails if the content failed to generate.
pub(crate) async fn estimated_chunk_item_size(
    chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    async_module_info: Option<Vc<AsyncModuleInfo>>,
    minify: MinifyType,
    source_maps: bool,
) -> Result<usize> {
    Ok(
        match chunk_item_factory_content(chunk_item, async_module_info, true, minify, source_maps)
            .await?
        {
            // When chunk items are minified one by one, the chunk is made of the minified
            // factories, so size them as such. This minifies every item before chunking, but the
            // result is shared with code generation (see `minified_module_factory`), so the work
            // isn't repeated.
            ChunkItemFactoryContent::Minified { factory, .. } => factory.await?.source_code().len(),
            ChunkItemFactoryContent::Unminified(content) => content.await?.inner_code.len(),
        },
    )
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
