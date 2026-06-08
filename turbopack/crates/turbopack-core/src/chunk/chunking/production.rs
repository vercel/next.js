use std::{
    borrow::Cow,
    collections::BinaryHeap,
    hash::{Hash, Hasher},
};

use anyhow::{Context, Result};
use roaring::RoaringBitmap;
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use tracing::{Instrument, field::Empty};
use turbo_prehash::{BuildHasherExt, PreHashed};
use turbo_tasks::{MappedReadRef, ReadRef, ResolvedVc, TryJoinIterExt, Vc};

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

// ---------------------------------------------------------------------------
// Public async entry point (requires Vc/turbo-tasks)
// ---------------------------------------------------------------------------

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
        chunks = Empty,
        total_size = Empty
    );
    let span = span_outer.clone();
    async move {
        let module_chunk_groups = module_graph.chunk_group_info().module_chunk_groups();
        let merged_modules = module_graph.merged_modules().await?;

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

        // Build ChunkItemForMerging for each chunk item (borrowing bitmaps)
        let items_for_merging: Vec<ChunkItemForMerging<'_>> = chunk_items
            .iter()
            .zip(prepared.iter())
            .map(|(chunk_item, prepared)| {
                let chunk_groups = match prepared {
                    Prepared::None => None,
                    Prepared::ChunkItem(data) => Some(&data.0),
                    Prepared::Batch(data) => data.chunk_groups.as_ref().map(|bw| &bw.0),
                };
                ChunkItemForMerging {
                    size: chunk_item.size(),
                    chunk_groups,
                }
            })
            .collect();

        // Build BatchGroupForMerging for each batch group (borrowing bitmaps)
        let batch_group_read_refs = batch_groups.iter().try_join().await?;
        let batch_groups_for_merging: Vec<BatchGroupForMerging<'_>> = batch_group_read_refs
            .iter()
            .enumerate()
            .map(|(id, bg_ref)| BatchGroupForMerging {
                id,
                chunk_groups: &bg_ref.chunk_groups.0,
            })
            .collect();

        let &ChunkingConfig {
            min_chunk_size,
            max_chunk_count_per_group,
            max_merge_chunk_size,
            ..
        } = chunking_config;

        let config = MergeConfig {
            min_chunk_size,
            max_chunk_count_per_group,
            max_merge_chunk_size,
        };

        let merged =
            make_production_chunks_sync(&items_for_merging, &batch_groups_for_merging, &config);

        span.record("chunks", merged.len());

        let mut total_size = 0;
        for mut merged_chunk in merged {
            total_size += merged_chunk.total_size;

            // Sort item indices to ensure deterministic chunk item ordering.
            merged_chunk.item_indices.sort_unstable();
            merged_chunk.batch_group_ids.sort_unstable();

            let chunk_items_out: Vec<&ChunkItemOrBatchWithInfo> = merged_chunk
                .item_indices
                .iter()
                .map(|&idx| chunk_items[idx])
                .collect();

            let batch_groups_out: Vec<ResolvedVc<ChunkItemBatchGroup>> = merged_chunk
                .batch_group_ids
                .iter()
                .map(|&bg_id| batch_groups[bg_id])
                .collect();

            make_chunk(
                chunk_items_out,
                batch_groups_out,
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

// ---------------------------------------------------------------------------
// Pure, Vc-free merge algorithm (testable without turbo-tasks)
// ---------------------------------------------------------------------------

/// Newtype around `Option<&RoaringBitmap>` that implements `Hash` and `Eq`,
/// enabling use with `PreHashed` for collision-safe hash map lookups.
#[derive(Clone, Copy)]
struct BitmapKey<'a>(Option<&'a RoaringBitmap>);

impl Hash for BitmapKey<'_> {
    fn hash<H: Hasher>(&self, hasher: &mut H) {
        match self.0 {
            None => 0u8.hash(hasher),
            Some(bm) => {
                1u8.hash(hasher);
                struct HasherWriter<'a, H: Hasher>(&'a mut H);
                impl<H: Hasher> std::io::Write for HasherWriter<'_, H> {
                    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                        self.0.write(buf);
                        Ok(buf.len())
                    }
                    fn flush(&mut self) -> std::io::Result<()> {
                        Ok(())
                    }
                }
                let _ = bm.serialize_into(HasherWriter(hasher));
            }
        }
    }
}

impl PartialEq for BitmapKey<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Eq for BitmapKey<'_> {}

struct MergeConfig {
    min_chunk_size: usize,
    max_chunk_count_per_group: usize,
    max_merge_chunk_size: usize,
}

