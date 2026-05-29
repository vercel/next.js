use std::sync::atomic::AtomicBool;

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, OperationVc, ResolvedVc, TaskInput, TryFlatJoinIterExt,
    TryJoinIterExt, Vc, trace::TraceRawVcs,
};

use super::{
    ChunkItemWithAsyncModuleInfo, ChunkingContext, availability_info::AvailabilityInfo,
    chunking::make_chunks,
};
use crate::{
    chunk::{
        ChunkGroupContent, ChunkGroupContentInner, ChunkableModule, ChunkingType, Chunks,
        available_modules::{AvailableModuleItem, AvailableModulesSet},
        chunk_item_batch::{ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo},
    },
    environment::ChunkLoading,
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

/// Creates a chunk group from a set of entries.
pub async fn make_chunk_group(
    chunk_group: ChunkGroup,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = !matches!(
        *chunking_context.environment().chunk_loading().await?,
        ChunkLoading::Edge
    );
    let is_nested_async_availability_enabled = *chunking_context
        .is_nested_async_availability_enabled()
        .await?;
    let should_merge_modules = *chunking_context.is_module_merging_enabled().await?;
    let batching_config = chunking_context.batching_config().to_resolved().await?;

    let ChunkGroupContent {
        inner,
        availability_info: new_availability_info,
    } = chunk_group_content(
        module_graph,
        chunk_group,
        ChunkGroupContentOptions {
            availability_info,
            can_split_async,
            should_merge_modules,
            batching_config,
        },
    )
    .await?;
    let ChunkGroupContentInner {
        chunkable_items,
        batch_groups,
        async_modules,
        available_modules: _,
    } = &*inner;

    let async_module_info = module_graph.async_module_info();

    // Attach async info to chunkable modules
    let mut chunk_items = chunkable_items
        .iter()
        .copied()
        .map(|m| {
            ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                m,
                async_module_info,
                *module_graph,
                *chunking_context,
            )
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    let chunk_item_batch_groups = batch_groups
        .iter()
        .map(|&batch_group| {
            ChunkItemBatchGroup::from_module_batch_group(
                ChunkableModuleBatchGroup::from_module_batch_group(*batch_group),
                *module_graph,
                *chunking_context,
            )
            .to_resolved()
        })
        .try_join()
        .await?;

    // Insert async chunk loaders for every referenced async module
    let async_availability_info =
        if is_nested_async_availability_enabled || !availability_info.is_in_async_module() {
            new_availability_info.in_async_module()
        } else {
            availability_info
        };
    let async_loaders = async_modules
        .iter()
        .copied()
        .map(async |module| {
            chunking_context
                .async_loader_chunk_item(*module, *module_graph, async_availability_info)
                .to_resolved()
                .await
        })
        .try_join()
        .await?;
    let async_loader_chunk_items = async_loaders
        .iter()
        .map(async |&chunk_item| {
            let chunk_type = chunk_item
                .into_trait_ref()
                .await?
                .ty()
                .to_resolved()
                .await?;
            Ok(ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(
                ChunkItemWithAsyncModuleInfo {
                    chunk_item,
                    chunk_type,
                    module: None,
                    async_info: None,
                },
            ))
        })
        .try_join()
        .await?;

    chunk_items.extend(async_loader_chunk_items);

    // Pass chunk items to chunking algorithm
    let chunks = make_chunks(
        *module_graph,
        *chunking_context,
        Vc::cell(chunk_items),
        Vc::cell(chunk_item_batch_groups),
        rcstr!(""),
    )
    .to_resolved()
    .await?;

    Ok(MakeChunkGroupResult {
        chunks,
        references: ResolvedVc::upcast_vec(async_loaders),
        availability_info: new_availability_info,
    })
}

#[derive(
    Debug, Clone, Hash, TaskInput, PartialEq, Eq, TraceRawVcs, NonLocalValue, Encode, Decode,
)]
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

