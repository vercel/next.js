use std::{
    collections::{hash_map::Entry, BinaryHeap, HashMap},
    hash::{DefaultHasher, Hash, Hasher},
    ops::{Deref, DerefMut},
};

use anyhow::Result;
use either::Either;
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use roaring::RoaringBitmap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc,
    TryJoinIterExt, ValueToString, Vc,
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
pub struct RoaringBitmapWrapper(#[turbo_tasks(trace_ignore)] pub RoaringBitmap);
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
    Entry(ReadRef<RcStr>),
    /// a module that has an incoming async edge
    Async(ReadRef<RcStr>),
    /// a module with a incoming non-merged isolated edge
    Isolated(ReadRef<RcStr>),
    /// a module with a incoming merging isolated edge
    IsolatedMerged(
        /* parent: */ Box<ChunkGroup>,
        // /* parent: */ ChunkGroupHash,
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

    graph
        .traverse_edges_from_entry(entries, |parent, node| {
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
        })
        .await?;

    // ----

    {
        let mut visitor =
            async |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
                   node: &'_ SingleModuleGraphModuleNode|
                   -> Result<GraphTraversalAction> {
                let chunk_groups = if let Some((parent, chunking_type)) = parent_info {
                    match chunking_type {
                        ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => None,
                        ChunkingType::Async => Some(Either::Left(std::iter::once(
                            ChunkGroup::Async(node.module.ident().to_string().await?),
                        ))),
                        ChunkingType::Isolated {
                            merge_tag: None, ..
                        } => Some(Either::Left(std::iter::once(ChunkGroup::Isolated(
                            node.module.ident().to_string().await?,
                        )))),
                        ChunkingType::Isolated {
                            merge_tag: Some(merge_tag),
                            ..
                        } => {
                            let parent_chunk_groups = module_chunk_groups
                                .get(&parent.module)
                                .unwrap()
                                .iter()
                                .map(|id| {
                                    chunk_groups_from_id.get(&ChunkGroupId(id)).unwrap().clone()
                                    // .hashed()
                                })
                                // Collect solely to not borrow chunk_groups_from_id multiple times
                                // in the iterators
                                .collect::<Vec<_>>();

                            Some(Either::Right(parent_chunk_groups.into_iter().map(|p| {
                                ChunkGroup::IsolatedMerged(Box::new(p), merge_tag.clone())
                            })))
                        }
                        ChunkingType::Passthrough | ChunkingType::Traced => unreachable!(),
                    }
                } else {
                    Some(Either::Left(std::iter::once(ChunkGroup::Entry(
                        node.module.ident().to_string().await?,
                    ))))
                };

                Ok(if let Some(chunk_groups) = chunk_groups {
                    // let chunk_groups = chunk_groups.collect::<Vec<_>>();
                    // println!(
                    //     "{:?} chunk_groups: {:?}",
                    //     node.module.ident().to_string().await?,
                    //     chunk_groups
                    // );
                    // let chunk_groups = chunk_groups.into_iter();

                    // Start of a new chunk group, don't inherit anything from parent
                    let chunk_group_ids = chunk_groups.map(|chunk_group| {
                        if let Some(chunk_group_id) = chunk_groups_to_id.get(&chunk_group) {
                            chunk_group_id.0
                        } else {
                            let chunk_group_id = next_chunk_group_id;
                            next_chunk_group_id += 1;
                            chunk_groups_to_id
                                .insert(chunk_group.clone(), ChunkGroupId(chunk_group_id));
                            chunk_groups_from_id
                                .insert(ChunkGroupId(chunk_group_id), chunk_group.clone());
                            chunk_group_id
                        }
                    });

                    // Assign chunk group to the target node (the entry of the chunk group)
                    let bitset = module_chunk_groups.entry(node.module).or_default();
                    bitset.0 |= RoaringBitmap::from_iter(chunk_group_ids);

                    // println!(
                    //     "{:?} chunk_groups: {:?}",
                    //     node.module.ident().to_string().await?,
                    //     bitset
                    //         .iter()
                    //         .map(|id| chunk_groups_from_id.get(&ChunkGroupId(id)).unwrap())
                    //         .collect::<Vec<_>>()
                    // );

                    GraphTraversalAction::Continue
                } else if let Some((parent, _)) = parent_info {
                    // Only inherit chunk groups from parent

                    // TODO don't clone here, but both are stored in module_chunk_groups
                    let parent_chunk_groups =
                        module_chunk_groups.get(&parent.module).unwrap().clone();
                    match module_chunk_groups.entry(node.module) {
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
                })
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

        let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();
        let mut visit_count = 0usize;

        let mut queue = entries
            .iter()
            .map(|e| {
                NodeWithPriority(
                    *module_depth.get(e).unwrap(),
                    ModuleGraph::get_entry(&graphs, e).unwrap(),
                )
            })
            .collect::<BinaryHeap<_>>();
        for entry_node in &queue {
            visitor(None, get_node!(graphs, entry_node.1)).await?;
        }
        while let Some(NodeWithPriority(priority, node)) = queue.pop() {
            let graph = &graphs[node.graph_idx].graph;
            let node_weight = get_node!(graphs, node);
            println!(
                "traverse {} {}",
                priority,
                node_weight.module.ident().to_string().await?
            );
            let neighbors = iter_neighbors(graph, node.node_idx);

            for (edge, succ) in neighbors {
                let succ = GraphNodeIndex {
                    graph_idx: node.graph_idx,
                    node_idx: succ,
                };
                let succ_weight = get_node!(graphs, succ);
                let edge_weight = graph.edge_weight(edge).unwrap();
                let action = visitor(Some((node_weight, edge_weight)), succ_weight).await?;
                visit_count += 1;
                if action == GraphTraversalAction::Continue {
                    queue.push(NodeWithPriority(
                        *module_depth.get(&succ_weight.module).unwrap(),
                        succ,
                    ));
                }
            }
        }

        println!(
            "module_count: {}, visit_count: {}",
            module_count, visit_count
        );
    }

    Ok(Vc::cell(module_chunk_groups))
}

// #[turbo_tasks::function]
// pub fn chunking_graph(&self) -> Vc<ChunkGroupInfo> {
//     ChunkGroupInfo
// }
