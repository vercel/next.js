use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItemExt, MangleType, MinifyType, ModuleId},
    code_builder::Code,
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

/// The module factory of a chunk item, minified on its own.
///
/// Keyed by the content cell rather than by the chunk item, so that chunk size estimation (which
/// reads the estimated content) and code generation (which reads the final content) share one
/// minification: for most modules both are the same cell, see
/// [`EcmascriptChunkType::chunk_item_size`](crate::chunk::EcmascriptChunkType). Modules whose
/// estimated content differs (e.g. async loaders) produce two small factories.
///
/// The result is a hash-only cell: it is recomputed rather than persisted.
#[turbo_tasks::function]
pub async fn minified_module_factory(
    content: Vc<EcmascriptChunkItemContent>,
    source_maps: bool,
    mangle: bool,
) -> Result<Vc<Code>> {
    let factory = content.await?.module_factory_code().await?;
    Ok(minify_chunk_item(&factory, source_maps, per_item_mangle(mangle))?.cell())
}

async fn code_module_id_and_path(
    item: &EcmascriptChunkItemWithAsyncInfo,
    minify: MinifyType,
    source_maps: bool,
) -> Result<CodeModuleIdAndPath> {
    let async_info = item.async_info.map(|info| *info);
    let factory = item.chunk_item.code(async_info).await?;
    // `MinifyType::NoMinify` here means the chunk will be minified as a whole later (or not at
    // all); only the per-item mode asks for the factory to be minified now. A strict factory keeps
    // its `"use strict"` directive either way; the chunk drops it where it places the factory in a
    // strict context (see `write_module_factories`).
    let code = match minify {
        MinifyType::Minify { mangle } => {
            let minified = async {
                let content = item
                    .chunk_item
                    .into_trait_ref()
                    .await?
                    .content_with_async_module_info(async_info, false)
                    .await?;
                minified_module_factory(content, source_maps, mangle.is_some()).await
            }
            .await;
            match minified {
                Ok(minified) => minified,
                // Usually the content failed to generate: `code` already reported the issue and
                // returned a factory that throws the error, so minify that instead. If the
                // minification itself failed, this fails again with the same error.
                Err(_) => ReadRef::new_owned(minify_chunk_item(
                    &*factory.code.to_code().await?,
                    source_maps,
                    per_item_mangle(mangle.is_some()),
                )?),
            }
        }
        MinifyType::NoMinify => factory.code.to_code().await?,
    };
    Ok(CodeModuleIdAndPath {
        id: item.chunk_item.id().await?,
        code,
        path: item.chunk_item.asset_ident().to_string().owned().await?,
        strict: factory.strict,
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
