use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::{
    chunk::{
        EcmascriptChunkItemBatchGroup, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
        item::{ChunkItemFactoryContent, chunk_item_factory_content},
    },
    emit_options::ChunkItemMinifyOptions,
    minify::minify_chunk_item,
};

/// The module factory of a chunk item, minified on its own with `minify_options` (see
/// [`ChunkItemMinifyOptions`]).
///
/// Keyed by the content cell rather than by the chunk item, so that chunk size estimation (which
/// reads the estimated content) and code generation (which reads the final content) share one
/// minification: for most modules both are the same cell, see
/// `chunk_item_factory_content`. Modules whose estimated content differs (e.g. async loaders)
/// produce two small factories.
///
/// The result is a hash-only cell: it is recomputed rather than persisted.
#[turbo_tasks::function]
pub async fn minified_module_factory(
    content: Vc<EcmascriptChunkItemContent>,
    source_maps: bool,
    minify_options: Vc<ChunkItemMinifyOptions>,
) -> Result<Vc<Code>> {
    let factory = content.await?.module_factory().await?;
    Ok(match &minify_options.await?.options {
        Some(swc_minify_options) => minify_chunk_item(&factory, source_maps, swc_minify_options)?,
        None => factory,
    }
    .cell())
}

async fn code_module_id_and_path(
    item: &EcmascriptChunkItemWithAsyncInfo,
    minify: Option<ResolvedVc<ChunkItemMinifyOptions>>,
    source_maps: bool,
) -> Result<CodeModuleIdAndPath> {
    let async_info = item.async_info.map(|info| *info);
    // `None` here means the chunk items aren't minified on their own (the chunk may still be
    // minified as a whole later). A strict factory keeps its `"use strict"` directive either way;
    // the chunk drops it where it places the factory in a strict context (see
    // `write_module_factories`).
    let (code, strict) = if let Ok(ChunkItemFactoryContent::Minified { factory, strict }) =
        chunk_item_factory_content(item.chunk_item, async_info, false, minify, source_maps).await
    {
        (factory.await?, strict)
    } else {
        // Not minified per item, or the content failed to generate. Dropping that error is
        // intentional: `code` reports it as an issue and returns a factory that throws it, so the
        // chunk still builds.
        let factory = item.chunk_item.code(async_info).await?;
        (factory.code.to_code().await?, factory.strict)
    };
    Ok(CodeModuleIdAndPath {
        id: item.chunk_item.id().await?,
        code,
        path: item.chunk_item.asset_ident().to_string().owned().await?,
        strict,
    })
}

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct CodeModuleIdAndPath {
    pub id: ModuleId,
    pub code: ReadRef<Code>,
    pub path: RcStr,
    pub strict: bool,
}

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct CodeModuleIdsAndPaths(SmallVec<[CodeModuleIdAndPath; 1]>);

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct BatchGroupCodeModuleIdsAndPaths(
    FxHashMap<EcmascriptChunkItemOrBatchWithAsyncInfo, ReadRef<CodeModuleIdsAndPaths>>,
);

#[turbo_tasks::function]
pub async fn batch_group_code_module_ids_and_paths(
    batch_group: Vc<EcmascriptChunkItemBatchGroup>,
    minify: Option<ResolvedVc<ChunkItemMinifyOptions>>,
    source_maps: bool,
) -> Result<Vc<BatchGroupCodeModuleIdsAndPaths>> {
    Ok(Vc::cell(
        batch_group
            .await?
            .items
            .iter()
            .map(async |item| {
                Ok((
                    item.clone(),
                    item_code_module_ids_and_paths(
                        item.clone(),
                        minify.map(|minify_options| *minify_options),
                        source_maps,
                    )
                    .await?,
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
    minify: Option<ResolvedVc<ChunkItemMinifyOptions>>,
    source_maps: bool,
) -> Result<Vc<CodeModuleIdsAndPaths>> {
    Ok(Vc::cell(match item {
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
            smallvec![code_module_id_and_path(&item, minify, source_maps).await?]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(async |item| code_module_id_and_path(item, minify, source_maps).await)
            .try_join()
            .await?
            .into(),
    }))
}
