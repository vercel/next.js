use std::io::Write as _;

use anyhow::{anyhow, bail, Result};
use indoc::writedoc;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkItem, ChunkItemVc, ChunkableAsset, ChunkingContext, ChunkingContextVc},
    reference::AssetReferencesVc,
};

use super::chunk_asset::{ManifestChunkAssetReference, ManifestChunkAssetVc};
use crate::{
    chunk::{
        item::{
            EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
            EcmascriptChunkItemVc,
        },
        placeable::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    },
    utils::stringify_js,
};

/// The manifest loader item is shipped in the same chunk that uses the dynamic
/// `import()` expression. Its responsibility is to load the manifest chunk from
/// the server. The dynamic import has been rewritten to import this manifest
/// loader item, which will load the manifest chunk from the server, which
/// will load all the chunks needed by the dynamic import. Finally, we'll be
/// able to import the module we're trying to dynamically import.
///
/// Splitting the dynamic import into a quickly generate-able manifest loader
/// item and a slow-to-generate manifest chunk allows for faster incremental
/// compilation. The traversal won't be performed until the dynamic import is
/// actually reached, instead of eagerly as part of the chunk that the dynamic
/// import appears in.
#[turbo_tasks::value]
pub struct ManifestLoaderItem {
    context: ChunkingContextVc,
    manifest: ManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl ManifestLoaderItemVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, manifest: ManifestChunkAssetVc) -> Self {
        Self::cell(ManifestLoaderItem { context, manifest })
    }

    #[turbo_tasks::function]
    async fn chunks_list_path(self) -> Result<FileSystemPathVc> {
        let this = &*self.await?;
        Ok(this.context.chunk_path(
            this.manifest.path().parent().join("chunk-list.json"),
            ".json",
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ManifestLoaderItem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        self.manifest
            .path()
            .parent()
            .join("manifest-loader.js")
            .to_string()
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ManifestLoaderItem {
    #[turbo_tasks::function]
    async fn references(self_vc: ManifestLoaderItemVc) -> Result<AssetReferencesVc> {
        let this = &*self_vc.await?;
        Ok(AssetReferencesVc::cell(vec![ManifestChunkAssetReference {
            manifest: this.manifest,
        }
        .cell()
        .into()]))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestLoaderItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    fn related_path(&self) -> FileSystemPathVc {
        self.manifest.path()
    }

    #[turbo_tasks::function]
    async fn content(self_vc: ManifestLoaderItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let this = &*self_vc.await?;
        let mut code = Vec::new();

        let manifest = this.manifest.await?;
        let asset = manifest.asset.as_asset();
        let chunk = this.manifest.as_chunk(this.context);
        let chunk_path = &*chunk.path().await?;

        let output_root = this.context.output_root().await?;

        // We need several items in order for a dynamic import to fully load. First, we
        // need the chunk path of the manifest chunk, relative from the output root. The
        // chunk is a servable file, which will contain the manifest chunk item, which
        // will perform the actual chunk traversal and generate load statements.
        let chunk_server_path = if let Some(path) = output_root.get_path_to(chunk_path) {
            path
        } else {
            bail!(
                "chunk path {} is not in output root {}",
                chunk.path().to_string().await?,
                this.context.output_root().to_string().await?
            );
        };

        // We also need the manifest chunk item's id, which points to a CJS module that
        // exports a promise for all of the necessary chunk loads.
        let item_id = &*this.manifest.as_chunk_item(this.context).id().await?;

        // Finally, we need the id of the module that we're actually trying to
        // dynamically import.
        let placeable = EcmascriptChunkPlaceableVc::resolve_from(asset)
            .await?
            .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let dynamic_id = &*placeable.as_chunk_item(this.context).id().await?;

        // This is the code that will be executed when the dynamic import is reached.
        // It will load the manifest chunk, which will load all the chunks needed by
        // the dynamic import, and finally we'll be able to import the module we're
        // trying to dynamically import.
        // This is similar to what happens when the first evaluated chunk is executed
        // on first page load, but it's happening on-demand instead of eagerly.
        writedoc!(
            code,
            r#"
                __turbopack_export_value__((__turbopack_import__) => {{
                    return __turbopack_load__({chunk_server_path}).then(() => {{
                        return __turbopack_require__({item_id});
                    }}).then((chunks_paths) => {{
                        return Promise.all(chunks_paths.map((chunk_path) => __turbopack_load__(chunk_path)));
                    }}).then(() => {{
                        return __turbopack_import__({dynamic_id});
                    }});
                }});
            "#,
            chunk_server_path = stringify_js(chunk_server_path),
            item_id = stringify_js(item_id),
            dynamic_id = stringify_js(dynamic_id)
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}