struct ChunkItemForMerging<'a> {
    size: usize,
    chunk_groups: Option<&'a RoaringBitmap>,
}

struct BatchGroupForMerging<'a> {
    id: usize,
    chunk_groups: &'a RoaringBitmap,
}

#[derive(Debug)]
struct MergedChunkInfo {
    item_indices: Vec<usize>,
    total_size: usize,
    #[allow(dead_code)]
    chunk_groups: Option<RoaringBitmap>,
    batch_group_ids: SmallVec<[usize; 1]>,
}

/// Groups items by bitmap, associates batch groups, then merges small groups.
///
/// When `min_chunk_size == 0 && max_chunk_count_per_group == 0`, each distinct
/// bitmap group becomes its own chunk (no merging).
fn make_production_chunks_sync(
    items: &[ChunkItemForMerging<'_>],
    batch_groups: &[BatchGroupForMerging<'_>],
    config: &MergeConfig,
) -> Vec<MergedChunkInfo> {
    // Group items by their chunk groups bitmap.
    let hasher = rustc_hash::FxBuildHasher;
    let mut groups: Vec<GroupInput> = Vec::new();
    let mut item_indices_per_group: Vec<Vec<usize>> = Vec::new();
    let mut bitmap_to_group: FxHashMap<PreHashed<BitmapKey<'_>>, usize> = FxHashMap::default();

    for (idx, item) in items.iter().enumerate() {
        let key = hasher.prehash(BitmapKey(item.chunk_groups));
        let group_idx = *bitmap_to_group.entry(key).or_insert_with(|| {
            groups.push(GroupInput {
                size: 0,
                chunk_groups: item.chunk_groups.map(|bm| Cow::Borrowed(bm)),
                batch_group_id: None,
            });
            item_indices_per_group.push(Vec::new());
            groups.len() - 1
        });
        groups[group_idx].size += item.size;
        item_indices_per_group[group_idx].push(idx);
    }

    // Associate batch groups with matching bitmap groups.
    for bg in batch_groups {
        let key = hasher.prehash(BitmapKey(Some(bg.chunk_groups)));
        if let Some(&group_idx) = bitmap_to_group.get(&key) {
            groups[group_idx].batch_group_id = Some(bg.id);
        }
    }

    let merged = merge_grouped_chunks(groups, config);

    // Map group indices back to item indices
    merged
        .into_iter()
        .map(|mg| {
            let item_indices: Vec<usize> = mg
                .group_indices
                .iter()
                .flat_map(|&gi| item_indices_per_group[gi].iter().copied())
                .collect();
            MergedChunkInfo {
                item_indices,
                total_size: mg.total_size,
                chunk_groups: mg.chunk_groups,
                batch_group_ids: mg.batch_group_ids,
            }
        })
        .collect()
}

// --- Internal types ---

struct GroupInput<'a> {
    size: usize,
    chunk_groups: Option<Cow<'a, RoaringBitmap>>,
    batch_group_id: Option<usize>,
}

struct MergedGroupInfo {
    group_indices: Vec<usize>,
    total_size: usize,
    #[allow(dead_code)]
    chunk_groups: Option<RoaringBitmap>,
    batch_group_ids: SmallVec<[usize; 1]>,
}

fn merge_grouped_chunks(groups: Vec<GroupInput<'_>>, config: &MergeConfig) -> Vec<MergedGroupInfo> {
    let MergeConfig {
        min_chunk_size,
        max_chunk_count_per_group,
        max_merge_chunk_size,
    } = *config;

    // Early exit: no merging needed
    if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
        return groups
            .into_iter()
            .enumerate()
            .map(|(i, g)| MergedGroupInfo {
                group_indices: vec![i],
                total_size: g.size,
                chunk_groups: g.chunk_groups.map(|c| c.into_owned()),
                batch_group_ids: g.batch_group_id.into_iter().collect(),
            })
            .collect();
    }

    // Build a max-heap (largest first) of chunk candidates
    let mut heap: BinaryHeap<ChunkCandidate> = groups
        .into_iter()
        .enumerate()
        .map(|(i, g)| ChunkCandidate {
            size: g.size,
            group_indices: vec![i],
            batch_group_ids: g.batch_group_id.into_iter().collect(),
            chunk_groups: g.chunk_groups,
        })
        .collect();

    let mut chunks_to_merge: BinaryHeap<MergeCandidate> = BinaryHeap::new();
    let mut chunks_to_merge_size = 0;

    // Determine chunks to merge: pop from heap while they're too small or there are too many
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
                let c = heap.pop().unwrap();
                chunks_to_merge_size += c.size;
                chunks_to_merge.push(MergeCandidate {
                    size: c.size,
                    group_indices: c.group_indices,
                    batch_group_ids: c.batch_group_ids,
                    chunk_groups: c.chunk_groups,
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
    } else if let Some(merge_threshold) =
        chunks_to_merge_size.checked_div(max_chunk_count_per_group)
    {
        merge_threshold
    } else {
        unreachable!();
    };

    // Main merge loop
    while chunks_to_merge.len() > 1 {
        // Find best candidate
        let mut selection: Vec<MergeCandidate> = Vec::new();
        let mut best_combination: Option<(usize, usize, u64, i64)> = None;

        while let Some(candidate) = chunks_to_merge.pop() {
            // Exit early when no better overlaps are possible
            if let Some((_, _, best_overlap, _)) = best_combination.as_ref() {
                let candidate_best_possible_value = candidate.chunk_groups_len();

                /// Limit combinational complexity
                /// When we found a good merge combination we don't want to continue
                /// searching forever since the combinational complexity would be
                /// O(N^3). This limit makes it O(N * M * M) where M is the max
                /// combinational complexity. With a small and constant M this is
                /// effectively O(N).
                const MAX_COMBINATIONAL_COMPLEXITY: usize = 32;

                if *best_overlap > candidate_best_possible_value
                    || selection.len() > MAX_COMBINATIONAL_COMPLEXITY
                {
                    chunks_to_merge.push(candidate);
                    break;
                }
            }

            let is_big_candidate = candidate.size > merge_threshold;

            // Check all combinations with the new candidate
            for (i, other) in selection.iter().enumerate() {
                let overlap_val = overlap(&candidate.chunk_groups, &other.chunk_groups);
                // It need to have at least two chunk groups in common
                if overlap_val <= 1 {
                    continue;
                }
                // If the candidate is already big enough, avoid shrinking the sharing
                if is_big_candidate && overlap_val != candidate.chunk_groups_len() {
                    continue;
                }
                if other.size > merge_threshold && overlap_val != other.chunk_groups_len() {
                    continue;
                }
                let a_groups = candidate.chunk_groups_len() as i64;
                let a_size = candidate.size as i64;
                let b_groups = other.chunk_groups_len() as i64;
                let b_size = other.size as i64;
                let o_groups = overlap_val as i64;
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
                let pre_d3 = c_req * (2 * rem_g + (5 * o_groups - 2 * a_groups - 2 * b_groups - 1))
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
                    if (overlap_val.cmp(best_overlap)).then_with(|| value.cmp(best_value))
                        == std::cmp::Ordering::Greater
                    {
                        *best_i1 = i;
                        *best_i2 = selection.len();
                        *best_overlap = overlap_val;
                        *best_value = value;
                    }
                } else {
                    best_combination = Some((i, selection.len(), overlap_val, value));
                }
            }
            selection.push(candidate);
        }

        let best_overlap_val = if let Some((best_i1, best_i2, best_overlap_val, _)) =
            best_combination.as_ref()
        {
            let other = selection.swap_remove(*best_i2);
            let mut candidate = selection.swap_remove(*best_i1);
            // Merge other into candidate
            candidate.size += other.size;
            candidate.group_indices.extend(other.group_indices);
            if other.batch_group_ids.len() + candidate.batch_group_ids.len() > 16 {
                let mut set: FxHashSet<usize> = candidate.batch_group_ids.iter().copied().collect();
                set.extend(other.batch_group_ids.iter().copied());
                candidate.batch_group_ids = set.into_iter().collect();
            } else {
                let mut bg = other.batch_group_ids;
                bg.retain(|b| !candidate.batch_group_ids.contains(b));
                candidate.batch_group_ids.extend(bg);
            }
            candidate.chunk_groups =
                merge_chunk_groups(&candidate.chunk_groups, &other.chunk_groups);

            // Merged candidate is pushed back into the queue
            chunks_to_merge.push(candidate);

            *best_overlap_val
        } else {
            u64::MAX
        };
        for unused in selection {
            // Candidates from selection that are already big enough move into the
            // heap again when no more merges are expected.
            // Since we can only merge into big enough candidates when overlap ==
            // chunk_groups_len we can use that as condition.
            if unused.size > merge_threshold && unused.chunk_groups_len() > best_overlap_val {
                heap.push(ChunkCandidate {
                    size: unused.size,
                    group_indices: unused.group_indices,
                    batch_group_ids: unused.batch_group_ids,
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
    let mut remained_group_indices = Vec::new();
    let mut remained_batch_group_ids = FxHashSet::default();
    for mc in chunks_to_merge.into_iter() {
        if mc.size > merge_threshold {
            heap.push(ChunkCandidate {
                size: mc.size,
                group_indices: mc.group_indices,
                batch_group_ids: mc.batch_group_ids,
                chunk_groups: mc.chunk_groups,
            });
        } else {
            remained_size += mc.size;
            remained_group_indices.extend(mc.group_indices);
            remained_batch_group_ids.extend(mc.batch_group_ids);
        }
    }

    // Left-over chunks are merged together forming the remainder chunk, which includes
    // all modules that are not sharable
    if !remained_group_indices.is_empty() {
        heap.push(ChunkCandidate {
            size: remained_size,
            group_indices: remained_group_indices,
            batch_group_ids: remained_batch_group_ids.into_iter().collect(),
            chunk_groups: None,
        });
    }

    heap_to_output(heap)
}

// --- Internal types and helpers ---

struct ChunkCandidate<'a> {
    size: usize,
    group_indices: Vec<usize>,
    batch_group_ids: SmallVec<[usize; 1]>,
    chunk_groups: Option<Cow<'a, RoaringBitmap>>,
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

struct MergeCandidate<'a> {
    size: usize,
    group_indices: Vec<usize>,
    batch_group_ids: SmallVec<[usize; 1]>,
    chunk_groups: Option<Cow<'a, RoaringBitmap>>,
}

impl MergeCandidate<'_> {
    fn chunk_groups_len(&self) -> u64 {
        self.chunk_groups.as_ref().map_or(0, |cg| cg.len())
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

fn overlap(a: &Option<Cow<'_, RoaringBitmap>>, b: &Option<Cow<'_, RoaringBitmap>>) -> u64 {
    if let (Some(a), Some(b)) = (a, b) {
        a.intersection_len(b)
    } else {
        0
    }
}

fn merge_chunk_groups<'a>(
    a: &Option<Cow<'a, RoaringBitmap>>,
    b: &Option<Cow<'a, RoaringBitmap>>,
) -> Option<Cow<'a, RoaringBitmap>> {
    if let (Some(a), Some(b)) = (a, b) {
        Some(Cow::Owned(a.as_ref() & b.as_ref()))
    } else {
        None
    }
}

fn heap_to_output(heap: BinaryHeap<ChunkCandidate<'_>>) -> Vec<MergedGroupInfo> {
    heap.into_iter()
        .map(|c| MergedGroupInfo {
            group_indices: c.group_indices,
            total_size: c.size,
            chunk_groups: c.chunk_groups.map(|c| c.into_owned()),
            batch_group_ids: c.batch_group_ids,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bitmap(bits: &[u32]) -> RoaringBitmap {
        let mut bm = RoaringBitmap::new();
        for &b in bits {
            bm.insert(b);
        }
        bm
    }

    /// Build ChunkItemForMerging refs from a slice of (size, bitmap) pairs.
    fn items(data: &[(usize, RoaringBitmap)]) -> Vec<ChunkItemForMerging<'_>> {
        data.iter()
            .map(|(size, bm)| ChunkItemForMerging {
                size: *size,
                chunk_groups: Some(bm),
            })
            .collect()
    }

    fn production_config() -> MergeConfig {
        MergeConfig {
            min_chunk_size: 50_000,
            max_chunk_count_per_group: 40,
            max_merge_chunk_size: 200_000,
        }
    }

    fn chunks_containing(results: &[MergedChunkInfo], item_idx: usize) -> Vec<usize> {
        results
            .iter()
            .enumerate()
            .filter(|(_, c)| c.item_indices.contains(&item_idx))
            .map(|(i, _)| i)
            .collect()
    }

    fn assert_each_item_in_one_chunk(results: &[MergedChunkInfo], num_items: usize) {
        for idx in 0..num_items {
            let containing = chunks_containing(results, idx);
            assert_eq!(
                containing.len(),
                1,
                "Item {} should be in exactly one chunk, but found in {:?}",
                idx,
                containing,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Test 1: The exact vercel.com scenario
    // 18 modules with bitmap {0,1} + 1 module (360 bytes) with bitmap {0,1,2}
    // -----------------------------------------------------------------------
    #[test]
    fn test_near_duplicate_single_extra_module() {
        let mut data: Vec<(usize, RoaringBitmap)> = Vec::new();
        for _ in 0..18 {
            data.push((3_300, bitmap(&[0, 1])));
        }
        data.push((360, bitmap(&[0, 1, 2])));

        let items = items(&data);
        let results = make_production_chunks_sync(&items, &[], &production_config());

        assert_each_item_in_one_chunk(&results, data.len());
    }

    // -----------------------------------------------------------------------
    // Test 2: Large chunk with a tiny module
    // -----------------------------------------------------------------------
    #[test]
    fn test_large_chunk_with_tiny_module() {
        let data = vec![(60_000, bitmap(&[0, 1])), (360, bitmap(&[0, 1, 2]))];
        let items = items(&data);
        let results = make_production_chunks_sync(&items, &[], &production_config());
        assert_each_item_in_one_chunk(&results, data.len());
    }

    // -----------------------------------------------------------------------
    // Test 3: Sibling pages sharing a layout
    // -----------------------------------------------------------------------
    #[test]
    fn test_sibling_pages_shared_layout() {
        let data = vec![
            (30_000, bitmap(&[0])),       // Header
            (25_000, bitmap(&[0])),       // Nav
            (15_000, bitmap(&[0, 1, 2])), // Shared lib
            (20_000, bitmap(&[1])),       // Page A
            (20_000, bitmap(&[2])),       // Page B
        ];
        let items = items(&data);
        let results = make_production_chunks_sync(&items, &[], &production_config());
        assert_each_item_in_one_chunk(&results, data.len());
    }

    // -----------------------------------------------------------------------
    // Test 4: Deep layout nesting
    // -----------------------------------------------------------------------
    #[test]
    fn test_deep_nesting() {
        let data = vec![
            (40_000, bitmap(&[0, 1, 2])), // Root header
            (30_000, bitmap(&[1, 2])),    // Section nav
            (20_000, bitmap(&[2])),       // Page content
            (10_000, bitmap(&[0, 1, 2])), // Shared util
        ];
        let items = items(&data);
        let results = make_production_chunks_sync(&items, &[], &production_config());
        assert_each_item_in_one_chunk(&results, data.len());
    }

    // -----------------------------------------------------------------------
    // Test 5: Input order should not affect chunk assignments
    // -----------------------------------------------------------------------
    #[test]
    fn test_stable_output_regardless_of_input_order() {
        let base = vec![
            (30_000, bitmap(&[0, 1])),
            (25_000, bitmap(&[0, 1])),
            (20_000, bitmap(&[0])),
            (15_000, bitmap(&[1])),
        ];
        let config = production_config();

        let data_a: Vec<_> = [0, 1, 2, 3].iter().map(|&i| base[i].clone()).collect();
        let data_b: Vec<_> = [3, 2, 1, 0].iter().map(|&i| base[i].clone()).collect();

        let results_a = make_production_chunks_sync(&items(&data_a), &[], &config);
        let results_b = make_production_chunks_sync(&items(&data_b), &[], &config);

        assert_eq!(
            results_a.len(),
            results_b.len(),
            "Different input order produced different chunk count: {} vs {}",
            results_a.len(),
            results_b.len(),
        );
    }

    // -----------------------------------------------------------------------
    // Test 6: Characterize current behavior
    // -----------------------------------------------------------------------
    #[test]
    fn test_characterize_current_behavior() {
        let mut data: Vec<(usize, RoaringBitmap)> = Vec::new();

        // 10 modules shared by all 5 pages
        for _ in 0..10 {
            data.push((5_000, bitmap(&[0, 1, 2, 3, 4])));
        }
        // 1 module shared by 4 of 5 pages
        data.push((400, bitmap(&[0, 1, 2, 3])));
        // 5 page-specific modules
        for i in 0..5 {
            data.push((10_000, bitmap(&[i])));
        }

        let items = items(&data);
        let results = make_production_chunks_sync(&items, &[], &production_config());

        assert_each_item_in_one_chunk(&results, data.len());

        let total_input_size: usize = data.iter().map(|(s, _)| s).sum();
        let total_output_size: usize = results.iter().map(|c| c.total_size).sum();
        assert_eq!(total_input_size, total_output_size);
    }

    // -----------------------------------------------------------------------
    // Test 7: No merging when config has zero limits
    // -----------------------------------------------------------------------
    #[test]
    fn test_no_merging_config() {
        let data = vec![
            (100, bitmap(&[0, 1])),
            (200, bitmap(&[0, 1])),
            (300, bitmap(&[2])),
        ];
        let items = items(&data);

        let config = MergeConfig {
            min_chunk_size: 0,
            max_chunk_count_per_group: 0,
            max_merge_chunk_size: 0,
        };

        let results = make_production_chunks_sync(&items, &[], &config);

        assert_eq!(
            results.len(),
            2,
            "Should have 2 chunks (one per unique bitmap), got {}",
            results.len()
        );

        let total_input_size: usize = data.iter().map(|(s, _)| s).sum();
        let total_output_size: usize = results.iter().map(|c| c.total_size).sum();
        assert_eq!(total_input_size, total_output_size);
    }
}
