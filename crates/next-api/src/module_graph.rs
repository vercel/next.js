use std::{
    collections::{HashMap, HashSet},
    future::Future,
    hash::Hash,
    ops::Deref,
};

use anyhow::{Context, Result};
use next_core::{
    mode::NextMode,
    next_client_reference::{find_server_entries, ServerEntries},
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
    CollectiblesSource, FxIndexMap, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt,
    ValueToString, Vc,
};
use turbopack_core::{
    chunk::ChunkingType,
    context::AssetContext,
    issue::{Issue, IssueExt},
    module::{Module, Modules},
    reference::primary_chunkable_referenced_modules,
};

use crate::{
    dynamic_imports::{map_next_dynamic, DynamicImports},
    project::Project,
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

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs)]
pub struct SingleModuleGraphNode {
    pub module: ResolvedVc<Box<dyn Module>>,
    pub issues: Vec<ResolvedVc<Box<dyn Issue>>>,
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

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
#[derive(Clone, Default)]
pub struct SingleModuleGraph {
    graph: TracedDiGraph<SingleModuleGraphNode, ()>,
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

#[derive(Clone, Hash, PartialEq, Eq)]
enum SingleModuleGraphBuilderNode {
    Module {
        module: ResolvedVc<Box<dyn Module>>,
        layer: Option<ReadRef<RcStr>>,
        ident: ReadRef<RcStr>,
    },
    #[allow(dead_code)]
    Issues(Vec<ResolvedVc<Box<dyn Issue>>>),
}

impl SingleModuleGraphBuilderNode {
    async fn new(module: ResolvedVc<Box<dyn Module>>) -> Result<Self> {
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
    fn module(&self) -> Option<ResolvedVc<Box<dyn Module>>> {
        match self {
            SingleModuleGraphBuilderNode::Module { module, .. } => Some(*module),
            SingleModuleGraphBuilderNode::Issues(_) => None,
        }
    }
}
struct SingleModuleGraphBuilderEdge {
    to: SingleModuleGraphBuilderNode,
}
struct SingleModuleGraphBuilder {}
impl Visit<SingleModuleGraphBuilderNode> for SingleModuleGraphBuilder {
    type Edge = SingleModuleGraphBuilderEdge;
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<SingleModuleGraphBuilderNode> {
        match edge.to {
            SingleModuleGraphBuilderNode::Module { .. } => VisitControlFlow::Continue(edge.to),
            SingleModuleGraphBuilderNode::Issues(_) => VisitControlFlow::Skip(edge.to),
        }
    }

