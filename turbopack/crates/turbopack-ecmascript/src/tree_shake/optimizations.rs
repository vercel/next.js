use petgraph::{visit::EdgeRef, Direction, Graph};

use crate::tree_shake::graph::Dependency;

/// Optimizes a condensed graph by merging nodes with only one incoming edge.
pub(super) fn merge_single_incoming_nodes<N>(g: &mut Graph<Vec<N>, Dependency>)
where
    N: Clone,
{
    let mut queue = vec![];
    let mut removed_nodes = vec![];

    for node in g.node_indices() {
        // If the node has only one incoming edge, we enqueue it
        if g.edges_directed(node, Direction::Incoming).count() == 1 {
            let dependant = g
                .edges_directed(node, Direction::Incoming)
                .next()
                .unwrap()
                .source();

            let dependencies = g
                .edges_directed(node, Direction::Outgoing)
                .map(|e| (e.target(), *e.weight()))
                .collect::<Vec<_>>();

            queue.push((node, dependant, dependencies));
            removed_nodes.push(node);
        }
    }

    for (original, dependant, dependencies) in queue {
        // Move all edges from node to dependant
        for (dependency, weight) in dependencies {
            g.add_edge(dependant, dependency, weight);
        }

        // Move items from original to dependant
        let items = g.node_weight(original).expect("Node should exist").clone();
        g.node_weight_mut(dependant).unwrap().extend(items);
    }

    // Remove all edges from source
    for node in removed_nodes.into_iter().rev() {
        g.remove_node(node).expect("Node should exist");
    }
}
