use std::io::Write;

use anyhow::{bail, Result};
use serde_json::Value;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{rope::RopeBuilder, File, FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc, ChunkingContextVc, ChunksVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
    virtual_asset::VirtualAssetVc,
};
use turbopack_dev_server::source::{asset_graph::AssetGraphContentSourceVc, ContentSourceVc};
use turbopack_ecmascript::{
    utils::stringify_str, EcmascriptInputTransform, EcmascriptInputTransformsVc,
    EcmascriptModuleAssetType, EcmascriptModuleAssetVc,
};

use crate::{embed_js::next_js_file, util::get_asset_path_from_route};

#[turbo_tasks::function]
pub async fn create_page_loader(
    server_root: FileSystemPathVc,
    client_context: AssetContextVc,
    client_chunking_context: ChunkingContextVc,
    entry_asset: AssetVc,
    pathname: StringVc,
) -> Result<ContentSourceVc> {
    let asset = PageLoaderAsset {
        server_root,
        client_context,
        client_chunking_context,
        entry_asset,
        pathname,
    }
    .cell();

    Ok(AssetGraphContentSourceVc::new_lazy(server_root, asset.into()).into())
}

#[turbo_tasks::value(shared)]
pub struct PageLoaderAsset {
    pub server_root: FileSystemPathVc,
    pub client_context: AssetContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub entry_asset: AssetVc,
    pub pathname: StringVc,
}

#[turbo_tasks::value_impl]
impl PageLoaderAssetVc {
    #[turbo_tasks::function]
    async fn get_loader_entry_asset(self) -> Result<AssetVc> {
        let this = &*self.await?;

        let mut result = RopeBuilder::default();
        writeln!(
            result,
            "const PAGE_PATH = {};\n",
            stringify_str(&format!("/{}", &*this.pathname.await?))
        )?;

        let base_code = next_js_file("entry/page-loader.ts");
        if let FileContent::Content(base_file) = &*base_code.await? {
            result += base_file.content()
        } else {
            bail!("required file `entry/page-loader.ts` not found");
        }

        let file = File::from(result.build());

        Ok(VirtualAssetVc::new(this.entry_asset.path().join("page-loader.ts"), file.into()).into())
    }

    #[turbo_tasks::function]
    async fn get_page_chunks(self) -> Result<ChunksVc> {
        let this = &*self.await?;

        let loader_entry_asset = self.get_loader_entry_asset();

        let asset = EcmascriptModuleAssetVc::new(
            loader_entry_asset,
            this.client_context,
            turbo_tasks::Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript]),
            this.client_context.environment(),
        );

        let chunk_group =
            ChunkGroupVc::from_chunk(asset.as_evaluated_chunk(this.client_chunking_context, None));

        Ok(chunk_group.chunks())
    }
}

#[turbo_tasks::value_impl]
impl Asset for PageLoaderAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        Ok(self
            .server_root
            .join("_next/static/chunks/pages")
            .join(&get_asset_path_from_route(&self.pathname.await?, ".js")))
    }

    #[turbo_tasks::function]
    async fn content(self_vc: PageLoaderAssetVc) -> Result<AssetContentVc> {
        let this = &*self_vc.await?;

        let chunks = self_vc.get_page_chunks().await?;

        let mut data = Vec::with_capacity(chunks.len());
        for chunk in chunks.iter() {
            let path = chunk.path().await?;
            data.push(Value::String(path.path.clone()));
        }

        let content = format!(
            "__turbopack_load_page_chunks__({}, {})\n",
            stringify_str(&this.pathname.await?),
            Value::Array(data)
        );

        Ok(AssetContentVc::from(File::from(content)))
    }

    #[turbo_tasks::function]
    async fn references(self_vc: PageLoaderAssetVc) -> Result<AssetReferencesVc> {
        let chunks = self_vc.get_page_chunks().await?;

        let mut references = Vec::with_capacity(chunks.len());
        for chunk in chunks.iter() {
            references.push(ChunkReferenceVc::new(*chunk).into());
        }

        Ok(AssetReferencesVc::cell(references))
    }
}
