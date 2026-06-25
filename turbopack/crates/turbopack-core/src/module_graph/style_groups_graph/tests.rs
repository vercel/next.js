//! Pure unit tests for the graph-based CSS chunking algorithm.
//!
//! Direct port of the PoC's `vitest` suites (see the upstream proof of concept). The
//! `e2e_*` tests cover the assembled pipeline; the rest cover individual stages.

use petgraph::graph::{DiGraph, NodeIndex};
use rustc_hash::FxHashSet;

use super::{
    algorithm::{
        compute_chunked_chunk_groups, create_graph, find_short_cycle, linearize, make_acyclic,
        split_into_chunks, strongly_connected_components,
    },
    subgraph_view::{ReadonlyGraph, SubgraphView},
};
use crate::module::StyleType;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn n(i: usize) -> NodeIndex {
    NodeIndex::new(i)
}

fn build_graph<F: FnOnce(&mut DiGraph<usize, u32>)>(
    node_count: usize,
    f: F,
) -> DiGraph<usize, u32> {
    let mut g: DiGraph<usize, u32> = DiGraph::with_capacity(node_count, 0);
    for i in 0..node_count {
        g.add_node(i);
    }
    f(&mut g);
    g
}

fn add_or_accumulate<N>(g: &mut DiGraph<N, u32>, from: NodeIndex, to: NodeIndex, weight: u32) {
    if let Some(e) = g.find_edge(from, to) {
        *g.edge_weight_mut(e).unwrap() += weight;
    } else {
        g.add_edge(from, to, weight);
    }
}

fn outgoing_targets<'a, G: ReadonlyGraph<'a>>(g: G, node: NodeIndex) -> Vec<usize> {
    let mut v: Vec<usize> = g.outgoing_edges(node).map(|n| n.index()).collect();
    v.sort_unstable();
    v
}

fn incoming_targets<'a, G: ReadonlyGraph<'a>>(g: G, node: NodeIndex) -> Vec<usize> {
    let mut v: Vec<usize> = g.incoming_edges(node).map(|n| n.index()).collect();
    v.sort_unstable();
    v
}

fn outgoing_with_weight<'a, G: ReadonlyGraph<'a>>(g: G, node: NodeIndex) -> Vec<(usize, u32)> {
    let mut v: Vec<(usize, u32)> = g
        .outgoing_edges_with_weight(node)
        .map(|(n, w)| (n.index(), w))
        .collect();
    v.sort_unstable_by_key(|(t, _)| *t);
    v
}

fn incoming_with_weight<'a, G: ReadonlyGraph<'a>>(g: G, node: NodeIndex) -> Vec<(usize, u32)> {
    let mut v: Vec<(usize, u32)> = g
        .incoming_edges_with_weight(node)
        .map(|(n, w)| (n.index(), w))
        .collect();
    v.sort_unstable_by_key(|(t, _)| *t);
    v
}

fn to_set(v: &[NodeIndex]) -> FxHashSet<NodeIndex> {
    v.iter().copied().collect()
}

fn ids(v: &[NodeIndex]) -> Vec<usize> {
    v.iter().map(|n| n.index()).collect()
}

fn equal_size_inputs(node_count: usize) -> Vec<u64> {
    vec![1; node_count]
}

fn no_global(node_count: usize) -> Vec<StyleType> {
    vec![StyleType::IsolatedStyle; node_count]
}

fn split_simple(
    global_order: &[NodeIndex],
    chunk_groups: &[Vec<usize>],
    request_cost: f32,
) -> Vec<Vec<usize>> {
    let count = global_order.len();
    // The cost-to-next metric on each tuple is exercised by the production dump, not these
    // structural assertions, so drop it and keep the bare chunk lists.
    split_into_chunks(
        global_order,
        chunk_groups,
        &equal_size_inputs(count),
        &no_global(count),
        request_cost,
        // module_factor_cost = 0 reproduces the PoC's `(requestOverhead + 1*M) * N`.
        0.0,
        0,
    )
    .into_iter()
    .map(|(chunk, _cost)| chunk)
    .collect()
}

// ---------------------------------------------------------------------------
// Graph + SubgraphView
// ---------------------------------------------------------------------------

