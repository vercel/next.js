use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    code_builder::CodeVc,
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// Represents the source map of an associated code output.
#[turbo_tasks::value]
pub struct SourceMapAsset {
    /// File path of the associated file (not the map's path, the file's path).
    path: FileSystemPathVc,

    /// The code from which we can generate a source map.
    code: CodeVc,
}

impl SourceMapAssetVc {
    pub fn new(path: FileSystemPathVc, code: CodeVc) -> Self {
        SourceMapAsset { path, code }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceMapAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path.append(".map")
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

/// A reference to a SourceMapAsset, used to inform the dev server/build system
/// of the presense of t the source map
#[turbo_tasks::value]
pub struct SourceMapAssetReference {
    asset: SourceMapAssetVc,
}

impl SourceMapAssetReferenceVc {
    pub fn new(asset: SourceMapAssetVc) -> Self {
        SourceMapAssetReference { asset }.cell()
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SourceMapAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.asset.into(), vec![]).cell()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "source map for {}",
            self.asset.path().to_string().await?
        )))
    }
}
