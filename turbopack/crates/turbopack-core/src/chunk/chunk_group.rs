use std::collections::HashSet;

use anyhow::{Context, Result};
use auto_hash_map::AutoSet;
use futures::future::Either;
use rustc_hash::FxHashMap;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Value, Vc,
};

use super::{
    availability_info::AvailabilityInfo, available_modules::AvailableModulesInfo,
    chunking::make_chunks, AsyncModuleInfo, Chunk, ChunkGroupContent, ChunkItem, ChunkItemTy,
    ChunkItemWithAsyncModuleInfo, ChunkableModule, ChunkingContext,
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
        forward_edges_inherit_async,
        local_back_edges_inherit_async,
        available_async_modules_back_edges_inherit_async,
    } = chunk_group_content(
        &*module_graph.await?,
        chunk_group_entries,
        availability_info,
        can_split_async,
        should_trace,
    )
    .await?;

    // Find all local chunk items that are self async
    let self_async_children = chunkable_modules
        .iter()
        .copied()
        .map(|m| async move {
            let is_self_async = *m.is_self_async().await?;
            Ok(is_self_async.then_some(m))
        })
        .try_flat_join()
        .await?;

    // Get all available async modules and concatenate with local async modules
    let mut all_async_modules = available_async_modules_back_edges_inherit_async
        .keys()
        .copied()
        .chain(self_async_children.into_iter())
        .map(|m| (m, AutoSet::<ResolvedVc<Box<dyn ChunkableModule>>>::new()))
        .collect::<FxIndexMap<_, _>>();

    // Propagate async inheritance
    let mut i = 0;
    loop {
        let Some((&async_module, _)) = all_async_modules.get_index(i) else {
            break;
        };
        // The first few entries are from
        // available_async_modules_back_edges_inherit_async and need to use that map,
        // all other entries are local
        let map = if i < available_async_modules_back_edges_inherit_async.len() {
            &available_async_modules_back_edges_inherit_async
        } else {
            &local_back_edges_inherit_async
        };
        if let Some(parents) = map.get(&async_module) {
            for &parent in parents.iter() {
                // Add item, it will be iterated by this loop too
                all_async_modules
                    .entry(parent)
                    .or_default()
                    .insert(async_module);
            }
        }
        i += 1;
    }

    // Create map for chunk items with empty [Option<Vc<AsyncModuleInfo>>]
    let mut all_modules = chunkable_modules
        .into_iter()
        .map(|m| (m, None))
        .collect::<FxIndexMap<_, Option<ResolvedVc<AsyncModuleInfo>>>>();

    // Insert AsyncModuleInfo for every async module
    for (async_item, referenced_async_modules) in all_async_modules {
        let referenced_async_modules =
            if let Some(references) = forward_edges_inherit_async.get(&async_item) {
                references
                    .iter()
                    .copied()
                    .filter(|item| referenced_async_modules.contains(item))
                    .map(|item| *item)
                    .collect()
            } else {
                Default::default()
            };
        all_modules.insert(
            async_item,
            Some(
                AsyncModuleInfo::new(referenced_async_modules)
                    .to_resolved()
                    .await?,
            ),
        );
    }

    // Compute new [AvailabilityInfo]
    let availability_info = {
        let map = all_modules
            .iter()
            .map(|(&module, async_info)| async move {
                Ok((
                    module,
                    AvailableModulesInfo {
                        is_async: async_info.is_some(),
                    },
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect();
        let map = Vc::cell(map);
        availability_info.with_modules(map).await?
    };

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
        Vc::cell(chunk_items),
        "".into(),
        Vc::cell(referenced_output_assets),
    )
    .owned()
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
            forward_edges_inherit_async: FxIndexMap::default(),
            local_back_edges_inherit_async: FxIndexMap::default(),
            available_async_modules_back_edges_inherit_async: FxIndexMap::default(),
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

                let available_info = available_modules
                    .as_ref()
                    .and_then(|available_modules| available_modules.get(chunkable_module));

                let Some((parent_node, edge)) = parent_info else {
                    return Ok(if available_info.is_some() {
                        GraphTraversalAction::Skip
                    } else {
                        unsorted_chunkable_modules.insert(node.module, chunkable_module);
                        GraphTraversalAction::Continue
                    });
                };

                let parent_module =
                    ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(parent_node.module)
                        .context("Expected parent module to be chunkable")?;

                Ok(match edge {
                    ChunkingType::Passthrough => {
                        result.passthrough_modules.insert(chunkable_module);
                        GraphTraversalAction::Continue
                    }
                    ChunkingType::Parallel => {
                        if available_info.is_some() {
                            GraphTraversalAction::Skip
                        } else {
                            unsorted_chunkable_modules.insert(node.module, chunkable_module);
                            GraphTraversalAction::Continue
                        }
                    }
                    ChunkingType::ParallelInheritAsync => {
                        result
                            .forward_edges_inherit_async
                            .entry(parent_module)
                            .or_default()
                            .push(chunkable_module);
                        if let Some(info) = available_info {
                            if info.is_async {
                                result
                                    .available_async_modules_back_edges_inherit_async
                                    .entry(chunkable_module)
                                    .or_default()
                                    .push(parent_module);
                            }
                            GraphTraversalAction::Skip
                        } else {
                            result
                                .local_back_edges_inherit_async
                                .entry(chunkable_module)
                                .or_default()
                                .push(parent_module);
                            unsorted_chunkable_modules.insert(node.module, chunkable_module);
                            GraphTraversalAction::Continue
                        }
                    }
                    ChunkingType::Async => {
                        if can_split_async {
                            result.async_modules.insert(chunkable_module);
                            GraphTraversalAction::Skip
                        } else if available_info.is_some() {
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
