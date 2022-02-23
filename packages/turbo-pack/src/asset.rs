use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

#[turbo_tasks::value(shared)]
#[derive(Hash, PartialEq, Eq)]
pub struct AssetsSet {
    pub assets: Vec<AssetRef>,
}

#[turbo_tasks::value_impl]
impl AssetsSet {
    #[turbo_tasks::constructor(intern)]
    pub fn empty() -> Self {
        Self { assets: Vec::new() }
    }
}

#[turbo_tasks::value_trait]
pub trait Asset {
    fn path(&self) -> FileSystemPathRef;
    fn content(&self) -> FileContentRef;
    fn references(&self) -> AssetsSetRef;
}
