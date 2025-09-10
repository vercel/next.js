use std::{borrow::Cow, collections::BinaryHeap, hash::BuildHasherDefault, mem::take};

use anyhow::{Context, Result};
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use tracing::{Instrument, field::Empty};
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemWithAsyncModuleInfo, ChunkingConfig,
        chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    },
    module_graph::{ModuleGraph, chunk_group_info::RoaringBitmapWrapper},
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
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let merged_modules = module_graph.merged_modules().await?;

        #[derive(Default)]
        struct GroupedChunkItems<'l> {
            chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
            batch_group: Option<ResolvedVc<ChunkItemBatchGroup>>,
        }

        let mut grouped_chunk_items = FxIndexMap::<_, GroupedChunkItems<'_>>::default();

        // Helper Vec to keep ReadRefs on batches and allow references into them
        let batch_read_refs = chunk_items
            .iter()
            .copied()
            .map(async |item| {
                Ok(
                    if let ChunkItemOrBatchWithInfo::Batch { batch, .. } = item {
                        Some(batch.await?)
                    } else {
                        None
                    },
                )
            })
            .try_join()
            .await?;

        let batch_group_read_refs = batch_groups.iter().try_join().await?;

        // Put chunk items into `grouped_chunk_items` based on their chunk groups
        for (i, chunk_item) in chunk_items.into_iter().enumerate() {
            let chunk_groups = match chunk_item {
                &ChunkItemOrBatchWithInfo::ChunkItem {
                    chunk_item:
                        ChunkItemWithAsyncModuleInfo {
                            module: Some(module),
                            ..
                        },
                    ..
                } => Some(
                    chunk_group_info
                        .module_chunk_groups
                        .get(&ResolvedVc::upcast(module))
                        .or_else(|| {
                            // Merged modules don't have a chunk group in chunk_group_info, so
                            // lookup using the original module.
                            merged_modules
                                .get_original_module(ResolvedVc::upcast(module))
                                .and_then(|module| {
                                    chunk_group_info.module_chunk_groups.get(&module)
                                })
                        })
                        .context("every module should have a chunk group")?,
                ),
                &ChunkItemOrBatchWithInfo::ChunkItem {
                    chunk_item: ChunkItemWithAsyncModuleInfo { module: None, .. },
                    ..
                } => None,
                ChunkItemOrBatchWithInfo::Batch { .. } => {
                    batch_read_refs[i].as_ref().unwrap().chunk_groups.as_ref()
                }
            };
            let key = BuildHasherDefault::<FxHasher>::default().prehash(chunk_groups);
            grouped_chunk_items
                .entry(key)
                .or_default()
                .chunk_items
                .push(chunk_item);
        }

        for (i, batch_group) in batch_groups.into_iter().enumerate() {
            let data = &batch_group_read_refs[i].chunk_groups;
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
            let mut heap = grouped_chunk_items
                .into_iter()
                .map(
                    |(
                        key,
                        GroupedChunkItems {
                            chunk_items,
                            batch_group,
                        },
                    )| {
                        let size = chunk_items
                            .iter()
                            .map(|chunk_item| chunk_item.size())
                            .sum::<usize>();
                        ChunkCandidate {
                            size,
                            chunk_items,
                            batch_groups: batch_group.into_iter().collect(),
                            chunk_groups: key.map(Cow::Borrowed),
                        }
                    },
                )
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
                                batch_groups,
                                chunk_groups,
                            } = heap.pop().unwrap();
                            chunks_to_merge_size += size;
                            chunks_to_merge.push(MergeCandidate {
                                size,
                                chunk_items,
                                batch_groups,
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
                        if let Some((_, _, best_overlap, _)) = best_combination.as_ref() {
                            let candidate_best_possible_value = candidate.chunk_groups_len();
                            if *best_overlap >= candidate_best_possible_value {
                                chunks_to_merge.push(candidate);
                                break;
                            }
                        }

                        // Check all combination with the new candidate
                        for (i, other) in selection.iter().enumerate() {
                            let overlap = overlap(&candidate.chunk_groups, &other.chunk_groups);
                            // It need to have at least two chunk groups in common
                            if overlap <= 1 {
                                continue;
                            }
                            // If the candidate is already big enough, avoid shrinking the sharing
                            if candidate.size > merge_threshold
                                && overlap != candidate.chunk_groups_len()
                            {
                                continue;
                            }
                            if other.size > merge_threshold && overlap != other.chunk_groups_len() {
                                continue;
                            }
                            let a_groups = candidate.chunk_groups_len() as i64;
                            let a_size = candidate.size as i64;
                            let b_groups = other.chunk_groups_len() as i64;
                            let b_size = other.size as i64;
                            let o_groups = overlap as i64;
                            let groups = a_groups.max(b_groups);
                            let a_rem = a_groups - o_groups;
                            let b_rem = b_groups - o_groups;

                            /*
                                UNMERGED CASE

                                from the total of `groups` chunk groups
                                - `a_groups` chunk groups request a `a_size` chunk
                                - `b_groups` chunk groups request a `b_size` chunk
                                but there is an overlapy of `o_groups` between them, which request both chunks.

                                MERGED CASE

                                from the total of `groups` chunk groups
                                - `a_rem` chunk groups request a `a_size` chunk
                                - `b_rem` chunk groups request a `b_size` chunk
                                - `o_groups` chunk groups request the merged chunk of size `(a_size + b_size)`
                            */

                            /*
                                For our calculations we assume that there is a probability of 2/3 that we request exactly 1 chunk group (`N = 1`)
                                and a probability of 2/3 that we request 2 chunk groups (`N = 2`).
                                This is a simplification, but it should be good enough for our purposes.

                                We want to compute the expected request count `e_req` and the expected total requested size `e_size` for the unmerged and merged case.

                                To compute that we compute the two cases `N = 1` and `N = 2` and combine them
                                e_size = 2/3 * e_size(N = 1) + 1/3 * e_size(N = 2)
                                e_req = 2/3 * e_req(N = 1) + 1/3 * e_req(N = 2)

                                We combine `e_size` with `e_req` using this formula:
                                e_cost = e_req * c_req + e_size

                                The constant `c_req` is the cost of a single request in transferred bytes. We have to choose a good value for that since there is no real value of that.
                                This way we can compute a cost for both cases (`e_cost_unmerged` and `e_cost_merged`).

                                With both costs we can compute the cost benefit `d` of merging the two chunks:
                                d = e_cost_unmerged - e_cost_merged

                                We can also split the formula into two parts:
                                d = d_req * c_req + d_size
                                d_size = e_size_unmerged - e_size_merged
                                d_req = e_req_unmerged - e_req_merged

                                And we can split it further for every N:
                                d_size = 2/3 * d_size(N = 1) + 1/3 * d_size(N = 2)
                                d_req = 2/3 * d_req(N = 1) + 1/3 * d_req(N = 2)
                            */

                            /*
                                To compute `e_size` and `e_req` we need to determine all cases and there probabilities.

                                UNMERGED CASE (N = 1):

                                case X (p = a_rem/groups): size = b_size, requests = 1
                                case Y (p = r_rem/groups): size = a_size, requests = 1
                                case Z (p = o_groups/groups): size = a_size + b_size, requests = 2

                                MERGED CASE (N = 1):

                                case X (p = a_rem/groups): size = b_size, requests = 1
                                case Y (p = r_rem/groups): size = a_size, requests = 1
                                case Z (p = o_groups/groups): size = a_size + b_size, requests = 1
                            */

                            /*
                                There is no difference in the sizes at all, so that means:

                                d_size(N = 1) = 0

                                The only difference is in case Z in the request count. That case has `p = o_groups/groups`:

                                d_req(N = 1) = o_groups / groups * (2 - 1)
                                d_req(N = 1) = o_groups / groups

                                d(N = 1) = d_req(N = 1) * c_req + d_size(N = 1)
                                         = o_groups / groups * c_req
                            */

                            /*
                                The N = 2 case is more complicated, since we have to consider all possible combinations of the cases X, Y and Z for the two chunk groups:

                                p_x = a_rem/groups
                                p_y = r_rem/groups
                                p_z = o_groups/groups

                                The chunk groups remaining after the first one has been picked
                                rem_g = groups - 1

                                UNMERGED CASE (N = 2):
                                case X + X (p = (a_rem/groups) * ((a_rem - 1)/rem_g)): size = b_size, requests = 1
                                case Y + Y (p = (b_rem/groups) * ((b_rem - 1)/rem_g)): size = a_size, requests = 1
                                case Z + Z (p = (o_groups/groups) * (o_groups - 1)/rem_g): size = a_size + b_size, requests = 2
                                case X + Y (p = (a_rem/groups) * (b_rem/rem_g) + (b_rem/groups) * (a_rem/rem_g)): size = a_size + b_size, requests = 2
                                case X + Z (p = (a_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (a_rem/rem_g)): size = a_size + b_size, requests = 2
                                case Y + Z (p = (b_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (b_rem/rem_g)): size = a_size + b_size, requests = 2

                                MERGED CASE (N = 2):
                                case X + X (p = (a_rem/groups) * ((a_rem - 1)/rem_g)): size = b_size, requests = 1
                                case Y + Y (p = (b_rem/groups) * ((b_rem - 1)/rem_g)): size = a_size, requests = 1
                                case Z + Z (p = (o_groups/groups) * (o_groups - 1)/rem_g): size = (a_size + b_size), requests = 1
                                case X + Y (p = (a_rem/groups) * (b_rem/rem_g) + (b_rem/groups) * (a_rem/rem_g)): size = a_size + b_size, requests = 2
                                case X + Z (p = (a_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (a_rem/rem_g)): size = b_size + (a_size + b_size), requests = 3
                                case Y + Z (p = (b_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (b_rem/rem_g)): size = a_size + (a_size + b_size), requests = 3

                                Request count is different in these cases: Z + Z (better), X + Z (worse), Y + Z (worse)
                                Requests size is different (worse) in these cases: X + Z, Y + Z

                                d_req_z_z = ((o_groups/groups) * (o_groups - 1)/rem_g) * (2 - 1)
                                          = o_groups * (o_groups - 1) / (groups * rem_g)
                                d_req_x_z = ((a_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (a_rem/rem_g)) * (2 - 3)
                                          = -2 * o_groups * a_rem / (groups * rem_g)
                                d_req_y_z = ((b_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (b_rem/rem_g)) * (2 - 3)
                                          = -2 * o_groups * b_rem / (groups * rem_g)

                                d_req(N = 2) = o_groups * (o_groups - 1 - 2 * a_rem - 2 * b_rem) / (groups * rem_g)
                                             = o_groups * (o_groups - 1 - 2 * (a_groups - o_groups) - 2 * (b_groups - o_groups)) / (groups * rem_g)
                                             = o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / (groups * rem_g)

                                d_size_x_z = ((a_rem/groups) * (o_groups/rem_g) + (o_groups/groups) * (a_rem/rem_g)) * (a_size + b_size - (b_size + (a_size + b_size)))
                                           = (2 * a_rem * o_groups / groups / rem_g)) * (-b_size)
                                           = -2 * a_rem * b_size * o_groups / (groups * rem_g)
                                d_size_y_z = -2 * b_rem * a_size * o_groups / (groups * rem_g)

                                d_size(N = 2) = -2 * (a_rem * b_size + b_rem * a_size) * o_groups / (groups * rem_g)


                                d(N = 2) = d_req(N = 2) * c_req + d_size(N = 2)
                                         = o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / (groups * rem_g) * c_req + 2 * (a_rem * b_size + b_rem * a_size) * o_groups) / (groups * rem_g)
                                         = ((o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) * c_req - 2 * (a_rem * b_size + b_rem * a_size) * o_groups)) / (groups * rem_g)
                            */

                            /*
                                d  = 2/3 * d(N = 1) + 1/3 * d(N = 2)
                                3d = 2 * o_groups / groups * c_req + (o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1)) * c_req - 2 * (a_rem * b_size + b_rem * a_size) * o_groups) / (groups * rem_g)
                                   = c_req * (2 * o_groups / groups + o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / (groups * rem_g)) - 2 * (a_rem * b_size + b_rem * a_size) * o_groups / (groups * rem_g)
                                   = c_req * (o_groups / groups) * (2 + (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / rem_g) - 2 * (a_rem * b_size + b_rem * a_size) * o_groups / (groups * rem_g)

                                We pull out some factors:
                                3d = (c_req * (2 * rem_g + (5 * o_groups - 2 * a_groups - 2 * b_groups - 1)) - 2 * (a_rem * b_size + b_rem * a_size)) * o_groups / (rem_g * groups)
                            */

                            /*
                               Note that d_size < 0. So we can make a quick check if d_req is positive.

                               c_req * (o_groups / groups + o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / (groups * rem_g)) > 0
                               o_groups + o_groups * (5 * o_groups - 2 * a_groups - 2 * b_groups - 1) / rem_g > 0
                               o_groups + o_groups * 5 * o_groups / rem_g - o_groups * (2 * a_groups + 2 * b_groups + 1) / rem_g > 0
                               o_groups * rem_g + o_groups * 5 * o_groups - o_groups * (2 * a_groups + 2 * b_groups + 1) > 0
                               o_groups * rem_g + o_groups * 5 * o_groups > o_groups * (2 * a_groups + 2 * b_groups + 1)
                               rem_g + 5 * o_groups > 2 * a_groups + 2 * b_groups + 1
                               rem_g + 5 * o_groups > 2 * (a_rem + o_groups) + 2 * (b_rem + o_groups) + 1
                               rem_g + 5 * o_groups > 2 * a_rem + 2 * b_rem + 4 * o_groups + 1
                               rem_g + o_groups > 2 * a_rem + 2 * b_rem + 1
                               rem_g + o_groups > 2 * (a_rem + b_rem) + 1
                               groups - 1 + o_groups > 2 * (a_rem + b_rem) + 1
                               groups + o_groups > 2 * (a_rem + b_rem) + 2
                            */

                            // It need to have some request count benefit
                            if groups + o_groups <= 2 * (a_rem + b_rem) + 2 {
                                continue;
                            }
                            let rem_g = groups - 1;
                            let c_req = 200000;
                            // d3 = 3 * d
                            let pre_d3 = c_req
                                * (2 * rem_g + (5 * o_groups - 2 * a_groups - 2 * b_groups - 1))
                                - 2 * (a_rem * b_size + b_rem * a_size);
                            // It need to have some runtime benefit of merging the chunks
                            if pre_d3 < 0 {
                                continue;
                            }
                            let d3 = pre_d3 * o_groups / (rem_g * groups);
                            let value = d3;

                            if let Some((best_i1, best_i2, best_overlap, best_value)) =
                                best_combination.as_mut()
                            {
                                if (overlap.cmp(best_overlap)).then_with(|| value.cmp(best_value))
                                    == std::cmp::Ordering::Greater
                                {
                                    *best_i1 = i;
                                    *best_i2 = selection.len();
                                    *best_overlap = overlap;
                                    *best_value = value;
                                }
                            } else {
                                best_combination = Some((i, selection.len(), overlap, value));
                            }
                        }
                        selection.push(candidate);
                    }

                    let best_overlap = if let Some((best_i1, best_i2, best_overlap, _)) =
                        best_combination.as_ref()
                    {
                        let other = selection.swap_remove(*best_i2);
                        let mut candidate = selection.swap_remove(*best_i1);
                        // Merge other into candidate
                        let MergeCandidate {
                            size,
                            chunk_items,
                            mut batch_groups,
                            chunk_groups,
                        } = other;
                        candidate.size += size;
                        candidate.chunk_items.extend(chunk_items);
                        if batch_groups.len() + candidate.batch_groups.len() > 16 {
                            let mut set = take(&mut candidate.batch_groups)
                                .into_iter()
                                .collect::<FxIndexSet<_>>();
                            set.extend(batch_groups);
                            candidate.batch_groups = set.into_iter().collect();
                        } else {
                            batch_groups.retain(|batch_group| {
                                !candidate.batch_groups.contains(batch_group)
                            });
                            candidate.batch_groups.extend(batch_groups);
                        }
                        candidate.chunk_groups =
                            merge_chunk_groups(&candidate.chunk_groups, &chunk_groups);

                        // Merged candidate is pushed back into the queue
                        chunks_to_merge.push(candidate);

                        *best_overlap
                    } else {
                        u64::MAX
                    };
                    for unused in selection {
                        // Candidates from selection that are already big enough move into the
                        // heap again when no more merges are expected.
                        // Since we can only merge into big enough candates when overlap ==
                        // chunk_groups_len we can use that as condition.
                        if unused.size > merge_threshold && unused.chunk_groups_len() > best_overlap
                        {
                            heap.push(ChunkCandidate {
                                size: unused.size,
                                chunk_items: unused.chunk_items,
                                batch_groups: unused.batch_groups,
                                chunk_groups: unused.chunk_groups,
                            });
                        } else {
                            chunks_to_merge.push(unused);
                        }
                    }
                    if best_combination.is_none() {
                        // No merges possible
                        break;
                    }
                }

                let mut remained_size = 0;
                let mut remained_chunk_items = Vec::new();
                let mut remained_batch_groups = FxIndexSet::default();
                for MergeCandidate {
                    size,
                    chunk_items,
                    batch_groups,
                    chunk_groups,
                } in chunks_to_merge.into_iter()
                {
                    if size > merge_threshold {
                        heap.push(ChunkCandidate {
                            size,
                            chunk_items,
                            batch_groups,
                            chunk_groups,
                        });
                    } else {
                        remained_size += size;
                        remained_chunk_items.extend(chunk_items);
                        remained_batch_groups.extend(batch_groups);
                    }
                }

                // Left-over chunks are merged together forming the remained chunk, which includes
                // all modules that are not sharable
                if !remained_chunk_items.is_empty() {
                    heap.push(ChunkCandidate {
                        size: remained_size,
                        chunk_items: remained_chunk_items,
                        batch_groups: remained_batch_groups.into_iter().collect(),
                        chunk_groups: None,
                    });
                }
            }

            span.record("chunks", heap.len());

            let mut total_size = 0;
            for ChunkCandidate {
                chunk_items,
                batch_groups,
                size,
                ..
            } in heap.into_iter()
            {
                total_size += size;
                make_chunk(
                    chunk_items,
                    batch_groups.into_vec(),
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

struct ChunkCandidate<'l> {
    size: usize,
    chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
    batch_groups: SmallVec<[ResolvedVc<ChunkItemBatchGroup>; 1]>,
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
    chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
    batch_groups: SmallVec<[ResolvedVc<ChunkItemBatchGroup>; 1]>,
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
