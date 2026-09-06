//! Pure (no-Vc) graph algorithms underlying the graph-based CSS chunker.
//!
//! Direct port of the proof-of-concept TypeScript implementation. See the parent module's
//! documentation for the high-level pipeline.

use std::{
    cmp::Reverse,
    collections::{BinaryHeap, VecDeque},
};

use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::FxIndexMap;

use super::subgraph_view::{ReadonlyGraph, SubgraphView};
use crate::module::StyleType;

// ---------------------------------------------------------------------------
// create_graph
// ---------------------------------------------------------------------------

/// The index of a chunk group, as ordered by the caller of [`create_graph`].
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub(super) struct ChunkGroupIndex(pub(super) usize);

/// Per-module chunk-group membership: for each module id, the **ascending** list of chunk groups
/// that contain it. The sorted invariant is what lets [`ModuleChunkGroups::shared`] intersect two
/// modules' lists with a single linear merge; [`create_graph`] preserves it by appending groups in
/// index order. Reading membership from here (rather than post-[`make_acyclic`] edge weights) keeps
/// the co-occurrence signal lossless.
pub(super) struct ModuleChunkGroups {
    per_module: Vec<Vec<ChunkGroupIndex>>,
}

impl ModuleChunkGroups {
    /// Number of chunk groups that contain both module `a` and module `b`. Runs in
    /// O(min(|groups_a|, |groups_b|)) thanks to the ascending invariant.
    pub(super) fn shared(&self, a: NodeIndex, b: NodeIndex) -> usize {
        let a_groups = &self.per_module[a.index()];
        let b_groups = &self.per_module[b.index()];
        let mut count = 0;
        let mut i = 0;
        let mut j = 0;
        while i < a_groups.len() && j < b_groups.len() {
            match a_groups[i].cmp(&b_groups[j]) {
                std::cmp::Ordering::Equal => {
                    count += 1;
                    i += 1;
                    j += 1;
                }
                std::cmp::Ordering::Less => i += 1,
                std::cmp::Ordering::Greater => j += 1,
            }
        }
        count
    }

    /// Build directly from per-module group lists, each of which must already be ascending. For
    /// tests and callers that assemble the lists themselves.
    #[cfg(test)]
    pub(super) fn from_sorted(per_module: Vec<Vec<usize>>) -> Self {
        Self {
            per_module: per_module
                .into_iter()
                .map(|groups| groups.into_iter().map(ChunkGroupIndex).collect())
                .collect(),
        }
    }

    /// The (ascending) chunk groups containing `module`. For tests/inspection.
    #[cfg(test)]
    pub(super) fn groups_of(&self, module: usize) -> &[ChunkGroupIndex] {
        &self.per_module[module]
    }
}

/// Build a directed weighted graph from `chunk_groups`.
///
/// For each group `[m₀, m₁, ..., mₖ]` and every pair `(later, earlier)` with `later > earlier`
/// inside the group, an edge `later → earlier` is added (weight 1). Repeated edges accumulate.
/// `node_count` is the total number of distinct module ids referenced; node ids are dense in
/// `0..node_count`.
///
/// Also returns the [`ModuleChunkGroups`] index, used by [`linearize`] to count shared chunk groups
/// between two modules.
pub(super) fn create_graph(
    chunk_groups: &[Vec<usize>],
    node_count: usize,
) -> (DiGraph<usize, u32>, ModuleChunkGroups) {
    let mut graph: DiGraph<usize, u32> = DiGraph::with_capacity(node_count, 0);
    let mut per_module: Vec<Vec<ChunkGroupIndex>> = vec![Vec::new(); node_count];
    for i in 0..node_count {
        let idx = graph.add_node(i);
        debug_assert_eq!(idx.index(), i);
    }
    let mut edge_index: FxHashMap<(NodeIndex, NodeIndex), EdgeIndex> = FxHashMap::default();
    for (group_idx, group) in chunk_groups.iter().enumerate() {
        // Appended in ascending `group_idx` order, preserving `ModuleChunkGroups`' sorted
        // invariant.
        for &module_id in group {
            per_module[module_id].push(ChunkGroupIndex(group_idx));
        }
        for (i, &later_id) in group.iter().enumerate() {
            let later = NodeIndex::new(later_id);
            for &earlier_id in &group[..i] {
                let earlier = NodeIndex::new(earlier_id);
                match edge_index.get(&(later, earlier)) {
                    Some(&e) => {
                        let w = graph.edge_weight_mut(e).unwrap();
                        *w += 1;
                    }
                    None => {
                        let e = graph.add_edge(later, earlier, 1);
                        edge_index.insert((later, earlier), e);
                    }
                }
            }
        }
    }
    (graph, ModuleChunkGroups { per_module })
}

