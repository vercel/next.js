//! Pure (no-Vc) graph algorithms underlying the graph-based CSS chunker.
//!
//! Direct port of the proof-of-concept TypeScript implementation. See the parent module's
//! documentation for the high-level pipeline.

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
    /// `path` is the unidirectional path while `direction != Cycle`; once the candidate becomes
    /// a `Cycle` the two halves are tracked in `forward_path` and `backward_path`.
    path: Vec<NodeIndex>,
    forward_path: Vec<NodeIndex>,
    backward_path: Vec<NodeIndex>,
    /// `u32::MAX` is used as the sentinel for "visited / +infinity" — matches the JS `Infinity`.
    distance: u64,
}

/// Find a short cycle inside an SCC. Returns the cycle as an array of distinct node ids; every
/// consecutive pair has an edge and the last node has an edge back to the first (the closing
/// wrap is implicit, not repeated).
pub(super) fn find_short_cycle<'a, G>(graph: G) -> Vec<NodeIndex>
where
    G: ReadonlyGraph<'a>,
{
    let start = graph.nodes().next().expect("find_short_cycle: empty graph");

    let mut cycle = find_shortest_cycle_from_node(graph, start);
    let mut remaining_shifts = cycle.len();

    while remaining_shifts > 0 {
        if cycle.is_empty() {
            break;
        }
        let shifted = cycle.remove(0);
        cycle.push(shifted);
        let new_cycle = find_shortest_cycle_from_node(graph, shifted);
        if new_cycle.len() < cycle.len() {
            remaining_shifts = new_cycle.len();
            cycle = new_cycle;
        } else {
            remaining_shifts -= 1;
        }
    }
    cycle
}

fn find_shortest_cycle_from_node<'a, G>(graph: G, start: NodeIndex) -> Vec<NodeIndex>
where
    G: ReadonlyGraph<'a>,
{
    let mut candidates: FxHashMap<NodeIndex, Candidate> = FxHashMap::default();
    candidates.insert(
        start,
        Candidate {
            direction: Direction2::Backward,
            path: Vec::new(),
            forward_path: Vec::new(),
            backward_path: Vec::new(),
            distance: 0,
        },
    );
    for (edge, weight) in graph.outgoing_edges_with_weight(start) {
        candidates.insert(
            edge,
            Candidate {
                direction: Direction2::Forward,
                path: vec![start],
                forward_path: Vec::new(),
                backward_path: Vec::new(),
                distance: weight as u64,
            },
        );
    }

    loop {
        // Linear scan for the entry with the lowest distance — strict `<` so insertion order
        // wins on ties (matches the JS).
        let mut min_node: Option<NodeIndex> = None;
        let mut min_distance: u64 = u64::MAX;
        for (&k, v) in &candidates {
            if v.distance < min_distance {
                min_distance = v.distance;
                min_node = Some(k);
            }
        }
        let node = match min_node {
            Some(n) => n,
            None => panic!("no cycles found"),
        };
        let current_distance = min_distance;
        if current_distance == u64::MAX {
            panic!("no cycles found");
        }
        // Snapshot fields we need before mutating (to avoid two mutable borrows).
        let direction = candidates[&node].direction;

        if direction == Direction2::Cycle {
            let cand = candidates.remove(&node).unwrap();
            // backward_path always begins with the cycle's start node; drop that head before
            // reversing.
            let mut result = cand.forward_path.clone();
            result.push(node);
            for &n in cand.backward_path.iter().skip(1).rev() {
                result.push(n);
            }
            return result;
        }

        // Mark visited.
        candidates.get_mut(&node).unwrap().distance = u64::MAX;

        let path_extended = {
            let cand = &candidates[&node];
            let mut p = cand.path.clone();
            p.push(node);
            p
        };

        // Snapshot neighbours before mutating `candidates`.
        let neighbours: Vec<(NodeIndex, u32)> = match direction {
            Direction2::Forward => graph.outgoing_edges_with_weight(node).collect(),
            Direction2::Backward => graph.incoming_edges_with_weight(node).collect(),
            Direction2::Cycle => unreachable!(),
        };

        for (edge, weight) in neighbours {
            let new_distance = current_distance + weight as u64;
            match candidates.get_mut(&edge) {
                None => {
                    candidates.insert(
                        edge,
                        Candidate {
                            direction,
                            path: path_extended.clone(),
                            forward_path: Vec::new(),
                            backward_path: Vec::new(),
                            distance: new_distance,
                        },
                    );
                }
                Some(existing) => {
                    if existing.direction == direction {
                        if existing.distance != u64::MAX && new_distance < existing.distance {
                            existing.path = path_extended.clone();
                            existing.distance = new_distance;
                        }
                    } else if existing.direction == Direction2::Cycle {
                        if existing.distance != u64::MAX && new_distance < existing.distance {
                            if direction == Direction2::Forward {
                                existing.forward_path = path_extended.clone();
                            } else {
                                existing.backward_path = path_extended.clone();
                            }
                            existing.distance = new_distance;
                        }
                    } else {
                        // Opposite unidirectional → upgrade to a cycle candidate.
                        if existing.distance != u64::MAX {
                            let other_path = std::mem::take(&mut existing.path);
                            existing.direction = Direction2::Cycle;
                            if direction == Direction2::Forward {
                                existing.forward_path = path_extended.clone();
                                existing.backward_path = other_path;
                            } else {
                                existing.forward_path = other_path;
                                existing.backward_path = path_extended.clone();
                            }
                        }
                    }
                }
            }
        }
    }
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
        let short_cycle = find_short_cycle(view);

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

    // Active split point bitmap: `split_points[i] = true` means there's a boundary between
    // `order[i]` and `order[i+1]`.
    let mut split_points = vec![true; n.saturating_sub(1)];
    let mut metrics: Vec<Option<f32>> = vec![None; split_points.len()];

    // Per-group total CSS byte size — used as the denominator in the cost formula. Memoized
    // here because `chunk_groups` is fixed.
    let group_total_size: Vec<u64> = chunk_groups
        .iter()
        .map(|g| g.iter().map(|&id| module_sizes[id]).sum::<u64>().max(1))
        .collect();

    loop {
        // 1. Compute metrics for active splits whose metric is unknown.
        for i in 0..split_points.len() {
            if !split_points[i] {
                continue;
            }
            if metrics[i].is_some() {
                continue;
            }
            let (start, end) = affected_range(&split_points, i);
            let left = &order[start..=i];
            let right = &order[i + 1..=end];
            let merged = &order[start..=end];
            let left_cost = chunk_cost(
                left,
                chunk_groups,
                &group_total_size,
                module_sizes,
                module_style_types,
                request_cost,
                module_factor_cost,
                max_chunk_size,
            );
            let right_cost = chunk_cost(
                right,
                chunk_groups,
                &group_total_size,
                module_sizes,
                module_style_types,
                request_cost,
                module_factor_cost,
                max_chunk_size,
            );
            let merged_cost = chunk_cost(
                merged,
                chunk_groups,
                &group_total_size,
                module_sizes,
                module_style_types,
                request_cost,
                module_factor_cost,
                max_chunk_size,
            );
            metrics[i] = Some(merged_cost - left_cost - right_cost);
        }

        // 2. Find the most-negative metric.
        let mut best_i: Option<usize> = None;
        let mut best_metric: f32 = 0.0;
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

        // 3. Merge at best_i.
        split_points[best_i] = false;
        metrics[best_i] = None;
        // Invalidate the nearest active splits on each side.
        for i in (0..best_i).rev() {
            if split_points[i] {
                metrics[i] = None;
                break;
            }
        }
        for i in (best_i + 1)..split_points.len() {
            if split_points[i] {
                metrics[i] = None;
                break;
            }
        }
    }

    // Materialize chunks by walking `order` and starting a new chunk on each true split point.
    let mut result: Vec<Vec<usize>> = vec![vec![order[0]]];
    for i in 1..n {
        let module = order[i];
        let split = split_points[i - 1];
        if split {
            result.push(vec![module]);
        } else {
            result.last_mut().unwrap().push(module);
        }
    }
    result
}

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