    fn edges(&mut self, node: &SingleModuleGraphBuilderNode) -> Self::EdgesFuture {
        let module = node.module();
        async move {
            // This error should never occur since we always skip visiting these
            let module = module.context("visiting SingleModuleGraphBuilderNode::Issues")?;

            let refs_cell = primary_chunkable_referenced_modules(*module);
            let refs = refs_cell.await?;
            // TODO This is currently too slow
            // let refs_issues = refs_cell
            //     .take_collectibles::<Box<dyn Issue>>()
            //     .iter()
            //     .map(|issue| issue.to_resolved())
            //     .try_join()
            // .await?;

            let edges = refs
                .iter()
                .flat_map(|(ty, modules)| {
                    if matches!(ty, ChunkingType::Traced) {
                        None
                    } else {
                        Some(modules.iter())
                    }
                })
                .flatten()
                .map(|m| async move {
                    Ok(SingleModuleGraphBuilderEdge {
                        to: SingleModuleGraphBuilderNode::new(*m).await?,
                    })
                })
                .try_join()
                .await?;
            // if !refs_issues.is_empty() {
            //     x.push(SingleModuleGraphBuilderEdge {
            //         to: SingleModuleGraphBuilderNode::Issues(refs_issues),
            //     });
            // }
            Ok(edges)
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
        }
    }
}

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
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
                    to: SingleModuleGraphBuilderNode::new(*e).await?,
                })
            })
            .try_join()
            .await?;
        let children_modules_iter = AdjacencyMap::new()
            .skip_duplicates_with_visited_nodes(VisitedNodes(
                visited_modules
                    .iter()
                    .map(|&module| SingleModuleGraphBuilderNode::new(module))
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
            let _span = tracing::info_span!("build petgraph").entered();
            for (parent, current) in children_modules_iter.into_breadth_first_edges() {
                let parent_idx =
                    parent.map(|parent| *modules.get(&parent.module().unwrap()).unwrap());

                match current {
                    SingleModuleGraphBuilderNode::Module {
                        module,
                        layer,
                        ident: _,
                    } => {
                        if let Some(idx) = modules.get(&module) {
                            if let Some(parent_idx) = parent_idx {
                                graph.add_edge(parent_idx, *idx, ());
                            }
                        } else {
                            let idx = graph.add_node(SingleModuleGraphNode {
                                module,
                                issues: Default::default(),
                                layer,
                            });
                            modules.insert(module, idx);
                            if let Some(parent_idx) = parent_idx {
                                graph.add_edge(parent_idx, idx, ());
                            }
                        }
                    }
                    SingleModuleGraphBuilderNode::Issues(issues) => {
                        let parent_idx = parent_idx.unwrap();
                        graph
                            .node_weight_mut(parent_idx)
                            .unwrap()
                            .issues
                            .extend(issues)
                    }
                }
            }
        }

        let root_idx = root.and_then(|root| {
            if !modules.contains_key(&root) {
                let root_idx = graph.add_node(SingleModuleGraphNode {
                    module: root,
                    issues: Default::default(),
                    layer: None,
                });
                for entry in entries {
                    graph.add_edge(root_idx, *modules.get(entry).unwrap(), ());
                }
                Some((root, root_idx))
            } else {
                None
            }
        });

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
    /// This means that target nodes can be revisited (but not recursively).
    ///
    /// Edges are traversed in reverse order, so recently added edges are added last.
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
                for succ in graph.neighbors(node).collect::<Vec<_>>().into_iter().rev() {
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

    let graph = SingleModuleGraph::new_with_entries_visited(
        *entry,
        server_utils.iter().map(|m| **m).collect(),
        Vc::cell(Default::default()),
    )
    .to_resolved()
    .await?;
    let mut visited_modules: HashSet<_> = graph
        .await?
        .graph
        .node_weights()
        .map(|n| n.module)
        .collect();

    let mut graphs = vec![graph];
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
        visited_modules.extend(graph.await?.graph.node_weights().map(|n| n.module));
        graphs.push(graph);
    }
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

#[turbo_tasks::function]
async fn get_module_graph_for_app_without_issues(
    entries: Vc<Modules>,
) -> Result<Vc<SingleModuleGraph>> {
    let vc = SingleModuleGraph::new_with_entries(entries);
    let graph = vc.resolve_strongly_consistent().await?;
    let _issues = vc.take_collectibles::<Box<dyn Issue>>();
    // println!(
    //     "taking {:?}",
    //     _issues.iter().map(|i| i.dbg()).try_join().await?
    // );
    Ok(graph)
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
                    if let Some(node_data) = data.get(&node.module) {
                        result.insert(node.module, node_data.clone());
                    }
                })?;
                Ok(Vc::cell(result))
            }
        }
        .instrument(span)
        .await
    }
}

/// The consumers of this shoudln't need to care about the exact contents since it's abstracted away
/// by the accessor functions, but
/// - In dev, contains information about the modules of the current endpoint only
/// - In prod, there is a single `ReducedGraphs` for the whole app, containing all pages
#[turbo_tasks::value]
pub struct ReducedGraphs {
    next_dynamic: Vec<ResolvedVc<NextDynamicGraph>>,
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
                    get_module_graph_for_app_without_issues(project.get_all_entries())
                        .to_resolved()
                        .await
                }
                .instrument(tracing::info_span!("module graph for app"))
                .await?,
            ],
        ),
    };

    let next_dynamic = async move {
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

    Ok(ReducedGraphs { next_dynamic }.cell())
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
