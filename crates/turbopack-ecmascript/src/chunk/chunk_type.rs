use anyhow::{Context, Result};
use turbo_tasks::{Value, ValueDefault, Vc};
use turbopack_core::chunk::{availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkType};

use super::{EcmascriptChunk, EcmascriptChunkPlaceable};

#[derive(Default)]
#[turbo_tasks::value]
pub struct EcmascriptChunkType {}

#[turbo_tasks::value_impl]
impl ChunkType for EcmascriptChunkType {
    #[turbo_tasks::function]
    async fn as_chunk(
        &self,
        chunk_item: Vc<Box<dyn ChunkItem>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let placeable =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(chunk_item.module())
                .await?
                .context(
                    "Module must implmement EcmascriptChunkPlaceable to be used as a EcmaScript \
                     Chunk",
                )?;
        Ok(Vc::upcast(EcmascriptChunk::new(
            chunk_item.chunking_context(),
            placeable,
            availability_info,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for EcmascriptChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
