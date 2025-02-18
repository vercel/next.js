mod dev;
mod production;

use std::mem::replace;

use anyhow::Result;
use tracing::{Instrument, Level};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};

use super::{
    AsyncModuleInfo, Chunk, ChunkItem, ChunkItemTy, ChunkItemWithAsyncModuleInfo, ChunkType,
    ChunkingContext,
};
use crate::{
    chunk::{
        chunking::{dev::app_vendors_split, production::make_production_chunks},
        ChunkableModule,
    },
    module_graph::ModuleGraph,
    output::OutputAssets,
};

#[turbo_tasks::value]
struct ChunkItemInfo {
    ty: ResolvedVc<Box<dyn ChunkType>>,
    name: ResolvedVc<RcStr>,
    size: usize,
}

#[turbo_tasks::function]
async fn chunk_item_info(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    chunk_item: Vc<Box<dyn ChunkItem>>,
    async_info: Option<Vc<AsyncModuleInfo>>,
) -> Result<Vc<ChunkItemInfo>> {
    let asset_ident = chunk_item.asset_ident().to_string();
    let ty = chunk_item.ty().to_resolved().await?;
    let chunk_item_size = ty.chunk_item_size(chunking_context, chunk_item, async_info);
    Ok(ChunkItemInfo {
        ty,
        size: *chunk_item_size.await?,
        name: asset_ident.to_resolved().await?,
    }
    .cell())
}

/// Creates chunks based on heuristics for the passed `chunk_items`. Also
/// attaches `referenced_output_assets` to the first chunk.
pub async fn make_chunks(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
    key_prefix: RcStr,
    mut referenced_output_assets: Vc<OutputAssets>,
) -> Result<Vec<ResolvedVc<Box<dyn Chunk>>>> {
    let chunking_configs = &*chunking_context.chunking_configs().await?;

    let chunk_items = chunk_items
        .iter()
        .map(|c| async move {
            let chunk_item_info = chunk_item_info(
                chunking_context,
                *c.chunk_item,
                c.async_info.map(|info| *info),
            )
            .await?;
            Ok((c, chunk_item_info))
        })
        .try_join()
        .instrument(tracing::trace_span!("get chunk item info"))
        .await?;

    let mut map = FxIndexMap::<_, Vec<_>>::default();
    for (c, chunk_item_info) in chunk_items {
        map.entry(chunk_item_info.ty)
            .or_default()
            .push((c, chunk_item_info));
    }

    let mut chunks = Vec::new();
    for (ty, chunk_items) in map {
        let ty_name = ty.to_string().await?;
        let span = tracing::trace_span!("make chunks for type", name = ty_name.as_str());
        async {
            let chunk_items = chunk_items
                .into_iter()
                .map(
                    async |(
                        ChunkItemWithAsyncModuleInfo {
                            ty,
                            chunk_item,
                            module,
                            async_info,
                        },
                        chunk_item_info,
                    )| {
                        Ok(ChunkItemWithInfo {
                            ty: *ty,
                            chunk_item: *chunk_item,
                            module: *module,
                            async_info: *async_info,
                            size: chunk_item_info.size,
                            asset_ident: chunk_item_info.name.await?,
                        })
                    },
                )
                .try_join()
                .await?;

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

struct ChunkItemWithInfo {
    ty: ChunkItemTy,
    chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    module: Option<ResolvedVc<Box<dyn ChunkableModule>>>,
    async_info: Option<ResolvedVc<AsyncModuleInfo>>,
    size: usize,
    asset_ident: ReadRef<RcStr>,
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
async fn make_chunk(
    chunk_items: Vec<ChunkItemWithInfo>,
    key: &mut String,
    split_context: &mut SplitContext<'_>,
) -> Result<()> {
    split_context.chunks.push(
        split_context.ty.chunk(
            split_context.chunking_context,
            chunk_items
                .into_iter()
                .map(
                    |ChunkItemWithInfo {
                         ty,
                         chunk_item,
                         module,
                         async_info,
                         ..
                     }| ChunkItemWithAsyncModuleInfo {
                        ty,
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
