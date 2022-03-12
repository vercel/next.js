use crate::{
    asset::{Asset, AssetRef},
    reference::AssetReferencesSetRef,
};
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct SourceAsset {
    pub path: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl SourceAssetRef {
    pub fn new(path: FileSystemPathRef) -> Self {
        Self::slot(SourceAsset { path })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceAsset {
    fn path(&self) -> FileSystemPathRef {
        self.path.clone()
    }
    fn content(&self) -> FileContentRef {
        self.path.clone().read()
    }
    fn references(&self) -> AssetReferencesSetRef {
        AssetReferencesSetRef::empty()
    }
}
