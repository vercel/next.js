use std::{borrow::Cow, hash::BuildHasherDefault};

use anyhow::{Context, Result};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use tracing::{Instrument, field::Empty};
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, FxIndexSet, MappedReadRef, ReadRef, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo,
        ChunkingConfig,
        chunking::{
            ChunkItemOrBatchWithInfo, ComponentChunkItems, SplitContext, make_chunk,
            merge::{MergeInput, MergeOutcome, MergedChunk, merge_chunks},
        },
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
        merge_iterations = Empty,
        chunks = Empty,
        total_size = Empty
    );
    let span = span_outer.clone();
    async move {
        let module_chunk_groups = module_graph.chunk_group_info().module_chunk_groups();
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let heuristics = &chunk_group_info.chunking_heuristics;
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
            generate_component_chunks,
            min_component_chunk_size,
            ..
        } = chunking_config;

        // The merge algorithm only needs each group's size and the chunk groups requesting it.
        // It returns chunks as indices back into `grouped_chunk_items`, which are mapped back to
        // chunk items and batch groups below.
        let merge_inputs = grouped_chunk_items
            .iter()
            .map(|(chunk_groups, group)| MergeInput {
                size: group
                    .chunk_items
                    .iter()
                    .map(|chunk_item| chunk_item.size())
                    .sum::<usize>(),
                chunk_groups: chunk_groups.map(Cow::Borrowed),
            })
            .collect::<Vec<_>>();

        if min_chunk_size != 0 || max_chunk_count_per_group != 0 {
            span.record("chunks_before_limits", merge_inputs.len());
        }

        let MergeOutcome { chunks, iterations } =
            merge_chunks(merge_inputs, chunking_config, heuristics);

        span.record("merge_iterations", iterations);
        span.record("chunks", chunks.len());

        let mut grouped_chunk_items = grouped_chunk_items
            .into_values()
            .map(Some)
            .collect::<Vec<_>>();

        let mut total_size = 0;
        for MergedChunk { size, inputs } in chunks {
            total_size += size;

            // Each input is one original pre-merge group, i.e. one component of this chunk.
            let mut chunk_items = Vec::new();
            let mut batch_groups = FxIndexSet::default();
            let mut components = Vec::new();
            for index in inputs {
                let GroupedChunkItems {
                    chunk_items: group_chunk_items,
                    batch_group,
                } = grouped_chunk_items[index]
                    .take()
                    .context("every merge input belongs to exactly one chunk")?;
                chunk_items.extend(group_chunk_items.iter().copied());
                batch_groups.extend(batch_group);
                components.push(ChunkComponent {
                    size: group_chunk_items
                        .iter()
                        .map(|chunk_item| chunk_item.size())
                        .sum::<usize>(),
                    chunk_items: group_chunk_items,
                    batch_groups: batch_group.into_iter().collect(),
                });
            }

            // Merged chunks also emit their constituent components as referenced "module
            // chunks" for cache-aware loading; a plain chunk passes no
            // components.
            let components = generate_component_chunks
                .then(|| split_into_component_chunks(components, min_component_chunk_size))
                .flatten()
                .unwrap_or_default();
            make_chunk(
                chunk_items,
                batch_groups.into_iter().collect(),
                components,
                &mut String::new(),
                &mut split_context,
            )
            .await?;
        }
        span.record("total_size", total_size);

        Ok(())
    }
    .instrument(span_outer)
    .await
}

/// One original (pre-merge) atomic chunk group. A merged chunk tracks the components it was
/// merged from so it can also expose them as individual "module chunks" for cache-aware
/// loading at runtime.
struct ChunkComponent<'l> {
    size: usize,
    chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
    batch_groups: SmallVec<[ResolvedVc<ChunkItemBatchGroup>; 1]>,
}

fn split_into_component_chunks<'l>(
    components: Vec<ChunkComponent<'l>>,
    min_component_chunk_size: usize,
) -> Option<Vec<ComponentChunkItems<'l>>> {
    // A single original part can't benefit from splitting.
    if components.len() <= 1 {
        return None;
    }
    let mut component_chunks: Vec<ComponentChunkItems<'l>> = Vec::new();
    let mut remainder_items: Vec<&'l ChunkItemOrBatchWithInfo> = Vec::new();
    let mut remainder_batch_groups = FxIndexSet::default();
    for part in components {
        if part.size >= min_component_chunk_size {
            component_chunks.push((part.chunk_items, part.batch_groups.into_vec()));
        } else {
            // we create a "remainder" chunk with smaller component chunks so that
            // an entire chunk can be loaded by loading all of its component chunks
            remainder_items.extend(part.chunk_items);
            remainder_batch_groups.extend(part.batch_groups);
        }
    }

    // TODO (@sampoder): handle the case where there are many the component chunks
    // that are only slightly smaller than the min_component_chunk_size. this may
    // mean that there is no benefit to component chunking.
    if !remainder_items.is_empty() {
        component_chunks.push((
            remainder_items,
            remainder_batch_groups.into_iter().collect(),
        ));
    }
    // A split is only worthwhile if it yields more than one component chunk.
    if component_chunks.len() <= 1 {
        None
    } else {
        Some(component_chunks)
    }
}
