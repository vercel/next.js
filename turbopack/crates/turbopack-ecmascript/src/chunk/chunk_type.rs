use anyhow::{bail, Result};
use turbo_tasks::{RcStr, TryJoinIterExt, ValueDefault, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingContext,
    },
    output::OutputAssets,
};

use super::{EcmascriptChunk, EcmascriptChunkContent, EcmascriptChunkItem};

#[turbo_tasks::value]
#[derive(Default)]
pub struct EcmascriptChunkType {}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("ecmascript".into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkType for EcmascriptChunkType {
    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
        referenced_output_assets: Vc<OutputAssets>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let Some(chunking_context) =
            Vc::try_resolve_downcast::<Box<dyn ChunkingContext>>(chunking_context).await?
        else {
            bail!("Ecmascript chunking context not found");
        };
        let content = EcmascriptChunkContent {
            chunk_items: chunk_items
                .iter()
                .map(|(chunk_item, async_info)| async move {
                    let Some(chunk_item) =
                        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(*chunk_item)
                            .await?
                    else {
                        bail!(
                            "Chunk item is not an ecmascript chunk item but reporting chunk type \
                             ecmascript"
                        );
                    };
                    Ok((chunk_item, *async_info))
                })
                .try_join()
                .await?,
            referenced_output_assets: referenced_output_assets.await?.clone_value(),
        }
        .cell();
        Ok(Vc::upcast(EcmascriptChunk::new(chunking_context, content)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: Vc<Box<dyn ChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let Some(chunk_item) =
            Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkItem>>(chunk_item).await?
        else {
            bail!("Chunk item is not an ecmascript chunk item but reporting chunk type ecmascript");
        };
        Ok(Vc::cell(
            chunk_item
                .content_with_async_module_info(async_module_info)
                .await
                .map_or(0, |content| content.inner_code.len()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
