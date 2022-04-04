use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferencesSetVc,
};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct SourceAsset {
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SourceAssetVc {
    pub fn new(path: FileSystemPathVc) -> Self {
        Self::slot(SourceAsset { path })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceAsset {
    fn path(&self) -> FileSystemPathVc {
        self.path.clone()
    }
    fn content(&self) -> FileContentVc {
        self.path.clone().read()
    }
    fn references(&self) -> AssetReferencesSetVc {
        AssetReferencesSetVc::empty()
    }
}
