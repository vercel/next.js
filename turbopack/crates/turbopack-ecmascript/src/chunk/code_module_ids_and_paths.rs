use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItemExt, MangleType, MinifyType, ModuleId},
    code_builder::{Code, CodeCells},
};

use crate::{
    chunk::{
        EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt,
        EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
    },
    minify::minify_chunk_item,
};

async fn code_module_id_and_path(
    item: &EcmascriptChunkItemWithAsyncInfo,
    minify: MinifyType,
    source_maps: bool,
) -> Result<CodeModuleIdAndPath> {
    let factory = item
        .chunk_item
        .code(item.async_info.map(|info| *info))
        .await?;
    // `MinifyType::NoMinify` here means the chunk will be minified as a whole later (or not at
    // all); only the per-item mode asks for the factory to be minified now. A minified strict
    // factory drops its own `"use strict"` directive: the chunk places every strict factory in a
    // strict context instead (see `strict_factory_mode`).
    let cells = match minify {
        MinifyType::Minify { mangle } => {
            minified_module_factory(
                *factory.code,
                source_maps,
                MinifyType::Minify {
                    // `OptimalSize` orders mangled names by the character frequency of the code
                    // being minified. Per item, that order differs from factory to factory, which
                    // hurts gzip across the chunk. A fixed order keeps names consistent between
                    // factories.
                    mangle: mangle.map(|_| MangleType::Deterministic),
                },
                factory.strict,
            )
            .to_resolved()
            .await?
        }
        MinifyType::NoMinify => factory.code,
    };
    Ok(CodeModuleIdAndPath {
        id: item.chunk_item.id().await?,
        code: cells.to_code().await?,
        cells: Some(cells.await?),
        path: item.chunk_item.asset_ident().to_string().owned().await?,
        strict: factory.strict,
    })
}

/// A module factory minified on its own, stored as its own persisted cells so that chunks can
/// reference the minified bytes instead of persisting a copy (and so that a cache restore doesn't
/// re-minify unchanged factories).
#[turbo_tasks::function]
async fn minified_module_factory(
    code: ResolvedVc<CodeCells>,
    source_maps: bool,
    minify: MinifyType,
    strip_strict_directive: bool,
) -> Result<Vc<CodeCells>> {
    let MinifyType::Minify { mangle } = minify else {
        anyhow::bail!("minified_module_factory called without minification");
    };
    let code = code.to_code().await?;
    let minified = minify_chunk_item(&code, source_maps, mangle, strip_strict_directive)?;
    Ok(*minified.resolved_code_cells())
}

#[derive(Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct CodeModuleIdAndPath {
    pub id: ModuleId,
    pub code: ReadRef<Code>,
    /// The persisted cells `code` was read from, so that chunks can reference them. Always set
    /// outside of tests.
    pub cells: Option<ReadRef<CodeCells>>,
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
