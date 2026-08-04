use std::sync::atomic::AtomicBool;

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, OperationVc, ResolvedVc, Vc, trace::TraceRawVcs};

use super::{
    ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkingContext, availability_info::AvailabilityInfo,
    chunking::make_chunks,
};
use crate::{
    chunk::{
        ChunkGroupContent, ChunkGroupContentInner, ChunkableModule, ChunkingType, Chunks,
        available_modules::{AvailableModuleItem, AvailableModulesSet},
        chunk_item_batch::{ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo},
        parallel_reads,
    },
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        chunk_group_info::ChunkGroup,
        merged_modules::MergedModuleInfo,
        module_batch::{
            ChunkableModuleBatchGroup, ChunkableModuleOrBatch, ModuleBatch, ModuleBatchGroup,
            ModuleOrBatch,
        },
        module_batches::{BatchingConfig, ModuleBatchesGraphEdge},
    },
    output::OutputAssetsReference,
};

pub struct MakeChunkGroupResult {
    pub chunks: ResolvedVc<Chunks>,
    pub references: Vec<ResolvedVc<Box<dyn OutputAssetsReference>>>,
    pub availability_info: AvailabilityInfo,
}

turbo_tasks::dual_fn! {
/// Creates a chunk group from a set of entries.
pub fn make_chunk_group(
    chunk_group: ChunkGroup,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = turbo_tasks::read!(chunking_context.chunk_loading())?.can_split_async();
    let is_nested_async_availability_enabled = *turbo_tasks::read!(chunking_context
        .is_nested_async_availability_enabled())?;
    let should_merge_modules = *turbo_tasks::read!(chunking_context.is_module_merging_enabled())?;
    let batching_config = turbo_tasks::read!(chunking_context.batching_config().to_resolved())?;

    let ChunkGroupContent {
        inner,
        availability_info: new_availability_info,
    } = turbo_tasks::read!(chunk_group_content(
        module_graph,
        chunk_group,
        ChunkGroupContentOptions {
            availability_info,
            can_split_async,
            should_merge_modules,
            batching_config,
        },
    ))?;
    let ChunkGroupContentInner {
        chunkable_items,
        batch_groups,
        async_modules,
        available_modules: _,
    } = &*inner;

    let async_module_info = module_graph.async_module_info();

    // Attach async info to chunkable modules
    let mut chunk_items = turbo_tasks::read!(parallel_reads(chunkable_items
        .iter()
        .copied()
        .map(|m| {
            ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                m,
                async_module_info,
                *module_graph,
                *chunking_context,
            )
        })))?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    let chunk_item_batch_groups = turbo_tasks::read!(parallel_reads(batch_groups
        .iter()
        .map(|&batch_group| {
            ChunkItemBatchGroup::from_module_batch_group(
                ChunkableModuleBatchGroup::from_module_batch_group(*batch_group),
                *module_graph,
                *chunking_context,
            )
            .to_resolved()
        })))?;

    // Insert async chunk loaders for every referenced async module
    let async_availability_info =
        if is_nested_async_availability_enabled || !availability_info.is_in_async_module() {
            new_availability_info.in_async_module()
        } else {
            availability_info
        };
    let async_loaders = turbo_tasks::read!(parallel_reads(async_modules
        .iter()
        .copied()
        .map(|module| {
            chunking_context
                .async_loader_chunk_item(*module, *module_graph, async_availability_info)
                .to_resolved()
        })))?;
    let async_loader_chunk_items = turbo_tasks::read!(parallel_reads(async_loaders
        .iter()
        .map(|&chunk_item| async_loader_chunk_item_with_info(chunk_item))))?;

    chunk_items.extend(async_loader_chunk_items);

    // Pass chunk items to chunking algorithm
    let chunks = turbo_tasks::read!(make_chunks(
        *module_graph,
        *chunking_context,
        Vc::cell(chunk_items),
        Vc::cell(chunk_item_batch_groups),
        rcstr!(""),
    )
    .to_resolved())?;

    Ok(MakeChunkGroupResult {
        chunks,
        references: ResolvedVc::upcast_vec(async_loaders),
        availability_info: new_availability_info,
    })
}
}

