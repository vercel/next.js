//! The production chunk merge algorithm, as a pure function.
//!
//! [`make_production_chunks`](super::production::make_production_chunks) is responsible for
//! turning chunk items into `Vc`-flavoured chunks; the decision of *which* pre-merge groups end
//! up in the same chunk is made here. The algorithm only ever reads a group's size and the set of
//! chunk groups that request it, so this module works on plain data and refers to groups by index,
//! which keeps it unit-testable without a turbo-tasks runtime.
//!
//! See `./chunk_merging_cost_benefit.md` for the maths behind the merge decision.

use std::{borrow::Cow, collections::BinaryHeap};

use roaring::RoaringBitmap;
use rustc_hash::FxHashMap;

use crate::{
    chunk::ChunkingConfig,
    module_graph::chunk_group_info::{ChunkingHeuristicsInfo, RoaringBitmapWrapper},
};

/// Default estimated cost of an additional request, in bytes (200 KB).
const DEFAULT_ESTIMATED_REQUEST_COST_BYTES: u64 = 200_000;

/// Probability that a navigation stays within a cluster.
const CLUSTER_NAVIGATION_PROBABILITY: f64 = 0.6;

/// One pre-merge group: all chunk items that are requested by exactly the same set of chunk
/// groups.
pub struct MergeInput<'l> {
    pub size: usize,
    pub chunk_groups: Option<Cow<'l, RoaringBitmapWrapper>>,
}

/// One chunk to emit, built from one or more [`MergeInput`]s.
pub struct MergedChunk {
    pub size: usize,
    /// Indices into the inputs passed to [`merge_chunks`], in merge order. Each index is one
    /// original pre-merge group, i.e. one component of the emitted chunk.
    pub inputs: Vec<usize>,
}

pub struct MergeOutcome {
    pub chunks: Vec<MergedChunk>,
    /// Number of candidate pairs evaluated, for tracing.
    pub iterations: u64,
}

