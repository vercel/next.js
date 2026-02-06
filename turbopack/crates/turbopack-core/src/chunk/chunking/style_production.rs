use anyhow::Result;
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo,
        ChunkingConfig, ChunkingContext,
        chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    },
    module_graph::{ModuleGraph, style_groups::StyleGroupsConfig},
};

pub async fn make_style_production_chunks(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    _batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let span_outer = tracing::info_span!(
        "make style production chunks",
        chunk_items = chunk_items.len(),
    );
    async move {
        let style_groups = module_graph
            .style_groups(
                *chunking_context,
                StyleGroupsConfig {
                    max_chunk_size: chunking_config.max_merge_chunk_size,
                },
            )
            .await?;

        // `style_groups` has computed a set of shared batches from the chunk_items. We need to
        // create chunks for those while respecting dependency ordering.
        // The input `chunk_items` is already in dependency order based on a DFS post-order
        // traversal of the module graph. However, this is a partial order and style_groups takes
        // advantage of that to produce shared batches. To ensure we produce chunks in a valid
        // order, we emit a shared batch only after we've seen all its members in the input.
        // We track how many items remain for each batch and emit when the count reaches zero.

        // Track remaining items for each batch (initialized with batch sizes, decremented as we go)
        let mut batch_remaining: FxHashMap<ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>, usize> =
            FxHashMap::default();
        for (_, &batch) in &style_groups.shared_chunk_items {
            *batch_remaining.entry(batch).or_default() += 1;
        }

        // Process a single chunk item, emitting chunks as needed
        let mut handle_chunk_item = async |chunk_item: &ChunkItemWithAsyncModuleInfo| {
            if let Some(&batch) = style_groups.shared_chunk_items.get(chunk_item) {
                let remaining = batch_remaining.get_mut(&batch).unwrap();
                *remaining -= 1;

                // Emit batch chunk when we've seen all its items
                if *remaining == 0 {
                    make_chunk(
                        vec![&ChunkItemOrBatchWithInfo::Batch { batch, size: 0 }],
                        vec![],
                        &mut String::new(),
                        &mut split_context,
                    )
                    .await?;
                }
            } else {
                make_chunk(
                    vec![&ChunkItemOrBatchWithInfo::ChunkItem {
                        chunk_item: chunk_item.clone(),
                        size: 0,
                        asset_ident: rcstr!(""),
                    }],
                    vec![],
                    &mut String::new(),
                    &mut split_context,
                )
                .await?;
            }
            anyhow::Ok(())
        };
        for chunk_item in chunk_items {
            match chunk_item {
                ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                    handle_chunk_item(chunk_item).await?;
                }
                ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                    for chunk_item in &batch.await?.chunk_items {
                        handle_chunk_item(chunk_item).await?;
                    }
                }
            };
        }

        debug_assert!(
            batch_remaining.values().all(|&count| count == 0),
            "Not all batch items were seen in chunk_items"
        );

        Ok(())
    }
    .instrument(span_outer)
    .await
}