turbo_tasks::dual_fn! {
/// Wraps an async-loader chunk item (resolving its chunk type) so it can be chunked
/// alongside regular chunk items.
fn async_loader_chunk_item_with_info(
    chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
) -> Result<ChunkItemOrBatchWithAsyncModuleInfo> {
    let chunk_item_trait_ref = turbo_tasks::read!(chunk_item.into_trait_ref())?;
    let chunk_type = turbo_tasks::read!(chunk_item_trait_ref.ty().to_resolved())?;
    Ok(ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(
        ChunkItemWithAsyncModuleInfo {
            chunk_item,
            chunk_type,
            module: None,
            async_info: None,
        },
    ))
}
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, Hash, PartialEq, Eq, TraceRawVcs, Encode, Decode)]
pub struct ChunkGroupContentOptions {
    /// The availability info of the chunk group
    pub availability_info: AvailabilityInfo,
    /// Whether async modules can be split into separate chunks
    pub can_split_async: bool,
    /// Whether module merging is enabled
    pub should_merge_modules: bool,
    /// The batching config to use
    pub batching_config: ResolvedVc<BatchingConfig>,
}

turbo_tasks::dual_fn! {
/// Computes the content of a chunk group.
pub fn chunk_group_content(
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_group: ChunkGroup,
    options: ChunkGroupContentOptions,
) -> Result<ChunkGroupContent> {
    let availability_info = options.availability_info;
    let chunk_group_content = chunk_group_content_operation(module_graph, chunk_group, options);
    let available_modules = available_modules_operation(chunk_group_content);
    let inner = turbo_tasks::read!(chunk_group_content.connect())?;

    Ok(ChunkGroupContent {
        inner,
        availability_info: turbo_tasks::read!(availability_info.with_modules(available_modules))?,
    })
}
}

#[turbo_tasks::function(operation)]
async fn available_modules_operation(
    chunk_group_content: OperationVc<ChunkGroupContentInner>,
) -> Result<Vc<AvailableModulesSet>> {
    Ok(*turbo_tasks::read!(chunk_group_content.connect())?.available_modules)
}

