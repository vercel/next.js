use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::File;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::Chunk,
    ident::AssetIdentVc,
    output::{OutputAsset, OutputAssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
    source_map::{GenerateSourceMap, SourceMapVc},
};

use super::CssChunkVc;

/// Represents the source map of an css chunk.
#[turbo_tasks::value]
pub struct CssChunkSourceMapAsset {
    chunk: CssChunkVc,
}

#[turbo_tasks::value_impl]
impl CssChunkSourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(chunk: CssChunkVc) -> Self {
        CssChunkSourceMapAsset { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunkSourceMapAsset {}

#[turbo_tasks::value_impl]
impl Asset for CssChunkSourceMapAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(AssetIdentVc::from_path(self.chunk.path().append(".map")))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let sm = if let Some(sm) = *self.chunk.generate_source_map().await? {
            sm
        } else {
            SourceMapVc::empty()
        };
        let sm = sm.to_rope().await?;
        Ok(File::from(sm).into())
    }
}

/// A reference to a [`CssChunkSourceMapAsset`], used to inform the dev
/// server/build system of the presence of the source map
#[turbo_tasks::value]
pub struct CssChunkSourceMapAssetReference {
    chunk: CssChunkVc,
}

#[turbo_tasks::value_impl]
impl CssChunkSourceMapAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk: CssChunkVc) -> Self {
        CssChunkSourceMapAssetReference { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CssChunkSourceMapAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let source_maps = vec![CssChunkSourceMapAsset { chunk: self.chunk }.cell().into()];
        Ok(ResolveResult::assets_with_references(source_maps, vec![]).cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunkSourceMapAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source maps for {}",
            self.chunk.path().to_string().await?
        )))
    }
}