#[test]
fn graph_add_edge_creates_forward_and_backward_edges() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
    });
    assert_eq!(outgoing_targets(&g, n(0)), vec![1]);
    assert_eq!(incoming_targets(&g, n(1)), vec![0]);
    assert!(outgoing_targets(&g, n(1)).is_empty());
    assert!(incoming_targets(&g, n(0)).is_empty());
}

#[test]
fn graph_add_edge_default_weight_one() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
    });
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 1)]);
    assert_eq!(incoming_with_weight(&g, n(1)), vec![(0, 1)]);
}

#[test]
fn graph_add_edge_explicit_weight() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 5);
    });
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 5)]);
    assert_eq!(incoming_with_weight(&g, n(1)), vec![(0, 5)]);
}

#[test]
fn graph_add_edge_accumulates_weights_for_repeated_edges() {
    let g = build_graph(2, |g| {
        add_or_accumulate(g, n(0), n(1), 1);
        add_or_accumulate(g, n(0), n(1), 2);
        add_or_accumulate(g, n(0), n(1), 3);
    });
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 6)]);
    assert_eq!(incoming_with_weight(&g, n(1)), vec![(0, 6)]);
}

#[test]
fn graph_forward_and_reverse_edges_are_independent() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 2);
        g.add_edge(n(1), n(0), 7);
    });
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 2)]);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 7)]);
    assert_eq!(incoming_with_weight(&g, n(0)), vec![(1, 7)]);
    assert_eq!(incoming_with_weight(&g, n(1)), vec![(0, 2)]);
}

#[test]
fn graph_supports_self_loops() {
    let g = build_graph(1, |g| {
        g.add_edge(n(0), n(0), 3);
    });
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(0, 3)]);
    assert_eq!(incoming_with_weight(&g, n(0)), vec![(0, 3)]);
}

#[test]
fn subgraphview_nodes_returns_only_nodes_in_subset() {
    let g = build_graph(3, |_| {});
    let subset: FxHashSet<_> = [n(0), n(2)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    let mut nodes: Vec<usize> = view.nodes().map(|n| n.index()).collect();
    nodes.sort_unstable();
    assert_eq!(nodes, vec![0, 2]);
}

#[test]
fn subgraphview_filters_edges_to_nodes_in_subset() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(0), n(2), 1);
    });
    let subset: FxHashSet<_> = [n(0), n(2)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    assert_eq!(outgoing_targets(view, n(0)), vec![2]);
    assert_eq!(incoming_targets(view, n(2)), vec![0]);
    assert!(outgoing_targets(view, n(1)).is_empty());
    assert!(incoming_targets(view, n(1)).is_empty());
}

#[test]
fn subgraphview_preserves_edge_weights() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 5);
        g.add_edge(n(0), n(2), 3);
    });
    let subset: FxHashSet<_> = [n(0), n(2)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    assert_eq!(outgoing_with_weight(view, n(0)), vec![(2, 3)]);
    assert_eq!(incoming_with_weight(view, n(2)), vec![(0, 3)]);
}

#[test]
fn subgraphview_outgoing_for_node_outside_subset_yields_nothing() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
    });
    let subset: FxHashSet<_> = [n(0)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    assert!(outgoing_targets(view, n(1)).is_empty());
}

// ---------------------------------------------------------------------------
// create_graph
// ---------------------------------------------------------------------------

#[test]
fn create_graph_empty_input_produces_empty_graph() {
    let g = create_graph(&[], 0);
    assert_eq!(g.node_count(), 0);
}

#[test]
fn create_graph_assigns_sequential_indices() {
    // Note: in the PoC, `createGraph` assigns node ids by first-appearance. In the Rust port the
    // caller pre-assigns ids, so we test that node count and edge structure match.
    let g = create_graph(&[vec![0, 1, 2]], 3);
    assert_eq!(g.node_count(), 3);
}

#[test]
fn create_graph_pairwise_edges_for_each_group() {
    // group [0, 1, 2, 3] => 1->0, 2->0, 2->1, 3->0, 3->1, 3->2
    let g = create_graph(&[vec![0, 1, 2, 3]], 4);
    assert!(outgoing_targets(&g, n(0)).is_empty());
    assert_eq!(outgoing_targets(&g, n(1)), vec![0]);
    assert_eq!(outgoing_targets(&g, n(2)), vec![0, 1]);
    assert_eq!(outgoing_targets(&g, n(3)), vec![0, 1, 2]);
}

