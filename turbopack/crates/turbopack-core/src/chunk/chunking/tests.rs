//! Unit tests for the production chunk merge algorithm.
//!
//! The scenarios in the first section are ported from
//! <https://github.com/vercel/next.js/pull/90847>; the second section covers the chunking
//! heuristics (clusters, priority routes, request cost, first-page-load priority).

use std::borrow::Cow;

use roaring::RoaringBitmap;
use rustc_hash::FxHashMap;

use super::merge::{MergeInput, MergedChunk, merge_chunks};
use crate::{
    chunk::ChunkingConfig,
    module_graph::chunk_group_info::{ChunkingHeuristicsInfo, RoaringBitmapWrapper},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn bitmap(bits: &[u32]) -> RoaringBitmapWrapper {
    let mut bm = RoaringBitmap::new();
    for &b in bits {
        bm.insert(b);
    }
    RoaringBitmapWrapper(bm)
}

/// Chunk items requested by exactly the same chunk groups share a pre-merge group; that grouping
/// is `make_production_chunks`'s job, so replicate it here to keep these tests written in terms of
/// individual items.
///
/// Returns the merge inputs and, for each item, the index of the input it landed in.
fn group(
    data: &[(usize, RoaringBitmapWrapper)],
) -> (Vec<(usize, RoaringBitmapWrapper)>, Vec<usize>) {
    let mut groups: Vec<(usize, RoaringBitmapWrapper)> = Vec::new();
    let mut by_bitmap: FxHashMap<Vec<u8>, usize> = FxHashMap::default();
    let mut item_to_group = Vec::with_capacity(data.len());
    for (size, chunk_groups) in data {
        let mut key = Vec::new();
        chunk_groups.serialize_into(&mut key).unwrap();
        let index = *by_bitmap.entry(key).or_insert_with(|| {
            groups.push((0, chunk_groups.clone()));
            groups.len() - 1
        });
        groups[index].0 += size;
        item_to_group.push(index);
    }
    (groups, item_to_group)
}

fn inputs(groups: &[(usize, RoaringBitmapWrapper)]) -> Vec<MergeInput<'_>> {
    groups
        .iter()
        .map(|(size, chunk_groups)| MergeInput {
            size: *size,
            chunk_groups: Some(Cow::Borrowed(chunk_groups)),
        })
        .collect()
}

/// Group `data`, merge it, and return the resulting chunks alongside the item→input mapping.
fn merge(
    data: &[(usize, RoaringBitmapWrapper)],
    config: &ChunkingConfig,
    heuristics: &ChunkingHeuristicsInfo,
) -> (Vec<MergedChunk>, Vec<usize>) {
    let (groups, item_to_group) = group(data);
    let chunks = merge_chunks(inputs(&groups), config, heuristics).chunks;
    (chunks, item_to_group)
}

fn production_config() -> ChunkingConfig {
    ChunkingConfig {
        min_chunk_size: 50_000,
        max_chunk_count_per_group: 40,
        max_merge_chunk_size: 200_000,
        ..Default::default()
    }
}

fn no_heuristics() -> ChunkingHeuristicsInfo {
    ChunkingHeuristicsInfo::default()
}

fn chunks_containing(chunks: &[MergedChunk], input: usize) -> Vec<usize> {
    chunks
        .iter()
        .enumerate()
        .filter(|(_, chunk)| chunk.inputs.contains(&input))
        .map(|(index, _)| index)
        .collect()
}

fn assert_each_item_in_one_chunk(chunks: &[MergedChunk], item_to_group: &[usize]) {
    for (item, &input) in item_to_group.iter().enumerate() {
        let containing = chunks_containing(chunks, input);
        assert_eq!(
            containing.len(),
            1,
            "Item {item} should be in exactly one chunk, but found in {containing:?}",
        );
    }
}

fn assert_size_conserved(data: &[(usize, RoaringBitmapWrapper)], chunks: &[MergedChunk]) {
    let total_input_size: usize = data.iter().map(|(size, _)| size).sum();
    let total_output_size: usize = chunks.iter().map(|chunk| chunk.size).sum();
    assert_eq!(total_input_size, total_output_size);
}

