use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{ContentSource, ContentSourceData, ContentSourceResultVc, ContentSourceVc};

/// A functor to get a [ContentSource]. Will be invoked when needed when using
/// [LazyInstantiatedContentSource].
#[turbo_tasks::value_trait]
pub trait GetContentSource {
    /// Returns the [ContentSource]
    fn content_source(&self) -> ContentSourceVc;
}

/// Wraps the [ContentSource] creation in a way that only creates it when
/// actually used.
#[turbo_tasks::value(shared)]
pub struct LazyInstantiatedContentSource {
    pub get_source: GetContentSourceVc,
}

#[turbo_tasks::value_impl]
impl ContentSource for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn get(
        &self,
        path: &str,
        data: turbo_tasks::Value<ContentSourceData>,
    ) -> ContentSourceResultVc {
        self.get_source.content_source().get(path, data)
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("lazy instantiated content source".to_string())
}

#[turbo_tasks::function]
fn source_key() -> StringVc {
    StringVc::cell("source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        Ok(IntrospectableChildrenVc::cell(
            [
                IntrospectableVc::resolve_from(self.get_source.content_source())
                    .await?
                    .map(|i| (source_key(), i)),
            ]
            .into_iter()
            .flatten()
            .collect(),
        ))
    }
}
