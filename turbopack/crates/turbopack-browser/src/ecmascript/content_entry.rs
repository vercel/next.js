use anyhow::Result;
use tracing::{info_span, Instrument};
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemExt, ChunkItemTy, ModuleId},
    code_builder::Code,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkContent, EcmascriptChunkItem, EcmascriptChunkItemExt,
    EcmascriptChunkItemWithAsyncInfo,
};

/// A chunk item's content entry.
///
/// Instead of storing the [`Vc<Box<dyn EcmascriptChunkItem>>`] itself from
/// which `code` and `hash` are derived, we store `Vc`s directly. This avoids
/// creating tasks in a hot loop when iterating over thousands of entries when
/// computing updates.
#[turbo_tasks::value]
#[derive(Debug)]
pub struct EcmascriptDevChunkContentEntry {
    pub code: ResolvedVc<Code>,
    pub hash: ResolvedVc<u64>,
}

impl EcmascriptDevChunkContentEntry {
    pub async fn new(
        chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Self> {
        let code = chunk_item.code(async_module_info).to_resolved().await?;
        Ok(EcmascriptDevChunkContentEntry {
            code,
            hash: code.source_code_hash().to_resolved().await?,
        })
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptDevChunkContentEntries(
    FxIndexMap<ReadRef<ModuleId>, EcmascriptDevChunkContentEntry>,
);

#[turbo_tasks::value_impl]
impl EcmascriptDevChunkContentEntries {
    #[turbo_tasks::function]
    pub async fn new(
        chunk_content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<EcmascriptDevChunkContentEntries>> {
        let chunk_content = chunk_content.await?;

        let included_chunk_items = chunk_content
            .chunk_items
            .iter()
            .map(
                async |EcmascriptChunkItemWithAsyncInfo {
                           ty,
                           chunk_item,
                           async_info,
                       }| {
                    if matches!(ty, ChunkItemTy::Included) {
                        Ok(Some((chunk_item, async_info)))
                    } else {
                        Ok(None)
                    }
                },
            )
            .try_join()
            .await?
            .into_iter()
            .flatten();

        let entries: FxIndexMap<_, _> = included_chunk_items
            .map(|(&chunk_item, &async_module_info)| async move {
                async move {
                    Ok((
                        chunk_item.id().await?,
                        EcmascriptDevChunkContentEntry::new(
                            chunk_item,
                            async_module_info.map(|info| *info),
                        )
                        .await?,
                    ))
                }
                .instrument(info_span!(
                    "chunk item",
                    name = display(chunk_item.asset_ident().to_string().await?)
                ))
                .await
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(Vc::cell(entries))
    }
}
