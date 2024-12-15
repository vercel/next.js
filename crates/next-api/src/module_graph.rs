use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    future::Future,
    hash::Hash,
    ops::Deref,
};

use anyhow::{Context, Result};
use next_core::{
    mode::NextMode,
    next_client_reference::{
        find_server_entries, ClientReference, ClientReferenceGraphResult, ClientReferenceType,
        ServerEntries, VisitedClientReferenceGraphNodes,
    },
    next_manifests::ActionLayer,
};
use petgraph::{
    graph::{DiGraph, NodeIndex},
    visit::{Dfs, VisitMap, Visitable},
};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow, VisitedNodes},
    trace::{TraceRawVcs, TraceRawVcsContext},
    CollectiblesSource, FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc,
    TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
};
use turbopack_core::{
    chunk::ChunkingType,
    context::AssetContext,
    issue::{Issue, IssueExt},
    module::{Module, Modules},
    reference::primary_chunkable_referenced_modules,
};

use crate::{
    client_references::{map_client_references, ClientReferenceMapType, ClientReferencesSet},
    dynamic_imports::{map_next_dynamic, DynamicImports},
    project::Project,
    server_actions::{map_server_actions, to_rsc_context, AllActions, AllModuleActions},
};

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
struct SingleModuleGraphs(pub Vec<ResolvedVc<SingleModuleGraph>>);

