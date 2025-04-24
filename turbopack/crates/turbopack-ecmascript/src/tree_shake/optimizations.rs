use std::ops::Index;

use petgraph::{graph::NodeIndex, visit::EdgeRef, Direction, Graph};
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::FxIndexSet;

use crate::tree_shake::graph::{Dependency, ItemId};

pub(super) struct GraphOptimizer<'a> {
    pub graph_ix: &'a FxIndexSet<ItemId>,
}

impl Index<u32> for GraphOptimizer<'_> {
    type Output = ItemId;

    fn index(&self, index: u32) -> &Self::Output {
        &self.graph_ix[index as usize]
    }
}

impl GraphOptimizer<'_> {
    pub(super) fn should_not_merge<N>(&self, item: &N) -> bool
    where
        N: Copy,
        Self: Index<N, Output = ItemId>,
    {
        let item_id = &self[*item];

        // Currently we don't merge import bindings because those node are phantom nodes.

        item_id.is_phantom()
    }

    fn should_not_merge_iter<N>(&self, items: &[N]) -> bool
    where
        N: Copy,
        Self: Index<N, Output = ItemId>,
    {
        items.iter().any(|item| self.should_not_merge(item))
    }

    /// Optimizes a condensed graph by merging nodes with only one incoming edge.
    ///
    /// Returns true if any nodes were merged.
    pub(super) fn merge_single_incoming_nodes<N>(&self, g: &mut Graph<Vec<N>, Dependency>) -> bool
    where
        N: Copy,
        Self: Index<N, Output = ItemId>,
    {
        let mut queue = vec![];
        let mut removed_nodes = vec![];

        for node in g.node_indices() {
            // ImportBinding nodes should not be merged
            let node_data = g.node_weight(node).expect("Node should exist");
            if self.should_not_merge_iter(node_data) {
                continue;
            }

            // If the node has only one incoming edge, we enqueue it
            if g.edges_directed(node, Direction::Incoming).count() == 1 {
                let dependant = g
                    .edges_directed(node, Direction::Incoming)
                    .next()
                    .unwrap()
                    .source();

                if self.should_not_merge_iter(&g[dependant]) {
                    continue;
                }

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
                let edge = g
                    .find_edge(dependant, dependency)
                    .and_then(|e| g.edge_weight_mut(e));
                match edge {
                    Some(v) => {
                        if matches!(v, Dependency::Weak) {
                            *v = weight;
                        }
                    }
                    None => {
                        g.add_edge(dependant, dependency, weight);
                    }
                }
            }

            // Move items from original to dependant
            let items = g.node_weight(original).expect("Node should exist").clone();
            g.node_weight_mut(dependant).unwrap().extend(items);
        }

        let mut did_work = false;
        // Remove all edges from source
        for node in removed_nodes.into_iter().rev() {
            g.remove_node(node).expect("Node should exist");

            did_work = true;
        }

        did_work
    }

    /// This function merges nodes that can only be reached from a single starting point.
    /// Example:
    /// If we have a graph with edges: A->B, B->C, A->C, B->E, D->E
    /// Then B and C can only be reached from A, so they will be merged into A.
    /// The resulting graph would have edges like: (A,B,C)->E, D->E
    pub(super) fn merge_nodes_with_same_starting_point<N>(
        &self,
        g: &mut Graph<Vec<N>, Dependency>,
    ) -> bool
    where
        N: Copy,
        Self: Index<N, Output = ItemId>,
    {
        let mut did_work = false;
        let mut reachability: FxHashMap<_, FxHashSet<_>> = FxHashMap::default();

        // Step 1: Build a reverse reachability map (which starting nodes can reach each node)
        // We consider a "starting node" as one with no incoming edges
        let starting_nodes: Vec<_> = g
            .node_indices()
            .filter(|&node| g.edges_directed(node, Direction::Incoming).count() == 0)
            .collect();

        // For each starting node, find all nodes reachable from it
        for &start in &starting_nodes {
            let mut visited = FxHashSet::default();
            let mut queue = vec![start];

            while let Some(node) = queue.pop() {
                if !visited.insert(node) {
                    continue;
                }

                // For each outgoing edge, add the target to queue
                for edge in g.edges_directed(node, Direction::Outgoing) {
                    let target = edge.target();
                    queue.push(target);

                    // Add this starting node to the set of starting nodes that can reach target
                    reachability.entry(target).or_default().insert(start);
                }
            }
        }

        // Step 2: Find nodes that are reachable from exactly one starting node
        // and group them by that starting node
        let mut merge_groups: FxHashMap<_, Vec<_>> = FxHashMap::default();

        for node in g.node_indices() {
            // Skip starting nodes
            if starting_nodes.contains(&node) {
                continue;
            }

            // Skip nodes that should not be merged
            if self.should_not_merge_iter(g.node_weight(node).expect("Node should exist")) {
                continue;
            }

            // If this node is reachable from exactly one starting node, add it to that group
            if let Some(reachable_from) = reachability.get(&node) {
                if reachable_from.len() == 1 {
                    let start = *reachable_from.iter().next().unwrap();

                    // Don't merge if the starting node should not be merged
                    if self.should_not_merge_iter(g.node_weight(start).expect("Node should exist"))
                    {
                        continue;
                    }

                    merge_groups.entry(start).or_default().push(node);
                }
            }
        }

        // Step 3: Merge nodes into their starting points
        for (start, nodes_to_merge) in merge_groups {
            if nodes_to_merge.is_empty() {
                continue;
            }

            let mut nodes_to_remove = Vec::new();

            for node in nodes_to_merge {
                // Skip if a node no longer exists in the graph. This may happen if `nodes_to_merge`
                // contains a duplicate.
                if g.node_weight(node).is_none() {
                    continue;
                }

                // Move outgoing edges from node to start
                let outgoing_edges: Vec<_> = g
                    .edges_directed(node, Direction::Outgoing)
                    .map(|e| (e.target(), *e.weight()))
                    .collect();

                for (target, weight) in outgoing_edges {
                    // If there's already an edge from start to target, only update if necessary
                    let existing_edge = g.find_edge(start, target);
                    match existing_edge {
                        Some(e) => {
                            let edge_weight = g.edge_weight_mut(e).unwrap();
                            // Only upgrade from weak to strong dependency
                            if matches!(edge_weight, Dependency::Weak)
                                && !matches!(weight, Dependency::Weak)
                            {
                                *edge_weight = weight;
                            }
                        }
                        None => {
                            // Add a new edge
                            g.add_edge(start, target, weight);
                        }
                    }
                }

                // Move items from this node to the starting node
                let items = g.node_weight(node).expect("Node should exist").clone();
                g.node_weight_mut(start).unwrap().extend(items);

                nodes_to_remove.push(node);
            }

            // Remove merged nodes (in reverse order to preserve indices)
            nodes_to_remove.sort();
            for node in nodes_to_remove.into_iter().rev() {
                g.remove_node(node).expect("Node should exist");
                did_work = true;
            }
        }

        did_work
    }

    /// If the graph is
    ///
    /// a -> c -> d -> f
    /// a -> c -> e -> f
    /// b -> c
    ///
    /// all of `d, e, f` should be merged into `c` because they are all reachable only by stepping
    /// through `c`.
    pub(super) fn perform_dominator_analysis<N>(&self, g: &mut Graph<Vec<N>, Dependency>) -> bool
    where
        N: Copy,
        Self: Index<N, Output = ItemId>,
    {
        let mut did_work = false;

        let starting_nodes: Vec<_> = g
            .node_indices()
            .filter(|&node| g.edges_directed(node, Direction::Incoming).count() == 0)
            .collect();

        for &starting_node in &starting_nodes {
            if g.node_weight(starting_node).is_none() {
                continue;
            }

            // Skip nodes that shouldn't be merged
            if self.should_not_merge_iter(g.node_weight(starting_node).expect("Node should exist"))
            {
                continue;
            }

            // Create a reachability map to avoid accessing unreachable nodes
            let mut reachable_from_entry = FxHashSet::default();
            let mut queue = vec![starting_node];

            while let Some(node) = queue.pop() {
                if !reachable_from_entry.insert(node) {
                    continue;
                }

                for edge in g.edges_directed(node, Direction::Outgoing) {
                    queue.push(edge.target());
                }
            }

            // Build a map of nodes that dominate other nodes
            let mut dom_map: FxHashMap<NodeIndex, Vec<NodeIndex>> = FxHashMap::default();

            // For each node, check if all paths to it go through a potential dominator
            for node in g.node_indices() {
                // Skip entry node and unreachable nodes
                if node == starting_node || !reachable_from_entry.contains(&node) {
                    continue;
                }

                // Find all nodes with a path to this node
                let mut can_reach_node: FxHashSet<NodeIndex> = FxHashSet::default();

                for &start in &starting_nodes {
                    if start == starting_node {
                        continue;
                    }

                    let mut visited = FxHashSet::default();
                    let mut queue = vec![start];
                    let mut can_reach = false;

                    while let Some(current) = queue.pop() {
                        if !visited.insert(current) {
                            continue;
                        }

                        if current == node {
                            can_reach = true;
                            break;
                        }

                        for edge in g.edges_directed(current, Direction::Outgoing) {
                            queue.push(edge.target());
                        }
                    }

                    if can_reach {
                        can_reach_node.insert(start);
                    }
                }

                // Find all incoming neighbors
                let incoming_neighbors: FxHashSet<_> = g
                    .edges_directed(node, Direction::Incoming)
                    .map(|e| e.source())
                    .collect();

                // A node is a dominator if all paths to this node must go through it
                for &potential_dom in &incoming_neighbors {
                    if potential_dom == starting_node {
                        continue;
                    }

                    // Remember the outgoing edges to restore them later
                    let mut visited: FxHashSet<NodeIndex> = FxHashSet::default();
                    let mut queue = vec![starting_node];
                    let mut can_reach_without_dom = false;

                    // Check if we can reach node without going through potential_dom
                    while let Some(current) = queue.pop() {
                        if !visited.insert(current) {
                            continue;
                        }

                        if current == node {
                            can_reach_without_dom = true;
                            break;
                        }

                        // Skip potential dominator in our traversal
                        if current == potential_dom {
                            continue;
                        }

                        for edge in g.edges_directed(current, Direction::Outgoing) {
                            queue.push(edge.target());
                        }
                    }

                    // If node is not reachable without potential_dom, it's a dominator
                    if !can_reach_without_dom {
                        dom_map.entry(potential_dom).or_default().push(node);
                    }
                }
            }

            // For each dominator, merge all nodes it dominates into it
            for (dominator, dominated_nodes) in dom_map {
                if g.node_weight(dominator).is_none() {
                    continue;
                }

                // Skip if dominator node should not be merged
                if self.should_not_merge_iter(g.node_weight(dominator).expect("Node should exist"))
                {
                    continue;
                }

                let mut nodes_to_remove = Vec::new();

                for node in dominated_nodes {
                    if g.node_weight(node).is_none() {
                        continue;
                    }

                    // Skip nodes that shouldn't be merged
                    if self.should_not_merge_iter(g.node_weight(node).expect("Node should exist")) {
                        continue;
                    }

                    // Move outgoing edges from node to dominator
                    let outgoing_edges: Vec<_> = g
                        .edges_directed(node, Direction::Outgoing)
                        .map(|e| (e.target(), *e.weight()))
                        .collect();

                    for (target, weight) in outgoing_edges {
                        // If there's already an edge from dominator to target, only update if
                        // necessary
                        let existing_edge = g.find_edge(dominator, target);
                        match existing_edge {
                            Some(e) => {
                                let edge_weight = g.edge_weight_mut(e).unwrap();
                                // Only upgrade from weak to strong dependency
                                if matches!(edge_weight, Dependency::Weak)
                                    && !matches!(weight, Dependency::Weak)
                                {
                                    *edge_weight = weight;
                                }
                            }
                            None => {
                                // Add a new edge
                                g.add_edge(dominator, target, weight);
                            }
                        }
                    }

                    // Move items from this node to the dominator node
                    let items = g.node_weight(node).expect("Node should exist").clone();
                    g.node_weight_mut(dominator).unwrap().extend(items);

                    nodes_to_remove.push(node);
                }

                // Remove merged nodes (in reverse order to preserve indices)
                nodes_to_remove.sort();
                for node in nodes_to_remove.into_iter().rev() {
                    g.remove_node(node).expect("Node should exist");
                    did_work = true;
                }
            }
        }

        did_work
    }
}
