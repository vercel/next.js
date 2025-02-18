use std::mem::replace;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use smallvec::{smallvec, SmallVec};
use tracing::{Instrument, Level};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, ResolvedVc,
    TryJoinIterExt, ValueToString, Vc,
};

use super::{
    AsyncModuleInfo, Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkingContext,
};
use crate::{
    chunk::{
        chunk_item_batch::ChunkItemOrBatchWithAsyncModuleInfo,
        chunking::{dev::app_vendors_split, production::make_production_chunks},
        ChunkableModule,
    },
    module_graph::ModuleGraph,
    output::OutputAssets,
};

mod dev;
mod production;

#[turbo_tasks::value]
struct ChunkItemsWithInfo {
    by_type: SmallVec<
        [(
            ResolvedVc<Box<dyn ChunkType>>,
            SmallVec<[ChunkItemWithInfo; 1]>,
        ); 1],
    >,
}

#[derive(
    Clone, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, ValueDebugFormat,
)]
struct ChunkItemWithInfo {
    chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    module: Option<ResolvedVc<Box<dyn ChunkableModule>>>,
    async_info: Option<ResolvedVc<AsyncModuleInfo>>,
    size: usize,
    asset_ident: RcStr,
}

async fn chunk_item_with_info(
    chunk_item: &ChunkItemWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<(ResolvedVc<Box<dyn ChunkType>>, ChunkItemWithInfo)> {
    let &ChunkItemWithAsyncModuleInfo {
        chunk_item,
        async_info,
        module,
    } = chunk_item;

    let asset_ident = chunk_item.asset_ident().to_string();
    let ty = chunk_item.ty();
    let chunk_item_size =
        ty.chunk_item_size(chunking_context, *chunk_item, async_info.map(|info| *info));

    let ty = ty.to_resolved().await?;
    let chunk_item_with_info = ChunkItemWithInfo {
        chunk_item,
        module,
        async_info,
        size: *chunk_item_size.await?,
        asset_ident: asset_ident.owned().await?,
    };
    Ok((ty, chunk_item_with_info))
}

#[turbo_tasks::function]
async fn chunk_items_with_info(
    chunk_item_or_batch: ChunkItemOrBatchWithAsyncModuleInfo,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<ChunkItemsWithInfo>> {
    let chunk_items_with_info: ChunkItemsWithInfo = match chunk_item_or_batch {
        ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item) => {
            let (ty, chunk_item_with_info) =
                chunk_item_with_info(&chunk_item, chunking_context).await?;
            ChunkItemsWithInfo {
                by_type: smallvec![(ty, smallvec![chunk_item_with_info])],
            }
        }
        ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
            let map = batch
                .await?
                .chunk_items
                .iter()
                .map(|chunk_item| chunk_item_with_info(chunk_item, chunking_context))
                .try_join()
                .await?
                .into_iter()
                .fold(
                    FxIndexMap::default(),
                    |mut map: FxIndexMap<_, SmallVec<[_; 1]>>, (ty, chunk_item_with_info)| {
                        map.entry(ty).or_default().push(chunk_item_with_info);
                        map
                    },
                );
            ChunkItemsWithInfo {
                by_type: map.into_iter().collect(),
            }
        }
    };
    Ok(chunk_items_with_info.cell())
}

/// Creates chunks based on heuristics for the passed `chunk_items`. Also
/// attaches `referenced_output_assets` to the first chunk.
pub async fn make_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    chunk_items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
    key_prefix: RcStr,
    mut referenced_output_assets: Vc<OutputAssets>,
) -> Result<Vec<ResolvedVc<Box<dyn Chunk>>>> {
    let chunking_configs = &*chunking_context.chunking_configs().await?;

    let chunk_items = chunk_items
        .iter()
        .map(|c| chunk_items_with_info(c.clone(), chunking_context))
        .try_join()
        .instrument(tracing::trace_span!("get chunk item info"))
        .await?;

    let mut map = FxIndexMap::<_, Vec<_>>::default();
    for result in chunk_items.iter() {
        for (ty, chunk_items) in result.by_type.iter() {
            map.entry(*ty).or_default().extend(chunk_items);
        }
    }

    let mut chunks = Vec::new();
    for (ty, chunk_items) in map {
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
                make_production_chunks(chunk_items, module_graph, chunking_config, split_context)
                    .await?;
            } else {
                // Development chunking
                if !*ty.must_keep_item_order().await? {
                    app_vendors_split(
                        chunk_items,
                        format!("{key_prefix}{ty_name}"),
                        &mut split_context,
                    )
                    .await?;
                } else {
                    make_chunk(
                        chunk_items,
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
    chunk_items: Vec<&'l ChunkItemWithInfo>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    split_context.chunks.push(
        split_context.ty.chunk(
            split_context.chunking_context,
            chunk_items
                .into_iter()
                .map(
                    |&ChunkItemWithInfo {
                         chunk_item,
                         module,
                         async_info,
                         ..
                     }| ChunkItemWithAsyncModuleInfo {
                        chunk_item,
                        module,
                        async_info,
                    },
                )
                .collect(),
            replace(
                split_context.referenced_output_assets,
                split_context.empty_referenced_output_assets,
            ),
        ),
    );
    Ok(())
}
