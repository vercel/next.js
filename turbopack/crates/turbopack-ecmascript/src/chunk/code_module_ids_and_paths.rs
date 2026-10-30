use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemExt, MangleType, MinifyType, ModuleId},
    code_builder::CodeCells,
};

use crate::{
    chunk::{
        EcmascriptChunkItemBatchGroup, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
    },
    minify::minify_chunk_item,
};

/// The mangling used when minifying a single chunk item.
///
/// `OptimalSize` orders mangled names by the character frequency of the code being minified. Per
/// item, that order differs from factory to factory, which hurts gzip across the chunk. A fixed
/// order keeps names consistent between factories.
fn per_item_mangle(mangle: bool) -> Option<MangleType> {
    mangle.then_some(MangleType::Deterministic)
}

/// The module factory of a chunk item, minified on its own, stored as its own persisted cells so
/// that chunks can reference the minified bytes instead of persisting a copy (and so that a cache
/// restore doesn't re-minify unchanged factories).
///
/// Keyed by the content cell rather than by the chunk item, so that chunk size estimation (which
/// reads the estimated content) and code generation (which reads the final content) share one
/// minification: for most modules both are the same cell, see
/// [`EcmascriptChunkType::chunk_item_size`](crate::chunk::EcmascriptChunkType). Modules whose
/// estimated content differs (e.g. async loaders) produce two small factories. The unminified
/// factory is an intermediate of this task and isn't stored.
#[turbo_tasks::function]
pub async fn minified_module_factory(
    content: Vc<EcmascriptChunkItemContent>,
    source_maps: bool,
    mangle: bool,
) -> Result<Vc<CodeCells>> {
    let factory = content.await?.module_factory_code().await?;
    Ok(*minify_chunk_item(&factory, source_maps, per_item_mangle(mangle))?.resolved_code_cells())
}

/// The final content of a chunk item and whether its factory is strict. Fails if the content failed
/// to generate: reading it here surfaces that error before minifying rather than inside it.
async fn final_content(
    item: &EcmascriptChunkItemWithAsyncInfo,
    async_info: Option<Vc<AsyncModuleInfo>>,
) -> Result<(Vc<EcmascriptChunkItemContent>, bool)> {
    let content = item
        .chunk_item
        .into_trait_ref()
        .await?
        .content_with_async_module_info(async_info, false)
        .await?;
    let strict = content.await?.options.strict;
    Ok((content, strict))
}

async fn code_module_id_and_path(
    item: &EcmascriptChunkItemWithAsyncInfo,
    minify: MinifyType,
    source_maps: bool,
) -> Result<CodeModuleIdAndPath> {
    let async_info = item.async_info.map(|info| *info);
    // A strict factory keeps its `"use strict"` directive whether or not it's minified; the chunk
    // drops it where it places the factory in a strict context (see `write_module_factories`).
    let per_item = match minify {
        MinifyType::Minify { mangle } => final_content(item, async_info)
            .await
            .ok()
            .map(|content| (content, mangle.is_some())),
        MinifyType::NoMinify => None,
    };
    let (cells, strict) = match per_item {
        Some(((content, strict), mangle)) => (
            minified_module_factory(content, source_maps, mangle)
                .to_resolved()
                .await?,
            strict,
        ),
        // Not minified, or the content failed to generate: `code` reports the error as an issue
        // and returns a factory that throws it.
        None => {
            let factory = item.chunk_item.code(async_info).await?;
            (factory.code, factory.strict)
        }
    };
    Ok(CodeModuleIdAndPath {
        id: item.chunk_item.id().await?,
        code: cells.await?.code(),
        cells,
        path: item.chunk_item.asset_ident().to_string().owned().await?,
        strict,
    })
}

/// A chunk item's module factory, as referenced by a chunk. Holds only references to the
/// factory's cells, not its bytes, so it stays equal when only the factory's bytes change (and a
/// chunk's composition, which depends on it, isn't recomputed).
#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct CodeModuleIdAndPath {
    pub id: ModuleId,
    /// The factory's persisted cells.
    pub cells: ResolvedVc<CodeCells>,
    /// The cell holding the factory's bytes ([`CodeCells::code`]).
    pub code: ResolvedVc<Rope>,
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
    minify: MinifyType,
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
                    item_code_module_ids_and_paths(item.clone(), minify, source_maps).await?,
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
    minify: MinifyType,
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
