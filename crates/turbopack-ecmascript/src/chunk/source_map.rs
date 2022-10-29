use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
    source_map::GenerateSourceMap,
};

use super::{EcmascriptChunkContentEntryVc, EcmascriptChunkItemVc, EcmascriptChunkVc};

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
            .to_bytes()
            .await?;
        Ok(File::from(sm.as_slice()).into())
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

/// Represents the source map of an ecmascript chunk item.
#[turbo_tasks::value]
pub struct EcmascriptChunkEntrySourceMapAsset {
    chunk_path: FileSystemPathVc,
    chunk_item: EcmascriptChunkItemVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkEntrySourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(chunk_path: FileSystemPathVc, chunk_item: EcmascriptChunkItemVc) -> Self {
        EcmascriptChunkEntrySourceMapAsset {
            chunk_path,
            chunk_item,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunkEntrySourceMapAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        // NOTE(alexkirsz) We used to asset's hash in the path, but this caused
        // `all_assets_map` to be recomputed on every change.
        Ok(self.chunk_path.append(&format!(
            ".{}.map",
            self.chunk_item.id().await?.to_truncated_hash()
        )))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let sm = EcmascriptChunkContentEntryVc::new(self.chunk_item)
            .await?
            .code_vc
            .generate_source_map()
            .to_bytes()
            .await?;
        Ok(File::from(sm.as_slice()).into())
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

/// A reference to a [`EcmascriptChunkSourceMapAsset`], used to inform the dev
/// server/build system of the presence of the source map
#[turbo_tasks::value]
pub struct EcmascriptChunkSourceMapAssetReference {
    chunk: EcmascriptChunkVc,
    hot_module_replacement: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkSourceMapAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(chunk: EcmascriptChunkVc, hot_module_replacement: bool) -> Self {
        EcmascriptChunkSourceMapAssetReference {
            chunk,
            hot_module_replacement,
        }
        .cell()
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Debug, PartialOrd, Ord, Hash)]
struct EcmascriptChunkEntrySourceMapAssetCellKey(EcmascriptChunkItemVc);

#[turbo_tasks::value_impl]
impl AssetReference for EcmascriptChunkSourceMapAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let path = self.chunk.path();
        let mut source_maps = Vec::new();
        source_maps.push(
            EcmascriptChunkSourceMapAsset { chunk: self.chunk }
                .cell()
                .into(),
        );
        if self.hot_module_replacement {
            // Expose a SourceMap for each chunk item when HMR is enabled
            for chunk_items_chunk in self
                .chunk
                .chunk_content_result()
                .await?
                .chunk_items
                .await?
                .iter()
            {
                for item in chunk_items_chunk.await?.iter() {
                    source_maps.push(EcmascriptChunkEntrySourceMapAssetVc::new(path, *item).into());
                }
            }
        }
        Ok(ResolveResult::Alternatives(source_maps, vec![]).cell())
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
