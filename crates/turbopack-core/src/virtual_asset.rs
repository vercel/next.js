use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::AssetReferencesVc,
};

/// An [Asset] that is created from some passed source code.
#[turbo_tasks::value]
pub struct VirtualAsset {
    pub path: FileSystemPathVc,
    pub content: AssetContentVc,
}

#[turbo_tasks::value_impl]
impl VirtualAssetVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc, content: AssetContentVc) -> Self {
        Self::cell(VirtualAsset { path, content })
    }
}

#[turbo_tasks::value_impl]
impl Asset for VirtualAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.content
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}
