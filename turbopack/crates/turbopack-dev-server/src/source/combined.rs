use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use crate::source::{
    ContentSource, ContentSources,
    route_tree::{RouteTree, RouteTrees},
};

/// Combines multiple [`ContentSource`]s by [merging][RouteTrees::merge] [`RouteTree`]s.
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
        // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
        // concurrent `try_join` in the async build and resolve sequentially under sync.
        #[cfg(not(feature = "sync"))]
        let all_routes = self
            .sources
            .iter()
            .map(|s| s.get_routes().to_resolved())
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let all_routes = {
            let mut all_routes = Vec::with_capacity(self.sources.len());
            for s in self.sources.iter() {
                all_routes.push(turbo_tasks::read!(s.get_routes().to_resolved())?);
            }
            all_routes
        };
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
        Vc::cell(rcstr!("combined content source"))
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        // Reading each source title runs concurrently in the async build and sequentially
        // under sync (the per-item body is more than a single plain `Vc` read).
        #[cfg(not(feature = "sync"))]
        let titles = self
            .sources
            .iter()
            .map(|&source| async move {
                Ok(
                    if let Some(source) =
                        ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(source)
                    {
                        Some(turbo_tasks::read!(source.title())?)
                    } else {
                        None
                    },
                )
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let titles = {
            let mut titles: Vec<Option<_>> = Vec::with_capacity(self.sources.len());
            for &source in self.sources.iter() {
                titles.push(
                    if let Some(source) =
                        ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(source)
                    {
                        Some(turbo_tasks::read!(source.title())?)
                    } else {
                        None
                    },
                );
            }
            titles
        };
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
    fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        // `try_sidecast` is synchronous, so this needs no await point in either mode.
        Ok(Vc::cell(
            self.sources
                .iter()
                .copied()
                .filter_map(ResolvedVc::try_sidecast::<Box<dyn Introspectable>>)
                .map(|i| (rcstr!("source"), i))
                .collect(),
        ))
    }
}
