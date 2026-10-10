//! Pure unit tests for the graph-based CSS chunking algorithm.
//!
//! Direct port of the PoC's `vitest` suites (see the upstream proof of concept). The
//! `e2e_*` tests cover the assembled pipeline; the rest cover individual stages.

use petgraph::graph::{DiGraph, NodeIndex};
use rustc_hash::FxHashSet;

use super::{
    algorithm::{
        ChunkGroupIndex, ModuleChunkGroups, compute_chunked_chunk_groups, create_graph, linearize,
        make_acyclic, refine_feedback_arc_order, split_into_chunks, strongly_connected_components,
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

fn ids(v: &[NodeIndex]) -> Vec<usize> {
    v.iter().map(|n| n.index()).collect()
}

/// Empty module-to-groups map for `linearize` tests on small hand-built graphs. Every `shared`
/// call returns 0, so the tie-break falls through to insertion order.
fn no_groups(node_count: usize) -> ModuleChunkGroups {
    ModuleChunkGroups::from_sorted(vec![vec![]; node_count])
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
        // weight_distribution = 0 weights every group equally, reproducing the PoC's
        // `(requestOverhead + 1*M) * N`.
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
    let (g, _) = create_graph(&[], 0);
    assert_eq!(g.node_count(), 0);
}

#[test]
fn create_graph_assigns_sequential_indices() {
    // Note: in the PoC, `createGraph` assigns node ids by first-appearance. In the Rust port the
    // caller pre-assigns ids, so we test that node count and edge structure match.
    let (g, _) = create_graph(&[vec![0, 1, 2]], 3);
    assert_eq!(g.node_count(), 3);
}

#[test]
fn create_graph_pairwise_edges_for_each_group() {
    // group [0, 1, 2, 3] => 1->0, 2->0, 2->1, 3->0, 3->1, 3->2
    let (g, _) = create_graph(&[vec![0, 1, 2, 3]], 4);
    assert!(outgoing_targets(&g, n(0)).is_empty());
    assert_eq!(outgoing_targets(&g, n(1)), vec![0]);
    assert_eq!(outgoing_targets(&g, n(2)), vec![0, 1]);
    assert_eq!(outgoing_targets(&g, n(3)), vec![0, 1, 2]);
}

#[test]
fn create_graph_all_edge_weights_are_one_within_a_single_group() {
    let (g, _) = create_graph(&[vec![0, 1, 2]], 3);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(2)), vec![(0, 1), (1, 1)]);
}

#[test]
fn create_graph_accumulates_weights_for_repeated_pairs() {
    let (g, _) = create_graph(&[vec![0, 1], vec![0, 1], vec![0, 1]], 2);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 3)]);
    assert_eq!(incoming_with_weight(&g, n(0)), vec![(1, 3)]);
}

#[test]
fn create_graph_single_element_groups_produce_no_edges() {
    let (g, _) = create_graph(&[vec![0], vec![1]], 2);
    assert!(outgoing_targets(&g, n(0)).is_empty());
    assert!(outgoing_targets(&g, n(1)).is_empty());
    assert!(incoming_targets(&g, n(0)).is_empty());
    assert!(incoming_targets(&g, n(1)).is_empty());
}

#[test]
fn create_graph_preserves_group_order_when_computing_edges() {
    // [0, 1, 2] then [2, 1, 0] should produce edges in BOTH directions.
    let (g, _) = create_graph(&[vec![0, 1, 2], vec![2, 1, 0]], 3);
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(1, 1), (2, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(1)), vec![(0, 1), (2, 1)]);
    assert_eq!(outgoing_with_weight(&g, n(2)), vec![(0, 1), (1, 1)]);
}

#[test]
fn create_graph_duplicated_module_in_a_group_creates_self_loop() {
    let (g, _) = create_graph(&[vec![0, 0]], 1);
    assert_eq!(outgoing_with_weight(&g, n(0)), vec![(0, 1)]);
}

#[test]
fn create_graph_builds_module_to_groups_index() {
    // module 0 is in groups 0 and 1; module 1 only in group 0; module 2 only in group 1.
    let (_, module_to_groups) = create_graph(&[vec![0, 1], vec![0, 2]], 3);
    assert_eq!(
        module_to_groups.groups_of(0),
        &[ChunkGroupIndex(0), ChunkGroupIndex(1)]
    );
    assert_eq!(module_to_groups.groups_of(1), &[ChunkGroupIndex(0)]);
    assert_eq!(module_to_groups.groups_of(2), &[ChunkGroupIndex(1)]);
}

