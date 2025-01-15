use std::{
    collections::{hash_map::Entry, BinaryHeap, HashMap},
    hash::{DefaultHasher, Hash, Hasher},
    ops::{Deref, DerefMut},
};

use anyhow::Result;
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use roaring::RoaringBitmap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, TryJoinIterExt, Vc,
};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{
        GraphNodeIndex, GraphTraversalAction, ModuleGraph, SingleModuleGraphModuleNode,
        SingleModuleGraphNode,
    },
};

#[derive(Clone, Debug, Default, PartialEq, TraceRawVcs, ValueDebugFormat)]
struct RoaringBitmapWrapper(#[turbo_tasks(trace_ignore)] pub RoaringBitmap);
unsafe impl NonLocalValue for RoaringBitmapWrapper {}

// RoaringBitmap doesn't impl Eq, not sure why: https://github.com/RoaringBitmap/roaring-rs/issues/302
impl Eq for RoaringBitmapWrapper {}

impl Deref for RoaringBitmapWrapper {
    type Target = RoaringBitmap;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl DerefMut for RoaringBitmapWrapper {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl Serialize for RoaringBitmapWrapper {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::Error;
        let mut bytes = vec![];
        self.0.serialize_into(&mut bytes).map_err(Error::custom)?;
        serializer.serialize_bytes(bytes.as_slice())
    }
}

impl<'de> Deserialize<'de> for RoaringBitmapWrapper {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let bytes = <&[u8]>::deserialize(deserializer)?;
        let map = RoaringBitmap::deserialize_unchecked_from(bytes).map_err(Error::custom)?;
        Ok(RoaringBitmapWrapper(map))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ChunkGroupInfo(HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ChunkGroup {
    /// e.g. a page
    Entry(ResolvedVc<Box<dyn Module>>),
    /// a module that has an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming non-merged isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming merging isolated edge
    IsolatedMerged(
        /* parent: */ ChunkGroupHash,
        /* merge_tag: */ RcStr,
    ),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ChunkGroupHash(u64);

impl ChunkGroup {
    fn hashed(&self) -> ChunkGroupHash {
        let mut hasher = DefaultHasher::new();
        self.hash(&mut hasher);
        ChunkGroupHash(hasher.finish())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ChunkGroupId(u32);

pub async fn compute_chunk_group_info(graph: &ModuleGraph) -> Result<Vc<ChunkGroupInfo>> {
    let mut next_chunk_group_id = 0u32;
    let mut chunk_groups_to_id: HashMap<ChunkGroup, ChunkGroupId> = HashMap::new();
    let mut chunk_groups_from_id: HashMap<ChunkGroupId, ChunkGroup> = HashMap::new();

    let mut module_chunk_groups: HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
        HashMap::new();

    let mut module_depth: HashMap<ResolvedVc<Box<dyn Module>>, usize> = HashMap::new();

    let entries = &graph.graphs.last().unwrap().await?.entries;

    graph.traverse_edges_from_entry(entries, |parent, node| {
        if let Some((parent, _)) = parent {
            let parent_depth = *module_depth.get(&parent.module).unwrap();
            let entry = module_depth.entry(node.module);
            match entry {
                Entry::Occupied(mut e) => {
                    if (parent_depth + 1) < *e.get() {
                        e.insert(parent_depth + 1);
                    }
                }
                Entry::Vacant(e) => {
                    e.insert(parent_depth + 1);
                }
            };
        } else {
            module_depth.insert(node.module, 0);
        };

        GraphTraversalAction::Continue
    });

    // ----

    {
        let mut visitor =
            |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
             node: &'_ SingleModuleGraphModuleNode|
             -> GraphTraversalAction {
                let chunk_group = if let Some((parent, chunking_type)) = parent_info {
                    match chunking_type {
                        ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => None,
                        ChunkingType::Async => Some(ChunkGroup::Async(node.module)),
                        ChunkingType::Isolated {
                            merge_tag: None, ..
                        } => Some(ChunkGroup::Isolated(node.module)),
                        ChunkingType::Isolated {
                            merge_tag: Some(merge_tag),
                            ..
                        } => {
                            let parent_chunk_groups = module_chunk_groups
                                .get(&parent.module)
                                .unwrap()
                                .iter()
                                .map(|id| {
                                    chunk_groups_from_id
                                        .get(&ChunkGroupId(id))
                                        .unwrap()
                                        .hashed()
                                });

                            Some(ChunkGroup::IsolatedMerged(
                                parent_chunk_groups,
                                merge_tag.clone(),
                            ))
                        }
                        ChunkingType::Passthrough | ChunkingType::Traced => unreachable!(),
                        _ => None,
                    }
                } else {
                    // entry
                    Some(ChunkGroup::Entry(node.module))
                };

                if let Some(chunk_group) = chunk_group {
                    // Start of a new chunk group, don't inherit anything from parent
                    let chunk_group_id =
                        if let Some(chunk_group_id) = chunk_groups_to_id.get(&chunk_group) {
                            *chunk_group_id
                        } else {
                            let chunk_group_id = ChunkGroupId(next_chunk_group_id);
                            next_chunk_group_id += 1;
                            chunk_groups_to_id.insert(chunk_group.clone(), chunk_group_id);
                            chunk_groups_from_id.insert(chunk_group_id, chunk_group.clone());
                            chunk_group_id
                        };

                    // Assign chunk group to the target node (the entry of the chunk group)
                    module_chunk_groups
                        .entry(node.module.clone())
                        .or_default()
                        .insert(chunk_group_id.0);
                    GraphTraversalAction::Continue
                } else if let Some((parent, _)) = parent_info {
                    // Only inherit chunk groups from parent

                    // TODO don't clone here, but both are stored in module_chunk_groups
                    let parent_chunk_groups =
                        module_chunk_groups.get(&parent.module).unwrap().clone();
                    match module_chunk_groups.entry(node.module.clone()) {
                        Entry::Occupied(mut e) => {
                            // Merge with parent, and continue traversal if modified
                            let current_chunk_groups = e.get_mut();
                            if parent_chunk_groups != *current_chunk_groups {
                                current_chunk_groups.0 |= parent_chunk_groups.0;
                                GraphTraversalAction::Continue
                            } else {
                                GraphTraversalAction::Skip
                            }
                        }
                        Entry::Vacant(e) => {
                            e.insert(parent_chunk_groups);
                            GraphTraversalAction::Continue
                        }
                    }
                } else {
                    GraphTraversalAction::Continue
                }
            };

        macro_rules! get_node {
            ($graphs:expr, $node:expr) => {{
                let node_idx = $node;
                match $graphs[node_idx.graph_idx]
                    .graph
                    .node_weight(node_idx.node_idx)
                    .unwrap()
                {
                    SingleModuleGraphNode::Module(node) => node,
                    SingleModuleGraphNode::VisitedModule { idx } => {
                        let SingleModuleGraphNode::Module(node) = $graphs[idx.graph_idx]
                            .graph
                            .node_weight(idx.node_idx)
                            .unwrap()
                        else {
                            panic!("expected Module node");
                        };
                        node
                    }
                }
            }};
        }
        fn iter_neighbors<N, E>(
            graph: &DiGraph<N, E>,
            node: NodeIndex,
        ) -> impl Iterator<Item = (EdgeIndex, NodeIndex)> + '_ {
            let mut walker = graph.neighbors(node).detach();
            std::iter::from_fn(move || walker.next(graph))
        }

        #[derive(Debug, Clone, PartialEq, Eq)]
        struct NodeWithPriority(usize, GraphNodeIndex);
        impl PartialOrd for NodeWithPriority {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }
        impl Ord for NodeWithPriority {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                // reverse for a min heap
                // include GraphNodeIndex for total and deterministic ordering
                self.0.cmp(&other.0).reverse().then(other.1.cmp(&self.1))
            }
        }

        let graphs = graph.graphs.iter().try_join().await?;
        let mut queue = entries
            .into_iter()
            .map(|e| {
                NodeWithPriority(
                    *module_depth.get(e).unwrap(),
                    ModuleGraph::get_entry(&graphs, e).unwrap(),
                )
            })
            .collect::<BinaryHeap<_>>();
        for entry_node in &queue {
            visitor(None, get_node!(graphs, entry_node.1));
        }
        while let Some(NodeWithPriority(_, node)) = queue.pop() {
            let graph = &graphs[node.graph_idx].graph;
            let node_weight = get_node!(graphs, node);
            let neighbors = iter_neighbors(graph, node.node_idx);

            for (edge, succ) in neighbors {
                let succ = GraphNodeIndex {
                    graph_idx: node.graph_idx,
                    node_idx: succ,
                };
                let succ_weight = get_node!(graphs, succ);
                let edge_weight = graph.edge_weight(edge).unwrap();
                let action = visitor(Some((node_weight, edge_weight)), succ_weight);
                if action == GraphTraversalAction::Continue {
                    queue.push(NodeWithPriority(
                        *module_depth.get(&succ_weight.module).unwrap(),
                        succ,
                    ));
                }
            }
        }
    }

    Ok(Vc::cell(module_chunk_groups))
}

// #[turbo_tasks::function]
// pub fn chunking_graph(&self) -> Vc<ChunkGroupInfo> {
//     ChunkGroupInfo
// }
