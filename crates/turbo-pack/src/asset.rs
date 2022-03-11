use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use crate::reference::AssetReferencesSetRef;

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetsSet {
    pub assets: Vec<AssetRef>,
}

#[turbo_tasks::value_impl]
impl AssetsSetRef {
    pub fn empty() -> Self {
        AssetsSet { assets: Vec::new() }.into()
    }
}

#[turbo_tasks::value_trait]
pub trait Asset {
    fn path(&self) -> FileSystemPathRef;
    fn content(&self) -> FileContentRef;
    fn references(&self) -> AssetReferencesSetRef;
}
