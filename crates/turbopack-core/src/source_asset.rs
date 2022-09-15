use anyhow::Result;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferencesVc,
};

/// The raw [Asset]. It represents raw content from a path without any
/// references to other [Asset]s.
#[turbo_tasks::value]
pub struct SourceAsset {
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SourceAssetVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc) -> Self {
        Self::cell(SourceAsset { path })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.path.read()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        // TODO: build input sourcemaps via language specific sourceMappingURL comment
        // or parse.
        AssetReferencesVc::empty()
    }
}
