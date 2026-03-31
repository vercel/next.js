use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::{OutputAsset, OutputAssetsReference},
    source_map::{GenerateSourceMap, SourceMap},
};

use super::CssChunk;

/// Represents the source map of an css chunk.
#[turbo_tasks::value]
pub struct CssChunkSourceMapAsset {
    chunk: ResolvedVc<CssChunk>,
}

#[turbo_tasks::value_impl]
impl CssChunkSourceMapAsset {
    #[turbo_tasks::function]
    pub fn new(chunk: ResolvedVc<CssChunk>) -> Vc<Self> {
        CssChunkSourceMapAsset { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for CssChunkSourceMapAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunkSourceMapAsset {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.chunk.ident_for_path();
        Ok(this
            .chunk
            .await?
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, None, rcstr!(".css"))
            .await?
            .append(".map")?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunkSourceMapAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let content = self.chunk.generate_source_map();
        if content.await?.is_content() {
            Ok(AssetContent::file(content))
        } else {
            Ok(AssetContent::file(
                FileContent::Content(File::from(SourceMap::empty_rope())).cell(),
            ))
        }
    }
}
