use std::{borrow::Cow, collections::BinaryHeap, hash::BuildHasherDefault};

use anyhow::{bail, Result};
use rustc_hash::FxHasher;
use tracing::{field::Empty, Instrument};
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToString, Vc};

use crate::{
    chunk::{
        chunking::{make_chunk, ChunkItemWithInfo, SplitContext},
        ChunkingConfig,
    },
    module::Module,
    module_graph::{chunk_group_info::RoaringBitmapWrapper, ModuleGraph},
};

pub async fn make_production_chunks(
    chunk_items: Vec<ChunkItemWithInfo>,
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
        let chunk_group_info = module_graph.chunk_group_info().await?;

        let mut grouped_chunk_items = FxIndexMap::<_, Vec<ChunkItemWithInfo>>::default();

        for chunk_item in chunk_items {
            let ChunkItemWithInfo { module, .. } = chunk_item;
            let chunk_groups = if let Some(module) = module {
                match chunk_group_info
                    .module_chunk_groups
                    .get(&ResolvedVc::upcast(module))
                {
                    Some(chunk_group) => Some(chunk_group),
                    None => {
                        bail!(
                            "Module {:?} has no chunk group info",
                            module.ident().to_string().await?,
                        );
                    }
                }
            } else {
                None
            };
            let key = BuildHasherDefault::<FxHasher>::default().prehash(chunk_groups);
            grouped_chunk_items.entry(key).or_default().push(chunk_item);
        }

        let &ChunkingConfig {
            min_chunk_size,
            max_chunk_count_per_group,
            max_merge_chunk_size,
            ..
        } = chunking_config;

        if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
            span.record("chunks", grouped_chunk_items.len());
            for chunk_items in grouped_chunk_items.into_values() {
                make_chunk(chunk_items, &mut String::new(), &mut split_context).await?;
            }
        } else {
            let mut heap = grouped_chunk_items
                .into_iter()
                .map(|(key, chunk_items)| {
                    let size = chunk_items
                        .iter()
                        .map(|chunk_item| chunk_item.size)
                        .sum::<usize>();
                    ChunkCandidate {
                        size,
                        chunk_items,
                        chunk_groups: key.map(Cow::Borrowed),
                    }
                })
                .collect::<BinaryHeap<_>>();

            span.record("chunks_before_limits", heap.len());

            if min_chunk_size != 0 || max_chunk_count_per_group != 0 {
                let mut chunks_to_merge = BinaryHeap::new();
                let mut chunks_to_merge_size = 0;

                // Determine chunk to merge
                loop {
                    if let Some(smallest) = heap.peek() {
                        let chunk_over_limit =
                            max_merge_chunk_size != 0 && smallest.size > max_merge_chunk_size;
                        if chunk_over_limit {
                            break;
                        }
                        let merge_threshold = if min_chunk_size != 0 {
                            min_chunk_size
                        } else {
                            smallest.size
                        };
                        let too_many_chunks = max_chunk_count_per_group != 0
                            && heap.len() + chunks_to_merge_size / merge_threshold + 1
                                > max_chunk_count_per_group;
                        let too_small_chunk = min_chunk_size != 0 && smallest.size < min_chunk_size;
                        if too_many_chunks || too_small_chunk {
                            let ChunkCandidate {
                                size,
                                chunk_items,
                                chunk_groups,
                            } = heap.pop().unwrap();
                            chunks_to_merge_size += size;
                            chunks_to_merge.push(MergeCandidate {
                                size,
                                chunk_items,
                                chunk_groups,
                            });
                            continue;
                        }
                    }
                    break;
                }

                let merge_threshold = if min_chunk_size != 0 {
                    min_chunk_size
                } else if let Some(smallest) = heap.peek() {
                    smallest.size
                } else if max_chunk_count_per_group != 0 {
                    chunks_to_merge_size / max_chunk_count_per_group
                } else {
                    unreachable!();
                };

                while chunks_to_merge.len() > 1 {
                    // Find best candidate
                    let mut selection: Vec<MergeCandidate<'_>> = Vec::new();
                    let mut best_combination = None;
                    while let Some(candidate) = chunks_to_merge.pop() {
                        // Exist early when no better overlaps are possible
                        if let Some((_, _, best_value)) = best_combination.as_ref() {
                            let candiate_best_possible_value = candidate.chunk_groups_len();
                            if *best_value >= candiate_best_possible_value {
                                chunks_to_merge.push(candidate);
                                break;
                            }
                        }

                        // Check all combination with the new candidate
                        for (i, other) in selection.iter().enumerate() {
                            let value = overlap(&candidate.chunk_groups, &other.chunk_groups);
                            // It need to have at least two chunk groups in common
                            if value <= 1 {
                                continue;
                            }
                            if let Some((best_i1, best_i2, best_value)) = best_combination.as_mut()
                            {
                                if value > *best_value {
                                    *best_i1 = i;
                                    *best_i2 = selection.len();
                                    *best_value = value;
                                }
                            } else {
                                best_combination = Some((i, selection.len(), value));
                            }
                        }
                        selection.push(candidate);
                    }

                    if let Some((best_i1, best_i2, _)) = best_combination.as_ref() {
                        let other = selection.swap_remove(*best_i2);
                        let mut candidate = selection.swap_remove(*best_i1);
                        for unused in selection {
                            chunks_to_merge.push(unused);
                        }
                        // Merge other into candidate
                        let MergeCandidate {
                            size,
                            chunk_items,
                            chunk_groups,
                        } = other;
                        candidate.size += size;
                        candidate.chunk_items.extend(chunk_items);
                        candidate.chunk_groups =
                            merge_chunk_groups(&candidate.chunk_groups, &chunk_groups);

                        // Merged chunk either goes back to the heap or
                        // is considered for merging again
                        if candidate.size > merge_threshold {
                            heap.push(ChunkCandidate {
                                size: candidate.size,
                                chunk_items: candidate.chunk_items,
                                chunk_groups: candidate.chunk_groups,
                            });
                        } else {
                            chunks_to_merge.push(candidate);
                        }
                    } else {
                        // No merges possible
                        break;
                    }
                }

                // Left-over chunks are merged together forming the remainer chunk, which includes
                // all modules that are not sharable
                if let Some(MergeCandidate {
                    mut size,
                    mut chunk_items,
                    chunk_groups: _,
                }) = chunks_to_merge.pop()
                {
                    for chunk in chunks_to_merge {
                        let MergeCandidate {
                            size: other_size,
                            chunk_items: other_chunk_items,
                            chunk_groups: _,
                        } = chunk;
                        size += other_size;
                        chunk_items.extend(other_chunk_items);
                    }
                    heap.push(ChunkCandidate {
                        size,
                        chunk_items,
                        chunk_groups: None,
                    });
                }
            }

            span.record("chunks", heap.len());

            let mut total_size = 0;
            for ChunkCandidate {
                chunk_items, size, ..
            } in heap.into_iter()
            {
                total_size += size;
                make_chunk(chunk_items, &mut String::new(), &mut split_context).await?;
            }
            span.record("total_size", total_size);
        }

        Ok(())
    }
    .instrument(span_outer)
    .await
}

