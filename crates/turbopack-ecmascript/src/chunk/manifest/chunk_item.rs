use anyhow::{bail, Result};
use indexmap::IndexSet;
use indoc::formatdoc;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkingContext, ChunkingContextVc},
    reference::AssetReferencesVc,
};

use super::chunk_asset::ManifestChunkAssetVc;
use crate::{
    chunk::item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc,
    },
    utils::stringify_js_pretty,
};

/// The ManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value(shared)]
pub(super) struct ManifestChunkItem {
    pub context: ChunkingContextVc,
    pub manifest: ManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ManifestChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(self.manifest.path().to_string())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    fn related_path(&self) -> FileSystemPathVc {
        self.manifest.path()
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.manifest.chunk_group().chunks().await?;

        let mut chunk_server_paths = IndexSet::new();
        for chunk in chunks.iter() {
            // The "path" in this case is the chunk's path, not the chunk item's path.
            // The difference is a chunk is a file served by the dev server, and an
            // item is one of several that are contained in that chunk file.
            let chunk_path = &*chunk.path().await?;
            // The pathname is the file path necessary to load the chunk from the server.
            let output_root = self.context.output_root().await?;
            let chunk_server_path = if let Some(path) = output_root.get_path_to(chunk_path) {
                path
            } else {
                bail!(
                    "chunk path {} is not in output root {}",
                    chunk.path().to_string().await?,
                    self.context.output_root().to_string().await?
                );
            };
            chunk_server_paths.insert(chunk_server_path.to_string());
        }

        let code = formatdoc! {
            r#"
                __turbopack_export_value__({chunk_paths});
            "#,
            chunk_paths = stringify_js_pretty(&chunk_server_paths)
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
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.manifest.chunk_group().chunks();

        Ok(AssetReferencesVc::cell(
            chunks
                .await?
                .iter()
                .copied()
                .map(ChunkReferenceVc::new)
                .map(Into::into)
                .collect(),
        ))
    }
}
