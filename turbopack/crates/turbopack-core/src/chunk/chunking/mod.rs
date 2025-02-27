use std::{future::IntoFuture, mem::replace};

use anyhow::Result;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use smallvec::{smallvec, SmallVec};
use tracing::{Instrument, Level};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc,
    TryJoinIterExt, ValueToString, Vc,
};

use super::{Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingContext};
use crate::{
    chunk::{
        chunk_item_batch::{
            ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo,
            ChunkItemOrBatchWithAsyncModuleInfo,
        },
        chunking::{
            dev::{app_vendors_split, expand_batches},
            production::make_production_chunks,
        },
    },
    module_graph::ModuleGraph,
    output::OutputAssets,
};

mod dev;
mod production;

#[turbo_tasks::value]
struct ChunkItemsWithInfo {
    #[allow(clippy::type_complexity)]
    by_type: SmallVec<
        [(
            ResolvedVc<Box<dyn ChunkType>>,
            SmallVec<[ChunkItemOrBatchWithInfo; 1]>,
            SmallVec<[ResolvedVc<ChunkItemBatchGroup>; 1]>,
        ); 1],
    >,
}

#[turbo_tasks::value(transparent)]
struct BatchChunkItemsWithInfo(
    FxHashMap<ChunkItemOrBatchWithAsyncModuleInfo, ResolvedVc<ChunkItemsWithInfo>>,
);

#[derive(
    Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, ValueDebugFormat,
)]
enum ChunkItemOrBatchWithInfo {
    ChunkItem {
        chunk_item: ChunkItemWithAsyncModuleInfo,
        size: usize,
        asset_ident: RcStr,
    },
    Batch {
        batch: ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>,
        size: usize,
    },
}

impl ChunkItemOrBatchWithInfo {
    fn size(&self) -> usize {
        match self {
            ChunkItemOrBatchWithInfo::ChunkItem { size, .. } => *size,
            ChunkItemOrBatchWithInfo::Batch { size, .. } => *size,
        }
    }
}

#[turbo_tasks::function]
async fn batch_size(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    batch: Vc<ChunkItemBatchWithAsyncModuleInfo>,
) -> Result<Vc<usize>> {
    let size = batch
        .await?
        .chunk_items
        .iter()
        .map(
            |&ChunkItemWithAsyncModuleInfo {
                 chunk_item,
                 async_info,
                 module: _,
             }| {
                ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info))
            },
        )
        .try_join()
        .await?
        .into_iter()
        .map(|size| *size)
        .sum();
    Ok(Vc::cell(size))
}

async fn plain_chunk_items_with_info(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<ChunkItemsWithInfo> {
    Ok(match chunk_item_or_batch {
        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item_with_info) => {
            let ChunkItemWithAsyncModuleInfo {
                chunk_item,
                async_info,
                module: _,
            } = chunk_item_with_info;

            let asset_ident = chunk_item.asset_ident().to_string();
            let ty = chunk_item.ty();
            let chunk_item_size =
                ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info));

            ChunkItemsWithInfo {
                by_type: smallvec![(
                    ty.to_resolved().await?,
                    smallvec![ChunkItemOrBatchWithInfo::ChunkItem {
                        chunk_item: chunk_item_with_info,
                        size: *chunk_item_size.await?,
                        asset_ident: asset_ident.owned().await?,
                    }],
                    SmallVec::new(),
                )],
            }
        }
        ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
            let batch_by_type = batch.split_by_chunk_type().await?;
            let by_type = batch_by_type
                .iter()
                .map(|&(ty, ref chunk_item_or_batch)| {
                    plain_chunk_items_with_info_with_type(chunk_item_or_batch, ty, chunking_context)
                })
                .try_join()
                .await?;
            ChunkItemsWithInfo {
                by_type: by_type.into_iter().collect(),
            }
        }
    })
}

async fn plain_chunk_items_with_info_with_type(
    chunk_item_or_batch: &ChunkItemOrBatchWithAsyncModuleInfo,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<(
    ResolvedVc<Box<dyn ChunkType>>,
    SmallVec<[ChunkItemOrBatchWithInfo; 1]>,
    SmallVec<[ResolvedVc<ChunkItemBatchGroup>; 1]>,
)> {
    match chunk_item_or_batch {
        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item_with_info) => {
            let &ChunkItemWithAsyncModuleInfo {
                chunk_item,
                async_info,
                module: _,
            } = chunk_item_with_info;

            let asset_ident = chunk_item.asset_ident().to_string();
            let chunk_item_size =
                ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info));
            Ok((
                ty,
                smallvec![ChunkItemOrBatchWithInfo::ChunkItem {
                    chunk_item: chunk_item_with_info.clone(),
                    size: *chunk_item_size.await?,
                    asset_ident: asset_ident.owned().await?,
                }],
                SmallVec::new(),
            ))
        }
        &ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
            let size = *batch_size(chunking_context, *ty, *batch).await?;
            Ok((
                ty,
                smallvec![ChunkItemOrBatchWithInfo::Batch { batch, size }],
                SmallVec::new(),
            ))
        }
    }
}

