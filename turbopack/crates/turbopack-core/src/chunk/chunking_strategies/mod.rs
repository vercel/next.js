use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;

use super::{ChunkItemsWithAsyncModuleInfo, ChunkingContext, Chunks};
use crate::output::OutputAssets;

pub mod simple;

#[turbo_tasks::value_trait]
pub trait ChunkingStrategy {
    async fn make_chunks(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vc<ChunkItemsWithAsyncModuleInfo>,
        key_prefix: RcStr,
        referenced_output_assets: Vc<OutputAssets>,
    ) -> Result<Vc<Chunks>>;
}
