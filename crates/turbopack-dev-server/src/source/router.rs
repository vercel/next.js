use anyhow::Result;
use turbo_tasks::Value;

use super::{
    ContentSource, ContentSourceData, ContentSourceDataVaryVc, ContentSourceResult,
    ContentSourceResultVc, ContentSourceVc,
};

/// Binds different ContentSources to different subpaths. A fallback
/// ContentSource will serve all other subpaths.
#[turbo_tasks::value(shared)]
pub struct RouterContentSource {
    pub routes: Vec<(String, ContentSourceVc)>,
    pub fallback: ContentSourceVc,
}

impl RouterContentSource {
    fn get_source<'s, 'a>(&'s self, path: &'a str) -> (&'s ContentSourceVc, &'a str) {
        for (route, source) in self.routes.iter() {
            if path.starts_with(route) {
                let path = &path[route.len()..];
                return (source, path);
            }
        }
        (&self.fallback, path)
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for RouterContentSource {
    #[turbo_tasks::function]
    fn vary(&self, path: &str) -> ContentSourceDataVaryVc {
        let (source, path) = self.get_source(path);
        source.vary(path)
    }
    #[turbo_tasks::function]
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc {
        let (source, path) = self.get_source(path);
        source.get(path, data)
    }
    #[turbo_tasks::function]
    async fn get_by_id(&self, id: &str) -> Result<ContentSourceResultVc> {
        for (_, source) in self.routes.iter() {
            let result = source.get_by_id(id);
            if !matches!(&*result.await?, ContentSourceResult::NotFound) {
                return Ok(result);
            }
        }
        Ok(self.fallback.get_by_id(id))
    }
}
