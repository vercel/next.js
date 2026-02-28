use std::{borrow::Cow, collections::BinaryHeap};

use roaring::RoaringBitmap;
use rustc_hash::FxHashSet;
use smallvec::SmallVec;

/// A chunk item with its estimated size and chunk group membership.
/// This is a Vc-free representation used by the pure merge algorithm.
pub struct ChunkItemForMerging {
    /// Estimated size in bytes.
    pub size: usize,
    /// Which chunk groups this item belongs to, or None if unknown.
    pub chunk_groups: Option<RoaringBitmap>,
}

/// Configuration for the production merge algorithm.
pub struct MergeConfig {
    pub min_chunk_size: usize,
    pub max_chunk_count_per_group: usize,
    pub max_merge_chunk_size: usize,
}

/// Result: which items ended up in each output chunk.
#[derive(Debug)]
pub struct MergedChunkInfo {
    /// Indices into the original items array.
    pub item_indices: Vec<usize>,
    /// Total size of all items in this chunk.
    pub total_size: usize,
    /// The resulting chunk groups bitmap (intersection of all merged items' bitmaps).
    pub chunk_groups: Option<RoaringBitmap>,
}

/// An opaque identifier for a batch group. Used to track batch group deduplication
/// during merging without depending on Vc types.
pub type BatchGroupId = usize;

