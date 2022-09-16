use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    code_builder::CodeVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};
use turbopack_hash::encode_hex;

use super::{EcmascriptChunkItemVc, EcmascriptChunkVc};

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
        Ok(self.chunk.path().append(&format!(
            ".{}.map",
            self.chunk.versioned_content().version().id().await?
        )))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let sm = self.chunk.chunk_content().code().source_map().await?;
        Ok(FileContent::Content(File::from_source(sm.clone_value())).cell())
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
    hash: u64,
    code: CodeVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkEntrySourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(chunk_path: FileSystemPathVc, hash: u64, code: CodeVc) -> Self {
        EcmascriptChunkEntrySourceMapAsset {
            chunk_path,
            hash,
            code,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunkEntrySourceMapAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.chunk_path
            .append(&format!(".{}.map", encode_hex(self.hash)))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let sm = self.code.source_map().await?;
        Ok(FileContent::Content(File::from_source(sm.clone_value())).cell())
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
            for item in &self.chunk.chunk_content().await?.module_factories {
                source_maps.push(
                    EcmascriptChunkEntrySourceMapAsset {
                        chunk_path: path,
                        code: item.code_vc,
                        hash: item.hash,
                    }
                    .keyed_cell(EcmascriptChunkEntrySourceMapAssetCellKey(item.chunk_item))
                    .into(),
                );
            }
        }
        Ok(ResolveResult::Alternatives(source_maps, vec![]).cell())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source maps for {}",
            self.chunk.path().to_string().await?
        )))
    }
}
