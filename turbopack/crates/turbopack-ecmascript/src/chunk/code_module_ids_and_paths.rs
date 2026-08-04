use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ReadRef, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::chunk::{
    EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt, EcmascriptChunkItemOrBatchWithAsyncInfo,
    EcmascriptChunkItemWithAsyncInfo,
};

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct CodeModuleIdsAndPaths(SmallVec<[(ModuleId, ReadRef<Code>, RcStr); 1]>);

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct BatchGroupCodeModuleIdsAndPaths(
    FxHashMap<EcmascriptChunkItemOrBatchWithAsyncInfo, ReadRef<CodeModuleIdsAndPaths>>,
);

#[turbo_tasks::function]
pub async fn batch_group_code_module_ids_and_paths(
    batch_group: Vc<EcmascriptChunkItemBatchGroup>,
) -> Result<Vc<BatchGroupCodeModuleIdsAndPaths>> {
    let batch_group_ref = turbo_tasks::read!(batch_group)?;
    // The sync `parallel!` only fans out plain `Vc` reads, so the per-item work runs
    // concurrently in the async build (as before) and sequentially under `sync`.
    #[cfg(not(feature = "sync"))]
    let entries = batch_group_ref
        .items
        .iter()
        .map(async |item| {
            Ok((
                item.clone(),
                turbo_tasks::read!(item_code_module_ids_and_paths(item.clone()))?,
            ))
        })
        .try_join()
        .await?;
    #[cfg(feature = "sync")]
    let entries = {
        let mut entries = Vec::with_capacity(batch_group_ref.items.len());
        for item in batch_group_ref.items.iter() {
            entries.push((
                item.clone(),
                turbo_tasks::read!(item_code_module_ids_and_paths(item.clone()))?,
            ));
        }
        entries
    };
    Ok(Vc::cell(entries.into_iter().collect()))
}

#[turbo_tasks::function]
pub async fn item_code_module_ids_and_paths(
    item: EcmascriptChunkItemOrBatchWithAsyncInfo,
) -> Result<Vc<CodeModuleIdsAndPaths>> {
    Ok(Vc::cell(match item {
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(EcmascriptChunkItemWithAsyncInfo {
            chunk_item,
            async_info,
            ..
        }) => {
            let id = turbo_tasks::read!(chunk_item.id())?;
            let code = chunk_item.code(async_info.map(|info| *info));
            let path = turbo_tasks::read!(chunk_item.asset_ident().to_string().owned())?;
            smallvec![(id, turbo_tasks::read!(code)?, path)]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
            let batch_ref = turbo_tasks::read!(batch)?;
            // The sync `parallel!` only fans out plain `Vc` reads, so the per-item
            // reads run concurrently in the async build (as before) and sequentially
            // under `sync`.
            #[cfg(not(feature = "sync"))]
            let entries: SmallVec<_> = batch_ref
                .chunk_items
                .iter()
                .map(|item| async {
                    Ok((
                        turbo_tasks::read!(item.chunk_item.id())?,
                        turbo_tasks::read!(
                            item.chunk_item.code(item.async_info.map(|info| *info))
                        )?,
                        turbo_tasks::read!(item.chunk_item.asset_ident().to_string().owned())?,
                    ))
                })
                .try_join()
                .await?
                .into();
            #[cfg(feature = "sync")]
            let entries: SmallVec<_> = {
                // Prewarm the per-module codegen concurrently on the worker pool: a batch
                // holds many modules and `chunk_item.code()` (the expensive transform +
                // source-map generation) is a `Vc`-returning task. This is the hot inner
                // loop of chunk generation for a large chunk. `sync_parallel_map` forces
                // the fan-out (the `parallel!` gate would serialize here, since sibling
                // workers are typically `managed_block`ed rather than sleeping). The
                // serial assembly below then reads cached code.
                let code_inputs: Vec<_> = batch_ref
                    .chunk_items
                    .iter()
                    .map(|item| (item.chunk_item, item.async_info.map(|info| *info)))
                    .collect();
                turbo_tasks::sync_parallel_map(code_inputs, |(chunk_item, async_info)| {
                    turbo_tasks::read!(chunk_item.code(async_info)).map(|_| ())
                })
                .into_iter()
                .collect::<Result<Vec<()>>>()?;

                let mut entries = SmallVec::with_capacity(batch_ref.chunk_items.len());
                for item in batch_ref.chunk_items.iter() {
                    entries.push((
                        turbo_tasks::read!(item.chunk_item.id())?,
                        turbo_tasks::read!(
                            item.chunk_item.code(item.async_info.map(|info| *info))
                        )?,
                        turbo_tasks::read!(item.chunk_item.asset_ident().to_string().owned())?,
                    ));
                }
                entries
            };
            entries
        }
    }))
}
