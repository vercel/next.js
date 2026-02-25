use anyhow::Result;
use either::Either;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItemExt, ModuleId},
    code_builder::Code,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkContent, EcmascriptChunkItemOrBatchWithAsyncInfo,
    EcmascriptChunkItemWithAsyncInfo, ecmascript_chunk_item_code,
};

/// A chunk item's content entry.
///
/// Instead of storing the module itself from which `code` and `hash` are
/// derived, we store `Vc`s directly. This avoids creating tasks in a hot
/// loop when iterating over thousands of entries when computing updates.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct EcmascriptDevChunkContentEntry {
    pub code: ResolvedVc<Code>,
    pub hash: ResolvedVc<u64>,
}

impl EcmascriptDevChunkContentEntry {
    pub async fn new(info: &EcmascriptChunkItemWithAsyncInfo) -> Result<Self> {
        let code = ecmascript_chunk_item_code(
            info.module,
            info.chunking_context,
            info.module_graph,
            info.async_info.map(|info| *info),
        )
        .to_resolved()
        .await?;
        Ok(EcmascriptDevChunkContentEntry {
            code,
            hash: code.source_code_hash().to_resolved().await?,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptBrowserChunkContentEntries(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<ModuleId, EcmascriptDevChunkContentEntry>,
);

#[turbo_tasks::value_impl]
impl EcmascriptBrowserChunkContentEntries {
    #[turbo_tasks::function]
    pub async fn new(
        chunk_content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<EcmascriptBrowserChunkContentEntries>> {
        let chunk_content = chunk_content.await?;

        let entries: FxIndexMap<_, _> = chunk_content
            .chunk_items
            .iter()
            .map(async |item| {
                Ok(match item {
                    EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(info) => {
                        Either::Left(std::iter::once((
                            info.chunk_item().await?.id().await?,
                            EcmascriptDevChunkContentEntry::new(info).await?,
                        )))
                    }
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        let batch = batch.await?;
                        Either::Right(
                            batch
                                .chunk_items
                                .iter()
                                .map(|item| async move {
                                    Ok((
                                        item.chunk_item().await?.id().await?,
                                        EcmascriptDevChunkContentEntry::new(item).await?,
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
