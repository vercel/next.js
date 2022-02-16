use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetsSet {
    pub assets: Vec<AssetRef>,
}

#[turbo_tasks::value_trait]
pub trait AssetSource {
    fn content(&self) -> FileContentRef;
    fn references(&self) -> AssetsSetRef;
}

#[turbo_tasks::value]
#[derive(Hash, PartialEq, Eq)]
pub struct Asset {
    pub path: FileSystemPathRef,
    pub source: AssetSourceRef,
}

#[turbo_tasks::value_impl]
impl Asset {
    #[turbo_tasks::constructor]
    pub fn new(path: FileSystemPathRef, source: AssetSourceRef) -> Self {
        Self { path, source }
    }
}
