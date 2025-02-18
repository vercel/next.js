use anyhow::Result;
use either::Either;
use petgraph::graph::{DiGraph, NodeIndex};
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{trace::TraceRawVcs, FxIndexSet, NonLocalValue, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{
        chunk_group_info::RoaringBitmapWrapper, module_batch::ModuleBatch,
        traced_di_graph::TracedDiGraph, GraphTraversalAction, ModuleGraph,
    },
};

#[derive(Debug, Copy, Clone, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub enum ModuleBatchesGraphNode {
    Module(ResolvedVc<Box<dyn Module>>),
    Batch(ResolvedVc<ModuleBatch>),
}

#[turbo_tasks::value(cell = "new", eq = "manual", into = "new")]
pub struct ModuleBatchesGraph {
    graph: TracedDiGraph<ModuleBatchesGraphNode, ChunkingType>,

    // NodeIndex isn't necessarily stable (because of swap_remove), but we never remove nodes.
    //
    // HashMaps have nondeterministic order, but this map is only used for lookups and not
    // iteration.
    //
    // This contains Vcs, but they are already contained in the graph, so no need to trace this.
    #[turbo_tasks(trace_ignore)]
    entries: FxHashMap<ResolvedVc<Box<dyn Module>>, NodeIndex>,
}

struct ModuleBatchBuilder {
    modules: Vec<Vc<Box<dyn Module>>>,
    chunk_groups: RoaringBitmapWrapper,
}

impl ModuleBatchBuilder {
    fn new(chunk_groups: RoaringBitmapWrapper) -> Self {
        Self {
            modules: Vec::new(),
            chunk_groups,
        }
    }

    fn build(self) -> Vc<ModuleBatch> {
        ModuleBatch::new(self.modules, Some(self.chunk_groups))
    }
}

#[derive(Debug, Clone, Copy)]
struct BatchAssignment {
    batch_idx: usize,
    added_to_batch: bool,
    next_child_batch: Option<usize>,
}

impl BatchAssignment {
    fn new(batch_idx: usize) -> Self {
        Self {
            batch_idx,
            added_to_batch: false,
            next_child_batch: Some(batch_idx),
        }
    }
}

#[derive(Default)]
struct TraversalState {
    /// Finished batches, filled in postorder
    batches: Vec<ModuleBatchBuilder>,
    /// Assigment of modules to batches, assigned in preorder
    batch_assignments: FxHashMap<ResolvedVc<Box<dyn Module>>, BatchAssignment>,
    /// Edges between batches (from, to, ty)
    edges: FxIndexSet<(usize, usize, ChunkingType)>,
}

impl TraversalState {
    fn add_edge(&mut self, from: usize, to: usize, ty: ChunkingType) {
        self.edges.insert((from, to, ty));
    }
}

