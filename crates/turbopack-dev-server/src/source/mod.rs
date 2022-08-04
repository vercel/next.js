pub mod asset_graph;
pub mod combined;
pub mod router;
pub mod sub_path;

use anyhow::Result;
use turbo_tasks_fs::{FileContent, FileContentVc};

#[turbo_tasks::value_trait]
pub trait ContentSource {
    fn get(&self, path: &str) -> FileContentVc;
    fn get_by_id(&self, id: &str) -> FileContentVc;
}

#[turbo_tasks::value(shared)]
pub struct NoContentSource;

#[turbo_tasks::value_impl]
impl ContentSource for NoContentSource {
    #[turbo_tasks::function]
    fn get(&self, _path: &str) -> FileContentVc {
        FileContent::NotFound.into()
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, _id: &str) -> FileContentVc {
        FileContent::NotFound.into()
    }
}
