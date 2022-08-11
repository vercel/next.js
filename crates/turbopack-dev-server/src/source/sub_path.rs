use anyhow::Result;
use turbopack_core::version::VersionedContentVc;

use super::{ContentSource, ContentSourceVc};

#[turbo_tasks::value(shared)]
pub struct SubPathContentSource {
    pub source: ContentSourceVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl ContentSource for SubPathContentSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str) -> VersionedContentVc {
        self.source.get(&[&self.path, path].concat())
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, id: &str) -> VersionedContentVc {
        self.source.get_by_id(id)
    }
}