// ---------------------------------------------------------------------------
// ModuleChunkGroups::shared
// ---------------------------------------------------------------------------

#[test]
fn shared_counts_chunk_group_intersection() {
    let module_to_groups = ModuleChunkGroups::from_sorted(vec![
        vec![0, 1, 2, 4], // module 0
        vec![1, 2, 3],    // module 1
        vec![],           // module 2
    ]);
    // {0,1,2,4} ∩ {1,2,3} = {1,2}
    assert_eq!(module_to_groups.shared(n(0), n(1)), 2);
    // nothing shared with a module in no groups
    assert_eq!(module_to_groups.shared(n(0), n(2)), 0);
    // a module shares all of its own groups with itself
    assert_eq!(module_to_groups.shared(n(0), n(0)), 4);
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

#[test]
fn make_acyclic_equal_weight_tie_prefers_lower_node_index() {
    let mut g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 1);
    });
    make_acyclic(&mut g);
    assert_eq!(edge_set(&g), [(0, 1)].into_iter().collect::<FxHashSet<_>>());
}

#[test]
fn make_acyclic_refines_non_adjacent_counterexample_move() {
    let groups = [vec![0, 1], vec![2, 0], vec![0, 1, 2]];
    let (graph, _) = create_graph(&groups, 3);
    let scc = strongly_connected_components(&graph)
        .into_iter()
        .find(|component| component.len() > 1)
        .unwrap();
    // This is the seed heuristic's order. Neither adjacent swap improves it, but moving node 2
    // from the end to the front increases satisfied edge weight from 3 to 4.
    let mut order = vec![n(1), n(0), n(2)];
    refine_feedback_arc_order(&mut order, &graph, &scc);
    assert_eq!(ids(&order), vec![2, 1, 0]);
}

#[test]
fn make_acyclic_refines_node_toward_end() {
    let groups = [vec![1, 0], vec![0, 2], vec![2, 1, 0]];
    let (graph, _) = create_graph(&groups, 3);
    let scc = strongly_connected_components(&graph)
        .into_iter()
        .find(|component| component.len() > 1)
        .unwrap();
    // Reverse of the preceding fixture: moving node 2 from the front to the end increases the
    // satisfied edge weight from 3 to 4.
    let mut order = vec![n(2), n(0), n(1)];
    refine_feedback_arc_order(&mut order, &graph, &scc);
    assert_eq!(ids(&order), vec![0, 1, 2]);
}

#[test]
fn make_acyclic_refinement_keeps_equal_score_order() {
    let mut graph = build_graph(3, |g| {
        for from in 0..3 {
            for to in 0..3 {
                if from != to {
                    g.add_edge(n(from), n(to), 1);
                }
            }
        }
    });
    let scc: FxHashSet<_> = [n(0), n(1), n(2)].into_iter().collect();
    let mut order = vec![n(2), n(0), n(1)];
    refine_feedback_arc_order(&mut order, &graph, &scc);
    assert_eq!(ids(&order), vec![2, 0, 1]);

    make_acyclic(&mut graph);
    assert_acyclic(&graph);
}

#[test]
fn make_acyclic_counterexample_reaches_optimal_final_order() {
    let groups = [vec![0, 1], vec![2, 0], vec![0, 1, 2]];
    let (mut graph, module_to_groups) = create_graph(&groups, 3);
    make_acyclic(&mut graph);
    let order = linearize(&graph, &module_to_groups);
    assert_eq!(ids(&order), vec![0, 1, 2]);
}

#[test]
fn make_acyclic_dense_equal_weight_graph_is_deterministic() {
    fn run() -> FxHashSet<(usize, usize)> {
        let mut g = build_graph(64, |g| {
            for from in 0..64 {
                for to in 0..64 {
                    if from != to {
                        g.add_edge(n(from), n(to), 1);
                    }
                }
            }
        });
        make_acyclic(&mut g);
        assert_acyclic(&g);
        edge_set(&g)
    }

    let edges = run();
    assert_eq!(edges, run());
    assert_eq!(edges.len(), 64 * 63 / 2);
    assert!(edges.iter().all(|&(from, to)| from < to));
}

// ---------------------------------------------------------------------------
// linearize
// ---------------------------------------------------------------------------

