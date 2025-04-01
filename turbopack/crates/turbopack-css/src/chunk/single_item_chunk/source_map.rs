use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMap},
};

use super::chunk::SingleItemCssChunk;

/// Represents the source map of a single item CSS chunk.
#[turbo_tasks::value]
pub struct SingleItemCssChunkSourceMapAsset {
    chunk: ResolvedVc<SingleItemCssChunk>,
}

#[turbo_tasks::value_impl]
impl SingleItemCssChunkSourceMapAsset {
    #[turbo_tasks::function]
    pub fn new(chunk: ResolvedVc<SingleItemCssChunk>) -> Vc<Self> {
        SingleItemCssChunkSourceMapAsset { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SingleItemCssChunkSourceMapAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.chunk.path().append(".map".into())
    }
}

#[turbo_tasks::value_impl]
impl Asset for SingleItemCssChunkSourceMapAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if let Some(sm) = &*self.chunk.generate_source_map().await? {
            Ok(AssetContent::file(File::from(sm.clone()).into()))
        } else {
            Ok(AssetContent::file(
                File::from(SourceMap::empty_rope()).into(),
            ))
        }
    }
}
