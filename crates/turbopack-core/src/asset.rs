use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::reference::AssetReferenceVc;

#[turbo_tasks::value(shared)]
#[derive(Hash)]
pub struct AssetsSet {
    pub assets: Vec<AssetVc>,
}

#[turbo_tasks::value_impl]
impl AssetsSetVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        AssetsSet { assets: Vec::new() }.into()
    }
}

#[turbo_tasks::value_trait]
pub trait Asset {
    fn path(&self) -> FileSystemPathVc;
    fn content(&self) -> FileContentVc;
    fn references(&self) -> Vc<Vec<AssetReferenceVc>>;
}
