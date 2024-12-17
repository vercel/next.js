use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
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
    pub get_source: ResolvedVc<Box<dyn GetContentSource>>,
}

#[turbo_tasks::value_impl]
impl ContentSource for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn get_routes(&self) -> Vc<RouteTree> {
        self.get_source.content_source().get_routes()
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("lazy instantiated content source".into())
}

#[turbo_tasks::function]
fn source_key() -> Vc<RcStr> {
    Vc::cell("source".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for LazyInstantiatedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
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
            .map(|(k, v)| async move { Ok((k.to_resolved().await?, v)) })
            .try_join()
            .await?
            .into_iter()
            .collect(),
        ))
    }
}
