pub mod asset_graph;
pub mod combined;
pub mod router;
pub mod sub_path;

use anyhow::Result;
use turbopack_core::version::VersionedContentVc;

#[turbo_tasks::value(shared)]
// TODO add Dynamic variant in future to allow streaming and server responses
pub enum ContentSourceResult {
    NotFound,
    Static(VersionedContentVc),
}

impl From<VersionedContentVc> for ContentSourceResultVc {
    fn from(content: VersionedContentVc) -> Self {
        ContentSourceResult::Static(content).cell()
    }
}

#[turbo_tasks::value_trait]
pub trait ContentSource {
    fn get(&self, path: &str) -> ContentSourceResultVc;
    fn get_by_id(&self, id: &str) -> ContentSourceResultVc;
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
    fn get(&self, _path: &str) -> ContentSourceResultVc {
        ContentSourceResult::NotFound.into()
    }
    #[turbo_tasks::function]
    fn get_by_id(&self, _id: &str) -> ContentSourceResultVc {
        ContentSourceResult::NotFound.into()
    }
}
