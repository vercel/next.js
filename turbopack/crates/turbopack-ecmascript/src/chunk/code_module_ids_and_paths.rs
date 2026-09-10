use anyhow::Result;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, TryJoinIterExt, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkItem, ChunkItemExt, ModuleId},
    code_builder::Code,
};

use crate::chunk::{
    EcmascriptChunkItemBatchGroup, EcmascriptChunkItemExt, EcmascriptChunkItemOrBatchWithAsyncInfo,
    EcmascriptChunkItemWithAsyncInfo,
};

#[turbo_tasks::value(shared, serialization = "skip")]
#[derive(Clone, Copy, Debug)]
pub enum ModuleFactoryMode {
    Strict,
    NonStrict,
}

impl ModuleFactoryMode {
    fn from_strict(strict: bool) -> Self {
        if strict {
            Self::Strict
        } else {
            Self::NonStrict
        }
    }

    pub fn is_strict(self) -> bool {
        matches!(self, Self::Strict)
    }
}

/// Generates the factory code of a single chunk item, omitting its strict-mode directive when the
/// chunk emits the item inside a strict factory group.
async fn item_code_and_mode(
    item: &EcmascriptChunkItemWithAsyncInfo,
    omit_use_strict: bool,
) -> Result<(ReadRef<Code>, ModuleFactoryMode)> {
    let strict = item.is_strict().await?;
    let async_module_info = item.async_info.map(|info| *info);
    let code = if omit_use_strict && strict {
        item.chunk_item.code_without_use_strict(async_module_info)
    } else {
        item.chunk_item.code(async_module_info)
    };
    Ok((code.await?, ModuleFactoryMode::from_strict(strict)))
}

/// A chunk item's emitted code, together with the module id and path it is registered under and
/// the factory form it has to be wrapped in.
pub type CodeModuleIdAndPath = (ModuleId, ReadRef<Code>, RcStr, ModuleFactoryMode);

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct CodeModuleIdsAndPaths(SmallVec<[CodeModuleIdAndPath; 1]>);

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct BatchGroupCodeModuleIdsAndPaths(
    FxHashMap<EcmascriptChunkItemOrBatchWithAsyncInfo, ReadRef<CodeModuleIdsAndPaths>>,
);

#[turbo_tasks::function]
pub async fn batch_group_code_module_ids_and_paths(
    batch_group: Vc<EcmascriptChunkItemBatchGroup>,
    omit_use_strict: bool,
) -> Result<Vc<BatchGroupCodeModuleIdsAndPaths>> {
    Ok(Vc::cell(
        batch_group
            .await?
            .items
            .iter()
            .map(async |item| {
                Ok((
                    item.clone(),
                    item_code_module_ids_and_paths(item.clone(), omit_use_strict).await?,
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
    omit_use_strict: bool,
) -> Result<Vc<CodeModuleIdsAndPaths>> {
    Ok(Vc::cell(match item {
        EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
            let (code, mode) = item_code_and_mode(&item, omit_use_strict).await?;
            smallvec![(
                item.chunk_item.id().await?,
                code,
                item.chunk_item.asset_ident().to_string().owned().await?,
                mode
            )]
        }
        EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch
            .await?
            .chunk_items
            .iter()
            .map(async |item| {
                let (code, mode) = item_code_and_mode(item, omit_use_strict).await?;
                Ok((
                    item.chunk_item.id().await?,
                    code,
                    item.chunk_item.asset_ident().to_string().owned().await?,
                    mode,
                ))
            })
            .try_join()
            .await?
            .into(),
    }))
}
