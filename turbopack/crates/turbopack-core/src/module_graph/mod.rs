use std::{
    collections::{HashMap, HashSet},
    future::Future,
    ops::Deref,
};

use anyhow::{bail, Context, Result};
use petgraph::{
    graph::{DiGraph, EdgeIndex, NodeIndex},
    visit::{Dfs, EdgeRef, VisitMap, Visitable},
};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
    trace::{TraceRawVcs, TraceRawVcsContext},
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
};

use crate::{
    chunk::ChunkingType,
    issue::Issue,
    module::{Module, Modules},
    reference::primary_chunkable_referenced_modules,
};

#[derive(Debug, Copy, Clone, Eq, Hash, PartialEq, Serialize, Deserialize, TraceRawVcs)]
pub struct GraphNodeIndex {
    #[turbo_tasks(trace_ignore)]
    graph_idx: usize,
    #[turbo_tasks(trace_ignore)]
    node_idx: NodeIndex,
}
unsafe impl NonLocalValue for GraphNodeIndex {}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct VisitedModules {
    pub modules: FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
    next_graph_idx: usize,
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
            next_graph_idx: 0,
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

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
#[derive(Clone, Default)]
pub struct SingleModuleGraph {
    graph: TracedDiGraph<SingleModuleGraphNode, ChunkingType>,

    /// The number of modules in the graph (excluding VisitedModule nodes)
    pub number_of_modules: usize,
    // NodeIndex isn't necessarily stable, but these are first nodes in the graph, so shouldn't
    // ever be involved in a swap_remove operation
    //
    // HashMaps have nondeterministic order, but this map is only used for lookups (in
    // `get_module`) and not iteration.
    //
    // This contains Vcs, but they are already contained in the graph, so no need to trace this.
    #[turbo_tasks(trace_ignore)]
    modules: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
    #[turbo_tasks(trace_ignore)]
    pub entries: Vec<ResolvedVc<Box<dyn Module>>>,
}

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
    /// The resulting graph's outgoing edges are in reverse order.
    async fn new_inner(
        entries: &Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: &FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
    ) -> Result<Vc<Self>> {
        let mut graph = DiGraph::new();

        let root_edges = entries
            .iter()
            .map(|e| async move {
                Ok(SingleModuleGraphBuilderEdge {
                    to: SingleModuleGraphBuilderNode::new_module(*e).await?,
                })
            })
            .try_join()
            .await?;

        let children_nodes_iter = AdjacencyMap::new()
            .skip_duplicates()
            .visit(root_edges, SingleModuleGraphBuilder { visited_modules })
            .await
            .completed()?
            .into_inner();

        let mut number_of_modules = 0;
        let mut modules: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex> = HashMap::new();
        {
            let _span = tracing::info_span!("build module graph").entered();
            for (parent, current) in children_nodes_iter.into_breadth_first_edges() {
                let parent_edge = parent.map(|parent| match parent {
                    SingleModuleGraphBuilderNode::Module { module, .. } => {
                        (*modules.get(&module).unwrap(), COMMON_CHUNKING_TYPE)
                    }
                    SingleModuleGraphBuilderNode::ChunkableReference {
                        source,
                        chunking_type,
                        ..
                    } => (*modules.get(&source).unwrap(), chunking_type),
                    SingleModuleGraphBuilderNode::VisitedModule { .. }
                    | SingleModuleGraphBuilderNode::Issues { .. } => unreachable!(),
                });

                match current {
                    SingleModuleGraphBuilderNode::Module {
                        module,
                        layer,
                        ident: _,
                    } => {
                        // Find the current node, if it was already added
                        let current_idx = if let Some(current_idx) = modules.get(&module) {
                            *current_idx
                        } else {
                            let idx = graph.add_node(SingleModuleGraphNode::Module(
                                SingleModuleGraphModuleNode {
                                    module,
                                    issues: Default::default(),
                                    layer,
                                },
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
                            let idx = graph.add_node(SingleModuleGraphNode::VisitedModule { idx });
                            modules.insert(module, idx);
                            idx
                        };
                        // Add the edge
                        if let Some((parent_idx, chunking_type)) = parent_edge {
                            graph.add_edge(parent_idx, current_idx, chunking_type);
                        }
                    }
                    SingleModuleGraphBuilderNode::ChunkableReference { .. } => {
                        // Ignore. They are handled when visiting the next edge
                        // (ChunkableReference -> Module)
                    }
                    SingleModuleGraphBuilderNode::Issues(new_issues) => {
                        let (parent_idx, _) = parent_edge.unwrap();
                        let SingleModuleGraphNode::Module(SingleModuleGraphModuleNode {
                            issues,
                            ..
                        }) = graph.node_weight_mut(parent_idx).unwrap()
                        else {
                            bail!("Expected Module node");
                        };

                        issues.extend(new_issues);
                    }
                }
            }
        }

        Ok(SingleModuleGraph {
            graph: TracedDiGraph(graph),
            number_of_modules,
            modules,
            entries: entries.clone(),
        }
        .cell())
    }

    fn get_module(&self, module: ResolvedVc<Box<dyn Module>>) -> Result<NodeIndex> {
        self.modules
            .get(&module)
            .copied()
            .context("Couldn't find entry module in graph")
    }

    /// Iterate over all nodes in the graph
    pub fn iter_nodes(&self) -> impl Iterator<Item = &'_ SingleModuleGraphModuleNode> + '_ {
        self.graph.node_weights().filter_map(|n| match n {
            SingleModuleGraphNode::Module(node) => Some(node),
            SingleModuleGraphNode::VisitedModule { .. } => None,
        })
    }

    /// Enumerate all nodes in the graph
    pub fn enumerate_nodes(
        &self,
    ) -> impl Iterator<Item = (NodeIndex, &'_ SingleModuleGraphNode)> + '_ {
        self.graph
            .node_indices()
            .map(move |idx| (idx, self.graph.node_weight(idx).unwrap()))
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
        entries: impl IntoIterator<Item = &'a ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
            &'a SingleModuleGraphModuleNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(*e).unwrap());

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
            .map(|e| *self.modules.get(e).unwrap())
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
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entries_topological<'a, S>(
        &'a self,
        entries: impl IntoIterator<Item = &'a ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
            &'a SingleModuleGraphModuleNode,
            &mut S,
        ) -> GraphTraversalAction,
        mut visit_postorder: impl FnMut(
            Option<(&'a SingleModuleGraphModuleNode, &'a ChunkingType)>,
            &'a SingleModuleGraphModuleNode,
            &mut S,
        ),
    ) -> Result<()> {
        let graph = &self.graph;
        let entries = entries.into_iter().map(|e| self.get_module(*e).unwrap());

        enum ReverseTopologicalPass {
            Visit,
            ExpandAndVisit,
        }

        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            ReverseTopologicalPass,
            Option<(NodeIndex, EdgeIndex)>,
            NodeIndex,
        )> = entries
            .map(|e| (ReverseTopologicalPass::ExpandAndVisit, None, e))
            .collect();
        let mut expanded = HashSet::new();
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
                ReverseTopologicalPass::Visit => {
                    if let SingleModuleGraphNode::Module(current_node) =
                        graph.node_weight(current).unwrap()
                    {
                        visit_postorder(parent_arg, current_node, state);
                    }
                }
                ReverseTopologicalPass::ExpandAndVisit => {
                    if let SingleModuleGraphNode::Module(current_node) =
                        graph.node_weight(current).unwrap()
                    {
                        let action = visit_preorder(parent_arg, current_node, state);
                        stack.push((ReverseTopologicalPass::Visit, parent, current));
                        if expanded.insert(current) && action == GraphTraversalAction::Continue {
                            stack.extend(iter_neighbors(graph, current).map(|(edge, child)| {
                                (
                                    ReverseTopologicalPass::ExpandAndVisit,
                                    Some((current, edge)),
                                    child,
                                )
                            }));
                        }
                    }
                }
            }
        }

