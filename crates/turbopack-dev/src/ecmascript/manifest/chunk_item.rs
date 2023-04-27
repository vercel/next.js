use anyhow::Result;
use indoc::formatdoc;
use turbo_tasks::TryJoinIterExt;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkItem, ChunkItemVc, ChunkingContext},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkingContextVc,
    },
    utils::StringifyJs,
};

use super::chunk_asset::DevManifestChunkAssetVc;
use crate::{
    ecmascript::chunk_data::{ChunkDataVc, ChunksDataVc},
    DevChunkingContextVc,
};

/// The DevManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value(shared)]
pub(super) struct DevManifestChunkItem {
    pub context: DevChunkingContextVc,
    pub manifest: DevManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl DevManifestChunkItemVc {
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
impl EcmascriptChunkItem for DevManifestChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context.into()
    }

    #[turbo_tasks::function]
    async fn content(self_vc: DevManifestChunkItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let chunks_data = self_vc.chunks_data().await?;
        let chunks_data = chunks_data.iter().try_join().await?;
        let chunks_data: Vec<_> = chunks_data
            .iter()
            .map(|chunk_data| chunk_data.runtime_chunk_data())
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
impl ChunkItem for DevManifestChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.manifest.ident()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: DevManifestChunkItemVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let mut references = this.manifest.references().await?.clone_value();

        for chunk_data in &*self_vc.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(AssetReferencesVc::cell(references))
    }
}
