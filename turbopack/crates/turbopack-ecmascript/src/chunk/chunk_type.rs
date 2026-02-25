use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup,
        ChunkItemOrBatchWithAsyncModuleInfo, ChunkType, ChunkingContext, round_chunk_item_size,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAssets, OutputAssetsWithReferenced},
};

use super::{EcmascriptChunk, EcmascriptChunkContent};
use crate::chunk::{
    batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
    placeable::EcmascriptChunkPlaceable,
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

    fn accepts_module(&self, module: ResolvedVc<Box<dyn Module>>) -> bool {
        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).is_some()
    }

    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
        batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
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
        Ok(Vc::upcast(EcmascriptChunk::new(chunking_context, content)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: Vc<ChunkItem>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let chunk_item = chunk_item.await?;
        let module = chunk_item.module;
        let Some(module) = ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module)
        else {
            bail!("Chunk item is not an ecmascript chunk item but reporting chunk type ecmascript");
        };
        let content = module
            .chunk_item_content(
                *chunk_item.chunking_context,
                *chunk_item.module_graph,
                async_module_info,
                true,
            )
            .await;
        Ok(Vc::cell(content.map_or(0, |content| {
            round_chunk_item_size(content.inner_code.len())
        })))
    }

    #[turbo_tasks::function]
    fn chunk_item_content_ident(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<AssetIdent> {
        if let Some(placeable) =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
        {
            placeable.chunk_item_content_ident(chunking_context, module_graph)
        } else {
            module.ident()
        }
    }

    #[turbo_tasks::function]
    fn chunk_item_output_assets(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<OutputAssetsWithReferenced> {
        if let Some(placeable) =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module)
        {
            placeable.chunk_item_output_assets(chunking_context, module_graph)
        } else {
            OutputAssetsWithReferenced::from_assets(*OutputAssets::empty_resolved())
        }
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