#[turbo_tasks::function(operation)]
async fn chunk_group_content_operation(
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_group: ChunkGroup,
    ChunkGroupContentOptions {
        availability_info,
        can_split_async,
        should_merge_modules,
        batching_config,
    }: ChunkGroupContentOptions,
) -> Result<Vc<ChunkGroupContentInner>> {
    let module_batches_graph = turbo_tasks::read!(module_graph.module_batches(*batching_config))?;

    type ModuleToChunkableMap = FxHashMap<ModuleOrBatch, ChunkableModuleOrBatch>;

    struct TraverseState {
        unsorted_items: ModuleToChunkableMap,
        chunkable_items: FxIndexSet<ChunkableModuleOrBatch>,
        async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
    }

    let mut state = TraverseState {
        unsorted_items: FxHashMap::default(),
        chunkable_items: FxIndexSet::default(),
        async_modules: FxIndexSet::default(),
    };

    let available_modules = match availability_info.available_modules() {
        Some(available_modules) => Some(turbo_tasks::read!(available_modules.snapshot())?),
        None => None,
    };

    let mut entries = Vec::with_capacity(chunk_group.entries_count());
    for entry in chunk_group.entries() {
        entries.push(turbo_tasks::read!(
            module_batches_graph.get_entry_index(entry)
        )?);
    }

    {
        let _span = tracing::trace_span!("traversal").entered();
        module_batches_graph.traverse_edges_from_entries_dfs(
            entries,
            &mut state,
            |parent_info, &node, state| {
                if matches!(node, ModuleOrBatch::None(_)) {
                    return Ok(GraphTraversalAction::Continue);
                }
                // Traced modules are completely ignored during chunking
                if let Some((
                    _,
                    ModuleBatchesGraphEdge {
                        ty: ChunkingType::Traced { .. },
                        ..
                    },
                )) = parent_info
                {
                    return Ok(GraphTraversalAction::Exclude);
                }

                let Some(chunkable_node) = ChunkableModuleOrBatch::from_module_or_batch(node)
                else {
                    return Ok(GraphTraversalAction::Exclude);
                };

                let is_available = available_modules
                    .as_ref()
                    .is_some_and(|available_modules| available_modules.get(chunkable_node.into()));

                let Some((_, edge)) = parent_info else {
                    // An entry from the entries list
                    return Ok(if is_available {
                        GraphTraversalAction::Exclude
                    } else if state
                        .unsorted_items
                        .try_insert(node, chunkable_node)
                        .is_ok()
                    {
                        GraphTraversalAction::Continue
                    } else {
                        GraphTraversalAction::Exclude
                    });
                };

                Ok(match edge.ty {
                    ChunkingType::Parallel { .. } | ChunkingType::Shared { .. } => {
                        if is_available {
                            GraphTraversalAction::Exclude
                        } else if state
                            .unsorted_items
                            .try_insert(node, chunkable_node)
                            .is_ok()
                        {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Exclude
                        }
                    }
                    ChunkingType::Async => {
                        if can_split_async {
                            let chunkable_module =
                                ResolvedVc::try_downcast(edge.module.unwrap())
                                    .context("Module in async chunking edge is not chunkable")?;
                            let is_async_loader_available =
                                available_modules.as_ref().is_some_and(|available_modules| {
                                    available_modules
                                        .get(AvailableModuleItem::AsyncLoader(chunkable_module))
                                });
                            if !is_async_loader_available {
                                state.async_modules.insert(chunkable_module);
                            }
                            GraphTraversalAction::Exclude
                        } else if is_available {
                            GraphTraversalAction::Exclude
                        } else if state
                            .unsorted_items
                            .try_insert(node, chunkable_node)
                            .is_ok()
                        {
                            GraphTraversalAction::Continue
                        } else {
                            GraphTraversalAction::Exclude
                        }
                    }
                    ChunkingType::Traced { .. } => {
                        // handled above before the sidecast
                        unreachable!();
                    }
                    ChunkingType::Isolated { .. } => {
                        // TODO currently not implemented
                        GraphTraversalAction::Exclude
                    }
                })
            },
            |_, node, state| {
                // Insert modules in topological order
                if let Some(chunkable_module) = state.unsorted_items.get(node).copied() {
                    state.chunkable_items.insert(chunkable_module);
                }
            },
        )?;
    }

    // This needs to use the unmerged items
    let available_modules: FxIndexSet<AvailableModuleItem> = state
        .chunkable_items
        .iter()
        .copied()
        .map(Into::into)
        .chain(
            state
                .async_modules
                .iter()
                .copied()
                .map(AvailableModuleItem::AsyncLoader),
        )
        .collect();
    let available_modules: ResolvedVc<AvailableModulesSet> =
        turbo_tasks::read!(Vc::<AvailableModulesSet>::cell(available_modules).to_resolved())?;

    let should_merge_modules = if should_merge_modules {
        let merged_modules = module_graph.merged_modules();
        let merged_modules_ref = turbo_tasks::read!(merged_modules)?;
        Some((merged_modules, merged_modules_ref))
    } else {
        None
    };

    let chunkable_items = if let Some((merged_modules, merged_modules_ref)) = &should_merge_modules
    {
        turbo_tasks::read!(replace_with_merged_modules(
            state.chunkable_items,
            *merged_modules,
            merged_modules_ref,
        ))?
    } else {
        state.chunkable_items.into_iter().collect()
    };

    let mut batch_groups = FxIndexSet::default();
    for &module in &chunkable_items {
        if let Some(batch_group) = module_batches_graph.get_batch_group(&module.into()) {
            batch_groups.insert(batch_group);
        }
    }

    let batch_groups = if let Some((merged_modules, _)) = &should_merge_modules {
        turbo_tasks::read!(parallel_reads(batch_groups.into_iter().map(|group| {
            map_module_batch_group(*merged_modules, *group).to_resolved()
        })))?
    } else {
        batch_groups.into_iter().collect()
    };

    Ok(ChunkGroupContentInner {
        chunkable_items,
        batch_groups,
        async_modules: state.async_modules,
        available_modules,
    }
    .cell())
}

turbo_tasks::dual_fn! {
/// Applies module merging to the chunkable items: modules replaced by a merged module are
/// swapped for it (or dropped if merged away), and batches are mapped through
/// [`map_module_batch`].
#[tracing::instrument(level = tracing::Level::TRACE, skip_all, name = "replace with merged modules")]
fn replace_with_merged_modules(
    chunkable_items: FxIndexSet<ChunkableModuleOrBatch>,
    merged_modules: Vc<MergedModuleInfo>,
    merged_modules_ref: &MergedModuleInfo,
) -> Result<Vec<ChunkableModuleOrBatch>> {
    Ok(turbo_tasks::read!(parallel_reads(chunkable_items
        .into_iter()
        .map(|chunkable_module| {
            replace_chunkable_module_with_merged(chunkable_module, merged_modules, merged_modules_ref)
        })))?
        .into_iter()
        .flatten()
        .collect())
}
}

