use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ModuleIdVc,
    code_builder::CodeVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
    source_map::GenerateSourceMap,
};

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
    id: ModuleIdVc,
    code: CodeVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkEntrySourceMapAssetVc {
    #[turbo_tasks::function]
    pub fn new(chunk_path: FileSystemPathVc, id: ModuleIdVc, code: CodeVc) -> Self {
        EcmascriptChunkEntrySourceMapAsset {
            chunk_path,
            id,
            code,
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
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_value(self.id.await?);
        let hash = encode_hex(hasher.finish());
        let truncated_hash = &hash[..6];
        Ok(self.chunk_path.append(&format!(".{}.map", truncated_hash)))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let sm = self.code.generate_source_map().to_bytes().await?;
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
            for item in &self.chunk.chunk_content().await?.module_factories {
                source_maps.push(
                    EcmascriptChunkEntrySourceMapAsset {
                        chunk_path: path,
                        code: item.code_vc,
                        id: item.chunk_item.id(),
                    }
                    .keyed_cell(EcmascriptChunkEntrySourceMapAssetCellKey(item.chunk_item))
                    .into(),
                );
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
