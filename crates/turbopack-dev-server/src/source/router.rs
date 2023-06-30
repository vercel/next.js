use std::iter::once;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{
    route_tree::{BaseSegment, RouteTreeVc, RouteTreesVc},
    ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceDataVaryVc,
    ContentSourceVc, GetContentSourceContentVc,
};
use crate::source::{
    route_tree::{MapGetContentSourceContent, MapGetContentSourceContentVc},
    ContentSourcesVc, GetContentSourceContent,
};

/// Binds different ContentSources to different subpaths. The request path must
/// begin with the prefix, which will be stripped (along with the subpath)
/// before querying the ContentSource. A fallback ContentSource will serve all
/// other subpaths, including if the request path does not include the prefix.
#[turbo_tasks::value(shared)]
pub struct PrefixedRouterContentSource {
    pub prefix: StringVc,
    pub routes: Vec<(String, ContentSourceVc)>,
    pub fallback: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl PrefixedRouterContentSourceVc {
    #[turbo_tasks::function]
    pub async fn new(
        prefix: StringVc,
        routes: Vec<(String, ContentSourceVc)>,
        fallback: ContentSourceVc,
    ) -> Result<Self> {
        Ok(PrefixedRouterContentSource {
            prefix,
            routes,
            fallback,
        }
        .cell())
    }
}

fn get_children(
    routes: &[(String, ContentSourceVc)],
    fallback: &ContentSourceVc,
) -> ContentSourcesVc {
    ContentSourcesVc::cell(
        routes
            .iter()
            .map(|r| r.1)
            .chain(std::iter::once(*fallback))
            .collect(),
    )
}

async fn get_introspection_children(
    routes: &[(String, ContentSourceVc)],
    fallback: &ContentSourceVc,
) -> Result<IntrospectableChildrenVc> {
    Ok(IntrospectableChildrenVc::cell(
        routes
            .iter()
            .cloned()
            .chain(std::iter::once((String::new(), *fallback)))
            .map(|(path, source)| async move {
                Ok(IntrospectableVc::resolve_from(source)
                    .await?
                    .map(|i| (StringVc::cell(path), i)))
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
    async fn get_routes(&self) -> Result<RouteTreeVc> {
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
                .map_routes(
                    PrefixedRouterContentSourceMapper {
                        prefix: self.prefix,
                        path: path.clone(),
                    }
                    .cell()
                    .into(),
                )
        });
        Ok(RouteTreesVc::cell(
            inner_trees
                .chain(once(self.fallback.get_routes()))
                .collect(),
        )
        .merge())
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        get_children(&self.routes, &self.fallback)
    }
}

#[turbo_tasks::value]
struct PrefixedRouterContentSourceMapper {
    prefix: StringVc,
    path: String,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for PrefixedRouterContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(
        self_vc: PrefixedRouterContentSourceMapperVc,
        get_content: GetContentSourceContentVc,
    ) -> GetContentSourceContentVc {
        PrefixedRouterGetContentSourceContent {
            mapper: self_vc,
            get_content,
        }
        .cell()
        .into()
    }
}

#[turbo_tasks::value]
struct PrefixedRouterGetContentSourceContent {
    mapper: PrefixedRouterContentSourceMapperVc,
    get_content: GetContentSourceContentVc,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for PrefixedRouterGetContentSourceContent {
    #[turbo_tasks::function]
    fn vary(&self) -> ContentSourceDataVaryVc {
        self.get_content.vary()
    }

    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let prefix = self.mapper.await?.prefix.await?;
        if let Some(path) = path.strip_prefix(&*prefix) {
            if path.is_empty() {
                return Ok(self.get_content.get("", data));
            } else if prefix.is_empty() {
                return Ok(self.get_content.get(path, data));
            } else if let Some(path) = path.strip_prefix('/') {
                return Ok(self.get_content.get(path, data));
            }
        }
        Ok(ContentSourceContentVc::not_found())
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for PrefixedRouterContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("prefixed router content source".to_string())
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<StringVc> {
        let prefix = self.prefix.await?;
        Ok(StringVc::cell(format!("prefix: '{}'", prefix)))
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        get_introspection_children(&self.routes, &self.fallback).await
    }
}
