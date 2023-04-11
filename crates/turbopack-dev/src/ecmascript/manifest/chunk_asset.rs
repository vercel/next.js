use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkVc, ChunkableAsset, ChunkableAssetVc,
        ChunkingContext, ChunkingContextVc,
    },
    ident::AssetIdentVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
};

use super::chunk_item::DevManifestChunkItem;
use crate::DevChunkingContextVc;

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("manifest chunk".to_string())
}

/// The manifest chunk is deferred until requested by the manifest loader
/// item when the dynamic `import()` expression is reached. Its responsibility
/// is to generate a Promise that will resolve only after all the necessary
/// chunks needed by the dynamic import are loaded by the client.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value(shared)]
pub struct DevManifestChunkAsset {
    pub asset: ChunkableAssetVc,
    pub chunking_context: DevChunkingContextVc,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl DevManifestChunkAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        asset: ChunkableAssetVc,
        chunking_context: DevChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        Self::cell(DevManifestChunkAsset {
            asset,
            chunking_context,
            availability_info: availability_info.into_value(),
        })
    }

    #[turbo_tasks::function]
    pub(super) async fn entry_chunk(self) -> Result<ChunkVc> {
        let this = self.await?;
        Ok(this.asset.as_chunk(
            this.chunking_context.into(),
            Value::new(this.availability_info),
        ))
    }

    #[turbo_tasks::function]
    pub(super) async fn chunks(self) -> Result<AssetsVc> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_group(self.entry_chunk()))
    }

    #[turbo_tasks::function]
    pub async fn manifest_chunk(self) -> Result<AssetVc> {
        let this = self.await?;
        Ok(this.chunking_context.generate_chunk(self.as_chunk(
            this.chunking_context.into(),
            Value::new(this.availability_info),
        )))
    }
}

#[turbo_tasks::function]
fn dev_manifest_chunk_reference_description() -> StringVc {
    StringVc::cell("dev manifest chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for DevManifestChunkAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: DevManifestChunkAssetVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    SingleAssetReferenceVc::new(chunk, dev_manifest_chunk_reference_description())
                        .into()
                })
                .collect(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for DevManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: DevManifestChunkAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into(), availability_info).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for DevManifestChunkAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: DevManifestChunkAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        let Some(context) = DevChunkingContextVc::resolve_from(context).await? else {
            bail!("invalid chunking context");
        };

        Ok(DevManifestChunkItem {
            context,
            manifest: self_vc,
        }
        .cell()
        .into())
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}