        Ok(())
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
    pub fn from_module(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(Vc::cell(vec![module])))
    }

    #[turbo_tasks::function]
    pub fn from_modules(modules: Vc<Modules>) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(modules))
    }
}

// fn get_node(graph: T, node: T) -> SingleModuleGraphModuleNode {
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

impl ModuleGraph {
    async fn get_graphs(&self) -> Result<Vec<ReadRef<SingleModuleGraph>>> {
        self.graphs.iter().try_join().await
    }

    fn get_entry(
        graphs: &[ReadRef<SingleModuleGraph>],
        entry: &ResolvedVc<Box<dyn Module>>,
    ) -> Result<GraphNodeIndex> {
        graphs
            .iter()
            .enumerate()
            .find_map(|(graph_idx, graph)| {
                graph.modules.get(entry).map(|node_idx| GraphNodeIndex {
                    graph_idx,
                    node_idx: *node_idx,
                })
            })
            .context("Couldn't find entry module in graph")
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
    pub async fn traverse_edges_from_entry<'a>(
        &self,
        entries: impl IntoIterator<Item = &'a ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        let mut stack = entries
            .into_iter()
            .map(|e| ModuleGraph::get_entry(&graphs, e).unwrap())
            .collect::<Vec<_>>();
        let mut visited = HashSet::new();
        for entry_node in &stack {
            visitor(None, get_node!(graphs, entry_node));
        }
        while let Some(node) = stack.pop() {
            let graph = &graphs[node.graph_idx].graph;
            let node_weight = get_node!(graphs, node);
            if visited.insert(node) {
                let neighbors = iter_neighbors(graph, node.node_idx);

                for (edge, succ) in neighbors {
                    let succ = GraphNodeIndex {
                        graph_idx: node.graph_idx,
                        node_idx: succ,
                    };
                    let succ_weight = get_node!(graphs, succ);
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
    pub async fn traverse_edges_from_entries_topological<'a, S>(
        &self,
        entries: impl IntoIterator<Item = &'a ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ) -> GraphTraversalAction,
        mut visit_postorder: impl FnMut(
            Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
            &'_ SingleModuleGraphModuleNode,
            &mut S,
        ),
    ) -> Result<()> {
        let graphs = self.get_graphs().await?;

        enum ReverseTopologicalPass {
            Visit,
            ExpandAndVisit,
        }
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            ReverseTopologicalPass,
            Option<(GraphNodeIndex, EdgeIndex)>,
            GraphNodeIndex,
        )> = entries
            .into_iter()
            .map(|e| {
                (
                    ReverseTopologicalPass::ExpandAndVisit,
                    None,
                    ModuleGraph::get_entry(&graphs, e).unwrap(),
                )
            })
            .collect();
        let mut expanded = HashSet::new();
        while let Some((pass, parent, current)) = stack.pop() {
            let parent_arg = parent.map(|(parent_node, parent_edge)| {
                (
                    get_node!(graphs, parent_node),
                    graphs[parent_node.graph_idx]
                        .graph
                        .edge_weight(parent_edge)
                        .unwrap(),
                )
            });
            let current_node = get_node!(graphs, current);
            match pass {
                ReverseTopologicalPass::Visit => {
                    visit_postorder(parent_arg, current_node, state);
                }
                ReverseTopologicalPass::ExpandAndVisit => {
                    let action = visit_preorder(parent_arg, current_node, state);
                    stack.push((ReverseTopologicalPass::Visit, parent, current));
                    if expanded.insert(current) && action == GraphTraversalAction::Continue {
                        let graph = &graphs[current.graph_idx].graph;
                        let (neighbors, child_graph_idx) =
                            match graph.node_weight(current.node_idx).unwrap() {
                                SingleModuleGraphNode::Module(_) => {
                                    (iter_neighbors(graph, current.node_idx), current.graph_idx)
                                }
                                SingleModuleGraphNode::VisitedModule { idx } => (
                                    // We switch graphs
                                    iter_neighbors(&graphs[idx.graph_idx].graph, idx.node_idx),
                                    idx.graph_idx,
                                ),
                            };
                        stack.extend(neighbors.map(|(edge, child)| {
                            (
                                ReverseTopologicalPass::ExpandAndVisit,
                                Some((current, edge)),
                                GraphNodeIndex {
                                    graph_idx: child_graph_idx,
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
}

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(entries: Vc<Modules>) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&*entries.await?, &Default::default()).await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: Vc<VisitedModules>,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(&entries, &visited_modules.await?.modules).await
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct SingleModuleGraphModuleNode {
    pub module: ResolvedVc<Box<dyn Module>>,
    pub layer: Option<ReadRef<RcStr>>,
    pub issues: Vec<ResolvedVc<Box<dyn Issue>>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum SingleModuleGraphNode {
    Module(SingleModuleGraphModuleNode),
    VisitedModule { idx: GraphNodeIndex },
}

impl SingleModuleGraphNode {
    pub fn module(&self) -> Option<ResolvedVc<Box<dyn Module>>> {
        match self {
            SingleModuleGraphNode::Module(SingleModuleGraphModuleNode { module, .. }) => {
                Some(*module)
            }
            SingleModuleGraphNode::VisitedModule { .. } => None,
        }
    }

    // fn emit_issues(&self) {
    //     match self {
    //         SingleModuleGraphNode::Module { issues, .. } => {
    //             for issue in issues {
    //                 issue.emit();
    //             }
    //         }
    //         SingleModuleGraphNode::VisitedModule { .. } => todo!(),
    //     }
    // }
}

#[derive(Clone, Debug, ValueDebugFormat, Serialize, Deserialize)]
struct TracedDiGraph<N, E>(DiGraph<N, E>);
impl<N, E> Default for TracedDiGraph<N, E> {
    fn default() -> Self {
        Self(Default::default())
    }
}

impl<N, E> TraceRawVcs for TracedDiGraph<N, E>
where
    N: TraceRawVcs,
    E: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for node in self.0.node_weights() {
            node.trace_raw_vcs(trace_context);
        }
        for edge in self.0.edge_weights() {
            edge.trace_raw_vcs(trace_context);
        }
    }
}

impl<N, E> Deref for TracedDiGraph<N, E> {
    type Target = DiGraph<N, E>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

unsafe impl<N, E> NonLocalValue for TracedDiGraph<N, E>
where
    N: NonLocalValue,
    E: NonLocalValue,
{
}

#[derive(PartialEq, Eq, Debug)]
pub enum GraphTraversalAction {
    /// Continue visiting children
    Continue,
    /// Skip the immediate children
    Skip,
}

// These nodes are created while walking the Turbopack modules references, and are used to then
// afterwards build the SingleModuleGraph.
#[derive(Clone, Hash, PartialEq, Eq)]
enum SingleModuleGraphBuilderNode {
    /// This edge is represented as a node: source Module -> ChunkableReference ->  target Module
    ChunkableReference {
        chunking_type: ChunkingType,
        source: ResolvedVc<Box<dyn Module>>,
        source_ident: ReadRef<RcStr>,
        target: ResolvedVc<Box<dyn Module>>,
        target_ident: ReadRef<RcStr>,
    },
    /// A regular module
    Module {
        module: ResolvedVc<Box<dyn Module>>,
        layer: Option<ReadRef<RcStr>>,
        ident: ReadRef<RcStr>,
    },
    /// A reference to a module that is already listed in visited_modules
    VisitedModule {
        module: ResolvedVc<Box<dyn Module>>,
        idx: GraphNodeIndex,
    },
    /// Issues to be added to the parent Module node
    #[allow(dead_code)]
    Issues(Vec<ResolvedVc<Box<dyn Issue>>>),
}

impl SingleModuleGraphBuilderNode {
    async fn new_module(module: ResolvedVc<Box<dyn Module>>) -> Result<Self> {
        let ident = module.ident();
        Ok(Self::Module {
            module,
            layer: match ident.await?.layer {
                Some(layer) => Some(layer.await?),
                None => None,
            },
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
const COMMON_CHUNKING_TYPE: ChunkingType = ChunkingType::ParallelInheritAsync;

struct SingleModuleGraphBuilder<'a> {
    visited_modules: &'a FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
}
impl Visit<SingleModuleGraphBuilderNode> for SingleModuleGraphBuilder<'_> {
    type Edge = SingleModuleGraphBuilderEdge;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<SingleModuleGraphBuilderNode> {
        match edge.to {
            SingleModuleGraphBuilderNode::Module { .. }
            | SingleModuleGraphBuilderNode::ChunkableReference { .. } => {
                VisitControlFlow::Continue(edge.to)
            }
            // Module was already visited previously
            SingleModuleGraphBuilderNode::VisitedModule { .. } => VisitControlFlow::Skip(edge.to),
            // Issues doen't have any children
            SingleModuleGraphBuilderNode::Issues(_) => VisitControlFlow::Skip(edge.to),
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
            SingleModuleGraphBuilderNode::VisitedModule { .. }
            | SingleModuleGraphBuilderNode::Issues(_) => unreachable!(),
        };
        let visited_modules = self.visited_modules;
        async move {
            Ok(match (module, chunkable_ref_target) {
                (Some(module), None) => {
                    let refs_cell = primary_chunkable_referenced_modules(*module);
                    let refs = refs_cell.await?;
                    // TODO This is currently too slow
                    // let refs_issues = refs_cell
                    //     .take_collectibles::<Box<dyn Issue>>()
                    //     .iter()
                    //     .map(|issue| issue.to_resolved())
                    //     .try_join()
                    // .await?;

                    refs.iter()
                        .flat_map(|(ty, modules)| {
                            if matches!(ty, ChunkingType::Traced) {
                                None
                            } else {
                                Some(modules.iter().map(|m| (ty.clone(), *m)))
                            }
                        })
                        .flatten()
                        .map(async |(ty, target)| {
                            let to = if let Some(idx) = visited_modules.get(&target) {
                                SingleModuleGraphBuilderNode::new_visited_module(target, *idx)
                            } else if ty == COMMON_CHUNKING_TYPE {
                                SingleModuleGraphBuilderNode::new_module(target).await?
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
                        to: SingleModuleGraphBuilderNode::new_module(chunkable_ref_target).await?,
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
            SingleModuleGraphBuilderNode::Issues(_) => {
                tracing::info_span!("issues")
            }
            SingleModuleGraphBuilderNode::ChunkableReference {
                chunking_type,
                source_ident,
                target_ident,
                ..
            } => {
                tracing::info_span!(
                    "chunkable reference",
                    ty = debug(chunking_type),
                    source = display(source_ident),
                    target = display(target_ident)
                )
            }
            SingleModuleGraphBuilderNode::VisitedModule { .. } => {
                tracing::info_span!("visited module")
            }
        }
    }
}

fn iter_neighbors<N, E>(
    graph: &DiGraph<N, E>,
    node: NodeIndex,
) -> impl Iterator<Item = (EdgeIndex, NodeIndex)> + '_ {
    let mut walker = graph.neighbors(node).detach();
    std::iter::from_fn(move || walker.next(graph))
}
