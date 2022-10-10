use super::{
    ContentSource, ContentSourceData, ContentSourceDataVaryVc, ContentSourceResultVc,
    ContentSourceVc,
};

/// A functor to get a [ContentSource]. Will be invoked when needed when using
/// [LazyInstantiatedContentSource].
#[turbo_tasks::value_trait]
pub trait GetContentSource {
    /// Returns the [ContentSource]
    fn content_source(&self) -> ContentSourceVc;
}

/// Wraps the [ContentSource] creation in a way that only creates it when
#[turbo_tasks::value(shared)]
pub struct LazyInstantiatedContentSource {
    pub get_source: GetContentSourceVc,
}

#[turbo_tasks::value_impl]
impl ContentSource for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn vary(&self, path: &str) -> ContentSourceDataVaryVc {
        self.get_source.content_source().vary(path)
    }

    #[turbo_tasks::function]
    fn get(
        &self,
        path: &str,
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> ContentSourceResultVc {
        self.get_source.content_source().get(path, data)
    }

    #[turbo_tasks::function]
    fn get_by_id(&self, id: &str) -> ContentSourceResultVc {
        self.get_source.content_source().get_by_id(id)
    }
}
