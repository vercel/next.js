use std::hash::BuildHasherDefault;

use anyhow::{Context, Result};
use rustc_hash::FxHasher;
use tracing::{Instrument, field::Empty};
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, MappedReadRef, ReadRef, ResolvedVc, TryJoinIterExt, Vc};

use super::merge::{GroupInput, MergeConfig, merge_grouped_chunks};
use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo,
        ChunkingConfig,
        chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    },
    module_graph::{
        ModuleGraph,
        chunk_group_info::{ModuleToChunkGroups, RoaringBitmapWrapper},
    },
};

pub async fn make_production_chunks(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    module_graph: Vc<ModuleGraph>,
    chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let span_outer = tracing::info_span!(
        "make production chunks",
        chunk_items = chunk_items.len(),
        chunks_before_limits = Empty,
        chunks = Empty,
        total_size = Empty
    );
    let span = span_outer.clone();
    async move {
        let module_chunk_groups = module_graph.chunk_group_info().module_chunk_groups();
        let merged_modules = module_graph.merged_modules().await?;

        #[derive(Default)]
        struct GroupedChunkItems<'l> {
            chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
            batch_group: Option<ResolvedVc<ChunkItemBatchGroup>>,
        }

        let mut grouped_chunk_items = FxIndexMap::<_, GroupedChunkItems<'_>>::default();

        enum Prepared {
            ChunkItem(MappedReadRef<ModuleToChunkGroups, RoaringBitmapWrapper>),
            Batch(ReadRef<ChunkItemBatchWithAsyncModuleInfo>),
            None,
        }

        // Helper Vec to keep ReadRefs on batches and allow references into them
        let prepared = chunk_items
            .iter()
            .copied()
            .map(async |item| {
                Ok(match item {
                    &ChunkItemOrBatchWithInfo::ChunkItem {
                        chunk_item:
                            ChunkItemWithAsyncModuleInfo {
                                module: Some(module),
                                ..
                            },
                        ..
                    } => Prepared::ChunkItem(
                        if let Some(module_chunk_groups) =
                            module_chunk_groups.get(&ResolvedVc::upcast(module)).await?
                        {
                            module_chunk_groups
                        } else {
                            // Merged modules don't have a chunk group in chunk_group_info, so
                            // lookup using the original module.
                            let original_module = merged_modules
                                .get_original_module(ResolvedVc::upcast(module))
                                .await?
                                .context("every module should have a chunk group")?;
                            module_chunk_groups
                                .get(&original_module)
                                .await?
                                .context("every module should have a chunk group")?
                        },
                    ),
                    &ChunkItemOrBatchWithInfo::ChunkItem {
                        chunk_item: ChunkItemWithAsyncModuleInfo { module: None, .. },
                        ..
                    } => Prepared::None,
                    ChunkItemOrBatchWithInfo::Batch { batch, .. } => Prepared::Batch(batch.await?),
                })
            })
            .try_join()
            .await?;

        // Put chunk items into `grouped_chunk_items` based on their chunk groups
        for (chunk_item, prepared) in chunk_items.into_iter().zip(prepared.iter()) {
            let chunk_groups = match prepared {
                Prepared::None => None,
                Prepared::ChunkItem(data) => Some(&**data),
                Prepared::Batch(data) => data.chunk_groups.as_ref(),
            };
            let key = BuildHasherDefault::<FxHasher>::default().prehash(chunk_groups);
            grouped_chunk_items
                .entry(key)
                .or_default()
                .chunk_items
                .push(chunk_item);
        }

        let batch_group_read_refs = batch_groups.iter().try_join().await?;

        for (batch_group, batch_group_read_ref) in
            batch_groups.into_iter().zip(batch_group_read_refs.iter())
        {
            let data = &batch_group_read_ref.chunk_groups;
            let key = BuildHasherDefault::<FxHasher>::default().prehash(Some(data));
            grouped_chunk_items.entry(key).or_default().batch_group = Some(batch_group);
        }

        let &ChunkingConfig {
            min_chunk_size,
            max_chunk_count_per_group,
            max_merge_chunk_size,
            ..
        } = chunking_config;

        if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
            span.record("chunks", grouped_chunk_items.len());
            for group in grouped_chunk_items.into_values() {
                make_chunk(
                    group.chunk_items,
                    group.batch_group.into_iter().collect(),
                    &mut String::new(),
                    &mut split_context,
                )
                .await?;
            }
        } else {
            // Collect the grouped chunk items into parallel arrays:
            // - groups_data: the chunk_items and batch_group for each group (indexed by group
            //   index)
            // - group_inputs: the GroupInput for the merge algorithm (size + bitmap)
            let mut groups_data: Vec<GroupedChunkItems<'_>> = Vec::new();
            let mut batch_group_map: Vec<Option<ResolvedVc<ChunkItemBatchGroup>>> = Vec::new();
            let mut group_inputs: Vec<GroupInput> = Vec::new();

            for (
                prehashed_key,
                GroupedChunkItems {
                    chunk_items,
                    batch_group,
                },
            ) in grouped_chunk_items.into_iter()
            {
                let size = chunk_items
                    .iter()
                    .map(|chunk_item| chunk_item.size())
                    .sum::<usize>();

                let batch_group_id = if batch_group.is_some() {
                    Some(groups_data.len())
                } else {
                    None
                };

                // Extract the inner Option<&RoaringBitmapWrapper> from PreHashed, then
                // clone the RoaringBitmap (via Deref) to produce
                // Option<Cow<'static, RoaringBitmap>>
                let (_hash, bitmap_ref) = prehashed_key.into_parts();
                let chunk_groups: Option<std::borrow::Cow<'static, roaring::RoaringBitmap>> =
                    bitmap_ref.map(|bm| std::borrow::Cow::Owned((**bm).clone()));

                group_inputs.push(GroupInput {
                    size,
                    chunk_groups,
                    batch_group_id,
                });

                batch_group_map.push(batch_group);
                groups_data.push(GroupedChunkItems {
                    chunk_items,
                    batch_group: None, // moved to batch_group_map
                });
            }

            span.record("chunks_before_limits", group_inputs.len());

            let config = MergeConfig {
                min_chunk_size,
                max_chunk_count_per_group,
                max_merge_chunk_size,
            };

            let merged = merge_grouped_chunks(group_inputs, &config);

            span.record("chunks", merged.len());

            let mut total_size = 0;
            for mut merged_group in merged {
                total_size += merged_group.total_size;

                // Collect chunk items from all merged groups
                let mut chunk_items_out: Vec<&ChunkItemOrBatchWithInfo> = Vec::new();
                let mut batch_groups_out: Vec<ResolvedVc<ChunkItemBatchGroup>> = Vec::new();

                // Sort group indices to ensure deterministic chunk item ordering.
                // Without this, the same set of modules can produce different output
                // depending on the order groups were merged during the algorithm.
                merged_group.group_indices.sort_unstable();
                merged_group.batch_group_ids.sort_unstable();

                for &group_idx in &merged_group.group_indices {
                    chunk_items_out.extend(groups_data[group_idx].chunk_items.iter());
                }

                // Collect batch groups from the merged group's batch_group_ids
                for &bg_id in &merged_group.batch_group_ids {
                    if let Some(bg) = batch_group_map[bg_id] {
                        batch_groups_out.push(bg);
                    }
                }

                make_chunk(
                    chunk_items_out,
                    batch_groups_out,
                    &mut String::new(),
                    &mut split_context,
                )
                .await?;
            }
            span.record("total_size", total_size);
        }

        Ok(())
    }
    .instrument(span_outer)
    .await
}
