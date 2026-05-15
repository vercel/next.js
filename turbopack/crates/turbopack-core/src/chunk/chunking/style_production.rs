use anyhow::Result;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemWithAsyncModuleInfo, ChunkingConfig, ChunkingContext,
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
                    algorithm: chunking_config.style_groups_algorithm.clone(),
                },
            )
            .await?;

        // Flatten the input to a sequence of chunk items (preserving input order, which is the
        // tie-breaker for items without an explicit `order`).
        let mut flat_items: Vec<ChunkItemWithAsyncModuleInfo> =
            Vec::with_capacity(chunk_items.len());
        for chunk_item in chunk_items {
            match chunk_item {
                ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                    flat_items.push(chunk_item.clone());
                }
                ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                    for chunk_item in &batch.await?.chunk_items {
                        flat_items.push(chunk_item.clone());
                    }
                }
            }
        }

        // Stable sort by `order` (None keeps original input position relative to other None
        // entries). This is what the graph algorithm uses to dictate chunk order; the legacy
        // algorithm produces all `None` so the sort is a no-op for it.
        flat_items.sort_by_key(|item| {
            style_groups
                .shared_chunk_items
                .get(item)
                .and_then(|info| info.order)
        });

        let mut handled = FxHashSet::default();
        for chunk_item in &flat_items {
            if let Some(info) = style_groups.shared_chunk_items.get(chunk_item)
                && let Some(batch) = info.batch
            {
                if handled.insert(batch) {
                    make_chunk(
                        vec![&ChunkItemOrBatchWithInfo::Batch { batch, size: 0 }],
                        vec![],
                        &mut String::new(),
                        &mut split_context,
                    )
                    .await?;
                }
                continue;
            }
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

        Ok(())
    }
    .instrument(span_outer)
    .await
}
