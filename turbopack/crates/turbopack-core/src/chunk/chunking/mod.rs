use std::future::IntoFuture;

use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use tracing::{Instrument, Level};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, ValueToString, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};

use crate::{
    chunk::{
        Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingConfig, ChunkingContext,
        Chunks, batch_info,
        chunk_item_batch::{
            ChunkItemBatchGroup, ChunkItemBatchGroups, ChunkItemBatchWithAsyncModuleInfo,
            ChunkItemOrBatchWithAsyncModuleInfo, ChunkItemOrBatchWithAsyncModuleInfos,
        },
        chunking::{
            dev::{app_vendors_split, expand_batches},
            production::make_production_chunks,
            style_production::make_style_production_chunks,
        },
        parallel_reads,
    },
    module_graph::ModuleGraph,
};

mod dev;
mod production;
mod style_production;

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

#[derive(Clone, PartialEq, Eq, TraceRawVcs, NonLocalValue, ValueDebugFormat, Encode, Decode)]
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
    let size = turbo_tasks::parallel!(turbo_tasks::read!(batch)?.chunk_items.iter().map(
        |&ChunkItemWithAsyncModuleInfo {
             chunk_item,
             chunk_type: _,
             async_info,
             module: _,
         }| {
            ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info))
        },
    ))?
    .into_iter()
    .map(|size| *size)
    .sum();
    Ok(Vc::cell(size))
}

turbo_tasks::dual_fn! {
fn plain_chunk_items_with_info(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<ChunkItemsWithInfo> {
    Ok(match chunk_item_or_batch {
        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item_with_info) => {
            let ChunkItemWithAsyncModuleInfo {
                chunk_item,
                chunk_type,
                async_info,
                module: _,
            } = chunk_item_with_info;

            let asset_ident = chunk_item.asset_ident().to_string();
            let chunk_item_size = chunk_type.chunk_item_size(
                chunking_context,
                *chunk_item,
                async_info.map(|info| *info),
            );

            ChunkItemsWithInfo {
                by_type: smallvec![(
                    chunk_type,
                    smallvec![ChunkItemOrBatchWithInfo::ChunkItem {
                        chunk_item: chunk_item_with_info,
                        size: *turbo_tasks::read!(chunk_item_size)?,
                        asset_ident: turbo_tasks::read!(asset_ident.owned())?,
                    }],
                    SmallVec::new(),
                )],
            }
        }
        ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
            let batch_by_type = turbo_tasks::read!(batch.split_by_chunk_type())?;
            let by_type = turbo_tasks::read!(parallel_reads(batch_by_type
                .iter()
                .map(|&(ty, ref chunk_item_or_batch)| {
                    plain_chunk_items_with_info_with_type(
                        chunk_item_or_batch,
                        ty,
                        None,
                        chunking_context,
                    )
                })))?;
            ChunkItemsWithInfo {
                by_type: by_type.into_iter().collect(),
            }
        }
    })
}
}

turbo_tasks::dual_fn! {
fn plain_chunk_items_with_info_with_type(
    chunk_item_or_batch: &ChunkItemOrBatchWithAsyncModuleInfo,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    batch_group: Option<ResolvedVc<ChunkItemBatchGroup>>,
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
                chunk_type: _,
                async_info,
                module: _,
            } = chunk_item_with_info;

            let asset_ident = chunk_item.asset_ident().to_string();
            let chunk_item_size =
                ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info));
            Ok((
                ty,
                smallvec![ChunkItemOrBatchWithInfo::ChunkItem {
                    chunk_item: *chunk_item_with_info,
                    size: *turbo_tasks::read!(chunk_item_size)?,
                    asset_ident: turbo_tasks::read!(asset_ident.owned())?,
                }],
                batch_group.into_iter().collect(),
            ))
        }
        &ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
            let size = *turbo_tasks::read!(batch_size(chunking_context, *ty, *batch))?;
            Ok((
                ty,
                smallvec![ChunkItemOrBatchWithInfo::Batch { batch, size }],
                batch_group.into_iter().collect(),
            ))
        }
    }
}
}