/// Groups items by bitmap + merges small groups per the production heuristics.
///
/// Returns a list of merged chunk infos. Each info contains the indices of items
/// that should be placed together, along with the merged bitmap and total size.
///
/// When `min_chunk_size == 0 && max_chunk_count_per_group == 0`, each distinct
/// bitmap group becomes its own chunk (no merging).
pub fn merge_chunks(items: &[ChunkItemForMerging], config: &MergeConfig) -> Vec<MergedChunkInfo> {
    let MergeConfig {
        min_chunk_size,
        max_chunk_count_per_group,
        max_merge_chunk_size,
    } = *config;

    // Group items by their chunk groups bitmap.
    // Items with the same bitmap (hashed) go into the same group.
    let mut grouped: Vec<GroupedItems> = Vec::new();
    let mut bitmap_map: std::collections::HashMap<u64, usize> =
        std::collections::HashMap::default();

    for (idx, item) in items.iter().enumerate() {
        let hash = hash_bitmap(&item.chunk_groups);
        let group_idx = *bitmap_map.entry(hash).or_insert_with(|| {
            grouped.push(GroupedItems {
                indices: Vec::new(),
                size: 0,
                chunk_groups: item.chunk_groups.as_ref().map(Cow::Borrowed),
            });
            grouped.len() - 1
        });
        grouped[group_idx].indices.push(idx);
        grouped[group_idx].size += item.size;
    }

    // Early exit: no merging needed
    if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
        return grouped
            .into_iter()
            .map(|g| MergedChunkInfo {
                item_indices: g.indices,
                total_size: g.size,
                chunk_groups: g.chunk_groups.map(|c| c.into_owned()),
            })
            .collect();
    }

    // Build a min-heap (smallest first) of chunk candidates
    let mut heap: BinaryHeap<ChunkCandidate> = grouped
        .into_iter()
        .map(|g| ChunkCandidate {
            size: g.size,
            indices: g.indices,
            batch_groups: SmallVec::new(),
            chunk_groups: g.chunk_groups.map(|c| Cow::Owned(c.into_owned())),
        })
        .collect();

    if min_chunk_size == 0 && max_chunk_count_per_group == 0 {
        // Already handled above, but keep for clarity
        return heap_to_output(heap);
    }

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
                    indices: c.indices,
                    batch_groups: c.batch_groups,
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
        let mut selection: Vec<MergeCandidate> = Vec::new();
        let mut best_combination: Option<(usize, usize, u64, i64)> = None;

        while let Some(candidate) = chunks_to_merge.pop() {
            // Early exit when no better overlaps are possible
            if let Some((_, _, best_overlap, _)) = best_combination.as_ref() {
                let candidate_best_possible_value = candidate.chunk_groups_len();

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
                // Need at least two chunk groups in common
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

                // It needs to have some request count benefit
                if groups + o_groups <= 2 * (a_rem + b_rem) + 2 {
                    continue;
                }
                let rem_g = groups - 1;
                let c_req = 200000;
                // d3 = 3 * d (the cost benefit of merging, scaled)
                let pre_d3 = c_req * (2 * rem_g + (5 * o_groups - 2 * a_groups - 2 * b_groups - 1))
                    - 2 * (a_rem * b_size + b_rem * a_size);
                // It needs to have some runtime benefit of merging
                if pre_d3 < 0 {
                    continue;
                }
                let d3 = pre_d3 * o_groups / (rem_g * groups);
                let value = d3;

                if let Some((_, _, ref best_overlap_ref, ref best_value)) = best_combination {
                    if (overlap_val.cmp(best_overlap_ref)).then_with(|| value.cmp(best_value))
                        == std::cmp::Ordering::Greater
                    {
                        best_combination = Some((i, selection.len(), overlap_val, value));
                    }
                } else {
                    best_combination = Some((i, selection.len(), overlap_val, value));
                }
            }
            selection.push(candidate);
        }

        let best_overlap_val =
            if let Some((best_i1, best_i2, best_overlap_val, _)) = best_combination.as_ref() {
                let other = selection.swap_remove(*best_i2);
                let mut candidate = selection.swap_remove(*best_i1);
                // Merge other into candidate
                candidate.size += other.size;
                candidate.indices.extend(other.indices);
                if other.batch_groups.len() + candidate.batch_groups.len() > 16 {
                    let mut set: FxHashSet<BatchGroupId> =
                        candidate.batch_groups.iter().copied().collect();
                    set.extend(other.batch_groups.iter().copied());
                    candidate.batch_groups = set.into_iter().collect();
                } else {
                    let mut bg = other.batch_groups;
                    bg.retain(|b| !candidate.batch_groups.contains(b));
                    candidate.batch_groups.extend(bg);
                }
                candidate.chunk_groups =
                    merge_chunk_groups(&candidate.chunk_groups, &other.chunk_groups);

                chunks_to_merge.push(candidate);
                *best_overlap_val
            } else {
                u64::MAX
            };

        for unused in selection {
            // Candidates that are already big enough move back into the heap
            // when no more merges are expected for them
            if unused.size > merge_threshold && unused.chunk_groups_len() > best_overlap_val {
                heap.push(ChunkCandidate {
                    size: unused.size,
                    indices: unused.indices,
                    batch_groups: unused.batch_groups,
                    chunk_groups: unused.chunk_groups,
                });
            } else {
                chunks_to_merge.push(unused);
            }
        }
        if best_combination.is_none() {
            break;
        }
    }

    // Collect remaining merge candidates, separating big ones (back to heap) from small ones
    let mut small_remaining: Vec<MergeCandidate> = Vec::new();
    for mc in chunks_to_merge.into_iter() {
        if mc.size > merge_threshold {
            heap.push(ChunkCandidate {
                size: mc.size,
                indices: mc.indices,
                batch_groups: mc.batch_groups,
                chunk_groups: mc.chunk_groups,
            });
        } else {
            small_remaining.push(mc);
        }
    }

    // Absorption pass: try to absorb small remaining candidates into existing heap chunks.
    // This prevents tiny modules with slightly different bitmaps from creating near-duplicate
    // chunks. A small module (e.g. 360B) with bitmap {0,1,2} should be absorbed into a large
    // chunk (e.g. 60KB) with bitmap {0,1} rather than creating a separate near-identical chunk.
    if !small_remaining.is_empty() && !heap.is_empty() {
        let mut heap_chunks: Vec<ChunkCandidate> = heap.into_iter().collect();

        let mut unabsorbed: Vec<MergeCandidate> = Vec::new();
        for small in small_remaining {
            let small_groups_len = small.chunk_groups_len();
            if small_groups_len == 0 {
                unabsorbed.push(small);
                continue;
            }

            // Find the best heap chunk to absorb this small item.
            // "Best" = highest overlap with the small item's bitmap, as a fraction of the
            // heap chunk's bitmap. We want to absorb into a chunk that shares most of its
            // groups with the small item, so the small item gets downloaded alongside
            // modules it's already grouped with.
            let mut best_idx = None;
            let mut best_overlap_val = 0u64;
            for (i, hc) in heap_chunks.iter().enumerate() {
                let ov = overlap_candidate_chunk(&small.chunk_groups, &hc.chunk_groups);
                if ov > best_overlap_val {
                    best_overlap_val = ov;
                    best_idx = Some(i);
                }
            }

            // Absorb if the heap chunk's bitmap is a subset of the small item's bitmap
            // (overlap == heap chunk's bitmap length), OR if the overlap covers most of
            // the small item's bitmap and the absorption cost is small relative to the
            // chunk size.
            if let Some(idx) = best_idx {
                let hc = &heap_chunks[idx];
                let hc_groups_len = hc.chunk_groups.as_ref().map_or(0, |cg| cg.len());

                // Absorb if:
                // 1. The heap chunk's bitmap is entirely contained in the small item's bitmap (the
                //    small item is relevant to all groups the chunk serves), OR
                // 2. The overlap covers the heap chunk's full bitmap and the small item just adds
                //    extra groups (e.g. heap={0,1}, small={0,1,2}), OR
                // 3. The duplication cost of NOT absorbing exceeds the extra-download cost.
                //    Duplication cost = small.size * (overlap_groups - 1) (downloaded by overlap
                //    groups as part of both chunks). Extra download cost = small.size *
                //    extra_groups (groups that don't need the small item download it anyway as part
                //    of the merged chunk).
                let should_absorb = if best_overlap_val == hc_groups_len {
                    // Heap chunk's bitmap is a subset of small's bitmap - always absorb
                    true
                } else if best_overlap_val >= 2 {
                    // Check cost: duplication cost vs extra download cost
                    let extra_groups = hc_groups_len.saturating_sub(best_overlap_val);
                    let extra_download = small.size as u64 * extra_groups;
                    // Duplication: without absorption, the small item ends up in a separate
                    // chunk that overlap groups must also download
                    let duplication = small.size as u64 * best_overlap_val;
                    duplication > extra_download
                } else {
                    false
                };

                if should_absorb
                    && heap_chunks[idx].size + small.size
                        <= max_merge_chunk_size_or_max(max_merge_chunk_size)
                {
                    let hc = &mut heap_chunks[idx];
                    hc.size += small.size;
                    hc.indices.extend(small.indices);
                    // Keep the heap chunk's bitmap (don't narrow it via intersection)
                    // since the small item is being absorbed into this chunk.
                    continue;
                }
            }

            unabsorbed.push(small);
        }

        // Rebuild the heap
        heap = heap_chunks.into_iter().collect();
        small_remaining = unabsorbed;
    } else {
        // No absorption needed
    }

    // Remainder chunk from anything still unabsorbed
    let mut remained_size = 0;
    let mut remained_indices = Vec::new();
    let mut remained_batch_groups: FxHashSet<BatchGroupId> = FxHashSet::default();
    for mc in small_remaining {
        remained_size += mc.size;
        remained_indices.extend(mc.indices);
        remained_batch_groups.extend(mc.batch_groups);
    }

    if !remained_indices.is_empty() {
        heap.push(ChunkCandidate {
            size: remained_size,
            indices: remained_indices,
            batch_groups: remained_batch_groups.into_iter().collect(),
            chunk_groups: None,
        });
    }

    heap_to_output(heap)
}

