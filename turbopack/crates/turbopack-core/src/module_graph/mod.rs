use std::{
    collections::{BinaryHeap, HashSet, VecDeque, hash_map::Entry},
    future::Future,
};

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
use petgraph::{
    graph::{DiGraph, EdgeIndex, NodeIndex},
    visit::{
        Dfs, EdgeRef, IntoNeighbors, IntoNodeReferences, NodeIndexable, Reversed, VisitMap,
        Visitable,
    },
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt,
    ValueToString, Vc,
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType},
    issue::{ImportTrace, ImportTracer, ImportTraces, Issue},
    module::Module,
    module_graph::{
        async_module_info::{AsyncModulesInfo, compute_async_module_info},
        chunk_group_info::{ChunkGroupEntry, ChunkGroupInfo, compute_chunk_group_info},
        merged_modules::{MergedModuleInfo, compute_merged_modules},
        module_batches::{ModuleBatchesGraph, compute_module_batches},
        style_groups::{StyleGroups, StyleGroupsConfig, compute_style_groups},
        traced_di_graph::{TracedDiGraph, iter_neighbors_rev},
    },
    reference::primary_chunkable_referenced_modules,
    resolve::ExportUsage,
};

pub mod async_module_info;
pub mod chunk_group_info;
pub mod export_usage;
pub mod merged_modules;
pub mod module_batch;
pub(crate) mod module_batches;
pub(crate) mod style_groups;
mod traced_di_graph;

pub use self::module_batches::BatchingConfig;

#[derive(
    Debug, Copy, Clone, Eq, PartialOrd, Ord, Hash, PartialEq, Serialize, Deserialize, TraceRawVcs,
)]
pub struct GraphNodeIndex {
    #[turbo_tasks(trace_ignore)]
    graph_idx: u32,
    #[turbo_tasks(trace_ignore)]
    node_idx: NodeIndex,
}
impl GraphNodeIndex {
    #[inline(always)]
    fn graph_idx(&self) -> usize {
        self.graph_idx as usize
    }
}

unsafe impl NonLocalValue for GraphNodeIndex {}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct VisitedModules {
    pub modules: FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
    next_graph_idx: u32,
}

