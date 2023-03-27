use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Value};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    asset::AssetVc,
    chunk::{
        availability_info::AvailabilityInfo, available_assets::AvailableAssetsVc, ChunkItem,
        ChunkItemVc, ChunkableAssetVc, ChunkingContextVc, FromChunkableAsset, ModuleIdVc,
    },
};

use super::{
    context::EcmascriptChunkingContextVc,
    manifest::{chunk_asset::ManifestChunkAssetVc, loader_item::ManifestLoaderItemVc},
    placeable::EcmascriptChunkPlaceableVc,
    EcmascriptChunkPlaceable, EcmascriptChunkingContext,
};
use crate::ParseResultSourceMapVc;

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
    pub source_map: Option<ParseResultSourceMapVc>,
    pub options: EcmascriptChunkItemOptions,
    pub placeholder_for_future_extensions: (),
}

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct EcmascriptChunkItemOptions {
    pub module: bool,
    pub exports: bool,
    pub this: bool,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    fn content(&self) -> EcmascriptChunkItemContentVc;
    fn content_with_availability_info(
        &self,
        _availability_info: Value<AvailabilityInfo>,
    ) -> EcmascriptChunkItemContentVc {
        self.content()
    }
    fn chunking_context(&self) -> EcmascriptChunkingContextVc;
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemVc {
    /// Returns the module id of this chunk item.
    #[turbo_tasks::function]
    pub fn id(self) -> ModuleIdVc {
        self.chunking_context().chunk_item_id(self)
    }
}

#[async_trait::async_trait]
impl FromChunkableAsset for EcmascriptChunkItemVc {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>> {
        let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? else {
            return Ok(None);
        };

        let Some(context) = EcmascriptChunkingContextVc::resolve_from(context).await? else {
            return Ok(None);
        };

        Ok(Some(placeable.as_chunk_item(context)))
    }

    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableAssetVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Self>> {
        let Some(context) = EcmascriptChunkingContextVc::resolve_from(context).await? else {
            return Ok(None);
        };

        let next_availability_info = match availability_info.into_value() {
            AvailabilityInfo::Untracked => AvailabilityInfo::Untracked,
            AvailabilityInfo::Root {
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: AvailableAssetsVc::new(vec![current_availability_root]),
                current_availability_root: asset.as_asset(),
            },
            AvailabilityInfo::Inner {
                available_assets,
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: available_assets.with_roots(vec![current_availability_root]),
                current_availability_root: asset.as_asset(),
            },
        };
        let manifest_asset =
            ManifestChunkAssetVc::new(asset, context, Value::new(next_availability_info));
        let manifest_loader = ManifestLoaderItemVc::new(manifest_asset);
        Ok(Some(manifest_loader.into()))
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItemsChunk(Vec<EcmascriptChunkItemVc>);

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(pub(super) Vec<EcmascriptChunkItemVc>);
