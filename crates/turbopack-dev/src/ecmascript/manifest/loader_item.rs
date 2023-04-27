use std::io::Write as _;

use anyhow::{anyhow, bail, Result};
use indoc::writedoc;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkItem, ChunkItemVc, ChunkingContext},
    ident::AssetIdentVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkingContextVc,
    },
    utils::StringifyJs,
};

use super::chunk_asset::DevManifestChunkAssetVc;
use crate::{ChunkDataOptionVc, ChunkDataVc};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("loader".to_string())
}

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
pub struct DevManifestLoaderItem {
    manifest: DevManifestChunkAssetVc,
}

#[turbo_tasks::value_impl]
impl DevManifestLoaderItemVc {
    #[turbo_tasks::function]
    pub fn new(manifest: DevManifestChunkAssetVc) -> Self {
        Self::cell(DevManifestLoaderItem { manifest })
    }

    #[turbo_tasks::function]
    pub async fn chunk_data(self) -> Result<ChunkDataOptionVc> {
        let this = self.await?;
        let chunk = this.manifest.manifest_chunk();
        let manifest = this.manifest.await?;
        Ok(ChunkDataVc::from_asset(
            manifest.chunking_context.output_root(),
            chunk,
        ))
    }
}

#[turbo_tasks::function]
fn dev_manifest_loader_chunk_reference_description() -> StringVc {
    StringVc::cell("dev manifest loader chunk".to_string())
}

#[turbo_tasks::value_impl]
impl ChunkItem for DevManifestLoaderItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.manifest.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(self_vc: DevManifestLoaderItemVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;

        let mut references = vec![SingleAssetReferenceVc::new(
            this.manifest.manifest_chunk(),
            dev_manifest_loader_chunk_reference_description(),
        )
        .into()];

        if let Some(chunk_data) = &*self_vc.chunk_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for DevManifestLoaderItem {
    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Result<EcmascriptChunkingContextVc> {
        Ok(self.manifest.await?.chunking_context.into())
    }

    #[turbo_tasks::function]
    async fn content(self_vc: DevManifestLoaderItemVc) -> Result<EcmascriptChunkItemContentVc> {
        let this = &*self_vc.await?;
        let mut code = Vec::new();

        let manifest = this.manifest.await?;
        let asset = manifest.asset.as_asset();

        // We need several items in order for a dynamic import to fully load. First, we
        // need the chunk path of the manifest chunk, relative from the output root. The
        // chunk is a servable file, which will contain the manifest chunk item, which
        // will perform the actual chunk traversal and generate load statements.
        let chunk_server_data = if let Some(data) = &*self_vc.chunk_data().await? {
            data.await?
        } else {
            bail!(
                "chunk {} doesn't have chunk data",
                this.manifest.manifest_chunk().ident().to_string().await?,
            );
        };

        // We also need the manifest chunk item's id, which points to a CJS module that
        // exports a promise for all of the necessary chunk loads.
        let item_id = &*this
            .manifest
            .as_chunk_item(manifest.chunking_context.into())
            .id()
            .await?;

        // Finally, we need the id of the module that we're actually trying to
        // dynamically import.
        let placeable = EcmascriptChunkPlaceableVc::resolve_from(asset)
            .await?
            .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let dynamic_id = &*placeable
            .as_chunk_item(manifest.chunking_context.into())
            .id()
            .await?;

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
                    return __turbopack_load__({chunk_server_data}).then(() => {{
                        return __turbopack_require__({item_id});
                    }}).then((chunks) => {{
                        return Promise.all(chunks.map((chunk_path) => __turbopack_load__(chunk_path)));
                    }}).then(() => {{
                        return __turbopack_import__({dynamic_id});
                    }});
                }});
            "#,
            chunk_server_data = StringifyJs(&chunk_server_data.runtime_chunk_data()),
            item_id = StringifyJs(item_id),
            dynamic_id = StringifyJs(dynamic_id),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            ..Default::default()
        }
        .into())
    }
}
