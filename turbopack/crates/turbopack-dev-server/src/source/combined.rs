use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{
    route_tree::{RouteTree, RouteTrees},
    ContentSource,
};
use crate::source::ContentSources;

/// Combines multiple [ContentSource]s by trying all content sources in order.
///
/// The content source which responds with the most specific response (that is
/// not a [ContentSourceContent::NotFound]) will be returned.
#[turbo_tasks::value(shared)]
pub struct CombinedContentSource {
    pub sources: Vec<ResolvedVc<Box<dyn ContentSource>>>,
}

impl CombinedContentSource {
    pub fn new(sources: Vec<ResolvedVc<Box<dyn ContentSource>>>) -> Vc<Self> {
        CombinedContentSource { sources }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for CombinedContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<Vc<RouteTree>> {
        let all_routes = self
            .sources
            .iter()
            .map(|s| async move { s.get_routes().to_resolved().await })
            .try_join()
            .await?;
        Ok(Vc::<RouteTrees>::cell(all_routes).merge())
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> Vc<ContentSources> {
        Vc::cell(self.sources.clone())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for CombinedContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell("combined content source".into())
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        let titles = self
            .sources
            .iter()
            .map(|&source| async move {
                Ok(
                    if let Some(source) =
                        ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(source)
                    {
                        Some(source.title().await?)
                    } else {
                        None
                    },
                )
            })
            .try_join()
            .await?;
        let mut titles = titles.into_iter().flatten().collect::<Vec<_>>();
        titles.sort();
        const NUMBER_OF_TITLES_TO_DISPLAY: usize = 5;
        let mut titles = titles
            .iter()
            .map(|t| t.as_str())
            .filter(|t| !t.is_empty())
            .take(NUMBER_OF_TITLES_TO_DISPLAY + 1)
            .collect::<Vec<_>>();
        if titles.len() > NUMBER_OF_TITLES_TO_DISPLAY {
            titles[NUMBER_OF_TITLES_TO_DISPLAY] = "...";
        }
        Ok(Vc::cell(titles.join(", ").into()))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let source = ResolvedVc::cell("source".into());
        Ok(Vc::cell(
            self.sources
                .iter()
                .copied()
                .map(|s| async move { Ok(ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(s)) })
                .try_join()
                .await?
                .into_iter()
                .flatten()
                .map(|i| (source, i))
                .collect(),
        ))
    }
}