/// The partition the merge produced, as a sorted list of sorted input-index groups, so two runs
/// can be compared regardless of chunk ordering.
fn partition(chunks: &[MergedChunk]) -> Vec<Vec<usize>> {
    let mut partition = chunks
        .iter()
        .map(|chunk| {
            let mut inputs = chunk.inputs.clone();
            inputs.sort_unstable();
            inputs
        })
        .collect::<Vec<_>>();
    partition.sort();
    partition
}

// ---------------------------------------------------------------------------
// Ported from #90847
// ---------------------------------------------------------------------------

/// 18 modules with bitmap {0,1} + 1 module (360 bytes) with bitmap {0,1,2}.
#[test]
fn near_duplicate_single_extra_module() {
    let mut data: Vec<(usize, RoaringBitmapWrapper)> = Vec::new();
    for _ in 0..18 {
        data.push((3_300, bitmap(&[0, 1])));
    }
    data.push((360, bitmap(&[0, 1, 2])));

    let (chunks, item_to_group) = merge(&data, &production_config(), &no_heuristics());

    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

#[test]
fn large_chunk_with_tiny_module() {
    let data = vec![(60_000, bitmap(&[0, 1])), (360, bitmap(&[0, 1, 2]))];
    let (chunks, item_to_group) = merge(&data, &production_config(), &no_heuristics());
    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

#[test]
fn sibling_pages_shared_layout() {
    let data = vec![
        (30_000, bitmap(&[0])),       // Header
        (25_000, bitmap(&[0])),       // Nav
        (15_000, bitmap(&[0, 1, 2])), // Shared lib
        (20_000, bitmap(&[1])),       // Page A
        (20_000, bitmap(&[2])),       // Page B
    ];
    let (chunks, item_to_group) = merge(&data, &production_config(), &no_heuristics());
    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

#[test]
fn deep_nesting() {
    let data = vec![
        (40_000, bitmap(&[0, 1, 2])), // Root header
        (30_000, bitmap(&[1, 2])),    // Section nav
        (20_000, bitmap(&[2])),       // Page content
        (10_000, bitmap(&[0, 1, 2])), // Shared util
    ];
    let (chunks, item_to_group) = merge(&data, &production_config(), &no_heuristics());
    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

#[test]
fn stable_output_regardless_of_input_order() {
    let base = [
        (30_000, bitmap(&[0, 1])),
        (25_000, bitmap(&[0, 1])),
        (20_000, bitmap(&[0])),
        (15_000, bitmap(&[1])),
    ];
    let config = production_config();

    let data_a: Vec<_> = [0, 1, 2, 3].iter().map(|&i| base[i].clone()).collect();
    let data_b: Vec<_> = [3, 2, 1, 0].iter().map(|&i| base[i].clone()).collect();

    let (chunks_a, _) = merge(&data_a, &config, &no_heuristics());
    let (chunks_b, _) = merge(&data_b, &config, &no_heuristics());

    assert_eq!(
        chunks_a.len(),
        chunks_b.len(),
        "Different input order produced different chunk count: {} vs {}",
        chunks_a.len(),
        chunks_b.len(),
    );
}

#[test]
fn characterize_current_behavior() {
    let mut data: Vec<(usize, RoaringBitmapWrapper)> = Vec::new();

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

    let (chunks, item_to_group) = merge(&data, &production_config(), &no_heuristics());

    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

#[test]
fn no_merging_config() {
    let data = vec![
        (100, bitmap(&[0, 1])),
        (200, bitmap(&[0, 1])),
        (300, bitmap(&[2])),
    ];

    let config = ChunkingConfig {
        min_chunk_size: 0,
        max_chunk_count_per_group: 0,
        max_merge_chunk_size: 0,
        ..Default::default()
    };

    let (chunks, item_to_group) = merge(&data, &config, &no_heuristics());

    assert_eq!(
        chunks.len(),
        2,
        "Should have 2 chunks (one per unique bitmap), got {}",
        chunks.len()
    );
    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
}

// ---------------------------------------------------------------------------
// Chunking heuristics
// ---------------------------------------------------------------------------

/// A scenario tuned so that the merge of A and B is *just* not worth it under the default
/// heuristics, which makes it a sensitive probe: any knob that raises the value of merging flips
/// the outcome.
///
/// - **A** and **B** are requested by four chunk groups and overlap on two of them (`1` and `2`)
/// - **C** shares no chunk group with either, so it never merges
///
/// Every input is below `min_chunk_size`, so all three start out as merge candidates.
fn probe_data() -> Vec<(usize, RoaringBitmapWrapper)> {
    vec![
        (400_000, bitmap(&[0, 1, 2])), // A
        (400_000, bitmap(&[1, 2, 3])), // B
        (400_000, bitmap(&[4, 5])),    // C
    ]
}

fn probe_config() -> ChunkingConfig {
    ChunkingConfig {
        min_chunk_size: 500_000,
        max_chunk_count_per_group: 0,
        max_merge_chunk_size: 0,
        ..Default::default()
    }
}

/// Run the probe scenario, checking the invariants that hold whatever the heuristics say.
fn probe(config: &ChunkingConfig, heuristics: &ChunkingHeuristicsInfo) -> Vec<MergedChunk> {
    let data = probe_data();
    let (chunks, item_to_group) = merge(&data, config, heuristics);
    assert_each_item_in_one_chunk(&chunks, &item_to_group);
    assert_size_conserved(&data, &chunks);
    chunks
}

/// The probe under plain defaults, for a test to compare its own result against.
fn probe_baseline() -> Vec<MergedChunk> {
    let baseline = probe(&probe_config(), &no_heuristics());
    assert_not_merged(&baseline, "baseline");
    baseline
}

/// Merging A and B was judged worthwhile: they form a chunk of their own and C is left over.
const MERGED: [[usize; 2]; 1] = [[0, 1]];
/// No merge was judged worthwhile, so all three inputs fall through to the leftover chunk.
const NOT_MERGED: [[usize; 3]; 1] = [[0, 1, 2]];

fn assert_merged(chunks: &[MergedChunk], case: &str) {
    let partition = partition(chunks);
    assert_eq!(
        partition.len(),
        2,
        "{case}: expected 2 chunks, got {partition:?}"
    );
    assert_eq!(
        partition[0], MERGED[0],
        "{case}: A and B should be merged, got {partition:?}"
    );
    assert_eq!(
        partition[1],
        vec![2],
        "{case}: C should stand alone, got {partition:?}"
    );
}

fn assert_not_merged(chunks: &[MergedChunk], case: &str) {
    let partition = partition(chunks);
    assert_eq!(
        partition,
        vec![NOT_MERGED[0].to_vec()],
        "{case}: nothing should merge deliberately, got {partition:?}",
    );
}

/// The baseline every test below compares against.
#[test]
fn probe_does_not_merge_by_default() {
    probe_baseline();
}

/// A cluster over the two shared chunk groups says visitors move between them, which raises the
/// chance the merged chunk is reused on the next navigation.
#[test]
fn clusters_make_merging_worthwhile() {
    probe_baseline();

    let heuristics = ChunkingHeuristicsInfo {
        // Chunk groups 1 and 2 — the overlap between A and B — are in cluster 0.
        clusters: vec![vec![], vec![0], vec![0], vec![], vec![], vec![]],
        ..Default::default()
    };
    assert_merged(&probe(&probe_config(), &heuristics), "overlap co-clustered");
}

/// Clustering the two chunk groups that *don't* overlap also makes the merge worthwhile, by the
/// opposite route: traffic from the A-only group now mostly goes to the B-only group rather than
/// into the shared groups, so the bytes the merge adds are fetched less often.
#[test]
fn clusters_outside_the_overlap_also_make_merging_worthwhile() {
    probe_baseline();

    let heuristics = ChunkingHeuristicsInfo {
        // Chunk groups 0 and 3 are A-only and B-only respectively.
        clusters: vec![vec![0], vec![], vec![], vec![0], vec![], vec![]],
        ..Default::default()
    };
    assert_merged(
        &probe(&probe_config(), &heuristics),
        "clusters outside the overlap",
    );
}

/// A cluster is a statement about *relative* likelihood, so one that contains every chunk group
/// involved says nothing: the transition probabilities come out identical to having no clusters
/// at all, so the whole partition must match the baseline, not merely stay unmerged.
#[test]
fn a_cluster_over_everything_changes_nothing() {
    let baseline = probe_baseline();

    let heuristics = ChunkingHeuristicsInfo {
        clusters: vec![vec![0]; 6],
        ..Default::default()
    };
    assert_eq!(
        partition(&probe(&probe_config(), &heuristics)),
        partition(&baseline),
        "one cluster over every chunk group should decide exactly as no clusters does",
    );
}

/// A priority route through the overlap boosts `P(N = 1)`, which weights the first-page-load
/// saving over the navigation cost.
#[test]
fn priority_routes_make_merging_worthwhile() {
    probe_baseline();

    let heuristics = ChunkingHeuristicsInfo {
        // Chunk group 1 is in the overlap between A and B.
        priority_routes: bitmap(&[1]),
        ..Default::default()
    };
    assert_merged(
        &probe(&probe_config(), &heuristics),
        "priority route over the overlap",
    );
}

/// Only a priority route *through the overlap* earns the boost, since that is the traffic a
/// merged chunk would serve. One that misses it leaves the decision exactly where it was.
#[test]
fn priority_routes_outside_the_overlap_do_not_apply() {
    let baseline = probe_baseline();

    let heuristics = ChunkingHeuristicsInfo {
        // Chunk group 4 only requests C.
        priority_routes: bitmap(&[4]),
        ..Default::default()
    };
    assert_eq!(
        partition(&probe(&probe_config(), &heuristics)),
        partition(&baseline),
        "a priority route away from the overlap should decide exactly as no heuristics does",
    );
}

/// The priority boost is what turns a priority route into a merge; neutralising it (100% = 1.0x)
/// leaves the decision where it started.
#[test]
fn priority_boost_controls_the_priority_route_effect() {
    // The route is held constant across both halves, so the boost is the only variable.
    let heuristics = ChunkingHeuristicsInfo {
        priority_routes: bitmap(&[1]),
        ..Default::default()
    };

    let neutral = ChunkingConfig {
        priority_boost_percent: Some(100),
        ..probe_config()
    };
    assert_not_merged(&probe(&neutral, &heuristics), "priority boost 1.0x");

    let boosted = ChunkingConfig {
        priority_boost_percent: Some(150),
        ..probe_config()
    };
    assert_merged(&probe(&boosted, &heuristics), "priority boost 1.5x");
}

/// `first_page_load_priority` is `P(N = 1)` directly. At 100% only the first-page-load term
/// counts, and that term can never favour splitting.
#[test]
fn first_page_load_priority_shifts_the_tradeoff() {
    let all_first_load = ChunkingConfig {
        first_page_load_priority: Some(100),
        ..probe_config()
    };
    assert_merged(
        &probe(&all_first_load, &no_heuristics()),
        "first_page_load_priority 100%",
    );

    let all_navigation = ChunkingConfig {
        first_page_load_priority: Some(1),
        ..probe_config()
    };
    assert_not_merged(
        &probe(&all_navigation, &no_heuristics()),
        "first_page_load_priority 1%",
    );
}

/// The whole trade-off is requests against bytes, so a costlier request buys more merging.
#[test]
fn request_cost_shifts_the_tradeoff() {
    let expensive = ChunkingConfig {
        request_cost: Some(5_000_000),
        ..probe_config()
    };
    assert_merged(&probe(&expensive, &no_heuristics()), "expensive requests");

    let cheap = ChunkingConfig {
        request_cost: Some(10),
        ..probe_config()
    };
    assert_not_merged(&probe(&cheap, &no_heuristics()), "cheap requests");
}
