use std::{
    collections::{BinaryHeap, HashSet, VecDeque, hash_map::Entry},
    future::Future,
};

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
use petgraph::{
    Directed,
    graph::{DiGraph, EdgeIndex, NodeIndex},
    visit::{
        Dfs, EdgeRef, IntoNeighbors, IntoNodeReferences, NodeIndexable, Reversed, VisitMap,
        Visitable,
    },
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::{Instrument, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt,
    ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    chunk::{AsyncModuleInfo, ChunkingContext, ChunkingType},
    issue::{CollectibleModuleGraph, ImportTrace, Issue},
    module::Module,
    module_graph::{
        async_module_info::{AsyncModulesInfo, compute_async_module_info},
        chunk_group_info::{ChunkGroupEntry, ChunkGroupInfo, compute_chunk_group_info},
        module_batches::{ModuleBatchesGraph, compute_module_batches},
        style_groups::{StyleGroups, StyleGroupsConfig, compute_style_groups},
        traced_di_graph::{TracedDiGraph, iter_neighbors_rev},
    },
    reference::primary_chunkable_referenced_modules,
};

pub mod async_module_info;
pub mod chunk_group_info;
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
    pub async fn empty() -> Vc<Self> {
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
    pub async fn with_incremented_index(&self) -> Result<Vc<Self>> {
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
    graph: TracedDiGraph<SingleModuleGraphNode, ChunkingType>,

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

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
    /// The resulting graph's outgoing edges are in reverse order.
    async fn new_inner(
        entries: &GraphEntriesT,
        visited_modules: &FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
        include_traced: bool,
    ) -> Result<Vc<Self>> {
        let root_edges = entries
            .iter()
            .flat_map(|e| e.entries())
            .map(|e| async move {
                Ok(SingleModuleGraphBuilderEdge {
                    to: SingleModuleGraphBuilderNode::new_module(e).await?,
                })
            })
            .try_join()
            .await?;

        let (children_nodes_iter, visited_nodes) = AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                root_edges,
                SingleModuleGraphBuilder {
                    visited_modules,
                    include_traced,
                },
            )
            .await
            .completed()?
            .into_inner_with_visited();
        let node_count = visited_nodes.0.len();
        drop(visited_nodes);

        let mut graph: petgraph::Graph<SingleModuleGraphNode, ChunkingType, Directed> =
            DiGraph::with_capacity(
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
            for (parent, current) in children_nodes_iter.into_breadth_first_edges() {
                let parent_edge = match parent {
                    Some(SingleModuleGraphBuilderNode::Module { module, .. }) => {
                        Some((*modules.get(&module).unwrap(), COMMON_CHUNKING_TYPE))
                    }
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
                        if let Some((parent_idx, chunking_type)) = parent_edge {
                            graph.add_edge(parent_idx, current_idx, chunking_type);
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
                        if let Some((parent_idx, chunking_type)) = parent_edge {
                            graph.add_edge(parent_idx, current_idx, chunking_type);
                        }
                    }
                    SingleModuleGraphBuilderNode::ChunkableReference {
                        source,
                        target,
                        chunking_type,
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
                        graph.add_edge(*modules.get(&source).unwrap(), target_idx, chunking_type);
                    }
                }
            }
        }

        graph.shrink_to_fit();

        #[cfg(debug_assertions)]
        {
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

        let graph = SingleModuleGraph {
            graph: TracedDiGraph::new(graph),
            number_of_modules,
            modules,
            entries: entries.clone(),
        }
        .cell();

        turbo_tasks::emit(ResolvedVc::upcast::<Box<dyn CollectibleModuleGraph>>(
            graph.to_resolved().await?,
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

    /// Iterate over all nodes in the graph
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
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
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
                Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
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

    /// Traverses all reachable edges in topological order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs
    ///
    /// Use this to collect modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge).
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    pub fn traverse_edges_from_entries_topological<'a, S>(
        &'a self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ),
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(e).unwrap());

        enum TopologicalPass {
            Visit,
            ExpandAndVisit,
        }

        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(TopologicalPass, Option<(NodeIndex, EdgeIndex)>, NodeIndex)> = entries
            .map(|e| (TopologicalPass::ExpandAndVisit, None, e))
            .collect();
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
                TopologicalPass::Visit => {
                    visit_postorder(parent_arg, graph.node_weight(current).unwrap(), state);
                }
                TopologicalPass::ExpandAndVisit => match graph.node_weight(current).unwrap() {
                    current_node @ SingleModuleGraphNode::Module(_) => {
                        let action = visit_preorder(parent_arg, current_node, state)?;
                        if action == GraphTraversalAction::Exclude {
                            continue;
                        }
                        stack.push((TopologicalPass::Visit, parent, current));
                        if action == GraphTraversalAction::Continue && expanded.insert(current) {
                            stack.extend(iter_neighbors_rev(graph, current).map(
                                |(edge, child)| {
                                    (
                                        TopologicalPass::ExpandAndVisit,
                                        Some((current, edge)),
                                        child,
                                    )
                                },
                            ));
                        }
                    }
                    current_node @ SingleModuleGraphNode::VisitedModule { .. } => {
                        visit_preorder(parent_arg, current_node, state)?;
                        visit_postorder(parent_arg, current_node, state);
                    }
                },
            }
        }

        Ok(())
    }

    pub fn traverse_cycles<'l>(
        &'l self,
        edge_filter: impl Fn(&'l ChunkingType) -> bool,
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
            .map(|issue| async move { Ok((*issue.file_path().await?).clone()) })
            .try_join()
            .await?;
        let mut file_path_to_traces: FxHashMap<FileSystemPath, Vec<ImportTrace>> =
            FxHashMap::with_capacity_and_hasher(issue_paths.len(), Default::default());
        // initialize an empty vec for each path we care about
        for issue in &issue_paths {
            file_path_to_traces.entry(issue.clone()).or_default();
        }

        {
            let modules = self
                .modules
                .iter()
                .map(|(module, &index)| async move {
                    Ok(((*module.ident().path().await?).clone(), index))
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
                        |e| match e.weight() {
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

#[turbo_tasks::value_impl]
impl CollectibleModuleGraph for SingleModuleGraph {}
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
    pub async fn chunk_group_info(&self) -> Result<Vc<ChunkGroupInfo>> {
        compute_chunk_group_info(self).await
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
            let _issues = result_op.take_collectibles::<Box<dyn Issue>>();
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
        let this = self.await?;
        let graphs = this.get_graphs().await?;
        let async_modules_info = self.async_module_info().await?;

        let entry = ModuleGraph::get_entry(&graphs, module).await?;
        let referenced_modules =
            iter_neighbors_rev(&graphs[entry.graph_idx()].graph, entry.node_idx)
                .filter(|(edge_idx, _)| {
                    let ty = graphs[entry.graph_idx()]
                        .graph
                        .edge_weight(*edge_idx)
                        .unwrap();
                    ty.is_inherit_async()
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
    pub async fn get_graphs(&self) -> Result<Vec<ReadRef<SingleModuleGraph>>> {
        self.graphs.iter().try_join().await
    }

    async fn get_entry(
        graphs: &[ReadRef<SingleModuleGraph>],
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<GraphNodeIndex> {
        let Some(idx) = graphs.iter().enumerate().find_map(|(graph_idx, graph)| {
            graph.modules.get(&entry).map(|node_idx| GraphNodeIndex {
                graph_idx: u32::try_from(graph_idx).unwrap(),
                node_idx: *node_idx,
            })
        }) else {
            bail!(
                "Couldn't find entry module {} in module graph (potential entries: {:?})",
                entry.ident().to_string().await?,
                graphs
                    .iter()
                    .flat_map(|g| g.entries.iter())
                    .flat_map(|e| e.entries())
                    .map(|e| e.ident().to_string())
                    .try_join()
                    .await?
            );
        };
        Ok(idx)
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
    pub async fn traverse_edges_from_entries_bfs(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
        ) -> Result<GraphTraversalAction>,
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        let mut queue = VecDeque::from(
            entries
                .into_iter()
                .map(|e| ModuleGraph::get_entry(&graphs, e))
                .try_join()
                .await?,
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
    pub async fn traverse_edges_from_entry(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        let entries = entries.into_iter();
        let mut stack = Vec::with_capacity(entries.size_hint().0);
        for entry in entries {
            stack.push(ModuleGraph::get_entry(&graphs, entry).await?);
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
    pub async fn traverse_all_edges_unordered(
        &self,
        mut visitor: impl FnMut(
            (&'_ SingleModuleGraphModuleNode, &'_ ChunkingType),
            &'_ SingleModuleGraphModuleNode,
        ) -> Result<()>,
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        for graph in &graphs {
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

    /// Traverses all reachable edges in topological order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs
    ///
    /// Use this to collect modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge).
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub async fn traverse_edges_from_entries_topological<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ),
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        let entries = entries.into_iter().collect::<Vec<_>>();

        enum TopologicalPass {
            Visit,
            ExpandAndVisit,
        }
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            TopologicalPass,
            Option<(GraphNodeIndex, EdgeIndex)>,
            GraphNodeIndex,
        )> = Vec::with_capacity(entries.len());
        for entry in entries.into_iter().rev() {
            stack.push((
                TopologicalPass::ExpandAndVisit,
                None,
                ModuleGraph::get_entry(&graphs, entry).await?,
            ));
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
                TopologicalPass::Visit => {
                    visit_postorder(parent_arg, current_node, state);
                }
                TopologicalPass::ExpandAndVisit => {
                    let action = visit_preorder(parent_arg, current_node, state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((TopologicalPass::Visit, parent, current));
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
                                TopologicalPass::ExpandAndVisit,
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
    pub async fn traverse_cycles(
        &self,
        edge_filter: impl Fn(&ChunkingType) -> bool,
        mut visit_cycle: impl FnMut(&[&SingleModuleGraphModuleNode]),
    ) -> Result<()> {
        for graph in &self.graphs {
            graph.await?.traverse_cycles(&edge_filter, &mut visit_cycle);
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
    pub async fn traverse_edges_fixed_point_with_priority<S, P: Ord>(
        &self,
        entries: impl IntoIterator<Item = (ResolvedVc<Box<dyn Module>>, P)>,
        state: &mut S,
        mut visit: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        priority: impl Fn(&'_ SingleModuleGraphModuleNode, &mut S) -> Result<P>,
    ) -> Result<usize> {
        let graphs = self.get_graphs().await?;

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
                .map(async |(m, priority)| {
                    Ok(NodeWithPriority {
                        node: ModuleGraph::get_entry(&graphs, m).await?,
                        priority,
                    })
                })
                .try_join()
                .await?,
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
        chunking_type: ChunkingType,
        source: ResolvedVc<Box<dyn Module>>,
        target: ResolvedVc<Box<dyn Module>>,
        // These two fields are only used for tracing. Derived from `source.ident()` and
        // `target.ident()`
        source_ident: ReadRef<RcStr>,
        target_ident: ReadRef<RcStr>,
    },
    /// A regular module
    Module {
        module: ResolvedVc<Box<dyn Module>>,
        // module.ident().to_string(), eagerly computed for tracing
        ident: ReadRef<RcStr>,
    },
    /// A reference to a module that is already listed in visited_modules
    VisitedModule {
        module: ResolvedVc<Box<dyn Module>>,
        idx: GraphNodeIndex,
    },
}

impl SingleModuleGraphBuilderNode {
    async fn new_module(module: ResolvedVc<Box<dyn Module>>) -> Result<Self> {
        let ident = module.ident();
        Ok(Self::Module {
            module,
            ident: ident.to_string().await?,
        })
    }
    async fn new_chunkable_ref(
        source: ResolvedVc<Box<dyn Module>>,
        target: ResolvedVc<Box<dyn Module>>,
        chunking_type: ChunkingType,
    ) -> Result<Self> {
        Ok(Self::ChunkableReference {
            chunking_type,
            source,
            source_ident: source.ident().to_string().await?,
            target,
            target_ident: target.ident().to_string().await?,
        })
    }
    fn new_visited_module(module: ResolvedVc<Box<dyn Module>>, idx: GraphNodeIndex) -> Self {
        Self::VisitedModule { module, idx }
    }
}
struct SingleModuleGraphBuilderEdge {
    to: SingleModuleGraphBuilderNode,
}

/// The chunking type that occurs most often, is handled more efficiently by not creating
/// intermediate SingleModuleGraphBuilderNode::ChunkableReference nodes.
const COMMON_CHUNKING_TYPE: ChunkingType = ChunkingType::Parallel {
    inherit_async: true,
    hoisted: true,
};

struct SingleModuleGraphBuilder<'a> {
    visited_modules: &'a FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
    /// Whether to walk ChunkingType::Traced references
    include_traced: bool,
}
impl Visit<SingleModuleGraphBuilderNode> for SingleModuleGraphBuilder<'_> {
    type Edge = SingleModuleGraphBuilderEdge;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<SingleModuleGraphBuilderNode> {
        match edge.to {
            SingleModuleGraphBuilderNode::Module { .. } => VisitControlFlow::Continue(edge.to),
            SingleModuleGraphBuilderNode::ChunkableReference {
                ref chunking_type, ..
            } => match chunking_type {
                ChunkingType::Traced => VisitControlFlow::Skip(edge.to),
                _ => VisitControlFlow::Continue(edge.to),
            },
            // Module was already visited previously
            SingleModuleGraphBuilderNode::VisitedModule { .. } => VisitControlFlow::Skip(edge.to),
        }
    }

    fn edges(&mut self, node: &SingleModuleGraphBuilderNode) -> Self::EdgesFuture {
        // Destructure beforehand to not have to clone the whole node when entering the async block
        let (module, chunkable_ref_target) = match node {
            SingleModuleGraphBuilderNode::Module { module, .. } => (Some(*module), None),
            SingleModuleGraphBuilderNode::ChunkableReference { target, .. } => {
                (None, Some(*target))
            }
            // These are always skipped in `visit()`
            SingleModuleGraphBuilderNode::VisitedModule { .. } => unreachable!(),
        };
        let visited_modules = self.visited_modules;
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
                        .flat_map(|(ty, modules)| modules.iter().map(|m| (ty.clone(), *m)))
                        .map(async |(ty, target)| {
                            let to = if ty == COMMON_CHUNKING_TYPE {
                                if let Some(idx) = visited_modules.get(&target) {
                                    SingleModuleGraphBuilderNode::new_visited_module(target, *idx)
                                } else {
                                    SingleModuleGraphBuilderNode::new_module(target).await?
                                }
                            } else {
                                SingleModuleGraphBuilderNode::new_chunkable_ref(module, target, ty)
                                    .await?
                            };
                            Ok(SingleModuleGraphBuilderEdge { to })
                        })
                        .try_join()
                        .await?
                }
                (None, Some(chunkable_ref_target)) => {
                    vec![SingleModuleGraphBuilderEdge {
                        to: if let Some(idx) = visited_modules.get(&chunkable_ref_target) {
                            SingleModuleGraphBuilderNode::new_visited_module(
                                chunkable_ref_target,
                                *idx,
                            )
                        } else {
                            SingleModuleGraphBuilderNode::new_module(chunkable_ref_target).await?
                        },
                    }]
                }
                _ => unreachable!(),
            })
        }
    }

    fn span(&mut self, node: &SingleModuleGraphBuilderNode) -> tracing::Span {
        match node {
            SingleModuleGraphBuilderNode::Module { ident, .. } => {
                tracing::info_span!("module", name = display(ident))
            }

            SingleModuleGraphBuilderNode::ChunkableReference {
                chunking_type,
                source_ident,
                target_ident,
                ..
            } => match chunking_type {
                ChunkingType::Parallel {
                    inherit_async: false,
                    ..
                } => Span::current(),
                _ => {
                    tracing::info_span!(
                        "chunkable reference",
                        ty = debug(chunking_type),
                        source = display(source_ident),
                        target = display(target_ident)
                    )
                }
            },
            SingleModuleGraphBuilderNode::VisitedModule { .. } => {
                tracing::info_span!("visited module")
            }
        }
    }
}
