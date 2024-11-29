use std::iter::once;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{
    route_tree::{BaseSegment, RouteTree, RouteTrees},
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary,
    GetContentSourceContent,
};
use crate::source::{route_tree::MapGetContentSourceContent, ContentSources};

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

async fn get_introspection_children(
    routes: &[(RcStr, ResolvedVc<Box<dyn ContentSource>>)],
    fallback: &ResolvedVc<Box<dyn ContentSource>>,
) -> Result<Vc<IntrospectableChildren>> {
    Ok(Vc::cell(
        routes
            .iter()
            .cloned()
            .chain(std::iter::once((RcStr::default(), *fallback)))
            .map(|(path, source)| async move {
                Ok(ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(source)
                    .await?
                    .map(|i| (ResolvedVc::cell(path), *i)))
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect(),
    ))
}

#[turbo_tasks::value_impl]
impl ContentSource for PrefixedRouterContentSource {
    #[turbo_tasks::function]
    async fn get_routes(&self) -> Result<Vc<RouteTree>> {
        let prefix = &*self.prefix.await?;
        if cfg!(debug_assertions) {
            debug_assert!(prefix.is_empty() || prefix.ends_with('/'));
            debug_assert!(!prefix.starts_with('/'));
        }
        let prefix = (!prefix.is_empty())
            .then(|| BaseSegment::from_static_pathname(prefix.as_str()).collect())
            .unwrap_or(Vec::new());
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
        Ok(Vc::<RouteTrees>::cell(
            inner_trees
                .chain(once(self.fallback.get_routes()))
                .map(|v| async move { v.to_resolved().await })
                .try_join()
                .await?,
        )
        .merge())
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
    async fn get(
        &self,
        path: RcStr,
        data: Value<ContentSourceData>,
    ) -> Result<Vc<ContentSourceContent>> {
        let prefix = self.mapper.await?.prefix.await?;
        if let Some(path) = path.strip_prefix(&**prefix) {
            if path.is_empty() {
                return Ok(self.get_content.get("".into(), data));
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
        Vc::cell("prefixed router content source".into())
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<Vc<RcStr>> {
        let prefix = self.prefix.await?;
        Ok(Vc::cell(format!("prefix: '{}'", prefix).into()))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        get_introspection_children(&self.routes, &self.fallback).await
    }
}
