pub mod asset_graph;
pub mod combined;
pub mod router;
pub mod sub_path;

use anyhow::Result;
use turbo_tasks_fs::FileContent;
use turbopack_core::version::VersionedContentVc;

#[turbo_tasks::value_trait]
pub trait ContentSource {
    fn get(&self, path: &str) -> VersionedContentVc;
    fn get_by_id(&self, id: &str) -> VersionedContentVc;
}

#[turbo_tasks::value]
pub struct NoContentSource;

#[turbo_tasks::value_impl]
impl NoContentSourceVc {
    #[turbo_tasks::function]
    pub fn new() -> Self {
        NoContentSource.cell()
    }
}
#[turbo_tasks::value_impl]
impl ContentSource for NoContentSource {
    #[turbo_tasks::function]
    fn get(&self, _path: &str) -> VersionedContentVc {
        FileContent::NotFound.into()
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, _id: &str) -> VersionedContentVc {
        FileContent::NotFound.into()
    }
}
