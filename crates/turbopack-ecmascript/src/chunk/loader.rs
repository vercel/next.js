use std::fmt::Write as FmtWrite;

use anyhow::{anyhow, bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContextVc, ChunksVc,
    },
    reference::AssetReferencesVc,
};

use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::{stringify_module_id, stringify_str},
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
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ManifestLoaderItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let mut code = String::new();

        let manifest = self.manifest.await?;
        let asset = manifest.asset.as_asset();
        let chunk = self.manifest.as_chunk(self.context);
        let chunk_path = &*chunk.path().await?;

        let output_root = self.context.output_root().await?;

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
                self.context.output_root().to_string().await?
            );
        };

        // We also need the manifest chunk item's id, which points to a CJS module that
        // exports a promise for all of the necessary chunk loads.
        let item_id = &*self.manifest.as_chunk_item(self.context).id().await?;

        // Finally, we need the id of the module that we're actually trying to
        // dynamically import.
        let placeable = EcmascriptChunkPlaceableVc::resolve_from(asset)
            .await?
            .ok_or_else(|| anyhow!("asset is not placeable in ecmascript chunk"))?;
        let dynamic_id = &*placeable.as_chunk_item(self.context).id().await?;

        // TODO: a dedent macro with expression interpolation would be awesome.
        write!(
            code,
            "
__turbopack_export_value__((__turbopack_import__) => {{
    return __turbopack_load__({chunk_server_path}).then(() => {{
        return __turbopack_require__({item_id});
    }}).then(() => __turbopack_import__({dynamic_id}));
}});",
            chunk_server_path = stringify_str(chunk_server_path),
            item_id = stringify_module_id(item_id),
            dynamic_id = stringify_module_id(dynamic_id),
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            ..Default::default()
        }
        .into())
    }
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
    pub asset: ChunkableAssetVc,
    pub chunking_context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ManifestChunkAssetVc {
    #[turbo_tasks::function]
    pub fn new(asset: ChunkableAssetVc, chunking_context: ChunkingContextVc) -> Self {
        Self::cell(ManifestChunkAsset {
            asset,
            chunking_context,
        })
    }

    #[turbo_tasks::function]
    async fn chunks(self) -> Result<ChunksVc> {
        let this = self.await?;
        let chunk_group = ChunkGroupVc::from_asset(this.asset, this.chunking_context);
        Ok(chunk_group.chunks())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join("manifest-chunk.js")
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ManifestChunkAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ManifestChunkAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ManifestChunkAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ManifestChunkItem {
            context,
            manifest: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

/// The ManifestChunkItem generates a __turbopack_load__ call for every chunk
/// necessary to load the real asset. Once all the loads resolve, it is safe to
/// __turbopack_import__ the actual module that was dynamically imported.
#[turbo_tasks::value]
struct ManifestChunkItem {
    context: ChunkingContextVc,
    manifest: ManifestChunkAssetVc,
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
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let chunks = self.manifest.chunks().await?;

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

        let mut code = String::new();
        code += "const chunks = [\n";
        for pathname in chunk_server_paths {
            writeln!(code, "    {},", stringify_str(&pathname))?;
        }
        code += "];\n";

        // TODO: a dedent macro would be awesome.
        write!(
            code,
            "
__turbopack_export_value__(Promise.all(chunks.map(__turbopack_load__)));"
        )?;

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ManifestChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.manifest.chunks();

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