// ---------------------------------------------------------------------------
// strongly connected components (Tarjan, iterative)
// ---------------------------------------------------------------------------

/// Iterative Tarjan SCC. Returns one [`FxHashSet`] per component, in reverse topological order
/// of the condensation DAG (sinks first).
pub(super) fn strongly_connected_components<'a, G>(graph: G) -> Vec<FxHashSet<NodeIndex>>
where
    G: ReadonlyGraph<'a>,
{
    let bound = graph.index_bound();
    // `u32::MAX` as the "unvisited" sentinel. Tarjan only assigns strictly increasing indices
    // up to `bound`, well within `u32::MAX` for any realistic graph.
    let mut indices: Vec<u32> = vec![u32::MAX; bound];
    let mut lowlinks: Vec<u32> = vec![u32::MAX; bound];
    let mut on_stack: Vec<bool> = vec![false; bound];
    let mut scc_stack: Vec<NodeIndex> = Vec::new();
    let mut result: Vec<FxHashSet<NodeIndex>> = Vec::new();
    let mut next_index: u32 = 0;

    struct Frame<I> {
        node: NodeIndex,
        iter: I,
    }
    let mut call_stack: Vec<Frame<G::OutgoingIter>> = Vec::new();

    for root in graph.nodes() {
        let root_i = root.index();
        if indices[root_i] != u32::MAX {
            continue;
        }
        indices[root_i] = next_index;
        lowlinks[root_i] = next_index;
        next_index += 1;
        scc_stack.push(root);
        on_stack[root_i] = true;
        call_stack.push(Frame {
            node: root,
            iter: graph.outgoing_edges(root),
        });

        while let Some(frame) = call_stack.last_mut() {
            let v = frame.node;
            match frame.iter.next() {
                None => {
                    let v_i = v.index();
                    let v_index = indices[v_i];
                    let v_low = lowlinks[v_i];
                    if v_low == v_index {
                        let mut component: FxHashSet<NodeIndex> = FxHashSet::default();
                        loop {
                            let top = scc_stack.pop().unwrap();
                            on_stack[top.index()] = false;
                            component.insert(top);
                            if top == v {
                                break;
                            }
                        }
                        result.push(component);
                    }
                    call_stack.pop();
                    if let Some(parent_frame) = call_stack.last() {
                        let parent_i = parent_frame.node.index();
                        if v_low < lowlinks[parent_i] {
                            lowlinks[parent_i] = v_low;
                        }
                    }
                }
                Some(w) => {
                    let w_i = w.index();
                    if indices[w_i] == u32::MAX {
                        indices[w_i] = next_index;
                        lowlinks[w_i] = next_index;
                        next_index += 1;
                        scc_stack.push(w);
                        on_stack[w_i] = true;
                        call_stack.push(Frame {
                            node: w,
                            iter: graph.outgoing_edges(w),
                        });
                    } else if on_stack[w_i] {
                        let w_index = indices[w_i];
                        let v_i = v.index();
                        if w_index < lowlinks[v_i] {
                            lowlinks[v_i] = w_index;
                        }
                    }
                }
            }
        }
    }

    result
}

// ---------------------------------------------------------------------------
// find_short_cycle (bidirectional Dijkstra)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction2 {
    Forward,
    Backward,
    Cycle,
}

#[derive(Debug, Clone)]
struct Candidate {
    direction: Direction2,
    /// Predecessor on the forward half of the search tree. `Some` for nodes reached by the
    /// forward frontier (`Forward` or `Cycle` direction); `None` for the start node and for
    /// nodes reached only by the backward frontier.
    forward_predecessor: Option<NodeIndex>,
    /// Predecessor on the backward half of the search tree. Mirror of `forward_predecessor`.
    backward_predecessor: Option<NodeIndex>,
    /// `u64::MAX` is used as the sentinel for "visited / +infinity" — matches the JS `Infinity`.
    distance: u64,
}

