use anyhow::Result;

use super::{ContentSource, ContentSourceVc, FileContent, FileContentVc};

#[turbo_tasks::value(shared, ContentSource)]
pub struct CombinedContentSource {
    pub sources: Vec<ContentSourceVc>,
}

#[turbo_tasks::value_impl]
impl ContentSource for CombinedContentSource {
    #[turbo_tasks::function]
    async fn get(&self, path: &str) -> Result<FileContentVc> {
        for source in self.sources.iter() {
            let result = source.get(path);
            if let FileContent::Content(_) = &*result.await? {
                return Ok(result);
            }
        }
        Ok(FileContent::NotFound.into())
    }
    #[turbo_tasks::function]
    async fn get_by_id(&self, id: &str) -> Result<FileContentVc> {
        for source in self.sources.iter() {
            let result = source.get_by_id(id);
            if let FileContent::Content(_) = &*result.await? {
                return Ok(result);
            }
        }
        Ok(FileContent::NotFound.into())
    }
}