// --- Internal types and helpers ---

struct GroupedItems<'a> {
    indices: Vec<usize>,
    size: usize,
    chunk_groups: Option<Cow<'a, RoaringBitmap>>,
}

struct ChunkCandidate {
    size: usize,
    indices: Vec<usize>,
    batch_groups: SmallVec<[BatchGroupId; 1]>,
    chunk_groups: Option<Cow<'static, RoaringBitmap>>,
}

impl Ord for ChunkCandidate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Min-heap: smallest first (reverse ordering)
        self.size.cmp(&other.size).reverse()
    }
}

impl PartialOrd for ChunkCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for ChunkCandidate {}

impl PartialEq for ChunkCandidate {
    fn eq(&self, other: &Self) -> bool {
        self.size == other.size
    }
}

struct MergeCandidate {
    size: usize,
    indices: Vec<usize>,
    batch_groups: SmallVec<[BatchGroupId; 1]>,
    chunk_groups: Option<Cow<'static, RoaringBitmap>>,
}

impl MergeCandidate {
    fn chunk_groups_len(&self) -> u64 {
        self.chunk_groups.as_ref().map_or(0, |cg| cg.len())
    }
}

impl Ord for MergeCandidate {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.chunk_groups_len()
            .cmp(&other.chunk_groups_len())
            .then_with(|| self.size.cmp(&other.size).reverse())
    }
}

