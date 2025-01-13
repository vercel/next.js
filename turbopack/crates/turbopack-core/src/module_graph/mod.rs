use std::{
    collections::{HashMap, HashSet},
    future::Future,
    ops::Deref,
};

use anyhow::{Context, Result};
use petgraph::{
    graph::{DiGraph, EdgeIndex, NodeIndex},
    visit::{Dfs, VisitMap, Visitable},
};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow, VisitedNodes},
    trace::{TraceRawVcs, TraceRawVcsContext},
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
};

use crate::{
    chunk::ChunkingType,
    issue::{Issue, IssueExt},
    module::{Module, Modules},
    reference::primary_chunkable_referenced_modules,
};

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct ModuleSet(pub HashSet<ResolvedVc<Box<dyn Module>>>);

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
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
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `visitor` - Called before visiting the children of a node.
    ///    - Receives (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    pub fn traverse_edges_from_entry<'a>(
        &'a self,
        entry: ResolvedVc<Box<dyn Module>>,
        mut visitor: impl FnMut(
            Option<(&'a SingleModuleGraphNode, &'a ChunkingType)>,
            &'a SingleModuleGraphNode,
        ) -> GraphTraversalAction,
    ) -> Result<()> {
        let graph = &self.graph;
        let entry_node = self.get_entry(entry)?;

        let mut stack = vec![entry_node];
        let mut discovered = graph.visit_map();
        let entry_weight = graph.node_weight(entry_node).unwrap();
        entry_weight.emit_issues();
        visitor(None, entry_weight);

        while let Some(node) = stack.pop() {
            let node_weight = graph.node_weight(node).unwrap();
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
                    let succ_weight = graph.node_weight(succ).unwrap();
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
    pub fn traverse_edges_from_entry_topological<'a, S>(
        &'a self,
        entry: ResolvedVc<Box<dyn Module>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'a SingleModuleGraphNode, &'a ChunkingType)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ) -> GraphTraversalAction,
        mut visit_postorder: impl FnMut(
            Option<(&'a SingleModuleGraphNode, &'a ChunkingType)>,
            &'a SingleModuleGraphNode,
            &mut S,
        ),
    ) -> Result<()> {
        let graph = &self.graph;
        let entry_node = self.get_entry(entry)?;

        enum ReverseTopologicalPass {
            Visit,
            ExpandAndVisit,
        }

        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            ReverseTopologicalPass,
            Option<(NodeIndex, EdgeIndex)>,
            NodeIndex,
        )> = vec![(ReverseTopologicalPass::ExpandAndVisit, None, entry_node)];
        let mut expanded = HashSet::new();
        while let Some((pass, parent, current)) = stack.pop() {
            match pass {
                ReverseTopologicalPass::Visit => {
                    visit_postorder(
                        parent.map(|parent| {
                            (
                                graph.node_weight(parent.0).unwrap(),
                                graph.edge_weight(parent.1).unwrap(),
                            )
                        }),
                        graph.node_weight(current).unwrap(),
                        state,
                    );
                }
                ReverseTopologicalPass::ExpandAndVisit => {
                    let action = visit_preorder(
                        parent.map(|parent| {
                            (
                                graph.node_weight(parent.0).unwrap(),
                                graph.edge_weight(parent.1).unwrap(),
                            )
                        }),
                        graph.node_weight(current).unwrap(),
                        state,
                    );
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

        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl SingleModuleGraph {
    #[turbo_tasks::function]
    pub async fn new_with_entries(entries: Vc<Modules>) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(None, &*entries.await?, &Default::default()).await
    }

    /// `root` is connected to the entries and include in `self.entries`.
    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        root: ResolvedVc<Box<dyn Module>>,
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
        visited_modules: Vc<ModuleSet>,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(Some(root), &entries, &*visited_modules.await?).await
    }
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
const COMMON_CHUNKING_TYPE: ChunkingType = ChunkingType::ParallelInheritAsync;

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

fn iter_neighbors<N, E>(
    graph: &DiGraph<N, E>,
    node: NodeIndex,
) -> impl Iterator<Item = (EdgeIndex, NodeIndex)> + '_ {
    let mut walker = graph.neighbors(node).detach();
    std::iter::from_fn(move || walker.next(graph))
}