#[test]
fn create_graph_all_edge_weights_are_one_within_a_single_group() {
    let g = create_graph(&[vec![0, 1, 2]], 3);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(2)), vec![(0, 1), (1, 1)]);
}

#[test]
fn create_graph_accumulates_weights_for_repeated_pairs() {
    let g = create_graph(&[vec![0, 1], vec![0, 1], vec![0, 1]], 2);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 3)]);
    assert_eq!(incoming_with_weight(&g, n(0)), vec![(1, 3)]);
}

#[test]
fn create_graph_single_element_groups_produce_no_edges() {
    let g = create_graph(&[vec![0], vec![1]], 2);
    assert!(outgoing_targets(&g, n(0)).is_empty());
    assert!(outgoing_targets(&g, n(1)).is_empty());
    assert!(incoming_targets(&g, n(0)).is_empty());
    assert!(incoming_targets(&g, n(1)).is_empty());
}

#[test]
fn create_graph_preserves_group_order_when_computing_edges() {
    // [0, 1, 2] then [2, 1, 0] should produce edges in BOTH directions.
    let g = create_graph(&[vec![0, 1, 2], vec![2, 1, 0]], 3);
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 1), (2, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 1), (2, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(2)), vec![(0, 1), (1, 1)]);
}

#[test]
fn create_graph_duplicated_module_in_a_group_creates_self_loop() {
    let g = create_graph(&[vec![0, 0]], 1);
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(0, 1)]);
}

// ---------------------------------------------------------------------------
// strongly_connected_components
// ---------------------------------------------------------------------------

#[test]
fn scc_empty_graph_yields_no_components() {
    let g: DiGraph<usize, u32> = DiGraph::new();
    assert!(strongly_connected_components(&g).is_empty());
}

#[test]
fn scc_disconnected_nodes_each_form_own_component() {
    let g = build_graph(3, |_| {});
    let sccs = strongly_connected_components(&g);
    assert_eq!(sccs.len(), 3);
    for c in &sccs {
        assert_eq!(c.len(), 1);
    }
}

#[test]
fn scc_linear_chain_produces_singleton_components() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
    });
    let sccs = strongly_connected_components(&g);
    let as_vecs: Vec<_> = sccs.iter().map(to_sorted_ids).collect();
    assert_eq!(as_vecs, vec![vec![2], vec![1], vec![0]]);
}

#[test]
fn scc_three_cycle_is_one_component() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(2), n(0), 1);
    });
    let sccs = strongly_connected_components(&g);
    assert_eq!(sccs.len(), 1);
    assert_eq!(sccs[0].len(), 3);
}

#[test]
fn scc_self_loop_forms_singleton() {
    let g = build_graph(1, |g| {
        g.add_edge(n(0), n(0), 1);
    });
    let sccs = strongly_connected_components(&g);
    assert_eq!(sccs.len(), 1);
    assert_eq!(sccs[0].len(), 1);
}

#[test]
fn scc_works_on_subgraphview() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 1);
        g.add_edge(n(1), n(2), 1);
    });
    let subset: FxHashSet<_> = [n(0), n(1)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    let sccs = strongly_connected_components(view);
    assert_eq!(sccs.len(), 1);
    assert_eq!(sccs[0].len(), 2);
}

#[test]
fn scc_handles_deep_dags_without_recursion() {
    let count = 5000;
    let g = build_graph(count, |g| {
        for i in 0..count - 1 {
            g.add_edge(n(i), n(i + 1), 1);
        }
    });
    let sccs = strongly_connected_components(&g);
    assert_eq!(sccs.len(), count);
    for c in &sccs {
        assert_eq!(c.len(), 1);
    }
}

fn to_sorted_ids(s: &FxHashSet<NodeIndex>) -> Vec<usize> {
    let mut v: Vec<usize> = s.iter().map(|n| n.index()).collect();
    v.sort_unstable();
    v
}

// ---------------------------------------------------------------------------
// find_short_cycle
// ---------------------------------------------------------------------------

