use std::{
    collections::{hash_map::Entry, VecDeque},
    mem::take,
};

use anyhow::{bail, Result};
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput,
    TryJoinIterExt, ValueToString, Vc,
};

use crate::{
    chunk::{ChunkableModule, ChunkingType},
    module::Module,
    module_graph::{
        chunk_group_info::{ChunkGroupInfo, RoaringBitmapWrapper},
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
    pub module: Option<ResolvedVc<Box<dyn Module>>>,
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

type PreBatchIndex = usize;

#[derive(Hash, PartialEq, Eq, Clone, Debug)]
enum PreBatchItem {
    ParallelModule(ResolvedVc<Box<dyn ChunkableModule>>),
    ParallelReference(PreBatchIndex),
    NonParallelEdge(ChunkingType, ResolvedVc<Box<dyn Module>>),
}

impl PreBatchItem {
    async fn debug_str(&self) -> Result<String> {
        Ok(match self {
            PreBatchItem::ParallelModule(module) => {
                format!("ParallelModule({})", module.ident().to_string().await?)
            }
            PreBatchItem::ParallelReference(idx) => {
                format!("ParallelReference({})", idx)
            }
            PreBatchItem::NonParallelEdge(ty, module) => {
                format!(
                    "NonParallelEdge({:?}, {})",
                    ty,
                    module.ident().to_string().await?
                )
            }
        })
    }
}

struct PreBatch {
    items: FxIndexSet<PreBatchItem>,
    chunk_groups: RoaringBitmapWrapper,
}

impl PreBatch {
    fn new(chunk_groups: RoaringBitmapWrapper) -> Self {
        Self {
            items: FxIndexSet::default(),
            chunk_groups,
        }
    }

    async fn debug_items(&self) -> Result<Vec<String>> {
        Ok(self
            .items
            .iter()
            .map(|item| item.debug_str())
            .try_join()
            .await?)
    }
}

struct TraversalState<'l> {
    items: Vec<PreBatchItem>,
    this: &'l mut PreBatches,
}

struct PreBatches {
    batches: Vec<PreBatch>,
    entries: FxHashMap<ResolvedVc<Box<dyn ChunkableModule>>, PreBatchIndex>,
    single_module_entries: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
}

impl PreBatches {
    fn new() -> Self {
        Self {
            batches: Vec::new(),
            entries: FxHashMap::default(),
            single_module_entries: FxIndexSet::default(),
        }
    }

    fn ensure_pre_batch_for_module(
        &mut self,
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        chunk_groups: &RoaringBitmapWrapper,
        queue: &mut VecDeque<(ResolvedVc<Box<dyn ChunkableModule>>, PreBatchIndex)>,
    ) -> PreBatchIndex {
        match self.entries.entry(module) {
            Entry::Vacant(e) => {
                let index = self.batches.len();
                queue.push_back((module, index));
                let batch = PreBatch::new(chunk_groups.clone());
                self.batches.push(batch);
                e.insert(index);
                index
            }
            Entry::Occupied(e) => *e.get(),
        }
    }

    async fn get_pre_batch_items(
        &mut self,
        entry: ResolvedVc<Box<dyn ChunkableModule>>,
        chunk_group_info: &ChunkGroupInfo,
        module_graph: &ModuleGraph,
        queue: &mut VecDeque<(ResolvedVc<Box<dyn ChunkableModule>>, PreBatchIndex)>,
    ) -> Result<Vec<PreBatchItem>> {
        let entry_chunk_groups = chunk_group_info
            .module_chunk_groups
            .get(&ResolvedVc::upcast(entry))
            .expect("all modules need to have chunk group info");
        let mut state = TraversalState {
            items: Vec::new(),
            this: self,
        };
        module_graph
            .traverse_edges_from_entries_topological(
                std::iter::once(ResolvedVc::upcast(entry)),
                &mut state,
                |parent_info, node, state| {
                    let ty = parent_info.map_or(&ChunkingType::Parallel, |(_, ty)| ty);
                    if !ty.is_parallel() {
                        return Ok(GraphTraversalAction::Skip);
                    }
                    let Some(chunkable_module) = ResolvedVc::try_downcast(node.module) else {
                        return Ok(GraphTraversalAction::Skip);
                    };
                    let chunk_groups = chunk_group_info
                        .module_chunk_groups
                        .get(&node.module)
                        .expect("all modules need to have chunk group info");
                    if chunk_groups != entry_chunk_groups {
                        let idx = state.this.ensure_pre_batch_for_module(
                            chunkable_module,
                            chunk_groups,
                            queue,
                        );
                        state.items.push(PreBatchItem::ParallelReference(idx));
                        return Ok(GraphTraversalAction::Exclude);
                    }
                    Ok(GraphTraversalAction::Continue)
                },
                |parent_info, node, state| {
                    let ty = parent_info.map_or(&ChunkingType::Parallel, |(_, ty)| ty);
                    let item = if !ty.is_parallel() {
                        PreBatchItem::NonParallelEdge(ty.without_inherit_async(), node.module)
                    } else if let Some(chunkable_module) = ResolvedVc::try_downcast(node.module) {
                        PreBatchItem::ParallelModule(chunkable_module)
                    } else {
                        PreBatchItem::NonParallelEdge(ty.without_inherit_async(), node.module)
                    };
                    state.items.push(item);
                },
            )
            .await?;
        Ok(state.items)
    }
}

pub async fn compute_module_batches(
    module_graph: Vc<ModuleGraph>,
    _config: &BatchingConfig,
) -> Result<Vc<ModuleBatchesGraph>> {
    let outer_span = tracing::info_span!(
        "compute module batches",
        initial_pre_batch_items = tracing::field::Empty,
        extracted_shared_items = tracing::field::Empty,
        batches = tracing::field::Empty,
        modules = tracing::field::Empty,
        edges = tracing::field::Empty
    );
    let span = outer_span.clone();
    async move {
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let module_graph = module_graph.await?;

        let mut pre_batches = PreBatches::new();
        let mut queue: VecDeque<(ResolvedVc<Box<dyn ChunkableModule>>, PreBatchIndex)> =
            VecDeque::new();

        // Start with the entries
        for (i, chunk_group) in chunk_group_info.chunk_groups.iter().enumerate() {
            println!("chunk_group {i}: {}", chunk_group.to_string().await?);
            for entry in chunk_group.entries() {
                if let Some(chunkable_module) = ResolvedVc::try_downcast(entry) {
                    let chunk_groups = chunk_group_info
                        .module_chunk_groups
                        .get(&entry)
                        .expect("all modules need to have chunk group info");
                    pre_batches.ensure_pre_batch_for_module(
                        chunkable_module,
                        chunk_groups,
                        &mut queue,
                    );
                } else {
                    pre_batches.single_module_entries.insert(entry);
                }
            }
        }

        let mut initial_pre_batch_items = 0;
        // Fill all pre batches
        while let Some((chunkable_module, idx)) = queue.pop_front() {
            let items = pre_batches
                .get_pre_batch_items(
                    chunkable_module,
                    &chunk_group_info,
                    &module_graph,
                    &mut queue,
                )
                .await?;
            initial_pre_batch_items += items.len();
            let batch = &mut pre_batches.batches[idx];
            batch.items.extend(items);
        }
        span.record("initial_pre_batch_items", &initial_pre_batch_items);

        for (i, pre_batch) in pre_batches.batches.iter().enumerate() {
            println!("pre_batch {i} {:#?}", pre_batch.debug_items().await?);
        }

        // Create a map of parallel module to the batches they are contained in.
        let mut parallel_module_to_pre_batch: FxIndexMap<_, Vec<PreBatchIndex>> =
            FxIndexMap::default();

        // Fill the map and also fill up the single_module_entries
        for (idx, pre_batch) in pre_batches.batches.iter().enumerate() {
            for item in &pre_batch.items {
                match item {
                    PreBatchItem::ParallelModule(module) => {
                        parallel_module_to_pre_batch
                            .entry(*module)
                            .or_default()
                            .push(idx);
                    }
                    PreBatchItem::NonParallelEdge(_, module) => {
                        if let Some(chunkable_module) = ResolvedVc::try_downcast(*module) {
                            if !pre_batches.entries.contains_key(&chunkable_module) {
                                pre_batches.single_module_entries.insert(*module);
                            }
                        } else {
                            pre_batches.single_module_entries.insert(*module);
                        }
                    }
                    _ => {}
                }
            }
        }

        // We never want a module to occur in multiple batches.

        let mut extracted_shared_items = 0;
        // Extract shared modules into separate batches
        for i in 0..parallel_module_to_pre_batch.len() {
            let (&module, batches) = parallel_module_to_pre_batch.get_index(i).unwrap();
            println!(
                "module {} in batches {:?}",
                module.ident().to_string().await?,
                batches
            );
            if batches.len() > 1 {
                // Create a new batch for the shared modules
                let batches_with_item_index = batches
                    .iter()
                    .map(|&idx| {
                        let batch_items = &pre_batches.batches[idx].items;
                        let item_idx = batch_items
                            .get_index_of(&PreBatchItem::ParallelModule(module))
                            .unwrap();
                        (idx, item_idx)
                    })
                    .collect::<Vec<_>>();
                let mut selected_items = 1;
                fn get_item_at(
                    pre_batches: &PreBatches,
                    batch_idx: PreBatchIndex,
                    item_idx: usize,
                ) -> Option<&PreBatchItem> {
                    pre_batches.batches[batch_idx].items.get_index(item_idx)
                }
                // Select more matching items that are equal in all batches that contain the shared
                // module(s)
                loop {
                    if let Some(next_item) = get_item_at(
                        &pre_batches,
                        batches_with_item_index[0].0,
                        batches_with_item_index[0].1 + selected_items,
                    ) {
                        if batches_with_item_index[1..]
                            .iter()
                            .all(|&(batch_idx, item_idx)| {
                                get_item_at(&pre_batches, batch_idx, item_idx + selected_items)
                                    == Some(next_item)
                            })
                        {
                            selected_items += 1;
                            continue;
                        }
                    }
                    break;
                }
                println!("{selected_items} items selected");
                extracted_shared_items += selected_items;

                // Check if a batch is completely selected. In that case we can replace all other
                // occurences with a reference to that batch
                let exact_match = batches_with_item_index
                    .iter()
                    .find(|&&(batch_idx, item_idx)| {
                        item_idx == 0
                            && pre_batches.batches[batch_idx].items.len() == selected_items
                    });
                if let Some(&(exact_match, _)) = exact_match {
                    // Replace all other occurences with a reference to the exact match
                    for &(batch_index, item_start) in batches_with_item_index.iter() {
                        if batch_index != exact_match {
                            pre_batches.batches[batch_index].items.splice(
                                item_start..item_start + selected_items,
                                std::iter::once(PreBatchItem::ParallelReference(exact_match)),
                            );
                        }
                    }
                    for item in pre_batches.batches[exact_match].items.iter() {
                        if let PreBatchItem::ParallelModule(module) = item {
                            parallel_module_to_pre_batch
                                .get_mut(module)
                                .unwrap()
                                .clear();
                        }
                    }
                } else {
                    // Create a new batch of the shared part and replace all occurences with a
                    // reference to that batch
                    let first_batch_index = batches_with_item_index[0].0;
                    let first_batch_item_index = batches_with_item_index[0].1;
                    let new_batch_index = pre_batches.batches.len();
                    let mut new_batch =
                        PreBatch::new(pre_batches.batches[first_batch_index].chunk_groups.clone());
                    new_batch
                        .items
                        .extend(pre_batches.batches[first_batch_index].items.splice(
                            first_batch_item_index..first_batch_item_index + selected_items,
                            std::iter::once(PreBatchItem::ParallelReference(new_batch_index)),
                        ));
                    for item in new_batch.items.iter() {
                        if let PreBatchItem::ParallelModule(module) = item {
                            parallel_module_to_pre_batch
                                .get_mut(module)
                                .unwrap()
                                .clear();
                        }
                    }
                    pre_batches.batches.push(new_batch);
                    for &(batch_index, item_start) in batches_with_item_index[1..].iter() {
                        pre_batches.batches[batch_index].items.splice(
                            item_start..item_start + selected_items,
                            std::iter::once(PreBatchItem::ParallelReference(new_batch_index)),
                        );
                    }
                }
            }
        }
        span.record("extracted_shared_items", &extracted_shared_items);

        // Now every module is only in one batch

        for (i, pre_batch) in pre_batches.batches.iter().enumerate() {
            println!("pre_batch {i} {:#?}", pre_batch.debug_items().await?);
        }

        let mut edges_count = 0;

        // Since batches can only have references followed by a list of parallel modules, we need to
        // split batches that have modules before references.
        for i in 0..pre_batches.batches.len() {
            let items = take(&mut pre_batches.batches[i].items);
            let mut new_items =
                FxIndexSet::with_capacity_and_hasher(items.len(), Default::default());
            enum Mode {
                ParallelModule,
                Other,
            }
            let mut mode = Mode::Other;
            for item in items {
                match (&mode, &item) {
                    (_, PreBatchItem::ParallelModule(_)) => {
                        mode = Mode::ParallelModule;
                        new_items.insert(item);
                    }
                    (Mode::Other, _) => {
                        edges_count += 1;
                        new_items.insert(item);
                    }
                    (Mode::ParallelModule, _) => {
                        // Split the batch
                        let idx = pre_batches.batches.len();
                        let mut new_batch =
                            PreBatch::new(pre_batches.batches[i].chunk_groups.clone());
                        new_batch.items.extend(new_items.drain(..));
                        pre_batches.batches.push(new_batch);
                        edges_count += 1;
                        new_items.insert(PreBatchItem::ParallelReference(idx));
                        if matches!(item, PreBatchItem::ParallelModule(_)) {
                            new_items.insert(item);
                        } else {
                            edges_count += 1;
                            mode = Mode::Other;
                            new_items.insert(item);
                        }
                    }
                }
            }
            pre_batches.batches[i].items = new_items;
        }
        span.record("pre_batches", &pre_batches.batches.len());

        // Now batches are in the correct shape. We can create the real batches and the graph.

        for (i, pre_batch) in pre_batches.batches.iter().enumerate() {
            println!("pre_batch {i} {:#?}", pre_batch.debug_items().await?);
        }

        // Create the graph
        let mut graph: DiGraph<ModuleOrBatch, ModuleBatchesGraphEdge, u32> =
            petgraph::graph::DiGraph::with_capacity(
                pre_batches.batches.len() + pre_batches.single_module_entries.len(),
                edges_count,
            );

        // Create the Vc<ModuleBatch> instances
        let batches = pre_batches
            .batches
            .iter_mut()
            .map(async |pre_batch| {
                let mut modules = pre_batch.items.iter().filter_map(|item| match item {
                    PreBatchItem::ParallelModule(module) => Some(*module),
                    _ => None,
                });
                let Some(first) = modules.next() else {
                    return Ok(ModuleOrBatch::None);
                };
                if let Some(second) = modules.next() {
                    let batch = ModuleBatch::new(
                        [first, second]
                            .into_iter()
                            .chain(modules)
                            .map(|m| *m)
                            .collect::<Vec<_>>(),
                        Some(take(&mut pre_batch.chunk_groups)),
                    );
                    Ok(ModuleOrBatch::Batch(batch.to_resolved().await?))
                } else {
                    Ok(ModuleOrBatch::Module(ResolvedVc::upcast(first)))
                }
            })
            .try_join()
            .await?;

        // Insert batches into the graph and store the NodeIndicies
        let mut batches_count = 0;
        let mut modules_count = 0;
        let batch_indicies = batches
            .into_iter()
            .map(|batch| {
                match &batch {
                    ModuleOrBatch::Batch(_) => batches_count += 1,
                    ModuleOrBatch::Module(_) => modules_count += 1,
                    ModuleOrBatch::None => {}
                }
                graph.add_node(batch)
            })
            .collect::<Vec<_>>();

        // Also insert single modules into the graph and store the NodeIndicies
        let single_module_indicies = pre_batches
            .single_module_entries
            .iter()
            .map(|module| graph.add_node(ModuleOrBatch::Module(*module)))
            .collect::<Vec<_>>();

        span.record("batches", &batches_count);
        modules_count += pre_batches.single_module_entries.len();
        span.record("modules", &modules_count);
        span.record("edges", &edges_count);

        // Add all the edges to the graph
        for (i, pre_batch) in pre_batches.batches.into_iter().enumerate() {
            let index = batch_indicies[i];
            let items = pre_batch.items;
            for item in items {
                match item {
                    PreBatchItem::ParallelReference(idx) => {
                        graph.add_edge(
                            index,
                            batch_indicies[idx],
                            ModuleBatchesGraphEdge {
                                ty: ChunkingType::Parallel,
                                module: None,
                            },
                        );
                    }
                    PreBatchItem::NonParallelEdge(ty, module) => {
                        if let Some(chunkable_module) = ResolvedVc::try_downcast(module) {
                            if let Some(batch) = pre_batches.entries.get(&chunkable_module).copied()
                            {
                                graph.add_edge(
                                    index,
                                    batch_indicies[batch],
                                    ModuleBatchesGraphEdge {
                                        ty,
                                        module: Some(module),
                                    },
                                );
                                continue;
                            }
                        }
                        let idx = pre_batches
                            .single_module_entries
                            .get_index_of(&module)
                            .unwrap();
                        let idx = single_module_indicies[idx];
                        graph.add_edge(
                            index,
                            idx,
                            ModuleBatchesGraphEdge {
                                ty,
                                module: Some(module),
                            },
                        );
                    }
                    PreBatchItem::ParallelModule(_) => {}
                }
            }
        }

        // Find the NodeIndicies for our entries of the graph
        let mut entries = FxHashMap::default();
        for chunk_group in &chunk_group_info.chunk_groups {
            for module in chunk_group.entries() {
                if let Some(chunkable_module) = ResolvedVc::try_downcast(module) {
                    if let Some(batch) = pre_batches.entries.get(&chunkable_module).copied() {
                        entries.insert(module, batch_indicies[batch]);
                        continue;
                    }
                }
                let idx = pre_batches
                    .single_module_entries
                    .get_index_of(&module)
                    .unwrap();
                let idx = single_module_indicies[idx];
                entries.insert(module, idx);
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
