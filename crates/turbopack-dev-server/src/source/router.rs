use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{ContentSource, ContentSourceData, ContentSourceResultVc, ContentSourceVc};
use crate::source::ContentSourcesVc;

/// Binds different ContentSources to different subpaths. A fallback
/// ContentSource will serve all other subpaths.
// TODO(WEB-1151): Remove this and migrate all users to PrefixedRouterContentSource.
#[turbo_tasks::value(shared)]
pub struct RouterContentSource {
    pub routes: Vec<(String, ContentSourceVc)>,
    pub fallback: ContentSourceVc,
}

/// Binds different ContentSources to different subpaths. The request path must
/// begin with the prefix, which will be stripped (along with the subpath)
/// before querying the ContentSource. A fallback ContentSource will serve all
/// other subpaths, including if the request path does not include the prefix.
#[turbo_tasks::value(shared)]
pub struct PrefixedRouterContentSource {
    prefix: StringVc,
    routes: Vec<(String, ContentSourceVc)>,
    fallback: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl PrefixedRouterContentSourceVc {
    #[turbo_tasks::function]
    async fn new(
        prefix: StringVc,
        routes: Vec<(String, ContentSourceVc)>,
        fallback: ContentSourceVc,
    ) -> Result<Self> {
        if cfg!(debug_assertions) {
            let prefix_string = prefix.await?;
            debug_assert!(prefix_string.is_empty() || prefix_string.ends_with('/'));
            debug_assert!(prefix_string.starts_with('/'));
        }
        Ok(PrefixedRouterContentSource {
            prefix,
            routes,
            fallback,
        }
        .cell())
    }
}

/// If the `path` starts with `prefix`, then it will search each route to see if
/// any subpath matches. If so, the remaining path (after removing the prefix
/// and subpath) is used to query the matching ContentSource. If no match is
/// found, then the fallback is queried with the original path.
async fn get(
    routes: &[(String, ContentSourceVc)],
    fallback: &ContentSourceVc,
    prefix: &str,
    path: &str,
    data: Value<ContentSourceData>,
) -> Result<ContentSourceResultVc> {
    let mut found = None;

    if let Some(path) = path.strip_prefix(prefix) {
        for (subpath, source) in routes {
            if let Some(path) = path.strip_prefix(subpath) {
                found = Some((source, path));
                break;
            }
        }
    }

    let (source, path) = found.unwrap_or((fallback, path));
    Ok(source.resolve().await?.get(path, data))
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
impl ContentSource for RouterContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        get(&self.routes, &self.fallback, "", path, data).await
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        get_children(&self.routes, &self.fallback)
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for RouterContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("router content source".to_string())
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        get_introspection_children(&self.routes, &self.fallback).await
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for PrefixedRouterContentSource {
    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let prefix = self.prefix.await?;
        get(&self.routes, &self.fallback, &prefix, path, data).await
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        get_children(&self.routes, &self.fallback)
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
