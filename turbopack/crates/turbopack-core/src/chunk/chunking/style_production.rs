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
                },
            )
            .await?;
        let mut handled = FxHashSet::default();
        let mut handle_chunk_item = async |chunk_item: &ChunkItemWithAsyncModuleInfo| {
            if let Some(&batch) = style_groups.shared_chunk_items.get(chunk_item) {
                if handled.insert(batch) {
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

        Ok(())
    }
    .instrument(span_outer)
    .await
}
