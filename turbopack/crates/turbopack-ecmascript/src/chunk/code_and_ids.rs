use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_tasks::{ReadRef, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::chunk::{
    EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo,
    ecmascript_chunk_item_code,
};

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct CodeAndIds(SmallVec<[(ModuleId, ReadRef<Code>); 1]>);

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
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(ref info) => {
            let id = info.chunk_item().await?.id().await?;
            let code = ecmascript_chunk_item_code(
                info.module,
                info.chunking_context,
                info.module_graph,
                info.async_info.map(|info| *info),
            );
            smallvec![(id, code.await?)]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(|item| async {
                Ok((
                    item.chunk_item().await?.id().await?,
                    ecmascript_chunk_item_code(
                        item.module,
                        item.chunking_context,
                        item.module_graph,
                        item.async_info.map(|info| *info),
                    )
                    .await?,
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
}