fn is_valid_cycle<'a, G: ReadonlyGraph<'a>>(graph: G, cycle: &[NodeIndex]) -> bool {
    if cycle.len() < 2 {
        return false;
    }
    let unique: FxHashSet<_> = cycle.iter().copied().collect();
    if unique.len() != cycle.len() {
        return false;
    }
    for i in 0..cycle.len() {
        let from = cycle[i];
        let to = cycle[(i + 1) % cycle.len()];
        if !graph.outgoing_edges(from).any(|t| t == to) {
            return false;
        }
    }
    true
}

#[test]
fn find_short_cycle_two_node_scc() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 1);
    });
    let cycle = find_short_cycle(&g, None).expect("test graph has a cycle");
    assert!(is_valid_cycle(&g, &cycle));
    assert_eq!(
        to_set(&cycle),
        [n(0), n(1)].into_iter().collect::<FxHashSet<_>>()
    );
}

#[test]
fn find_short_cycle_three_cycle() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(2), n(0), 1);
    });
    let cycle = find_short_cycle(&g, None).expect("test graph has a cycle");
    assert!(is_valid_cycle(&g, &cycle));
    assert_eq!(cycle.len(), 3);
}

#[test]
fn find_short_cycle_prefers_two_cycle_when_longer_exists() {
    // 2-cycle b ↔ c plus longer arm a → b → c → d → a. The 2-cycle should win.
    let g = build_graph(4, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(2), n(3), 1);
        g.add_edge(n(3), n(0), 1);
        g.add_edge(n(2), n(1), 1);
    });
    let cycle = find_short_cycle(&g, None).expect("test graph has a cycle");
    assert!(is_valid_cycle(&g, &cycle));
    assert_eq!(cycle.len(), 2);
    assert_eq!(
        to_set(&cycle),
        [n(1), n(2)].into_iter().collect::<FxHashSet<_>>()
    );
}

#[test]
fn find_short_cycle_uses_edge_weights_to_pick_lowest_total_weight() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 10);
        g.add_edge(n(1), n(0), 10);
        g.add_edge(n(0), n(2), 1);
        g.add_edge(n(2), n(0), 1);
        g.add_edge(n(1), n(2), 100);
        g.add_edge(n(2), n(1), 100);
    });
    let cycle = find_short_cycle(&g, None).expect("test graph has a cycle");
    assert!(is_valid_cycle(&g, &cycle));
    assert_eq!(cycle.len(), 2);
    assert_eq!(
        to_set(&cycle),
        [n(0), n(2)].into_iter().collect::<FxHashSet<_>>()
    );
}

// ---------------------------------------------------------------------------
// make_acyclic
// ---------------------------------------------------------------------------

fn assert_acyclic<N>(g: &DiGraph<N, u32>) {
    for c in strongly_connected_components(g) {
        assert!(c.len() <= 1, "found multi-node SCC of size {}", c.len());
    }
}

fn edge_set<N>(g: &DiGraph<N, u32>) -> FxHashSet<(usize, usize)> {
    let mut s = FxHashSet::default();
    for n in g.node_indices() {
        for t in g.neighbors_directed(n, petgraph::Direction::Outgoing) {
            s.insert((n.index(), t.index()));
        }
    }
    s
}

#[test]
fn make_acyclic_leaves_a_dag_unchanged() {
    let mut g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(0), n(2), 1);
    });
    let before = edge_set(&g);
    make_acyclic(&mut g);
    assert_eq!(edge_set(&g), before);
}

#[test]
fn make_acyclic_breaks_a_two_cycle_by_removing_lowest_weight_edge() {
    let mut g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 10);
        g.add_edge(n(1), n(0), 3);
    });
    make_acyclic(&mut g);
    assert_eq!(edge_set(&g), [(0, 1)].into_iter().collect::<FxHashSet<_>>());
}

#[test]
fn make_acyclic_breaks_a_three_cycle() {
    let mut g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 5);
        g.add_edge(n(1), n(2), 1);
        g.add_edge(n(2), n(0), 8);
    });
    make_acyclic(&mut g);
    assert_eq!(
        edge_set(&g),
        [(0, 1), (2, 0)].into_iter().collect::<FxHashSet<_>>()
    );
}

#[test]
fn make_acyclic_does_not_remove_self_loops() {
    let mut g = build_graph(1, |g| {
        g.add_edge(n(0), n(0), 5);
    });
    make_acyclic(&mut g);
    assert_eq!(edge_set(&g), [(0, 0)].into_iter().collect::<FxHashSet<_>>());
}