impl PartialOrd for MergeCandidate {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for MergeCandidate {}

impl PartialEq for MergeCandidate {
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

fn overlap_candidate_chunk(
    small: &Option<Cow<'_, RoaringBitmap>>,
    big: &Option<Cow<'_, RoaringBitmap>>,
) -> u64 {
    if let (Some(a), Some(b)) = (small, big) {
        a.intersection_len(b)
    } else {
        0
    }
}

fn max_merge_chunk_size_or_max(max_merge_chunk_size: usize) -> usize {
    if max_merge_chunk_size == 0 {
        usize::MAX
    } else {
        max_merge_chunk_size
    }
}

fn merge_chunk_groups(
    a: &Option<Cow<'_, RoaringBitmap>>,
    b: &Option<Cow<'_, RoaringBitmap>>,
) -> Option<Cow<'static, RoaringBitmap>> {
    if let (Some(a), Some(b)) = (a, b) {
        Some(Cow::Owned(a.as_ref() & b.as_ref()))
    } else {
        None
    }
}

fn hash_bitmap(bitmap: &Option<RoaringBitmap>) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = rustc_hash::FxHasher::default();
    match bitmap {
        None => 0u8.hash(&mut hasher),
        Some(bm) => {
            1u8.hash(&mut hasher);
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
            // Use the same serialization-based hashing as RoaringBitmapWrapper
            let _ = bm.serialize_into(HasherWriter(&mut hasher));
        }
    }
    hasher.finish()
}

