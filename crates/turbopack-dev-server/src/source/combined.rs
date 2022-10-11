use anyhow::Result;
use turbo_tasks::{TryJoinIterExt, Value};

use super::{
    ContentSource, ContentSourceData, ContentSourceDataVary, ContentSourceDataVaryVc,
    ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};

/// Combines multiple [ContentSource]s by trying all content sources in order.
/// First [ContentSource] that responds with something other than NotFound will
/// serve the request.
#[turbo_tasks::value(shared)]
pub struct CombinedContentSource {
    pub sources: Vec<ContentSourceVc>,
}

#[turbo_tasks::value_impl]
impl ContentSource for CombinedContentSource {
    #[turbo_tasks::function]
    async fn vary(&self, path: &str) -> Result<ContentSourceDataVaryVc> {
        let mut current = ContentSourceDataVary::default();
        for vary in self.sources.iter().map(|s| s.vary(path)).try_join().await? {
            current.extend(&vary);
        }
        Ok(current.cell())
    }
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        for source in self.sources.iter() {
            let result = source.get(path, data.clone());
            if !matches!(&*result.await?, ContentSourceResult::NotFound) {
                return Ok(result);
            }
        }
        Ok(ContentSourceResult::NotFound.cell())
    }
    #[turbo_tasks::function]
    async fn get_by_id(&self, id: &str) -> Result<ContentSourceResultVc> {
        for source in self.sources.iter() {
            let result = source.get_by_id(id);
            if !matches!(&*result.await?, ContentSourceResult::NotFound) {
                return Ok(result);
            }
        }
        Ok(ContentSourceResult::NotFound.cell())
    }
}
