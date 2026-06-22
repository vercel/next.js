use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt, ValueToString, Vc};
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
    Ok(Vc::cell(
        batch_group
            .await?
            .items
            .iter()
            .map(async |item| {
                Ok((
                    item.clone(),
                    item_code_module_ids_and_paths(item.clone()).await?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
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
            let id = chunk_item.id().await?;
            let code = chunk_item.code(async_info.map(|info| *info));
            let path = chunk_item.asset_ident().to_string().owned().await?;
            smallvec![(id, code.await?, path)]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(|item| async {
                Ok((
                    item.chunk_item.id().await?,
                    item.chunk_item
                        .code(item.async_info.map(|info| *info))
                        .await?,
                    item.chunk_item.asset_ident().to_string().owned().await?,
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
}