#[turbo_tasks::value_impl]
impl VisitedModules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Self {
            modules: Default::default(),
            next_graph_idx: 0,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn from_graph(graph: Vc<SingleModuleGraph>) -> Result<Vc<Self>> {
        Ok(Self {
            modules: graph
                .await?
                .enumerate_nodes()
                .flat_map(|(node_idx, module)| match module {
                    SingleModuleGraphNode::Module(SingleModuleGraphModuleNode {
                        module, ..
                    }) => Some((
                        *module,
                        GraphNodeIndex {
                            graph_idx: 0,
                            node_idx,
                        },
                    )),
                    SingleModuleGraphNode::VisitedModule { .. } => None,
                })
                .collect(),
            next_graph_idx: 1,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub fn with_incremented_index(&self) -> Result<Vc<Self>> {
        Ok(Self {
            modules: self.modules.clone(),
            next_graph_idx: self.next_graph_idx + 1,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn concatenate(&self, graph: Vc<SingleModuleGraph>) -> Result<Vc<Self>> {
        let graph = graph.await?;
        let iter = self
            .modules
            .iter()
            .map(|(module, idx)| (*module, *idx))
            .chain(
                graph
                    .enumerate_nodes()
                    .flat_map(|(node_idx, module)| match module {
                        SingleModuleGraphNode::Module(SingleModuleGraphModuleNode {
                            module,
                            ..
                        }) => Some((
                            *module,
                            GraphNodeIndex {
                                graph_idx: self.next_graph_idx,
                                node_idx,
                            },
                        )),
                        SingleModuleGraphNode::VisitedModule { .. } => None,
                    }),
            );

        let mut map = FxIndexMap::with_capacity_and_hasher(
            self.modules.len() + graph.number_of_modules,
            Default::default(),
        );
        for (k, v) in iter {
            map.entry(k).or_insert(v);
        }
        map.shrink_to_fit();

        Ok(Self {
            modules: map,
            next_graph_idx: self.next_graph_idx + 1,
        }
        .cell())
    }
}

pub type GraphEntriesT = Vec<ChunkGroupEntry>;

#[turbo_tasks::value(transparent)]
pub struct GraphEntries(GraphEntriesT);

#[turbo_tasks::value_impl]
impl GraphEntries {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
#[derive(Clone, Default)]
pub struct SingleModuleGraph {
    pub graph: TracedDiGraph<SingleModuleGraphNode, RefData>,

    /// The number of modules in the graph (excluding VisitedModule nodes)
    pub number_of_modules: usize,

    // NodeIndex isn't necessarily stable (because of swap_remove), but we never remove nodes.
    //
    // HashMaps have nondeterministic order, but this map is only used for lookups (in
    // `get_module`) and not iteration.
    //
    // This contains Vcs, but they are already contained in the graph, so no need to trace this.
    #[turbo_tasks(trace_ignore)]
    modules: FxHashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,

    #[turbo_tasks(trace_ignore)]
    pub entries: GraphEntriesT,
}

#[derive(
    Debug,
    Clone,
    Hash,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Eq,
    PartialEq,
    ValueDebugFormat,
    NonLocalValue,
)]
pub struct RefData {
    pub chunking_type: ChunkingType,
    pub export: ExportUsage,
}

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
    /// The resulting graph's outgoing edges are in reverse order.
    async fn new_inner(
        entries: &GraphEntriesT,
        visited_modules: &FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
        include_traced: bool,
    ) -> Result<Vc<Self>> {
        let emit_spans = tracing::enabled!(Level::INFO);
        let root_edges = entries
            .iter()
            .flat_map(|e| e.entries())
            .map(|e| async move {
                Ok(SingleModuleGraphBuilderEdge {
                    to: SingleModuleGraphBuilderNode::new_module(emit_spans, e).await?,
                    export: ExportUsage::All,
                })
            })
            .try_join()
            .await?;

        let (children_nodes_iter, visited_nodes) = AdjacencyMap::new()
            .skip_duplicates_with_key(|node: &(SingleModuleGraphBuilderNode, ExportUsage)| &node.0)
            .visit(
                root_edges,
                SingleModuleGraphBuilder {
                    visited_modules,
                    emit_spans,
                    include_traced,
                },
            )
            .await
            .completed()?
            .into_inner_with_visited();
        let node_count = visited_nodes.0.len();
        drop(visited_nodes);

        let mut graph: DiGraph<SingleModuleGraphNode, RefData> = DiGraph::with_capacity(
            node_count,
            // From real world measurements each module has about 3-4 children
            // If it has more this would cause an additional allocation, but that's fine
            node_count * 4,
        );

        let mut number_of_modules = 0;
        let mut modules: FxHashMap<ResolvedVc<Box<dyn Module>>, NodeIndex> =
            FxHashMap::with_capacity_and_hasher(node_count, Default::default());
        {
            let _span = tracing::info_span!("build module graph").entered();
            for (parent, (current, export)) in children_nodes_iter.into_breadth_first_edges() {
                let parent_edge = match parent.map(|v| v.0) {
                    Some(SingleModuleGraphBuilderNode::Module { module, .. }) => Some((
                        *modules.get(&module).unwrap(),
                        RefData {
                            chunking_type: COMMON_CHUNKING_TYPE,
                            export,
                        },
                    )),
                    Some(SingleModuleGraphBuilderNode::ChunkableReference { .. }) => {
                        // Handled when visiting ChunkableReference below
                        continue;
                    }
                    Some(SingleModuleGraphBuilderNode::VisitedModule { .. }) => unreachable!(),
                    None => None,
                };

                match current {
                    SingleModuleGraphBuilderNode::Module { module, ident: _ } => {
                        // Find the current node, if it was already added
                        let current_idx = if let Some(current_idx) = modules.get(&module) {
                            *current_idx
                        } else {
                            let idx = graph.add_node(SingleModuleGraphNode::Module(
                                SingleModuleGraphModuleNode { module },
                            ));
                            number_of_modules += 1;
                            modules.insert(module, idx);
                            idx
                        };
                        // Add the edge
                        if let Some((parent_idx, ref_data)) = parent_edge {
                            graph.add_edge(parent_idx, current_idx, ref_data);
                        }
                    }
                    SingleModuleGraphBuilderNode::VisitedModule { module, idx } => {
                        // Find the current node, if it was already added
                        let current_idx = if let Some(current_idx) = modules.get(&module) {
                            *current_idx
                        } else {
                            let idx = graph
                                .add_node(SingleModuleGraphNode::VisitedModule { idx, module });
                            modules.insert(module, idx);
                            idx
                        };
                        // Add the edge
                        if let Some((parent_idx, data)) = parent_edge {
                            graph.add_edge(parent_idx, current_idx, data);
                        }
                    }
                    SingleModuleGraphBuilderNode::ChunkableReference {
                        source,
                        target,
                        ref_data,
                        ..
                    } => {
                        // Find the current node, if it was already added
                        let target_idx = if let Some(target_idx) = modules.get(&target) {
                            *target_idx
                        } else {
                            let target_idx = visited_modules.get(&target);
                            let idx = graph.add_node(match target_idx {
                                Some(idx) => SingleModuleGraphNode::VisitedModule {
                                    idx: *idx,
                                    module: target,
                                },
                                None => {
                                    SingleModuleGraphNode::Module(SingleModuleGraphModuleNode {
                                        module: target,
                                    })
                                }
                            });
                            modules.insert(target, idx);
                            idx
                        };
                        graph.add_edge(*modules.get(&source).unwrap(), target_idx, ref_data);
                    }
                }
            }
        }

        graph.shrink_to_fit();

        #[cfg(debug_assertions)]
        {
            use once_cell::sync::Lazy;
            static CHECK_FOR_DUPLICATE_MODULES: Lazy<bool> = Lazy::new(|| {
                match std::env::var_os("TURBOPACK_TEMP_DISABLE_DUPLICATE_MODULES_CHECK") {
                    Some(v) => v != "1" && v != "true",
                    None => true,
                }
            });
            if *CHECK_FOR_DUPLICATE_MODULES {
                let mut duplicates = Vec::new();
                let mut set = FxHashSet::default();
                for &module in modules.keys() {
                    let ident = module.ident().to_string().await?;
                    if !set.insert(ident.clone()) {
                        duplicates.push(ident)
                    }
                }
                if !duplicates.is_empty() {
                    panic!("Duplicate module idents in graph: {duplicates:#?}");
                }
            }
        }

        let graph = SingleModuleGraph {
            graph: TracedDiGraph::new(graph),
            number_of_modules,
            modules,
            entries: entries.clone(),
        }
        .cell();

        turbo_tasks::emit(ResolvedVc::upcast::<Box<dyn ImportTracer>>(
            ModuleGraphImportTracer::new(graph).to_resolved().await?,
        ));
        Ok(graph)
    }

    fn get_module(&self, module: ResolvedVc<Box<dyn Module>>) -> Result<NodeIndex> {
        self.modules
            .get(&module)
            .copied()
            .context("Couldn't find module in graph")
    }

    /// Iterate over all nodes in the graph
    pub fn iter_nodes(&self) -> impl Iterator<Item = &'_ SingleModuleGraphModuleNode> + '_ {
        self.graph.node_weights().filter_map(|n| match n {
            SingleModuleGraphNode::Module(node) => Some(node),
            SingleModuleGraphNode::VisitedModule { .. } => None,
        })
    }

    /// Returns true if the given module is in this graph and is an entry module
    pub fn has_entry_module(&self, module: ResolvedVc<Box<dyn Module>>) -> bool {
        if let Some(index) = self.modules.get(&module) {
            self.graph
                .edges_directed(*index, petgraph::Direction::Incoming)
                .next()
                .is_none()
        } else {
            false
        }
    }

    /// Iterate over graph entry points
    pub fn entry_modules(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + '_ {
        self.entries.iter().flat_map(|e| e.entries())
    }

    /// Enumerate all nodes in the graph
    pub fn enumerate_nodes(
        &self,
    ) -> impl Iterator<Item = (NodeIndex, &'_ SingleModuleGraphNode)> + '_ {
        self.graph.node_references()
    }

    /// Traverses all reachable nodes (once)
    pub fn traverse_from_entry<'a>(
        &'a self,
        entry: ResolvedVc<Box<dyn Module>>,
        mut visitor: impl FnMut(&'a SingleModuleGraphModuleNode),
    ) -> Result<()> {
        let entry_node = self.get_module(entry)?;

        let mut dfs = Dfs::new(&*self.graph, entry_node);
        while let Some(nx) = dfs.next(&*self.graph) {
            let SingleModuleGraphNode::Module(weight) = self.graph.node_weight(nx).unwrap() else {
                return Ok(());
            };
            // weight.emit_issues();
            visitor(weight);
        }
        Ok(())
    }

    /// Traverses all reachable nodes once
    pub fn traverse_nodes_from_entries<'a, S>(
        &'a self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        visit_preorder: impl Fn(&'a SingleModuleGraphModuleNode, &mut S) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(&'a SingleModuleGraphModuleNode, &mut S) -> Result<()>,
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(e).unwrap());

        enum Pass {
            Visit,
            ExpandAndVisit,
        }

        let mut stack: Vec<(Pass, NodeIndex)> =
            entries.map(|e| (Pass::ExpandAndVisit, e)).collect();
        let mut expanded = FxHashSet::default();
        while let Some((pass, current)) = stack.pop() {
            match pass {
                Pass::Visit => {
                    if let SingleModuleGraphNode::Module(current_node) =
                        graph.node_weight(current).unwrap()
                    {
                        visit_postorder(current_node, state)?;
                    }
                }
                Pass::ExpandAndVisit => {
                    if expanded.insert(current)
                        && let SingleModuleGraphNode::Module(current_node) =
                            graph.node_weight(current).unwrap()
                    {
                        let action = visit_preorder(current_node, state)?;
                        if action == GraphTraversalAction::Exclude {
                            continue;
                        }
                        stack.push((Pass::Visit, current));
                        if action == GraphTraversalAction::Continue {
                            stack.extend(
                                iter_neighbors_rev(graph, current)
                                    .map(|(_, child)| (Pass::ExpandAndVisit, child)),
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverses all reachable edges exactly once and calls the visitor with the edge source and
    /// target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `visitor` - Called before visiting the children of a node.
    ///    - Receives (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entries<'a>(
        &'a self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a RefData)>,
            &'a SingleModuleGraphModuleNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(e).unwrap());

        let mut stack = entries.collect::<Vec<_>>();
        let mut discovered = graph.visit_map();
        // entry_weight.emit_issues();
        for entry_node in &stack {
            let SingleModuleGraphNode::Module(entry_weight) =
                graph.node_weight(*entry_node).unwrap()
            else {
                continue;
            };
            visitor(None, entry_weight);
        }

        while let Some(node) = stack.pop() {
            let SingleModuleGraphNode::Module(node_weight) = graph.node_weight(node).unwrap()
            else {
                continue;
            };
            if discovered.visit(node) {
                let neighbors = {
                    let mut neighbors = vec![];
                    let mut walker = graph.neighbors(node).detach();
                    while let Some((edge, succ)) = walker.next(graph) {
                        neighbors.push((edge, succ));
                    }
                    neighbors
                };

                for (edge, succ) in neighbors {
                    let SingleModuleGraphNode::Module(succ_weight) =
                        graph.node_weight(succ).unwrap()
                    else {
                        continue;
                    };
                    let edge_weight = graph.edge_weight(edge).unwrap();
                    let action = visitor(Some((node_weight, edge_weight)), succ_weight);
                    if !discovered.is_visited(&succ) && action == GraphTraversalAction::Continue {
                        stack.push(succ);
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverses all edges exactly once and calls the visitor with the edge source and
    /// target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    pub fn traverse_edges<'a>(
        &'a self,
        mut visitor: impl FnMut(
            (
                Option<(&'a SingleModuleGraphModuleNode, &'a RefData)>,
                &'a SingleModuleGraphModuleNode,
            ),
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graph = &self.graph;
        let mut stack: Vec<NodeIndex> = self
            .entries
            .iter()
            .flat_map(|e| e.entries())
            .map(|e| *self.modules.get(&e).unwrap())
            .collect();
        let mut discovered = graph.visit_map();
        for entry_node in &stack {
            let SingleModuleGraphNode::Module(entry_node) = graph.node_weight(*entry_node).unwrap()
            else {
                continue;
            };
            visitor((None, entry_node));
        }

        while let Some(node) = stack.pop() {
            if discovered.visit(node) {
                let SingleModuleGraphNode::Module(node_weight) = graph.node_weight(node).unwrap()
                else {
                    continue;
                };
                for edge in graph.edges(node).collect::<Vec<_>>() {
                    let edge_weight = edge.weight();
                    let succ = edge.target();
                    let SingleModuleGraphNode::Module(succ_weight) =
                        graph.node_weight(succ).unwrap()
                    else {
                        continue;
                    };
                    let action = visitor((Some((node_weight, edge_weight)), succ_weight));
                    if !discovered.is_visited(&succ) && action == GraphTraversalAction::Continue {
                        stack.push(succ);
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverses all reachable nodes and also continue revisiting them as long the visitor returns
    /// GraphTraversalAction::Continue. The visitor is responsible for the runtime complexity and
    /// eventual termination of the traversal. This corresponds to computing a fixed point state for
    /// the graph.
    ///
    /// It is guaranteed that the parent node passed to the `visit` function, if any, has
    /// already been passed to `visit`.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `visit` - Called for a specific edge
    ///    - Receives: Option(originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode
    ///    - Return [GraphTraversalAction]s to control the traversal
    ///
    /// Returns the number of node visits (i.e. higher than the node
    /// count if there are retraversals).
    pub fn traverse_edges_from_entries_fixed_point<'a>(
        &'a self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visit: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a RefData)>,
            &'a SingleModuleGraphNode,
        ) -> Result<GraphTraversalAction>,
    ) -> Result<usize> {
        let mut queue = VecDeque::default();
        let mut queue_set = FxHashSet::default();

        for module in entries {
            let index = self.get_module(module).unwrap();
            let action = visit(None, self.graph.node_weight(index).unwrap())?;
            if action == GraphTraversalAction::Continue && queue_set.insert(index) {
                queue.push_back(index);
            }
        }

        let mut visit_count = 0;
        while let Some(index) = queue.pop_front() {
            queue_set.remove(&index);
            let node = match self.graph.node_weight(index).unwrap() {
                SingleModuleGraphNode::Module(single_module_graph_module_node) => {
                    single_module_graph_module_node
                }
                _ => {
                    continue; // we don't traverse into parent graphs
                }
            };
            visit_count += 1;
            for edge in self
                .graph
                .edges_directed(index, petgraph::Direction::Outgoing)
            {
                let refdata = edge.weight();
                let target_index = edge.target();
                let target = self.graph.node_weight(edge.target()).unwrap();
                let action = visit(Some((node, refdata)), target)?;
                if action == GraphTraversalAction::Continue && queue_set.insert(target_index) {
                    queue.push_back(target_index);
                }
            }
        }

        Ok(visit_count)
    }

    /// Traverses all reachable edges in dfs order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs.
    ///
    /// Use this to collect modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge) in the preorder_visitor, in the post
    /// order visitor they are visited exactly once with the first edge they were discovered with.
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    pub fn traverse_edges_from_entries_dfs<'a, S>(
        &'a self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a RefData)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a RefData)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ) -> Result<()>,
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(e).unwrap());

        enum Pass {
            Visit,
            ExpandAndVisit,
        }

        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(Pass, Option<(NodeIndex, EdgeIndex)>, NodeIndex)> =
            entries.map(|e| (Pass::ExpandAndVisit, None, e)).collect();
        let mut expanded = FxHashSet::default();
        while let Some((pass, parent, current)) = stack.pop() {
            let parent_arg = parent.map(|parent| {
                (
                    match graph.node_weight(parent.0).unwrap() {
                        SingleModuleGraphNode::Module(node) => node,
                        SingleModuleGraphNode::VisitedModule { .. } => {
                            unreachable!()
                        }
                    },
                    graph.edge_weight(parent.1).unwrap(),
                )
            });
            match pass {
                Pass::Visit => {
                    visit_postorder(parent_arg, graph.node_weight(current).unwrap(), state)?;
                }
                Pass::ExpandAndVisit => match graph.node_weight(current).unwrap() {
                    current_node @ SingleModuleGraphNode::Module(_) => {
                        let action = visit_preorder(parent_arg, current_node, state)?;
                        if action == GraphTraversalAction::Exclude {
                            continue;
                        }
                        stack.push((Pass::Visit, parent, current));
                        if action == GraphTraversalAction::Continue && expanded.insert(current) {
                            stack.extend(iter_neighbors_rev(graph, current).map(
                                |(edge, child)| {
                                    (Pass::ExpandAndVisit, Some((current, edge)), child)
                                },
                            ));
                        }
                    }
                    current_node @ SingleModuleGraphNode::VisitedModule { .. } => {
                        visit_preorder(parent_arg, current_node, state)?;
                        visit_postorder(parent_arg, current_node, state)?;
                    }
                },
            }
        }

        Ok(())
    }

    pub fn traverse_cycles<'l>(
        &'l self,
        edge_filter: impl Fn(&'l RefData) -> bool,
        mut visit_cycle: impl FnMut(&[&'l SingleModuleGraphModuleNode]),
    ) {
        // see https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
        // but iteratively instead of recursively

        #[derive(Clone)]
        struct NodeState {
            index: u32,
            lowlink: u32,
            on_stack: bool,
        }
        enum VisitStep {
            UnvisitedNode(NodeIndex),
            EdgeAfterVisit { parent: NodeIndex, child: NodeIndex },
            AfterVisit(NodeIndex),
        }
        let mut node_states = vec![None; self.graph.node_bound()];
        let mut stack = Vec::new();
        let mut visit_stack = Vec::new();
        let mut index = 0;
        let mut scc = Vec::new();
        for initial_index in self.graph.node_indices() {
            // Skip over already visited nodes
            if node_states[initial_index.index()].is_some() {
                continue;
            }
            visit_stack.push(VisitStep::UnvisitedNode(initial_index));
            while let Some(step) = visit_stack.pop() {
                match step {
                    VisitStep::UnvisitedNode(node) => {
                        node_states[node.index()] = Some(NodeState {
                            index,
                            lowlink: index,
                            on_stack: true,
                        });
                        index += 1;
                        stack.push(node);
                        visit_stack.push(VisitStep::AfterVisit(node));
                        let mut neighbors = self.graph.neighbors(node).detach();
                        while let Some((edge, succ)) = neighbors.next(&self.graph) {
                            let edge_weight = self.graph.edge_weight(edge).unwrap();
                            if !edge_filter(edge_weight) {
                                continue;
                            }
                            let node_state = &node_states[succ.index()];
                            if let Some(node_state) = node_state {
                                if node_state.on_stack {
                                    let index = node_state.index;
                                    let parent_state = node_states[node.index()].as_mut().unwrap();
                                    parent_state.lowlink = parent_state.lowlink.min(index);
                                }
                            } else {
                                visit_stack.push(VisitStep::EdgeAfterVisit {
                                    parent: node,
                                    child: succ,
                                });
                                visit_stack.push(VisitStep::UnvisitedNode(succ));
                            }
                        }
                    }
                    VisitStep::EdgeAfterVisit { parent, child } => {
                        let child_state = node_states[child.index()].as_ref().unwrap();
                        let lowlink = child_state.lowlink;

                        let parent_state = node_states[parent.index()].as_mut().unwrap();
                        parent_state.lowlink = parent_state.lowlink.min(lowlink);
                    }
                    VisitStep::AfterVisit(node) => {
                        let node_state = node_states[node.index()].as_ref().unwrap();
                        if node_state.lowlink == node_state.index {
                            loop {
                                let poppped = stack.pop().unwrap();
                                let popped_state = node_states[poppped.index()].as_mut().unwrap();
                                popped_state.on_stack = false;
                                if let SingleModuleGraphNode::Module(module) =
                                    self.graph.node_weight(poppped).unwrap()
                                {
                                    scc.push(module);
                                }
                                if poppped == node {
                                    break;
                                }
                            }
                            if scc.len() > 1 {
                                visit_cycle(&scc);
                            }
                            scc.clear();
                        }
                    }
                }
            }
        }
    }

    /// For each issue computes a (possibly empty) list of traces from the file that produced the
    /// issue to roots in this module graph.
    /// There are potentially multiple traces because a given file may get assigned to multiple
    /// modules depend on how it is used in the application.  Consider a simple utility that is used
    /// by SSR pages, client side code, and the edge runtime.  This may lead to there being 3
    /// traces.
    /// The returned map is guaranteed to have an entry for every issue.
    pub async fn compute_import_traces_for_issues(
        &self,
        issues: &AutoSet<ResolvedVc<Box<dyn Issue>>>,
    ) -> Result<FxHashMap<ResolvedVc<Box<dyn Issue>>, Vec<ImportTrace>>> {
        let issue_paths = issues
            .iter()
            .map(|issue| issue.file_path().owned())
            .try_join()
            .await?;
        let mut file_path_to_traces: FxHashMap<FileSystemPath, Vec<ImportTrace>> =
            FxHashMap::with_capacity_and_hasher(issue_paths.len(), Default::default());
        // initialize an empty vec for each path we care about
        for issue in &issue_paths {
            file_path_to_traces.entry(issue.clone()).or_default();
        }

        {
            let modules =
                self.modules
                    .iter()
                    .map(|(module, &index)| async move {
                        Ok((module.ident().path().owned().await?, index))
                    })
                    .try_join()
                    .await?;
            // Reverse the graph so we can find paths to roots
            let reversed_graph = Reversed(&self.graph.0);
            for (path, module_idx) in modules {
                if let Entry::Occupied(mut entry) = file_path_to_traces.entry(path) {
                    // compute the path from this index to a root of the graph.
                    let Some((_, path)) = petgraph::algo::astar(
                        &reversed_graph,
                        module_idx,
                        |n| reversed_graph.neighbors(n).next().is_none(),
                        // Edge weights
                        |e| match e.weight().chunking_type {
                            // Prefer following normal imports/requires when we can
                            ChunkingType::Parallel { .. } => 0,
                            _ => 1,
                        },
                        // `astar` can be accelerated with a distance estimation heuristic, as long
                        // as our estimate is never > the actual distance.
                        // However we don't have a mechanism, so just
                        // estimate 0 which essentially makes this behave like
                        // dijktra's shortest path algorithm.  `petgraph` has an implementation of
                        // dijkstra's but it doesn't report  paths, just distances.
                        // NOTE: dijkstra's with integer weights can be accelerated with incredibly
                        // efficient priority queue structures (basically with only 0 and 1 as
                        // weights you can use a `VecDeque`!).  However,
                        // this is unlikely to be a performance concern.
                        // Furthermore, if computing paths _does_ become a performance concern, the
                        // solution would be a hand written implementation of dijkstras so we can
                        // hoist redundant work out of this loop.
                        |_| 0,
                    ) else {
                        unreachable!("there must be a path to a root");
                    };
                    // Represent the path as a sequence of AssetIdents
                    // TODO: consider hinting at various transitions (e.g. was this an
                    // import/require/dynamic-import?)
                    let path = path
                        .into_iter()
                        .map(async |n| {
                            Ok(self
                                .graph
                                .node_weight(n)
                                .unwrap()
                                .module()
                                .ident()
                                .await?
                                .clone())
                        })
                        .try_join()
                        .await?;
                    entry.get_mut().push(path);
                }
            }
        }
        let mut issue_to_traces: FxHashMap<ResolvedVc<Box<dyn Issue>>, Vec<ImportTrace>> =
            FxHashMap::with_capacity_and_hasher(issues.len(), Default::default());
        // Map filepaths back to issues
        // We can do this by zipping the issue_paths with the issues since they are in the same
        // order.
        for (path, issue) in issue_paths.iter().zip(issues) {
            if let Some(traces) = file_path_to_traces.get(path) {
                issue_to_traces.insert(*issue, traces.clone());
            }
        }
        Ok(issue_to_traces)
    }
}

#[turbo_tasks::value]
struct ModuleGraphImportTracer {
    graph: ResolvedVc<SingleModuleGraph>,
}

#[turbo_tasks::value(shared)]
struct PathToModulesMap {
    map: FxHashMap<FileSystemPath, Vec<ResolvedVc<Box<dyn Module>>>>,
}

#[turbo_tasks::value_impl]
impl ModuleGraphImportTracer {
    #[turbo_tasks::function]
    fn new(graph: ResolvedVc<SingleModuleGraph>) -> Vc<Self> {
        Self::cell(Self { graph })
    }

    // Compute this mapping on demand since it might not always be needed.
    #[turbo_tasks::function]
    async fn path_to_modules(&self) -> Result<Vc<PathToModulesMap>> {
        let path_and_modules = self
            .graph
            .await?
            .modules
            .iter()
            .map(|(&module, _)| async move { Ok((module.ident().path().owned().await?, module)) })
            .try_join()
            .await?;
        let mut map: FxHashMap<FileSystemPath, Vec<ResolvedVc<Box<dyn Module>>>> =
            FxHashMap::default();
        for (path, module) in path_and_modules {
            map.entry(path).or_default().push(module)
        }
        Ok(PathToModulesMap::cell(PathToModulesMap { map }))
    }
}

#[turbo_tasks::value_impl]
impl ImportTracer for ModuleGraphImportTracer {
    #[turbo_tasks::function]
    async fn get_traces(self: Vc<Self>, path: FileSystemPath) -> Result<Vc<ImportTraces>> {
        let path_to_modules = self.path_to_modules().await?;
        let Some(modules) = path_to_modules.map.get(&path) else {
            return Ok(Vc::default()); // This isn't unusual, the file just might not be in this
            // graph.
        };
        debug_assert!(!modules.is_empty(), "modules should not be an empty vec");
        let graph = &*self.await?.graph.await?;

        let reversed_graph = Reversed(&graph.graph.0);
        return Ok(ImportTraces::cell(ImportTraces(
            modules
                .iter()
                .map(|m| async move {
                    let Some(&module_idx) = graph.modules.get(m) else {
                        // The only way this could really happen is if `path_to_modules` is computed
                        // from a different graph than graph`.  Just error out.
                        bail!("inconsistent read?")
                    };
                    // compute the path from this index to a root of the graph.
                    let Some((_, path)) = petgraph::algo::astar(
                        &reversed_graph,
                        module_idx,
                        |n| reversed_graph.neighbors(n).next().is_none(),
                        // Edge weights
                        |e| match e.weight().chunking_type {
                            // Prefer following normal imports/requires when we can
                            ChunkingType::Parallel { .. } => 0,
                            _ => 1,
                        },
                        // `astar` can be accelerated with a distance estimation heuristic, as long
                        // as our estimate is never > the actual distance.
                        // However we don't have a mechanism, so just
                        // estimate 0 which essentially makes this behave like
                        // dijktra's shortest path algorithm.  `petgraph` has an implementation of
                        // dijkstra's but it doesn't report  paths, just distances.
                        // NOTE: dijkstra's with integer weights can be accelerated with incredibly
                        // efficient priority queue structures (basically with only 0 and 1 as
                        // weights you can use a `VecDeque`!).  However,
                        // this is unlikely to be a performance concern.
                        // Furthermore, if computing paths _does_ become a performance concern, the
                        // solution would be a hand written implementation of dijkstras so we can
                        // hoist redundant work out of this loop.
                        |_| 0,
                    ) else {
                        unreachable!("there must be a path to a root");
                    };

                    // Represent the path as a sequence of AssetIdents
                    // TODO: consider hinting at various transitions (e.g. was this an
                    // import/require/dynamic-import?)
                    let path = path
                        .into_iter()
                        .map(async |n| {
                            graph
                                .graph
                                .node_weight(n)
                                .unwrap() // This is safe since `astar`` only returns indices from the graph
                                .module()
                                .ident()
                                .await
                        })
                        .try_join()
                        .await?;
                    Ok(path)
                })
                .try_join()
                .await?,
        )));
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
pub struct ModuleGraph {
    pub graphs: Vec<ResolvedVc<SingleModuleGraph>>,
}

#[turbo_tasks::value_impl]
impl ModuleGraph {
    #[turbo_tasks::function]
    pub fn from_graphs(graphs: Vec<ResolvedVc<SingleModuleGraph>>) -> Vc<Self> {
        Self { graphs }.cell()
    }

    #[turbo_tasks::function]
    pub fn from_single_graph(graph: ResolvedVc<SingleModuleGraph>) -> Vc<Self> {
        Self {
            graphs: vec![graph],
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn from_entry_module(
        module: ResolvedVc<Box<dyn Module>>,
        include_traced: bool,
    ) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(
            Vc::cell(vec![ChunkGroupEntry::Entry(vec![module])]),
            include_traced,
        ))
    }

    #[turbo_tasks::function]
    pub fn from_modules(modules: Vc<GraphEntries>, include_traced: bool) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(modules, include_traced))
    }

    #[turbo_tasks::function]
    pub async fn chunk_group_info(self: Vc<Self>) -> Result<Vc<ChunkGroupInfo>> {
        compute_chunk_group_info(&self.read_graphs().await?).await
    }

    #[turbo_tasks::function]
    pub async fn merged_modules(self: Vc<Self>) -> Result<Vc<MergedModuleInfo>> {
        compute_merged_modules(self).await
    }

    #[turbo_tasks::function]
    pub async fn module_batches(
        self: Vc<Self>,
        config: Vc<BatchingConfig>,
    ) -> Result<Vc<ModuleBatchesGraph>> {
        compute_module_batches(self, &*config.await?).await
    }

    #[turbo_tasks::function]
    pub async fn style_groups(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        config: StyleGroupsConfig,
    ) -> Result<Vc<StyleGroups>> {
        compute_style_groups(self, chunking_context, &config).await
    }

    #[turbo_tasks::function]
    pub async fn async_module_info(self: Vc<Self>) -> Result<Vc<AsyncModulesInfo>> {
        // `compute_async_module_info` calls `module.is_self_async()`, so we need to again ignore
        // all issues such that they aren't emitted multiple times.
        async move {
            let result_op = compute_async_module_info(self.to_resolved().await?);
            let result_vc = result_op.resolve_strongly_consistent().await?;
            result_op.drop_collectibles::<Box<dyn Issue>>();
            anyhow::Ok(*result_vc)
        }
        .instrument(tracing::info_span!("compute async module info"))
        .await
    }

    #[turbo_tasks::function]
    pub async fn referenced_async_modules(
        self: Vc<Self>,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<AsyncModuleInfo>> {
        let graph_ref = self.read_graphs().await?;
        let graphs = &graph_ref.graphs;
        let async_modules_info = self.async_module_info().await?;

        let entry = graph_ref.get_entry(module)?;
        let referenced_modules =
            iter_neighbors_rev(&graphs[entry.graph_idx()].graph, entry.node_idx)
                .filter(|(edge_idx, _)| {
                    let ty = graphs[entry.graph_idx()]
                        .graph
                        .edge_weight(*edge_idx)
                        .unwrap();
                    ty.chunking_type.is_inherit_async()
                })
                .map(|(_, child_idx)| {
                    anyhow::Ok(
                        get_node!(
                            graphs,
                            GraphNodeIndex {
                                graph_idx: entry.graph_idx,
                                node_idx: child_idx
                            }
                        )?
                        .module,
                    )
                })
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .rev()
                .filter(|m| async_modules_info.contains(m))
                .map(|m| *m)
                .collect();

        Ok(AsyncModuleInfo::new(referenced_modules))
    }
}

// fn get_node<T>(
//     graphs: Vec<ReadRef<SingleModuleGraph>>,
//     node: GraphNodeIndex,
// ) -> Result<&'static SingleModuleGraphModuleNode> {
macro_rules! get_node {
    ($graphs:expr, $node:expr) => {{
        let node_idx = $node;
        match $graphs[node_idx.graph_idx()]
            .graph
            .node_weight(node_idx.node_idx)
        {
            Some(SingleModuleGraphNode::Module(node)) => ::anyhow::Ok(node),
            Some(SingleModuleGraphNode::VisitedModule { idx, .. }) => {
                match $graphs[idx.graph_idx()].graph.node_weight(idx.node_idx) {
                    Some(SingleModuleGraphNode::Module(node)) => ::anyhow::Ok(node),
                    Some(SingleModuleGraphNode::VisitedModule { .. }) => Err(::anyhow::anyhow!(
                        "Expected visited target node to be module"
                    )),
                    None => Err(::anyhow::anyhow!("Expected visited target node")),
                }
            }
            None => Err(::anyhow::anyhow!("Expected graph node")),
        }
    }};
}
pub(crate) use get_node;
macro_rules! get_node_idx {
    ($graphs:expr, $node:expr) => {{
        let node_idx = $node;
        match $graphs[node_idx.graph_idx()]
            .graph
            .node_weight(node_idx.node_idx)
        {
            Some(SingleModuleGraphNode::Module(node)) => ::anyhow::Ok((node, node_idx)),
            Some(SingleModuleGraphNode::VisitedModule { idx, .. }) => {
                match $graphs[idx.graph_idx()].graph.node_weight(idx.node_idx) {
                    Some(SingleModuleGraphNode::Module(node)) => ::anyhow::Ok((node, *idx)),
                    Some(SingleModuleGraphNode::VisitedModule { .. }) => Err(::anyhow::anyhow!(
                        "Expected visited target node to be module"
                    )),
                    None => Err(::anyhow::anyhow!("Expected visited target node")),
                }
            }
            None => Err(::anyhow::anyhow!("Expected graph node")),
        }
    }};
}
pub(crate) use get_node_idx;

impl ModuleGraph {
    pub async fn read_graphs(self: Vc<ModuleGraph>) -> Result<ModuleGraphRef> {
        Ok(ModuleGraphRef {
            graphs: self.await?.graphs.iter().try_join().await?,
        })
    }
}

/// The ReadRef version of ModuleGraph. This is better for eventual consistency, as the graphs
/// aren't awaited multiple times within the same task.
pub struct ModuleGraphRef {
    pub graphs: Vec<ReadRef<SingleModuleGraph>>,
}

impl ModuleGraphRef {
    fn get_entry(&self, entry: ResolvedVc<Box<dyn Module>>) -> Result<GraphNodeIndex> {
        let Some(idx) = self
            .graphs
            .iter()
            .enumerate()
            .find_map(|(graph_idx, graph)| {
                graph.modules.get(&entry).map(|node_idx| GraphNodeIndex {
                    graph_idx: u32::try_from(graph_idx).unwrap(),
                    node_idx: *node_idx,
                })
            })
        else {
            bail!("Couldn't find entry module in module graph");
        };
        Ok(idx)
    }

    /// Returns a map of all modules in the graphs to their identifiers.
    /// This is primarily useful for debugging.
    pub async fn get_ids(&self) -> Result<FxHashMap<ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>>> {
        Ok(self
            .graphs
            .iter()
            .flat_map(|g| g.iter_nodes())
            .map(async |n| Ok((n.module, n.module.ident().to_string().await?)))
            .try_join()
            .await?
            .into_iter()
            .collect::<FxHashMap<_, _>>())
    }

    /// Traverses all reachable edges exactly once and calls the visitor with the edge source and
    /// target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `visitor` - Called before visiting the children of a node.
    ///    - Receives (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entries_bfs(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
            &'_ SingleModuleGraphModuleNode,
        ) -> Result<GraphTraversalAction>,
    ) -> Result<()> {
        let graphs = &self.graphs;

        let mut queue = VecDeque::from(
            entries
                .into_iter()
                .map(|e| self.get_entry(e))
                .collect::<Result<Vec<_>>>()?,
        );
        let mut visited = HashSet::new();
        for entry_node in &queue {
            visitor(None, get_node!(graphs, entry_node)?)?;
        }
        while let Some(node) = queue.pop_front() {
            let graph = &graphs[node.graph_idx()].graph;
            let node_weight = get_node!(graphs, node)?;
            if visited.insert(node) {
                let neighbors = iter_neighbors_rev(graph, node.node_idx);

                for (edge, succ) in neighbors {
                    let succ = GraphNodeIndex {
                        graph_idx: node.graph_idx,
                        node_idx: succ,
                    };
                    let succ_weight = get_node!(graphs, succ)?;
                    let edge_weight = graph.edge_weight(edge).unwrap();
                    let action = visitor(Some((node_weight, edge_weight)), succ_weight)?;
                    if !visited.contains(&succ) && action == GraphTraversalAction::Continue {
                        queue.push_back(succ);
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverses all reachable edges exactly once and calls the visitor with the edge source and
    /// target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `visitor` - Called before visiting the children of a node.
    ///    - Receives (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entry(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
            &'_ SingleModuleGraphModuleNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graphs = &self.graphs;

        let entries = entries.into_iter();
        let mut stack = Vec::with_capacity(entries.size_hint().0);
        for entry in entries {
            stack.push(self.get_entry(entry)?);
        }
        let mut visited = HashSet::new();
        for entry_node in &stack {
            visitor(None, get_node!(graphs, entry_node)?);
        }
        while let Some(node) = stack.pop() {
            let graph = &graphs[node.graph_idx()].graph;
            let node_weight = get_node!(graphs, node)?;
            if visited.insert(node) {
                let neighbors = iter_neighbors_rev(graph, node.node_idx);

                for (edge, succ) in neighbors {
                    let succ = GraphNodeIndex {
                        graph_idx: node.graph_idx,
                        node_idx: succ,
                    };
                    let succ_weight = get_node!(graphs, succ)?;
                    let edge_weight = graph.edge_weight(edge).unwrap();
                    let action = visitor(Some((node_weight, edge_weight)), succ_weight);
                    if !visited.contains(&succ) && action == GraphTraversalAction::Continue {
                        stack.push(succ);
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverses all edges exactly once (in an unspecified order) and calls the visitor with the
    /// edge source and target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    ///
    /// * `visitor` - Called before visiting the children of a node.
    ///    - Receives (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode
    pub fn traverse_all_edges_unordered(
        &self,
        mut visitor: impl FnMut(
            (&'_ SingleModuleGraphModuleNode, &'_ RefData),
            &'_ SingleModuleGraphModuleNode,
        ) -> Result<()>,
    ) -> Result<()> {
        let graphs = &self.graphs;

        for graph in graphs {
            let graph = &graph.graph;
            for edge in graph.edge_references() {
                let source = match graph.node_weight(edge.source()).unwrap() {
                    SingleModuleGraphNode::Module(node) => node,
                    SingleModuleGraphNode::VisitedModule { .. } => unreachable!(),
                };
                let target = match graph.node_weight(edge.target()).unwrap() {
                    SingleModuleGraphNode::Module(node) => node,
                    SingleModuleGraphNode::VisitedModule { idx, .. } => get_node!(graphs, idx)?,
                };
                visitor((source, edge.weight()), target)?;
            }
        }

        Ok(())
    }

    /// Traverses all reachable edges in dfs order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs
    ///
    /// Use this to collect modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge) in the preorder_visitor, in the post
    /// order visitor they are visited exactly once with the first edge they were discovered with.
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entries_dfs<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> Result<()>,
    ) -> Result<()> {
        let graphs = &self.graphs;

        let entries = entries.into_iter().collect::<Vec<_>>();

        enum Pass {
            Visit,
            ExpandAndVisit,
        }
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(Pass, Option<(GraphNodeIndex, EdgeIndex)>, GraphNodeIndex)> =
            Vec::with_capacity(entries.len());
        for entry in entries.into_iter().rev() {
            stack.push((Pass::ExpandAndVisit, None, self.get_entry(entry)?));
        }
        let mut expanded = HashSet::new();
        while let Some((pass, parent, current)) = stack.pop() {
            let parent_arg = match parent {
                Some((parent_node, parent_edge)) => Some((
                    get_node!(graphs, parent_node)?,
                    graphs[parent_node.graph_idx()]
                        .graph
                        .edge_weight(parent_edge)
                        .unwrap(),
                )),
                None => None,
            };
            let current_node = get_node!(graphs, current)?;
            match pass {
                Pass::Visit => {
                    visit_postorder(parent_arg, current_node, state)?;
                }
                Pass::ExpandAndVisit => {
                    let action = visit_preorder(parent_arg, current_node, state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((Pass::Visit, parent, current));
                    if action == GraphTraversalAction::Continue && expanded.insert(current) {
                        let graph = &graphs[current.graph_idx()].graph;
                        let (neighbors_rev, current) = match graph
                            .node_weight(current.node_idx)
                            .unwrap()
                        {
                            SingleModuleGraphNode::Module(_) => {
                                (iter_neighbors_rev(graph, current.node_idx), current)
                            }
                            SingleModuleGraphNode::VisitedModule { idx, .. } => (
                                // We switch graphs
                                iter_neighbors_rev(&graphs[idx.graph_idx()].graph, idx.node_idx),
                                *idx,
                            ),
                        };
                        stack.extend(neighbors_rev.map(|(edge, child)| {
                            (
                                Pass::ExpandAndVisit,
                                Some((current, edge)),
                                GraphNodeIndex {
                                    graph_idx: current.graph_idx,
                                    node_idx: child,
                                },
                            )
                        }));
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverse all cycles in the graph (where the edge filter returns true for the whole cycle)
    /// and call the visitor with the nodes in the cycle.
    pub fn traverse_cycles(
        &self,
        edge_filter: impl Fn(&RefData) -> bool,
        mut visit_cycle: impl FnMut(&[&SingleModuleGraphModuleNode]),
    ) -> Result<()> {
        for graph in &self.graphs {
            graph.traverse_cycles(&edge_filter, &mut visit_cycle);
        }
        Ok(())
    }

    /// Traverses all reachable nodes and also continue revisiting them as long the visitor returns
    /// GraphTraversalAction::Continue. The visitor is responsible for the runtime complexity and
    /// eventual termination of the traversal. This corresponds to computing a fixed point state for
    /// the graph.
    ///
    /// Nodes are (re)visited according to the returned priority of the node, prioritizing high
    /// values. This priority is intended to be used a heuristic to reduce the number of
    /// retraversals.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `state` - The state to be passed to the callbacks
    /// * `visit` - Called for a specific edge
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Return [GraphTraversalAction]s to control the traversal
    /// * `priority` - Called for before visiting the children of a node to determine its priority.
    ///    - Receives: target &SingleModuleGraphNode, state &S
    ///    - Return a priority value for the node
    ///
    /// Returns the number of node visits (i.e. higher than the node count if there are
    /// retraversals).
    pub fn traverse_edges_fixed_point_with_priority<S, P: Ord>(
        &self,
        entries: impl IntoIterator<Item = (ResolvedVc<Box<dyn Module>>, P)>,
        state: &mut S,
        mut visit: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        priority: impl Fn(&'_ SingleModuleGraphModuleNode, &mut S) -> Result<P>,
    ) -> Result<usize> {
        let graphs = &self.graphs;

        #[derive(PartialEq, Eq)]
        struct NodeWithPriority<T: Ord> {
            node: GraphNodeIndex,
            priority: T,
        }
        impl<T: Ord> PartialOrd for NodeWithPriority<T> {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }
        impl<T: Ord> Ord for NodeWithPriority<T> {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                // BinaryHeap prioritizes high values

                self.priority
                    .cmp(&other.priority)
                    // include GraphNodeIndex for total and deterministic ordering
                    .then(other.node.cmp(&self.node))
            }
        }

        let mut queue_set = FxHashSet::default();
        let mut queue = BinaryHeap::from_iter(
            entries
                .into_iter()
                .map(|(m, priority)| {
                    Ok(NodeWithPriority {
                        node: self.get_entry(m)?,
                        priority,
                    })
                })
                .collect::<Result<Vec<_>>>()?,
        );

        for entry_node in &queue {
            visit(None, get_node!(graphs, entry_node.node)?, state)?;
        }

        let mut visit_count = 0usize;
        while let Some(NodeWithPriority { node, .. }) = queue.pop() {
            queue_set.remove(&node);
            let (node_weight, node) = get_node_idx!(graphs, node)?;
            let graph = &graphs[node.graph_idx()].graph;
            let neighbors = iter_neighbors_rev(graph, node.node_idx);

            visit_count += 1;

            for (edge, succ) in neighbors {
                let succ = GraphNodeIndex {
                    graph_idx: node.graph_idx,
                    node_idx: succ,
                };
                let (succ_weight, succ) = get_node_idx!(graphs, succ)?;
                let edge_weight = graph.edge_weight(edge).unwrap();
                let action = visit(Some((node_weight, edge_weight)), succ_weight, state)?;

                if action == GraphTraversalAction::Continue && queue_set.insert(succ) {
                    queue.push(NodeWithPriority {
                        node: succ,
                        priority: priority(succ_weight, state)?,
                    });
                }
            }
        }

        Ok(visit_count)
    }
}

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        entries: Vc<GraphEntries>,
        include_traced: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&*entries.await?, &Default::default(), include_traced).await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        entries: Vc<GraphEntries>,
        visited_modules: Vc<VisitedModules>,
        include_traced: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(
            &*entries.await?,
            &visited_modules.await?.modules,
            include_traced,
        )
        .await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited_intern(
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: GraphEntriesT,
        visited_modules: Vc<VisitedModules>,
        include_traced: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&entries, &visited_modules.await?.modules, include_traced)
            .await
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct SingleModuleGraphModuleNode {
    pub module: ResolvedVc<Box<dyn Module>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum SingleModuleGraphNode {
    Module(SingleModuleGraphModuleNode),
    // Models a module that is referenced but has already been visited by an earlier graph.
    VisitedModule {
        idx: GraphNodeIndex,
        module: ResolvedVc<Box<dyn Module>>,
    },
}

impl SingleModuleGraphNode {
    pub fn module(&self) -> ResolvedVc<Box<dyn Module>> {
        match self {
            SingleModuleGraphNode::Module(SingleModuleGraphModuleNode { module }) => *module,
            SingleModuleGraphNode::VisitedModule { module, .. } => *module,
        }
    }
}

#[derive(PartialEq, Eq, Debug)]
pub enum GraphTraversalAction {
    /// Continue visiting children
    Continue,
    /// Skip the immediate children, but visit the node in postorder
    Skip,
    /// Skip the immediate children and the node in postorder
    Exclude,
}

// These nodes are created while walking the Turbopack modules references, and are used to then
// afterwards build the SingleModuleGraph.
#[derive(Clone, Hash, PartialEq, Eq)]
enum SingleModuleGraphBuilderNode {
    /// This edge is represented as a node: source Module -> ChunkableReference ->  target Module
    ChunkableReference {
        ref_data: RefData,
        source: ResolvedVc<Box<dyn Module>>,
        target: ResolvedVc<Box<dyn Module>>,
        // These two fields are only used for tracing. Derived from `source.ident()` and
        // `target.ident()`
        source_ident: Option<ReadRef<RcStr>>,
        target_ident: Option<ReadRef<RcStr>>,
    },
    /// A regular module
    Module {
        module: ResolvedVc<Box<dyn Module>>,
        // module.ident().to_string(), eagerly computed for tracing
        ident: Option<ReadRef<RcStr>>,
    },
    /// A reference to a module that is already listed in visited_modules
    VisitedModule {
        module: ResolvedVc<Box<dyn Module>>,
        idx: GraphNodeIndex,
    },
}

impl SingleModuleGraphBuilderNode {
    async fn new_module(emit_spans: bool, module: ResolvedVc<Box<dyn Module>>) -> Result<Self> {
        Ok(Self::Module {
            module,
            ident: if emit_spans {
                // INVALIDATION: we don't need to invalidate when the span name changes
                Some(module.ident_string().untracked().await?)
            } else {
                None
            },
        })
    }
    async fn new_chunkable_ref(
        emit_spans: bool,
        source: ResolvedVc<Box<dyn Module>>,
        target: ResolvedVc<Box<dyn Module>>,
        ref_data: RefData,
    ) -> Result<Self> {
        Ok(Self::ChunkableReference {
            ref_data,
            source,
            source_ident: if emit_spans {
                // INVALIDATION: we don't need to invalidate when the span name changes
                Some(source.ident_string().untracked().await?)
            } else {
                None
            },
            target,
            target_ident: if emit_spans {
                // INVALIDATION: we don't need to invalidate when the span name changes
                Some(target.ident_string().untracked().await?)
            } else {
                None
            },
        })
    }
    fn new_visited_module(module: ResolvedVc<Box<dyn Module>>, idx: GraphNodeIndex) -> Self {
        Self::VisitedModule { module, idx }
    }
}
struct SingleModuleGraphBuilderEdge {
    to: SingleModuleGraphBuilderNode,
    export: ExportUsage,
}

/// The chunking type that occurs most often, is handled more efficiently by not creating
/// intermediate SingleModuleGraphBuilderNode::ChunkableReference nodes.
const COMMON_CHUNKING_TYPE: ChunkingType = ChunkingType::Parallel {
    inherit_async: true,
    hoisted: true,
};

struct SingleModuleGraphBuilder<'a> {
    visited_modules: &'a FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,

    emit_spans: bool,

    /// Whether to walk ChunkingType::Traced references
    include_traced: bool,
}
impl Visit<(SingleModuleGraphBuilderNode, ExportUsage)> for SingleModuleGraphBuilder<'_> {
    type Edge = SingleModuleGraphBuilderEdge;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(
        &mut self,
        edge: Self::Edge,
    ) -> VisitControlFlow<(SingleModuleGraphBuilderNode, ExportUsage)> {
        match edge.to {
            SingleModuleGraphBuilderNode::Module { .. } => {
                VisitControlFlow::Continue((edge.to, edge.export))
            }
            SingleModuleGraphBuilderNode::ChunkableReference { ref ref_data, .. } => {
                match &ref_data.chunking_type {
                    ChunkingType::Traced => VisitControlFlow::Skip((edge.to, edge.export)),
                    _ => VisitControlFlow::Continue((edge.to, edge.export)),
                }
            }
            // Module was already visited previously
            SingleModuleGraphBuilderNode::VisitedModule { .. } => {
                VisitControlFlow::Skip((edge.to, edge.export))
            }
        }
    }

    fn edges(
        &mut self,
        // The `skip_duplicates_with_key()` above ensures only a single `edges()` call per module
        // (and not per `(module, export)` pair), so the export must not be read here!
        (node, _): &(SingleModuleGraphBuilderNode, ExportUsage),
    ) -> Self::EdgesFuture {
        // Destructure beforehand to not have to clone the whole node when entering the async block
        let (module, chunkable_ref_target) = match node {
            SingleModuleGraphBuilderNode::Module { module, .. } => (Some(*module), None),
            SingleModuleGraphBuilderNode::ChunkableReference {
                target, ref_data, ..
            } => (None, Some((*target, ref_data.export.clone()))),
            // These are always skipped in `visit()`
            SingleModuleGraphBuilderNode::VisitedModule { .. } => unreachable!(),
        };
        let visited_modules = self.visited_modules;
        let emit_spans = self.emit_spans;
        let include_traced = self.include_traced;
        async move {
            Ok(match (module, chunkable_ref_target) {
                (Some(module), None) => {
                    let refs_cell = primary_chunkable_referenced_modules(*module, include_traced);
                    let refs = match refs_cell.await {
                        Ok(refs) => refs,
                        Err(e) => {
                            return Err(e.context(module.ident().to_string().await?));
                        }
                    };

                    refs.iter()
                        .flat_map(|(ty, export, modules)| {
                            modules.iter().map(|m| (ty.clone(), export.clone(), *m))
                        })
                        .map(async |(ty, export, target)| {
                            let to = if ty == COMMON_CHUNKING_TYPE {
                                if let Some(idx) = visited_modules.get(&target) {
                                    SingleModuleGraphBuilderNode::new_visited_module(target, *idx)
                                } else {
                                    SingleModuleGraphBuilderNode::new_module(emit_spans, target)
                                        .await?
                                }
                            } else {
                                SingleModuleGraphBuilderNode::new_chunkable_ref(
                                    emit_spans,
                                    module,
                                    target,
                                    RefData {
                                        chunking_type: ty,
                                        export: export.clone(),
                                    },
                                )
                                .await?
                            };
                            Ok(SingleModuleGraphBuilderEdge { to, export })
                        })
                        .try_join()
                        .await?
                }
                (None, Some((chunkable_ref_target, export))) => {
                    vec![SingleModuleGraphBuilderEdge {
                        to: if let Some(idx) = visited_modules.get(&chunkable_ref_target) {
                            SingleModuleGraphBuilderNode::new_visited_module(
                                chunkable_ref_target,
                                *idx,
                            )
                        } else {
                            SingleModuleGraphBuilderNode::new_module(
                                emit_spans,
                                chunkable_ref_target,
                            )
                            .await?
                        },
                        export,
                    }]
                }
                _ => unreachable!(),
            })
        }
    }

    fn span(&mut self, (node, _): &(SingleModuleGraphBuilderNode, ExportUsage)) -> tracing::Span {
        if !self.emit_spans {
            return Span::current();
        }

        match node {
            SingleModuleGraphBuilderNode::Module {
                ident: Some(ident), ..
            } => {
                tracing::info_span!("module", name = display(ident))
            }
            SingleModuleGraphBuilderNode::ChunkableReference {
                ref_data,
                source_ident: Some(source_ident),
                target_ident: Some(target_ident),
                ..
            } => match &ref_data.chunking_type {
                ChunkingType::Parallel {
                    inherit_async: false,
                    ..
                } => Span::current(),
                _ => {
                    tracing::info_span!(
                        "chunkable reference",
                        ty = debug(&ref_data.chunking_type),
                        source = display(source_ident),
                        target = display(target_ident)
                    )
                }
            },
            SingleModuleGraphBuilderNode::VisitedModule { .. } => {
                tracing::info_span!("visited module")
            }
            _ => Span::current(),
        }
    }
}

#[cfg(test)]
pub mod tests {
    use anyhow::Result;
    use rustc_hash::FxHashMap;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileSystem, FileSystemPath, VirtualFileSystem};

    use crate::{
        asset::{Asset, AssetContent},
        ident::AssetIdent,
        module::Module,
        module_graph::{
            GraphEntries, GraphTraversalAction, SingleModuleGraph,
            chunk_group_info::ChunkGroupEntry,
        },
        reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
        resolve::ExportUsage,
    };

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn traverse_dfs_from_entries_diamond() {
        run_graph_test(
            vec![rcstr!("a.js")],
            {
                let mut deps = FxHashMap::default();
                // A classic diamond dependency on d
                deps.insert(rcstr!("a.js"), vec![rcstr!("b.js"), rcstr!("c.js")]);
                deps.insert(rcstr!("b.js"), vec![rcstr!("d.js")]);
                deps.insert(rcstr!("c.js"), vec![rcstr!("d.js")]);
                deps
            },
            |graph, entry_modules, module_to_name| {
                let mut preorder_visits = Vec::new();
                let mut postorder_visits = Vec::new();

                graph.traverse_edges_from_entries_dfs(
                    entry_modules,
                    &mut (),
                    |parent, target, _| {
                        preorder_visits.push((
                            parent
                                .map(|(node, _)| module_to_name.get(&node.module).unwrap().clone()),
                            module_to_name.get(&target.module()).unwrap().clone(),
                        ));
                        Ok(GraphTraversalAction::Continue)
                    },
                    |parent, target, _| {
                        postorder_visits.push((
                            parent
                                .map(|(node, _)| module_to_name.get(&node.module).unwrap().clone()),
                            module_to_name.get(&target.module()).unwrap().clone(),
                        ));
                        Ok(())
                    },
                )?;
                assert_eq!(
                    vec![
                        (None, rcstr!("a.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("b.js")), rcstr!("d.js")),
                        (Some(rcstr!("a.js")), rcstr!("c.js")),
                        (Some(rcstr!("c.js")), rcstr!("d.js"))
                    ],
                    preorder_visits
                );
                assert_eq!(
                    vec![
                        (Some(rcstr!("b.js")), rcstr!("d.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("c.js")), rcstr!("d.js")),
                        (Some(rcstr!("a.js")), rcstr!("c.js")),
                        (None, rcstr!("a.js"))
                    ],
                    postorder_visits
                );
                Ok(())
            },
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn traverse_dfs_from_entries_cycle() {
        run_graph_test(
            vec![rcstr!("a.js")],
            {
                let mut deps = FxHashMap::default();
                // A cycle of length 3
                deps.insert(rcstr!("a.js"), vec![rcstr!("b.js")]);
                deps.insert(rcstr!("b.js"), vec![rcstr!("c.js")]);
                deps.insert(rcstr!("c.js"), vec![rcstr!("a.js")]);
                deps
            },
            |graph, entry_modules, module_to_name| {
                let mut preorder_visits = Vec::new();
                let mut postorder_visits = Vec::new();

                graph.traverse_edges_from_entries_dfs(
                    entry_modules,
                    &mut (),
                    |parent, target, _| {
                        preorder_visits.push((
                            parent
                                .map(|(node, _)| module_to_name.get(&node.module).unwrap().clone()),
                            module_to_name.get(&target.module()).unwrap().clone(),
                        ));
                        Ok(GraphTraversalAction::Continue)
                    },
                    |parent, target, _| {
                        postorder_visits.push((
                            parent
                                .map(|(node, _)| module_to_name.get(&node.module).unwrap().clone()),
                            module_to_name.get(&target.module()).unwrap().clone(),
                        ));
                        Ok(())
                    },
                )?;
                assert_eq!(
                    vec![
                        (None, rcstr!("a.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("b.js")), rcstr!("c.js")),
                        (Some(rcstr!("c.js")), rcstr!("a.js")),
                    ],
                    preorder_visits
                );
                assert_eq!(
                    vec![
                        (Some(rcstr!("c.js")), rcstr!("a.js")),
                        (Some(rcstr!("b.js")), rcstr!("c.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (None, rcstr!("a.js"))
                    ],
                    postorder_visits
                );
                Ok(())
            },
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn traverse_edges_from_entries_fixed_point_cycle() {
        run_graph_test(
            vec![rcstr!("a.js")],
            {
                let mut deps = FxHashMap::default();
                // A cycle of length 3
                deps.insert(rcstr!("a.js"), vec![rcstr!("b.js")]);
                deps.insert(rcstr!("b.js"), vec![rcstr!("c.js")]);
                deps.insert(rcstr!("c.js"), vec![rcstr!("a.js")]);
                deps
            },
            |graph, entry_modules, module_to_name| {
                let mut visits = Vec::new();
                let mut count = 0;

                graph.traverse_edges_from_entries_fixed_point(
                    entry_modules,
                    |parent, target| {
                        visits.push((
                            parent
                                .map(|(node, _)| module_to_name.get(&node.module).unwrap().clone()),
                            module_to_name.get(&target.module()).unwrap().clone(),
                        ));
                        count += 1;

                        // We are a cycle so we need to break the loop eventually
                        Ok(if count < 6 {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Skip
                        })
                    },
                )?;
                assert_eq!(
                    vec![
                        (None, rcstr!("a.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("b.js")), rcstr!("c.js")),
                        (Some(rcstr!("c.js")), rcstr!("a.js")),
                        // we start following the cycle again
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("b.js")), rcstr!("c.js")),
                    ],
                    visits
                );

                Ok(())
            },
        )
        .await;
    }
    #[turbo_tasks::value(shared)]
    struct TestRepo {
        repo: FxHashMap<FileSystemPath, Vec<FileSystemPath>>,
    }
    #[turbo_tasks::value]
    struct MockModule {
        path: FileSystemPath,
        repo: ResolvedVc<TestRepo>,
    }
    #[turbo_tasks::value_impl]
    impl MockModule {
        #[turbo_tasks::function]
        fn new(path: FileSystemPath, repo: ResolvedVc<TestRepo>) -> Vc<Self> {
            Self { path, repo }.cell()
        }
    }

    #[turbo_tasks::value_impl]
    impl Asset for MockModule {
        #[turbo_tasks::function]
        fn content(&self) -> Vc<AssetContent> {
            panic!("MockModule::content shouldn't be called")
        }
    }

    #[turbo_tasks::value_impl]
    impl Module for MockModule {
        #[turbo_tasks::function]
        fn ident(&self) -> Vc<AssetIdent> {
            AssetIdent::from_path(self.path.clone())
        }

        #[turbo_tasks::function]
        async fn references(&self) -> Result<Vc<ModuleReferences>> {
            let repo = self.repo.await?;
            let references = match repo.repo.get(&self.path) {
                Some(deps) => {
                    deps.iter()
                        .map(|p| {
                            Vc::upcast::<Box<dyn ModuleReference>>(
                                SingleChunkableModuleReference::new(
                                    Vc::upcast(MockModule::new(p.clone(), *self.repo)),
                                    rcstr!("normal-dep"),
                                    ExportUsage::all(),
                                ),
                            )
                            .to_resolved()
                        })
                        .try_join()
                        .await?
                }
                None => vec![],
            };

            Ok(Vc::cell(references))
        }
    }

    /// Constructs a graph based on the provided dependency adjacency lists and calls the given test
    /// function.
    ///
    /// # Parameters
    /// - `entries`: A vector of entry module names (as `RcStr`). These are the starting points for
    ///   the graph.
    /// - `graph`: A map from module name (`RcStr`) to a vector of its dependency module names
    ///   (`RcStr`). Represents the adjacency list of the graph.
    /// - `test_fn`: A function that is called with:
    ///     - `ReadRef<SingleModuleGraph>`: The constructed module graph.
    ///     - `Vec<ResolvedVc<Box<dyn Module>>>`: The resolved entry modules.
    ///     - `FxHashMap<ResolvedVc<Box<dyn Module>>, RcStr>`: A mapping from module to its name for
    ///       easier analysis in tests.
    async fn run_graph_test(
        entries: Vec<RcStr>,
        graph: FxHashMap<RcStr, Vec<RcStr>>,
        test_fn: impl FnOnce(
            ReadRef<SingleModuleGraph>,
            Vec<ResolvedVc<Box<dyn Module>>>,
            FxHashMap<ResolvedVc<Box<dyn Module>>, RcStr>,
        ) -> Result<()>
        + Send
        + 'static,
    ) {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = VirtualFileSystem::new_with_name(rcstr!("test"));
            let root = fs.root().await?;

            let repo = TestRepo {
                repo: graph
                    .iter()
                    .map(|(k, v)| {
                        (
                            root.join(k).unwrap(),
                            v.iter().map(|f| root.join(f).unwrap()).collect(),
                        )
                    })
                    .collect(),
            }
            .cell();
            let entry_modules = entries
                .iter()
                .map(|e| {
                    Vc::upcast::<Box<dyn Module>>(MockModule::new(root.join(e).unwrap(), repo))
                        .to_resolved()
                })
                .try_join()
                .await?;
            let graph = SingleModuleGraph::new_with_entries(
                GraphEntries::cell(GraphEntries(vec![ChunkGroupEntry::Entry(
                    entry_modules.clone(),
                )])),
                false,
            )
            .await?;

            // Create a simple name mapping to make analyzing the visitors easier.
            // Technically they could always pull this name off of the
            // `module.ident().await?.path.path` themselves but that `await` is trick in the
            // visitors so precomputing this helps.
            let module_to_name = graph
                .modules
                .keys()
                .map(|m| async move { Ok((*m, m.ident().await?.path.path.clone())) })
                .try_join()
                .await?
                .into_iter()
                .collect();
            test_fn(graph, entry_modules, module_to_name)
        })
        .await
        .unwrap();
    }
}
