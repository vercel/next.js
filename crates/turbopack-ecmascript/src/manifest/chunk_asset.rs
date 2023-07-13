use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkVc, ChunkableModule, ChunkableModuleVc,
        ChunkingContext, ChunkingContextVc,
    },
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    output::OutputAssetsVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};

use super::chunk_item::ManifestChunkItem;
use crate::chunk::{
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
};

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
pub struct ManifestChunkAsset {
    pub asset: ChunkableModuleVc,
    pub chunking_context: EcmascriptChunkingContextVc,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl ManifestChunkAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        asset: ChunkableModuleVc,
        chunking_context: EcmascriptChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        Self::cell(ManifestChunkAsset {
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
    pub(super) async fn chunks(self) -> Result<OutputAssetsVc> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_group(self.entry_chunk()))
    }

    #[turbo_tasks::function]
    pub async fn manifest_chunks(self) -> Result<OutputAssetsVc> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_group(self.as_chunk(
            this.chunking_context.into(),
            Value::new(this.availability_info),
        )))
    }
}

#[turbo_tasks::function]
fn manifest_chunk_reference_description() -> StringVc {
    StringVc::cell("manifest chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.asset.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ManifestChunkAssetVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(|chunk| {
                    SingleAssetReferenceVc::new(
                        chunk.into(),
                        manifest_chunk_reference_description(),
                    )
                    .into()
                })
                .collect(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for ManifestChunkAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: ManifestChunkAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into(), availability_info).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestChunkAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self_vc: ManifestChunkAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<EcmascriptChunkItemVc> {
        Ok(ManifestChunkItem {
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