/// Cost of loading a single chunk: summed over the chunk groups that load it (a group "loads"
/// a chunk if it shares ≥ 1 module with it).
///
/// Returns `+infinity` (`f32::INFINITY`) when the chunk violates a hard constraint
/// (`max_chunk_size` exceeded for a multi-item chunk, or a global CSS module would leak into a
/// chunk group that doesn't already load it).
fn chunk_cost(
    chunk: &[usize],
    chunk_groups: &[Vec<usize>],
    group_total_size: &[u64],
    module_sizes: &[u64],
    module_style_types: &[StyleType],
    request_cost: f32,
    module_factor_cost: f32,
    max_chunk_size: u64,
) -> f32 {
    let chunk_size: u64 = chunk.iter().map(|&id| module_sizes[id]).sum();

    if chunk.len() > 1 && max_chunk_size > 0 && chunk_size > max_chunk_size {
        return f32::INFINITY;
    }

    let chunk_set: FxHashSet<usize> = chunk.iter().copied().collect();

    // Determine which groups load this chunk and accumulate the cost.
    let mut total: f32 = 0.0;
    let chunk_size_f = chunk_size as f32;

    // Pre-compute which chunk groups load this chunk (= share ≥ 1 module).
    let loading_groups: Vec<usize> = chunk_groups
        .iter()
        .enumerate()
        .filter_map(|(i, g)| {
            if g.iter().any(|id| chunk_set.contains(id)) {
                Some(i)
            } else {
                None
            }
        })
        .collect();

    // Global CSS leakage check: if the chunk contains any GlobalStyle module, every chunk
    // group that loads the chunk must already load that specific module (otherwise we'd be
    // leaking unrelated global CSS into the page).
    for &id in chunk {
        if module_style_types[id] != StyleType::GlobalStyle {
            continue;
        }
        for &gi in &loading_groups {
            if !chunk_groups[gi].contains(&id) {
                return f32::INFINITY;
            }
        }
    }

    for &gi in &loading_groups {
        let group_total = group_total_size[gi] as f32;
        // Per-group cost: chunk_size + (chunk_size / group_total) * module_factor_cost +
        // request_cost.
        total += chunk_size_f + (chunk_size_f / group_total) * module_factor_cost + request_cost;
    }
    total
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
