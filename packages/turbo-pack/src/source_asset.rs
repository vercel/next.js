use crate::asset::{Asset, AssetRef, AssetsSetRef};
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

#[turbo_tasks::value(Asset)]
pub struct SourceAsset {
    pub path: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl SourceAsset {
    #[turbo_tasks::constructor(intern)]
    pub fn new(path: FileSystemPathRef) -> Self {
        Self { path }
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
    fn references(&self) -> AssetsSetRef {
        AssetsSetRef::empty()
    }
}