#[test]
fn linearize_empty_graph() {
    let g: DiGraph<usize, u32> = DiGraph::new();
    assert!(linearize(&g, &no_groups(0)).is_empty());
}

#[test]
fn linearize_single_node() {
    let g = build_graph(1, |_| {});
    assert_eq!(ids(&linearize(&g, &no_groups(1))), vec![0]);
}

#[test]
fn linearize_emits_dependencies_before_dependents() {
    // a -> b -> c (a depends on b depends on c). c is a sink.
    let g = build_graph(3, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(2), 1);
    });
    assert_eq!(ids(&linearize(&g, &no_groups(3))), vec![2, 1, 0]);
}

#[test]
fn linearize_prefers_candidate_sharing_most_chunk_groups_with_last_placed() {
    // 1 and 2 both depend on 0, so both become ready once 0 is placed. Module 2 shares two chunk
    // groups with 0 while module 1 shares only one, so 2 is placed next — even though 1 comes
    // first in insertion order.
    let g = build_graph(3, |g| {
        g.add_edge(n(1), n(0), 1);
        g.add_edge(n(2), n(0), 1);
    });
    let module_to_groups = ModuleChunkGroups::from_sorted(vec![
        vec![0, 1, 2], // module 0
        vec![0],       // module 1: shares 1 group ({0}) with module 0
        vec![0, 1],    // module 2: shares 2 groups ({0, 1}) with module 0
    ]);
    assert_eq!(ids(&linearize(&g, &module_to_groups)), vec![0, 2, 1]);
}

#[test]
fn linearize_breaks_last_placed_ties_by_earlier_placements() {
    // Placement forces the order 0 -> 1, then a choice between 2 and 3 (both depend on 1).
    // 2 and 3 share the same number of groups with the last-placed module 1 (tie at depth 0), so
    // the tie is broken by looking one further back to module 0 (depth 1): module 3 shares two
    // groups with 0 while module 2 shares one, so 3 is placed before 2.
    let g = build_graph(4, |g| {
        g.add_edge(n(1), n(0), 1); // 1 depends on 0
        g.add_edge(n(2), n(1), 1); // 2 depends on 1
        g.add_edge(n(3), n(1), 1); // 3 depends on 1
    });
    // Each module's group list is ascending, as `create_graph` produces.
    let module_to_groups = ModuleChunkGroups::from_sorted(vec![
        vec![0, 1],    // module 0
        vec![2],       // module 1 (irrelevant sharing)
        vec![0, 2],    // module 2: shared(2,1)=1 ({2}); shared(2,0)=1 ({0})
        vec![0, 1, 2], // module 3: shared(3,1)=1 ({2}); shared(3,0)=2 ({0,1})
    ]);
    // pick after [0,1]: depth 0 (last=1) -> shared(2,1)=shared(3,1)=1 (tie);
    //                   depth 1 (ref=0)  -> shared(2,0)=1, shared(3,0)=2 -> 3 wins.
    assert_eq!(ids(&linearize(&g, &module_to_groups)), vec![0, 1, 3, 2]);
}

#[test]
fn linearize_breaks_ties_by_insertion_order() {
    // Both 1 and 2 depend on 0 and share no chunk groups with anything (empty map), so the tie
    // falls to insertion order: 1's edge is added first, so 1 is placed before 2 after 0.
    let g = build_graph(3, |g| {
        g.add_edge(n(1), n(0), 1);
        g.add_edge(n(2), n(0), 1);
    });
    assert_eq!(ids(&linearize(&g, &no_groups(3))), vec![0, 1, 2]);
}

#[test]
fn linearize_ties_keep_insertion_order_across_removals() {
    // Four disconnected sinks, no shared groups: every step is a pure tie, so the result must be
    // insertion order. This is the case that exposed the `swap_remove` scramble bug — with 3+
    // simultaneous candidates, removing one used to move the last candidate into its slot and
    // corrupt the "earliest remaining candidate" tie-break. Candidates now carry a stable index,
    // so the order is preserved regardless of `swap_remove`.
    let g = build_graph(4, |_| {});
    assert_eq!(ids(&linearize(&g, &no_groups(4))), vec![0, 1, 2, 3]);
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
    let order = linearize(&g, &no_groups(4));
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
    assert_eq!(ids(&linearize(view, &no_groups(3))), vec![1, 0]);
}

