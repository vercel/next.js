use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{route_tree::RouteTree, ContentSource};

/// A functor to get a [ContentSource]. Will be invoked when needed when using
/// [LazyInstantiatedContentSource].
#[turbo_tasks::value_trait]
pub trait GetContentSource {
    /// Returns the [ContentSource]
    fn content_source(self: Vc<Self>) -> Vc<Box<dyn ContentSource>>;
}

/// Wraps the [ContentSource] creation in a way that only creates it when
/// actually used.
#[turbo_tasks::value(shared)]
pub struct LazyInstantiatedContentSource {
    pub get_source: Vc<Box<dyn GetContentSource>>,
}

#[turbo_tasks::value_impl]
impl ContentSource for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn get_routes(&self) -> Vc<RouteTree> {
        self.get_source.content_source().get_routes()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<String> {
    Vc::cell("lazy instantiated content source".to_string())
}

#[turbo_tasks::function]
fn source_key() -> Vc<String> {
    Vc::cell("source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        Ok(Vc::cell(
            [
                Vc::try_resolve_sidecast::<Box<dyn Introspectable>>(
                    self.get_source.content_source(),
                )
                .await?
                .map(|i| (source_key(), i)),
            ]
            .into_iter()
            .flatten()
            .collect(),
        ))
    }
}
