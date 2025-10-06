use std::{
    collections::{VecDeque, hash_map::Entry},
    hash::BuildHasherDefault,
    mem::take,
};

use anyhow::{Context, Result, bail};
use either::Either;
use petgraph::graph::{DiGraph, EdgeIndex, NodeIndex};
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_prehash::BuildHasherExt;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString,
    Vc, trace::TraceRawVcs,
};

use crate::{
    chunk::{ChunkableModule, ChunkingType},
    module::Module,
    module_graph::{
        GraphTraversalAction, ModuleGraph, ModuleGraphRef,
        chunk_group_info::{ChunkGroupInfo, ChunkGroupKey, RoaringBitmapWrapper},
        module_batch::{ModuleBatch, ModuleBatchGroup, ModuleOrBatch},
        traced_di_graph::{TracedDiGraph, iter_neighbors_rev},
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

type EntriesList = FxIndexSet<ResolvedVc<Box<dyn Module>>>;

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
    batch_groups: FxHashMap<ModuleOrBatch, ResolvedVc<ModuleBatchGroup>>,

    /// For chunk groups where the postorder of entries is different than the order of the
    /// `ChunkGroup::entries()` this contains Some with the postorder list of entries of that chunk
    /// group. The index in this list corresponds to the index in the
    /// chunk_group_info.chunk_groups.
    ordered_entries: Vec<Option<EntriesList>>,
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

    pub fn get_ordered_entries<'l>(
        &'l self,
        chunk_group_info: &'l ChunkGroupInfo,
        idx: usize,
    ) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + 'l {
        if let Some(ordered_entries) = self
            .ordered_entries
            .get(idx)
            .as_ref()
            .and_then(|o| o.as_ref())
        {
            if let Some(chunk_group) = chunk_group_info.chunk_groups.get_index(idx) {
                debug_assert_eq!(ordered_entries.len(), chunk_group.entries_count());
            }
            Either::Left(Either::Left(ordered_entries.iter().copied()))
        } else if let Some(chunk_group) = chunk_group_info.chunk_groups.get_index(idx) {
            Either::Right(chunk_group.entries())
        } else {
            Either::Left(Either::Right(std::iter::empty()))
        }
    }

    pub fn get_batch_group(
        &self,
        module_or_batch: &ModuleOrBatch,
    ) -> Option<ResolvedVc<ModuleBatchGroup>> {
        self.batch_groups.get(module_or_batch).copied()
    }

    pub async fn get_entry(&self, entry: ResolvedVc<Box<dyn Module>>) -> Result<ModuleOrBatch> {
        let entry = self.get_entry_index(entry).await?;
        Ok(*self.graph.node_weight(entry).unwrap())
    }

    // Clippy complains but there's a type error without the bound
    #[allow(clippy::implied_bounds_in_impls)]
    /// Traverses all reachable edges in dfs order. The preorder visitor can be used to
    /// forward state down the graph, and to skip subgraphs
    ///
    /// Use this to collect batches/modules in evaluation order.
    ///
    /// Target nodes can be revisited (once per incoming edge).
    /// Edges are traversed in normal order, so should correspond to reference order.
    ///
    /// * `entries` - The entry modules to start the traversal from
    /// * `state` - The state to be passed to the visitors
    /// * `visit_preorder` - Called before visiting the children of a node.
    ///    - Receives: (originating &ModuleBatchesGraphNode, edge &ChunkingType), target
    ///      &ModuleBatchesGraphNode, state &S
    ///    - Can return [GraphTraversalAction]s to control the traversal
    /// * `visit_postorder` - Called after visiting the children of a node. Return
    ///    - Receives: (originating &ModuleBatchesGraphNode, edge &ChunkingType), target
    ///      &ModuleBatchesGraphNode, state &S
    pub fn traverse_edges_from_entries_dfs<'a, S>(
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

        enum ReverseDFSPass {
            Visit,
            ExpandAndVisit,
        }

        let entries = entries.into_iter();
        #[allow(clippy::type_complexity)] // This is a temporary internal structure
        let mut stack: Vec<(ReverseDFSPass, Option<(NodeIndex, EdgeIndex)>, NodeIndex)> = entries
            .rev()
            .map(|e| (ReverseDFSPass::ExpandAndVisit, None, e))
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
                ReverseDFSPass::Visit => {
                    let current_node = graph.node_weight(current).unwrap();
                    visit_postorder(parent_arg, current_node, state);
                }
                ReverseDFSPass::ExpandAndVisit => {
                    let current_node = graph.node_weight(current).unwrap();
                    let action = visit_preorder(parent_arg, current_node, state)?;
                    if action == GraphTraversalAction::Exclude {
                        continue;
                    }
                    stack.push((ReverseDFSPass::Visit, parent, current));
                    if action == GraphTraversalAction::Continue && expanded.insert(current) {
                        stack.extend(iter_neighbors_rev(graph, current).map(|(edge, child)| {
                            (ReverseDFSPass::ExpandAndVisit, Some((current, edge)), child)
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
    ParallelModule(ResolvedVc<Box<dyn Module>>),
    ParallelReference(PreBatchIndex),
    NonParallelEdge(ChunkingType, ResolvedVc<Box<dyn Module>>),
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
}

struct TraversalState<'l> {
    items: Vec<PreBatchItem>,
    this: &'l mut PreBatches,
}

struct PreBatches {
    boundary_modules: FxHashSet<ResolvedVc<Box<dyn Module>>>,
    batches: Vec<PreBatch>,
    entries: FxHashMap<ResolvedVc<Box<dyn Module>>, PreBatchIndex>,
    single_module_entries: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
}

impl PreBatches {
    fn new() -> Self {
        Self {
            boundary_modules: FxHashSet::default(),
            batches: Vec::new(),
            entries: FxHashMap::default(),
            single_module_entries: FxIndexSet::default(),
        }
    }

    fn ensure_pre_batch_for_module(
        &mut self,
        module: ResolvedVc<Box<dyn Module>>,
        chunk_group_info: &ChunkGroupInfo,
        queue: &mut VecDeque<(ResolvedVc<Box<dyn Module>>, PreBatchIndex)>,
    ) -> Result<PreBatchIndex> {
        Ok(match self.entries.entry(module) {
            Entry::Vacant(e) => {
                let index = self.batches.len();
                queue.push_back((module, index));
                let chunk_groups = chunk_group_info
                    .module_chunk_groups
                    .get(&module)
                    .context("all modules need to have chunk group info")?;
                let batch = PreBatch::new(chunk_groups.clone());
                self.batches.push(batch);
                e.insert(index);
                index
            }
            Entry::Occupied(e) => *e.get(),
        })
    }

    async fn get_pre_batch_items(
        &mut self,
        entry: ResolvedVc<Box<dyn Module>>,
        chunk_group_info: &ChunkGroupInfo,
        module_graph: &ModuleGraphRef,
        queue: &mut VecDeque<(ResolvedVc<Box<dyn Module>>, PreBatchIndex)>,
    ) -> Result<Vec<PreBatchItem>> {
        let mut state = TraversalState {
            items: Vec::new(),
            this: self,
        };
        let mut visited = FxHashSet::default();
        module_graph.traverse_edges_from_entries_dfs(
            std::iter::once(entry),
            &mut state,
            |parent_info, node, state| {
                let ty = parent_info.map_or(
                    &ChunkingType::Parallel {
                        inherit_async: false,
                        hoisted: false,
                    },
                    |(_, ty)| &ty.chunking_type,
                );
                let module = node.module;
                if !ty.is_parallel() {
                    state.items.push(PreBatchItem::NonParallelEdge(
                        ty.without_inherit_async(),
                        module,
                    ));
                    return Ok(GraphTraversalAction::Exclude);
                }
                if visited.insert(module) {
                    if parent_info.is_some() && state.this.boundary_modules.contains(&module) {
                        let idx = state.this.ensure_pre_batch_for_module(
                            module,
                            chunk_group_info,
                            queue,
                        )?;
                        state.items.push(PreBatchItem::ParallelReference(idx));
                        return Ok(GraphTraversalAction::Exclude);
                    }
                    Ok(GraphTraversalAction::Continue)
                } else {
                    Ok(GraphTraversalAction::Exclude)
                }
            },
            |_, node, state| {
                let item = PreBatchItem::ParallelModule(node.module);
                state.items.push(item);
                Ok(())
            },
        )?;
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
        initial_pre_batches = tracing::field::Empty,
        extracted_shared_items = tracing::field::Empty,
        batches = tracing::field::Empty,
        modules = tracing::field::Empty,
        edges = tracing::field::Empty
    );
    let span = outer_span.clone();
    async move {
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let module_graph = module_graph.read_graphs().await?;

        let mut pre_batches = PreBatches::new();

        // Walk the module graph and mark all modules that are boundary modules (referenced from a
        // different chunk group bitmap)
        module_graph.traverse_all_edges_unordered(|(parent, ty), node| {
            let std::collections::hash_set::Entry::Vacant(entry) =
                pre_batches.boundary_modules.entry(node.module)
            else {
                // Already a boundary module, can skip check
                return Ok(());
            };
            if ty.chunking_type.is_parallel() {
                let parent_chunk_groups = chunk_group_info
                    .module_chunk_groups
                    .get(&parent.module)
                    .context("all modules need to have chunk group info")?;
                let chunk_groups = chunk_group_info
                    .module_chunk_groups
                    .get(&node.module)
                    .context("all modules need to have chunk group info")?;
                if parent_chunk_groups != chunk_groups {
                    // This is a boundary module
                    entry.insert();
                }
            } else {
                entry.insert();
            }
            Ok(())
        })?;

        // All entries are boundary modules too
        for chunk_group in &chunk_group_info.chunk_groups {
            for entry in chunk_group.entries() {
                pre_batches.boundary_modules.insert(entry);
            }
        }

        // Pre batches would be incorrect with cycles, so we need to opt-out of pre batches for
        // cycles that include boundary modules
        module_graph.traverse_cycles(
            |ref_data| ref_data.chunking_type.is_parallel(),
            |cycle| {
                if cycle
                    .iter()
                    .any(|node| pre_batches.boundary_modules.contains(&node.module))
                {
                    pre_batches
                        .boundary_modules
                        .extend(cycle.iter().map(|node| node.module));
                }
            },
        )?;

        let mut queue: VecDeque<(ResolvedVc<Box<dyn Module>>, PreBatchIndex)> = VecDeque::new();

        let mut chunk_group_indices_with_merged_children = FxHashSet::default();

        // Start with the entries
        for chunk_group in &chunk_group_info.chunk_groups {
            for entry in chunk_group.entries() {
                pre_batches.ensure_pre_batch_for_module(entry, &chunk_group_info, &mut queue)?;
            }
            if let Some(parent) = chunk_group.get_merged_parent() {
                chunk_group_indices_with_merged_children.insert(parent);
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
        span.record("initial_pre_batch_items", initial_pre_batch_items);
        span.record("initial_pre_batches", pre_batches.batches.len());

        // Figure out the order of all merged groups
        let mut ordered_entries: Vec<Option<EntriesList>> =
            vec![None; chunk_group_info.chunk_groups.len()];
        for (i, chunk_group) in chunk_group_info.chunk_groups.iter().enumerate() {
            if !chunk_group_indices_with_merged_children.contains(&i) {
                continue;
            }
            let mut merged_modules: FxHashMap<ChunkingType, FxIndexSet<_>> = FxHashMap::default();
            let mut stack = ordered_entries[i]
                .as_ref()
                .map_or_else(
                    || Either::Left(chunk_group.entries()),
                    |v| Either::Right(v.iter().copied()),
                )
                .map(|module| {
                    let idx = *pre_batches.entries.get(&module).unwrap();
                    (idx, 0)
                })
                .collect::<Vec<_>>();
            stack.reverse();
            let mut visited = FxHashSet::default();
            while let Some((idx, mut pos)) = stack.pop() {
                let batch = &pre_batches.batches[idx];
                while let Some(item) = batch.items.get_index(pos) {
                    match item {
                        PreBatchItem::ParallelModule(_) => {}
                        PreBatchItem::ParallelReference(other_idx) => {
                            if visited.insert(*other_idx) {
                                stack.push((idx, pos + 1));
                                stack.push((*other_idx, 0));
                                break;
                            }
                        }
                        PreBatchItem::NonParallelEdge(chunking_type, module) => {
                            if chunking_type.is_merged() {
                                merged_modules
                                    .entry(chunking_type.clone())
                                    .or_default()
                                    .insert(*module);
                            }
                        }
                    }
                    pos += 1;
                }
            }
            if !merged_modules.is_empty() {
                for (ty, merged_modules) in merged_modules {
                    let chunk_group_key = match ty {
                        ChunkingType::Isolated {
                            merge_tag: Some(merge_tag),
                            ..
                        } => ChunkGroupKey::IsolatedMerged {
                            parent: i.into(),
                            merge_tag: merge_tag.clone(),
                        },
                        ChunkingType::Shared {
                            merge_tag: Some(merge_tag),
                            ..
                        } => ChunkGroupKey::SharedMerged {
                            parent: i.into(),
                            merge_tag: merge_tag.clone(),
                        },
                        _ => unreachable!(),
                    };
                    let idx = chunk_group_info
                        .chunk_group_keys
                        .get_index_of(&chunk_group_key)
                        .unwrap();
                    ordered_entries[idx] = Some(merged_modules);
                }
            }
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
                        if !pre_batches.entries.contains_key(module) {
                            pre_batches.single_module_entries.insert(*module);
                        }
                    }
                    PreBatchItem::ParallelReference(_) => {}
                }
            }
        }

        // We never want a module to occur in multiple batches.

        let mut extracted_shared_items = 0;
        // Extract shared modules into separate batches
        for i in 0..parallel_module_to_pre_batch.len() {
            let (&module, batches) = parallel_module_to_pre_batch.get_index(i).unwrap();
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
                    if let Some(PreBatchItem::ParallelModule(next_module)) = get_item_at(
                        &pre_batches,
                        batches_with_item_index[0].0,
                        batches_with_item_index[0].1 + selected_items,
                    ) && parallel_module_to_pre_batch.get(next_module).unwrap().len()
                        == batches.len()
                        && batches_with_item_index[1..]
                            .iter()
                            .all(|&(batch_idx, item_idx)| {
                                get_item_at(&pre_batches, batch_idx, item_idx + selected_items)
                                    == Some(&PreBatchItem::ParallelModule(*next_module))
                            })
                    {
                        selected_items += 1;
                        continue;
                    }
                    break;
                }
                extracted_shared_items += selected_items;

                // Check if a batch is completely selected. In that case we can replace all other
                // occurrences with a reference to that batch
                let exact_match = batches_with_item_index
                    .iter()
                    .find(|&&(batch_idx, item_idx)| {
                        item_idx == 0
                            && pre_batches.batches[batch_idx].items.len() == selected_items
                    });
                if let Some(&(exact_match, _)) = exact_match {
                    // Replace all other occurrences with a reference to the exact match
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
                    // Create a new batch of the shared part and replace all occurrences with a
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
        span.record("extracted_shared_items", extracted_shared_items);

        // Now every module is only in one batch

        let mut edges_count = 0;

        // Since batches can only have references followed by a list of parallel chunkable modules,
        // we need to split batches that have modules before references.
        for i in 0..pre_batches.batches.len() {
            let items = take(&mut pre_batches.batches[i].items);
            let mut new_items =
                FxIndexSet::with_capacity_and_hasher(items.len(), Default::default());
            enum Mode {
                ParallelChunkableModule,
                Other,
            }
            let mut mode = Mode::Other;
            for item in items {
                let chunkable_module = if let PreBatchItem::ParallelModule(module) = &item {
                    ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(*module)
                } else {
                    None
                };
                let item = if let PreBatchItem::ParallelModule(module) = item {
                    if chunkable_module.is_some() {
                        PreBatchItem::ParallelModule(module)
                    } else {
                        pre_batches.single_module_entries.insert(module);
                        PreBatchItem::NonParallelEdge(
                            ChunkingType::Parallel {
                                inherit_async: false,
                                hoisted: false,
                            },
                            module,
                        )
                    }
                } else {
                    item
                };
                match (&mode, chunkable_module) {
                    (_, Some(_)) => {
                        mode = Mode::ParallelChunkableModule;
                        new_items.insert(item);
                    }
                    (Mode::Other, _) => {
                        edges_count += 1;
                        new_items.insert(item);
                    }
                    (Mode::ParallelChunkableModule, _) => {
                        // Split the batch
                        let idx = pre_batches.batches.len();
                        let mut new_batch =
                            PreBatch::new(pre_batches.batches[i].chunk_groups.clone());
                        new_batch.items.extend(new_items.drain(..));
                        pre_batches.batches.push(new_batch);
                        edges_count += 1;
                        new_items.insert(PreBatchItem::ParallelReference(idx));
                        if chunkable_module.is_some() {
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
        span.record("pre_batches", pre_batches.batches.len());

        // Now batches are in the correct shape. We can create the real batches and the graph.

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
            .enumerate()
            .map(async |(i, pre_batch)| {
                let mut modules = pre_batch.items.iter().filter_map(|item| {
                    if let PreBatchItem::ParallelModule(module) = item {
                        ResolvedVc::try_downcast(*module)
                    } else {
                        None
                    }
                });
                let Some(first) = modules.next() else {
                    return Ok(ModuleOrBatch::None(i));
                };
                if let Some(second) = modules.next() {
                    let batch = ModuleBatch::new(
                        [first, second]
                            .into_iter()
                            .chain(modules)
                            .map(|m| *m)
                            .collect::<Vec<_>>(),
                        Some(pre_batch.chunk_groups.clone()),
                    );
                    Ok(ModuleOrBatch::Batch(batch.to_resolved().await?))
                } else {
                    Ok(ModuleOrBatch::Module(ResolvedVc::upcast(first)))
                }
            })
            .try_join()
            .await?;

        // Create the batch groups by grouping batches with the same chunk groups
        let mut batch_groups: FxHashMap<_, Vec<_>> = FxHashMap::default();
        for (i, pre_batch) in pre_batches.batches.iter().enumerate() {
            let key = BuildHasherDefault::<FxHasher>::default().prehash(&pre_batch.chunk_groups);
            let batch = batches[i];
            batch_groups.entry(key).or_default().push(batch);
        }
        for &module in &pre_batches.single_module_entries {
            let chunk_groups = chunk_group_info
                .module_chunk_groups
                .get(&module)
                .context("all modules need to have chunk group info")?;
            let key = BuildHasherDefault::<FxHasher>::default().prehash(chunk_groups);
            batch_groups
                .entry(key)
                .or_default()
                .push(ModuleOrBatch::Module(module));
        }

        // Create the batch group instances
        let batch_groups = batch_groups
            .into_iter()
            .map(async |(key, items)| {
                if items.len() == 1 {
                    Ok(Either::Left(std::iter::empty()))
                } else {
                    let batch_group = ModuleBatchGroup::new(items.clone(), (*key).clone())
                        .to_resolved()
                        .await?;
                    Ok(Either::Right(
                        items.into_iter().map(move |item| (item, batch_group)),
                    ))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect::<FxHashMap<_, _>>();

        // Insert batches into the graph and store the NodeIndices
        let mut batches_count = 0;
        let mut modules_count = 0;
        let batch_indices = batches
            .into_iter()
            .map(|batch| {
                match &batch {
                    ModuleOrBatch::Batch(_) => batches_count += 1,
                    ModuleOrBatch::Module(_) => modules_count += 1,
                    ModuleOrBatch::None(_) => {}
                }
                graph.add_node(batch)
            })
            .collect::<Vec<_>>();

        // Also insert single modules into the graph and store the NodeIndices
        let single_module_indices = pre_batches
            .single_module_entries
            .iter()
            .map(|module| graph.add_node(ModuleOrBatch::Module(*module)))
            .collect::<Vec<_>>();

        span.record("batches", batches_count);
        modules_count += pre_batches.single_module_entries.len();
        span.record("modules", modules_count);
        span.record("edges", edges_count);

        // Add all the edges to the graph
        for (i, pre_batch) in pre_batches.batches.into_iter().enumerate() {
            let index = batch_indices[i];
            let items = pre_batch.items;
            for item in items {
                match item {
                    PreBatchItem::ParallelReference(idx) => {
                        graph.add_edge(
                            index,
                            batch_indices[idx],
                            ModuleBatchesGraphEdge {
                                ty: ChunkingType::Parallel {
                                    inherit_async: false,
                                    hoisted: false,
                                },
                                module: None,
                            },
                        );
                    }
                    PreBatchItem::NonParallelEdge(ty, module) => {
                        if let Some(batch) = pre_batches.entries.get(&module).copied() {
                            graph.add_edge(
                                index,
                                batch_indices[batch],
                                ModuleBatchesGraphEdge {
                                    ty,
                                    module: Some(module),
                                },
                            );
                            continue;
                        }
                        let idx = pre_batches
                            .single_module_entries
                            .get_index_of(&module)
                            .unwrap();
                        let idx = single_module_indices[idx];
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

        debug_assert_eq!(graph.capacity().0, graph.node_count());
        debug_assert_eq!(graph.capacity().1, graph.edge_count());

        // Find the NodeIndices for our entries of the graph
        let mut entries = FxHashMap::default();
        for chunk_group in &chunk_group_info.chunk_groups {
            for module in chunk_group.entries() {
                if let Some(batch) = pre_batches.entries.get(&module).copied() {
                    entries.insert(module, batch_indices[batch]);
                    continue;
                }
                let idx = pre_batches
                    .single_module_entries
                    .get_index_of(&module)
                    .unwrap();
                let idx = single_module_indices[idx];
                entries.insert(module, idx);
            }
        }

        Ok(ModuleBatchesGraph {
            graph: TracedDiGraph(graph),
            entries,
            batch_groups,
            ordered_entries,
        }
        .cell())
    }
    .instrument(outer_span)
    .await
}