#[test]
fn linearize_returns_partial_result_for_cyclic_graph() {
    let g = build_graph(2, |g| {
        g.add_edge(n(0), n(1), 1);
        g.add_edge(n(1), n(0), 1);
    });
    assert!(linearize(&g, &no_groups(2)).is_empty());
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

#[test]
fn split_weight_distribution_protects_small_groups_from_overshipping() {
    // Module 0 is shared by both groups; module 1 is unique to the larger group B. Group A is
    // small (loads only [0]); group B is larger (loads [0, 1]). Merging [0] and [1] saves group B
    // a request but overships module 1 to the small group A.
    let groups = vec![vec![0], vec![0, 1]];
    let global_order = order(&[0, 1]);
    let sizes = vec![100u64; 2];
    let styles = no_global(2);

    let split = |weight_distribution: f32| -> Vec<Vec<usize>> {
        split_into_chunks(
            &global_order,
            &groups,
            &sizes,
            &styles,
            300.0,
            weight_distribution,
            0,
        )
        .into_iter()
        .map(|(chunk, _cost)| chunk)
        .collect()
    };

    // weight_distribution = 0 weights every group equally, so the request saved for B outweighs
    // the bytes overshipped to A and the chunks fuse.
    assert_eq!(split(0.0), vec![vec![0, 1]]);

    // A high weight_distribution gives the small group A a much larger weight, making the overship
    // of module 1 to A cost more than the request it would save, so module 1 stays isolated.
    assert_eq!(split(3.0), vec![vec![0], vec![1]]);
}

// ---------------------------------------------------------------------------
// Performance benchmark
// ---------------------------------------------------------------------------

fn dense_scc_fixture() -> Vec<Vec<usize>> {
    let mut groups = vec![(0..454).collect::<Vec<_>>()];
    for group_idx in 0..14 {
        let mut group = Vec::with_capacity(24);
        // Reverse ten well-spaced nodes from the giant group. Across fourteen groups this creates
        // roughly the supplied number of reciprocal pairs while connecting most giant-group nodes.
        for offset in (0..10).rev() {
            group.push((group_idx * 31 + offset * 47) % 454);
        }
        // Reuse the 45 outside nodes cyclically so they participate in overlapping constraints.
        for offset in 0..14 {
            group.push(454 + (group_idx * 7 + offset) % 45);
        }
        groups.push(group);
    }
    groups
}

#[test]
#[ignore]
fn bench_make_acyclic_dense_scc() {
    use std::time::Instant;

    let groups = dense_scc_fixture();
    let (mut graph, _) = create_graph(&groups, 499);
    let cyclic_sccs: Vec<_> = strongly_connected_components(&graph)
        .into_iter()
        .filter(|scc| scc.len() > 1)
        .collect();
    eprintln!(
        "BENCH input groups={} nodes={} edges={} cyclic_sccs={} largest_scc={}",
        groups.len(),
        graph.node_count(),
        graph.edge_count(),
        cyclic_sccs.len(),
        cyclic_sccs.iter().map(FxHashSet::len).max().unwrap_or(0)
    );
    let start = Instant::now();
    make_acyclic(&mut graph);
    let elapsed = start.elapsed();
    eprintln!(
        "BENCH elapsed={elapsed:?} remaining_edges={}",
        graph.edge_count()
    );
    assert_acyclic(&graph);
}

#[test]
#[ignore]
fn bench_make_acyclic_many_small_sccs() {
    use std::time::Instant;

    for &size in &[1600, 3200, 6400, 12800, 25600] {
        let mut g = build_graph(size, |g| {
            for i in (0..size).step_by(2) {
                g.add_edge(n(i), n(i + 1), 1);
                g.add_edge(n(i + 1), n(i), 2);
            }
        });
        let start = Instant::now();
        make_acyclic(&mut g);
        eprintln!(
            "BENCH many_small_sccs size={size} elapsed={:?}",
            start.elapsed()
        );
        assert_acyclic(&g);
    }
}

// ---------------------------------------------------------------------------
// e2e (PoC pipeline)
// ---------------------------------------------------------------------------

fn run_pipeline(
    chunk_groups: &[Vec<usize>],
    node_count: usize,
    request_cost: f32,
) -> (Vec<Vec<usize>>, Vec<usize>) {
    let (mut g, module_to_groups) = create_graph(chunk_groups, node_count);
    make_acyclic(&mut g);
    let global_order = linearize(&g, &module_to_groups);
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
