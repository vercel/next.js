use std::{borrow::Cow, fmt::Display};

use anyhow::Result;
use rustc_hash::FxHashSet;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ReadRef, ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, json::parse_json_with_source_context};
use turbopack_core::{
    asset::AssetContent,
    introspect::{Introspectable, IntrospectableChildren},
    version::VersionedContentExt,
};
use turbopack_ecmascript::utils::FormatIter;

use crate::source::{
    ContentSource, ContentSourceContent, ContentSourceData, GetContentSourceContent,
    route_tree::{RouteTree, RouteTrees, RouteType},
};

#[turbo_tasks::value(shared)]
pub struct IntrospectionSource {
    pub roots: FxHashSet<ResolvedVc<Box<dyn Introspectable>>>,
}

fn introspection_source() -> RcStr {
    rcstr!("introspection-source")
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectionSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(introspection_source())
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<RcStr> {
        Vc::cell(introspection_source())
    }

    #[turbo_tasks::function]
    fn children(&self) -> Vc<IntrospectableChildren> {
        Vc::cell(
            self.roots
                .iter()
                .map(|root| (rcstr!("root"), *root))
                .collect(),
        )
    }
}

struct HtmlEscaped<T>(T);

impl<T: Display> Display for HtmlEscaped<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .0
                .to_string()
                // TODO this is pretty inefficient
                .replace('&', "&amp;")
                .replace('>', "&gt;")
                .replace('<', "&lt;"),
        )
    }
}

struct HtmlStringEscaped<T>(T);

impl<T: Display> Display for HtmlStringEscaped<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .0
                .to_string()
                // TODO this is pretty inefficient
                .replace('&', "&amp;")
                .replace('"', "&quot;")
                .replace('>', "&gt;")
                .replace('<', "&lt;"),
        )
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for IntrospectionSource {
    #[turbo_tasks::function]
    async fn get_routes(self: Vc<Self>) -> Result<Vc<RouteTree>> {
        Ok(Vc::<RouteTrees>::cell(vec![
            turbo_tasks::read!(
                RouteTree::new_route(Vec::new(), RouteType::Exact, Vc::upcast(self)).to_resolved()
            )?,
            turbo_tasks::read!(
                RouteTree::new_route(Vec::new(), RouteType::CatchAll, Vc::upcast(self))
                    .to_resolved()
            )?,
        ])
        .merge())
    }
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for IntrospectionSource {
    #[turbo_tasks::function]
    async fn get(
        self: ResolvedVc<Self>,
        path: RcStr,
        _data: ContentSourceData,
    ) -> Result<Vc<ContentSourceContent>> {
        // get last segment
        let path = &path[path.rfind('/').unwrap_or(0) + 1..];
        let introspectable = if path.is_empty() {
            let roots = &turbo_tasks::read!(self)?.roots;
            if roots.len() == 1 {
                *roots.iter().next().unwrap()
            } else {
                ResolvedVc::upcast(self)
            }
        } else {
            parse_json_with_source_context(path)?
        };
        let internal_ty = turbo_tasks::read!(Vc::debug_identifier(*introspectable))?;
        fn str_or_err(s: &Result<ReadRef<RcStr>>) -> Cow<'_, str> {
            s.as_ref().map_or_else(
                |e| Cow::<'_, str>::Owned(format!("ERROR: {e:?}")),
                |d| Cow::Borrowed(&**d),
            )
        }
        let ty = turbo_tasks::read!(introspectable.ty());
        let ty = str_or_err(&ty);
        let title = turbo_tasks::read!(introspectable.title());
        let title = str_or_err(&title);
        let details = turbo_tasks::read!(introspectable.details());
        let details = str_or_err(&details);
        let children = turbo_tasks::read!(introspectable.children())?;
        let has_children = !children.is_empty();
        // Each child's introspection strings are read concurrently in the async build and
        // sequentially under sync (the per-child body is more than a single plain `Vc` read).
        #[cfg(not(feature = "sync"))]
        let children = children
            .iter()
            .map(|(name, child)| async move {
                let ty = turbo_tasks::read!(child.ty());
                let ty = str_or_err(&ty);
                let title = turbo_tasks::read!(child.title());
                let title = str_or_err(&title);
                let path = serde_json::to_string(&child)?;
                Ok(format!(
                    "<li>{name} <!-- {title} --><a href=\"./{path}\">[{ty}] {title}</a></li>",
                    name = HtmlEscaped(name),
                    title = HtmlEscaped(title),
                    path = HtmlStringEscaped(urlencoding::encode(&path)),
                    ty = HtmlEscaped(ty),
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let children = {
            let mut rendered = Vec::with_capacity(children.len());
            for (name, child) in children.iter() {
                let ty = turbo_tasks::read!(child.ty());
                let ty = str_or_err(&ty);
                let title = turbo_tasks::read!(child.title());
                let title = str_or_err(&title);
                let path = serde_json::to_string(&child)?;
                rendered.push(format!(
                    "<li>{name} <!-- {title} --><a href=\"./{path}\">[{ty}] {title}</a></li>",
                    name = HtmlEscaped(name),
                    title = HtmlEscaped(title),
                    path = HtmlStringEscaped(urlencoding::encode(&path)),
                    ty = HtmlEscaped(ty),
                ));
            }
            rendered
        };
        let details = if details.is_empty() {
            String::new()
        } else if has_children {
            format!(
                "<details><summary><h3 style=\"display: \
                 inline;\">Details</h3></summary><pre>{details}</pre></details>",
                details = HtmlEscaped(details)
            )
        } else {
            format!(
                "<h3>Details</h3><pre>{details}</pre>",
                details = HtmlEscaped(details)
            )
        };
        let html: RcStr = format!(
            "<!DOCTYPE html>
    <html><head><title>{title}</title></head>
    <body>
      <h3>{internal_ty}</h3>
      <h2>{ty}</h2>
      <h1>{title}</h1>
      {details}
      <ul>{children}</ul>
    </body>
    </html>",
            title = HtmlEscaped(title),
            ty = HtmlEscaped(ty),
            children = FormatIter(|| children.iter())
        )
        .into();
        Ok(ContentSourceContent::static_content(
            AssetContent::file(
                FileContent::Content(File::from(html).with_content_type(mime::TEXT_HTML_UTF_8))
                    .cell(),
            )
            .versioned(),
        ))
    }
}
