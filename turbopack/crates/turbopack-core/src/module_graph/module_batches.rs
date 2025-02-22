use anyhow::{bail, Result};
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt,
    ValueToString, Vc,
};

use crate::{
    chunk::{ChunkableModule, ChunkingType},
    module::Module,
    module_graph::{
        chunk_group_info::RoaringBitmapWrapper,
        module_batch::{ModuleBatch, ModuleOrBatch},
        traced_di_graph::{iter_neighbors_rev, TracedDiGraph},
        GraphTraversalAction, ModuleGraph,
    },
};

#[turbo_tasks::value]
#[derive(Debug, Clone, Default, TaskInput, Hash)]
pub struct BatchingConfig {
    /// Use a heuristic based on the module path to create batches. It aims for batches of a good
    /// size.
    pub use_heuristic: bool,
}

#[turbo_tasks::value_impl]
impl BatchingConfig {
    #[turbo_tasks::function]
    pub fn new(config: BatchingConfig) -> Vc<Self> {
        config.cell()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct ModuleBatchesGraphEdge {
    pub ty: ChunkingType,
    pub module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
pub struct ModuleBatchesGraph {
    graph: TracedDiGraph<ModuleOrBatch, ModuleBatchesGraphEdge>,

    // NodeIndex isn't necessarily stable (because of swap_remove), but we never remove nodes.
    //
    // HashMaps have nondeterministic order, but this map is only used for lookups and not
    // iteration.
    //
    // This contains Vcs, but they are already contained in the graph, so no need to trace this.
    #[turbo_tasks(trace_ignore)]
    entries: FxHashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
}

impl ModuleBatchesGraph {
    pub async fn get_entry_index(&self, entry: ResolvedVc<Box<dyn Module>>) -> Result<NodeIndex> {
        let Some(entry) = self.entries.get(&entry) else {
            bail!(
                "Entry {} is not in graph (possible entries: {:#?})",
                entry.ident().to_string().await?,
                self.entries
                    .keys()
                    .map(|e| e.ident().to_string())
                    .try_join()
                    .await?
            );
        };
        Ok(*entry)
    }

    pub async fn get_entry(&self, entry: ResolvedVc<Box<dyn Module>>) -> Result<ModuleOrBatch> {
        let entry = self.get_entry_index(entry).await?;
        Ok(*self.graph.node_weight(entry).unwrap())
    }

    // Clippy complains but there's a type error without the bound
    #[allow(clippy::implied_bounds_in_impls)]
    /// Traverses all reachable edges in topological order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs
    ///
    /// Use this to collect batches/modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge).
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entry` - The entry module to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &ModuleBatchesGraphNode, edge &ChunkingType), target
    ///      &ModuleBatchesGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &ModuleBatchesGraphNode, edge &ChunkingType), target
    ///      &ModuleBatchesGraphNode, state &S
    pub fn traverse_edges_from_entries_topological<'a, S>(
        &'a self,
        entries: impl IntoIterator<
            Item = NodeIndex,
            IntoIter = impl Iterator<Item = NodeIndex> + DoubleEndedIterator,
        >,
        state: &mut S,
        mut visit_preorder: impl FnMut(
            Option<(&'a ModuleOrBatch, &'a ModuleBatchesGraphEdge)>,
            &'a ModuleOrBatch,
            &mut S,
        ) -> Result<GraphTraversalAction>,
        mut visit_postorder: impl FnMut(
            Option<(&'a ModuleOrBatch, &'a ModuleBatchesGraphEdge)>,
            &'a ModuleOrBatch,
            &mut S,
        ),
    ) -> Result<()> {
        let graph = &self.graph;

        enum ReverseTopologicalPass {
            Visit,
            ExpandAndVisit,
        }

        let entries = entries.into_iter();
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(
            ReverseTopologicalPass,
            Option<(NodeIndex, EdgeIndex)>,
            NodeIndex,
        )> = entries
            .rev()
            .map(|e| (ReverseTopologicalPass::ExpandAndVisit, None, e))
            .collect();
        let mut expanded = FxHashSet::default();
        while let Some((pass, parent, current)) = stack.pop() {
            let parent_arg = parent.map(|(node, edge)| {
                (
                    graph.node_weight(node).unwrap(),
                    graph.edge_weight(edge).unwrap(),
                )
            });
            match pass {
                ReverseTopologicalPass::Visit => {
                    let current_node = graph.node_weight(current).unwrap();
                    visit_postorder(parent_arg, current_node, state);
                }
                ReverseTopologicalPass::ExpandAndVisit => {
                    let current_node = graph.node_weight(current).unwrap();
                    let action = visit_preorder(parent_arg, current_node, state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((ReverseTopologicalPass::Visit, parent, current));
                    if action == GraphTraversalAction::Continue && expanded.insert(current) {
                        stack.extend(iter_neighbors_rev(graph, current).map(|(edge, child)| {
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

enum ModuleBatchBuilder {
    Batch {
        modules: Vec<Vc<Box<dyn ChunkableModule>>>,
        chunk_groups: RoaringBitmapWrapper,
    },
    Module {
        module: ResolvedVc<Box<dyn Module>>,
    },
}

impl ModuleBatchBuilder {
    fn new_batch(chunk_groups: RoaringBitmapWrapper) -> Self {
        Self::Batch {
            modules: Vec::new(),
            chunk_groups,
        }
    }

    fn new_module(module: ResolvedVc<Box<dyn Module>>) -> Self {
        Self::Module { module }
    }

    async fn build(self) -> Result<ModuleOrBatch> {
        Ok(match self {
            Self::Batch {
                modules,
                chunk_groups,
            } => {
                if modules.len() == 1 {
                    ModuleOrBatch::Module(ResolvedVc::upcast(
                        modules.into_iter().next().unwrap().to_resolved().await?,
                    ))
                } else {
                    ModuleOrBatch::Batch(
                        ModuleBatch::new(modules, Some(chunk_groups))
                            .to_resolved()
                            .await?,
                    )
                }
            }
            Self::Module { module } => ModuleOrBatch::Module(module),
        })
    }
}

type BatchIndex = usize;

#[derive(Debug, Clone, Copy)]
struct BatchAssignment {
    batch_idx: BatchIndex,
    chunkable_module_for_adding: Option<Vc<Box<dyn ChunkableModule>>>,
    next_child_batch: Option<BatchIndex>,
}

impl BatchAssignment {
    fn new(batch_idx: BatchIndex, chunkable_module: Vc<Box<dyn ChunkableModule>>) -> Self {
        Self {
            batch_idx,
            chunkable_module_for_adding: Some(chunkable_module),
            next_child_batch: Some(batch_idx),
        }
    }

    fn new_already_added(batch_idx: BatchIndex) -> Self {
        Self {
            batch_idx,
            chunkable_module_for_adding: None,
            next_child_batch: None,
        }
    }
}

/// Edge between two batchces: (from, to, ty, module)
type BatchEdge = (
    BatchIndex,
    BatchIndex,
    ChunkingType,
    ResolvedVc<Box<dyn Module>>,
);

#[derive(Default)]
struct TraversalState {
    /// Finished batches, filled in postorder
    batches: Vec<ModuleBatchBuilder>,
    /// Assigment of modules to batches, assigned in preorder
    batch_assignments: FxHashMap<ResolvedVc<Box<dyn Module>>, BatchAssignment>,
    /// Edges between batches
    edges: FxIndexSet<BatchEdge>,
}

impl TraversalState {
    fn add_edge(
        &mut self,
        from: usize,
        to: usize,
        ty: ChunkingType,
        module: ResolvedVc<Box<dyn Module>>,
    ) {
        self.edges.insert((from, to, ty, module));
    }
}

pub async fn compute_module_batches(
    module_graph: Vc<ModuleGraph>,
    _config: &BatchingConfig,
) -> Result<Vc<ModuleBatchesGraph>> {
    let outer_span = tracing::info_span!(
        "compute module batches",
        batches = tracing::field::Empty,
        modules = tracing::field::Empty,
        edges = tracing::field::Empty
    );
    let span = outer_span.clone();
    async move {
        let mut state: TraversalState = TraversalState::default();
        let mut entries = Vec::new();

        // Find all chunk group entries and assign them to batches
        let chunk_group_info = module_graph.chunk_group_info().await?;
        for chunk_group in &chunk_group_info.chunk_groups {
            // Each entry need to be in a separate batch since we don't know the postorder of them.
            // The postorder might also be different depending on the parents.
            for entry in chunk_group.entries() {
                if state.batch_assignments.contains_key(&entry) {
                    // Already assigned
                    continue;
                }
                let Some(chunkable_module) = ResolvedVc::try_downcast(entry) else {
                    let idx = state.batches.len();
                    state.batches.push(ModuleBatchBuilder::new_module(entry));
                    state
                        .batch_assignments
                        .insert(entry, BatchAssignment::new_already_added(idx));
                    continue;
                };
                let entry_chunk_groups = chunk_group_info
                    .module_chunk_groups
                    .get(&entry)
                    .expect("all entries need to have chunk group info");
                let idx = state.batches.len();
                state
                    .batches
                    .push(ModuleBatchBuilder::new_batch(entry_chunk_groups.clone()));
                state
                    .batch_assignments
                    .insert(entry, BatchAssignment::new(idx, *chunkable_module));
                entries.push((entry, idx));
            }
        }

        // Traverse the module graph and assign all modules to batches based on the parent batch.
        // When the chunk groups bitmap change on an edge, a new batch is created.
        // Module order in batches must be postorder.
        module_graph
            .await?
            .traverse_edges_from_entries_topological(
                entries.iter().map(|&(module, _)| module),
                &mut state,
                |parent_info, node, state| {
                    if let Some((parent_node, ty)) = parent_info {
                        if parent_node.module == node.module {
                            let Some(assignment) = state.batch_assignments.get(&node.module) else {
                                unreachable!();
                            };
                            if !matches!(
                                ty,
                                ChunkingType::Parallel | ChunkingType::ParallelInheritAsync
                            ) {
                                // Add self edge
                                state.add_edge(
                                    assignment.batch_idx,
                                    assignment.batch_idx,
                                    ty.clone(),
                                    node.module,
                                );
                            }
                            return Ok(GraphTraversalAction::Exclude);
                        }
                        // Get batch assignments for parent and current node
                        // Safety: We checked if they are equal above.
                        let [parent_assignment, current_assignment] = unsafe {
                            state
                                .batch_assignments
                                .get_disjoint_unchecked_mut([&parent_node.module, &node.module])
                        };
                        // The parent was already visited, so it has a batch assigned
                        let Some(&mut BatchAssignment {
                            batch_idx,
                            ref mut next_child_batch,
                            ..
                        }) = parent_assignment
                        else {
                            unreachable!();
                        };
                        if let Some(&mut BatchAssignment { batch_idx: idx, .. }) =
                            current_assignment
                        {
                            // Already assigned and processed, but we still need to add an edge
                            if batch_idx != idx {
                                state.add_edge(batch_idx, idx, ty.clone(), node.module);
                            }
                            return Ok(GraphTraversalAction::Exclude);
                        }
                        let is_parallel = match ty {
                            ChunkingType::Traced => {
                                // Traced module are alone in a batch
                                let idx = state.batches.len();
                                state
                                    .batches
                                    .push(ModuleBatchBuilder::new_module(node.module));
                                state
                                    .batch_assignments
                                    .insert(node.module, BatchAssignment::new_already_added(idx));
                                state.add_edge(batch_idx, idx, ty.clone(), node.module);
                                return Ok(GraphTraversalAction::Exclude);
                            }
                            ChunkingType::Async
                            | ChunkingType::Isolated { .. }
                            | ChunkingType::Shared { .. } => false,
                            ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => true,
                        };
                        let mut in_same_batch = is_parallel;

                        // Get the chunk groups of the module
                        let chunk_groups = chunk_group_info
                            .module_chunk_groups
                            .get(&node.module)
                            .expect("all modules need to have chunk group info");

                        if in_same_batch {
                            // Get the chunk groups of the parent batch
                            let ModuleBatchBuilder::Batch {
                                chunk_groups: batch_chunk_groups,
                                ..
                            } = &mut state.batches[batch_idx]
                            else {
                                unreachable!();
                            };

                            // When chunk groups are different, we want to create a new batch since
                            // this is shared with other chunk groups.
                            in_same_batch = chunk_groups == batch_chunk_groups;
                        }

                        if let Some(chunkable_module) = ResolvedVc::try_downcast(node.module) {
                            if in_same_batch {
                                // Place it in the same batch (if not split)
                                if next_child_batch.is_none() {
                                    // Create a new batch
                                    let idx = state.batches.len();
                                    state
                                        .batches
                                        .push(ModuleBatchBuilder::new_batch(chunk_groups.clone()));
                                    *next_child_batch = Some(idx);
                                }
                                let idx = next_child_batch.unwrap();
                                state.batch_assignments.insert(
                                    node.module,
                                    BatchAssignment::new(idx, *chunkable_module),
                                );

                                // Add an edge to the parent batch
                                if batch_idx != idx {
                                    state.add_edge(batch_idx, idx, ty.clone(), node.module);
                                }
                            } else {
                                // Since we create a new batch here, further children need to be in
                                // a new batch too to avoid breaking
                                // the ordering:
                                *next_child_batch = None;

                                // Assign the module to a new batch
                                let idx = state.batches.len();
                                state
                                    .batches
                                    .push(ModuleBatchBuilder::new_batch(chunk_groups.clone()));
                                state.batch_assignments.insert(
                                    node.module,
                                    BatchAssignment::new(idx, *chunkable_module),
                                );

                                // Add an edge to the parent batch
                                state.add_edge(batch_idx, idx, ty.clone(), node.module);
                            }
                        } else {
                            // Since we create a new batch here, further children need to be in
                            // a new batch too to avoid breaking
                            // the ordering:
                            *next_child_batch = None;

                            let idx = state.batches.len();
                            state
                                .batches
                                .push(ModuleBatchBuilder::new_module(node.module));
                            state
                                .batch_assignments
                                .insert(node.module, BatchAssignment::new_already_added(idx));

                            // Add an edge to the parent batch
                            state.add_edge(batch_idx, idx, ty.clone(), node.module);
                        }
                        if !is_parallel {
                            // We don't want to visit that in this pass. It's already in `entries`.
                            return Ok(GraphTraversalAction::Exclude);
                        }
                    }
                    Ok(GraphTraversalAction::Continue)
                },
                |_, node, state| {
                    let BatchAssignment {
                        batch_idx,
                        chunkable_module_for_adding,
                        ..
                    } = state.batch_assignments.get_mut(&node.module).unwrap();
                    if let Some(chunkable_module) = chunkable_module_for_adding.take() {
                        // modules need to be inserted in postorder into the batch
                        let ModuleBatchBuilder::Batch { modules, .. } =
                            &mut state.batches[*batch_idx]
                        else {
                            unreachable!();
                        };
                        modules.push(chunkable_module);
                    }
                },
            )
            .await?;

        let batches_len = state.batches.len();
        let mut result_modules = 0;

        // Create a petgraph from the collected data
        let mut graph: DiGraph<ModuleOrBatch, ModuleBatchesGraphEdge, u32> =
            petgraph::graph::DiGraph::with_capacity(state.batches.len(), state.edges.len());

        // Add nodes and store node index
        let batch_indicies = state
            .batches
            .into_iter()
            .map(|batch| batch.build())
            .try_join()
            .await?
            .into_iter()
            .map(|batch| {
                if matches!(batch, ModuleOrBatch::Module(_)) {
                    result_modules += 1;
                }
                graph.add_node(batch)
            })
            .collect::<Vec<_>>();

        let entries = entries
            .into_iter()
            .map(|(module, idx)| (module, batch_indicies[idx]))
            .collect::<FxHashMap<_, _>>();

        span.record("batches", batches_len - result_modules);
        span.record("modules", result_modules);
        span.record("edges", state.edges.len());

        // Add edges
        graph.reserve_edges(state.edges.len());
        for (from, to, ty, module) in state.edges {
            graph.add_edge(
                batch_indicies[from],
                batch_indicies[to],
                ModuleBatchesGraphEdge { ty, module },
            );
        }

        Ok(ModuleBatchesGraph {
            graph: TracedDiGraph(graph),
            entries,
        }
        .cell())
    }
    .instrument(outer_span)
    .await
}