#[turbo_tasks::function]
async fn chunk_items_with_info(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkItemsWithInfo>> {
    let chunk_items_with_info = turbo_tasks::read!(plain_chunk_items_with_info(
        chunk_item_or_batch,
        chunking_context
    ))?;
    Ok(chunk_items_with_info.cell())
}

#[turbo_tasks::function]
async fn chunk_items_with_info_with_type(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    ty: ResolvedVc<Box<dyn ChunkType>>,
    batch_group: Option<ResolvedVc<ChunkItemBatchGroup>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkItemsWithInfo>> {
    let result = turbo_tasks::read!(plain_chunk_items_with_info_with_type(
        &chunk_item_or_batch,
        ty,
        batch_group,
        chunking_context,
    ))?;
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
    let split_batch_group = turbo_tasks::read!(batch_group.split_by_chunk_type())?;
    if split_batch_group.len() == 1 {
        let (ty, batch) = split_batch_group.into_iter().next().unwrap();
        Ok(batch_chunk_items_with_info_with_type(
            *batch,
            *ty,
            chunking_context,
        ))
    } else {
        let maps = turbo_tasks::parallel!(split_batch_group.into_iter().map(|(ty, batch)| {
            batch_chunk_items_with_info_with_type(*batch, *ty, chunking_context)
        }))?;
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
    ty: Vc<Box<dyn ChunkType>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<BatchChunkItemsWithInfo>> {
    let batch_group_ref = turbo_tasks::read!(batch_group)?;
    let infos = turbo_tasks::read!(parallel_reads(batch_group_ref.items.iter().map(|item| {
        chunk_items_with_info_with_type(item.clone(), ty, Some(batch_group), chunking_context)
            .to_resolved()
    })))?;
    let map = batch_group_ref.items.iter().cloned().zip(infos).collect();
    Ok(Vc::cell(map))
}

/// Creates chunks based on heuristics for the passed `chunk_items`.
#[turbo_tasks::function]
pub async fn make_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunk_items_or_batches: ResolvedVc<ChunkItemOrBatchWithAsyncModuleInfos>,
    batch_groups: ResolvedVc<ChunkItemBatchGroups>,
    key_prefix: RcStr,
) -> Result<Vc<Chunks>> {
    let chunking_configs = &*turbo_tasks::read!(chunking_context.chunking_configs())?;
    let chunk_items_or_batches = turbo_tasks::read!(chunk_items_or_batches)?;
    let batch_groups = turbo_tasks::read!(batch_groups)?;

    let span = tracing::trace_span!(
        "get chunk item info",
        chunk_items_or_batches = chunk_items_or_batches.len(),
        batch_groups = batch_groups.len()
    );
    let chunk_items: Vec<ReadRef<ChunkItemsWithInfo>> =
        turbo_tasks::parallel!(turbo_tasks::read!(
            batch_info(
                &batch_groups,
                &chunk_items_or_batches,
                |batch_group| batch_chunk_items_with_info(batch_group, *chunking_context)
                    .into_future(),
                |c| chunk_items_with_info(c.clone(), *chunking_context).to_resolved(),
            )
            .instrument(span)
        )?)?;

    let mut map = FxIndexMap::<_, (Vec<_>, FxIndexSet<_>)>::default();
    for result in chunk_items.iter() {
        for (ty, chunk_items, batch_groups) in result.by_type.iter() {
            let entry = map.entry(*ty).or_default();
            entry.0.extend(chunk_items);
            entry.1.extend(batch_groups);
        }
    }

    let mut chunks = Vec::new();
    for (ty, (chunk_items, batch_groups)) in map {
        let ty_name = turbo_tasks::read!(ty.to_string())?;
        turbo_tasks::read!(make_chunks_for_type(
            ty,
            &ty_name,
            chunk_items,
            batch_groups,
            module_graph,
            chunking_context,
            chunking_configs,
            &key_prefix,
            &mut chunks,
        ))?
    }

    // Resolve all chunks before returning
    let resolved_chunks = turbo_tasks::read!(parallel_reads(
        chunks.into_iter().map(|chunk| chunk.to_resolved())
    ))?;

    Ok(Vc::cell(resolved_chunks))
}

turbo_tasks::dual_fn! {
/// Creates the chunks for all chunk items of a single chunk type (the per-type body of
/// [`make_chunks`]'s loop).
#[tracing::instrument(level = Level::TRACE, skip_all, name = "make chunks for type", fields(name = display(&ty_name)))]
fn make_chunks_for_type(
    ty: ResolvedVc<Box<dyn ChunkType>>,
    ty_name: &RcStr,
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    batch_groups: FxIndexSet<ResolvedVc<ChunkItemBatchGroup>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunking_configs: &FxHashMap<ResolvedVc<Box<dyn ChunkType>>, ChunkingConfig>,
    key_prefix: &RcStr,
    chunks: &mut Vec<Vc<Box<dyn Chunk>>>,
) -> Result<()> {
    let mut split_context = SplitContext {
        ty,
        chunking_context,
        chunks,
    };

    if let Some(chunking_config) = chunking_configs.get(&ty) {
        // Production chunking
        if *turbo_tasks::read!(ty.is_style())? {
            turbo_tasks::read!(make_style_production_chunks(
                chunk_items,
                batch_groups.into_iter().collect(),
                module_graph,
                chunking_context,
                chunking_config,
                split_context,
            ))?;
        } else {
            turbo_tasks::read!(make_production_chunks(
                chunk_items,
                batch_groups.into_iter().collect(),
                module_graph,
                chunking_config,
                split_context,
            ))?;
        }
    } else {
        // Development chunking
        if *turbo_tasks::read!(ty.is_style())? {
            turbo_tasks::read!(make_chunk(
                chunk_items,
                Vec::new(),
                &mut format!("{key_prefix}{ty_name}"),
                &mut split_context,
            ))?;
        } else {
            let chunk_items = turbo_tasks::read!(expand_batches(chunk_items, ty, chunking_context))?;
            let chunk_items = chunk_items.iter().collect();
            turbo_tasks::read!(app_vendors_split(
                chunk_items,
                format!("{key_prefix}{ty_name}"),
                &mut split_context,
            ))?;
        }
    }

    Ok(())
}
}

struct SplitContext<'a> {
    ty: ResolvedVc<Box<dyn ChunkType>>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    // resolution of `chunks` is deferred so it can be done with `try_join` at the end, letting as
    // much work happen in parallel as possible.
    chunks: &'a mut Vec<Vc<Box<dyn Chunk>>>,
}

turbo_tasks::dual_fn! {
/// Creates a chunk with the given `chunk_items. `key` should be unique.
#[tracing::instrument(level = Level::TRACE, skip_all, fields(key = display(key)))]
fn make_chunk(
    chunk_items: Vec<&'_ ChunkItemOrBatchWithInfo>,
    batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    split_context.chunks.push(
        split_context.ty.chunk(
            *split_context.chunking_context,
            chunk_items
                .into_iter()
                .map(|item| match item {
                    ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(*chunk_item)
                    }
                    &ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                        ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch)
                    }
                })
                .collect(),
            ResolvedVc::deref_vec(batch_groups),
        ),
    );
    Ok(())
}
}
