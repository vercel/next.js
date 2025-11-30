use core::panic;
use std::{
    collections::{BinaryHeap, VecDeque, hash_map::Entry},
    future::Future,
};

use anyhow::{Context, Result, bail};
use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use petgraph::{
    Direction,
    graph::{DiGraph, EdgeIndex, NodeIndex},
    visit::{EdgeRef, IntoNeighbors, IntoNodeReferences, NodeIndexable, Reversed},
};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::{Instrument, Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt,
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
        binding_usage_info::BindingUsageInfo,
        chunk_group_info::{ChunkGroupEntry, ChunkGroupInfo, compute_chunk_group_info},
        merged_modules::{MergedModuleInfo, compute_merged_modules},
        module_batches::{ModuleBatchesGraph, compute_module_batches},
        style_groups::{StyleGroups, StyleGroupsConfig, compute_style_groups},
        traced_di_graph::TracedDiGraph,
    },
    reference::{ModuleReference, primary_chunkable_referenced_modules},
    resolve::BindingUsage,
};

pub mod async_module_info;
pub mod binding_usage_info;
pub mod chunk_group_info;
pub mod merged_modules;
pub mod module_batch;
pub(crate) mod module_batches;
mod side_effect_module_info;
pub(crate) mod style_groups;
mod traced_di_graph;

pub use self::module_batches::BatchingConfig;

#[derive(
    Debug,
    Copy,
    Clone,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    Encode,
    Decode,
)]
pub struct GraphNodeIndex {
    #[turbo_tasks(trace_ignore)]
    graph_idx: u32,
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    node_idx: NodeIndex,
}
impl GraphNodeIndex {
    fn new(graph_idx: u32, node_idx: NodeIndex) -> Self {
        Self {
            graph_idx,
            node_idx,
        }
    }
}

unsafe impl NonLocalValue for GraphNodeIndex {}

#[derive(
    Debug,
    Copy,
    Clone,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    PartialEq,
    TraceRawVcs,
    NonLocalValue,
    Encode,
    Decode,
)]
pub struct GraphEdgeIndex {
    graph_idx: u32,
    #[turbo_tasks(trace_ignore)]
    #[bincode(with_serde)]
    edge_idx: EdgeIndex,
}

