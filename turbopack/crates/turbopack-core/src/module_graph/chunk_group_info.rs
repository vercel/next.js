use std::{
    collections::{hash_map::Entry, BinaryHeap, HashMap, HashSet},
    hash::Hash,
    ops::{Deref, DerefMut},
};

use anyhow::Result;
use either::Either;
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use roaring::RoaringBitmap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
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

#[derive(
    Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat,
)]
pub struct RoaringBitmapWrapper(#[turbo_tasks(trace_ignore)] RoaringBitmap);

impl RoaringBitmapWrapper {
    /// Whether `self` contains bits that are not in `other`
    ///
    /// The existing `is_superset` method also returns true for equal sets
    pub fn is_proper_superset(&self, other: &Self) -> bool {
        !self.is_subset(other)
    }

    pub fn into_inner(self) -> RoaringBitmap {
        self.0
    }
}
unsafe impl NonLocalValue for RoaringBitmapWrapper {}

// RoaringBitmap doesn't impl Eq: https://github.com/RoaringBitmap/roaring-rs/issues/302
// PartialEq can only return true if both bitmaps have the same internal representation, but two
// bitmaps with the same content should always have the same internal representation
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

#[turbo_tasks::value(transparent)]
pub struct ChunkGroupInfo(HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ChunkGroup {
    /// e.g. A page
    Entry(ResolvedVc<Box<dyn Module>>),
    /// a module that has an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming non-merged isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming merging isolated edge
    IsolatedMerged {
        parent: ChunkGroupId,
        merge_tag: RcStr,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ChunkGroupId(u32);

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
        let chunk_group_len_order = self.chunk_group_len.cmp(&other.chunk_group_len).reverse();

        depth_order
            .then(chunk_group_len_order)
            // include GraphNodeIndex for total and deterministic ordering
            .then(other.node.cmp(&self.node))
    }
}

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

        // First, compute the depth for each module in the graph
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

                module_chunk_groups.insert(node.module, RoaringBitmapWrapper::default());

                GraphTraversalAction::Continue
            })
            .await?;

        // ----

        let mut visitor =
            |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
             node: &'_ SingleModuleGraphModuleNode,
             module_chunk_groups: &mut HashMap<
                ResolvedVc<Box<dyn Module>>,
                RoaringBitmapWrapper,
            >|
             -> GraphTraversalAction {
                enum ChunkGroupInheritance<It: Iterator<Item = ChunkGroup>> {
                    Inherit(ResolvedVc<Box<dyn Module>>),
                    ChunkGroup(It),
                }
                let chunk_groups =
                    if let Some((parent, chunking_type)) = parent_info {
                        match chunking_type {
                            ChunkingType::Parallel
                            | ChunkingType::ParallelInheritAsync
                            | ChunkingType::Passthrough => {
                                ChunkGroupInheritance::Inherit(parent.module)
                            }
                            ChunkingType::Async => ChunkGroupInheritance::ChunkGroup(Either::Left(
                                std::iter::once(ChunkGroup::Async(node.module)),
                            )),
                            ChunkingType::Isolated {
                                merge_tag: None, ..
                            } => ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                ChunkGroup::Isolated(node.module),
                            ))),
                            ChunkingType::Isolated {
                                merge_tag: Some(merge_tag),
                                ..
                            } => ChunkGroupInheritance::ChunkGroup(Either::Right(
                                module_chunk_groups.get(&parent.module).unwrap().iter().map(
                                    |parent| ChunkGroup::IsolatedMerged {
                                        parent: ChunkGroupId(parent),
                                        merge_tag: merge_tag.clone(),
                                    },
                                ),
                            )),
                            ChunkingType::Traced => {
                                // Traced modules are not placed in chunk groups
                                return GraphTraversalAction::Skip;
                            }
                        }
                    } else {
                        ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                            ChunkGroup::Entry(node.module),
                        )))
                    };

                match chunk_groups {
                    ChunkGroupInheritance::ChunkGroup(chunk_groups) => {
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

                        let chunk_groups =
                            RoaringBitmapWrapper(RoaringBitmap::from_iter(chunk_group_ids));

                        // Assign chunk group to the target node (the entry of the chunk group)
                        let bitset = module_chunk_groups.get_mut(&node.module).unwrap();
                        if chunk_groups.is_proper_superset(bitset) {
                            // Add bits from parent, and continue traversal because changed
                            **bitset |= chunk_groups.into_inner();

                            GraphTraversalAction::Continue
                        } else {
                            // Unchanged, no need to forward to children
                            GraphTraversalAction::Skip
                        }
                    }
                    ChunkGroupInheritance::Inherit(parent) => {
                        // Inherit chunk groups from parent, merge parent chunk groups into current

                        if parent == node.module {
                            // A self-reference
                            GraphTraversalAction::Skip
                        } else {
                            // Fast path
                            let [Some(parent_chunk_groups), Some(current_chunk_groups)] =
                                module_chunk_groups.get_many_mut([&parent, &node.module])
                            else {
                                // All modules are inserted in the previous iteration
                                unreachable!()
                            };

                            if current_chunk_groups.is_empty() {
                                // Initial visit, clone instead of merging
                                *current_chunk_groups = parent_chunk_groups.clone();
                                GraphTraversalAction::Continue
                            } else if parent_chunk_groups.is_proper_superset(current_chunk_groups) {
                                // Add bits from parent, and continue traversal because changed
                                **current_chunk_groups |= &**parent_chunk_groups;
                                GraphTraversalAction::Continue
                            } else {
                                // Unchanged, no need to forward to children
                                GraphTraversalAction::Skip
                            }
                        }
                    }
                }
            };

        let mut visit_count = 0usize;

        {
            let mut queue_set = HashSet::new();
            let mut queue = BinaryHeap::with_capacity(entries.len());
            for e in entries {
                queue.push(NodeWithPriority {
                    depth: *module_depth.get(e).unwrap(),
                    chunk_group_len: 0,
                    node: ModuleGraph::get_entry(&graphs, *e).await?,
                });
            }
            for entry_node in &queue {
                visitor(
                    None,
                    get_node!(graphs, entry_node.node),
                    &mut module_chunk_groups,
                );
            }
            while let Some(NodeWithPriority { node, .. }) = queue.pop() {
                queue_set.remove(&node);
                let graph = &graphs[node.graph_idx].graph;
                let node_weight = get_node!(graphs, node);
                let neighbors = iter_neighbors(graph, node.node_idx);

                visit_count += 1;

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
                    );

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
        }

        span.record("visit_count", visit_count);
        span.record("chunk_group_count", next_chunk_group_id);

        Ok(Vc::cell(module_chunk_groups))
    }
    .instrument(span_outer)
    .await
}
