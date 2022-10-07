use anyhow::Result;
use turbo_tasks::Value;

use super::{
    ContentSource, ContentSourceData, ContentSourceDataVaryVc, ContentSourceResultVc,
    ContentSourceVc,
};

#[turbo_tasks::value(shared)]
pub struct SubPathContentSource {
    pub source: ContentSourceVc,
    pub path: String,
}

#[turbo_tasks::value_impl]
impl ContentSource for SubPathContentSource {
    #[turbo_tasks::function]
    fn vary(&self, path: &str) -> ContentSourceDataVaryVc {
        self.source.vary(&[&self.path, path].concat())
    }
    #[turbo_tasks::function]
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc {
        self.source.get(&[&self.path, path].concat(), data)
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, id: &str) -> ContentSourceResultVc {
        self.source.get_by_id(id)
    }
}
