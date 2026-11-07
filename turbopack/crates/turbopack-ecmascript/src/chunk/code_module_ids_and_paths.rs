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
        EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt,
        EcmascriptChunkItemOrBatchWithAsyncInfo, EcmascriptChunkItemWithAsyncInfo,
    },
    emit_options::EcmascriptEmitOptions,
    minify::minify_chunk_item,
};

async fn code_module_id_and_path(
    item: &EcmascriptChunkItemWithAsyncInfo,
    minify: Option<ResolvedVc<EcmascriptEmitOptions>>,
    source_maps: bool,
) -> Result<CodeModuleIdAndPath> {
    let factory = item
        .chunk_item
        .code(item.async_info.map(|info| *info))
        .await?;
    let code = factory.code.to_code().await?;
    // `None` here means the chunk will be minified as a whole later (or not at all); only the
    // per-item mode asks for the factory to be minified now. A strict factory keeps its
    // `"use strict"` directive either way; the chunk drops it where it places the factory in a
    // strict context (see `write_module_factories`).
    let options = match minify {
        Some(options) => Some(options.await?),
        None => None,
    };
    let code = match options
        .as_ref()
        .and_then(|options| options.swc_minify_options.as_ref())
    {
        Some(swc_minify_options) => {
            let mut swc_minify_options = swc_minify_options.clone();
            if let Some(mangle) = &mut swc_minify_options.mangle {
                // Char-frequency mangling orders mangled names by the character frequency of the
                // code being minified. Per item, that order differs from factory to factory,
                // which hurts gzip across the chunk. A fixed order keeps names consistent
                // between factories.
                mangle.disable_char_freq = true;
            }
            ReadRef::new_owned(minify_chunk_item(&code, source_maps, &swc_minify_options)?)
        }
        None => code,
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
    minify: Option<ResolvedVc<EcmascriptEmitOptions>>,
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
                        minify.map(|options| *options),
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
    minify: Option<ResolvedVc<EcmascriptEmitOptions>>,
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