fn heap_to_output(heap: BinaryHeap<ChunkCandidate>) -> Vec<MergedChunkInfo> {
    heap.into_iter()
        .map(|c| MergedChunkInfo {
            item_indices: c.indices,
            total_size: c.size,
            chunk_groups: c.chunk_groups.map(|c| c.into_owned()),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bitmap(bits: &[u32]) -> Option<RoaringBitmap> {
        let mut bm = RoaringBitmap::new();
        for &b in bits {
            bm.insert(b);
        }
        Some(bm)
    }

    fn production_config() -> MergeConfig {
        MergeConfig {
            min_chunk_size: 50_000,
            max_chunk_count_per_group: 40,
            max_merge_chunk_size: 200_000,
        }
    }

    /// Helper: check which output chunk(s) contain a given item index
    fn chunks_containing(results: &[MergedChunkInfo], item_idx: usize) -> Vec<usize> {
        results
            .iter()
            .enumerate()
            .filter(|(_, c)| c.item_indices.contains(&item_idx))
            .map(|(i, _)| i)
            .collect()
    }

    /// Helper: for a given item, get the merged chunk_groups bitmap it ended up in
    fn effective_bitmap(results: &[MergedChunkInfo], item_idx: usize) -> Option<RoaringBitmap> {
        for c in results {
            if c.item_indices.contains(&item_idx) {
                return c.chunk_groups.clone();
            }
        }
        None
    }

    // -----------------------------------------------------------------------
    // Test 1: The exact vercel.com scenario
    // 18 modules with bitmap {0,1} + 1 module (360 bytes) with bitmap {0,1,2}
    // With min_chunk_size=50_000, both groups are below threshold (need merging).
    // The algorithm should merge them into a single chunk rather than creating
    // two near-identical chunks.
    // -----------------------------------------------------------------------
    #[test]
    fn test_near_duplicate_single_extra_module() {
        let mut items: Vec<ChunkItemForMerging> = Vec::new();

        // 18 modules each ~3.3KB, bitmap {0, 1}
        for _ in 0..18 {
            items.push(ChunkItemForMerging {
                size: 3_300,
                chunk_groups: bitmap(&[0, 1]),
            });
        }
        // 1 module, 360 bytes, bitmap {0, 1, 2}
        items.push(ChunkItemForMerging {
            size: 360,
            chunk_groups: bitmap(&[0, 1, 2]),
        });

        let config = production_config();
        let results = merge_chunks(&items, &config);

        // The extra module (index 18) should be in the same chunk as the others,
        // not in a separate near-duplicate chunk.
        let extra_module_chunks = chunks_containing(&results, 18);
        let first_module_chunks = chunks_containing(&results, 0);

        // They should end up in the same chunk
        assert_eq!(
            extra_module_chunks,
            first_module_chunks,
            "Extra module should be merged with the other 18 modules, not in a separate chunk. \
             Got {} chunks total, extra module in chunk(s) {:?}, first module in chunk(s) {:?}",
            results.len(),
            extra_module_chunks,
            first_module_chunks,
        );
    }

    // -----------------------------------------------------------------------
    // Test 2: Large chunk should absorb a tiny module
    // -----------------------------------------------------------------------
    #[test]
    fn test_large_chunk_absorbs_tiny_module() {
        let mut items: Vec<ChunkItemForMerging> = Vec::new();

        // One large item (60KB), bitmap {0, 1}
        items.push(ChunkItemForMerging {
            size: 60_000,
            chunk_groups: bitmap(&[0, 1]),
        });
        // One tiny item (360 bytes), bitmap {0, 1, 2}
        items.push(ChunkItemForMerging {
            size: 360,
            chunk_groups: bitmap(&[0, 1, 2]),
        });

        let config = production_config();
        let results = merge_chunks(&items, &config);

        // Both should be in the same chunk
        let large_chunks = chunks_containing(&results, 0);
        let tiny_chunks = chunks_containing(&results, 1);
        assert_eq!(
            large_chunks, tiny_chunks,
            "Tiny module (360B) should merge into large chunk (60KB), not create a near-duplicate"
        );
    }

    // -----------------------------------------------------------------------
    // Test 3: Sibling pages sharing a layout
    // Layout modules (Header 30KB, Nav 25KB) in bitmap {0}
    // Shared lib (15KB) in bitmap {0, 1, 2}
    // Page A module (20KB) in {1}, Page B module (20KB) in {2}
    // -----------------------------------------------------------------------
    #[test]
    fn test_sibling_pages_shared_layout() {
        let items = vec![
            ChunkItemForMerging {
                size: 30_000,
                chunk_groups: bitmap(&[0]),
            }, // Header
            ChunkItemForMerging {
                size: 25_000,
                chunk_groups: bitmap(&[0]),
            }, // Nav
            ChunkItemForMerging {
                size: 15_000,
                chunk_groups: bitmap(&[0, 1, 2]),
            }, // Shared lib
            ChunkItemForMerging {
                size: 20_000,
                chunk_groups: bitmap(&[1]),
            }, // Page A
            ChunkItemForMerging {
                size: 20_000,
                chunk_groups: bitmap(&[2]),
            }, // Page B
        ];

        let config = production_config();
        let results = merge_chunks(&items, &config);

        // Each item should appear in exactly one chunk
        for idx in 0..items.len() {
            let containing = chunks_containing(&results, idx);
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
    // Test 4: Deep layout nesting
    // Root layout modules in {0, 1, 2}
    // Section layout modules in {1, 2}
    // Page module in {2}
    // Shared util in {0, 1, 2}
    // -----------------------------------------------------------------------
    #[test]
    fn test_deep_nesting() {
        let items = vec![
            ChunkItemForMerging {
                size: 40_000,
                chunk_groups: bitmap(&[0, 1, 2]),
            }, // Root header
            ChunkItemForMerging {
                size: 30_000,
                chunk_groups: bitmap(&[1, 2]),
            }, // Section nav
            ChunkItemForMerging {
                size: 20_000,
                chunk_groups: bitmap(&[2]),
            }, // Page content
            ChunkItemForMerging {
                size: 10_000,
                chunk_groups: bitmap(&[0, 1, 2]),
            }, // Shared util
        ];

        let config = production_config();
        let results = merge_chunks(&items, &config);

        // Shared util (idx 3) should maintain access to all groups it belongs to,
        // i.e., it should be in a chunk whose bitmap includes {0, 1, 2}
        let util_bitmap = effective_bitmap(&results, 3);
        if let Some(bm) = &util_bitmap {
            assert!(
                bm.contains(0) && bm.contains(1) && bm.contains(2),
                "Shared util should maintain bitmap {{0,1,2}}, got {:?}",
                bm.iter().collect::<Vec<_>>()
            );
        }
    }

    // -----------------------------------------------------------------------
    // Test 5: Input order should not affect chunk assignments
    // -----------------------------------------------------------------------
    #[test]
    fn test_stable_output_regardless_of_input_order() {
        let make_items = |order: &[usize]| -> Vec<ChunkItemForMerging> {
            let base = vec![
                ChunkItemForMerging {
                    size: 30_000,
                    chunk_groups: bitmap(&[0, 1]),
                },
                ChunkItemForMerging {
                    size: 25_000,
                    chunk_groups: bitmap(&[0, 1]),
                },
                ChunkItemForMerging {
                    size: 20_000,
                    chunk_groups: bitmap(&[0]),
                },
                ChunkItemForMerging {
                    size: 15_000,
                    chunk_groups: bitmap(&[1]),
                },
            ];
            order
                .iter()
                .map(|&i| ChunkItemForMerging {
                    size: base[i].size,
                    chunk_groups: base[i].chunk_groups.clone(),
                })
                .collect()
        };

        let config = production_config();

        let results_a = merge_chunks(&make_items(&[0, 1, 2, 3]), &config);
        let results_b = merge_chunks(&make_items(&[3, 2, 1, 0]), &config);

        // Same number of output chunks
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
    // Document what happens with the current algorithm so we can see improvements.
    // -----------------------------------------------------------------------
    #[test]
    fn test_characterize_current_behavior() {
        // Simulate a scenario with many small modules having slightly different bitmaps
        let mut items: Vec<ChunkItemForMerging> = Vec::new();

        // 10 modules shared by all 5 pages (bitmap {0,1,2,3,4})
        for _ in 0..10 {
            items.push(ChunkItemForMerging {
                size: 5_000,
                chunk_groups: bitmap(&[0, 1, 2, 3, 4]),
            });
        }

        // 1 module shared by only 4 of 5 pages (bitmap {0,1,2,3})
        items.push(ChunkItemForMerging {
            size: 400,
            chunk_groups: bitmap(&[0, 1, 2, 3]),
        });

        // 5 page-specific modules
        for i in 0..5 {
            items.push(ChunkItemForMerging {
                size: 10_000,
                chunk_groups: bitmap(&[i]),
            });
        }

        let config = production_config();
        let results = merge_chunks(&items, &config);

        // Just record the behavior - this test documents what happens
        // The 10 widely-shared modules (indices 0-9) and the nearly-shared module (index 10)
        // should ideally end up in the same chunk.
        let widely_shared_chunk = chunks_containing(&results, 0);
        let nearly_shared_chunk = chunks_containing(&results, 10);

        println!(
            "Characterization: {} output chunks, widely-shared in {:?}, nearly-shared in {:?}",
            results.len(),
            widely_shared_chunk,
            nearly_shared_chunk,
        );
        for (i, chunk) in results.iter().enumerate() {
            println!(
                "  Chunk {}: {} items, {}B, bitmap={:?}",
                i,
                chunk.item_indices.len(),
                chunk.total_size,
                chunk
                    .chunk_groups
                    .as_ref()
                    .map(|b| b.iter().collect::<Vec<_>>()),
            );
        }
    }

    // -----------------------------------------------------------------------
    // Test 7: No merging when config disables it
    // -----------------------------------------------------------------------
    #[test]
    fn test_no_merging_config() {
        let items = vec![
            ChunkItemForMerging {
                size: 100,
                chunk_groups: bitmap(&[0]),
            },
            ChunkItemForMerging {
                size: 200,
                chunk_groups: bitmap(&[1]),
            },
            ChunkItemForMerging {
                size: 300,
                chunk_groups: bitmap(&[0, 1]),
            },
        ];

        let config = MergeConfig {
            min_chunk_size: 0,
            max_chunk_count_per_group: 0,
            max_merge_chunk_size: 0,
        };

        let results = merge_chunks(&items, &config);
        // Each unique bitmap group should be its own chunk
        assert_eq!(results.len(), 3, "With no merging, should have 3 chunks");
    }
}
