use anyhow::Result;

use super::{ContentSource, ContentSourceResult, ContentSourceResultVc, ContentSourceVc};

#[turbo_tasks::value(shared)]
pub struct CombinedContentSource {
    pub sources: Vec<ContentSourceVc>,
}

#[turbo_tasks::value_impl]
impl ContentSource for CombinedContentSource {
    #[turbo_tasks::function]
    async fn get(&self, path: &str) -> Result<ContentSourceResultVc> {
        for source in self.sources.iter() {
            let result = source.get(path);
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
