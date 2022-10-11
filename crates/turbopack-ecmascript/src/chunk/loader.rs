use std::{collections::HashSet, fmt::Write as FmtWrite};

use anyhow::{anyhow, Result};
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
        let fs = chunk.path();

        // We need several items in order for a dynamic import to fully load. First, we
        // need the chunk id of the manifest chunk, which is its file path. The
        // chunk is a servable file, which will contain the manifest chunk item, which
        // will perform the actual chunk traversal and generate load statements.
        let chunk_id = fs.to_string().await?.to_string();

        // Next we need the pathname that we can request from the dev server to load the
        // manifest chunk, if it's not already been loaded. Note that the regular
        // asset.as_asset() has a different FileSystemVc than the
        // as_chunk().as_asset(), and only the chunk asset can get correct the
        // relative path.
        let root = chunk.path().root().await?;
        let asset_path = &*chunk.as_asset().path().await?;
        let pathname = format!(
            "/{}",
            root.get_path_to(asset_path)
                .ok_or_else(|| anyhow!("asset is not in server root"))?
        );

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
    return __turbopack_load__({chunk_id}, {pathname}).then(() => {{
        return __turbopack_require__({item_id});
    }}).then(() => __turbopack_import__({dynamic_id}));
}});",
            chunk_id = stringify_str(&chunk_id),
            pathname = stringify_str(&pathname),
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

        let mut chunk_ids = HashSet::new();
        for chunk in chunks.iter() {
            // The "id" in this case is the chunk's id, not the chunk item's id. The
            // difference is a chunk is a file served by the dev server, and an
            // item is one of several that are contained in that chunk file.
            // Chunk ids are the paths of the chunk.
            let fs = chunk.path();
            let id = fs.to_string().await?.to_string();
            // The pathname is the file path necessary to load the chunk from the server.
            let root = fs.root().await?;
            let asset_path = &*chunk.as_asset().path().await?;
            let pathname = format!(
                "/{}",
                root.get_path_to(asset_path)
                    .ok_or_else(|| anyhow!("asset is not in server root"))?
            );
            chunk_ids.insert((id, pathname));
        }

        let mut code = String::new();
        code += "const chunks = [\n";
        for (id, pathname) in chunk_ids {
            writeln!(
                code,
                "    [{}, {}],",
                stringify_str(&id),
                stringify_str(&pathname)
            )?;
        }
        code += "];\n";

        // TODO: a dedent macro would be awesome.
        write!(
            code,
            "
const loads = chunks.map(([id, path]) => __turbopack_load__(id, path));
__turbopack_export_value__(Promise.all(loads));"
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