/// Computes the content of a chunk group.
pub async fn chunk_group_content(
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_group: ChunkGroup,
    options: ChunkGroupContentOptions,
) -> Result<ChunkGroupContent> {
    let availability_info = options.availability_info;
    let chunk_group_content = chunk_group_content_operation(module_graph, chunk_group, options);
    let available_modules = available_modules_operation(chunk_group_content);
    let inner = chunk_group_content.connect().await?;

    Ok(ChunkGroupContent {
        inner,
        availability_info: availability_info.with_modules(available_modules).await?,
    })
}

#[turbo_tasks::function(operation)]
async fn available_modules_operation(
    chunk_group_content: OperationVc<ChunkGroupContentInner>,
) -> Result<Vc<AvailableModulesSet>> {
    Ok(*chunk_group_content.connect().await?.available_modules)
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
    let module_batches_graph = module_graph.module_batches(*batching_config).await?;

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
        Some(available_modules) => Some(available_modules.snapshot().await?),
        None => None,
    };

    let mut entries = Vec::with_capacity(chunk_group.entries_count());
    for entry in chunk_group.entries() {
        entries.push(module_batches_graph.get_entry_index(entry).await?);
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
        Vc::<AvailableModulesSet>::cell(available_modules)
            .to_resolved()
            .await?;

    let should_merge_modules = if should_merge_modules {
        let merged_modules = module_graph.merged_modules();
        let merged_modules_ref = merged_modules.await?;
        Some((merged_modules, merged_modules_ref))
    } else {
        None
    };

    let chunkable_items = if let Some((merged_modules, merged_modules_ref)) = &should_merge_modules
    {
        state
            .chunkable_items
            .into_iter()
            .map(async |chunkable_module| match chunkable_module {
                ChunkableModuleOrBatch::Module(module) => {
                    let module = match merged_modules_ref
                        .should_replace_module(ResolvedVc::upcast(module))
                        .await?
                    {
                        Some(None) => return Ok(None),
                        Some(Some(replacement)) => replacement,
                        None => module,
                    };

                    Ok(Some(ChunkableModuleOrBatch::Module(module)))
                }
                ChunkableModuleOrBatch::Batch(batch) => Ok(Some(ChunkableModuleOrBatch::Batch(
                    map_module_batch(*merged_modules, *batch)
                        .to_resolved()
                        .await?,
                ))),
                ChunkableModuleOrBatch::None(i) => Ok(Some(ChunkableModuleOrBatch::None(i))),
            })
            .try_flat_join()
            .instrument(tracing::trace_span!("replace with merged modules"))
            .await?
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
        batch_groups
            .into_iter()
            .map(|group| map_module_batch_group(*merged_modules, *group).to_resolved())
            .try_join()
            .await?
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

#[turbo_tasks::function]
async fn map_module_batch(
    merged_modules: Vc<MergedModuleInfo>,
    batch: Vc<ModuleBatch>,
) -> Result<Vc<ModuleBatch>> {
    let merged_modules = merged_modules.await?;
    let batch_ref = batch.await?;

    let modified = AtomicBool::new(false);
    let modules = batch_ref
        .modules
        .iter()
        .copied()
        .map(async |module| {
            let module = match merged_modules
                .should_replace_module(ResolvedVc::upcast(module))
                .await?
            {
                Some(None) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    return Ok(None);
                }
                Some(Some(replacement)) => {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    replacement
                }
                None => module,
            };

            Ok(Some(module))
        })
        .try_flat_join()
        .await?;

    if modified.into_inner() {
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
    let merged_modules_ref = merged_modules.await?;
    let group_ref = group.await?;

    let modified = AtomicBool::new(false);
    let items = group_ref
        .items
        .iter()
        .copied()
        .map(async |chunkable_module| match chunkable_module {
            ModuleOrBatch::Module(module) => {
                let module = match merged_modules_ref.should_replace_module(module).await? {
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
                let replacement = map_module_batch(merged_modules, *batch)
                    .to_resolved()
                    .await?;
                if replacement != batch {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                }
                Ok(Some(ModuleOrBatch::Batch(replacement)))
            }
            ModuleOrBatch::None(i) => Ok(Some(ModuleOrBatch::None(i))),
        })
        .try_flat_join()
        .await?;

    if modified.into_inner() {
        Ok(ModuleBatchGroup::new(items, group_ref.chunk_groups.clone()))
    } else {
        Ok(group)
    }
}
