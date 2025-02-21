use std::collections::HashSet;

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Value, Vc};

use super::{
    availability_info::AvailabilityInfo, chunking::make_chunks, Chunk, ChunkGroupContent,
    ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkingContext,
};
use crate::{
    chunk::{chunk_item_batch::ChunkItemOrBatchWithAsyncModuleInfo, ChunkingType},
    environment::ChunkLoading,
    module::Module,
    module_graph::{
        module_batch::{ChunkableModuleOrBatch, ModuleOrBatch},
        module_batches::{BatchingConfig, ModuleBatchesGraphEdge},
        GraphTraversalAction, ModuleGraph,
    },
    output::OutputAssets,
    reference::ModuleReference,
    traced_asset::TracedAsset,
};

pub struct MakeChunkGroupResult {
    pub chunks: Vec<ResolvedVc<Box<dyn Chunk>>>,
    pub availability_info: AvailabilityInfo,
}

/// Creates a chunk group from a set of entries.
pub async fn make_chunk_group(
    chunk_group_entries: impl IntoIterator<IntoIter = impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send>
        + Send,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = !matches!(
        *chunking_context.environment().chunk_loading().await?,
        ChunkLoading::Edge
    );
    let should_trace = *chunking_context.is_tracing_enabled().await?;
    let batching_config = chunking_context.batching_config();

    let ChunkGroupContent {
        chunkable_items,
        async_modules,
        traced_modules,
    } = chunk_group_content(
        module_graph,
        chunk_group_entries,
        availability_info,
        can_split_async,
        should_trace,
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
        .collect::<Vec<_>>();

    // Compute new [AvailabilityInfo]
    let availability_info = availability_info
        .with_modules(Vc::cell(chunkable_items))
        .await?;

    // Insert async chunk loaders for every referenced async module
    let async_loaders = async_modules
        .into_iter()
        .map(async |module| {
            chunking_context
                .async_loader_chunk_item(*module, module_graph, Value::new(availability_info))
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
        *chunking_context,
        chunk_items,
        "".into(),
        Vc::cell(referenced_output_assets),
    )
    .await?;

    Ok(MakeChunkGroupResult {
        chunks,
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
    chunk_group_entries: impl IntoIterator<IntoIter = impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send>
        + Send,
    availability_info: AvailabilityInfo,
    can_split_async: bool,
    should_trace: bool,
    batching_config: Vc<BatchingConfig>,
) -> Result<ChunkGroupContent> {
    let module_batches_graph = module_graph.module_batches(batching_config).await?;

    type ModuleToChunkableMap = FxHashMap<ModuleOrBatch, ChunkableModuleOrBatch>;

    struct TraverseState {
        unsorted_items: ModuleToChunkableMap,
        result: ChunkGroupContent,
    }

    let mut state = TraverseState {
        unsorted_items: FxHashMap::default(),
        result: ChunkGroupContent {
            chunkable_items: FxIndexSet::default(),
            async_modules: FxIndexSet::default(),
            traced_modules: FxIndexSet::default(),
        },
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

    module_batches_graph.traverse_edges_from_entries_topological(
        entries,
        &mut state,
        |parent_info,
         &node,
         TraverseState {
             unsorted_items,
             result,
         }| {
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
                    result.traced_modules.insert(module);
                }
                return Ok(GraphTraversalAction::Exclude);
            }

            let Some(chunkable_node) = node.try_to_chunkable_module() else {
                return Ok(GraphTraversalAction::Exclude);
            };

            let is_available = available_modules
                .as_ref()
                .is_some_and(|available_modules| available_modules.get(chunkable_node));

            let Some((_, edge)) = parent_info else {
                // An entry from the entries list
                return Ok(if is_available {
                    GraphTraversalAction::Exclude
                } else if unsorted_items.try_insert(node, chunkable_node).is_ok() {
                    GraphTraversalAction::Continue
                } else {
                    GraphTraversalAction::Exclude
                });
            };

            Ok(match edge.ty {
                ChunkingType::Parallel
                | ChunkingType::ParallelInheritAsync
                | ChunkingType::Shared { .. } => {
                    if is_available {
                        GraphTraversalAction::Exclude
                    } else if unsorted_items.try_insert(node, chunkable_node).is_ok() {
                        GraphTraversalAction::Continue
                    } else {
                        GraphTraversalAction::Exclude
                    }
                }
                ChunkingType::Async => {
                    if can_split_async {
                        let chunkable_module = ResolvedVc::try_downcast(edge.module)
                            .context("Module in async chunking edge is not chunkable")?;
                        result.async_modules.insert(chunkable_module);
                        GraphTraversalAction::Exclude
                    } else if is_available {
                        GraphTraversalAction::Exclude
                    } else if unsorted_items.try_insert(node, chunkable_node).is_ok() {
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
        |_,
         node,
         TraverseState {
             unsorted_items,
             result,
         }| {
            // Insert modules in topological order
            if let Some(chunkable_module) = unsorted_items.get(node).copied() {
                result.chunkable_items.insert(chunkable_module);
            }
        },
    )?;

    Ok(state.result)
}