/// Find a short cycle inside `graph`. Returns `None` if `graph` is empty or has no cycle
/// reachable from `start_node` (or, when `start_node` is `None`, from the first node yielded
/// by `graph.nodes()`). The cycle is returned as an array of distinct node ids; every
/// consecutive pair has an edge and the last node has an edge back to the first (the closing
/// wrap is implicit, not repeated).
///
/// The result is "a short" cycle, not necessarily the global shortest: only starts that
/// already appear on the current best cycle are tried.
pub(super) fn find_short_cycle<'a, G>(
    graph: G,
    start_node: Option<NodeIndex>,
) -> Option<Vec<NodeIndex>>
where
    G: ReadonlyGraph<'a>,
{
    let start = match start_node {
        Some(n) => n,
        None => graph.nodes().next()?,
    };

    let initial = find_shortest_cycle_from_node(graph, start)?;
    let mut cycle: VecDeque<NodeIndex> = initial.into();
    // 2-cycles are already minimal — no shift can produce a shorter one. Skip the (otherwise
    // up-to-k-call) shift loop in this common case.
    let mut remaining_shifts = if cycle.len() <= 2 { 0 } else { cycle.len() };

    while remaining_shifts > 0 {
        let Some(shifted) = cycle.pop_front() else {
            break;
        };
        cycle.push_back(shifted);
        // Every node on a cycle is itself on a cycle (within the same graph snapshot), so this
        // call is expected to find one.
        let new_cycle = find_shortest_cycle_from_node(graph, shifted)
            .expect("every node on a cycle must itself be on a cycle");
        if new_cycle.len() < cycle.len() {
            remaining_shifts = new_cycle.len();
            cycle = new_cycle.into();
        } else {
            remaining_shifts -= 1;
        }
    }
    Some(cycle.into())
}

/// Returns `None` if no cycle is reachable from `start`.
fn find_shortest_cycle_from_node<'a, G>(graph: G, start: NodeIndex) -> Option<Vec<NodeIndex>>
where
    G: ReadonlyGraph<'a>,
{
    let mut candidates: FxHashMap<NodeIndex, Candidate> = FxHashMap::default();
    // Min-heap keyed by `(distance, seq)`. `seq` is a strictly-increasing counter so ties break
    // by insertion order (earlier insertions win). Entries are never removed on relaxation;
    // stale entries are filtered when popped by comparing to `candidates[node].distance`.
    let mut heap: BinaryHeap<Reverse<(u64, u32, NodeIndex)>> = BinaryHeap::new();
    let mut next_seq: u32 = 0;

    // Seed: a backward "stub" at the start node, plus a forward step over each outgoing edge.
    candidates.insert(
        start,
        Candidate {
            direction: Direction2::Backward,
            forward_predecessor: None,
            backward_predecessor: None,
            distance: 0,
        },
    );
    heap.push(Reverse((0, next_seq, start)));
    next_seq += 1;

    for (edge, weight) in graph.outgoing_edges_with_weight(start) {
        let distance = weight as u64;
        candidates.insert(
            edge,
            Candidate {
                direction: Direction2::Forward,
                forward_predecessor: Some(start),
                backward_predecessor: None,
                distance,
            },
        );
        heap.push(Reverse((distance, next_seq, edge)));
        next_seq += 1;
    }

    loop {
        // Pop the lowest-distance live entry, skipping stale ones.
        let (node, current_distance) = loop {
            let Reverse((dist, _, node)) = heap.pop()?;
            match candidates.get(&node) {
                Some(cand) if cand.distance == dist => break (node, dist),
                _ => continue,
            }
        };

        let direction = candidates[&node].direction;

        // A node with `direction == Cycle` is one where the forward and backward frontiers
        // collided. Splice the two halves back into a cycle and return.
        if direction == Direction2::Cycle {
            let cand = candidates.remove(&node).unwrap();
            let mut result = reconstruct_path(&candidates, cand.forward_predecessor, true);
            result.push(node);
            // `backward_path` always begins with the cycle's start node; drop that head before
            // reversing.
            let backward = reconstruct_path(&candidates, cand.backward_predecessor, false);
            result.extend(backward.into_iter().skip(1).rev());
            return Some(result);
        }

        // Mark `node` as visited (sentinel `u64::MAX` distance).
        candidates.get_mut(&node).unwrap().distance = u64::MAX;
        // Snapshot neighbours before mutating `candidates` (avoids overlapping borrows).
        let neighbours: Vec<(NodeIndex, u32)> = match direction {
            Direction2::Forward => graph.outgoing_edges_with_weight(node).collect(),
            Direction2::Backward => graph.incoming_edges_with_weight(node).collect(),
            Direction2::Cycle => unreachable!(),
        };

        for (edge, weight) in neighbours {
            let new_distance = current_distance + weight as u64;
            match candidates.get_mut(&edge) {
                None => {
                    // Unseen neighbour — extend the unidirectional frontier.
                    let (fwd, bwd) = match direction {
                        Direction2::Forward => (Some(node), None),
                        Direction2::Backward => (None, Some(node)),
                        Direction2::Cycle => unreachable!(),
                    };
                    candidates.insert(
                        edge,
                        Candidate {
                            direction,
                            forward_predecessor: fwd,
                            backward_predecessor: bwd,
                            distance: new_distance,
                        },
                    );
                    heap.push(Reverse((new_distance, next_seq, edge)));
                    next_seq += 1;
                }
                Some(existing) if existing.distance == u64::MAX => {
                    // Already visited — leave it.
                }
                Some(existing) if existing.direction == direction => {
                    // Same-direction relaxation.
                    if new_distance < existing.distance {
                        if direction == Direction2::Forward {
                            existing.forward_predecessor = Some(node);
                        } else {
                            existing.backward_predecessor = Some(node);
                        }
                        existing.distance = new_distance;
                        heap.push(Reverse((new_distance, next_seq, edge)));
                        next_seq += 1;
                    }
                }
                Some(existing) if existing.direction == Direction2::Cycle => {
                    // Already a cycle candidate — relax the half coming from `direction`.
                    if new_distance < existing.distance {
                        if direction == Direction2::Forward {
                            existing.forward_predecessor = Some(node);
                        } else {
                            existing.backward_predecessor = Some(node);
                        }
                        existing.distance = new_distance;
                        heap.push(Reverse((new_distance, next_seq, edge)));
                        next_seq += 1;
                    }
                }
                Some(existing) => {
                    // Opposite unidirectional frontiers met → upgrade to a cycle candidate.
                    // The opposite-direction predecessor was already populated when `existing`
                    // joined the frontier; we just fill in our side.
                    existing.direction = Direction2::Cycle;
                    if direction == Direction2::Forward {
                        existing.forward_predecessor = Some(node);
                    } else {
                        existing.backward_predecessor = Some(node);
                    }
                    // Distance is unchanged; the existing heap entry at the old distance is
                    // still valid and will pop the upgraded `Cycle` candidate.
                }
            }
        }
    }
}

