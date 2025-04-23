use std::{collections::VecDeque, ops::Index};

use petgraph::{
    graph::NodeIndex,
    visit::{Bfs, EdgeRef, Walker},
    Direction, Graph,
};
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
        N: Copy + Eq + std::hash::Hash + std::fmt::Debug,
        Self: Index<N, Output = ItemId>,
    {
        let mut did_work = false;
        // Stores nodes that will be merged into another node. Used to prevent merging
        // a node that's already destined to be removed.
        let mut merged_nodes: FxHashSet<NodeIndex> = FxHashSet::default();
        // Maps stepping stone node -> set of nodes to merge into it.
        let mut merge_targets: FxHashMap<NodeIndex, FxHashSet<NodeIndex>> = FxHashMap::default();

        // Identify potential stepping stone candidates first to avoid mutable borrow issues later.
        let candidates: Vec<_> = g
            .node_indices()
            .filter(|&c| {
                // A candidate must have multiple incoming edges...
                g.edges_directed(c, Direction::Incoming).count() > 1
                    // ... and must be a node type that is allowed to be merged into.
                    && g.node_weight(c).is_some_and(|items| !self.should_not_merge_iter(items))
            })
            .collect();

        for c in candidates {
            // If this candidate 'c' was already marked to be merged into another node earlier,
            // skip it as it will be removed anyway.
            if merged_nodes.contains(&c) {
                continue;
            }

            let predecessors: Vec<_> = g.neighbors_directed(c, Direction::Incoming).collect();

            // Find all nodes reachable from 'c', excluding 'c' itself.
            // We use an immutable borrow (&*g) here as we don't modify the graph yet.
            let reachable_from_c: FxHashSet<_> =
                Bfs::new(&*g, c).iter(&*g).filter(|&n| n != c).collect();

            let mut exclusively_reachable = FxHashSet::default();

            for &r in &reachable_from_c {
                // Skip 'r' if it's already marked for merging into some other node.
                if merged_nodes.contains(&r) {
                    continue;
                }
                // Skip 'r' if it's a node type that should not be merged.
                if g.node_weight(r)
                    .is_none_or(|items| self.should_not_merge_iter(items))
                {
                    continue;
                }

                // Determine if 'r' is reachable from any predecessor 'p' *without* going through
                // 'c'.
                let mut reachable_without_c = false;
                for &p in &predecessors {
                    let mut queue = VecDeque::new();
                    let mut visited = FxHashSet::default();

                    // Start BFS from predecessor 'p'.
                    queue.push_back(p);
                    visited.insert(p);

                    while let Some(curr) = queue.pop_front() {
                        if curr == r {
                            // Found a path from 'p' to 'r' that doesn't go through 'c'.
                            reachable_without_c = true;
                            break; // No need to continue BFS for this 'p'.
                        }

                        // Explore neighbors. Crucially, stop exploring this path if we hit 'c'.
                        for neighbor in g.neighbors_directed(curr, Direction::Outgoing) {
                            if neighbor != c && visited.insert(neighbor) {
                                queue.push_back(neighbor);
                            }
                        }
                    }
                    if reachable_without_c {
                        // Found a path from *some* predecessor, no need to check other
                        // predecessors.
                        break;
                    }
                }

                // If no path was found from *any* predecessor 'p' to 'r' without going via 'c',
                // then 'r' is exclusively reachable via 'c' (from this set of predecessors).
                if !reachable_without_c {
                    exclusively_reachable.insert(r);
                }
            }

            // If we found nodes exclusively reachable via 'c', record them for merging.
            if !exclusively_reachable.is_empty() {
                // Add these nodes to the merge target list for 'c'.
                merge_targets
                    .entry(c)
                    .or_default()
                    .extend(&exclusively_reachable);
                // Mark these nodes globally as 'merged' to prevent them being processed as
                // candidates or targets for other stepping stones later.
                merged_nodes.extend(&exclusively_reachable);
                // Indicate that we performed optimization work.
                did_work = true;
            }
        }

        // --- Perform the actual merges ---
        // Collect all nodes that need to be removed after merging.
        let mut nodes_to_actually_remove = Vec::new();

        for (stepping_stone, nodes_to_merge) in merge_targets {
            // Check if the stepping stone itself still exists (it might have been removed if
            // it was marked as 'merged_nodes' in a previous iteration, though candidates filter
            // should prevent this).
            if g.node_weight(stepping_stone).is_none() {
                continue;
            }

            // Collect items and edges from all nodes being merged into this stepping_stone first,
            // before modifying the graph to avoid borrowing issues.
            let mut items_to_add = Vec::new();
            let mut edges_to_add = Vec::new(); // Vec<(target_node, dependency_weight)>

            for node in nodes_to_merge {
                // Check if the node to merge still exists in the graph.
                if let Some(node_weight) = g.node_weight(node) {
                    // Collect items from the node being merged.
                    items_to_add.extend(node_weight.clone());

                    // Collect its outgoing edges to reroute them from the stepping stone.
                    for edge in g.edges_directed(node, Direction::Outgoing) {
                        edges_to_add.push((edge.target(), *edge.weight()));
                    }

                    // Mark this node for final removal from the graph.
                    nodes_to_actually_remove.push(node);
                }
            }

            // Add the collected items to the stepping stone node.
            if let Some(ss_weight) = g.node_weight_mut(stepping_stone) {
                ss_weight.extend(items_to_add);
            }

            // Add the collected edges, now originating from the stepping stone.
            for (target, weight) in edges_to_add {
                // Check if an edge from stepping_stone to target already exists.
                match g.find_edge(stepping_stone, target) {
                    Some(edge_index) => {
                        // If edge exists, potentially upgrade its weight from Weak to Strong.
                        let edge_weight = g.edge_weight_mut(edge_index).unwrap();
                        if matches!(edge_weight, Dependency::Weak)
                            && !matches!(weight, Dependency::Weak)
                        {
                            *edge_weight = weight;
                        }
                    }
                    None => {
                        // Add a new edge only if the target node still exists
                        // (it might have been removed if it was also part of
                        // `nodes_to_actually_remove`).
                        if g.node_weight(target).is_some() {
                            g.add_edge(stepping_stone, target, weight);
                        }
                    }
                }
            }
        }

        // Remove all merged nodes from the graph.
        // Sort for deterministic behavior (optional but good practice).
        nodes_to_actually_remove.sort_unstable();
        // Ensure we try removing each node only once.
        nodes_to_actually_remove.dedup();
        // Iterate in reverse to avoid index invalidation issues.
        for node in nodes_to_actually_remove.into_iter().rev() {
            // Check again if node exists before removing, as the graph might have changed.
            if g.node_weight(node).is_some() {
                // remove_node also removes all incident edges.
                g.remove_node(node);
            }
        }

        did_work
    }
}
