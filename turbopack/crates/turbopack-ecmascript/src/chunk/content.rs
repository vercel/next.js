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
    emit_options::{ChunkItemMinifyOptions, EcmascriptEmitOptions},
    minify::minify,
};

/// How the code of an ecmascript chunk is minified: each chunk item before the chunk is assembled
/// (`per_item`), the assembled chunk (`whole_chunk`), both, or neither. See
/// [`EcmascriptEmitOptions`].
#[derive(Clone, Default)]
pub struct ChunkMinification {
    /// Each chunk item is minified on its own (in parallel, cached per item).
    per_item: Option<ResolvedVc<ChunkItemMinifyOptions>>,
    /// The assembled chunk is minified in one pass.
    whole_chunk: Option<ReadRef<EcmascriptEmitOptions>>,
}

impl ChunkMinification {
    pub async fn for_chunking_context(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Self> {
        let Some(emit_options) = EcmascriptEmitOptions::find(chunking_context).await? else {
            return Ok(ChunkMinification::default());
        };
        let emit_options_value = emit_options.await?;
        let per_item = if emit_options_value.chunk_item_minify_options.is_some() {
            Some(emit_options.chunk_item_minify().to_resolved().await?)
        } else {
            None
        };
        let whole_chunk = emit_options_value
            .chunk_minify_options
            .is_some()
            .then_some(emit_options_value);
        Ok(ChunkMinification {
            per_item,
            whole_chunk,
        })
    }

    /// The minify options for each chunk item before it is written into the chunk, if chunk items
    /// are minified on their own.
    pub(crate) fn per_item(&self) -> Option<ResolvedVc<ChunkItemMinifyOptions>> {
        self.per_item
    }

    /// Applies the whole-chunk minification, if any, to the assembled chunk.
    pub fn finish_chunk(&self, code: Code, source_maps: bool) -> Result<Code> {
        match self
            .whole_chunk
            .as_ref()
            .and_then(|emit_options| emit_options.chunk_minify_options.as_ref())
        {
            Some(swc_minify_options) => minify(code, source_maps, swc_minify_options),
            None => Ok(code),
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
    /// Returns the code of every chunk item, each minified on its own if `minification` has
    /// per-item minification.
    pub async fn chunk_item_code_module_ids_and_paths(
        &self,
        minification: &ChunkMinification,
        source_maps: bool,
    ) -> Result<Vec<CodeModuleIdAndPath>> {
        let minify = minification.per_item.map(|minify_options| *minify_options);
        // Source maps only affect the per-item minification. Normalize the flag otherwise so it
        // doesn't fork the per-item tasks for chunks that don't minify per item.
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
