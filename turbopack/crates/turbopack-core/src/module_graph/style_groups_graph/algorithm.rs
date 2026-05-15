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

use super::subgraph_view::{ReadonlyGraph, SubgraphView};
use crate::module::StyleType;

// ---------------------------------------------------------------------------
// create_graph
// ---------------------------------------------------------------------------

/// Build a directed weighted graph from `chunk_groups`.
///
/// For each group `[m₀, m₁, ..., mₖ]` and every pair `(later, earlier)` with `later > earlier`
/// inside the group, an edge `later → earlier` is added (weight 1). Repeated edges accumulate.
/// `node_count` is the total number of distinct module ids referenced; node ids are dense in
/// `0..node_count`.
pub(super) fn create_graph(chunk_groups: &[Vec<usize>], node_count: usize) -> DiGraph<usize, u32> {
    let mut graph: DiGraph<usize, u32> = DiGraph::with_capacity(node_count, 0);
    for i in 0..node_count {
        let idx = graph.add_node(i);
        debug_assert_eq!(idx.index(), i);
    }
    let mut edge_index: FxHashMap<(NodeIndex, NodeIndex), EdgeIndex> = FxHashMap::default();
    for group in chunk_groups {
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
    graph
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
    let mut indices: FxHashMap<NodeIndex, u32> = FxHashMap::default();
    let mut lowlinks: FxHashMap<NodeIndex, u32> = FxHashMap::default();
    let mut on_stack: FxHashSet<NodeIndex> = FxHashSet::default();
    let mut scc_stack: Vec<NodeIndex> = Vec::new();
    let mut result: Vec<FxHashSet<NodeIndex>> = Vec::new();
    let mut next_index: u32 = 0;

    struct Frame<I> {
        node: NodeIndex,
        iter: I,
    }
    let mut call_stack: Vec<Frame<G::OutgoingIter>> = Vec::new();

    for root in graph.nodes() {
        if indices.contains_key(&root) {
            continue;
        }
        indices.insert(root, next_index);
        lowlinks.insert(root, next_index);
        next_index += 1;
        scc_stack.push(root);
        on_stack.insert(root);
        call_stack.push(Frame {
            node: root,
            iter: graph.outgoing_edges(root),
        });

        while let Some(frame) = call_stack.last_mut() {
            let v = frame.node;
            match frame.iter.next() {
                None => {
                    let v_index = indices[&v];
                    let v_low = lowlinks[&v];
                    if v_low == v_index {
                        let mut component: FxHashSet<NodeIndex> = FxHashSet::default();
                        loop {
                            let top = scc_stack.pop().unwrap();
                            on_stack.remove(&top);
                            component.insert(top);
                            if top == v {
                                break;
                            }
                        }
                        result.push(component);
                    }
                    call_stack.pop();
                    if let Some(parent_frame) = call_stack.last() {
                        let parent = parent_frame.node;
                        let parent_low = lowlinks[&parent];
                        if v_low < parent_low {
                            lowlinks.insert(parent, v_low);
                        }
                    }
                }
                Some(w) => {
                    if let std::collections::hash_map::Entry::Vacant(e) = indices.entry(w) {
                        e.insert(next_index);
                        lowlinks.insert(w, next_index);
                        next_index += 1;
                        scc_stack.push(w);
                        on_stack.insert(w);
                        call_stack.push(Frame {
                            node: w,
                            iter: graph.outgoing_edges(w),
                        });
                    } else if on_stack.contains(&w) {
                        let w_index = indices[&w];
                        let v_low = lowlinks[&v];
                        if w_index < v_low {
                            lowlinks.insert(v, w_index);
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

/// Find a short cycle inside `graph`. Returns `None` if `graph` is empty or has no cycles
/// reachable from the first node (callers in this module always pass a multi-node SCC, where a
/// cycle is guaranteed to exist, so they unwrap). The cycle is returned as an array of distinct
/// node ids; every consecutive pair has an edge and the last node has an edge back to the first
/// (the closing wrap is implicit, not repeated).
pub(super) fn find_short_cycle<'a, G>(graph: G) -> Option<Vec<NodeIndex>>
where
    G: ReadonlyGraph<'a>,
{
    let start = graph.nodes().next()?;

    let initial = find_shortest_cycle_from_node(graph, start)?;
    let mut cycle: VecDeque<NodeIndex> = initial.into();
    let mut remaining_shifts = cycle.len();

    while remaining_shifts > 0 {
        let Some(shifted) = cycle.pop_front() else {
            break;
        };
        cycle.push_back(shifted);
        let new_cycle = find_shortest_cycle_from_node(graph, shifted)?;
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
        // Live view restricted to the current SCC.
        let view = SubgraphView::new(&*graph, &scc);
        // A multi-node SCC is guaranteed to contain a cycle, so `find_short_cycle` returns Some.
        let short_cycle = find_short_cycle(view).expect("multi-node SCC always contains a cycle");

        // Restrict further to just the cycle's nodes.
        let cycle_set: FxHashSet<NodeIndex> = short_cycle.iter().copied().collect();
        let cycle_view = SubgraphView::new(&*graph, &cycle_set);

        let mut min_weight: Option<u32> = None;
        let mut min_from: Option<NodeIndex> = None;
        let mut min_to: Option<NodeIndex> = None;
        for node in cycle_view.nodes() {
            for (target, weight) in cycle_view.outgoing_edges_with_weight(node) {
                if min_weight.is_none_or(|w| weight < w) {
                    min_weight = Some(weight);
                    min_from = Some(node);
                    min_to = Some(target);
                }
            }
        }

        let (Some(from), Some(to)) = (min_from, min_to) else {
            continue;
        };
        if let Some(edge) = graph.find_edge(from, to) {
            graph.remove_edge(edge);
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

/// Topologically sort `graph` (Kahn). Tie-break: when multiple dependents become unblocked at
/// once, the heaviest edge wins; insertion order breaks ties at equal weight.
pub(super) fn linearize<'a, G>(graph: G) -> Vec<NodeIndex>
where
    G: ReadonlyGraph<'a>,
{
    let mut remaining_deps: FxHashMap<NodeIndex, usize> = FxHashMap::default();
    for n in graph.nodes() {
        remaining_deps.insert(n, graph.outgoing_edges(n).count());
    }

    let mut candidates: Vec<NodeIndex> = remaining_deps
        .iter()
        .filter_map(|(n, &c)| if c == 0 { Some(*n) } else { None })
        .collect();
    // Stable seed order: matches insertion order of `nodes()`.
    {
        let order: FxHashMap<NodeIndex, usize> =
            graph.nodes().enumerate().map(|(i, n)| (n, i)).collect();
        candidates.sort_by_key(|n| std::cmp::Reverse(order[n]));
    }

    let mut result: Vec<NodeIndex> = Vec::new();
    while let Some(placed) = candidates.pop() {
        result.push(placed);

        // petgraph iterates neighbours in reverse insertion order; flip it back so the
        // tie-break below sees them in insertion order — matching the PoC.
        let mut incoming: Vec<(NodeIndex, u32)> =
            graph.incoming_edges_with_weight(placed).collect();
        incoming.reverse();

        let mut new_candidates: Vec<(NodeIndex, u32, usize)> = Vec::new();
        for (dependent, weight) in incoming {
            let Some(cur) = remaining_deps.get(&dependent).copied() else {
                continue;
            };
            let next = cur.saturating_sub(1);
            remaining_deps.insert(dependent, next);
            if next == 0 {
                let idx = new_candidates.len();
                new_candidates.push((dependent, weight, idx));
            }
        }
        // Weight ascending; ties broken by reverse insertion order so the earliest-encountered
        // dependent ends up on top of the stack and pops first.
        new_candidates.sort_by(|a, b| a.1.cmp(&b.1).then(b.2.cmp(&a.2)));
        for (dep, _, _) in new_candidates {
            candidates.push(dep);
        }
    }

    result
}

// ---------------------------------------------------------------------------
// split_into_chunks
// ---------------------------------------------------------------------------

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
///   * `module_factor_cost` — see module-level docs.
///   * `max_chunk_size` — bytes; merges that produce a multi-item chunk above this are forbidden
///     (`+infinity`). `0` disables the cap.
pub(super) fn split_into_chunks(
    global_order: &[NodeIndex],
    chunk_groups: &[Vec<usize>],
    module_sizes: &[u64],
    module_style_types: &[StyleType],
    request_cost: f32,
    module_factor_cost: f32,
    max_chunk_size: u64,
) -> Vec<Vec<usize>> {
    if global_order.is_empty() {
        return Vec::new();
    }

    // Convert the topological order to plain module ids.
    let order: Vec<usize> = global_order.iter().map(|n| n.index()).collect();
    let n = order.len();

    // Per-group total CSS byte size — denominator in the cost formula. Memoized once because
    // `chunk_groups` is fixed for the duration of this call. `.max(1)` avoids a div-by-zero
    // when a chunk group has only zero-sized modules.
    let group_total_size: Vec<u64> = chunk_groups
        .iter()
        .map(|g| g.iter().map(|&id| module_sizes[id]).sum::<u64>().max(1))
        .collect();

    let cx = CostContext {
        chunk_groups,
        group_total_size: &group_total_size,
        module_sizes,
        module_style_types,
        request_cost,
        module_factor_cost,
        max_chunk_size,
    };

    // Active split point bitmap: `split_points[i] = true` means there's a boundary between
    // `order[i]` and `order[i+1]`. Parallel `metrics` cache stores `cost(merged) - cost(left) -
    // cost(right)` for the active split at `i` (or `None` if the metric needs (re)computing).
    let mut split_points = vec![true; n.saturating_sub(1)];
    let mut metrics: Vec<Option<f32>> = vec![None; split_points.len()];

    loop {
        // 1. Refresh metrics for active splits with a stale entry.
        for i in 0..split_points.len() {
            if !split_points[i] || metrics[i].is_some() {
                continue;
            }
            let (start, end) = affected_range(&split_points, i);
            let left = &order[start..=i];
            let right = &order[i + 1..=end];
            let merged = &order[start..=end];
            metrics[i] = Some(cx.chunk_cost(merged) - cx.chunk_cost(left) - cx.chunk_cost(right));
        }

        // 2. Pick the most-negative metric. Stop if no merge would reduce cost. On ties keep the
        //    lowest index (strict `<`), matching the PoC.
        let mut best_i: Option<usize> = None;
        let mut best_metric = 0.0_f32;
        for i in 0..split_points.len() {
            if !split_points[i] {
                continue;
            }
            if let Some(m) = metrics[i]
                && m < best_metric
            {
                best_metric = m;
                best_i = Some(i);
            }
        }
        let Some(best_i) = best_i else {
            break;
        };

        // 3. Merge at `best_i` and invalidate the metrics of the two adjacent active splits (their
        //    `affected_range` now extends across the merged region).
        split_points[best_i] = false;
        metrics[best_i] = None;
        if let Some(left) = (0..best_i).rev().find(|&i| split_points[i]) {
            metrics[left] = None;
        }
        if let Some(right) = ((best_i + 1)..split_points.len()).find(|&i| split_points[i]) {
            metrics[right] = None;
        }
    }

    // Materialize chunks by walking `order` and starting a new chunk on each true split point.
    let mut result: Vec<Vec<usize>> = vec![vec![order[0]]];
    for i in 1..n {
        if split_points[i - 1] {
            result.push(vec![order[i]]);
        } else {
            result.last_mut().unwrap().push(order[i]);
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
/// seven arguments at every call site.
struct CostContext<'a> {
    chunk_groups: &'a [Vec<usize>],
    group_total_size: &'a [u64],
    module_sizes: &'a [u64],
    module_style_types: &'a [StyleType],
    request_cost: f32,
    module_factor_cost: f32,
    max_chunk_size: u64,
}

impl CostContext<'_> {
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

        // Chunk groups that load this chunk = those sharing ≥ 1 module with `chunk`.
        let chunk_set: FxHashSet<usize> = chunk.iter().copied().collect();
        let loading_groups: Vec<usize> = self
            .chunk_groups
            .iter()
            .enumerate()
            .filter(|(_, g)| g.iter().any(|id| chunk_set.contains(id)))
            .map(|(i, _)| i)
            .collect();

        // Global CSS leakage check: every group that would end up loading this chunk must
        // already be loading each of its `GlobalStyle` modules.
        for &id in chunk {
            if self.module_style_types[id] != StyleType::GlobalStyle {
                continue;
            }
            if loading_groups
                .iter()
                .any(|&gi| !self.chunk_groups[gi].contains(&id))
            {
                return f32::INFINITY;
            }
        }

        // Per-group cost: `chunk_size + (chunk_size / group_total) * module_factor_cost +
        // request_cost`. Total is the sum across all loading groups.
        let chunk_size_f = chunk_size as f32;
        loading_groups
            .iter()
            .map(|&gi| {
                let group_total = self.group_total_size[gi] as f32;
                chunk_size_f
                    + (chunk_size_f / group_total) * self.module_factor_cost
                    + self.request_cost
            })
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
