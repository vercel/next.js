use std::mem::{replace, take};

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

enum ModuleBatchBuilderType {
    Batch {
        modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
        chunk_groups: RoaringBitmapWrapper,
    },
    Module {
        module: ResolvedVc<Box<dyn Module>>,
    },
}

struct ModuleBatchBuilder {
    ty: ModuleBatchBuilderType,
    edges: FxIndexSet<BatchEdge>,
}

impl ModuleBatchBuilder {
    fn new_batch(chunk_groups: RoaringBitmapWrapper) -> Self {
        Self {
            ty: ModuleBatchBuilderType::Batch {
                modules: Vec::new(),
                chunk_groups,
            },
            edges: FxIndexSet::default(),
        }
    }

    fn new_module(module: ResolvedVc<Box<dyn Module>>) -> Self {
        Self {
            ty: ModuleBatchBuilderType::Module { module },
            edges: FxIndexSet::default(),
        }
    }

    async fn build(self) -> Result<(ModuleOrBatch, FxIndexSet<BatchEdge>)> {
        let Self { ty, edges } = self;
        let batch = match ty {
            ModuleBatchBuilderType::Batch {
                modules,
                chunk_groups,
            } => {
                if modules.len() == 1 {
                    ModuleOrBatch::Module(ResolvedVc::upcast(modules.into_iter().next().unwrap()))
                } else {
                    ModuleOrBatch::Batch(
                        ModuleBatch::new(ResolvedVc::deref_vec(modules), Some(chunk_groups))
                            .to_resolved()
                            .await?,
                    )
                }
            }
            ModuleBatchBuilderType::Module { module } => ModuleOrBatch::Module(module),
        };
        Ok((batch, edges))
    }

    fn add_edge(&mut self, to: BatchIndex, ty: ChunkingType, module: ResolvedVc<Box<dyn Module>>) {
        self.edges.insert((to, ty, module));
    }
}

type BatchIndex = usize;

#[derive(Debug, Clone)]
struct PostorderAction {
    chunkable_module: ResolvedVc<Box<dyn ChunkableModule>>,
}

#[derive(Debug, Clone)]
struct BatchAssignment {
    batch_idx: BatchIndex,
    postorder_action: Option<PostorderAction>,
}

impl BatchAssignment {
    fn new(batch_idx: BatchIndex, chunkable_module: ResolvedVc<Box<dyn ChunkableModule>>) -> Self {
        Self {
            batch_idx,
            postorder_action: Some(PostorderAction { chunkable_module }),
        }
    }

    fn new_already_added(batch_idx: BatchIndex) -> Self {
        Self {
            batch_idx,
            postorder_action: None,
        }
    }
}

