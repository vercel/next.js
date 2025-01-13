use std::collections::HashSet;

use anyhow::Result;
use auto_hash_map::AutoSet;
use futures::future::Either;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Value, Vc};

use super::{
    availability_info::AvailabilityInfo, available_modules::AvailableModulesInfo, chunk_content,
    chunking::make_chunks, AsyncModuleInfo, Chunk, ChunkContentResult, ChunkItem, ChunkItemTy,
    ChunkItemWithAsyncModuleInfo, ChunkableModule, ChunkingContext,
};
use crate::{
    environment::ChunkLoading, module::Module, output::OutputAssets, rebase::RebasedAsset,
    reference::ModuleReference,
};

pub struct MakeChunkGroupResult {
    pub chunks: Vec<ResolvedVc<Box<dyn Chunk>>>,
    pub availability_info: AvailabilityInfo,
}

/// Creates a chunk group from a set of entries.
pub async fn make_chunk_group(
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunk_group_entries: impl IntoIterator<Item = ResolvedVc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let can_split_async = !matches!(
        *chunking_context.environment().chunk_loading().await?,
        ChunkLoading::Edge
    );
    let should_trace = *chunking_context.is_tracing_enabled().await?;

    let ChunkContentResult {
        chunkable_modules,
        async_modules,
        traced_modules,
        passthrough_modules,
        forward_edges_inherit_async,
        local_back_edges_inherit_async,
        available_async_modules_back_edges_inherit_async,
    } = chunk_content(
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
                .async_loader_chunk_item(*module, Value::new(availability_info))
                .to_resolved()
                .await
        })
        .try_join()
        .await?;
    let has_async_loaders = !async_loaders.is_empty();
    let async_loader_chunk_items =
        async_loaders
            .iter()
            .map(|&chunk_item| ChunkItemWithAsyncModuleInfo {
                ty: ChunkItemTy::Included,
                chunk_item,
                async_info: None,
            });

    // And also add output assets referenced by async chunk loaders
    let async_loader_references = async_loaders
        .iter()
        .map(|&loader| loader.references())
        .try_join()
        .await?;
    let async_loader_external_module_references = Vc::cell(
        async_loader_references
            .iter()
            .flat_map(|references| references.iter().copied())
            .collect(),
    );

    let traced_output_assets = traced_modules
        .into_iter()
        .map(|module| async move {
            Ok(ResolvedVc::upcast(
                RebasedAsset::new(
                    *module,
                    module.ident().path().root(),
                    module.ident().path().root(),
                )
                .to_resolved()
                .await?,
            ))
        })
        .try_join()
        .await?;

    let chunk_items = all_modules
        .iter()
        .map(|(m, async_info)| {
            Either::Left(async move {
                Ok(ChunkItemWithAsyncModuleInfo {
                    ty: ChunkItemTy::Included,
                    chunk_item: m.as_chunk_item(*chunking_context).to_resolved().await?,
                    async_info: *async_info,
                })
            })
        })
        .chain(passthrough_modules.into_iter().map(|m| {
            Either::Right(async move {
                Ok(ChunkItemWithAsyncModuleInfo {
                    ty: ChunkItemTy::Passthrough,
                    chunk_item: m.as_chunk_item(*chunking_context).to_resolved().await?,
                    async_info: None,
                })
            })
        }))
        .try_join()
        .await?;

    // Pass chunk items to chunking algorithm
    let mut chunks = make_chunks(
        *chunking_context,
        Vc::cell(chunk_items),
        "".into(),
        Vc::cell(traced_output_assets),
    )
    .await?
    .clone_value();

    if has_async_loaders {
        // Pass async chunk loaders to chunking algorithm
        // We want them to be separate since they are specific to this chunk group due
        // to available chunk items differing
        let async_loader_chunks = make_chunks(
            *chunking_context,
            Vc::cell(async_loader_chunk_items.into_iter().collect()),
            "async-loader-".into(),
            async_loader_external_module_references,
        )
        .await?;

        // concatenate chunks
        chunks.extend(async_loader_chunks.iter().copied());
    }

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
