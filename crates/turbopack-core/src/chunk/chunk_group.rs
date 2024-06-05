use std::collections::HashSet;

use anyhow::Result;
use auto_hash_map::AutoSet;
use indexmap::{IndexMap, IndexSet};
use turbo_tasks::{TryFlatJoinIterExt, TryJoinIterExt, Value, Vc};

use super::{
    availability_info::AvailabilityInfo, available_chunk_items::AvailableChunkItemInfo,
    chunk_content, chunking::make_chunks, AsyncModuleInfo, Chunk, ChunkContentResult, ChunkItem,
    ChunkingContext,
};
use crate::{module::Module, output::OutputAssets, reference::ModuleReference};

pub struct MakeChunkGroupResult {
    pub chunks: Vec<Vc<Box<dyn Chunk>>>,
    pub availability_info: AvailabilityInfo,
}

/// Creates a chunk group from a set of entries.
pub async fn make_chunk_group(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    entries: impl IntoIterator<Item = Vc<Box<dyn Module>>>,
    availability_info: AvailabilityInfo,
) -> Result<MakeChunkGroupResult> {
    let ChunkContentResult {
        chunk_items,
        async_modules,
        external_module_references,
        forward_edges_inherit_async,
        local_back_edges_inherit_async,
        available_async_modules_back_edges_inherit_async,
    } = chunk_content(chunking_context, entries, availability_info).await?;

    // Find all local chunk items that are self async
    let self_async_children = chunk_items
        .iter()
        .copied()
        .map(|chunk_item| async move {
            let is_self_async = *chunk_item.is_self_async().await?;
            Ok(is_self_async.then_some(chunk_item))
        })
        .try_flat_join()
        .await?;

    // Get all available async modules and concatenate with local async modules
    let mut async_chunk_items = available_async_modules_back_edges_inherit_async
        .keys()
        .copied()
        .chain(self_async_children.into_iter())
        .map(|chunk_item| (chunk_item, AutoSet::<Vc<Box<dyn ChunkItem>>>::new()))
        .collect::<IndexMap<_, _>>();

    // Propagate async inheritance
    let mut i = 0;
    loop {
        let Some((&chunk_item, _)) = async_chunk_items.get_index(i) else {
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
        if let Some(parents) = map.get(&chunk_item) {
            for &parent in parents.iter() {
                // Add item, it will be iterated by this loop too
                async_chunk_items
                    .entry(parent)
                    .or_default()
                    .insert(chunk_item);
            }
        }
        i += 1;
    }

    // Create map for chunk items with empty [Option<Vc<AsyncModuleInfo>>]
    let mut chunk_items = chunk_items
        .into_iter()
        .map(|chunk_item| (chunk_item, None))
        .collect::<IndexMap<_, Option<Vc<AsyncModuleInfo>>>>();

    // Insert AsyncModuleInfo for every async module
    for (async_item, referenced_async_modules) in async_chunk_items {
        let referenced_async_modules =
            if let Some(references) = forward_edges_inherit_async.get(&async_item) {
                references
                    .iter()
                    .copied()
                    .filter(|item| referenced_async_modules.contains(item))
                    .collect()
            } else {
                Default::default()
            };
        chunk_items.insert(
            async_item,
            Some(AsyncModuleInfo::new(referenced_async_modules)),
        );
    }

    // Compute new [AvailabilityInfo]
    let availability_info = {
        let map = chunk_items
            .iter()
            .map(|(&chunk_item, async_info)| {
                (
                    chunk_item,
                    AvailableChunkItemInfo {
                        is_async: async_info.is_some(),
                    },
                )
            })
            .collect();
        let map = Vc::cell(map);
        availability_info.with_chunk_items(map).await?
    };

    // Insert async chunk loaders for every referenced async module
    let async_loaders = async_modules
        .into_iter()
        .map(|module| {
            chunking_context.async_loader_chunk_item(module, Value::new(availability_info))
        })
        .collect::<Vec<_>>();
    let has_async_loaders = !async_loaders.is_empty();
    let async_loader_chunk_items = async_loaders.iter().map(|&chunk_item| (chunk_item, None));

    // And also add output assets referenced by async chunk loaders
    let async_loader_references = async_loaders
        .iter()
        .map(|&loader| loader.references())
        .try_join()
        .await?;
    let async_loader_external_module_references = async_loader_references
        .iter()
        .flat_map(|references| references.iter().copied())
        .collect();

    // Pass chunk items to chunking algorithm
    let mut chunks = make_chunks(
        chunking_context,
        Vc::cell(chunk_items.into_iter().collect()),
        "".into(),
        references_to_output_assets(external_module_references).await?,
    )
    .await?
    .clone_value();

    if has_async_loaders {
        // Pass async chunk loaders to chunking algorithm
        // We want them to be separate since they are specific to this chunk group due
        // to available chunk items differing
        let async_loader_chunks = make_chunks(
            chunking_context,
            Vc::cell(async_loader_chunk_items.into_iter().collect()),
            "async-loader-".into(),
            references_to_output_assets(async_loader_external_module_references).await?,
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

async fn references_to_output_assets(
    references: IndexSet<Vc<Box<dyn ModuleReference>>>,
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
        .collect::<Vec<_>>();
    Ok(OutputAssets::new(output_assets))
}