#[test]
fn make_acyclic_preserves_non_cycle_edges() {
    let mut g = build_graph(4, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 2);
        g.add_edge(n(1), n(2), 100);
        g.add_edge(n(2), n(3), 100);
    });
    make_acyclic(&mut g);
    assert_acyclic(&g);
    let edges = edge_set(&g);
    assert!(edges.contains(&(1, 2)));
    assert!(edges.contains(&(2, 3)));
}

// ---------------------------------------------------------------------------
// linearize
// ---------------------------------------------------------------------------

#[test]
fn linearize_empty_graph() {
    let g: DiGraph<usize, u32> = DiGraph::new();
    assert!(linearize(&g).is_empty());
}

#[test]
fn linearize_single_node() {
    let g = build_graph(1, |_| {});
    assert_eq!(ids(&linearize(&g)), vec![0]);
}

#[test]
fn linearize_emits_dependencies_before_dependents() {
    // a -> b -> c (a depends on b depends on c). c is a sink.
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
    });
    assert_eq!(ids(&linearize(&g)), vec![2, 1, 0]);
}

#[test]
fn linearize_higher_weight_dependents_placed_earlier() {
    // x is a sink; a (weight 1) and b (weight 10) both depend on x. b should be placed first.
    let g = build_graph(3, |g| {
        g.add_edge(n(1), n(0), 1);
        g.add_edge(n(2), n(0), 10);
    });
    assert_eq!(ids(&linearize(&g)), vec![0, 2, 1]);
}

#[test]
fn linearize_breaks_weight_ties_by_insertion_order() {
    // Both 1 and 2 depend on 0 with weight 1; 1's edge is added first, so 1 should be placed
    // before 2 after 0.
    let g = build_graph(3, |g| {
        g.add_edge(n(1), n(0), 1);
        g.add_edge(n(2), n(0), 1);
    });
    assert_eq!(ids(&linearize(&g)), vec![0, 1, 2]);
}

#[test]
fn linearize_diamond_is_topo() {
    // 0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3
    let g = build_graph(4, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(0), n(2), 1);
        g.add_edge(n(1), n(3), 1);
        g.add_edge(n(2), n(3), 1);
    });
    let order = linearize(&g);
    assert_eq!(order.len(), 4);
    let pos: std::collections::HashMap<NodeIndex, usize> =
        order.iter().enumerate().map(|(i, n)| (*n, i)).collect();
    assert!(pos[&n(3)] < pos[&n(1)]);
    assert!(pos[&n(3)] < pos[&n(2)]);
    assert!(pos[&n(1)] < pos[&n(0)]);
    assert!(pos[&n(2)] < pos[&n(0)]);
}

#[test]
fn linearize_runs_on_subgraphview() {
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
    });
    let subset: FxHashSet<_> = [n(0), n(1)].into_iter().collect();
    let view = SubgraphView::new(&g, &subset);
    assert_eq!(ids(&linearize(view)), vec![1, 0]);
}

#[test]
fn linearize_returns_partial_result_for_cyclic_graph() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 1);
    });
    assert!(linearize(&g).is_empty());
}

// ---------------------------------------------------------------------------
// split_into_chunks
// ---------------------------------------------------------------------------

fn order(ids_: &[usize]) -> Vec<NodeIndex> {
    ids_.iter().map(|&i| n(i)).collect()
}

#[test]
fn split_returns_empty_for_empty_global_order() {
    let chunks = split_simple(&[], &[], 3.0);
    assert!(chunks.is_empty());
}

#[test]
fn split_returns_single_chunk_for_one_module() {
    let chunks = split_simple(&order(&[0]), &[vec![0]], 3.0);
    assert_eq!(chunks, vec![vec![0]]);
}

#[test]
fn split_merges_two_modules_always_co_loaded() {
    let chunks = split_simple(&order(&[0, 1]), &[vec![0, 1]], 3.0);
    assert_eq!(chunks, vec![vec![0, 1]]);
}

#[test]
fn split_keeps_two_modules_separate_when_never_co_loaded() {
    let chunks = split_simple(&order(&[0, 1]), &[vec![0], vec![1]], 3.0);
    assert_eq!(chunks, vec![vec![0], vec![1]]);
}