#[derive(PartialEq, Eq, Debug)]
pub enum GraphTraversalAction {
    /// Continue visiting children
    Continue,
    /// Skip the immediate children
    Skip,
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct SingleModuleGraphNode {
    pub module: ResolvedVc<Box<dyn Module>>,
    issues: Vec<ResolvedVc<Box<dyn Issue>>>,
    pub layer: Option<ReadRef<RcStr>>,
}

impl SingleModuleGraphNode {
    fn emit_issues(&self) {
        for issue in &self.issues {
            issue.emit();
        }
    }
}

#[derive(Clone, Debug, ValueDebugFormat, Serialize, Deserialize)]
struct TracedDiGraph<N: TraceRawVcs, E: TraceRawVcs>(DiGraph<N, E>);
impl<N: TraceRawVcs, E: TraceRawVcs> Default for TracedDiGraph<N, E> {
    fn default() -> Self {
        Self(Default::default())
    }
}
impl<N: TraceRawVcs, E: TraceRawVcs> TraceRawVcs for TracedDiGraph<N, E> {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for node in self.0.node_weights() {
            node.trace_raw_vcs(trace_context);
        }
        for edge in self.0.edge_weights() {
            edge.trace_raw_vcs(trace_context);
        }
    }
}
impl<N: TraceRawVcs, E: TraceRawVcs> Deref for TracedDiGraph<N, E> {
    type Target = DiGraph<N, E>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new", local)]
#[derive(Clone, Default)]
pub struct SingleModuleGraph {
    graph: TracedDiGraph<SingleModuleGraphNode, ChunkingType>,
    // NodeIndex isn't necessarily stable, but these are first nodes in the graph, so shouldn't
    // ever be involved in a swap_remove operation
    //
    // HashMaps have nondeterministic order, but this map is only used for lookups (in `get_entry`)
    // and not iteration.
    //
    // This contains Vcs, but they are already contained in the graph, so no need to trace this.
    #[turbo_tasks(trace_ignore)]
    entries: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
struct ModuleSet(pub HashSet<ResolvedVc<Box<dyn Module>>>);

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
    Module {
        module: ResolvedVc<Box<dyn Module>>,
        layer: Option<ReadRef<RcStr>>,
        ident: ReadRef<RcStr>,
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
}
struct SingleModuleGraphBuilderEdge {
    // ty: Option<ChunkingType>,
    to: SingleModuleGraphBuilderNode,
}

/// The chunking type that occurs most often, is handled more efficiently by not creating
/// intermediate SingleModuleGraphBuilderNode::ChunkableReference nodes.
const COMMON_CHUNKING_TYPE: ChunkingType = ChunkingType::Parallel;

struct SingleModuleGraphBuilder {}
impl Visit<SingleModuleGraphBuilderNode> for SingleModuleGraphBuilder {
    type Edge = SingleModuleGraphBuilderEdge;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<SingleModuleGraphBuilderNode> {
        match edge.to {
            SingleModuleGraphBuilderNode::Module { .. }
            | SingleModuleGraphBuilderNode::ChunkableReference { .. } => {
                VisitControlFlow::Continue(edge.to)
            }
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
            SingleModuleGraphBuilderNode::Issues(_) => unreachable!(),
        };
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
                        .map(|(ty, target)| async move {
                            Ok(SingleModuleGraphBuilderEdge {
                                to: if ty == COMMON_CHUNKING_TYPE {
                                    SingleModuleGraphBuilderNode::new_module(target).await?
                                } else {
                                    SingleModuleGraphBuilderNode::new_chunkable_ref(
                                        module, target, ty,
                                    )
                                    .await?
                                },
                            })
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
        }
    }
}

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
    /// The resulting graph's outgoing edges are in reverse order.
    /// If passed, `root` is connected to the entries and include in `self.entries`.
    async fn new_inner(
        root: Option<ResolvedVc<Box<dyn Module>>>,
        entries: &Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: &HashSet<ResolvedVc<Box<dyn Module>>>,
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
            .skip_duplicates_with_visited_nodes(VisitedNodes(
                visited_modules
                    .iter()
                    .map(|&module| SingleModuleGraphBuilderNode::new_module(module))
                    .try_join()
                    .await?
                    .into_iter()
                    .collect(),
            ))
            .visit(root_edges, SingleModuleGraphBuilder {})
            .await
            .completed()?
            .into_inner();

        let mut modules: HashMap<ResolvedVc<Box<dyn Module>>, NodeIndex<u32>> = HashMap::new();
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
                    SingleModuleGraphBuilderNode::Issues { .. } => unreachable!(),
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
                            let idx = graph.add_node(SingleModuleGraphNode {
                                module,
                                issues: Default::default(),
                                layer,
                            });
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
                        graph
                            .node_weight_mut(parent_idx)
                            .unwrap()
                            .issues
                            .extend(new_issues);
                    }
                }
            }
        }

        let root_idx = if let Some(root) = root {
            if !modules.contains_key(&root) {
                let root_idx = graph.add_node(SingleModuleGraphNode {
                    module: root,
                    issues: Default::default(),
                    layer: None,
                    // ident: root.ident().to_string().await?,
                });
                for entry in entries {
                    graph.add_edge(
                        root_idx,
                        *modules.get(entry).unwrap(),
                        ChunkingType::Parallel,
                    );
                }
                Some((root, root_idx))
            } else {
                None
            }
        } else {
            None
        };

        Ok(SingleModuleGraph {
            graph: TracedDiGraph(graph),
            entries: entries
                .iter()
                .map(|e| (*e, *modules.get(e).unwrap()))
                .chain(root_idx.into_iter())
                .collect(),
        }
        .cell())
    }

    fn get_entry(&self, module: ResolvedVc<Box<dyn Module>>) -> Result<NodeIndex> {
        self.entries
            .get(&module)
            .copied()
            .context("Couldn't find entry module in graph")
    }

    /// Iterate over all nodes in the graph (potentially in the whole app!).
    pub fn iter_nodes(&self) -> impl Iterator<Item = &'_ SingleModuleGraphNode> + '_ {
        self.graph.node_weights()
    }

    /// Enumerate over all nodes in the graph (potentially in the whole app!).
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
        mut visitor: impl FnMut(&'a SingleModuleGraphNode),
    ) -> Result<()> {
        let entry_node = self.get_entry(entry)?;

        let mut dfs = Dfs::new(&*self.graph, entry_node);
        while let Some(nx) = dfs.next(&*self.graph) {
            let weight = self.graph.node_weight(nx).unwrap();
            weight.emit_issues();
            visitor(weight);
        }
        Ok(())
    }

    /// Traverses all reachable edges exactly once and calls the visitor with the edge source and
    /// target.
    ///
    /// This means that target nodes can be revisited (once per incoming edge).
    pub fn traverse_edges_from_entry<'a>(
        &'a self,
        entry: ResolvedVc<Box<dyn Module>>,
        mut visitor: impl FnMut(
            (Option<&'a SingleModuleGraphNode>, &'a SingleModuleGraphNode),
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graph = &self.graph;
        let entry_node = self.get_entry(entry)?;

        let mut stack = vec![entry_node];
        let mut discovered = graph.visit_map();
        let entry_weight = graph.node_weight(entry_node).unwrap();
        entry_weight.emit_issues();
        visitor((None, entry_weight));

        while let Some(node) = stack.pop() {
            let node_weight = graph.node_weight(node).unwrap();
            if discovered.visit(node) {
                for succ in graph.neighbors(node).collect::<Vec<_>>() {
                    let succ_weight = graph.node_weight(succ).unwrap();
                    let action = visitor((Some(node_weight), succ_weight));
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
    pub fn traverse_edges_from_entry_topological<'a, S>(
        &'a self,
        entry: ResolvedVc<Box<dyn Module>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            (Option<&'a SingleModuleGraphNode>, &'a SingleModuleGraphNode),
            &mut S,
        ) -> GraphTraversalAction,
        mut visit_postorder: impl FnMut(
            (Option<&'a SingleModuleGraphNode>, &'a SingleModuleGraphNode),
            &mut S,
        ),
    ) -> Result<()> {
        let graph = &self.graph;
        let entry_node = self.get_entry(entry)?;

        enum ReverseTopologicalPass {
            Visit,
            ExpandAndVisit,
        }

        let mut stack: Vec<(ReverseTopologicalPass, Option<NodeIndex>, NodeIndex)> =
            vec![(ReverseTopologicalPass::ExpandAndVisit, None, entry_node)];
        let mut expanded = HashSet::new();
        while let Some((pass, parent, current)) = stack.pop() {
            match pass {
                ReverseTopologicalPass::Visit => {
                    visit_postorder(
                        (
                            parent.map(|parent| graph.node_weight(parent).unwrap()),
                            graph.node_weight(current).unwrap(),
                        ),
                        state,
                    );
                }
                ReverseTopologicalPass::ExpandAndVisit => {
                    let action = visit_preorder(
                        (
                            parent.map(|parent| graph.node_weight(parent).unwrap()),
                            graph.node_weight(current).unwrap(),
                        ),
                        state,
                    );
                    stack.push((ReverseTopologicalPass::Visit, parent, current));
                    if expanded.insert(current) && action == GraphTraversalAction::Continue {
                        stack.extend(
                            graph
                                .neighbors(current)
                                // .collect::<Vec<_>>()
                                // .rev()
                                .map(|child| {
                                    (ReverseTopologicalPass::ExpandAndVisit, Some(current), child)
                                }),
                        );
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
    async fn new_with_entries(entries: Vc<Modules>) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(None, &*entries.await?, &Default::default()).await
    }

    /// `root` is connected to the entries and include in `self.entries`.
    #[turbo_tasks::function]
    async fn new_with_entries_visited(
        root: ResolvedVc<Box<dyn Module>>,
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: Vc<ModuleSet>,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(Some(root), &entries, &*visited_modules.await?).await
    }
}

/// Implements layout segment optimization to compute a graph "chain" for each layout segment
#[turbo_tasks::function]
async fn get_module_graph_for_endpoint(
    entry: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<SingleModuleGraphs>> {
    let ServerEntries {
        server_utils,
        server_component_entries,
    } = &*find_server_entries(*entry).await?;

    let mut graphs = vec![];

    let mut visited_modules = if !server_utils.is_empty() {
        let graph = SingleModuleGraph::new_with_entries_visited(
            *entry,
            server_utils.iter().map(|m| **m).collect(),
            Vc::cell(Default::default()),
        )
        .to_resolved()
        .await?;
        graphs.push(graph);
        graph
            .await?
            .iter_nodes()
            .map(|n| n.module)
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
    };

    // ast-grep-ignore: to-resolved-in-loop
    for module in server_component_entries
        .iter()
        .map(|m| ResolvedVc::upcast::<Box<dyn Module>>(*m))
    {
        let graph = SingleModuleGraph::new_with_entries_visited(
            *entry,
            vec![*module],
            Vc::cell(visited_modules.clone()),
        )
        .to_resolved()
        .await?;
        visited_modules.extend(graph.await?.iter_nodes().map(|n| n.module));
        graphs.push(graph);
    }

    // The previous iterations above (might) have added the entry node, but not actually visited it.
    visited_modules.remove(&entry);
    let graph = SingleModuleGraph::new_with_entries_visited(
        *entry,
        vec![*entry],
        Vc::cell(visited_modules.clone()),
    )
    .to_resolved()
    .await?;
    graphs.push(graph);

    Ok(Vc::cell(graphs))
}

#[turbo_tasks::value]
pub struct NextDynamicGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// RSC/SSR importer -> dynamic imports (specifier and client module)
    data: ResolvedVc<DynamicImports>,
}

#[turbo_tasks::value_impl]
impl NextDynamicGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
        client_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<Self>> {
        let mapped = map_next_dynamic(*graph, client_asset_context);
        mapped.strongly_consistent().await?;
        // TODO this can be removed once next/dynamic collection is moved to the transition instead
        // of AST traversal
        let _ = mapped.take_collectibles::<Box<dyn Issue>>();

        // TODO shrink graph here, using the information from
        //  - `mapped` (which lists the relevant nodes)
        //  - `graph.entries` (which lists the page/route/... entries we need to keep)

        // This would clone the graph and allow changing the node weights. We can probably get away
        // with keeping the sidecar information separate from the graph itself, though.
        //
        // let mut reduced_modules: HashMap<Vc<Box<dyn Module>>, NodeIndex<u32>> =
        // HashMap::new(); let mut reduced_graph = DiGraph::new();
        // for idx in graph.node_indices() {
        //     let weight = *graph.node_weight(idx).unwrap();
        //     let new_idx = reduced_graph.add_node(weight);
        //     reduced_modules.insert(weight, new_idx);
        //     for e in graph.edges_directed(idx, petgraph::Direction::Outgoing) {
        //         let target_weight = *graph.node_weight(e.target()).context("Missing
        // target")?;         if let Some(new_target_idx) =
        // reduced_modules.get(&target_weight) {
        // reduced_graph.add_edge(new_idx, *new_target_idx, ());         } else {
        //             let new_idx = reduced_graph.add_node(target_weight);
        //             reduced_modules.insert(target_weight, new_idx);
        //         }
        //     }
        // }

        Ok(NextDynamicGraph {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImports>> {
        let span = tracing::info_span!("collect next/dynamic imports for endpoint");
        async move {
            if self.is_single_page {
                // The graph contains the endpoint (= `entry`) only, no need to filter.
                Ok(*self.data)
            } else {
                // The graph contains the whole app, traverse and collect all reachable imports.
                let graph = &*self.graph.await?;
                let data = &self.data.await?;

                let mut result = FxIndexMap::default();
                graph.traverse_from_entry(entry, |node| {
                    let module = node.module;
                    if let Some(node_data) = data.get(&module) {
                        result.insert(module, node_data.clone());
                    }
                })?;
                Ok(Vc::cell(result))
            }
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value]
pub struct ServerActionsGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// (Layer, RSC or Browser module) -> list of actions
    data: ResolvedVc<AllModuleActions>,
}

#[turbo_tasks::value_impl]
impl ServerActionsGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        let mapped = map_server_actions(*graph);

        // TODO shrink graph here

        Ok(ServerActionsGraph {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_server_actions_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
        rsc_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<AllActions>> {
        let span = tracing::info_span!("collect server actions for endpoint");
        async move {
            let data = &*self.data.await?;
            let data = if self.is_single_page {
                // The graph contains the page (= `entry`) only, no need to filter.
                Cow::Borrowed(data)
            } else {
                // The graph contains the whole app, traverse and collect all reachable imports.
                let graph = &*self.graph.await?;

                let mut result = HashMap::new();
                graph.traverse_from_entry(entry, |node| {
                    if let Some(node_data) = data.get(&node.module) {
                        result.insert(node.module, *node_data);
                    }
                })?;
                Cow::Owned(result)
            };

            let actions = data
                .iter()
                .map(|(module, (layer, actions))| async move {
                    actions
                        .await?
                        .iter()
                        .map(|(hash, name)| async move {
                            Ok((
                                hash.to_string(),
                                (
                                    *layer,
                                    name.to_string(),
                                    if *layer == ActionLayer::Rsc {
                                        *module
                                    } else {
                                        to_rsc_context(**module, rsc_asset_context).await?
                                    },
                                ),
                            ))
                        })
                        .try_join()
                        .await
                })
                .try_flat_join()
                .await?;
            Ok(Vc::cell(actions.into_iter().collect()))
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::value]
pub struct ClientReferencesGraph {
    is_single_page: bool,
    graph: ResolvedVc<SingleModuleGraph>,
    /// List of client references (modules that entries into the client graph)
    data: ResolvedVc<ClientReferencesSet>,
}

#[turbo_tasks::value_impl]
impl ClientReferencesGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(
        graph: ResolvedVc<SingleModuleGraph>,
        is_single_page: bool,
    ) -> Result<Vc<Self>> {
        // TODO if is_single_page, then perform the graph traversal below in map_client_references
        // already, which saves us a traversal.
        let mapped = map_client_references(*graph);

        // TODO shrink graph here

        Ok(Self {
            is_single_page,
            graph,
            data: mapped.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn get_client_references_for_endpoint(
        &self,
        entry: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect client references for endpoint");
        async move {
            let data = &*self.data.await?;
            let graph = &*self.graph.await?;

            let mut client_references = FxIndexSet::default();
            // Make sure None (for the various internal next/dist/esm/client/components/*) is
            // listed first
            let mut client_references_by_server_component =
                FxIndexMap::from_iter([(None, Vec::new())]);

            graph.traverse_edges_from_entry_topological(
                entry,
                // state_map is `module -> Option< the current so parent server component >`
                &mut HashMap::new(),
                |(parent_node, node), state_map| {
                    let module = node.module;
                    let Some(parent_node) = parent_node else {
                        state_map.insert(module, None);
                        return GraphTraversalAction::Continue;
                    };
                    let module = node.module;
                    let module_type = data.get(&module);

                    let current_server_component = if let Some(
                        ClientReferenceMapType::ServerComponent(module),
                    ) = module_type
                    {
                        Some(*module)
                    } else {
                        *state_map.get(&parent_node.module).unwrap()
                    };

                    state_map.insert(module, current_server_component);

                    match module_type {
                        Some(
                            ClientReferenceMapType::EcmascriptClientReference { .. }
                            | ClientReferenceMapType::CssClientReference { .. },
                        ) => GraphTraversalAction::Skip,
                        _ => GraphTraversalAction::Continue,
                    }
                },
                |(parent_node, node), state_map| {
                    let Some(parent_node) = parent_node else {
                        return;
                    };
                    let parent_module = parent_node.module;

                    let parent_server_component = *state_map.get(&parent_module).unwrap();

                    match data.get(&node.module) {
                        Some(ClientReferenceMapType::EcmascriptClientReference {
                            module: module_ref,
                            ssr_module,
                        }) => {
                            let client_reference: ClientReference = ClientReference {
                                server_component: parent_server_component,
                                ty: ClientReferenceType::EcmascriptClientReference {
                                    parent_module,
                                    module: *module_ref,
                                },
                            };
                            client_references.insert(client_reference);
                            client_references_by_server_component
                                .entry(parent_server_component)
                                .or_insert_with(Vec::new)
                                .push(*ssr_module);
                        }
                        Some(ClientReferenceMapType::CssClientReference(module_ref)) => {
                            let client_reference = ClientReference {
                                server_component: parent_server_component,
                                ty: ClientReferenceType::CssClientReference(*module_ref),
                            };
                            client_references.insert(client_reference);
                        }
                        _ => {}
                    };
                },
            )?;

            Ok(ClientReferenceGraphResult {
                client_references: client_references.into_iter().collect(),
                client_references_by_server_component,
                server_utils: vec![],
                server_component_entries: vec![],
                // TODO remove
                visited_nodes: VisitedClientReferenceGraphNodes::empty()
                    .to_resolved()
                    .await?,
            }
            .cell())
        }
        .instrument(span)
        .await
    }
}

/// The consumers of this shouldn't need to care about the exact contents since it's abstracted away
/// by the accessor functions, but
/// - In dev, contains information about the modules of the current endpoint only
/// - In prod, there is a single `ReducedGraphs` for the whole app, containing all pages
#[turbo_tasks::value]
pub struct ReducedGraphs {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
    server_actions: Vec<ResolvedVc<ServerActionsGraph>>,
    client_references: Vec<ResolvedVc<ClientReferencesGraph>>,
    // TODO add other graphs
}

#[turbo_tasks::value_impl]
impl ReducedGraphs {
    /// Returns the dynamic imports in RSC and SSR modules for the given endpoint.
    #[turbo_tasks::function]
    pub async fn get_next_dynamic_imports_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<DynamicImports>> {
        let span = tracing::info_span!("collect all next/dynamic imports for endpoint");
        async move {
            if let [graph] = &self.next_dynamic[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_next_dynamic_imports_for_endpoint(entry))
            } else {
                let result = self
                    .next_dynamic
                    .iter()
                    .map(|graph| async move {
                        Ok(graph
                            .get_next_dynamic_imports_for_endpoint(entry)
                            .await?
                            .iter()
                            .map(|(k, v)| (*k, v.clone()))
                            // TODO remove this collect and return an iterator instead
                            .collect::<Vec<_>>())
                    })
                    .try_flat_join()
                    .await?;

                Ok(Vc::cell(result.into_iter().collect()))
            }
        }
        .instrument(span)
        .await
    }

    /// Returns the server actions for the given page.
    #[turbo_tasks::function]
    pub async fn get_server_actions_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
        rsc_asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<AllActions>> {
        let span = tracing::info_span!("collect all server actions for endpoint");
        async move {
            if let [graph] = &self.server_actions[..] {
                // Just a single graph, no need to merge results
                Ok(graph.get_server_actions_for_endpoint(entry, rsc_asset_context))
            } else {
                let result = self
                    .server_actions
                    .iter()
                    .map(|graph| async move {
                        Ok(graph
                            .get_server_actions_for_endpoint(entry, rsc_asset_context)
                            .await?
                            .clone_value())
                    })
                    .try_flat_join()
                    .await?;

                Ok(Vc::cell(result.into_iter().collect()))
            }
        }
        .instrument(span)
        .await
    }

    /// Returns the client references for the given page.
    #[turbo_tasks::function]
    pub async fn get_client_references_for_endpoint(
        &self,
        entry: Vc<Box<dyn Module>>,
    ) -> Result<Vc<ClientReferenceGraphResult>> {
        let span = tracing::info_span!("collect all client references for endpoint");
        async move {
            let mut result = if let [graph] = &self.client_references[..] {
                // Just a single graph, no need to merge results
                graph
                    .get_client_references_for_endpoint(entry)
                    .await?
                    .clone_value()
            } else {
                let results = self
                    .client_references
                    .iter()
                    .map(|graph| async move {
                        let get_client_references_for_endpoint =
                            graph.get_client_references_for_endpoint(entry).await?;
                        Ok(get_client_references_for_endpoint)
                    })
                    .try_join()
                    .await?;

                let mut result = results[0].clone_value();
                for r in results.into_iter().skip(1) {
                    result.extend(&r);
                }
                result
            };

            // Do this separately for now, because the graph traversal order messes up the order of
            // the server_component_entries.
            let ServerEntries {
                server_utils,
                server_component_entries,
            } = &*find_server_entries(entry).await?;
            result.server_utils = server_utils.clone();
            result.server_component_entries = server_component_entries.clone();

            Ok(result.cell())
        }
        .instrument(span)
        .await
    }
}

#[turbo_tasks::function]
async fn get_reduced_graphs_for_endpoint_inner(
    project: Vc<Project>,
    entry: ResolvedVc<Box<dyn Module>>,
    // TODO should this happen globally or per endpoint? Do they all have the same context?
    client_asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ReducedGraphs>> {
    let (is_single_page, graphs) = match &*project.next_mode().await? {
        NextMode::Development => (
            true,
            async move { get_module_graph_for_endpoint(*entry).await }
                .instrument(tracing::info_span!("module graph for endpoint"))
                .await?
                .clone_value(),
        ),
        NextMode::Build => (
            false,
            vec![
                async move {
                    SingleModuleGraph::new_with_entries(project.get_all_entries())
                        .to_resolved()
                        .await
                }
                .instrument(tracing::info_span!("module graph for app"))
                .await?,
            ],
        ),
    };

    let next_dynamic = async {
        graphs
            .iter()
            .map(|graph| {
                NextDynamicGraph::new_with_entries(**graph, is_single_page, client_asset_context)
                    .to_resolved()
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating next/dynamic graphs"))
    .await?;

    let server_actions = async {
        graphs
            .iter()
            .map(|graph| {
                ServerActionsGraph::new_with_entries(**graph, is_single_page).to_resolved()
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating server actions graphs"))
    .await?;

    let client_references = async {
        graphs
            .iter()
            .map(|graph| {
                ClientReferencesGraph::new_with_entries(**graph, is_single_page).to_resolved()
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("generating client references graphs"))
    .await?;

    Ok(ReducedGraphs {
        next_dynamic,
        server_actions,
        client_references,
    }
    .cell())
}

/// Generates a [ReducedGraph] for the given project and endpoint containing information that is
/// either global (module ids, chunking) or computed globally as a performance optimization (client
/// references, etc).
#[turbo_tasks::function]
pub async fn get_reduced_graphs_for_endpoint(
    project: Vc<Project>,
    entry: Vc<Box<dyn Module>>,
    // TODO should this happen globally or per endpoint? Do they all have the same context?
    client_asset_context: Vc<Box<dyn AssetContext>>,
) -> Result<Vc<ReducedGraphs>> {
    // TODO get rid of this function once everything inside of
    // `get_reduced_graphs_for_endpoint_inner` calls `take_collectibles()` when needed
    let result = get_reduced_graphs_for_endpoint_inner(project, entry, client_asset_context);
    if project.next_mode().await?.is_production() {
        result.strongly_consistent().await?;
        let _issues = result.take_collectibles::<Box<dyn Issue>>();
    }
    Ok(result)
}
