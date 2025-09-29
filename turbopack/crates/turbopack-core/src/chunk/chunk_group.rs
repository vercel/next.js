use std::{cell::RefCell, collections::HashSet, sync::atomic::AtomicBool};

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};

use super::{
    Chunk, ChunkGroupContent, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkingContext,
    availability_info::AvailabilityInfo, chunking::make_chunks,
};
use crate::{
    chunk::{
        ChunkableModule, ChunkingType,
        chunk_item_batch::{ChunkItemBatchGroup, ChunkItemOrBatchWithAsyncModuleInfo},
    },
    environment::ChunkLoading,
    module::Module,
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        merged_modules::MergedModuleInfo,
        module_batch::{
            ChunkableModuleBatchGroup, ChunkableModuleOrBatch, ModuleBatch, ModuleBatchGroup,
            ModuleOrBatch,
        },
        module_batches::{BatchingConfig, ModuleBatchesGraphEdge},
    },
    output::{OutputAsset, OutputAssets},
    reference::ModuleReference,
    traced_asset::TracedAsset,
};

pub struct MakeChunkGroupResult {
    pub chunks: Vec<ResolvedVc<Box<dyn Chunk>>>,
    pub referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    pub availability_info: AvailabilityInfo,
}

/// Creates a chunk group from a set of entries.
pub async fn make_chunk_group(
    chunk_group_entries: impl IntoIterator<
        IntoIter = impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send,
    > + Send
    + Clone,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = !matches!(
        *chunking_context.environment().chunk_loading().await?,
        ChunkLoading::Edge
    );
    let should_trace = *chunking_context.is_tracing_enabled().await?;
    let should_merge_modules = *chunking_context.is_module_merging_enabled().await?;
    let batching_config = chunking_context.batching_config();

    let ChunkGroupContent {
        chunkable_items,
        batch_groups,
        async_modules,
        traced_modules,
        availability_info,
    } = chunk_group_content(
        module_graph,
        chunk_group_entries.clone(),
        availability_info,
        can_split_async,
        should_trace,
        should_merge_modules,
        batching_config,
    )
    .await?;

    let async_modules_info = module_graph.async_module_info().await?;

    // Attach async info to chunkable modules
    let mut chunk_items = chunkable_items
        .iter()
        .copied()
        .map(|m| {
            ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                m,
                &async_modules_info,
                module_graph,
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
                module_graph,
                *chunking_context,
            )
            .to_resolved()
        })
        .try_join()
        .await?;

    // Insert async chunk loaders for every referenced async module
    let async_loaders = async_modules
        .into_iter()
        .map(async |module| {
            chunking_context
                .async_loader_chunk_item(*module, module_graph, availability_info)
                .to_resolved()
                .await
        })
        .try_join()
        .await?;
    let async_loader_chunk_items = async_loaders.iter().map(|&chunk_item| {
        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(ChunkItemWithAsyncModuleInfo {
            chunk_item,
            module: None,
            async_info: None,
        })
    });

    // And also add output assets referenced by async chunk loaders
    let async_loader_references = async_loaders
        .iter()
        .map(|&loader| loader.references())
        .try_join()
        .await?;

    let mut referenced_output_assets = traced_modules
        .into_iter()
        .map(|module| async move {
            Ok(ResolvedVc::upcast(
                TracedAsset::new(*module).to_resolved().await?,
            ))
        })
        .try_join()
        .await?;

    chunk_items.extend(async_loader_chunk_items);
    referenced_output_assets.reserve(
        async_loader_references
            .iter()
            .map(|r| r.len())
            .sum::<usize>(),
    );
    referenced_output_assets.extend(async_loader_references.into_iter().flatten());

    // Pass chunk items to chunking algorithm
    let chunks = make_chunks(
        module_graph,
        chunking_context,
        chunk_items,
        chunk_item_batch_groups,
        rcstr!(""),
    )
    .await?;

    Ok(MakeChunkGroupResult {
        chunks,
        referenced_output_assets,
        availability_info,
    })
}

pub async fn references_to_output_assets(
    references: impl IntoIterator<Item = &ResolvedVc<Box<dyn ModuleReference>>>,
) -> Result<Vc<OutputAssets>> {
    let output_assets = references
        .into_iter()
        .map(|reference| reference.resolve_reference().primary_output_assets())
        .try_join()
        .await?;
    let mut set = HashSet::new();
    let output_assets = output_assets
        .iter()
        .flatten()
        .copied()
        .filter(|&asset| set.insert(asset))
        .map(|asset| *asset)
        .collect::<Vec<_>>();
    Ok(OutputAssets::new(output_assets))
}