turbo_tasks::dual_fn! {
/// Per-item body of [`replace_with_merged_modules`].
fn replace_chunkable_module_with_merged(
    chunkable_module: ChunkableModuleOrBatch,
    merged_modules: Vc<MergedModuleInfo>,
    merged_modules_ref: &MergedModuleInfo,
) -> Result<Option<ChunkableModuleOrBatch>> {
    match chunkable_module {
        ChunkableModuleOrBatch::Module(module) => {
            let module = match turbo_tasks::read!(
                merged_modules_ref.should_replace_module(ResolvedVc::upcast(module))
            )? {
                Some(None) => return Ok(None),
                Some(Some(replacement)) => replacement,
                None => module,
            };

            Ok(Some(ChunkableModuleOrBatch::Module(module)))
        }
        ChunkableModuleOrBatch::Batch(batch) => Ok(Some(ChunkableModuleOrBatch::Batch(
            turbo_tasks::read!(map_module_batch(merged_modules, *batch).to_resolved())?,
        ))),
        ChunkableModuleOrBatch::None(i) => Ok(Some(ChunkableModuleOrBatch::None(i))),
    }
}
}

#[turbo_tasks::function]
async fn map_module_batch(
    merged_modules: Vc<MergedModuleInfo>,
    batch: Vc<ModuleBatch>,
) -> Result<Vc<ModuleBatch>> {
    let merged_modules = turbo_tasks::read!(merged_modules)?;
    let batch_ref = turbo_tasks::read!(batch)?;

    let replacements =
        turbo_tasks::read!(parallel_reads(batch_ref.modules.iter().copied().map(
            |module| merged_modules.should_replace_module(ResolvedVc::upcast(module))
        )))?;
    let mut modified = false;
    let modules = batch_ref
        .modules
        .iter()
        .copied()
        .zip(replacements)
        .filter_map(|(module, replacement)| match replacement {
            Some(None) => {
                modified = true;
                None
            }
            Some(Some(replacement)) => {
                modified = true;
                Some(replacement)
            }
            None => Some(module),
        })
        .collect::<Vec<_>>();

    if modified {
        Ok(ModuleBatch::new(
            ResolvedVc::deref_vec(modules),
            batch_ref.chunk_groups.clone(),
        ))
    } else {
        Ok(batch)
    }
}

#[turbo_tasks::function]
async fn map_module_batch_group(
    merged_modules: Vc<MergedModuleInfo>,
    group: Vc<ModuleBatchGroup>,
) -> Result<Vc<ModuleBatchGroup>> {
    let merged_modules_ref = turbo_tasks::read!(merged_modules)?;
    let group_ref = turbo_tasks::read!(group)?;

    let modified = AtomicBool::new(false);
    let items = turbo_tasks::read!(parallel_reads(group_ref.items.iter().copied().map(
        |module_or_batch| {
            map_module_or_batch_with_merged(
                module_or_batch,
                merged_modules,
                &merged_modules_ref,
                &modified,
            )
        }
    )))?
    .into_iter()
    .flatten()
    .collect();

    if modified.into_inner() {
        Ok(ModuleBatchGroup::new(items, group_ref.chunk_groups.clone()))
    } else {
        Ok(group)
    }
}

turbo_tasks::dual_fn! {
/// Per-item body of [`map_module_batch_group`].
fn map_module_or_batch_with_merged(
    module_or_batch: ModuleOrBatch,
    merged_modules: Vc<MergedModuleInfo>,
    merged_modules_ref: &MergedModuleInfo,
    modified: &AtomicBool,
) -> Result<Option<ModuleOrBatch>> {
    match module_or_batch {
        ModuleOrBatch::Module(module) => {
            let module = match turbo_tasks::read!(merged_modules_ref.should_replace_module(module))? {
                Some(None) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    return Ok(None);
                }
                Some(Some(replacement)) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    ResolvedVc::upcast(replacement)
                }
                None => module,
            };

            Ok(Some(ModuleOrBatch::Module(module)))
        }
        ModuleOrBatch::Batch(batch) => {
            let replacement =
                turbo_tasks::read!(map_module_batch(merged_modules, *batch).to_resolved())?;
            if replacement != batch {
                modified.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            Ok(Some(ModuleOrBatch::Batch(replacement)))
        }
        ModuleOrBatch::None(i) => Ok(Some(ModuleOrBatch::None(i))),
    }
}
}
