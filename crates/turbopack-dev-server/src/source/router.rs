use anyhow::Result;
use turbopack_core::version::VersionedContentVc;

use super::{ContentSource, ContentSourceVc, FileContent};

#[turbo_tasks::value(shared)]
pub struct RouterContentSource {
    pub routes: Vec<(String, ContentSourceVc)>,
    pub fallback: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl ContentSource for RouterContentSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str) -> VersionedContentVc {
        for (route, source) in self.routes.iter() {
            if path.starts_with(route) {
                let path = &path[route.len()..];
                return source.get(path);
            }
        }
        self.fallback.get(path)
    }
    #[turbo_tasks::function]
    async fn get_by_id(&self, id: &str) -> Result<VersionedContentVc> {
        for (_, source) in self.routes.iter() {
            let result = source.get_by_id(id);
            if let FileContent::Content(_) = &*result.content().await? {
                return Ok(result);
            }
        }
        Ok(self.fallback.get_by_id(id))
    }
}
