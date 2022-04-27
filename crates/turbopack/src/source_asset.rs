use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferenceVc,
};
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct SourceAsset {
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SourceAssetVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc) -> Self {
        Self::slot(SourceAsset { path })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceAsset {
    fn path(&self) -> FileSystemPathVc {
        self.path
    }
    fn content(&self) -> FileContentVc {
        self.path.read()
    }
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        Vc::default()
    }
}
