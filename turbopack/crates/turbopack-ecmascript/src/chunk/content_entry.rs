use anyhow::Result;
use either::Either;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::chunk::{
    EcmascriptChunkContent, EcmascriptChunkItem, EcmascriptChunkItemExt,
    EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
};

/// A chunk item's content entry.
///
/// Instead of storing the [`Vc<Box<dyn EcmascriptChunkItem>>`] itself from
/// which `code` and `hash` are derived, we store `Vc`s directly. This avoids
/// creating tasks in a hot loop when iterating over thousands of entries when
/// computing updates.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct EcmascriptChunkContentEntry {
    pub code: ResolvedVc<Code>,
    pub hash: ResolvedVc<u64>,
}

impl EcmascriptChunkContentEntry {
    pub async fn new(
        chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Self> {
        let code = chunk_item.code(async_module_info).to_resolved().await?;
        Ok(EcmascriptChunkContentEntry {
            code,
            hash: code.source_code_hash().to_resolved().await?,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkContentEntries(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<ModuleId, EcmascriptChunkContentEntry>,
);

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentEntries {
    #[turbo_tasks::function]
    pub async fn new(
        chunk_content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<EcmascriptChunkContentEntries>> {
        let chunk_content = chunk_content.await?;

        let entries: FxIndexMap<_, _> = chunk_content
            .chunk_items
            .iter()
            .map(async |item| {
                Ok(match item {
                    &EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(
                        EcmascriptChunkItemWithAsyncInfo {
                            chunk_item,
                            async_info,
                        },
                    ) => Either::Left(std::iter::once((
                        chunk_item.id().await?,
                        EcmascriptChunkContentEntry::new(chunk_item, async_info.map(|info| *info))
                            .await?,
                    ))),
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        let batch = batch.await?;
                        Either::Right(
                            batch
                                .chunk_items
                                .iter()
                                .map(|item| async move {
                                    Ok((
                                        item.chunk_item.id().await?,
                                        EcmascriptChunkContentEntry::new(
                                            item.chunk_item,
                                            item.async_info.map(|info| *info),
                                        )
                                        .await?,
                                    ))
                                })
                                .try_join()
                                .await?
                                .into_iter(),
                        )
                    }
                })
            })
            .try_flat_join()
            .await?
            .into_iter()
            .collect();

        Ok(Vc::cell(entries))
    }
}