/// Walk back through predecessors to reconstruct the path from `start` to (but not including)
/// the cycle node. `forward = true` follows forward predecessors; `false` follows backward.
/// Returns the path in order `[start, ..., last_predecessor]`.
fn reconstruct_path(
    candidates: &FxHashMap<NodeIndex, Candidate>,
    from: Option<NodeIndex>,
    forward: bool,
) -> Vec<NodeIndex> {
    let mut path: Vec<NodeIndex> = Vec::new();
    let mut cur = from;
    while let Some(n) = cur {
        path.push(n);
        let c = &candidates[&n];
        cur = if forward {
            c.forward_predecessor
        } else {
            c.backward_predecessor
        };
    }
    path.reverse();
    path
}

// ---------------------------------------------------------------------------
// make_acyclic
// ---------------------------------------------------------------------------

/// Mutate `graph` in place to remove all multi-node cycles by repeatedly cutting the
/// lowest-weight edge of a short cycle in each SCC.
pub(super) fn make_acyclic<N>(graph: &mut DiGraph<N, u32>) {
    let mut queue: Vec<FxHashSet<NodeIndex>> = Vec::new();
    for scc in strongly_connected_components(&*graph) {
        if scc.len() > 1 {
            queue.push(scc);
        }
    }

    while let Some(scc) = queue.pop() {
        // Inner loop: keep cutting edges from cycles inside this SCC, seeding each subsequent
        // search at the previous cut's target. The seed is likely still on a cycle until the
        // local cycles around it are gone, at which point `find_short_cycle` returns `None` and
        // we re-run SCC to discover any remaining components.
        let mut seed_node: Option<NodeIndex> = None;
        loop {
            // Live view restricted to the current SCC.
            let view = SubgraphView::new(&*graph, &scc);
            let Some(short_cycle) = find_short_cycle(view, seed_node) else {
                break;
            };

            // Walk the cycle's k edges directly (closing wrap implicit) and find the minimum-
            // weight one. Considering edges *on the cycle path* — rather than any edge between
            // cycle nodes — guarantees the chosen cut breaks this cycle, not an unrelated chord.
            let mut min_weight: Option<u32> = None;
            let mut min_edge: Option<EdgeIndex> = None;
            let mut min_to: Option<NodeIndex> = None;
            for i in 0..short_cycle.len() {
                let from = short_cycle[i];
                let to = short_cycle[(i + 1) % short_cycle.len()];
                let Some(edge) = graph.find_edge(from, to) else {
                    continue;
                };
                let weight = *graph.edge_weight(edge).unwrap();
                if min_weight.is_none_or(|w| weight < w) {
                    min_weight = Some(weight);
                    min_edge = Some(edge);
                    min_to = Some(to);
                }
            }

            let (Some(edge), Some(to)) = (min_edge, min_to) else {
                break;
            };
            graph.remove_edge(edge);
            seed_node = Some(to);
        }

        // Re-check this SCC for residual multi-node SCCs.
        let view = SubgraphView::new(&*graph, &scc);
        for new_scc in strongly_connected_components(view) {
            if new_scc.len() > 1 {
                queue.push(new_scc);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// linearize
// ---------------------------------------------------------------------------

/// Topologically sort `graph` (Kahn). Among the currently unblocked candidates, prefer the one
/// that shares the most chunk groups with the previously placed module, so modules that load
/// together end up adjacent in the global order.
///
/// The shared-group count is read from [`ModuleChunkGroups`] (built by [`create_graph`]). Reading
/// from the original chunk-group data (not the post-[`make_acyclic`] graph) gives a lossless
/// signal: [`make_acyclic`] deletes ~30% of edge weight on real inputs, and those deleted edges
/// represent real co-occurrences.
///
/// **Tie-breaking** is done by looking further back through `result`: when multiple candidates
/// share the same count with the last-placed module, the tie is broken by the count with the
/// second-to-last module, then the third-to-last, and so on. Formally, the per-candidate key is
/// the lexicographic sequence `[shared(last), shared(last-1), shared(last-2), …]`, sorted
/// descending — equivalent to choosing the candidate with the best `(Reverse(distance), shared)`
/// metric, where `distance` is the first look-back position that produces a non-tie. Final ties
/// (zero shared at all positions) fall back to the earliest remaining candidate — the one inserted
/// first into `remaining_deps`, which mirrors `graph.nodes()` order.
pub(super) fn linearize<'a, G>(graph: G, module_chunk_groups: &ModuleChunkGroups) -> Vec<NodeIndex>
where
    G: ReadonlyGraph<'a>,
{
    // `remaining_deps` is an insertion-ordered map (matching `graph.nodes()`), so each node's
    // position is a stable "seniority" index. Candidates carry that index as their tie-break key,
    // so the `swap_remove` below — which scrambles positions within `candidates` — cannot disturb
    // the "earliest remaining candidate" tie-break.
    let mut remaining_deps: FxIndexMap<NodeIndex, usize> =
        FxIndexMap::with_capacity_and_hasher(graph.node_count(), Default::default());
    for n in graph.nodes() {
        remaining_deps.insert(n, graph.outgoing_edges(n).count());
    }

    // Candidates are `(node, index in `remaining_deps`)`. Seeded in ascending index order because
    // `FxIndexMap` iterates in insertion order.
    let mut candidates: Vec<(NodeIndex, usize)> = remaining_deps
        .iter()
        .enumerate()
        .filter_map(|(idx, (&n, &c))| (c == 0).then_some((n, idx)))
        .collect();

    let mut result: Vec<NodeIndex> = Vec::new();
    while !candidates.is_empty() {
        // Narrow the candidates with progressive look-back tie-breaking. `survivors` holds
        // `(position in `candidates`, shared count)` and is narrowed in place by comparing shared
        // group counts at increasing look-back distances until one candidate remains or `result`
        // is exhausted.
        let mut survivors: Vec<(usize, usize)> = (0..candidates.len()).map(|i| (i, 0)).collect();
        'outer: for depth in 0..result.len() {
            let reference = result[result.len() - 1 - depth];
            // Recompute the shared count for each surviving candidate at this depth, in place.
            let mut max_shared = 0;
            for entry in survivors.iter_mut() {
                let s = module_chunk_groups.shared(candidates[entry.0].0, reference);
                entry.1 = s;
                max_shared = max_shared.max(s);
            }
            // Only filter when at least one candidate has a real match at this depth; otherwise all
            // are equally far from `reference` and we try the next depth.
            if max_shared > 0 {
                survivors.retain(|&(_, s)| s == max_shared);
                if survivors.len() == 1 {
                    break 'outer;
                }
            }
        }
        // Final tie-break among equal-scoring survivors: the earliest remaining candidate, i.e. the
        // one with the smallest `remaining_deps` index (stable regardless of `swap_remove`).
        let pick = survivors
            .iter()
            .min_by_key(|&&(i, _)| candidates[i].1)
            .map(|&(i, _)| i)
            .unwrap();

        let (placed, _) = candidates.swap_remove(pick);
        result.push(placed);

        // Unblock dependents. The order they are pushed is irrelevant: candidate ties are broken
        // by the stable `remaining_deps` index, not by position in `candidates`.
        for dependent in graph.incoming_edges(placed) {
            let Some((idx, _, cur)) = remaining_deps.get_full_mut(&dependent) else {
                continue;
            };
            *cur = cur.saturating_sub(1);
            if *cur == 0 {
                candidates.push((dependent, idx));
            }
        }
    }

    result
}

// ---------------------------------------------------------------------------
// split_into_chunks
// ---------------------------------------------------------------------------

/// Newtype wrapper that lets `f32` participate in a [`BinaryHeap`]: `f32` itself doesn't
/// implement [`Ord`] because of NaN, so we wrap it and use [`f32::total_cmp`].
#[derive(Copy, Clone, PartialEq)]
struct OrdF32(f32);
impl Eq for OrdF32 {}
impl Ord for OrdF32 {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&other.0)
    }
}
impl PartialOrd for OrdF32 {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Greedy bottom-up chunk merger over the `global_order` produced by [`linearize`].
///
/// Inputs:
///   * `global_order` — module ids in topological order (length M).
///   * `chunk_groups` — each input chunk group remapped to module ids; used to score how often a
///     candidate chunk would be loaded and to size the per-group denominator.
///   * `module_sizes` — per-module byte size, indexed by module id.
///   * `module_style_types` — per-module style type, indexed by module id. Used to forbid merges
///     that would leak global CSS into unrelated chunk groups.
///   * `request_cost` — per-request overhead in bytes.
///   * `weight_distribution` — see module-level docs.
///   * `max_chunk_size` — bytes; merges that produce a multi-item chunk above this are forbidden
///     (`+infinity`). `0` disables the cap.
///
/// Returns one `(chunk, merge_cost_to_next)` tuple per chunk, in global order. `merge_cost_to_next`
/// is the surviving split's metric — the cost-delta of merging this chunk with the following one
/// (`cost(merged) - cost(this) - cost(next)`, always `>= 0` since every negative metric was merged
/// away). It is `None` for the last chunk, which has no following neighbour. These metrics are
/// surfaced by the `TURBOPACK_DEBUG_CSS_CHUNKING` dump so a boundary that was close to merging can
/// be told apart from one held back by a hard constraint (`+infinity`).
pub(super) fn split_into_chunks(
    global_order: &[NodeIndex],
    chunk_groups: &[Vec<usize>],
    module_sizes: &[u64],
    module_style_types: &[StyleType],
    request_cost: f32,
    weight_distribution: f32,
    max_chunk_size: u64,
) -> Vec<(Vec<usize>, Option<f32>)> {
    if global_order.is_empty() {
        return Vec::new();
    }

    // Convert the topological order to plain module ids.
    let order: Vec<usize> = global_order.iter().map(|n| n.index()).collect();
    let n = order.len();

    // Per-chunk-group weight applied to that group's share of every chunk cost. Derived once from
    // each group's total CSS byte size as `group_total_size ^ (-weight_distribution)`:
    //   * `weight_distribution == 0` → weight `1` for every group (all groups weighted equally).
    //   * `weight_distribution > 0` → smaller groups get a larger weight, so the algorithm cares
    //     proportionally more about the bytes/requests it ships to small chunk groups.
    // `.max(1)` avoids a zero base when a chunk group has only zero-sized modules.
    let chunk_group_weight: Vec<f32> = chunk_groups
        .iter()
        .map(|g| {
            let total = g.iter().map(|&id| module_sizes[id]).sum::<u64>().max(1) as f32;
            total.powf(-weight_distribution)
        })
        .collect();

    // Inverse index: for each module id, the sorted, deduplicated list of chunk-group indices
    // that contain it. Built once so `chunk_cost` can collect "loading groups" as the union
    // over the chunk's modules — and answer "does group gi contain module id?" via a binary
    // search rather than a linear scan of the (potentially large) chunk group.
    let mut module_to_groups: Vec<Vec<u32>> = vec![Vec::new(); module_sizes.len()];
    for (gi, group) in chunk_groups.iter().enumerate() {
        let gi32 = gi as u32;
        for &id in group {
            module_to_groups[id].push(gi32);
        }
    }
    for list in module_to_groups.iter_mut() {
        list.sort_unstable();
        list.dedup();
    }

    let cx = CostContext {
        module_to_groups: &module_to_groups,
        chunk_group_weight: &chunk_group_weight,
        module_sizes,
        module_style_types,
        request_cost,
        max_chunk_size,
    };

    // Active split point bitmap: `split_points[i] = true` means there's a boundary between
    // `order[i]` and `order[i+1]`. Parallel `metrics` cache stores `cost(merged) - cost(left) -
    // cost(right)` for the active split at `i` (or `None` if the split has been merged away).
    let mut split_points = vec![true; n.saturating_sub(1)];
    let mut metrics: Vec<Option<f32>> = vec![None; split_points.len()];

    // Min-heap of `(metric, split_index)`. Only negative metrics are pushed — a non-negative
    // metric would never improve cost and is never popped. When `metrics[i]` is invalidated
    // we recompute and push a fresh entry; old entries become stale and are filtered on pop
    // by checking against the current value in `metrics`.
    //
    // Tie-break on metric equality: smaller `i` pops first (matches the PoC's strict `<`
    // selection where the lowest-index winner survives).
    let mut heap: BinaryHeap<Reverse<(OrdF32, usize)>> = BinaryHeap::new();

    // Seed: compute every initial metric, push the negatives.
    for (i, slot) in metrics.iter_mut().enumerate() {
        let m = cx.split_metric(&split_points, &order, i);
        *slot = Some(m);
        if m < 0.0 {
            heap.push(Reverse((OrdF32(m), i)));
        }
    }

    while let Some(Reverse((OrdF32(popped_m), i))) = heap.pop() {
        // Skip stale entries: either the split has been merged, or its metric was recomputed
        // and a newer entry exists elsewhere in the heap.
        if !split_points[i] || metrics[i] != Some(popped_m) {
            continue;
        }
        // `popped_m < 0` by construction.

        // Merge at `i` and invalidate the metrics of the two adjacent active splits (their
        // `affected_range` now extends across the merged region).
        split_points[i] = false;
        metrics[i] = None;
        for neighbour in [
            (0..i).rev().find(|&j| split_points[j]),
            ((i + 1)..split_points.len()).find(|&j| split_points[j]),
        ]
        .into_iter()
        .flatten()
        {
            let new_m = cx.split_metric(&split_points, &order, neighbour);
            metrics[neighbour] = Some(new_m);
            if new_m < 0.0 {
                heap.push(Reverse((OrdF32(new_m), neighbour)));
            }
        }
    }

    // Materialize chunks by walking `order` and starting a new chunk on each true split point.
    // When a split closes the current chunk, record its metric as that chunk's cost-to-next.
    let mut result: Vec<(Vec<usize>, Option<f32>)> = vec![(vec![order[0]], None)];
    for i in 1..n {
        if split_points[i - 1] {
            result.last_mut().unwrap().1 = metrics[i - 1];
            result.push((vec![order[i]], None));
        } else {
            result.last_mut().unwrap().0.push(order[i]);
        }
    }
    result
}

/// `(start, end)` order-indices for the merged region straddling the `index`-th split — the
/// run of consecutive `order` positions whose neighbouring split points have been merged
/// (`split_points[i] == false`).
fn affected_range(split_points: &[bool], index: usize) -> (usize, usize) {
    let mut start = index;
    while start > 0 && !split_points[start - 1] {
        start -= 1;
    }
    let mut end = index + 1;
    while end < split_points.len() && !split_points[end] {
        end += 1;
    }
    (start, end)
}

/// Constant inputs to [`CostContext::chunk_cost`]. Bundled together so we don't have to pass
/// six arguments at every call site.
struct CostContext<'a> {
    /// Inverse of `chunk_groups`: per module id, the sorted list of group indices containing
    /// that module. Built once in [`split_into_chunks`] and reused for every `chunk_cost`
    /// invocation. Used both to collect the groups that load a chunk (the union over its
    /// modules) and to test, via binary search, whether a given group originally contains a
    /// module.
    module_to_groups: &'a [Vec<u32>],
    /// Per chunk-group weight applied to that group's share of a chunk's cost, indexed by group
    /// index. Precomputed in [`split_into_chunks`] as `group_total_size ^ (-weight_distribution)`
    /// so [`CostContext::chunk_cost`] only looks it up. Larger for smaller groups (when
    /// `weight_distribution > 0`), making the algorithm care more about what it ships to them.
    chunk_group_weight: &'a [f32],
    /// Byte size of each module's chunk item, indexed by module id.
    module_sizes: &'a [u64],
    /// Style type of each module, indexed by module id. Used to enforce that `GlobalStyle`
    /// modules never leak into a chunk group that doesn't already load them.
    module_style_types: &'a [StyleType],
    /// Per-request overhead in bytes, charged once for every chunk group that loads the chunk.
    request_cost: f32,
    /// Byte cap for multi-item chunks; a merge that would exceed it costs `+infinity`. `0`
    /// disables the cap.
    max_chunk_size: u64,
}

impl CostContext<'_> {
    /// Cost-delta of merging the split at `i`: `cost(merged) - cost(left) - cost(right)`,
    /// where left/right are the two would-be neighbours and merged is their concatenation
    /// across the gap. Negative means the merge reduces total cost.
    fn split_metric(&self, split_points: &[bool], order: &[usize], i: usize) -> f32 {
        let (start, end) = affected_range(split_points, i);
        let left = &order[start..=i];
        let right = &order[i + 1..=end];
        let merged = &order[start..=end];
        self.chunk_cost(merged) - self.chunk_cost(left) - self.chunk_cost(right)
    }

    /// Cost of loading a single chunk: summed over the chunk groups that load it (a group
    /// "loads" a chunk if it shares ≥ 1 module with it).
    ///
    /// Returns `+infinity` (`f32::INFINITY`) when the chunk violates a hard constraint:
    /// * `max_chunk_size` exceeded for a multi-item chunk; or
    /// * a [`StyleType::GlobalStyle`] module would leak into a chunk group that doesn't already
    ///   load that specific module.
    fn chunk_cost(&self, chunk: &[usize]) -> f32 {
        let chunk_size: u64 = chunk.iter().map(|&id| self.module_sizes[id]).sum();

        if chunk.len() > 1 && self.max_chunk_size > 0 && chunk_size > self.max_chunk_size {
            return f32::INFINITY;
        }

        // Chunk groups that load this chunk = union of `module_to_groups[id]` for `id` in
        // `chunk`. The inverse index lets us avoid scanning every input chunk group on each
        // call.
        let mut loading_groups: Vec<u32> = Vec::new();
        for &id in chunk {
            loading_groups.extend_from_slice(&self.module_to_groups[id]);
        }
        loading_groups.sort_unstable();
        loading_groups.dedup();

        // Global CSS leakage check: every loading group must already be a "container" of each
        // `GlobalStyle` module in the chunk — i.e. `module_to_groups[id]` ⊇ `loading_groups`.
        // Tested via binary search on the (sorted) container list rather than scanning the
        // group's module list.
        for &id in chunk {
            if self.module_style_types[id] != StyleType::GlobalStyle {
                continue;
            }
            let containing = &self.module_to_groups[id];
            if loading_groups
                .iter()
                .any(|gi| containing.binary_search(gi).is_err())
            {
                return f32::INFINITY;
            }
        }

        // Per-group cost: `chunk_group_weight * (chunk_size + request_cost)`, summed across all
        // loading groups. The per-group weight (larger for smaller groups) is what makes shipping
        // a chunk's bytes and request to a small chunk group more expensive than to a large one,
        // so overshipping to small groups is discouraged.
        let chunk_size_f = chunk_size as f32;
        let base = chunk_size_f + self.request_cost;
        loading_groups
            .iter()
            .map(|&gi| self.chunk_group_weight[gi as usize] * base)
            .sum()
    }
}

// ---------------------------------------------------------------------------
// compute_chunked_chunk_groups (used by the e2e test)
// ---------------------------------------------------------------------------

/// Map each input chunk group to the deduplicated, ordered list of chunk indices it needs to
/// load. Mirrors `computeChunkedChunkGroups` from the PoC.
#[cfg(test)]
pub(super) fn compute_chunked_chunk_groups(
    chunk_groups: &[Vec<usize>],
    chunks: &[Vec<usize>],
) -> Vec<Vec<usize>> {
    let mut module_to_chunk: FxHashMap<usize, usize> = FxHashMap::default();
    for (chunk_index, chunk) in chunks.iter().enumerate() {
        for &id in chunk {
            module_to_chunk.insert(id, chunk_index);
        }
    }
    chunk_groups
        .iter()
        .map(|group| {
            let mut chunk_indices: Vec<usize> = group
                .iter()
                .filter_map(|id| module_to_chunk.get(id).copied())
                .collect();
            chunk_indices.sort_unstable();
            chunk_indices.dedup();
            chunk_indices
        })
        .collect()
}
