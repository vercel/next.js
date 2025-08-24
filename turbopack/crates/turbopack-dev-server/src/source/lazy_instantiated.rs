use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{ContentSource, route_tree::RouteTree};

/// A functor to get a [ContentSource]. Will be invoked when needed when using
/// [LazyInstantiatedContentSource].
#[turbo_tasks::value_trait]
pub trait GetContentSource {
    /// Returns the [ContentSource]
    #[turbo_tasks::function]
    fn content_source(self: Vc<Self>) -> Vc<Box<dyn ContentSource>>;
}

/// Wraps the [ContentSource] creation in a way that only creates it when
/// actually used.
#[turbo_tasks::value(shared)]
pub struct LazyInstantiatedContentSource {
    pub get_source: ResolvedVc<Box<dyn GetContentSource>>,
}

#[turbo_tasks::value_impl]
impl ContentSource for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn get_routes(&self) -> Vc<RouteTree> {
        self.get_source.content_source().get_routes()
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("lazy instantiated content source"))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        Ok(Vc::cell(
            [ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(
                self.get_source.content_source().to_resolved().await?,
            )
            .map(|i| (rcstr!("source"), i))]
            .into_iter()
            .flatten()
            .collect(),
        ))
    }
}