#[test]
fn split_only_merges_adjacent_modules_that_share_chunk_groups() {
    let chunks = split_simple(&order(&[0, 1, 2]), &[vec![0, 1], vec![2]], 3.0);
    assert_eq!(chunks, vec![vec![0, 1], vec![2]]);
}

#[test]
fn split_merges_all_modules_when_every_group_contains_all() {
    let chunks = split_simple(&order(&[0, 1, 2, 3]), &[vec![0, 1, 2, 3]], 3.0);
    assert_eq!(chunks, vec![vec![0, 1, 2, 3]]);
}

#[test]
fn split_preserves_global_order_within_a_chunk() {
    // global_order is [2, 0, 1] (not [0, 1, 2]) — the chunk should follow it.
    let chunks = split_simple(&order(&[2, 0, 1]), &[vec![0, 1, 2]], 3.0);
    assert_eq!(chunks, vec![vec![2, 0, 1]]);
}

#[test]
fn split_does_not_merge_across_modules_no_one_co_loads() {
    // 0 and 2 are co-loaded but 1 is loaded alone; merging across 1 would balloon cost.
    let chunks = split_simple(&order(&[0, 1, 2]), &[vec![0, 2], vec![1]], 3.0);
    assert_eq!(chunks, vec![vec![0], vec![1], vec![2]]);
}

#[test]
fn split_higher_request_overhead_drives_more_aggressive_merging() {
    let groups = vec![vec![0, 1], vec![1, 2]];
    let chunks_low = split_simple(&order(&[0, 1, 2]), &groups, 1.0);
    assert_eq!(chunks_low, vec![vec![0], vec![1], vec![2]]);

    let chunks_high = split_simple(&order(&[0, 1, 2]), &groups, 10.0);
    assert_eq!(chunks_high, vec![vec![0, 1, 2]]);
}

// ---------------------------------------------------------------------------
// e2e (PoC pipeline)
// ---------------------------------------------------------------------------

fn run_pipeline(
    chunk_groups: &[Vec<usize>],
    node_count: usize,
    request_cost: f32,
) -> (Vec<Vec<usize>>, Vec<usize>) {
    let mut g = create_graph(chunk_groups, node_count);
    make_acyclic(&mut g);
    let global_order = linearize(&g);
    let chunks = split_simple(&global_order, chunk_groups, request_cost);
    let chunked = compute_chunked_chunk_groups(chunk_groups, &chunks);
    let request_counts: Vec<usize> = chunked.iter().map(|c| c.len()).collect();
    (chunks, request_counts)
}

#[test]
fn e2e_shared_sandwich_request_counts() {
    // Names → ids: shared-a=0, a=1, shared-b=2, b=3, c=4
    // Groups (PoC):
    //   ['shared-a', 'a',       'shared-b']
    //   ['shared-a', 'b',       'shared-b']
    //   ['shared-a', 'c',       'shared-b']
    //   ['shared-a', 'b']
    let groups = vec![vec![0, 1, 2], vec![0, 3, 2], vec![0, 4, 2], vec![0, 3]];
    let (_chunks, requests) = run_pipeline(&groups, 5, 3.0);
    // Each group makes at least one request.
    for &r in &requests {
        assert!(r >= 1);
    }
}

#[test]
fn e2e_shared_sequence_overhead_curve() {
    // Names → ids: x1=0, a=1, b=2, c=3, x2=4, y1=5, y2=6, z1=7, z2=8
    let groups = vec![
        vec![0, 1, 2, 3, 4],
        vec![1, 2, 3, 5, 6],
        vec![7, 8, 1, 2, 3],
    ];
    let (_chunks_1, req_1) = run_pipeline(&groups, 9, 1.0);
    let (_chunks_3, req_3) = run_pipeline(&groups, 9, 3.0);
    let (_chunks_5, req_5) = run_pipeline(&groups, 9, 5.0);

    // Higher request overhead → fewer (or equal) requests per group.
    for i in 0..groups.len() {
        assert!(
            req_3[i] <= req_1[i],
            "req_3 ({:?}) > req_1 ({:?})",
            req_3,
            req_1
        );
        assert!(
            req_5[i] <= req_3[i],
            "req_5 ({:?}) > req_3 ({:?})",
            req_5,
            req_3
        );
    }
}
