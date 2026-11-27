use std::future::IntoFuture;

use anyhow::Result;
use either::Either;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::chunk::{
    ChunkItem, ChunkItems, ChunkingContext, batch_info, chunking_context::find_emit_option,
};

use crate::{
    chunk::{
        CodeModuleIdAndPath,
        batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
        batch_group_code_module_ids_and_paths, item_code_module_ids_and_paths,
    },
    emit_options::EcmascriptEmitOptions,
};

/// The options to minify each ecmascript chunk item with before it is written into a chunk, or
/// `None` if the chunking context doesn't minify. Chunk items are always minified on their own,
/// never as part of the assembled chunk. The options are passed to the per-item tasks as a cell, so
/// they are part of those tasks' cache keys.
pub async fn chunk_item_minify_options(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Option<ResolvedVc<EcmascriptEmitOptions>>> {
    // Without `EcmascriptEmitOptions` the default applies, which doesn't minify.
    let Some(options) =
        find_emit_option::<EcmascriptEmitOptions>(chunking_context.emit_options()).await?
    else {
        return Ok(None);
    };
    if options.await?.swc_minify_options.is_none() {
        return Ok(None);
    }
    Ok(Some(options.to_resolved().await?))
}

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemOrBatchWithAsyncInfo>,
    pub batch_groups: Vec<ResolvedVc<EcmascriptChunkItemBatchGroup>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContent {
    #[turbo_tasks::function]
    pub async fn included_chunk_items(&self) -> Result<Vc<ChunkItems>> {
        Ok(ChunkItems(
            self.chunk_items
                .iter()
                .map(async |item| match item {
                    EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                        Ok(Either::Left(item.chunk_item))
                    }
                    EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => {
                        Ok(Either::Right(batch.await?))
                    }
                })
                .try_join()
                .await?
                .iter()
                .flat_map(|item| match item {
                    Either::Left(item) => Either::Left(std::iter::once(*item)),
                    Either::Right(batch) => {
                        Either::Right(batch.chunk_items.iter().map(|item| item.chunk_item))
                    }
                })
                .map(ResolvedVc::upcast::<Box<dyn ChunkItem>>)
                .collect(),
        )
        .cell())
    }
}

impl EcmascriptChunkContent {
    /// Returns the code of every chunk item, each minified on its own if `minify` asks for it.
    pub async fn chunk_item_code_module_ids_and_paths(
        &self,
        minify: Option<Vc<EcmascriptEmitOptions>>,
        source_maps: bool,
    ) -> Result<Vec<CodeModuleIdAndPath>> {
        // Source maps only affect the minification. Normalize the flag otherwise so it doesn't fork
        // the per-item tasks for chunks that aren't minified.
        let source_maps = source_maps && minify.is_some();
        let chunk_item_groups = batch_info(
            &self.batch_groups,
            &self.chunk_items,
            |batch| batch_group_code_module_ids_and_paths(batch, minify, source_maps).into_future(),
            |item| item_code_module_ids_and_paths(item.clone(), minify, source_maps).into_future(),
        )
        .await?;
        let mut chunk_items = chunk_item_groups
            .iter()
            .flat_map(|items| items.iter().cloned())
            .collect::<Vec<_>>();
        // Strict items come first so they form one contiguous group (see `write_module_factories`).
        // Within each group, sort by module path so that similar modules stay together and the
        // chunks gzip better.
        chunk_items.sort_by(|a, b| (!a.strict, &a.path, &a.id).cmp(&(!b.strict, &b.path, &b.id)));
        Ok(chunk_items)
    }
}
