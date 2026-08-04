use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemWithAsyncModuleInfo, ChunkingConfig, ChunkingContext,
        chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    },
    module_graph::{
        ModuleGraph,
        style_groups::{StyleGroups, StyleGroupsConfig, StyleItemInfo},
    },
};

turbo_tasks::dual_fn! {
#[tracing::instrument(
    level = tracing::Level::INFO,
    skip_all,
    name = "make style production chunks",
    fields(chunk_items = chunk_items.len())
)]
pub fn make_style_production_chunks(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    _batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let style_groups = turbo_tasks::read!(module_graph.style_groups(
        *chunking_context,
        StyleGroupsConfig {
            max_chunk_size: chunking_config.max_merge_chunk_size,
            algorithm: chunking_config.style_groups_algorithm.clone(),
        },
    ))?;

    // Flatten the input to a sequence of (chunk item, info) pairs (preserving input order
    // as the tie-breaker for items without an explicit `order`), then stably sort by
    // `StyleItemInfo::order`. Each item's `StyleItemInfo` is fetched once here so the loop
    // below doesn't have to re-query the map.
    let flat_items = turbo_tasks::read!(flatten_and_sort(chunk_items, &style_groups))?;

    let mut handled = FxHashSet::default();
    for (chunk_item, info) in &flat_items {
        if let Some(info) = info
            && let Some(batch) = info.batch
        {
            if handled.insert(batch) {
                turbo_tasks::read!(make_chunk(
                    vec![&ChunkItemOrBatchWithInfo::Batch { batch, size: 0 }],
                    vec![],
                    &mut String::new(),
                    &mut split_context,
                ))?;
            }
            continue;
        }
        turbo_tasks::read!(make_chunk(
            vec![&ChunkItemOrBatchWithInfo::ChunkItem {
                chunk_item: *chunk_item,
                size: 0,
                asset_ident: rcstr!(""),
            }],
            vec![],
            &mut String::new(),
            &mut split_context,
        ))?;
    }

    Ok(())
}
}

/// Flatten input batches into a single ordered list of `(chunk_item, info)` pairs and stably
/// sort by `StyleItemInfo::order`. In practice each [`StyleGroups`] result is uniform:
/// * the loose algorithm produces all `None` orders, so the sort is a no-op and items keep their
///   input position;
/// * the graph algorithm produces all `Some(_)` orders (including for singleton chunks; see
///   [`crate::module_graph::style_groups_graph::compute_style_groups_graph`]), so the sort key
///   fully determines the final order and any missing-from-map sentinel can't slip in.
///
/// Returns the `StyleItemInfo` reference for each item so the caller can avoid re-querying
/// `style_groups.shared_chunk_items`.
#[cfg(not(feature = "sync"))]
async fn flatten_and_sort<'a>(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    style_groups: &'a StyleGroups,
) -> Result<Vec<(ChunkItemWithAsyncModuleInfo, Option<&'a StyleItemInfo>)>> {
    let mut flat_items: Vec<(ChunkItemWithAsyncModuleInfo, Option<&'a StyleItemInfo>)> =
        Vec::with_capacity(chunk_items.len());
    for chunk_item in chunk_items {
        match chunk_item {
            ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                let info = style_groups.shared_chunk_items.get(chunk_item);
                flat_items.push((*chunk_item, info));
            }
            ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                for chunk_item in &turbo_tasks::read!(batch)?.chunk_items {
                    let info = style_groups.shared_chunk_items.get(chunk_item);
                    flat_items.push((*chunk_item, info));
                }
            }
        }
    }
    flat_items.sort_by_key(|(_, info)| info.and_then(|i| i.order));
    Ok(flat_items)
}

/// Sync twin of the async `flatten_and_sort` above (hand-written dual pair because of
/// the `'a` lifetime parameter, which `dual_fn!` does not parse); body identical.
#[cfg(feature = "sync")]
fn flatten_and_sort<'a>(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    style_groups: &'a StyleGroups,
) -> Result<Vec<(ChunkItemWithAsyncModuleInfo, Option<&'a StyleItemInfo>)>> {
    let mut flat_items: Vec<(ChunkItemWithAsyncModuleInfo, Option<&'a StyleItemInfo>)> =
        Vec::with_capacity(chunk_items.len());
    for chunk_item in chunk_items {
        match chunk_item {
            ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                let info = style_groups.shared_chunk_items.get(chunk_item);
                flat_items.push((*chunk_item, info));
            }
            ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                for chunk_item in &turbo_tasks::read!(batch)?.chunk_items {
                    let info = style_groups.shared_chunk_items.get(chunk_item);
                    flat_items.push((*chunk_item, info));
                }
            }
        }
    }
    flat_items.sort_by_key(|(_, info)| info.and_then(|i| i.order));
    Ok(flat_items)
}
