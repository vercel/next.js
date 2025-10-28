use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::chunk::{
    EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt, EcmascriptChunkItemOrBatchWithAsyncInfo,
    EcmascriptChunkItemWithAsyncInfo,
};

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct CodeAndIds(SmallVec<[(ReadRef<ModuleId>, ReadRef<Code>); 1]>);

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct BatchGroupCodeAndIds(
    FxHashMap<EcmascriptChunkItemOrBatchWithAsyncInfo, ReadRef<CodeAndIds>>,
);

#[turbo_tasks::function]
pub async fn batch_group_code_and_ids(
    batch_group: Vc<EcmascriptChunkItemBatchGroup>,
) -> Result<Vc<BatchGroupCodeAndIds>> {
    Ok(Vc::cell(
        batch_group
            .await?
            .items
            .iter()
            .map(async |item| Ok((item.clone(), item_code_and_ids(item.clone()).await?)))
            .try_join()
            .await?
            .into_iter()
            .collect(),
    ))
}

#[turbo_tasks::function]
pub async fn item_code_and_ids(
    item: EcmascriptChunkItemOrBatchWithAsyncInfo,
) -> Result<Vc<CodeAndIds>> {
    Ok(Vc::cell(match item {
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(EcmascriptChunkItemWithAsyncInfo {
            chunk_item,
            async_info,
            ..
        }) => {
            let id = chunk_item.id();
            let code = chunk_item.code(async_info.map(|info| *info));
            smallvec![(id.await?, code.await?)]
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
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
}
