use anyhow::Result;
use indexmap::IndexSet;
use indoc::formatdoc;
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
use crate::DevChunkingContextVc;

/// The DevManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value(shared)]
pub(super) struct DevManifestChunkItem {
    pub context: DevChunkingContextVc,
    pub manifest: DevManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for DevManifestChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context.into()
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.manifest.chunks().await?;
        let output_root = self.context.output_root().await?;

        let mut chunk_server_paths = IndexSet::new();
        for chunk in chunks.iter() {
            // The "path" in this case is the chunk's path, not the chunk item's path.
            // The difference is a chunk is a file served by the dev server, and an
            // item is one of several that are contained in that chunk file.
            let chunk_path = &*chunk.ident().path().await?;
            // The pathname is the file path necessary to load the chunk from the server.
            if let Some(path) = output_root.get_path_to(chunk_path) {
                chunk_server_paths.insert(path.to_string());
            } else {
                // ignore all chunks that are not in the output root
                // they need to be handled by some external mechanism
            };
        }

        let code = formatdoc! {
            r#"
                __turbopack_export_value__({:#});
            "#,
            StringifyJs(&chunk_server_paths)
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
    fn references(&self) -> AssetReferencesVc {
        self.manifest.references()
    }
}
