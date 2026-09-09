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

#[turbo_tasks::value(shared, serialization = "skip")]
#[derive(Clone, Copy, Debug)]
pub struct ModuleFactoryMode(bool);

impl ModuleFactoryMode {
    pub fn is_strict(self) -> bool {
        self.0
    }
}

async fn item_code_and_mode(
    item: &EcmascriptChunkItemWithAsyncInfo,
) -> Result<(ReadRef<Code>, ModuleFactoryMode)> {
    let async_module_info = item.async_info.map(|info| *info);
    let strict = item
        .chunk_item
        .into_trait_ref()
        .await?
        .content_with_async_module_info(async_module_info, false)
        .await?
        .await?
        .options
        .strict;
    let code = item.chunk_item.code(async_module_info);
    Ok((code.await?, ModuleFactoryMode(strict)))
}

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct CodeModuleIdsAndPaths(
    SmallVec<[(ModuleId, ReadRef<Code>, RcStr, ModuleFactoryMode); 1]>,
);

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
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
            let (code, mode) = item_code_and_mode(&item).await?;
            smallvec![(
                item.chunk_item.id().await?,
                code,
                item.chunk_item.asset_ident().to_string().owned().await?,
                mode
            )]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(async |item| {
                let (code, mode) = item_code_and_mode(item).await?;
                Ok((
                    item.chunk_item.id().await?,
                    code,
                    item.chunk_item.asset_ident().to_string().owned().await?,
                    mode,
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
}