/// Edge between two batchces: (to, ty, module)
type BatchEdge = (BatchIndex, ChunkingType, ResolvedVc<Box<dyn Module>>);

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
    fn split_batch(&mut self, parent_module: ResolvedVc<Box<dyn Module>>) {
        let Some(assignment) = self.batch_assignments.get_mut(&parent_module) else {
            unreachable!();
        };
        let batch_idx = assignment.batch_idx;
        // We move all already added modules into a new batch.
        if let ModuleBatchBuilderType::Batch {
            modules,
            chunk_groups,
            ..
        } = &self.batches[batch_idx].ty
        {
            // We only need to do that if the batch is not empty.
            if !modules.is_empty() {
                let idx = self.batches.len();
                let first_module = modules[0];
                for &module in modules {
                    let BatchAssignment { batch_idx, .. } = self
                        .batch_assignments
                        .get_mut(&ResolvedVc::upcast(module))
                        .unwrap();
                    *batch_idx = idx;
                }
                let mut new_batch = ModuleBatchBuilder::new_batch(chunk_groups.clone());
                new_batch.add_edge(
                    idx,
                    ChunkingType::ParallelInheritAsync,
                    ResolvedVc::upcast(first_module),
                );
                let existing_batch = replace(&mut self.batches[batch_idx], new_batch);
                self.batches.push(existing_batch);
                // All modules that are assigned to the current batch that have
                // not been visited in postorder do point to the `new_batch`
                // now. And we point from the `new_batch` to `existing_batch`.
            }
        }
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

        let chunk_group_info = module_graph.chunk_group_info().await?;
        let module_graph = module_graph.await?;

        // Find all chunk group entries and assign them to batches
        for (i, chunk_group) in chunk_group_info.chunk_groups.iter().enumerate() {
            println!("chunk_group {i}: {}", chunk_group.to_string().await?);
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
                    .insert(entry, BatchAssignment::new(idx, chunkable_module));
                entries.push((entry, idx));
            }
        }

        // Find all cycles
        let mut cycles = FxHashSet::default();
        module_graph
            .traverse_cycles(
                |ty| {
                    matches!(
                        ty,
                        ChunkingType::Parallel | ChunkingType::ParallelInheritAsync
                    )
                },
                |cycle| {
                    cycles.extend(cycle.iter().map(|&node| node.module));
                },
            )
            .await?;

        // Traverse the module graph and assign all modules to batches based on the parent batch.
        // When the chunk groups bitmap change on an edge, a new batch is created.
        // Module order in batches must be postorder.
        module_graph
            .traverse_edges_from_entries_topological(
                entries.iter().map(|&(module, _)| module),
                &mut state,
                |parent_info, node, state| {
                    let Some((parent_node, ty)) = parent_info else {
                        return Ok(GraphTraversalAction::Continue);
                    };

                    // Handle self edges
                    if parent_node.module == node.module {
                        let Some(assignment) = state.batch_assignments.get_mut(&node.module) else {
                            unreachable!();
                        };
                        if !matches!(
                            ty,
                            ChunkingType::Parallel | ChunkingType::ParallelInheritAsync
                        ) {
                            // Add self edge
                            state.batches[assignment.batch_idx].add_edge(
                                assignment.batch_idx,
                                ty.without_inherit_async(),
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
                    let Some(parent_assignment) = parent_assignment else {
                        unreachable!();
                    };
                    let &mut BatchAssignment { batch_idx, .. } = parent_assignment;
                    if let Some(&mut BatchAssignment { batch_idx: idx, .. }) = current_assignment {
                        // Already assigned and processed, but we still need to add an edge
                        if batch_idx != idx {
                            // Since we have a parallel edge here, order is important. So we
                            // need to split the current batch to avoid breaking the
                            // ordering.
                            // TODO: only split for parallel
                            state.split_batch(parent_node.module);
                            state.batches[batch_idx].add_edge(
                                idx,
                                ty.without_inherit_async(),
                                node.module,
                            );
                        }
                        return Ok(GraphTraversalAction::Exclude);
                    }
                    match ty {
                        ChunkingType::Traced => {
                            // Traced are special edges. We add an edge to the target module.
                            // These edges do not influence the batching.
                            let idx = state.batches.len();
                            state
                                .batches
                                .push(ModuleBatchBuilder::new_module(node.module));
                            state
                                .batch_assignments
                                .insert(node.module, BatchAssignment::new_already_added(idx));
                            state.batches[batch_idx].add_edge(
                                idx,
                                ChunkingType::Traced,
                                node.module,
                            );
                            return Ok(GraphTraversalAction::Exclude);
                        }
                        ChunkingType::Async
                        | ChunkingType::Isolated { .. }
                        | ChunkingType::Shared { .. } => unreachable!(
                            "These chunking types should already have a batch assigned so it \
                             should never get here"
                        ),
                        ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => {}
                    };
                    let mut in_same_batch = true;

                    if in_same_batch {
                        in_same_batch = !cycles.contains(&node.module);
                    }

                    // Get the chunk groups of the module
                    let chunk_groups = chunk_group_info
                        .module_chunk_groups
                        .get(&node.module)
                        .expect("all modules need to have chunk group info");

                    if in_same_batch {
                        // Get the chunk groups of the parent batch
                        if let ModuleBatchBuilderType::Batch {
                            chunk_groups: batch_chunk_groups,
                            ..
                        } = &mut state.batches[batch_idx].ty
                        {
                            // When chunk groups are different, we want to create a new batch
                            // since this is shared with other
                            // chunk groups.
                            in_same_batch = chunk_groups == batch_chunk_groups;
                        } else {
                            // When the current batch isn't a batch, we can't place it there.
                            in_same_batch = false;
                        }
                    }

                    let chunkable_module =
                        if let Some(chunkable_module) = ResolvedVc::try_downcast(node.module) {
                            if in_same_batch {
                                // Place it in the same batch
                                state.batch_assignments.insert(
                                    node.module,
                                    BatchAssignment::new(batch_idx, chunkable_module),
                                );
                                return Ok(GraphTraversalAction::Continue);
                            }
                            Some(chunkable_module)
                        } else {
                            None
                        };

                    // Since we create a new batch here, we might also need to split the
                    // current batch to avoid breaking the ordering.
                    state.split_batch(parent_node.module);

                    // Assign the module to a new batch
                    let idx = state.batches.len();
                    if let Some(chunkable_module) = chunkable_module {
                        state
                            .batches
                            .push(ModuleBatchBuilder::new_batch(chunk_groups.clone()));
                        state
                            .batch_assignments
                            .insert(node.module, BatchAssignment::new(idx, chunkable_module));
                    } else {
                        state
                            .batches
                            .push(ModuleBatchBuilder::new_module(node.module));
                        state
                            .batch_assignments
                            .insert(node.module, BatchAssignment::new_already_added(idx));
                    }

                    // Add an edge to the parent batch
                    state.batches[batch_idx].add_edge(idx, ty.without_inherit_async(), node.module);

                    // We want to visit parallel edges
                    Ok(GraphTraversalAction::Continue)
                },
                |_, node, state| {
                    let BatchAssignment {
                        batch_idx,
                        postorder_action,
                    } = state.batch_assignments.get_mut(&node.module).unwrap();
                    if let Some(PostorderAction { chunkable_module }) = postorder_action.take() {
                        // modules need to be inserted in postorder into the batch
                        let item = &mut state.batches[*batch_idx];
                        let ModuleBatchBuilderType::Batch { modules, .. } = &mut item.ty else {
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

        for (i, batch) in state.batches.iter().enumerate() {
            match &batch.ty {
                ModuleBatchBuilderType::Batch {
                    modules,
                    chunk_groups: _,
                } => {
                    println!(
                        "batch {i}: {:#?}",
                        modules
                            .iter()
                            .map(|e| e.ident().to_string())
                            .try_join()
                            .await?
                    )
                }
                ModuleBatchBuilderType::Module { module } => {
                    println!("batch {i}: {}", module.ident().to_string().await?)
                }
            }
            for edge in batch.edges.iter() {
                println!(
                    "  {} -> {} ({:?}): {}",
                    i,
                    edge.0,
                    edge.1,
                    edge.2.ident().to_string().await?,
                );
            }
        }

        // Add nodes and store node index
        let mut batch_indicies_and_edges: Vec<(
            NodeIndex,
            FxIndexSet<(usize, ChunkingType, ResolvedVc<Box<dyn Module>>)>,
        )> = state
            .batches
            .into_iter()
            .map(|batch| batch.build())
            .try_join()
            .await?
            .into_iter()
            .map(|(batch, edges)| {
                if matches!(batch, ModuleOrBatch::Module(_)) {
                    result_modules += 1;
                }
                (graph.add_node(batch), edges)
            })
            .collect::<Vec<_>>();

        let entries = entries
            .into_iter()
            .map(|(module, idx)| (module, batch_indicies_and_edges[idx].0))
            .collect::<FxHashMap<_, _>>();

        span.record("batches", batches_len - result_modules);
        span.record("modules", result_modules);
        span.record("edges", state.edges.len());

        // Add edges
        graph.reserve_edges(state.edges.len());
        let batch_indicies_and_edges_ptr = (&batch_indicies_and_edges)
            as *const Vec<(
                NodeIndex,
                FxIndexSet<(usize, ChunkingType, ResolvedVc<Box<dyn Module>>)>,
            )>;
        for (ref from, edges) in batch_indicies_and_edges.iter_mut() {
            for (to, ty, module) in take(edges) {
                graph.add_edge(
                    *from,
                    // Safety: We are only mutating `edges` and not `from`, so it's safe to access
                    // that here while `iter_mut()` is active.
                    unsafe { &*batch_indicies_and_edges_ptr }[to].0,
                    ModuleBatchesGraphEdge { ty, module },
                );
            }
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
