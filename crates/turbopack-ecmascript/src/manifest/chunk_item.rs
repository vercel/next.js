use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::TryJoinIterExt;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkDataVc, ChunkItem, ChunkItemVc, ChunkingContext, ChunksDataVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};

use super::chunk_asset::ManifestChunkAssetVc;
use crate::{
    chunk::{
        data::EcmascriptChunkData, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkItemContentVc, EcmascriptChunkItemVc, EcmascriptChunkingContextVc,
    },
    utils::StringifyJs,
};

/// The ManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value(shared)]
pub(super) struct ManifestChunkItem {
    pub context: EcmascriptChunkingContextVc,
    pub manifest: ManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl ManifestChunkItemVc {
    #[turbo_tasks::function]
    async fn chunks_data(self) -> Result<ChunksDataVc> {
        let this = self.await?;
        Ok(ChunkDataVc::from_assets(
            this.context.output_root(),
            this.manifest.chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(self_vc: ManifestChunkItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let chunks_data = self_vc.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let code = formatdoc! {
            r#"
                __turbopack_export_value__({:#});
            "#,
            StringifyJs(&chunks_data)
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.manifest.ident()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ManifestChunkItemVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let mut references = this.manifest.references().await?.clone_value();

        for chunk_data in &*self_vc.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(AssetReferencesVc::cell(references))
    }
}
