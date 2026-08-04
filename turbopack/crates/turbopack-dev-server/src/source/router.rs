use std::iter::once;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use crate::source::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary, ContentSources,
    GetContentSourceContent,
    route_tree::{BaseSegment, MapGetContentSourceContent, RouteTree, RouteTrees},
};

/// Binds different ContentSources to different subpaths.
///
/// The request path must begin with the prefix, which will be stripped (along with the subpath)
/// before querying the ContentSource. A fallback ContentSource will serve all
/// other subpaths, including if the request path does not include the prefix.
#[turbo_tasks::value(shared)]
pub struct PrefixedRouterContentSource {
    pub prefix: ResolvedVc<RcStr>,
    pub routes: Vec<(RcStr, ResolvedVc<Box<dyn ContentSource>>)>,
    pub fallback: ResolvedVc<Box<dyn ContentSource>>,
}

#[turbo_tasks::value_impl]
impl PrefixedRouterContentSource {
    #[turbo_tasks::function]
    pub fn new(
        prefix: ResolvedVc<RcStr>,
        routes: Vec<(RcStr, ResolvedVc<Box<dyn ContentSource>>)>,
        fallback: ResolvedVc<Box<dyn ContentSource>>,
    ) -> Vc<Self> {
        PrefixedRouterContentSource {
            prefix,
            routes,
            fallback,
        }
        .cell()
    }
}

fn get_children(
    routes: &[(RcStr, ResolvedVc<Box<dyn ContentSource>>)],
    fallback: &ResolvedVc<Box<dyn ContentSource>>,
) -> Vc<ContentSources> {
    Vc::cell(
        routes
            .iter()
            .map(|r| r.1)
            .chain(std::iter::once(*fallback))
            .collect(),
    )
}

turbo_tasks::dual_fn! {
fn get_introspection_children(
    routes: &[(RcStr, ResolvedVc<Box<dyn ContentSource>>)],
    fallback: &ResolvedVc<Box<dyn ContentSource>>,
) -> Result<Vc<IntrospectableChildren>> {
    Ok(Vc::cell(
        routes
            .iter()
            .cloned()
            .chain(std::iter::once((RcStr::default(), *fallback)))
            .filter_map(|(path, source)| {
                ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(source).map(|i| (path, i))
            })
            .collect(),
    ))
}
}

#[turbo_tasks::value_impl]
impl ContentSource for PrefixedRouterContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<Vc<RouteTree>> {
        let prefix = &*turbo_tasks::read!(self.prefix)?;
        if cfg!(debug_assertions) {
            debug_assert!(prefix.is_empty() || prefix.ends_with('/'));
            debug_assert!(!prefix.starts_with('/'));
        }

        let prefix = if prefix.is_empty() {
            Vec::new()
        } else {
            BaseSegment::from_static_pathname(prefix.as_str()).collect()
        };

        let inner_trees = self.routes.iter().map(|(path, source)| {
            let prepended_base = prefix
                .iter()
                .cloned()
                .chain(BaseSegment::from_static_pathname(path))
                .collect();
            source
                .get_routes()
                .with_prepended_base(prepended_base)
                .map_routes(Vc::upcast(
                    PrefixedRouterContentSourceMapper {
                        prefix: self.prefix,
                        path: path.clone(),
                    }
                    .cell(),
                ))
        });
        let route_vcs = inner_trees
            .chain(once(self.fallback.get_routes()))
            .collect::<Vec<_>>();
        // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
        // concurrent `try_join` in the async build and resolve sequentially under sync.
        #[cfg(not(feature = "sync"))]
        let trees = route_vcs
            .into_iter()
            .map(|v| v.to_resolved())
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let trees = {
            let mut trees = Vec::with_capacity(route_vcs.len());
            for v in route_vcs {
                trees.push(turbo_tasks::read!(v.to_resolved())?);
            }
            trees
        };
        Ok(Vc::<RouteTrees>::cell(trees).merge())
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> Vc<ContentSources> {
        get_children(&self.routes, &self.fallback)
    }
}

#[turbo_tasks::value]
struct PrefixedRouterContentSourceMapper {
    prefix: ResolvedVc<RcStr>,
    path: RcStr,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for PrefixedRouterContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(
        self: ResolvedVc<Self>,
        get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
    ) -> Vc<Box<dyn GetContentSourceContent>> {
        Vc::upcast(
            PrefixedRouterGetContentSourceContent {
                mapper: self,
                get_content,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct PrefixedRouterGetContentSourceContent {
    mapper: ResolvedVc<PrefixedRouterContentSourceMapper>,
    get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for PrefixedRouterGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> Vc<ContentSourceDataVary> {
        self.get_content.vary()
    }

    #[turbo_tasks::function]
    async fn get(&self, path: RcStr, data: ContentSourceData) -> Result<Vc<ContentSourceContent>> {
        let prefix = turbo_tasks::read!(turbo_tasks::read!(self.mapper)?.prefix)?;
        if let Some(path) = path.strip_prefix(&**prefix) {
            if path.is_empty() {
                return Ok(self.get_content.get(RcStr::default(), data));
            } else if prefix.is_empty() {
                return Ok(self.get_content.get(path.into(), data));
            } else if let Some(path) = path.strip_prefix('/') {
                return Ok(self.get_content.get(path.into(), data));
            }
        }
        Ok(ContentSourceContent::not_found())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for PrefixedRouterContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("prefixed router content source"))
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<Vc<RcStr>> {
        let prefix = turbo_tasks::read!(self.prefix)?;
        Ok(Vc::cell(format!("prefix: '{prefix}'").into()))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        turbo_tasks::read!(get_introspection_children(&self.routes, &self.fallback))
    }
}