#[turbo_tasks::function]
async fn chunk_items_with_info(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkItemsWithInfo>> {
    let chunk_items_with_info =
        plain_chunk_items_with_info(chunk_item_or_batch, chunking_context).await?;
    Ok(chunk_items_with_info.cell())
}

#[turbo_tasks::function]
async fn chunk_items_with_info_with_type(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkItemsWithInfo>> {
    let result =
        plain_chunk_items_with_info_with_type(&chunk_item_or_batch, ty, chunking_context).await?;
    Ok(ChunkItemsWithInfo {
        by_type: smallvec![result],
    }
    .cell())
}

#[turbo_tasks::function]
async fn batch_chunk_items_with_info(
    batch_group: Vc<ChunkItemBatchGroup>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<BatchChunkItemsWithInfo>> {
    let split_batch_group = batch_group.split_by_chunk_type().await?;
    if split_batch_group.len() == 1 {
        let &(ty, batch) = split_batch_group.into_iter().next().unwrap();
        Ok(batch_chunk_items_with_info_with_type(
            *batch,
            *ty,
            chunking_context,
        ))
    } else {
        let maps = split_batch_group
            .into_iter()
            .map(|&(ty, batch)| {
                batch_chunk_items_with_info_with_type(*batch, *ty, chunking_context)
            })
            .try_join()
            .await?;
        Ok(Vc::cell(
            maps.iter()
                .flatten()
                .map(|(key, &value)| (key.clone(), value))
                .collect(),
        ))
    }
}

#[turbo_tasks::function]
async fn batch_chunk_items_with_info_with_type(
    batch_group: Vc<ChunkItemBatchGroup>,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<BatchChunkItemsWithInfo>> {
    let batch_group = batch_group.await?;
    let map = batch_group
        .items
        .iter()
        .map(async |item| {
            Ok((
                item.clone(),
                chunk_items_with_info_with_type(item.clone(), *ty, chunking_context)
                    .to_resolved()
                    .await?,
            ))
        })
        .try_join()
        .await?
        .into_iter()
        .collect();
    Ok(Vc::cell(map))
}

/// Creates chunks based on heuristics for the passed `chunk_items`. Also
/// attaches `referenced_output_assets` to the first chunk.
pub async fn make_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    chunk_items_or_batches: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
    batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    key_prefix: RcStr,
    mut referenced_output_assets: Vc<OutputAssets>,
) -> Result<Vec<ResolvedVc<Box<dyn Chunk>>>> {
    let chunking_configs = &*chunking_context.chunking_configs().await?;

    let span = tracing::trace_span!(
        "get chunk item info",
        chunk_items_or_batches = chunk_items_or_batches.len()
    );
    // let chunk_items = todo!();
    let chunk_items: Vec<ReadRef<ChunkItemsWithInfo>> = ChunkItemBatchGroup::batch_info(
        &batch_groups,
        &chunk_items_or_batches,
        |batch_group| batch_chunk_items_with_info(batch_group, chunking_context).into_future(),
        |c| chunk_items_with_info(c.clone(), chunking_context).to_resolved(),
    )
    .instrument(span)
    .await?
    .into_iter()
    .try_join()
    .await?;

    let mut map = FxIndexMap::<_, (Vec<_>, Vec<_>)>::default();
    for result in chunk_items.iter() {
        for (ty, chunk_items, batch_groups) in result.by_type.iter() {
            let entry = map.entry(*ty).or_default();
            entry.0.extend(chunk_items);
            entry.1.extend(batch_groups);
        }
    }

    let mut chunks = Vec::new();
    for (ty, (chunk_items, batch_groups)) in map {
        let ty_name = ty.to_string().await?;
        let span = tracing::trace_span!("make chunks for type", name = ty_name.as_str());
        async {
            let mut split_context = SplitContext {
                ty,
                chunking_context,
                chunks: &mut chunks,
                referenced_output_assets: &mut referenced_output_assets,
                empty_referenced_output_assets: OutputAssets::empty().resolve().await?,
            };

            if let Some(chunking_config) = chunking_configs.get(&ty) {
                // Production chunking
                make_production_chunks(
                    chunk_items,
                    batch_groups,
                    module_graph,
                    chunking_config,
                    split_context,
                )
                .await?;
            } else {
                // Development chunking
                if !*ty.must_keep_item_order().await? {
                    let chunk_items = expand_batches(chunk_items, ty, chunking_context).await?;
                    let chunk_items = chunk_items.iter().collect();
                    app_vendors_split(
                        chunk_items,
                        format!("{key_prefix}{ty_name}"),
                        &mut split_context,
                    )
                    .await?;
                } else {
                    make_chunk(
                        chunk_items,
                        Vec::new(),
                        &mut format!("{key_prefix}{ty_name}"),
                        &mut split_context,
                    )
                    .await?;
                }
            }

            anyhow::Ok(())
        }
        .instrument(span)
        .await?
    }

    // Resolve all chunks before returning
    let resolved_chunks = chunks
        .into_iter()
        .map(|chunk| chunk.to_resolved())
        .try_join()
        .await?;

    Ok(resolved_chunks)
}

struct SplitContext<'a> {
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    chunks: &'a mut Vec<Vc<Box<dyn Chunk>>>,
    referenced_output_assets: &'a mut Vc<OutputAssets>,
    empty_referenced_output_assets: Vc<OutputAssets>,
}

/// Creates a chunk with the given `chunk_items. `key` should be unique.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(key = display(key)))]
async fn make_chunk<'l>(
    chunk_items: Vec<&'l ChunkItemOrBatchWithInfo>,
    batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    split_context.chunks.push(
        split_context.ty.chunk(
            split_context.chunking_context,
            chunk_items
                .into_iter()
                .map(|item| match item {
                    ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item.clone())
                    }
                    &ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                        ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch)
                    }
                })
                .collect(),
            ResolvedVc::deref_vec(batch_groups),
            replace(
                split_context.referenced_output_assets,
                split_context.empty_referenced_output_assets,
            ),
        ),
    );
    Ok(())
}
