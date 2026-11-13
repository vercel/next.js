use std::future::IntoFuture;

use anyhow::Result;
use either::Either;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItems, ChunkingContext, batch_info},
    code_builder::Code,
};

use crate::{
    chunk::{
        CodeModuleIdAndPath,
        batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
        batch_group_code_module_ids_and_paths, item_code_module_ids_and_paths,
    },
    emit_options::EcmascriptEmitOptions,
    minify::minify,
};

/// How the code of an ecmascript chunk is minified: never, once per chunk item before the chunk
/// is assembled, or once for the whole assembled chunk. Never both.
#[derive(Clone)]
pub enum ChunkMinification {
    None,
    /// Each chunk item is minified on its own (in parallel, cached per item). See
    /// [`ChunkingContext::minify_before_chunking`].
    PerItem {
        emit_options: ResolvedVc<EcmascriptEmitOptions>,
    },
    /// The assembled chunk is minified in one pass.
    WholeChunk {
        emit_options: ReadRef<EcmascriptEmitOptions>,
    },
}

impl ChunkMinification {
    pub async fn for_chunking_context(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Self> {
        let Some(emit_options) = EcmascriptEmitOptions::find(chunking_context).await? else {
            return Ok(ChunkMinification::None);
        };
        let emit_options_value = emit_options.await?;
        if emit_options_value.swc_minify_options.is_none() {
            return Ok(ChunkMinification::None);
        }
        Ok(if *chunking_context.minify_before_chunking().await? {
            ChunkMinification::PerItem { emit_options }
        } else {
            ChunkMinification::WholeChunk {
                emit_options: emit_options_value,
            }
        })
    }

    /// The emit options to minify each chunk item with before it is written into the chunk, if
    /// any.
    pub(crate) fn per_item(&self) -> Option<ResolvedVc<EcmascriptEmitOptions>> {
        match self {
            ChunkMinification::PerItem { emit_options } => Some(*emit_options),
            ChunkMinification::None | ChunkMinification::WholeChunk { .. } => None,
        }
    }

    /// Applies the whole-chunk minification, if any, to the assembled chunk.
    pub fn finish_chunk(&self, code: Code, source_maps: bool) -> Result<Code> {
        match self {
            ChunkMinification::WholeChunk { emit_options } => {
                match &emit_options.swc_minify_options {
                    Some(swc_minify_options) => minify(code, source_maps, swc_minify_options),
                    None => Ok(code),
                }
            }
            ChunkMinification::None | ChunkMinification::PerItem { .. } => Ok(code),
        }
    }
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
    /// Returns the code of every chunk item, minified if `minification` is
    /// [`ChunkMinification::PerItem`].
    pub async fn chunk_item_code_module_ids_and_paths(
        &self,
        minification: &ChunkMinification,
        source_maps: bool,
    ) -> Result<Vec<CodeModuleIdAndPath>> {
        let minify = minification.per_item().map(|emit_options| *emit_options);
        // Source maps only affect the per-item minification. Normalize the flag otherwise so it
        // doesn't fork the per-item tasks for chunks that are minified as a whole (or not at all).
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
