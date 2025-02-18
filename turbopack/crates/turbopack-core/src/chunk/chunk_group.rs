use std::collections::HashSet;

use anyhow::Result;
use futures::future::Either;
use rustc_hash::FxHashMap;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Value, Vc};

use super::{
    availability_info::AvailabilityInfo, chunking::make_chunks, AsyncModuleInfo, Chunk,
    ChunkGroupContent, ChunkItem, ChunkItemTy, ChunkItemWithAsyncModuleInfo, ChunkableModule,
    ChunkingContext,
};
use crate::{
    chunk::ChunkingType,
    environment::ChunkLoading,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
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
    chunk_group_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = !matches!(
        *chunking_context.environment().chunk_loading().await?,
        ChunkLoading::Edge
    );
    let should_trace = *chunking_context.is_tracing_enabled().await?;

    let ChunkGroupContent {
        chunkable_modules,
        async_modules,
        traced_modules,
        passthrough_modules,
    } = chunk_group_content(
        &*module_graph.await?,
        chunk_group_entries,
        availability_info,
        can_split_async,
        should_trace,
    )
    .await?;

    let async_modules_info = module_graph.async_module_info().await?;

    // Create map for chunk items with empty [Option<Vc<AsyncModuleInfo>>]
    let all_modules = chunkable_modules
        .iter()
        .copied()
        .map(async |m| {
            if async_modules_info.contains(&ResolvedVc::upcast(m)) {
                anyhow::Ok((
                    m,
                    Some(
                        module_graph
                            .referenced_async_modules(*ResolvedVc::upcast(m))
                            .to_resolved()
                            .await?,
                    ),
                ))
            } else {
                anyhow::Ok((m, None))
            }
        })
        .try_join()
        .await?
        .into_iter()
        .collect::<FxIndexMap<_, Option<ResolvedVc<AsyncModuleInfo>>>>();

    // Compute new [AvailabilityInfo]
    let availability_info = availability_info
        .with_modules(Vc::cell(chunkable_modules))
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
    let async_loader_chunk_items =
        async_loaders
            .iter()
            .map(|&chunk_item| ChunkItemWithAsyncModuleInfo {
                ty: ChunkItemTy::Included,
                chunk_item,
                module: None,
                async_info: None,
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

    let mut chunk_items = all_modules
        .iter()
        .map(|(module, async_info)| {
            Either::Left(async move {
                Ok(ChunkItemWithAsyncModuleInfo {
                    ty: ChunkItemTy::Included,
                    chunk_item: module
                        .as_chunk_item(module_graph, *chunking_context)
                        .to_resolved()
                        .await?,
                    module: Some(*module),
                    async_info: *async_info,
                })
            })
        })
        .chain(passthrough_modules.into_iter().map(|module| {
            Either::Right(async move {
                Ok(ChunkItemWithAsyncModuleInfo {
                    ty: ChunkItemTy::Passthrough,
                    chunk_item: module
                        .as_chunk_item(module_graph, *chunking_context)
                        .to_resolved()
                        .await?,
                    module: Some(module),
                    async_info: None,
                })
            })
        }))
        .try_join()
        .await?;

    chunk_items.extend(async_loader_chunk_items);
    referenced_output_assets.reserve(async_loader_references.iter().map(|r| r.len()).sum());
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
    module_graph: &ModuleGraph,
    chunk_group_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
    can_split_async: bool,
    should_trace: bool,
) -> Result<ChunkGroupContent> {
    type ModuleToChunkableMap =
        FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn ChunkableModule>>>;

    struct TraverseState {
        unsorted_chunkable_modules: ModuleToChunkableMap,
        result: ChunkGroupContent,
    }

    let mut state = TraverseState {
        unsorted_chunkable_modules: FxHashMap::default(),
        result: ChunkGroupContent {
            chunkable_modules: FxIndexSet::default(),
            async_modules: FxIndexSet::default(),
            traced_modules: FxIndexSet::default(),
            passthrough_modules: FxIndexSet::default(),
        },
    };

    let available_modules = match availability_info.available_modules() {
        Some(available_modules) => Some(available_modules.snapshot().await?),
        None => None,
    };

    module_graph
        .traverse_edges_from_entries_topological(
            chunk_group_entries,
            &mut state,
            |parent_info,
             node,
             TraverseState {
                 unsorted_chunkable_modules,
                 result,
             }| {
                if let Some((_, ChunkingType::Traced)) = parent_info {
                    if should_trace {
                        result.traced_modules.insert(node.module);
                    }
                    return Ok(GraphTraversalAction::Skip);
                }

                let Some(chunkable_module) =
                    ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(node.module)
                else {
                    return Ok(GraphTraversalAction::Skip);
                };

                let is_available = available_modules
                    .as_ref()
                    .is_some_and(|available_modules| available_modules.get(chunkable_module));

                let Some((_, edge)) = parent_info else {
                    return Ok(if is_available {
                        GraphTraversalAction::Skip
                    } else {
                        unsorted_chunkable_modules.insert(node.module, chunkable_module);
                        GraphTraversalAction::Continue
                    });
                };

                Ok(match edge {
                    ChunkingType::Passthrough => {
                        result.passthrough_modules.insert(chunkable_module);
                        GraphTraversalAction::Continue
                    }
                    ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => {
                        if is_available {
                            GraphTraversalAction::Skip
                        } else {
                            unsorted_chunkable_modules.insert(node.module, chunkable_module);
                            GraphTraversalAction::Continue
                        }
                    }
                    ChunkingType::Async => {
                        if can_split_async {
                            result.async_modules.insert(chunkable_module);
                            GraphTraversalAction::Skip
                        } else if is_available {
                            GraphTraversalAction::Skip
                        } else {
                            unsorted_chunkable_modules.insert(node.module, chunkable_module);
                            GraphTraversalAction::Continue
                        }
                    }
                    ChunkingType::Traced => {
                        // handled above before the sidecast
                        unreachable!();
                    }
                    ChunkingType::Isolated { .. } => {
                        // TODO currently not implemented
                        GraphTraversalAction::Skip
                    }
                })
            },
            |_,
             node,
             TraverseState {
                 unsorted_chunkable_modules,
                 result,
             }| {
                // Insert modules in topological order
                if let Some(chunkable_module) =
                    unsorted_chunkable_modules.get(&node.module).copied()
                {
                    result.chunkable_modules.insert(chunkable_module);
                }
            },
        )
        .await?;

    Ok(state.result)
}