pub async fn chunk_group_content(
    module_graph: Vc<ModuleGraph>,
    chunk_group_entries: impl IntoIterator<
        IntoIter = impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send,
    > + Send,
    availability_info: AvailabilityInfo,
    can_split_async: bool,
    should_trace: bool,
    should_merge_modules: bool,
    batching_config: Vc<BatchingConfig>,
) -> Result<ChunkGroupContent> {
    let module_batches_graph = module_graph.module_batches(batching_config).await?;

    type ModuleToChunkableMap = FxHashMap<ModuleOrBatch, ChunkableModuleOrBatch>;

    struct TraverseState {
        unsorted_items: ModuleToChunkableMap,
        chunkable_items: FxIndexSet<ChunkableModuleOrBatch>,
        async_modules: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
        traced_modules: FxIndexSet<ResolvedVc<Box<dyn Module>>>,
    }

    let mut state = TraverseState {
        unsorted_items: FxHashMap::default(),
        chunkable_items: FxIndexSet::default(),
        async_modules: FxIndexSet::default(),
        traced_modules: FxIndexSet::default(),
    };

    let available_modules = match availability_info.available_modules() {
        Some(available_modules) => Some(available_modules.snapshot().await?),
        None => None,
    };

    let chunk_group_entries = chunk_group_entries.into_iter();
    let mut entries = Vec::with_capacity(chunk_group_entries.size_hint().0);
    for entry in chunk_group_entries {
        entries.push(module_batches_graph.get_entry_index(entry).await?);
    }

    module_batches_graph.traverse_edges_from_entries_dfs(
        entries,
        &mut state,
        |parent_info, &node, state| {
            // Traced modules need to have a special handling
            if let Some((
                _,
                ModuleBatchesGraphEdge {
                    ty: ChunkingType::Traced,
                    ..
                },
            )) = parent_info
            {
                if should_trace {
                    let ModuleOrBatch::Module(module) = node else {
                        unreachable!();
                    };
                    state.traced_modules.insert(module);
                }
                return Ok(GraphTraversalAction::Exclude);
            }

            let Some(chunkable_node) = ChunkableModuleOrBatch::from_module_or_batch(node) else {
                return Ok(GraphTraversalAction::Exclude);
            };

            let is_available = available_modules
                .as_ref()
                .is_some_and(|available_modules| available_modules.get(chunkable_node));

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
                        let chunkable_module = ResolvedVc::try_downcast(edge.module.unwrap())
                            .context("Module in async chunking edge is not chunkable")?;
                        state.async_modules.insert(chunkable_module);
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
                ChunkingType::Traced => {
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

    // This needs to use the unmerged items
    let availability_info = availability_info
        .with_modules(Vc::cell(state.chunkable_items.clone()))
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
                    if !merged_modules_ref.should_create_chunk_item_for(ResolvedVc::upcast(module))
                    {
                        return Ok(None);
                    }

                    let module = if let Some(replacement) =
                        merged_modules_ref.should_replace_module(ResolvedVc::upcast(module))
                    {
                        replacement
                    } else {
                        module
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

    Ok(ChunkGroupContent {
        chunkable_items,
        batch_groups,
        async_modules: state.async_modules,
        traced_modules: state.traced_modules,
        availability_info,
    })
}

#[turbo_tasks::function]
async fn map_module_batch(
    merged_modules: Vc<MergedModuleInfo>,
    batch: Vc<ModuleBatch>,
) -> Result<Vc<ModuleBatch>> {
    let merged_modules = merged_modules.await?;
    let batch_ref = batch.await?;

    let modified = RefCell::new(false);
    let modules = batch_ref
        .modules
        .iter()
        .flat_map(|&module| {
            if !merged_modules.should_create_chunk_item_for(ResolvedVc::upcast(module)) {
                *modified.borrow_mut() = true;
                return None;
            }

            let module = if let Some(replacement) =
                merged_modules.should_replace_module(ResolvedVc::upcast(module))
            {
                *modified.borrow_mut() = true;
                replacement
            } else {
                module
            };

            Some(module)
        })
        .collect::<Vec<_>>();

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
                if !merged_modules_ref.should_create_chunk_item_for(module) {
                    modified.store(true, std::sync::atomic::Ordering::Relaxed);
                    return Ok(None);
                }

                let module =
                    if let Some(replacement) = merged_modules_ref.should_replace_module(module) {
                        modified.store(true, std::sync::atomic::Ordering::Relaxed);
                        ResolvedVc::upcast(replacement)
                    } else {
                        module
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
