use std::ops::Index;

use petgraph::{visit::EdgeRef, Direction, Graph};
use rustc_hash::FxHashMap;
use turbo_tasks::FxIndexSet;

use crate::tree_shake::graph::{Dependency, ItemData, ItemId, ItemIdGroupKind, ItemIdItemKind};

pub(super) struct GraphOptimizer<'a> {
    pub graph_ix: &'a FxIndexSet<ItemId>,
    pub data: &'a FxHashMap<ItemId, ItemData>,
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

        // Currently we don't merge import bindings because of workarounds we are using.
        //
        // See graph.rs for actual workarounds. ImportBinding workaround is about using direct
        // imports for import bindings so the static code analysis pass can detect imports like
        // 'next/dynamic'.

        (matches!(
            item_id,
            ItemId::Item {
                kind: ItemIdItemKind::ImportBinding(..),
                ..
            }
        )) || (matches!(item_id, ItemId::Group(ItemIdGroupKind::Export(..)))
            && self.data[item_id].disable_export_merging)
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
}
