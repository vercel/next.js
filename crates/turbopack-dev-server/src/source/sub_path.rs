use anyhow::Result;

use super::{ContentSource, ContentSourceVc, FileContentVc};

#[turbo_tasks::value(shared)]
pub struct SubPathContentSource {
    pub source: ContentSourceVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl ContentSource for SubPathContentSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str) -> FileContentVc {
        self.source.get(&[&self.path, path].concat())
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, id: &str) -> FileContentVc {
        self.source.get_by_id(id)
    }
}
