use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::{
        chunking::{make_chunk, ChunkItemOrBatchWithInfo, SplitContext},
        ChunkItemBatchGroup, ChunkingConfig,
    },
    module_graph::ModuleGraph,
};

pub async fn make_production_chunks_keeping_order(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    _batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    _module_graph: Vc<ModuleGraph>,
    _chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let span_outer = tracing::info_span!(
        "make production chunks keeping order",
        chunk_items = chunk_items.len(),
    );
    async move {
        for chunk_item in chunk_items {
            make_chunk(
                vec![chunk_item],
                vec![],
                &mut String::new(),
                &mut split_context,
            )
            .await?;
        }

        Ok(())
    }
    .instrument(span_outer)
    .await
}