/// Decides which of `inputs` are merged together.
///
/// When `min_chunk_size == 0 && max_chunk_count_per_group == 0` no merging happens and every
/// input becomes its own chunk.
pub fn merge_chunks(
    inputs: Vec<MergeInput<'_>>,
    config: &ChunkingConfig,
    heuristics: &ChunkingHeuristicsInfo,
) -> MergeOutcome {
    let &ChunkingConfig {
        min_chunk_size,
        max_chunk_count_per_group,
        max_merge_chunk_size,
        first_page_load_priority,
        priority_boost_percent,
        request_cost,
        ..
    } = config;

    if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
        return MergeOutcome {
            chunks: inputs
                .into_iter()
                .enumerate()
                .map(|(index, input)| MergedChunk {
                    size: input.size,
                    inputs: vec![index],
                })
                .collect(),
            iterations: 0,
        };
    }

    let mut heap = inputs
        .into_iter()
        .enumerate()
        .map(|(index, input)| ChunkCandidate {
            size: input.size,
            inputs: vec![index],
            chunk_groups: input.chunk_groups,
        })
        .collect::<BinaryHeap<_>>();

    let mut iterations = 0;

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
                        inputs,
                        chunk_groups,
                    } = heap.pop().unwrap();
                    chunks_to_merge_size += size;
                    chunks_to_merge.push(MergeCandidate {
                        size,
                        inputs,
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
        } else if let Some(merge_threshold) =
            chunks_to_merge_size.checked_div(max_chunk_count_per_group)
        {
            merge_threshold
        } else {
            unreachable!();
        };

        // Chunking-heuristics-derived constants for the maths below.
        //
        // The cost of a single request in transferred bytes.
        // Defaults to 200,000 bytes (200 KB).
        let c_req = request_cost
            .unwrap_or(DEFAULT_ESTIMATED_REQUEST_COST_BYTES)
            .min(i64::MAX as u64) as i64;

        // Default `P(N = 1)`: the probability that we request exactly 1 chunk group.
        // `firstPageLoadPriority` (a config percentage) maps to it; the default is 0.67
        // (~2/3).
        let default_p1 = first_page_load_priority.map_or(0.67, |percent| percent as f64 / 100.0);

        // `priorityBoost` multiplier applied to `P(N = 1)` for priority routes; the default
        // is 1.5 (a 1.5x boost).
        let priority_boost = priority_boost_percent.map_or(1.5, |percent| percent as f64 / 100.0);

        // If chunk group clusters are configured in the chunking heuristics and the patterns
        // match at least one route.
        let has_clusters = heuristics.clusters.iter().any(|c| !c.is_empty());

        while chunks_to_merge.len() > 1 {
            // Find best candidate
            let mut selection: Vec<MergeCandidate<'_>> = Vec::new();
            let mut best_combination = None;
            while let Some(candidate) = chunks_to_merge.pop() {
                // Exist early when no better overlaps are possible
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

                // Check all combination with the new candidate
                for (i, other) in selection.iter().enumerate() {
                    iterations += 1;
                    let overlap = overlap(&candidate.chunk_groups, &other.chunk_groups);
                    // It need to have at least one chunk group in common
                    if overlap < 1 {
                        continue;
                    }
                    // If the candidate is already big enough, avoid shrinking the sharing
                    if is_big_candidate && overlap != candidate.chunk_groups_len() {
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
                    let groups = a_groups + b_groups - o_groups;
                    let a_rem = a_groups - o_groups;
                    let b_rem = b_groups - o_groups;

                    // See ./chunk_merging_cost_benefit.md for a description of how
                    // this works.

                    // If there are no overlapping groups, there is no benefit to
                    // merging - skip this process. Also, our code assumes that
                    // more than one group requests these chunks. If it was just
                    // one group requesting both it should already have been merged
                    // in `grouped_chunk_items` above.
                    if o_groups == 0 || groups < 2 {
                        continue;
                    }
                    let rem_g = groups - 1;

                    // If a single priority route references every chunk group in the
                    // overlap, we increase its P(N = 1) by
                    // `priorityBoost` (default 1.5x, and as a
                    // result reduce P(N = 2)). This is to encourage merging chunks used
                    // on these priority routes.

                    // `candidate` and `other` are both chunk items that we are considering
                    // merging. they are both requested by different chunk groups, we are
                    // optimising the overlap of these chunk groups. an example of something
                    // in `o_groups` would be a chunk group that requests both chunk items.

                    let mut is_priority_route = false;

                    // Distinct pairs between the sets X (a_rem), Y (b_rem) and Z (overlap)
                    // that are both in a cluster.
                    let (mut c_xx, mut c_xy, mut c_xz, mut c_yy, mut c_yz, mut c_zz) =
                        (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
                    if let (Some(a), Some(b)) = (&candidate.chunk_groups, &other.chunk_groups) {
                        let o = &***a & &***b; // `o_groups` (Z)

                        // if there is one chunk group in `o_groups` that is used by a
                        // priority route, we should prioritise merging these two chunk
                        // items.
                        is_priority_route = !o.is_disjoint(&heuristics.priority_routes);

                        if has_clusters {
                            let x = &***a - &o; // a_rem groups: load only chunk A
                            let y = &***b - &o; // b_rem groups: load only chunk B

                            // Map each cluster to the candidate groups it contains.
                            let mut cluster_groups: FxHashMap<u16, RoaringBitmap> =
                                FxHashMap::default();
                            for set in [&x, &y, &o] {
                                for index in set.iter() {
                                    for &c in &heuristics.clusters[index as usize] {
                                        cluster_groups.entry(c).or_default().insert(index);
                                    }
                                }
                            }

                            // Groups sharing >= 1 cluster with `index`, deduped across
                            // clusters (excluding `index` itself) so each pair counts once.
                            let pairs_with = |index: u32| {
                                let mut p = RoaringBitmap::new();
                                for &c in &heuristics.clusters[index as usize] {
                                    if let Some(groups) = cluster_groups.get(&c) {
                                        p |= groups;
                                    }
                                }
                                p.remove(index);
                                p
                            };

                            for index in x.iter() {
                                let p = pairs_with(index);
                                c_xx += p.intersection_len(&x) as f64;
                                c_xy += p.intersection_len(&y) as f64;
                                c_xz += p.intersection_len(&o) as f64;
                            }
                            for index in y.iter() {
                                let p = pairs_with(index);
                                c_yy += p.intersection_len(&y) as f64;
                                c_yz += p.intersection_len(&o) as f64;
                            }
                            for index in o.iter() {
                                c_zz += pairs_with(index).intersection_len(&o) as f64;
                            }
                        }
                    }

                    let paired_x = c_xx + c_xy + c_xz;
                    let paired_y = c_xy + c_yy + c_yz;
                    let paired_z = c_xz + c_yz + c_zz;

                    let p1 = if is_priority_route {
                        (default_p1 * priority_boost).min(1.0)
                    } else {
                        default_p1
                    };
                    let p2 = 1.0 - p1;

                    let c_req = c_req as f64;
                    let o = o_groups as f64;
                    let groups = groups as f64;
                    let rem_g = rem_g as f64;
                    let a_rem = a_rem as f64;
                    let b_rem = b_rem as f64;
                    let a_size = a_size as f64;
                    let b_size = b_size as f64;

                    /* transition_probability(source -> dest): probability that, after landing on a page
                    in the `source` set, the next navigation goes to the `dest` set.
                    `CLUSTER_NAVIGATION_PROBABILITY` of the time it stays within a cluster
                    (split across the source's pairs); the
                    rest spreads over the non-paired groups. With no pairs it is a uniform hop.

                    - pairs_to_dest: co-clustered pairs from source to dest
                    - source_pairs: all co-clustered pairs leaving source (its row sum)
                    - source_groups: number of groups in the source set
                    - dest_groups: groups in the dest set (minus 1 if source == dest) */
                    let transition_probability =
                        |pairs_to_dest: f64,
                         source_pairs: f64,
                         source_groups: f64,
                         dest_groups: f64| {
                            if source_pairs == 0.0 {
                                // Source has no pairs: navigate uniformly.
                                return dest_groups / rem_g;
                            }
                            let non_paired_from_source = rem_g * source_groups - source_pairs;
                            if non_paired_from_source <= 0.0 {
                                // Every other group is paired: all weight on the pairs.
                                return pairs_to_dest / source_pairs;
                            }
                            let non_paired_from_source_to_dest =
                                dest_groups * source_groups - pairs_to_dest;
                            CLUSTER_NAVIGATION_PROBABILITY * (pairs_to_dest / source_pairs)
                                + (1.0 - CLUSTER_NAVIGATION_PROBABILITY)
                                    * (non_paired_from_source_to_dest / non_paired_from_source)
                        };

                    let p_zz = transition_probability(c_zz, paired_z, o, o - 1.0);
                    let p_zx = transition_probability(c_xz, paired_z, o, a_rem);
                    let p_zy = transition_probability(c_yz, paired_z, o, b_rem);
                    let p_xz = transition_probability(c_xz, paired_x, a_rem, o);
                    let p_yz = transition_probability(c_yz, paired_y, b_rem, o);

                    let d1 = o / groups * c_req;
                    let d2 = (o * p_zz * c_req
                        - a_size * (a_rem * p_xz + o * p_zx)
                        - b_size * (b_rem * p_yz + o * p_zy))
                        / groups;

                    let value = p1 * d1 + p2 * d2;
                    // It need to have some runtime benefit of merging the chunks
                    if value < 0.0 {
                        continue;
                    }

                    if let Some((best_i1, best_i2, best_overlap, best_value)) =
                        best_combination.as_mut()
                    {
                        if (overlap.cmp(best_overlap)).then_with(|| value.total_cmp(best_value))
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
                    inputs,
                    chunk_groups,
                } = other;
                candidate.size += size;
                candidate.inputs.extend(inputs);
                candidate.chunk_groups = merge_chunk_groups(&candidate.chunk_groups, &chunk_groups);

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
                if unused.size > merge_threshold && unused.chunk_groups_len() > best_overlap {
                    heap.push(ChunkCandidate {
                        size: unused.size,
                        inputs: unused.inputs,
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
        let mut remained_inputs = Vec::new();
        for MergeCandidate {
            size,
            inputs,
            chunk_groups,
        } in chunks_to_merge.into_iter()
        {
            if size > merge_threshold {
                heap.push(ChunkCandidate {
                    size,
                    inputs,
                    chunk_groups,
                });
            } else {
                remained_size += size;
                remained_inputs.extend(inputs);
            }
        }

        // Left-over chunks are merged together forming the remained chunk, which includes
        // all modules that are not sharable
        if !remained_inputs.is_empty() {
            heap.push(ChunkCandidate {
                size: remained_size,
                inputs: remained_inputs,
                chunk_groups: None,
            });
        }
    }

    MergeOutcome {
        chunks: heap
            .into_iter()
            .map(|candidate| MergedChunk {
                size: candidate.size,
                inputs: candidate.inputs,
            })
            .collect(),
        iterations,
    }
}

struct ChunkCandidate<'l> {
    size: usize,
    /// Indices of the original inputs this candidate covers; more than one once merged.
    inputs: Vec<usize>,
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
    /// Indices of the original inputs this candidate covers; more than one once merged.
    inputs: Vec<usize>,
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
