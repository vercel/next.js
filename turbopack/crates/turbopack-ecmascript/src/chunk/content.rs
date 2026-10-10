use std::future::IntoFuture;

use anyhow::Result;
use either::Either;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItems, ChunkingContext, MangleType, MinifyType, batch_info},
    code_builder::{Code, ComposedCode, ComposedCodeParts},
};

use crate::{
    chunk::{
        CodeModuleIdAndPath,
        batch::{EcmascriptChunkItemBatchGroup, EcmascriptChunkItemOrBatchWithAsyncInfo},
        batch_group_code_module_ids_and_paths, item_code_module_ids_and_paths,
    },
    minify::minify,
};

/// How the code of an ecmascript chunk is minified: never, once per chunk item before the chunk
/// is assembled, or once for the whole assembled chunk. Never both.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChunkMinification {
    None,
    /// Each chunk item is minified on its own (in parallel, cached per item). See
    /// [`ChunkingContext::minify_before_chunking`].
    PerItem {
        mangle: Option<MangleType>,
    },
    /// The assembled chunk is minified in one pass.
    WholeChunk {
        mangle: Option<MangleType>,
    },
}

impl ChunkMinification {
    pub async fn for_chunking_context(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Self> {
        Ok(match *chunking_context.minify_type().await? {
            MinifyType::NoMinify => ChunkMinification::None,
            MinifyType::Minify { mangle } => {
                if *chunking_context.minify_before_chunking().await? {
                    ChunkMinification::PerItem { mangle }
                } else {
                    ChunkMinification::WholeChunk { mangle }
                }
            }
        })
    }

    /// The minification to apply to each chunk item before it is written into the chunk.
    fn per_item(self) -> MinifyType {
        match self {
            ChunkMinification::PerItem { mangle } => MinifyType::Minify { mangle },
            ChunkMinification::None | ChunkMinification::WholeChunk { .. } => MinifyType::NoMinify,
        }
    }

    /// Applies the whole-chunk minification, if any, to a chunk assembled with a
    /// [`ComposedCodeBuilder`](turbopack_core::code_builder::ComposedCodeBuilder). The result
    /// references the chunk items' cells, unless the chunk is minified as a whole (which
    /// produces new, flat code).
    pub fn finish_composed_chunk(
        self,
        code: Code,
        parts: ComposedCodeParts,
        source_maps: bool,
    ) -> Result<ComposedCode> {
        Ok(match self {
            ChunkMinification::WholeChunk { mangle } => {
                ComposedCode::new(minify(code, source_maps, mangle)?, None)
            }
            ChunkMinification::None | ChunkMinification::PerItem { .. } => {
                ComposedCode::new(code, Some(parts))
            }
        })
    }

    /// Whether strict factories still carry their own `"use strict"` directive. Per-item
    /// minification removes it, which makes placing every strict factory in a strict context the
    /// chunk's responsibility. See [`crate::chunk::strict_factory_mode`].
    pub fn factories_have_strict_directives(self) -> bool {
        !matches!(self, ChunkMinification::PerItem { .. })
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
        minification: ChunkMinification,
        source_maps: bool,
    ) -> Result<Vec<CodeModuleIdAndPath>> {
        let minify = minification.per_item();
        // Source maps only affect the per-item minification. Normalize the flag otherwise so it
        // doesn't fork the per-item tasks for chunks that are minified as a whole (or not at all).
        let source_maps = source_maps && matches!(minify, MinifyType::Minify { .. });
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
