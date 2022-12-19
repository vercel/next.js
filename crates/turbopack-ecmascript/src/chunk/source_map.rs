use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
    source_map::GenerateSourceMap,
};

use super::EcmascriptChunkVc;

/// Represents the source map of an ecmascript chunk.
#[turbo_tasks::value]
pub struct EcmascriptChunkSourceMapAsset {
    chunk: EcmascriptChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkSourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(chunk: EcmascriptChunkVc) -> Self {
        EcmascriptChunkSourceMapAsset { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunkSourceMapAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        // NOTE(alexkirsz) We used to include the chunk's version id in the path,
        // but this caused `all_assets_map` to be recomputed on every change.
        Ok(self.chunk.path().append(".map"))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let sm = self
            .chunk
            .chunk_content()
            .generate_source_map()
            .to_rope()
            .await?;
        Ok(File::from(sm).into())
    }
}

/// A reference to a [`EcmascriptChunkSourceMapAsset`], used to inform the dev
/// server/build system of the presence of the source map
#[turbo_tasks::value]
pub struct EcmascriptChunkSourceMapAssetReference {
    chunk: EcmascriptChunkVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkSourceMapAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk: EcmascriptChunkVc) -> Self {
        EcmascriptChunkSourceMapAssetReference { chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EcmascriptChunkSourceMapAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let asset = EcmascriptChunkSourceMapAsset { chunk: self.chunk }
            .cell()
            .into();
        Ok(ResolveResult::Single(asset, vec![]).cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunkSourceMapAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source maps for {}",
            self.chunk.path().to_string().await?
        )))
    }
}
