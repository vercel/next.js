use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{embed_file, FileContent, FileSystem, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptExports, EcmascriptExportsVc,
};

use crate::fs::DevServerFileSystemVc;

/// The HTML runtime asset.
#[turbo_tasks::value]
pub struct HtmlRuntimeAsset;

#[turbo_tasks::value_impl]
impl HtmlRuntimeAssetVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        Self::cell(HtmlRuntimeAsset)
    }
}

#[turbo_tasks::function]
fn html_runtime_path() -> FileSystemPathVc {
    DevServerFileSystemVc::new().root().join("html-runtime.js")
}

#[turbo_tasks::value_impl]
impl Asset for HtmlRuntimeAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        html_runtime_path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        embed_file!("js/html-runtime.js").into()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for HtmlRuntimeAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: HtmlRuntimeAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for HtmlRuntimeAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: HtmlRuntimeAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        HtmlRuntimeChunkItem {
            context,
            inner: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::None.cell()
    }
}

#[turbo_tasks::value]
struct HtmlRuntimeChunkItem {
    context: ChunkingContextVc,
    inner: HtmlRuntimeAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for HtmlRuntimeChunkItem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        html_runtime_path().to_string()
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for HtmlRuntimeChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for HtmlRuntimeChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        if let AssetContent::File(file) = &*self.inner.content().await? {
            if let FileContent::Content(content) = &*file.await? {
                return Ok(EcmascriptChunkItemContent {
                    inner_code: String::from_utf8(content.content().to_vec())?,
                    // TODO: We generate a minimal map for runtime code so that the filename is
                    // displayed in dev tools.
                    ..Default::default()
                }
                .cell());
            }
        }
        Err(anyhow!("runtime code missing"))
    }
}