struct ChunkCandidate<'l> {
    size: usize,
    chunk_items: Vec<ChunkItemWithInfo>,
    chunk_groups: Option<Cow<'l, RoaringBitmapWrapper>>,
}

impl Ord for ChunkCandidate<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.size.cmp(&other.size).reverse()
    }
}

impl PartialOrd for ChunkCandidate<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for ChunkCandidate<'_> {}

impl PartialEq for ChunkCandidate<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}

struct MergeCandidate<'l> {
    size: usize,
    chunk_items: Vec<ChunkItemWithInfo>,
    chunk_groups: Option<Cow<'l, RoaringBitmapWrapper>>,
}

impl MergeCandidate<'_> {
    fn chunk_groups_len(&self) -> u64 {
        self.chunk_groups
            .as_ref()
            .map_or(0, |chunk_groups| chunk_groups.len())
    }
}

impl Ord for MergeCandidate<'_> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.chunk_groups_len()
            .cmp(&other.chunk_groups_len())
            .then_with(|| self.size.cmp(&other.size).reverse())
    }
}

impl PartialOrd for MergeCandidate<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for MergeCandidate<'_> {}

impl PartialEq for MergeCandidate<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}

fn overlap(
    chunk_groups: &Option<Cow<'_, RoaringBitmapWrapper>>,
    chunk_groups2: &Option<Cow<'_, RoaringBitmapWrapper>>,
) -> u64 {
    if let (Some(chunk_groups), Some(chunk_groups2)) = (chunk_groups, chunk_groups2) {
        chunk_groups.intersection_len(chunk_groups2)
    } else {
        0
    }
}

fn merge_chunk_groups<'l>(
    chunk_groups: &Option<Cow<'l, RoaringBitmapWrapper>>,
    chunk_groups2: &Option<Cow<'l, RoaringBitmapWrapper>>,
) -> Option<Cow<'l, RoaringBitmapWrapper>> {
    if let (Some(chunk_groups), Some(chunk_groups2)) = (chunk_groups, chunk_groups2) {
        let l = &**chunk_groups.as_ref();
        let r = &**chunk_groups2.as_ref();
        Some(Cow::Owned(RoaringBitmapWrapper(l & r)))
    } else {
        None
    }
}