impl GraphEdgeIndex {
    fn new(graph_idx: u32, edge_idx: EdgeIndex) -> Self {
        Self {
            graph_idx,
            edge_idx,
        }
    }
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct VisitedModules {
    #[bincode(with = "turbo_bincode::indexmap")]
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
                    SingleModuleGraphNode::Module(module) => Some((
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
                        SingleModuleGraphNode::Module(module) => Some((
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

#[turbo_tasks::value(cell = "new", eq = "manual")]
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
    #[bincode(with_serde)]
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
    pub binding_usage: BindingUsage,
    pub reference: ResolvedVc<Box<dyn ModuleReference>>,
}

impl SingleModuleGraph {
    /// Walks the graph starting from the given entries and collects all reachable nodes, skipping
    /// nodes listed in `visited_modules`
    /// The resulting graph's outgoing edges are in reverse order.
    async fn new_inner(
        entries: &GraphEntriesT,
        visited_modules: &FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Result<Vc<Self>> {
        let emit_spans = tracing::enabled!(Level::INFO);
        let root_nodes = entries
            .iter()
            .flat_map(|e| e.entries())
            .map(|e| SingleModuleGraphBuilderNode::new_module(emit_spans, e))
            .try_join()
            .await?;

        let children_nodes_iter = AdjacencyMap::new()
            .visit(
                root_nodes,
                SingleModuleGraphBuilder {
                    visited_modules,
                    emit_spans,
                    include_traced,
                    include_binding_usage,
                },
            )
            .await
            .completed()?;
        let node_count = children_nodes_iter.len();

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
            for (parent, current) in children_nodes_iter.into_breadth_first_edges() {
                let (module, graph_node, count) = match current {
                    SingleModuleGraphBuilderNode::Module { module, ident: _ } => {
                        (module, SingleModuleGraphNode::Module(module), 1)
                    }
                    SingleModuleGraphBuilderNode::VisitedModule { module, idx } => (
                        module,
                        SingleModuleGraphNode::VisitedModule { idx, module },
                        0,
                    ),
                };

                // Find the current node, if it was already added
                let current_idx = if let Some(current_idx) = modules.get(&module) {
                    *current_idx
                } else {
                    let idx = graph.add_node(graph_node);
                    number_of_modules += count;
                    modules.insert(module, idx);
                    idx
                };
                // Add the edge
                if let Some((SingleModuleGraphBuilderNode::Module { module, .. }, ref_data)) =
                    parent
                {
                    let parent_idx = *modules.get(&module).unwrap();
                    graph.add_edge(parent_idx, current_idx, ref_data);
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

    /// Iterate over all nodes in the graph
    pub fn iter_nodes(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + '_ {
        self.graph.node_weights().filter_map(|n| match n {
            SingleModuleGraphNode::Module(node) => Some(*node),
            SingleModuleGraphNode::VisitedModule { .. } => None,
        })
    }

    /// Returns true if the given module is in this graph and is an entry module
    pub fn has_entry_module(&self, module: ResolvedVc<Box<dyn Module>>) -> bool {
        if let Some(index) = self.modules.get(&module) {
            self.graph
                .edges_directed(*index, Direction::Incoming)
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

    fn traverse_cycles<'l>(
        &'l self,
        edge_filter: impl Fn(&'l RefData) -> bool,
        mut visit_cycle: impl FnMut(&[&'l ResolvedVc<Box<dyn Module>>]) -> Result<()>,
        graph_idx: u32,
        binding_usage: &'l Option<ReadRef<BindingUsageInfo>>,
    ) -> Result<()> {
        // See https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm, but
        // implemented iteratively instead of recursively.
        //
        // Compared to the standard Tarjan's, this also treated self-references (via
        // `has_self_loop`) as SCCs.

        #[derive(Clone)]
        struct NodeState {
            index: u32,
            lowlink: u32,
            on_stack: bool,
            has_self_loop: bool,
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
                            has_self_loop: false,
                        });
                        index += 1;
                        stack.push(node);
                        visit_stack.push(VisitStep::AfterVisit(node));
                        let mut neighbors = self.graph.neighbors(node).detach();
                        while let Some((edge, succ)) = neighbors.next(&self.graph) {
                            if binding_usage.as_ref().is_some_and(|binding_usage| {
                                binding_usage
                                    .is_reference_unused_edge(&GraphEdgeIndex::new(graph_idx, edge))
                            }) {
                                continue;
                            }

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
                                    if succ == node {
                                        parent_state.has_self_loop = true;
                                    }
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
                        let node_has_self_loop = node_state.has_self_loop;
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
                            if scc.len() > 1 || node_has_self_loop {
                                visit_cycle(&scc)?;
                            }
                            scc.clear();
                        }
                    }
                }
            }
        }
        Ok(())
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

    pub binding_usage: Option<ResolvedVc<BindingUsageInfo>>,
}

#[turbo_tasks::value_impl]
impl ModuleGraph {
    #[turbo_tasks::function]
    pub fn from_graphs(graphs: Vec<ResolvedVc<SingleModuleGraph>>) -> Vc<Self> {
        Self {
            graphs,
            binding_usage: None,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn from_single_graph(graph: ResolvedVc<SingleModuleGraph>) -> Vc<Self> {
        Self {
            graphs: vec![graph],
            binding_usage: None,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn from_entry_module(
        module: ResolvedVc<Box<dyn Module>>,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(
            Vc::cell(vec![ChunkGroupEntry::Entry(vec![module])]),
            include_traced,
            include_binding_usage,
        ))
    }

    #[turbo_tasks::function]
    pub fn from_modules(
        modules: Vc<GraphEntries>,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Vc<Self> {
        Self::from_single_graph(SingleModuleGraph::new_with_entries(
            modules,
            include_traced,
            include_binding_usage,
        ))
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
        let async_modules_info = self.async_module_info().await?;

        let entry = graph_ref.get_entry(module)?;
        let referenced_modules = graph_ref
            .iter_graphs_neighbors_rev(entry, Direction::Outgoing)
            .filter(|(edge_idx, _)| {
                let ty = graph_ref.get_edge(*edge_idx).unwrap();
                ty.chunking_type.is_inherit_async()
            })
            .map(|(_, child_idx)| anyhow::Ok(graph_ref.get_node(child_idx)?.module()))
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .rev()
            .filter(|m| async_modules_info.contains(m))
            .map(|m| *m)
            .collect();

        Ok(AsyncModuleInfo::new(referenced_modules))
    }

    /// Analyze the module graph and remove unused references (by determining the used exports and
    /// removing unused imports).
    ///
    /// In particular, this removes ChunkableModuleReference-s that list only unused exports in the
    /// `import_usage()`
    #[turbo_tasks::function]
    pub async fn without_unused_references(
        self: ResolvedVc<Self>,
        binding_usage: ResolvedVc<BindingUsageInfo>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            graphs: self.await?.graphs.clone(),
            binding_usage: Some(binding_usage),
        }
        .cell())
    }
}

impl ModuleGraph {
    /// Reads the ModuleGraph into a ModuleGraphRef, awaiting all underlying graphs.
    pub async fn read_graphs(self: Vc<ModuleGraph>) -> Result<ModuleGraphRef> {
        let this = self.await?;
        Ok(ModuleGraphRef {
            graphs: this.graphs.iter().try_join().await?,
            skip_visited_module_children: false,
            graph_idx_override: None,
            binding_usage: if let Some(binding_usage) = this.binding_usage {
                Some(binding_usage.await?)
            } else {
                None
            },
        })
    }

    /// Returns the underlying graphs as a list, to be used for individual graph traversals.
    pub fn iter_graphs(
        self: &ModuleGraph,
    ) -> impl Iterator<Item = SingleModuleGraphWithBindingUsage> {
        self.graphs
            .iter()
            .enumerate()
            .map(|(graph_idx, graph)| SingleModuleGraphWithBindingUsage {
                graph: *graph,
                graph_idx: graph_idx as u32,
                binding_usage: self.binding_usage,
            })
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, Hash, TaskInput, TraceRawVcs, NonLocalValue, Encode, Decode,
)]
pub struct SingleModuleGraphWithBindingUsage {
    pub graph: ResolvedVc<SingleModuleGraph>,
    pub graph_idx: u32,
    pub binding_usage: Option<ResolvedVc<BindingUsageInfo>>,
}

impl SingleModuleGraphWithBindingUsage {
    pub async fn read(self: &SingleModuleGraphWithBindingUsage) -> Result<ModuleGraphRef> {
        Ok(ModuleGraphRef {
            graphs: vec![self.graph.await?],
            skip_visited_module_children: true,
            graph_idx_override: Some(self.graph_idx),
            binding_usage: if let Some(binding_usage) = &self.binding_usage {
                Some(binding_usage.await?)
            } else {
                None
            },
        })
    }
}

/// The ReadRef version of ModuleGraph. This is better for eventual consistency, as the graphs
/// aren't awaited multiple times within the same task.
pub struct ModuleGraphRef {
    pub graphs: Vec<ReadRef<SingleModuleGraph>>,
    // Whether to simply ignore SingleModuleGraphNode::VisitedModule during traversals. For single
    // module graph usecases, this is what you want. For the whole graph, there should be an error.
    skip_visited_module_children: bool,

    pub graph_idx_override: Option<u32>,

    pub binding_usage: Option<ReadRef<BindingUsageInfo>>,
}

impl ModuleGraphRef {
    fn get_entry(&self, entry: ResolvedVc<Box<dyn Module>>) -> Result<GraphNodeIndex> {
        if self.graph_idx_override.is_some() {
            debug_assert_eq!(self.graphs.len(), 1,);
        }

        let Some(idx) = self
            .graphs
            .iter()
            .enumerate()
            .find_map(|(graph_idx, graph)| {
                graph.modules.get(&entry).map(|node_idx| GraphNodeIndex {
                    graph_idx: self.graph_idx_override.unwrap_or(graph_idx as u32),
                    node_idx: *node_idx,
                })
            })
        else {
            bail!("Couldn't find entry module {entry:?} in module graph");
        };
        Ok(idx)
    }

    pub fn entries(&self) -> impl Iterator<Item = ChunkGroupEntry> + '_ {
        self.graphs.iter().flat_map(|g| g.entries.iter().cloned())
    }

    fn get_graph(&self, graph_idx: u32) -> &ReadRef<SingleModuleGraph> {
        if self.graph_idx_override.is_some() {
            self.graphs.first().unwrap()
        } else {
            &self.graphs[graph_idx as usize]
        }
    }

    fn get_node(&self, node: GraphNodeIndex) -> Result<&SingleModuleGraphNode> {
        let graph = self.get_graph(node.graph_idx);
        graph
            .graph
            .node_weight(node.node_idx)
            .context("Expected graph node")
    }

    fn get_edge(&self, edge: GraphEdgeIndex) -> Result<&RefData> {
        let graph = self.get_graph(edge.graph_idx);
        graph
            .graph
            .edge_weight(edge.edge_idx)
            .context("Expected graph node")
    }

    fn should_visit_node(&self, node: &SingleModuleGraphNode, direction: Direction) -> bool {
        if self.skip_visited_module_children && direction == Direction::Outgoing {
            !matches!(node, SingleModuleGraphNode::VisitedModule { .. })
        } else {
            true
        }
    }

    pub fn enumerate_nodes(
        &self,
    ) -> impl Iterator<Item = (NodeIndex, &'_ SingleModuleGraphNode)> + '_ {
        self.graphs.iter().flat_map(|g| g.enumerate_nodes())
    }

    /// Iterate the edges of a node REVERSED!
    fn iter_graphs_neighbors_rev<'a>(
        &'a self,
        node: GraphNodeIndex,
        direction: Direction,
    ) -> impl Iterator<Item = (GraphEdgeIndex, GraphNodeIndex)> + 'a {
        let graph = &*self.get_graph(node.graph_idx).graph;

        if cfg!(debug_assertions) && direction == Direction::Outgoing {
            let node_weight = graph.node_weight(node.node_idx).unwrap();
            if let SingleModuleGraphNode::VisitedModule { .. } = node_weight {
                panic!("iter_graphs_neighbors_rev called on VisitedModule node");
            }
        }

        let mut walker = graph.neighbors_directed(node.node_idx, direction).detach();
        std::iter::from_fn(move || {
            while let Some((edge_idx, succ_idx)) = walker.next(graph) {
                let edge_idx = GraphEdgeIndex::new(node.graph_idx, edge_idx);
                if self
                    .binding_usage
                    .as_ref()
                    .is_some_and(|binding_usage| binding_usage.is_reference_unused_edge(&edge_idx))
                {
                    // Don't just return None here, that would end the iterator
                    continue;
                }

                return Some((edge_idx, GraphNodeIndex::new(node.graph_idx, succ_idx)));
            }
            None
        })
    }

    /// Returns a map of all modules in the graphs to their identifiers.
    /// This is primarily useful for debugging.
    pub async fn get_ids(&self) -> Result<FxHashMap<ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>>> {
        Ok(self
            .graphs
            .iter()
            .flat_map(|g| g.iter_nodes())
            .map(async |n| Ok((n, n.ident().to_string().await?)))
            .try_join()
            .await?
            .into_iter()
            .collect::<FxHashMap<_, _>>())
    }

    /// Traverses all reachable nodes exactly once and calls the visitor.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `state` mutable state to be shared across the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives the module and the `state`
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting children of a node.
    pub fn traverse_nodes_dfs<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        visit_preorder: impl Fn(ResolvedVc<Box<dyn Module>>, &mut S) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(ResolvedVc<Box<dyn Module>>, &mut S) -> Result<()>,
    ) -> Result<()> {
        let entries = entries.into_iter().collect::<Vec<_>>();

        enum Pass {
            Visit,
            ExpandAndVisit,
        }
        let mut stack: Vec<(Pass, GraphNodeIndex)> = Vec::with_capacity(entries.len());
        for entry in entries.into_iter().rev() {
            stack.push((Pass::ExpandAndVisit, self.get_entry(entry)?));
        }
        let mut expanded = FxHashSet::default();
        while let Some((pass, current)) = stack.pop() {
            let current_node = self.get_node(current)?;
            match pass {
                Pass::Visit => {
                    visit_postorder(current_node.module(), state)?;
                }
                Pass::ExpandAndVisit => {
                    if !expanded.insert(current) {
                        continue;
                    }
                    let action = visit_preorder(current_node.module(), state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((Pass::Visit, current));
                    if action == GraphTraversalAction::Continue
                        && self.should_visit_node(current_node, Direction::Outgoing)
                    {
                        let current = current_node
                            .target_idx(Direction::Outgoing)
                            .unwrap_or(current);
                        stack.extend(
                            self.iter_graphs_neighbors_rev(current, Direction::Outgoing)
                                .map(|(_, child)| (Pass::ExpandAndVisit, child)),
                        );
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
    pub fn traverse_edges_bfs(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        mut visitor: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
        ) -> Result<GraphTraversalAction>,
    ) -> Result<()> {
        let mut queue = VecDeque::from(
            entries
                .into_iter()
                .map(|e| self.get_entry(e))
                .collect::<Result<Vec<_>>>()?,
        );
        let mut visited = FxHashSet::default();
        for entry_node in &queue {
            visitor(None, self.get_node(*entry_node)?.module())?;
        }
        while let Some(node) = queue.pop_front() {
            if visited.insert(node) {
                let node_weight = self.get_node(node)?;
                for (edge, succ) in self.iter_graphs_neighbors_rev(node, Direction::Outgoing) {
                    let succ_weight = self.get_node(succ)?;
                    let action = visitor(
                        Some((node_weight.module(), self.get_edge(edge)?)),
                        succ_weight.module(),
                    )?;
                    if !self.should_visit_node(succ_weight, Direction::Outgoing) {
                        continue;
                    }
                    let succ = succ_weight.target_idx(Direction::Outgoing).unwrap_or(succ);
                    if !visited.contains(&succ) && action == GraphTraversalAction::Continue {
                        queue.push_back(succ);
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
    pub fn traverse_edges_unordered(
        &self,
        mut visitor: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
        ) -> Result<()>,
    ) -> Result<()> {
        let entries = self.graphs.iter().flat_map(|g| g.entry_modules());

        // Despite the name we need to do a DFS to respect 'reachability' if an edge was trimmed we
        // should not follow it, and this is a reasonable way to do that.
        self.traverse_edges_dfs(
            entries,
            &mut (),
            |parent, target, _| {
                visitor(parent, target)?;
                Ok(GraphTraversalAction::Continue)
            },
            |_, _, _| Ok(()),
        )
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
    pub fn traverse_edges_dfs<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        visit_preorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        visit_postorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<()>,
    ) -> Result<()> {
        self.traverse_edges_dfs_impl::<S>(
            entries,
            state,
            visit_preorder,
            visit_postorder,
            Direction::Outgoing,
        )
    }

    /// Traverses all reachable edges in dfs order over the reversed graph. The preorder visitor can
    /// be used to forward state up the graph, and to skip subgraphs
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
    /// * `visit_postorder` - Called after visiting the parents of a node. Return
    ///    - Receives: (originating &SingleModuleGraphNode, edge &ChunkingType), target
    ///      &SingleModuleGraphNode, state &S
    pub fn traverse_edges_reverse_dfs<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        visit_preorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        visit_postorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<()>,
    ) -> Result<()> {
        self.traverse_edges_dfs_impl::<S>(
            entries,
            state,
            visit_preorder,
            visit_postorder,
            Direction::Incoming,
        )
    }

    fn traverse_edges_dfs_impl<S>(
        &self,
        entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<()>,
        direction: Direction,
    ) -> Result<()> {
        if direction == Direction::Incoming {
            debug_assert!(
                self.skip_visited_module_children,
                "Can only trace reverse edges in a single layer graph. We do not model cross \
                 graph reverse edges"
            );
        }
        let entries = entries.into_iter().collect::<Vec<_>>();

        enum Pass {
            Visit,
            ExpandAndVisit,
        }
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            Pass,
            Option<(GraphNodeIndex, GraphEdgeIndex)>,
            GraphNodeIndex,
        )> = Vec::with_capacity(entries.len());
        for entry in entries.into_iter().rev() {
            stack.push((Pass::ExpandAndVisit, None, self.get_entry(entry)?));
        }
        let mut expanded = FxHashSet::default();
        while let Some((pass, parent, current)) = stack.pop() {
            let parent_arg = match parent {
                Some((parent_node, parent_edge)) => Some((
                    self.get_node(parent_node)?.module(),
                    self.get_edge(parent_edge)?,
                )),
                None => None,
            };
            let current_node = self.get_node(current)?;
            match pass {
                Pass::Visit => {
                    visit_postorder(parent_arg, current_node.module(), state)?;
                }
                Pass::ExpandAndVisit => {
                    let action = visit_preorder(parent_arg, current_node.module(), state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((Pass::Visit, parent, current));
                    if action == GraphTraversalAction::Continue
                        && expanded.insert(current)
                        && self.should_visit_node(current_node, direction)
                    {
                        let current = current_node.target_idx(direction).unwrap_or(current);
                        stack.extend(self.iter_graphs_neighbors_rev(current, direction).map(
                            |(edge, child)| (Pass::ExpandAndVisit, Some((current, edge)), child),
                        ));
                    }
                }
            }
        }

        Ok(())
    }

    /// Traverse all cycles in the graph (where the edge filter returns true for the whole cycle)
    /// and call the visitor with the nodes in the cycle.
    /// Notably, module self-references are also treated as cycles.
    pub fn traverse_cycles(
        &self,
        edge_filter: impl Fn(&RefData) -> bool,
        mut visit_cycle: impl FnMut(&[&ResolvedVc<Box<dyn Module>>]) -> Result<()>,
    ) -> Result<()> {
        for (graph_idx, graph) in self.graphs.iter().enumerate() {
            graph.traverse_cycles(
                &edge_filter,
                &mut visit_cycle,
                graph_idx as u32,
                &self.binding_usage,
            )?;
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
            Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData, GraphEdgeIndex)>,
            ResolvedVc<Box<dyn Module>>,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        priority: impl Fn(ResolvedVc<Box<dyn Module>>, &mut S) -> Result<P>,
    ) -> Result<usize> {
        if self.skip_visited_module_children {
            panic!(
                "traverse_edges_fixed_point_with_priority musn't be called on individual graphs"
            );
        }

        let mut visit_order = 0usize;
        let mut order = || {
            let order = visit_order;
            visit_order += 1;
            order
        };
        #[derive(PartialEq, Eq)]
        struct NodeWithPriority<T: Ord> {
            node: GraphNodeIndex,
            priority: T,
            visit_order: usize,
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
                    // Use visit_order, so when there are ties we prioritize earlier discovered
                    // nodes, reverting to a BFS in the the case where all priorities are equal
                    .then(self.visit_order.cmp(&other.visit_order))
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
                        visit_order: order(),
                    })
                })
                .collect::<Result<Vec<_>>>()?,
        );

        for entry_node in &queue {
            visit(None, self.get_node(entry_node.node)?.module(), state)?;
        }

        let mut visit_count = 0usize;
        while let Some(NodeWithPriority { node, .. }) = queue.pop() {
            queue_set.remove(&node);
            let node_weight = self.get_node(node)?;
            let node = node_weight.target_idx(Direction::Outgoing).unwrap_or(node);

            visit_count += 1;

            for (edge, succ) in self.iter_graphs_neighbors_rev(node, Direction::Outgoing) {
                let succ_weight = self.get_node(succ)?;

                let action = visit(
                    Some((node_weight.module(), self.get_edge(edge)?, edge)),
                    succ_weight.module(),
                    state,
                )?;

                let succ = succ_weight.target_idx(Direction::Outgoing).unwrap_or(succ);
                if action == GraphTraversalAction::Continue && queue_set.insert(succ) {
                    queue.push(NodeWithPriority {
                        node: succ,
                        priority: priority(succ_weight.module(), state)?,
                        visit_order: order(),
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
        include_binding_usage: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(
            &*entries.await?,
            &Default::default(),
            include_traced,
            include_binding_usage,
        )
        .await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited(
        entries: Vc<GraphEntries>,
        visited_modules: Vc<VisitedModules>,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(
            &*entries.await?,
            &visited_modules.await?.modules,
            include_traced,
            include_binding_usage,
        )
        .await
    }

    #[turbo_tasks::function]
    pub async fn new_with_entries_visited_intern(
        // This must not be a Vc<Vec<_>> to ensure layout segment optimization hits the cache
        entries: GraphEntriesT,
        visited_modules: Vc<VisitedModules>,
        include_traced: bool,
        include_binding_usage: bool,
    ) -> Result<Vc<Self>> {
        SingleModuleGraph::new_inner(
            &entries,
            &visited_modules.await?.modules,
            include_traced,
            include_binding_usage,
        )
        .await
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum SingleModuleGraphNode {
    Module(ResolvedVc<Box<dyn Module>>),
    // Models a module that is referenced but has already been visited by an earlier graph.
    VisitedModule {
        idx: GraphNodeIndex,
        module: ResolvedVc<Box<dyn Module>>,
    },
}

impl SingleModuleGraphNode {
    pub fn module(&self) -> ResolvedVc<Box<dyn Module>> {
        match self {
            SingleModuleGraphNode::Module(module) => *module,
            SingleModuleGraphNode::VisitedModule { module, .. } => *module,
        }
    }
    pub fn target_idx(&self, direction: Direction) -> Option<GraphNodeIndex> {
        match self {
            SingleModuleGraphNode::VisitedModule { idx, .. } => match direction {
                Direction::Outgoing => Some(*idx),
                Direction::Incoming => None,
            },
            SingleModuleGraphNode::Module(_) => None,
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
    fn new_visited_module(module: ResolvedVc<Box<dyn Module>>, idx: GraphNodeIndex) -> Self {
        Self::VisitedModule { module, idx }
    }
}

struct SingleModuleGraphBuilder<'a> {
    visited_modules: &'a FxIndexMap<ResolvedVc<Box<dyn Module>>, GraphNodeIndex>,

    emit_spans: bool,

    /// Whether to walk ChunkingType::Traced references
    include_traced: bool,

    /// Whether to read ChunkableModuleReference::binding_usage()
    include_binding_usage: bool,
}
impl Visit<SingleModuleGraphBuilderNode, RefData> for SingleModuleGraphBuilder<'_> {
    type EdgesIntoIter = Vec<(SingleModuleGraphBuilderNode, RefData)>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(
        &mut self,
        node: &SingleModuleGraphBuilderNode,
        edge: Option<&RefData>,
    ) -> VisitControlFlow {
        if let Some(edge) = edge
            && matches!(edge.chunking_type, ChunkingType::Traced)
        {
            // The graph behind traced references is not part of the module graph traversal
            return VisitControlFlow::Skip;
        }
        match node {
            SingleModuleGraphBuilderNode::Module { .. } => VisitControlFlow::Continue,
            // Module was already visited previously
            SingleModuleGraphBuilderNode::VisitedModule { .. } => VisitControlFlow::Skip,
        }
    }

    fn edges(
        &mut self,
        // The `skip_duplicates_with_key()` above ensures only a single `edges()` call per module
        // (and not per `(module, export)` pair), so the export must not be read here!
        node: &SingleModuleGraphBuilderNode,
    ) -> Self::EdgesFuture {
        // Destructure beforehand to not have to clone the whole node when entering the async block
        let &SingleModuleGraphBuilderNode::Module { module, .. } = node else {
            // These are always skipped in `visit()`
            unreachable!()
        };
        let visited_modules = self.visited_modules;
        let emit_spans = self.emit_spans;
        let include_traced = self.include_traced;
        let include_binding_usage = self.include_binding_usage;
        async move {
            let refs_cell = primary_chunkable_referenced_modules(
                *module,
                include_traced,
                include_binding_usage,
            );
            let refs = match refs_cell.await {
                Ok(refs) => refs,
                Err(e) => {
                    return Err(e.context(module.ident().to_string().await?));
                }
            };

            refs.iter()
                .flat_map(|(reference, resolved)| {
                    resolved.modules.iter().map(|m| {
                        (
                            *reference,
                            resolved.chunking_type.clone(),
                            resolved.binding_usage.clone(),
                            *m,
                        )
                    })
                })
                .map(async |(reference, ty, binding_usage, target)| {
                    let to = if let Some(idx) = visited_modules.get(&target) {
                        SingleModuleGraphBuilderNode::new_visited_module(target, *idx)
                    } else {
                        SingleModuleGraphBuilderNode::new_module(emit_spans, target).await?
                    };
                    Ok((
                        to,
                        RefData {
                            chunking_type: ty,
                            binding_usage,
                            reference,
                        },
                    ))
                })
                .try_join()
                .await
        }
    }

    fn span(
        &mut self,
        node: &SingleModuleGraphBuilderNode,
        edge: Option<&RefData>,
    ) -> tracing::Span {
        if !self.emit_spans {
            return Span::none();
        }

        let mut span = match node {
            SingleModuleGraphBuilderNode::Module {
                ident: Some(ident), ..
            } => {
                tracing::info_span!("module", name = display(ident))
            }
            SingleModuleGraphBuilderNode::VisitedModule { .. } => {
                tracing::info_span!("visited module")
            }
            _ => unreachable!(),
        };

        if let Some(edge) = edge {
            match &edge.chunking_type {
                ChunkingType::Parallel {
                    inherit_async: _,
                    hoisted: _,
                } => {}
                ChunkingType::Traced => {
                    let _span = span.entered();
                    span = tracing::info_span!("traced reference");
                }
                ChunkingType::Async => {
                    let _span = span.entered();
                    span = tracing::info_span!("async reference");
                }
                ChunkingType::Isolated { _ty: ty, merge_tag } => {
                    let _span = span.entered();
                    span = tracing::info_span!(
                        "isolated reference",
                        ty = debug(&ty),
                        merge_tag = debug(&merge_tag)
                    );
                }
                ChunkingType::Shared {
                    inherit_async: _,
                    merge_tag,
                } => {
                    let _span = span.entered();
                    span = tracing::info_span!("shared reference", merge_tag = debug(&merge_tag));
                }
            };
        }

        span
    }
}

#[cfg(test)]
pub mod tests {
    use anyhow::Result;
    use rustc_hash::FxHashMap;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{FileSystem, FileSystemPath, VirtualFileSystem};

    use crate::{
        asset::{Asset, AssetContent},
        ident::AssetIdent,
        module::{Module, ModuleSideEffects},
        module_graph::{
            GraphEntries, GraphTraversalAction, ModuleGraph, ModuleGraphRef, SingleModuleGraph,
            VisitedModules, chunk_group_info::ChunkGroupEntry,
        },
        reference::{ModuleReference, ModuleReferences, SingleChunkableModuleReference},
        resolve::ExportUsage,
    };

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_traverse_dfs_from_entries_diamond() {
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

                graph.traverse_edges_dfs(
                    entry_modules,
                    &mut (),
                    |parent, target, _| {
                        preorder_visits.push((
                            parent.map(|(node, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
                        ));
                        Ok(GraphTraversalAction::Continue)
                    },
                    |parent, target, _| {
                        postorder_visits.push((
                            parent.map(|(node, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
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
    async fn test_traverse_dfs_from_entries_cycle() {
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

                graph.traverse_edges_dfs(
                    entry_modules,
                    &mut (),
                    |parent, target, _| {
                        preorder_visits.push((
                            parent.map(|(node, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
                        ));
                        Ok(GraphTraversalAction::Continue)
                    },
                    |parent, target, _| {
                        postorder_visits.push((
                            parent.map(|(node, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
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
    async fn test_traverse_edges_fixed_point_with_priority_cycle() {
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

                graph.traverse_edges_fixed_point_with_priority(
                    entry_modules.into_iter().map(|m| (m, 0)),
                    &mut (),
                    |parent, target, _| {
                        visits.push((
                            parent.map(|(node, _, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
                        ));
                        count += 1;

                        // We are a cycle so we need to break the loop eventually
                        Ok(if count < 6 {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Skip
                        })
                    },
                    |_, _| Ok(0),
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

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_traverse_edges_fixed_point_no_priority_is_bfs() {
        run_graph_test(
            vec![rcstr!("a.js")],
            {
                let mut deps = FxHashMap::default();
                // a simple triangle
                //        a
                //      b   c
                //   d    e    f
                deps.insert(rcstr!("a.js"), vec![rcstr!("b.js"), rcstr!("c.js")]);
                deps.insert(rcstr!("b.js"), vec![rcstr!("d.js"), rcstr!("e.js")]);
                deps.insert(rcstr!("c.js"), vec![rcstr!("e.js"), rcstr!("f.js")]);
                deps
            },
            |graph, entry_modules, module_to_name| {
                let mut visits = Vec::new();
                let mut count = 0;

                graph.traverse_edges_fixed_point_with_priority(
                    entry_modules.into_iter().map(|m| (m, 0)),
                    &mut (),
                    |parent, target, _| {
                        visits.push((
                            parent.map(|(node, _, _)| module_to_name.get(&node).unwrap().clone()),
                            module_to_name.get(&target).unwrap().clone(),
                        ));
                        count += 1;

                        // We are a cycle so we need to break the loop eventually
                        Ok(if count < 6 {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Skip
                        })
                    },
                    |_, _| Ok(0),
                )?;

                assert_eq!(
                    vec![
                        (None, rcstr!("a.js")),
                        (Some(rcstr!("a.js")), rcstr!("c.js")),
                        (Some(rcstr!("a.js")), rcstr!("b.js")),
                        (Some(rcstr!("b.js")), rcstr!("e.js")),
                        (Some(rcstr!("b.js")), rcstr!("d.js")),
                        (Some(rcstr!("c.js")), rcstr!("f.js")),
                        (Some(rcstr!("c.js")), rcstr!("e.js")),
                    ],
                    visits
                );

                Ok(())
            },
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_traverse_cycles() {
        run_graph_test(
            vec![rcstr!("a.js")],
            {
                let mut deps = FxHashMap::default();
                // The cycles are: (i, j, k), and (s) which a self-import
                //          a
                //      /   |    \
                //     /i   s-\   x
                //     |j   \-/
                //     \k
                deps.insert(
                    rcstr!("a.js"),
                    vec![rcstr!("i.js"), rcstr!("s.js"), rcstr!("x.js")],
                );
                deps.insert(rcstr!("i.js"), vec![rcstr!("j.js")]);
                deps.insert(rcstr!("j.js"), vec![rcstr!("k.js")]);
                deps.insert(rcstr!("k.js"), vec![rcstr!("i.js")]);
                deps.insert(rcstr!("s.js"), vec![rcstr!("s.js")]);
                deps
            },
            |graph, _, module_to_name| {
                let mut cycles = vec![];

                graph.traverse_cycles(
                    |_| true,
                    |cycle| {
                        cycles.push(
                            cycle
                                .iter()
                                .map(|n| module_to_name.get(*n).unwrap().clone())
                                .collect::<Vec<_>>(),
                        );
                        Ok(())
                    },
                )?;

                assert_eq!(
                    cycles,
                    vec![
                        vec![rcstr!("k.js"), rcstr!("j.js"), rcstr!("i.js")],
                        vec![rcstr!("s.js")]
                    ],
                );

                Ok(())
            },
        )
        .await;
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_reverse_edges_through_layered_graph() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let fs = VirtualFileSystem::new_with_name(rcstr!("test"));
            let root = fs.root().await?;

            // a simple linear graph a -> b ->c
            // but b->c is in a parent graph and a is in the child
            let graph = {
                let mut deps = FxHashMap::default();

                deps.insert(rcstr!("a.js"), vec![rcstr!("b.js"), rcstr!("d.js")]);
                deps.insert(rcstr!("b.js"), vec![rcstr!("c.js")]);
                deps
            };
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
            let make_module = |name| {
                Vc::upcast::<Box<dyn Module>>(MockModule::new(root.join(name).unwrap(), repo))
                    .to_resolved()
            };
            let a_module = make_module("a.js").await?;
            let b_module = make_module("b.js").await?;

            let parent_graph = SingleModuleGraph::new_with_entries(
                GraphEntries::cell(GraphEntries(vec![ChunkGroupEntry::Entry(vec![b_module])])),
                false,
                false,
            );

            let module_graph = ModuleGraph::from_graphs(vec![
                parent_graph,
                SingleModuleGraph::new_with_entries_visited(
                    GraphEntries::cell(GraphEntries(vec![ChunkGroupEntry::Entry(vec![a_module])])),
                    VisitedModules::from_graph(parent_graph),
                    false,
                    false,
                ),
            ])
            .await?;
            let child_graph = module_graph.iter_graphs().nth(1).unwrap().read().await?;
            // test traversing forward from a in the child graph
            {
                let mut visited_forward = Vec::new();
                child_graph.traverse_edges_dfs(
                    vec![a_module],
                    &mut (),
                    |_parent, child, _state_| {
                        visited_forward.push(child);
                        Ok(GraphTraversalAction::Continue)
                    },
                    |_, _, _| Ok(()),
                )?;

                assert_eq!(
                    visited_forward
                        .iter()
                        .map(|m| m.ident().to_string().owned())
                        .try_join()
                        .await?,
                    vec![
                        rcstr!("[test]/a.js"),
                        rcstr!("[test]/b.js"),
                        rcstr!("[test]/d.js")
                    ]
                );
            }

            // test traversing backwards from 'd' which is only in the child graph
            {
                use turbo_tasks::TryFlatJoinIterExt;
                let d_module = child_graph
                    .enumerate_nodes()
                    .map(|(_index, module)| async move {
                        Ok(match module {
                            crate::module_graph::SingleModuleGraphNode::Module(module) => {
                                if module.ident().to_string().owned().await.unwrap()
                                    == "[test]/d.js"
                                {
                                    Some(*module)
                                } else {
                                    None
                                }
                            }
                            crate::module_graph::SingleModuleGraphNode::VisitedModule {
                                ..
                            } => None,
                        })
                    })
                    .try_flat_join()
                    .await?
                    .into_iter()
                    .next()
                    .unwrap();
                let mut visited_reverse = Vec::new();
                child_graph.traverse_edges_reverse_dfs(
                    vec![d_module],
                    &mut (),
                    |_parent, child, _state_| {
                        visited_reverse.push(child);
                        Ok(GraphTraversalAction::Continue)
                    },
                    |_, _, _| Ok(()),
                )?;
                assert_eq!(
                    visited_reverse
                        .iter()
                        .map(|m| m.ident().to_string().owned())
                        .try_join()
                        .await?,
                    vec![rcstr!("[test]/d.js"), rcstr!("[test]/a.js")]
                );
            }
            // test traversing backwards from `b` which is in the parent graph and thus a
            // VisitedModule in this graph
            {
                let mut visited_reverse = Vec::new();
                child_graph.traverse_edges_reverse_dfs(
                    vec![b_module],
                    &mut (),
                    |_parent, child, _state_| {
                        visited_reverse.push(child);
                        Ok(GraphTraversalAction::Continue)
                    },
                    |_, _, _| Ok(()),
                )?;
                assert_eq!(
                    visited_reverse
                        .iter()
                        .map(|m| m.ident().to_string().owned())
                        .try_join()
                        .await?,
                    vec![rcstr!("[test]/b.js"), rcstr!("[test]/a.js")]
                );
            }

            Ok(())
        })
        .await
        .unwrap();
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
        fn source(&self) -> Vc<crate::source::OptionSource> {
            Vc::cell(None)
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
        #[turbo_tasks::function]
        fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
            ModuleSideEffects::SideEffectful.cell()
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
            ModuleGraphRef,
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
                false,
            );

            // Create a simple name mapping to make analyzing the visitors easier.
            // Technically they could always pull this name off of the
            // `module.ident().await?.path.path` themselves but you cannot `await` in visitors.
            let module_to_name = graph
                .await?
                .modules
                .keys()
                .map(|m| async move { Ok((*m, m.ident().await?.path.path.clone())) })
                .try_join()
                .await?
                .into_iter()
                .collect();
            test_fn(
                ModuleGraph::from_single_graph(graph).read_graphs().await?,
                entry_modules,
                module_to_name,
            )
        })
        .await
        .unwrap();
    }
}