pub async fn compute_module_batches(
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<ModuleBatchesGraph>> {
    let outer_span = tracing::info_span!(
        "compute module batches",
        batches = tracing::field::Empty,
        modules = tracing::field::Empty,
        edges = tracing::field::Empty
    );
    let span = outer_span.clone();
    async move {
        let mut state = TraversalState::default();
        let mut entries = Vec::new();

        // Find all chunk group entries and assign them to batches
        let chunk_group_info = module_graph.chunk_group_info().await?;
        for chunk_group in &chunk_group_info.chunk_groups {
            let start_index = state.batches.len();
            // All entries with the same chunk groups bitmap are in the same batch.
            for entry in chunk_group.entries() {
                if state.batch_assignments.contains_key(&entry) {
                    // Already assigned
                    continue;
                }
                let chunk_groups = chunk_group_info
                    .module_chunk_groups
                    .get(&entry)
                    .expect("all entries need to have chunk group info");
                let idx = state.batches[start_index..]
                    .iter()
                    .position(|batch| &batch.chunk_groups == chunk_groups)
                    .map(|idx| start_index + idx)
                    .unwrap_or_else(|| {
                        let idx = state.batches.len();
                        state
                            .batches
                            .push(ModuleBatchBuilder::new(chunk_groups.clone()));
                        idx
                    });
                state
                    .batch_assignments
                    .insert(entry, BatchAssignment::new(idx));
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
                            // Skip self edges
                            return Ok(GraphTraversalAction::Skip);
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
                            state.add_edge(batch_idx, idx, ty.clone());
                            return Ok(GraphTraversalAction::Skip);
                        }
                        if matches!(
                            ty,
                            crate::chunk::ChunkingType::Async
                                | crate::chunk::ChunkingType::Isolated { .. }
                                | crate::chunk::ChunkingType::Traced
                        ) {
                            // These chunking types are not included in batches or they are already
                            // handled by being entries of chunk groups
                            return Ok(GraphTraversalAction::Exclude);
                        }

                        // Get the chunk groups of the module
                        let chunk_groups = chunk_group_info
                            .module_chunk_groups
                            .get(&node.module)
                            .expect("all modules need to have chunk group info");

                        // Get the chunk groups of the parent batch
                        let batch = &mut state.batches[batch_idx];
                        let batch_chunk_groups = &batch.chunk_groups;

                        if chunk_groups == batch_chunk_groups {
                            // chunk groups are equal, so we can place it in the same batch (if not
                            // split)
                            if next_child_batch.is_none() {
                                // Create a new batch
                                let idx = state.batches.len();
                                state
                                    .batches
                                    .push(ModuleBatchBuilder::new(chunk_groups.clone()));
                                *next_child_batch = Some(idx);
                            }
                            let idx = next_child_batch.unwrap();
                            state
                                .batch_assignments
                                .insert(node.module, BatchAssignment::new(idx));

                            // Add an edge to the parent batch
                            if batch_idx != idx {
                                state.add_edge(batch_idx, idx, ty.clone());
                            }
                        } else {
                            // Chunk groups are different. We want to create a new batch since this
                            // is shared with other chunk groups.

                            // Since we create a new batch here, further children need to be in a
                            // new batch too to avoid breaking the ordering:
                            *next_child_batch = None;

                            // Assign the module to a new batch
                            let idx = state.batches.len();
                            state
                                .batches
                                .push(ModuleBatchBuilder::new(chunk_groups.clone()));
                            state
                                .batch_assignments
                                .insert(node.module, BatchAssignment::new(idx));

                            // Add an edge to the parent batch
                            state.add_edge(batch_idx, idx, ty.clone());
                        }
                    }
                    Ok(GraphTraversalAction::Continue)
                },
                |_, node, state| {
                    let BatchAssignment {
                        batch_idx,
                        added_to_batch,
                        ..
                    } = state.batch_assignments.get_mut(&node.module).unwrap();
                    if !*added_to_batch {
                        // modules need to be inserted in postorder into the batch
                        state.batches[*batch_idx].modules.push(*node.module);
                        *added_to_batch = true;
                    }
                },
            )
            .await?;

        let batches_len = state.batches.len();
        let mut result_modules = 0;

        // Create a petgraph from the collected data
        let mut graph: DiGraph<ModuleBatchesGraphNode, ChunkingType, u32> =
            petgraph::graph::DiGraph::with_capacity(state.batches.len(), state.edges.len());

        // Add nodes and store node index
        let batch_indicies = state
            .batches
            .into_iter()
            .map(|batch| {
                if batch.modules.len() == 1 {
                    result_modules += 1;
                    Either::Left(batch.modules.into_iter().next().unwrap())
                } else {
                    Either::Right(batch.build())
                }
            })
            .map(|either| async move {
                Ok(match either {
                    Either::Left(module) => {
                        ModuleBatchesGraphNode::Module(module.to_resolved().await?)
                    }
                    Either::Right(batch) => {
                        ModuleBatchesGraphNode::Batch(batch.to_resolved().await?)
                    }
                })
            })
            .try_join()
            .await?
            .into_iter()
            .map(|batch| graph.add_node(batch))
            .collect::<Vec<_>>();

        let entries = entries
            .into_iter()
            .map(|(module, idx)| (module, batch_indicies[idx]))
            .collect::<FxHashMap<_, _>>();

        span.record("batches", batches_len - result_modules);
        span.record("modules", &result_modules);
        span.record("edges", &state.edges.len());

        // Add edges
        for (from, to, ty) in state.edges {
            graph.add_edge(batch_indicies[from], batch_indicies[to], ty);
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
