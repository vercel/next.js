use anyhow::Result;
#[cfg(not(feature = "sync"))]
use either::Either;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};
#[cfg(not(feature = "sync"))]
use turbo_tasks::{TryFlatJoinIterExt, TryJoinIterExt};
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
    turbo_tasks::dual_fn! {
    pub fn new(
        chunk_item: ResolvedVc<Box<dyn EcmascriptChunkItem>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Self> {
        let code = turbo_tasks::read!(chunk_item.code(async_module_info).to_resolved())?;
        Ok(EcmascriptChunkContentEntry {
            code,
            hash: turbo_tasks::read!(code.source_code_hash().to_resolved())?,
        })
    }
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
        let chunk_content = turbo_tasks::read!(chunk_content)?;

        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work runs concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
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
                        turbo_tasks::read!(chunk_item.id())?,
                        turbo_tasks::read!(EcmascriptChunkContentEntry::new(
                            chunk_item,
                            async_info.map(|info| *info)
                        ))?,
                    ))),
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        let batch = turbo_tasks::read!(batch)?;
                        Either::Right(
                            turbo_tasks::read!(
                                batch
                                    .chunk_items
                                    .iter()
                                    .map(|item| async move {
                                        Ok((
                                            turbo_tasks::read!(item.chunk_item.id())?,
                                            turbo_tasks::read!(EcmascriptChunkContentEntry::new(
                                                item.chunk_item,
                                                item.async_info.map(|info| *info),
                                            ))?,
                                        ))
                                    })
                                    .try_join()
                            )?
                            .into_iter(),
                        )
                    }
                })
            })
            .try_flat_join()
            .await?
            .into_iter()
            .collect();
        #[cfg(feature = "sync")]
        let entries: FxIndexMap<_, _> = {
            // Flatten chunk items (including batch items), preserving order.
            let mut flat: Vec<(
                ResolvedVc<Box<dyn EcmascriptChunkItem>>,
                Option<Vc<AsyncModuleInfo>>,
            )> = Vec::new();
            for item in chunk_content.chunk_items.iter() {
                match item {
                    &EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(
                        EcmascriptChunkItemWithAsyncInfo {
                            chunk_item,
                            async_info,
                        },
                    ) => flat.push((chunk_item, async_info.map(|info| *info))),
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        let batch = turbo_tasks::read!(batch)?;
                        for item in batch.chunk_items.iter() {
                            flat.push((item.chunk_item, item.async_info.map(|info| *info)));
                        }
                    }
                }
            }
            // Prewarm the expensive per-item codegen concurrently on the worker pool:
            // `code()` is a `Vc`-returning task, so `parallel!` computes all of them in
            // parallel and caches the results. The serial assembly below then reads cached
            // values (`EcmascriptChunkContentEntry::new` re-reads the cached code, and
            // `id()` is a cheap dual helper). This is the hot chunking loop (one entry per
            // module); the async build gets this concurrency via `try_flat_join` above.
            turbo_tasks::parallel!(
                flat.iter()
                    .map(|&(chunk_item, async_info)| chunk_item.code(async_info))
            )?;

            let mut entries = FxIndexMap::default();
            for (chunk_item, async_info) in flat {
                entries.insert(
                    turbo_tasks::read!(chunk_item.id())?,
                    turbo_tasks::read!(EcmascriptChunkContentEntry::new(chunk_item, async_info))?,
                );
            }
            entries
        };

        Ok(Vc::cell(entries))
    }
}
