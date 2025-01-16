use std::{
    collections::{hash_map::Entry, BinaryHeap, HashMap, HashSet},
    hash::{DefaultHasher, Hash, Hasher},
    ops::{Deref, DerefMut},
};

use anyhow::Result;
use either::Either;
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use roaring::RoaringBitmap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use tracing::Instrument;
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

impl RoaringBitmapWrapper {
    pub fn is_proper_superset(&self, other: &Self) -> bool {
        !self.is_subset(other)
    }
}
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
    let span_outer = tracing::info_span!(
        "compute chunk group info",
        module_count = tracing::field::Empty,
        visit_count = tracing::field::Empty,
        chunk_group_count = tracing::field::Empty
    );

    let span = span_outer.clone();
    async move {
        let mut next_chunk_group_id = 0u32;
        let mut chunk_groups_to_id: HashMap<ChunkGroup, ChunkGroupId> = HashMap::new();
        let mut chunk_groups_from_id: HashMap<ChunkGroupId, ChunkGroup> = HashMap::new();

        let mut module_chunk_groups: HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
            HashMap::new();

        let graphs = graph.graphs.iter().try_join().await?;
        let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();
        span.record("module_count", module_count);

        let mut module_depth: HashMap<ResolvedVc<Box<dyn Module>>, usize> = HashMap::new();

        let entries = &graph.graphs.last().unwrap().await?.entries;
        graph
            .traverse_edges_from_entries_bfs(entries, |parent, node| {
                if let Some((parent, _)) = parent {
                    let parent_depth = *module_depth.get(&parent.module).unwrap();
                    module_depth.entry(node.module).or_insert(parent_depth + 1);
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
                       node: &'_ SingleModuleGraphModuleNode,
                       module_chunk_groups: &mut HashMap<
                    ResolvedVc<Box<dyn Module>>,
                    RoaringBitmapWrapper,
                >|
                       -> Result<GraphTraversalAction> {
                    enum ChunkGroupInheritance<It: Iterator<Item = ChunkGroup>> {
                        Inherit(ResolvedVc<Box<dyn Module>>),
                        ChunkGroup(It),
                    }
                    let chunk_groups = if let Some((parent, chunking_type)) = parent_info {
                        match chunking_type {
                            ChunkingType::Parallel
                            | ChunkingType::ParallelInheritAsync
                            | ChunkingType::Passthrough => {
                                ChunkGroupInheritance::Inherit(parent.module)
                            }
                            ChunkingType::Async => {
                                ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                    ChunkGroup::Async(node.module.ident().to_string().await?),
                                )))
                            }
                            ChunkingType::Isolated {
                                merge_tag: None, ..
                            } => ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                ChunkGroup::Isolated(node.module.ident().to_string().await?),
                            ))),
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
                                    // Collect solely to not borrow chunk_groups_from_id multiple
                                    // times in the iterators
                                    .collect::<Vec<_>>();

                                ChunkGroupInheritance::ChunkGroup(Either::Right(
                                    parent_chunk_groups.into_iter().map(|p| {
                                        ChunkGroup::IsolatedMerged(Box::new(p), merge_tag.clone())
                                    }),
                                ))
                            }
                            ChunkingType::Traced => unreachable!(),
                        }
                    } else {
                        ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                            ChunkGroup::Entry(node.module.ident().to_string().await?),
                        )))
                    };

                    Ok(match chunk_groups {
                        ChunkGroupInheritance::ChunkGroup(chunk_groups) => {
                            // let chunk_groups = chunk_groups.collect::<Vec<_>>();
                            // println!(
                            //     "{:?} chunk_groups: {:?}",
                            //     node.module.ident().to_string().await?,
                            //     chunk_groups
                            // );
                            // let chunk_groups = chunk_groups.into_iter();

                            // Start of a new chunk group, don't inherit anything from parent
                            let chunk_group_ids = chunk_groups.map(|chunk_group| {
                                match chunk_groups_to_id.entry(chunk_group) {
                                    Entry::Occupied(e) => e.get().0,
                                    Entry::Vacant(e) => {
                                        let chunk_group_id = next_chunk_group_id;
                                        next_chunk_group_id += 1;
                                        chunk_groups_from_id
                                            .insert(ChunkGroupId(chunk_group_id), e.key().clone());
                                        e.insert(ChunkGroupId(chunk_group_id));
                                        chunk_group_id
                                    }
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
                            //         .map(|id|
                            // chunk_groups_from_id.get(&ChunkGroupId(id)).unwrap())
                            //         .collect::<Vec<_>>()
                            // );

                            GraphTraversalAction::Continue
                        }
                        ChunkGroupInheritance::Inherit(parent) => {
                            // Only inherit chunk groups from parent

                            // TODO don't clone here, but both parent and current are stored in
                            // module_chunk_groups
                            let parent_chunk_groups =
                                module_chunk_groups.get(&parent).unwrap().clone();

                            match module_chunk_groups.entry(node.module) {
                                Entry::Occupied(mut e) => {
                                    let current_chunk_groups = e.get_mut();
                                    if parent_chunk_groups.is_proper_superset(current_chunk_groups)
                                    {
                                        // Add bits from parent, and continue traversal because
                                        // changed
                                        current_chunk_groups.0 |= parent_chunk_groups.0;
                                        GraphTraversalAction::Continue
                                    } else {
                                        // Skip, fixpoint reached
                                        GraphTraversalAction::Skip
                                    }
                                }
                                Entry::Vacant(e) => {
                                    e.insert(parent_chunk_groups);
                                    GraphTraversalAction::Continue
                                }
                            }
                        }
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
            struct NodeWithPriority {
                depth: usize,
                chunk_group_len: u64,
                node: GraphNodeIndex,
            }
            impl PartialOrd for NodeWithPriority {
                fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                    Some(self.cmp(other))
                }
            }
            impl Ord for NodeWithPriority {
                fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                    // BinaryHeap prioritizes high values

                    // Smaller depth has higher priority
                    let depth_order = self.depth.cmp(&other.depth).reverse();
                    // Smaller group length has higher priority
                    let chunk_group_len_order =
                        self.chunk_group_len.cmp(&other.chunk_group_len).reverse();

                    depth_order
                        .then(chunk_group_len_order)
                        // include GraphNodeIndex for total and deterministic ordering
                        .then(other.node.cmp(&self.node))
                }
            }

            let mut visit_count = 0usize;
            // let mut visit_count_map = HashMap::new();

            let mut queue_set = HashSet::new();
            let mut queue = entries
                .iter()
                .map(|e| NodeWithPriority {
                    depth: *module_depth.get(e).unwrap(),
                    chunk_group_len: 0,
                    node: ModuleGraph::get_entry(&graphs, e).unwrap(),
                })
                .collect::<BinaryHeap<_>>();
            for entry_node in &queue {
                visitor(
                    None,
                    get_node!(graphs, entry_node.node),
                    &mut module_chunk_groups,
                )
                .await?;
            }
            while let Some(NodeWithPriority { node, .. }) = queue.pop() {
                queue_set.remove(&node);
                let graph = &graphs[node.graph_idx].graph;
                let node_weight = get_node!(graphs, node);
                // println!(
                //     "traverse {} {} {}",
                //     depth,
                //     chunk_group_len,
                //     node_weight.module.ident().to_string().await?
                // );
                let neighbors = iter_neighbors(graph, node.node_idx);

                visit_count += 1;
                // *visit_count_map
                //     .entry(node_weight.module.ident().to_string().await?)
                //     .or_insert(0usize) += 1;

                for (edge, succ) in neighbors {
                    let succ = GraphNodeIndex {
                        graph_idx: node.graph_idx,
                        node_idx: succ,
                    };
                    let succ_weight = get_node!(graphs, succ);
                    let edge_weight = graph.edge_weight(edge).unwrap();
                    let action = visitor(
                        Some((node_weight, edge_weight)),
                        succ_weight,
                        &mut module_chunk_groups,
                    )
                    .await?;

                    if action == GraphTraversalAction::Continue && queue_set.insert(succ) {
                        queue.push(NodeWithPriority {
                            depth: *module_depth.get(&succ_weight.module).unwrap(),
                            chunk_group_len: module_chunk_groups
                                .get(&succ_weight.module)
                                .unwrap()
                                .len(),
                            node: succ,
                        });
                    }
                }
            }

            span.record("visit_count", visit_count);
            span.record("chunk_group_count", next_chunk_group_id);

            // let mut visit_count_map = visit_count_map
            //     .into_iter()
            //     .filter(|v| v.1 > 1)
            //     .collect::<Vec<_>>();
            // visit_count_map.sort_by_key(|v| v.1);
            // println!("module_count_map: {:#?}", visit_count_map);
        }

        Ok(Vc::cell(module_chunk_groups))
    }
    .instrument(span_outer)
    .await
}

// #[turbo_tasks::function]
// pub fn chunking_graph(&self) -> Vc<ChunkGroupInfo> {
//     ChunkGroupInfo
// }
